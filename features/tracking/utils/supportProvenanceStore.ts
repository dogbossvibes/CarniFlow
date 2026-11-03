import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import { getLocalDb } from '@/lib/localDb/client';
import { beginSupportProvenanceFence, beginSupportProvenanceWipeFence, supportProvenanceLease, supportProvenanceScopeMatches, type SupportProvenanceScope } from './supportProvenanceScope';
import {
  assertRecordingProvenance, diagnosticLabel, diagnosticUpdateId, PROVENANCE_SEGMENT_LIMIT, unknownRecordingProvenance,
  type DiagnosticEnvironment, type DiagnosticPhase, type DiagnosticProvenance, type RecordingProvenance,
} from './diagnosticProvenance';

// One owner-scoped bundle per parent. Valid historical attempts are retained;
// new attempts above the explicit metadata capacity stay unknown, never evicting
// old tracks or their provenance. No broad TTL or customer-data cleanup.
export const SUPPORT_PROVENANCE_ATTEMPT_LIMIT = 64;
const PREFIX = 'anyvo.support.provenance.v2::';
const CLEANUP_PREFIX = 'anyvo.support.provenance.cleanup.v1::';
const keyFor = (owner: string, session: string) => PREFIX + JSON.stringify([owner, session]);
interface StoredProvenance { schemaVersion: 2; lay: RecordingProvenance; search: { attempt: string; provenance: RecordingProvenance }[] }
let pending: Promise<void> = Promise.resolve();
const safeRead = <T>(read: () => T, fallback: T): T => { try { return read(); } catch { return fallback; } };

export function captureDiagnosticEnvironment(): DiagnosticEnvironment {
  const enabled = safeRead(() => Updates.isEnabled, undefined);
  const embedded = safeRead(() => Updates.isEmbeddedLaunch, undefined);
  const emergency = safeRead(() => Updates.isEmergencyLaunch, undefined);
  const launch = enabled === false ? 'updates_disabled' : emergency === true ? 'emergency'
    : embedded === true ? 'embedded' : enabled === true && embedded === false ? 'ota' : 'unknown';
  return {
    platform: ['ios', 'android', 'web'].includes(Platform.OS) ? Platform.OS as DiagnosticEnvironment['platform'] : 'unknown',
    appVersion: diagnosticLabel(safeRead(() => Application.nativeApplicationVersion, null)),
    nativeBuildVersion: diagnosticLabel(safeRead(() => Application.nativeBuildVersion, null)),
    osVersion: diagnosticLabel(safeRead(() => Device.osVersion, null)),
    deviceModel: diagnosticLabel(safeRead(() => Device.modelName, null)),
    runtimeVersion: diagnosticLabel(safeRead(() => Updates.runtimeVersion, null)),
    launch,
    otaUpdateId: launch === 'ota' ? diagnosticUpdateId(safeRead(() => Updates.updateId, null)) : null,
  };
}

