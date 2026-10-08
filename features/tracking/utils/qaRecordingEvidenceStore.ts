import { assertDiagnosticsAccess, diagnosticsAccessToken, subscribeDiagnosticsAccess } from '@/lib/diagnosticsAccessState';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { precisionLocationClient } from '@/features/tracking/native/precisionLocationClient';
import { motionClient } from '@/features/tracking/native/motionClient';
import { getTrackingEngineMode } from './trackingEngineMode';
import { getLocationSourceMode } from './locationSourceMode';
import {
  assertQaRecordingEvidence, qaObservedProvider, qaObservedSource,
  QA_EVIDENCE_EVENT_LIMIT, QA_EVIDENCE_SEGMENT_LIMIT, QA_EVIDENCE_SESSION_LIMIT,
  type QaDeliveryChannel, type QaRecordingEvidence, type QaRecordingEventName,
  type QaRecordingIdentity, type QaRecordingPhase, type QaRecordingSegment,
} from './qaRecordingEvidence';

const PREFIX = 'anyvo.qa.recordingEvidence.v1::';
const INDEX = `${PREFIX}index`;
const keyFor = (sid: string, phase: QaRecordingPhase) => `${PREFIX}${sid}::${phase}`;
type StoredSegment = { token: string; evidence: QaRecordingSegment };
function readSegments(raw: string | null, phase: QaRecordingPhase): StoredSegment[] {
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error('Invalid recording evidence');
  for (const item of value) {
    if (!item || typeof item.token !== 'string' || !item.evidence) throw new Error('Invalid recording segment');
    assertQaRecordingEvidence({
      schemaVersion: 1, availability: { lay: 'missing', search: 'missing' },
      lay: [], search: [], [phase]: [item.evidence],
    });
  }
  return value;
}
// One JS writer, serialized across both phases. Neither recording nor GPS awaits it.
let writes: Promise<void> = Promise.resolve();
const activeSessions = new Map<string, number>();
const segmentGenerations = new Map<string, number>();
let retainedSessions: Set<string> | null = null;
const enqueue = (work: () => Promise<void>): void => {
  writes = writes.then(work).catch(() => {});
};

const safeRead = <T>(read: () => T, fallback: T): T => { try { return read(); } catch { return fallback; } };
const label = (v: unknown): string | null => typeof v === 'string' && /^[A-Za-z0-9_.+-]{1,64}$/.test(v)
  && !/\d{4}-\d{2}-\d{2}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(v) ? v : null;

/** Snapshot at recording start, never at export time. Only documented public APIs. */
export function captureQaRecordingIdentity(modes?: { engine: unknown; source: unknown }): QaRecordingIdentity {
  const engine = modes?.engine ?? getTrackingEngineMode();
  const source = modes?.source ?? getLocationSourceMode();
  const enabled = safeRead(() => Updates.isEnabled, undefined);
  const embedded = safeRead(() => Updates.isEmbeddedLaunch, undefined);
  const emergency = safeRead(() => Updates.isEmergencyLaunch, undefined);
  const launch = enabled === false ? 'updates_disabled' : emergency === true ? 'emergency'
    : embedded === true ? 'embedded' : enabled === true && embedded === false ? 'ota' : 'unknown';
  const updateId = safeRead(() => Updates.updateId, null);
  const commit = process.env.EXPO_PUBLIC_RELEASE_GIT_COMMIT;
  return {
    platform: Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web' ? Platform.OS : 'unknown',
    appVersion: label(safeRead(() => Application.nativeApplicationVersion, null)),
    nativeBuildVersion: label(safeRead(() => Application.nativeBuildVersion, null)),
    runtimeVersion: label(safeRead(() => Updates.runtimeVersion, null)),
    channel: label(safeRead(() => Updates.channel, null)),
    launch,
    updateId: (launch === 'ota' || launch === 'emergency') && typeof updateId === 'string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(updateId) ? updateId : null,
    releaseGitCommit: typeof commit === 'string' && /^[0-9a-f]{7,40}$/i.test(commit) ? commit : null,
    selectedEngine: engine === 'current' || engine === 'build40' ? engine : 'unknown',
    selectedSource: source === 'precision' || source === 'legacy' ? source : 'unknown',
    precisionModulePresent: safeRead(() => precisionLocationClient.isNativeAvailable(), null),
    motionModulePresent: safeRead(() => motionClient.isModuleAvailable(), null),
  };
}

