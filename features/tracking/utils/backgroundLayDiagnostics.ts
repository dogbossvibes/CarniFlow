// Session-scoped, coordinate-free diagnostics for lay recording.
// Each event has its own AsyncStorage key. Concurrent foreground and headless JS
// writers therefore cannot overwrite a shared counter with read/modify/write.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { diagnosticsAccessToken } from '@/lib/diagnosticsAccessState';

const PREFIX = 'anyvo.bgLayDiag.v1::';
const ACTIVE = `${PREFIX}active`;
const metaKey = (sessionId: string) => `${PREFIX}${sessionId}::meta`;
const eventPrefix = (sessionId: string) => `${PREFIX}${sessionId}::event::`;

export type BackgroundLayEvent =
  | 'taskCallback' | 'locationsReceived' | 'handlerPresent' | 'handlerMissing' | 'taskError'
  | 'handlerRegistered' | 'handlerCleared' | 'onFixReceived' | 'onFixAccepted' | 'onFixRejected'
  | 'persistAttempt' | 'persistSuccess' | 'persistFailure'
  | 'flushAttempt' | 'flushSuccess' | 'flushFailure'
  | 'taskStartAttempt' | 'taskStartSuccess' | 'taskStartFailure'
  | 'taskStopAttempt' | 'taskStopSuccess' | 'taskStopFailure'
  | 'taskRegistered' | 'foregroundPermission' | 'backgroundPermission'
  | 'foreground' | 'background' | 'inactive' | 'resume'
  // Hintergrund-Verarbeitung über die Lay-Session-Runtime (Phase 2).
  | 'backgroundProcessedWithoutHandler' | 'backgroundDuplicateDropped' | 'backgroundSessionMismatch'
  | 'backgroundFinalizedSessionDropped' | 'backgroundPersistAwaitFailure';

type Event = { name: BackgroundLayEvent; at: number; count: number; reason?: string };
type Context = { sessionId: string; startedAt: number };

/** The task's registration is singular; this exact context is written before its start. */
export async function beginBackgroundLayDiagnostics(sessionId: string): Promise<void> {
  const startedAt = Date.now();
  await AsyncStorage.setItem(metaKey(sessionId), JSON.stringify({ startedAt }));
  await AsyncStorage.setItem(ACTIVE, JSON.stringify({ sessionId, startedAt }));
}

export async function activeBackgroundLaySessionId(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE);
    const context = raw ? JSON.parse(raw) as Partial<Context> : null;
    return typeof context?.sessionId === 'string' && context.sessionId.length > 0 ? context.sessionId : null;
  } catch { return null; }
}

export async function endBackgroundLayDiagnostics(sessionId: string): Promise<void> {
  if (await activeBackgroundLaySessionId() === sessionId) await AsyncStorage.removeItem(ACTIVE);
}

// Reason codes only. Never persist a native error message or a coordinate.
export function diagnosticReason(error: unknown, fallback: string): string {
  const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: unknown }).code : null;
  return typeof code === 'string' && /^[A-Za-z0-9_-]{1,48}$/.test(code) ? code : fallback;
}

export async function recordBackgroundLayEvent(
  sessionId: string | null | undefined, name: BackgroundLayEvent, count = 1, reason?: string,
): Promise<void> {
  if (!sessionId) return;
  const event: Event = { name, at: Date.now(), count, ...(reason ? { reason } : {}) };
  await AsyncStorage.setItem(`${eventPrefix(sessionId)}${Crypto.randomUUID()}`, JSON.stringify(event));
}

export async function recordActiveBackgroundLayEvent(name: BackgroundLayEvent, count = 1, reason?: string): Promise<void> {
  await recordBackgroundLayEvent(await activeBackgroundLaySessionId(), name, count, reason);
}

const COUNT_NAMES = [
  'taskCallback', 'locationsReceived', 'handlerPresent', 'handlerMissing', 'taskError',
  'handlerRegistered', 'handlerCleared', 'onFixReceived', 'onFixAccepted', 'onFixRejected',
  'persistAttempt', 'persistSuccess', 'persistFailure', 'flushAttempt', 'flushSuccess', 'flushFailure',
  'taskStartAttempt', 'taskStartSuccess', 'taskStartFailure', 'taskStopAttempt', 'taskStopSuccess', 'taskStopFailure',
  'foreground', 'background', 'inactive', 'resume',
  'backgroundProcessedWithoutHandler', 'backgroundDuplicateDropped', 'backgroundSessionMismatch',
  'backgroundFinalizedSessionDropped', 'backgroundPersistAwaitFailure',
] as const;

export type BackgroundLayDiagnostics = {
  schemaVersion: 1;
  // All times are milliseconds relative to recording start; no absolute dates leave the device.
  timesMs: Partial<Record<BackgroundLayEvent, number>>;
  // persist* counts POINTS; flush* and task* count operations/callbacks.
  // onFixAccepted counts recorded line points, including the start anchor.
  counts: Record<(typeof COUNT_NAMES)[number], number>;
  rejectReasons: Record<string, number>;
  /** Personal QA only: runtime drops, separate from GPS quality rejections. */
  runtimeDropReasons?: Partial<Record<RuntimeDropReason, number>>;
  taskErrorReason: string | null;
  taskStartFailureReason: string | null;
  taskStopFailureReason: string | null;
  foregroundPermissionState: string | null;
  backgroundPermissionState: string | null;
  taskRegistered: boolean | null;
  /** Low-frequency transitions only; point/callback counters remain in counts. */
  timeline?: { timeBasis: 'wall_relative'; events: { name: BackgroundLayEvent; tMs: number; reason?: string }[]; totalEvents: number; truncated: boolean };
};

