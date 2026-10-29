/** Local-only research foundation. Not connected to production recording yet.
 * Coordinated owner/session handles; a resolved append means the storage write completed,
 * not a hardware fsync guarantee. Unacknowledged writes may be lost on termination.
 * GPS deliveries remain distinct, including duplicate/out-of-order measurements.
 */
export interface JournalStorage {
  getAllKeys(): Promise<readonly string[]>;
  multiGet(keys: string[]): Promise<readonly (readonly [string, string | null])[]>;
  setItem(key: string, value: string): Promise<void>;
  multiRemove(keys: string[]): Promise<void>;
}
export interface RawMeasurement {
  measuredAtMs: number;
  receivedAtMs: number;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  source: 'expo' | 'precision';
  delivery: 'foreground' | 'background';
}
export interface JournalSnapshot {
  state: 'absent' | 'open' | 'complete' | 'corrupt';
  records: RawMeasurement[];
  /** A complete journal is not evidence of continuous satellite reception. */
  issues: string[];
}
const ROOT = 'anyvo.rawMeasurements.v1.';
const CHUNK_SIZE = 64;
export const MAX_RAW_MEASUREMENTS = 32768;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
function isMeasurement(v: unknown): v is RawMeasurement {
  if (!v || typeof v !== 'object') return false;
  const r = v as RawMeasurement;
  return [r.measuredAtMs, r.receivedAtMs, r.latitude, r.longitude].every(finite)
    && [r.accuracy, r.altitude, r.speed, r.heading].every(x => x === null || finite(x))
    && ['expo', 'precision'].includes(r.source) && ['foreground', 'background'].includes(r.delivery);
}
interface JournalCoordinator {
  tail: Promise<unknown>;
  failure: unknown;
  queuedWrites: number;
  revision: number;
}
// Shared only within this JavaScript runtime and the same storage adapter.
// Contains no coordinates; per-handle caches are invalidated after another write.
const coordinators = new WeakMap<JournalStorage, Map<string, JournalCoordinator>>();
function namespace(owner: string, session: string) {
  for (const id of [owner, session]) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error('Invalid journal identity');
  }
  return `${ROOT}${owner}.${session}.`;
}

/** Handles for the same adapter and owner/session share an ordered write queue.
 * No global index: after a crash, chunks are discovered independently of metadata.
 * No expiry or silent eviction of older tracks. Removal requires explicit scope.
 */
export function createRawMeasurementJournal(storage: JournalStorage, owner: string, session: string) {
  const prefix = namespace(owner, session);
  let registry = coordinators.get(storage);
  if (!registry) { registry = new Map(); coordinators.set(storage, registry); }
  let shared = registry.get(prefix);
  if (!shared) {
    shared = { tail: Promise.resolve(), failure: undefined, queuedWrites: 0, revision: 0 };
    registry.set(prefix, shared);
  }
  const coordinator = shared;
  let cachedRevision = -1;
  let cached: JournalSnapshot | undefined;
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = coordinator.tail.then(work);
    coordinator.tail = next.catch(() => undefined);
    return next;
  };
  async function load(): Promise<JournalSnapshot> {
    const keys = (await storage.getAllKeys()).filter(k => k.startsWith(prefix));
    if (!keys.length) return { state: 'absent', records: [], issues: [] };
    const pairs = new Map(await storage.multiGet(keys));
    const records: RawMeasurement[] = [];
    const issues: string[] = [];
    const chunks = keys.filter(k => /^chunk\.\d{6}$/.test(k.slice(prefix.length))).sort();
    if (keys.some(k => k !== prefix + 'seal' && !chunks.includes(k))) issues.push('unknown_record');
    for (let index = 0; index < chunks.length; index++) {
      const key = chunks[index];
      if (key !== chunkKey(index)) issues.push('missing_chunk');
      const storedIndex = Number(key.slice((prefix + 'chunk.').length));
      try {
        const data = JSON.parse(pairs.get(key) ?? 'null');
        if (data?.version !== 1 || data?.index !== storedIndex || !Array.isArray(data.records)
          || data.records.length < 1 || data.records.length > CHUNK_SIZE
          || !data.records.every(isMeasurement)
          || (index < chunks.length - 1 && data.records.length !== CHUNK_SIZE)) {
          issues.push('invalid_chunk');
        } else records.push(...data.records);
      } catch { issues.push('unreadable_chunk'); }
    }
    let sealed = false;
    if (pairs.has(prefix + 'seal')) {
      try {
        const seal = JSON.parse(pairs.get(prefix + 'seal') ?? 'null');
        sealed = seal?.version === 1 && seal.count === records.length;
        if (!sealed) issues.push('invalid_seal');
      } catch { issues.push('unreadable_seal'); }
    }
    if (records.length > MAX_RAW_MEASUREMENTS) issues.push('limit_exceeded');
    return { state: issues.length ? 'corrupt' : sealed ? 'complete' : 'open', records, issues };
  }
  function chunkKey(index: number) { return `${prefix}chunk.${String(index).padStart(6, '0')}`; }
  async function writable() {
    if (coordinator.failure) throw new Error('Journal stopped after storage failure');
    if (!cached || cachedRevision !== coordinator.revision) {
      cached = await load();
      cachedRevision = coordinator.revision;
    }
    if (cached.state === 'complete' || cached.state === 'corrupt') throw new Error('Journal is not writable');
    return cached;
  }
  return {
    append(record: RawMeasurement): Promise<void> {
      if (!isMeasurement(record)) return Promise.reject(new Error('Invalid measurement'));
      if (coordinator.queuedWrites >= 256) {
        coordinator.failure = new Error('Journal queue capacity reached');
        return Promise.reject(coordinator.failure);
      }
      coordinator.queuedWrites++;
      // Copy only the documented raw fields; never retain caller mutations or extra account data.
      const { measuredAtMs, receivedAtMs, latitude, longitude, accuracy, altitude, speed, heading, source, delivery } = record;
      const copy = { measuredAtMs, receivedAtMs, latitude, longitude, accuracy, altitude, speed, heading, source, delivery };
      return serial(async () => {
        const snapshot = await writable();
        if (snapshot.records.length >= MAX_RAW_MEASUREMENTS) {
          coordinator.failure = new Error('Journal capacity reached');
          throw coordinator.failure;
        }
        const index = Math.floor(snapshot.records.length / CHUNK_SIZE);
        const records = [...snapshot.records.slice(index * CHUNK_SIZE), copy];
        try { await storage.setItem(chunkKey(index), JSON.stringify({ version: 1, index, records })); }
        catch (error) { coordinator.failure = error || true; throw error; }
        snapshot.records.push(copy);
        snapshot.state = 'open';
        cachedRevision = ++coordinator.revision;
      }).finally(() => { coordinator.queuedWrites--; });
    },
    read(): Promise<JournalSnapshot> { return serial(load); },
    finish(): Promise<void> {
      return serial(async () => {
        const snapshot = await writable();
        try { await storage.setItem(prefix + 'seal', JSON.stringify({ version: 1, count: snapshot.records.length })); }
        catch (error) { coordinator.failure = error || true; throw error; }
        snapshot.state = 'complete';
        cachedRevision = ++coordinator.revision;
      });
    },
    remove(): Promise<void> {
      return serial(async () => {
        const keys = (await storage.getAllKeys()).filter(k => k.startsWith(prefix));
        await storage.multiRemove(keys);
        coordinator.revision++;
        cached = undefined;
        coordinator.failure = undefined;
      });
    },
  };
}
