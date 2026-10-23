/** Persist only IDs to revoke after an interrupted request/restart. Never GPS. */
export interface RevocationEntry { shareId: string; sessionId: string }
export interface JournalStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PENDING = 100;
const locks = new WeakMap<JournalStorage, Map<string, Promise<unknown>>>();

function keyFor(userId: string): string {
  if (!UUID.test(userId)) throw new Error('SHARE_INVALID_ID');
  return `anyvo.liveShare.revocations.v1:${userId}`;
}
function validEntry(value: unknown): value is RevocationEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return Object.keys(entry).length === 2 && typeof entry.shareId === 'string'
    && UUID.test(entry.shareId) && typeof entry.sessionId === 'string' && UUID.test(entry.sessionId);
}
function decode(raw: string | null): RevocationEntry[] {
  if (raw === null) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object') throw new Error();
    const record = data as Record<string, unknown>;
    if (record.version !== 1 || !Array.isArray(record.entries) || record.entries.length > MAX_PENDING
      || !record.entries.every(validEntry)) throw new Error();
    const entries = record.entries as RevocationEntry[];
    if (new Set(entries.map(e => e.shareId)).size !== entries.length) throw new Error();
    return entries.map(e => ({ ...e }));
  } catch { throw new Error('SHARE_JOURNAL_INVALID'); }
}

export class RevocationJournal {
  constructor(private readonly storage: JournalStorage) {}

  private serial<T>(userId: string, operation: (key: string) => Promise<T>): Promise<T> {
    const key = keyFor(userId);
    let queues = locks.get(this.storage);
    if (!queues) { queues = new Map(); locks.set(this.storage, queues); }
    const run = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(() => operation(key));
    queues.set(key, run);
    void run.finally(() => { if (queues!.get(key) === run) queues!.delete(key); }).catch(() => undefined);
    return run;
  }

  list(userId: string): Promise<RevocationEntry[]> {
    return this.serial(userId, async key => decode(await this.storage.getItem(key)));
  }

  /** Must succeed before requesting a server grant; retries use exactly this ID. */
  put(userId: string, entry: RevocationEntry): Promise<void> {
    if (!validEntry(entry)) return Promise.reject(new Error('SHARE_INVALID_ID'));
    const copy = { ...entry };
    return this.serial(userId, async key => {
      const entries = decode(await this.storage.getItem(key));
      const existing = entries.find(e => e.shareId === copy.shareId);
      if (existing) {
        if (existing.sessionId !== copy.sessionId) throw new Error('SHARE_ID_CONFLICT');
        return;
      }
      if (entries.length >= MAX_PENDING) throw new Error('SHARE_JOURNAL_FULL');
      await this.storage.setItem(key, JSON.stringify({ version: 1, entries: [...entries, copy] }));
    });
  }

  /** Only after a verified server revocation ACK, never on timeout/logout. */
  acknowledge(userId: string, shareId: string): Promise<void> {
    if (!UUID.test(shareId)) return Promise.reject(new Error('SHARE_INVALID_ID'));
    return this.serial(userId, async key => {
      const entries = decode(await this.storage.getItem(key));
      const remaining = entries.filter(e => e.shareId !== shareId);
      if (remaining.length !== entries.length) {
        await this.storage.setItem(key, JSON.stringify({ version: 1, entries: remaining }));
      }
    });
  }
}