const TIMELINE_NAMES = new Set<BackgroundLayEvent>([
  'foreground', 'background', 'inactive', 'resume', 'foregroundPermission', 'backgroundPermission',
  'taskStartAttempt', 'taskStartSuccess', 'taskStartFailure', 'taskStopAttempt', 'taskStopSuccess',
  'taskStopFailure', 'taskRegistered', 'handlerRegistered', 'handlerCleared', 'taskError',
]);
const TIMELINE_LIMIT = 128;
const RUNTIME_DROP_REASONS = ['duplicate', 'no_bound_session', 'unknown_session', 'dog_mismatch',
  'registry_mismatch', 'not_laying', 'session_not_active', 'session_finalized', 'fix_before_session_start', 'unknown'] as const;
type RuntimeDropReason = (typeof RUNTIME_DROP_REASONS)[number];
function runtimeDropReason(event: Event): RuntimeDropReason | null {
  if (event.name === 'backgroundDuplicateDropped') return 'duplicate';
  if (event.name === 'backgroundFinalizedSessionDropped') return 'session_finalized';
  if (event.name !== 'backgroundSessionMismatch') return null;
  return RUNTIME_DROP_REASONS.includes(event.reason as RuntimeDropReason) ? event.reason as RuntimeDropReason : 'unknown';
}

/** Read only this exact session. No latest-session or latest-dog fallback. */
export async function loadBackgroundLayDiagnostics(sessionId: string, options?: { includeTimeline?: boolean; includeRuntimeDropReasons?: boolean }): Promise<BackgroundLayDiagnostics | null> {
  const qaAccess = options?.includeRuntimeDropReasons ? diagnosticsAccessToken() : null;
  const meta = await AsyncStorage.getItem(metaKey(sessionId));
  if (!meta) return null;
  const startedAt = (JSON.parse(meta) as { startedAt: number }).startedAt;
  const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(eventPrefix(sessionId)));
  const pairs = await AsyncStorage.multiGet(keys);
  const events = pairs.flatMap(([, raw]) => {
    if (!raw) return [];
    try { return [JSON.parse(raw) as Event]; } catch { return []; }
  }).sort((a, b) => a.at - b.at);
  const counts = Object.fromEntries(COUNT_NAMES.map(name => [name, 0])) as BackgroundLayDiagnostics['counts'];
  const out: BackgroundLayDiagnostics = {
    schemaVersion: 1, timesMs: {}, counts, rejectReasons: {}, taskErrorReason: null,
    taskStartFailureReason: null, taskStopFailureReason: null,
    foregroundPermissionState: null, backgroundPermissionState: null, taskRegistered: null,
  };
  for (const e of events) {
    if (e.name in counts) counts[e.name as keyof typeof counts] += e.count;
    out.timesMs[e.name] = Math.max(0, e.at - startedAt);
    if (e.name === 'onFixRejected') out.rejectReasons[e.reason ?? 'unknown'] = (out.rejectReasons[e.reason ?? 'unknown'] ?? 0) + e.count;
    if (e.name === 'taskError') out.taskErrorReason = e.reason ?? 'task_error';
    if (e.name === 'taskStartFailure') out.taskStartFailureReason = e.reason ?? 'task_start_failed';
    if (e.name === 'taskStopFailure') out.taskStopFailureReason = e.reason ?? 'task_stop_failed';
    if (e.name === 'foregroundPermission') out.foregroundPermissionState = e.reason ?? null;
    if (e.name === 'backgroundPermission') out.backgroundPermissionState = e.reason ?? null;
    if (e.name === 'taskRegistered') out.taskRegistered = e.reason === 'true';
  }
  if (options?.includeTimeline) {
    const transitions = events.filter(e => TIMELINE_NAMES.has(e.name));
    out.timeline = {
      timeBasis: 'wall_relative',
      totalEvents: transitions.length, truncated: transitions.length > TIMELINE_LIMIT,
      events: transitions.slice(-TIMELINE_LIMIT).map(e => ({
        name: e.name, tMs: Math.max(0, e.at - startedAt), ...(e.reason ? { reason: e.reason } : {}),
      })),
    };
  }
  // Re-check after asynchronous storage reads; a revoked/account-switched export
  // must not acquire the additional personal QA fields.
  if (qaAccess && qaAccess === diagnosticsAccessToken()) {
    out.runtimeDropReasons = {};
    for (const event of events) {
      const reason = runtimeDropReason(event);
      if (reason && Number.isFinite(event.count) && event.count > 0)
        out.runtimeDropReasons[reason] = (out.runtimeDropReasons[reason] ?? 0) + event.count;
    }
  }
  return out;
}