export interface QaRecordingObserver {
  note: (name: QaRecordingEventName) => void;
  appState: (state: string) => void;
  source: (source: unknown, provider: unknown, channel?: QaDeliveryChannel) => void;
  close: (name?: 'recordingStopped' | 'recorderUnmounted') => void;
}

/** Diagnostic setup failure must never prevent a production recording. */
export function startQaRecordingEvidence(
  sessionId: string, phase: QaRecordingPhase, resumed: boolean,
  modes?: { engine: unknown; source: unknown },
): QaRecordingObserver | null {
  try {
    const observer = beginQaRecordingEvidence(sessionId, phase, resumed, captureQaRecordingIdentity(modes));
    // Even an unexpected observer error must remain outside the recording path.
    return {
      note: name => { safeRead(() => observer.note(name), undefined); },
      appState: state => { safeRead(() => observer.appState(state), undefined); },
      source: (source, provider, channel) => { safeRead(() => observer.source(source, provider, channel), undefined); },
      close: name => { safeRead(() => observer.close(name), undefined); },
    };
  }
  catch { return null; }
}

/** Call only for an enabled QA recording with its exact local session ID. */
export function beginQaRecordingEvidence(
  sessionId: string, phase: QaRecordingPhase, resumed: boolean, identity: QaRecordingIdentity,
): QaRecordingObserver {
  const accessToken = diagnosticsAccessToken();
  assertDiagnosticsAccess(accessToken);
  const authorized = () => accessToken === diagnosticsAccessToken();
  const key = keyFor(sessionId, phase);
  const token = Crypto.randomUUID(); // Local storage key only; excluded from every export.
  if (typeof token !== 'string' || !token) throw new Error('QA recording token unavailable');
  const generation = (segmentGenerations.get(key) ?? 0) + 1;
  segmentGenerations.set(key, generation);
  const monotonic = typeof performance !== 'undefined' && typeof performance.now === 'function';
  const now = () => monotonic ? performance.now() : Date.now();
  const origin = now();
  activeSessions.set(sessionId, (activeSessions.get(sessionId) ?? 0) + 1);
  let lastTime = 0;
  const record: QaRecordingSegment = {
    phase, resumed, identity: { ...identity }, timeBasis: monotonic ? 'js_monotonic' : 'wall_relative',
    events: [], eventCount: 0, droppedEventCount: 0, writeFailureCount: 0, closed: false,
  };
  let scheduled = false;
  let revision = 0;
  let observed: string | null = null;
  let waitingForFix = true;
  let appState: string | null = null;

  const release = () => {
    const remaining = (activeSessions.get(sessionId) ?? 1) - 1;
    if (remaining > 0) activeSessions.set(sessionId, remaining); else activeSessions.delete(sessionId);
  };
  const unsubscribe = subscribeDiagnosticsAccess(() => {
    if (!authorized() && !record.closed) {
      record.closed = true;
      release();
      unsubscribe();
    }
  });

  // Start is a new segment, including recovery. Existing segments retain their identities.
  enqueue(async () => {
    try {
      if (!authorized()) return;
      const raw = await AsyncStorage.getItem(INDEX);
      if (!authorized()) return;
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      const ids = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
      const all = [...new Set([sessionId, ...ids, ...activeSessions.keys()])];
      const retained = new Set([...all.slice(0, QA_EVIDENCE_SESSION_LIMIT), ...activeSessions.keys()]);
      retainedSessions = retained;
      await AsyncStorage.setItem(INDEX, JSON.stringify(all.filter(id => retained.has(id))));
      const expired = all.filter(id => !retained.has(id)).flatMap(id => [keyFor(id, 'lay'), keyFor(id, 'search')]);
      if (expired.length && authorized()) await AsyncStorage.multiRemove(expired);
      expired.forEach(key => segmentGenerations.delete(key));
    } catch { record.writeFailureCount++; retainedSessions?.add(sessionId); }
  });

  const schedule = (): void => {
    revision++;
    if (scheduled) return;
    scheduled = true;
    enqueue(async () => {
      const savedRevision = revision;
      try {
        if (!authorized()) { scheduled = false; return; }
        if (retainedSessions && !retainedSessions.has(sessionId)) { scheduled = false; return; }
        // A delayed close must not resurrect an already evicted older segment.
        if (generation <= (segmentGenerations.get(key) ?? generation) - QA_EVIDENCE_SEGMENT_LIMIT) { scheduled = false; return; }
        // Merge by a local segment token. An old writer completing after a new
        // start cannot overwrite the new segment or its recording-time identity.
        let previous: StoredSegment[];
        try { previous = readSegments(await AsyncStorage.getItem(key), phase); }
        catch { record.writeFailureCount++; previous = []; }
        if (!authorized()) { scheduled = false; return; }
        const existing = previous.findIndex(item => item.token === token);
        if (existing >= 0) previous[existing] = { token, evidence: record };
        else previous.push({ token, evidence: record });
        await AsyncStorage.setItem(key, JSON.stringify(previous.slice(-QA_EVIDENCE_SEGMENT_LIMIT)));
      } catch { record.writeFailureCount++; }
      scheduled = false;
      // Coalesce transitions while storage is busy, without losing the in-memory timeline.
      if (authorized() && revision !== savedRevision) schedule();
    });
  };
  const note = (name: QaRecordingEventName, detail?: {
    source: ReturnType<typeof qaObservedSource>; provider: string; deliveryChannel: QaDeliveryChannel;
  }): void => {
    if (record.closed || !authorized()) return;
    lastTime = Math.max(lastTime, Math.min(1e8 - 1, Math.max(0, now() - origin)));
    record.eventCount++;
    record.events.push({ sequence: record.eventCount, tMs: Math.round(lastTime), name, ...detail });
    if (record.events.length > QA_EVIDENCE_EVENT_LIMIT) { record.events.shift(); record.droppedEventCount++; }
    schedule();
  };
  note(resumed ? 'recordingResumed' : 'recordingStarted');
  return {
    note,
    appState: state => {
      if (state === appState) return;
      appState = state;
      note(state === 'active' ? 'appActive' : state === 'background' ? 'appBackground' : state === 'inactive' ? 'appInactive' : 'appUnknown');
      waitingForFix = true;
    },
    source: (source, provider, channel = 'foreground') => {
      const detail = { source: qaObservedSource(source), provider: qaObservedProvider(provider), deliveryChannel: channel };
      const signature = `${detail.source}/${detail.provider}/${channel}`;
      if (signature !== observed) { observed = signature; note('sourceObserved', detail); }
      if (waitingForFix) { waitingForFix = false; note('firstFix', detail); }
    },
    close: (name = 'recordingStopped') => {
      if (record.closed) return;
      note(name);
      record.closed = true;
      release();
      unsubscribe();
      schedule();
    },
  };
}

/** Await local diagnostic writes only on export, never on the tracking path. */
export async function loadQaRecordingEvidence(sessionId: string): Promise<QaRecordingEvidence> {
  const accessToken = diagnosticsAccessToken();
  assertDiagnosticsAccess(accessToken);
  // A write can enqueue its coalesced successor while settling.
  let pending: Promise<void>;
  do { pending = writes; await pending; } while (pending !== writes);
  const out: QaRecordingEvidence = { schemaVersion: 1, availability: { lay: 'missing', search: 'missing' }, lay: [], search: [] };
  await Promise.all((['lay', 'search'] as const).map(async phase => {
    try {
      const raw = await AsyncStorage.getItem(keyFor(sessionId, phase));
      if (!raw) return;
      const segments = readSegments(raw, phase).slice(-QA_EVIDENCE_SEGMENT_LIMIT).map(item => item.evidence);
      assertQaRecordingEvidence({ ...out, [phase]: segments });
      out[phase] = segments;
      out.availability[phase] = segments.length ? 'available' : 'missing';
    } catch { out.availability[phase] = 'read_failed'; }
  }));
  assertDiagnosticsAccess(accessToken);
  return out;
}