function readBundle(raw: string | null): StoredProvenance {
  if (!raw) return { schemaVersion: 2, lay: unknownRecordingProvenance(), search: [] };
  const value = JSON.parse(raw) as StoredProvenance;
  if (!value || value.schemaVersion !== 2 || Object.keys(value).sort().join(',') !== 'lay,schemaVersion,search'
    || !Array.isArray(value.search) || value.search.length > SUPPORT_PROVENANCE_ATTEMPT_LIMIT) throw new Error('Invalid metadata bundle');
  assertRecordingProvenance(value.lay);
  const attempts = new Set<string>();
  for (const entry of value.search) {
    if (!entry || Object.keys(entry).sort().join(',') !== 'attempt,provenance' || typeof entry.attempt !== 'string'
      || !entry.attempt.length || entry.attempt.length > 128 || attempts.has(entry.attempt)) throw new Error('Invalid metadata attempt');
    attempts.add(entry.attempt); assertRecordingProvenance(entry.provenance);
  }
  return value;
}
function identityFromKey(key: string, prefix: string): [string, string] | null {
  if (!key.startsWith(prefix)) return null;
  try {
    const id: unknown = JSON.parse(key.slice(prefix.length));
    return Array.isArray(id) && id.length === 2 && id.every(v => typeof v === 'string' && v.length > 0) ? id as [string, string] : null;
  } catch { return null; }
}
const cleanupKey = (key: string) => CLEANUP_PREFIX + key.slice(PREFIX.length);
function checkScope(scope: SupportProvenanceScope) {
  if (!supportProvenanceScopeMatches(scope)) throw new Error('PROVENANCE_ACCOUNT_CHANGED');
}
/** Durable intents describe ONLY new sidecars after a successful explicit source deletion. */
async function removeWithCleanupIntent(keys: readonly string[], scope: SupportProvenanceScope): Promise<boolean> {
  try {
    for (const key of keys) { checkScope(scope); await AsyncStorage.setItem(cleanupKey(key), '1'); }
    checkScope(scope); await AsyncStorage.multiRemove([...keys]);
    checkScope(scope); await AsyncStorage.multiRemove(keys.map(cleanupKey));
    checkScope(scope); return true;
  } catch { return false; }
}
/** Retry at the next metadata read/write, including after restart. Never prune valid history. */
async function retryCleanup(scope: SupportProvenanceScope): Promise<void> {
  if (!scope.owner) return;
  try {
    checkScope(scope);
    const keys = await AsyncStorage.getAllKeys(); checkScope(scope);
    const sidecars = new Set(keys.filter(key => identityFromKey(key, PREFIX)?.[0] === scope.owner));
    const remove = new Set<string>();
    for (const key of keys) {
      const id = identityFromKey(key, CLEANUP_PREFIX);
      if (id?.[0] === scope.owner) remove.add(keyFor(id[0], id[1]));
    }
    // Persisted explicit intents remain sufficient even after a full source wipe.
    if (remove.size) await removeWithCleanupIntent([...remove], scope);
    const db = await getLocalDb(); checkScope(scope);
    // One query, rather than a native query per history entry. The existing local
    // DB is the primary parent ledger: physical parent deletion occurs only in
    // its explicit wipe. No pruning on age, failed queries or merely old builds.
    const parents = await db.getAllAsync<{ local_id: string; deleted_at: string | null }>(
      'select local_id,deleted_at from local_training_sessions where user_id=?', scope.owner);
    checkScope(scope);
    const live = new Set(parents.filter(row => !row.deleted_at).map(row => keyFor(scope.owner!, row.local_id)));
    const orphaned = [...sidecars].filter(key => !live.has(key) && !remove.has(key));
    // This also recovers a wipe whose intent write failed: its primary parents
    // are gone. Valid live parents always retain their historical provenance.
    if (orphaned.length) await removeWithCleanupIntent(orphaned, scope);
  } catch { /* diagnostic storage unavailable: leave durable evidence for a later retry */ }
}
async function ownedParent(session: string, scope: SupportProvenanceScope): Promise<string | null> {
  if (!scope.owner || !supportProvenanceScopeMatches(scope)) return null;
  const db = await getLocalDb();
  if (!supportProvenanceScopeMatches(scope)) return null;
  const row = await db.getFirstAsync<{ local_id: string; user_id: string | null; deleted_at: string | null }>(
    'select local_id,user_id,deleted_at from local_training_sessions where (local_id=? or remote_id=?) and user_id=?', session, session, scope.owner);
  return supportProvenanceScopeMatches(scope) && row?.user_id === scope.owner && !row.deleted_at ? row.local_id : null;
}
export async function canReadSupportProvenance(session: string): Promise<boolean> {
  const lease = supportProvenanceLease(session);
  try {
    const parent = await ownedParent(session, lease.scope);
    if (!parent || !lease.valid()) return false;
    const parentLease = supportProvenanceLease(parent);
    // The first alias query may have captured a row before a concurrent deletion.
    // Acquire the canonical fence before a fresh parent read, then check it again.
    return !!await ownedParent(parent, lease.scope) && lease.valid() && parentLease.valid();
  } catch { return false; }
}
function append(previous: RecordingProvenance, environment: DiagnosticEnvironment, resumed: boolean): RecordingProvenance {
  const segments = [...previous.segments, { source: resumed ? 'recording_resume' as const : 'recording_start' as const, environment }];
  const omitted = Math.max(0, segments.length - PROVENANCE_SEGMENT_LIMIT);
  const next: RecordingProvenance = { availability: 'available', scope: 'phase_history',
    partial: previous.partial === true || !previous.segments.length && resumed || omitted > 0,
    omittedSegments: previous.omittedSegments + omitted,
    segments: omitted ? [segments[0], ...segments.slice(-(PROVENANCE_SEGMENT_LIMIT - 1))] : segments };
  assertRecordingProvenance(next); return next;
}
/** Captures admission before awaits. Storage never controls or delays recording. */
export function recordSupportProvenance(session: string, phase: DiagnosticPhase, resumed: boolean,
  attempt?: string, environment = captureDiagnosticEnvironment(), options?: { parentReady?: Promise<unknown>; expectedOwner?: string }): Promise<void> {
  const lease = supportProvenanceLease(session);
  if (!session || !lease.scope.owner || options?.expectedOwner && options.expectedOwner !== lease.scope.owner
    || phase === 'search' && (!attempt || attempt.length > 128)) return Promise.resolve();
  const work = pending.then(async () => {
    await options?.parentReady;
    if (!lease.valid()) return;
    await retryCleanup(lease.scope);
    if (!lease.valid()) return;
    const parent = await ownedParent(session, lease.scope);
    if (!parent || !lease.valid()) return;
    const parentLease = supportProvenanceLease(parent);
    if (!parentLease.valid()) return;
    const key = keyFor(lease.scope.owner!, parent);
    const raw = await AsyncStorage.getItem(key);
    // Do not append a new valid segment into a sidecar awaiting explicit cleanup.
    if (await AsyncStorage.getItem(cleanupKey(key)) !== null) return;
    const bundle = readBundle(raw);
    if (!lease.valid() || !parentLease.valid()) return;
    if (phase === 'lay') bundle.lay = append(bundle.lay, environment, resumed);
    else {
      let entry = bundle.search.find(item => item.attempt === attempt);
      if (!entry) {
        if (bundle.search.length >= SUPPORT_PROVENANCE_ATTEMPT_LIMIT) return;
        entry = { attempt: attempt!, provenance: unknownRecordingProvenance() }; bundle.search.push(entry);
      }
      entry.provenance = append(entry.provenance, environment, resumed);
    }
    // A successful parent deletion between read and write must not resurrect metadata.
    if (!await ownedParent(parent, lease.scope) || !lease.valid() || !parentLease.valid()) return;
    await AsyncStorage.setItem(key, JSON.stringify(bundle));
    if (!lease.valid() || !parentLease.valid()) {
      // An already admitted native write cannot be cancelled. Erase only this new
      // metadata value; the serial queue prevents a newer writer from overtaking it.
      if (raw === null) await AsyncStorage.removeItem(key); else await AsyncStorage.setItem(key, raw);
    }
  });
  pending = work.catch(() => {});
  return pending;
}
export async function loadSupportRecordingProvenance(session: string, searchAttempt?: string): Promise<DiagnosticProvenance['recording']> {
  const lease = supportProvenanceLease(session);
  const unknown = (status: 'unknown' | 'read_failed' = 'unknown') => ({ lay: unknownRecordingProvenance(status), search: unknownRecordingProvenance(status) });
  if (!lease.scope.owner || !lease.valid()) return unknown();
  try {
    const cleanup = pending.then(() => lease.valid() ? retryCleanup(lease.scope) : undefined);
    pending = cleanup.catch(() => {});
    await cleanup; if (!lease.valid()) return unknown();
    const parent = await ownedParent(session, lease.scope);
    if (!parent || !lease.valid()) return unknown();
    const parentLease = supportProvenanceLease(parent);
    if (!parentLease.valid()) return unknown();
    const key = keyFor(lease.scope.owner, parent);
    const bundle = readBundle(await AsyncStorage.getItem(key));
    if (await AsyncStorage.getItem(cleanupKey(key)) !== null) return unknown();
    if (!await ownedParent(parent, lease.scope) || !lease.valid() || !parentLease.valid()) return unknown();
    return { lay: bundle.lay, search: bundle.search.find(entry => entry.attempt === searchAttempt)?.provenance ?? unknownRecordingProvenance() };
  } catch { return lease.valid() ? unknown('read_failed') : unknown(); }
}
export async function buildDiagnosticProvenance(session: string, searchAttempt?: string): Promise<DiagnosticProvenance> {
  return { schemaVersion: 1, recording: await loadSupportRecordingProvenance(session, searchAttempt),
    exporter: { source: 'runtime_at_export', environment: captureDiagnosticEnvironment() } };
}
/** Only call as part of an already authorized explicit parent/diagnostic deletion. */
export function beginSupportProvenanceDeletion(sessions: readonly string[]) {
  const fence = beginSupportProvenanceFence(sessions);
  return {
    async commit(): Promise<boolean> {
      const work = pending.then(async () => {
        try {
          checkScope(fence.scope);
          return fence.scope.owner ? await removeWithCleanupIntent(sessions.map(session => keyFor(fence.scope.owner!, session)), fence.scope) : true;
        } catch { return false; } finally { fence.release(); }
      });
      pending = work.then(() => {}, () => {});
      return work;
    },
    cancel: fence.release,
  };
}
/** Existing explicit local-data wipe only; never on ordinary account changes. */
export function beginSupportProvenanceWipe() {
  const fence = beginSupportProvenanceWipeFence();
  return {
    async commit(): Promise<boolean> {
      const work = pending.then(async () => {
        try {
          checkScope(fence.scope);
          const keys = (await AsyncStorage.getAllKeys()).filter(key => identityFromKey(key, PREFIX) !== null);
          checkScope(fence.scope);
          // Existing wipe cleared all local source rows. Persist each exact
          // sidecar intent so a native failure remains retryable after restart.
          return await removeWithCleanupIntent(keys, fence.scope);
        } catch { return false; } finally { fence.release(); }
      });
      pending = work.then(() => {}, () => {});
      return work;
    },
    cancel: fence.release,
  };
}
