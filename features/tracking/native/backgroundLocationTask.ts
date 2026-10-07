import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import {
  activeBackgroundLaySessionId, diagnosticReason, endBackgroundLayDiagnostics,
  recordBackgroundLayEvent,
} from '@/features/tracking/utils/backgroundLayDiagnostics';
import { deliverBackgroundLocations, type LayDeliveryOutcome } from '@/features/tracking/engine/laySessionRuntime';

// ──────────────────────────────────────────────────────────────────────────
// Hintergrundfähige GPS-Quelle für die Fährtenaufnahme.
//
// watchPositionAsync liefert nur im Vordergrund Fixes — sobald das Display aus
// oder die App im Hintergrund ist, pausiert der Stream und die Spur bricht ab.
// startLocationUpdatesAsync + TaskManager ist der von Expo vorgesehene Weg für
// Hintergrund-GPS und bringt die sichtbare Status-Anzeige gleich mit:
//   • Android: dauerhafte Foreground-Service-Benachrichtigung (Pflicht).
//   • iOS:     blaue Statusleisten-Pille (showsBackgroundLocationIndicator).
//
// Der Task MUSS global definiert sein (das OS findet ihn sonst im Hintergrund
// nicht). Er ist nur der EINSTIEGSPUNKT: jeder Fix wird über die Lay-Session-
// Runtime eindeutig der gebundenen aktiven Lay-Session zugeordnet, durch
// denselben Lay-Processor wie im Vordergrund verarbeitet und dauerhaft
// geschrieben, bevor der Task zurückkehrt. Ein registrierter Handler ist nur
// noch die optionale UI-Brücke — keine Voraussetzung und kein zweiter
// Verarbeitungspfad.
// ──────────────────────────────────────────────────────────────────────────

// Eigener Task-Name — NICHT 'anyvo-track-location' (das belegt der ältere
// lib/trackRecorder für den externen-BLE-GPS-Pfad). Zwei defineTask auf denselben
// Namen würden kollidieren.
export const TRACK_LOCATION_TASK = 'anyvo-faehrte-bg';

type FixHandler = (loc: Location.LocationObject) => void;
let activeHandler: FixHandler | null = null;

/** Optionale UI-Brücke (z. B. Live-Genauigkeit); verarbeitet KEINE Fixes. null = keine UI angehängt. */
export function setTrackFixHandler(handler: FixHandler | null, diagnosticSessionId?: string | null): void {
  activeHandler = handler;
  void recordBackgroundLayEvent(diagnosticSessionId, handler ? 'handlerRegistered' : 'handlerCleared').catch(() => {});
}

// defineTask ist über die Plattformen hinweg lose typisiert → schmaler Cast
// (gleiches Vorgehen wie im bestehenden lib/trackRecorder).
const define = TaskManager.defineTask as (task: string, executor: (body: any) => void | Promise<void>) => void;
define(TRACK_LOCATION_TASK, async ({ data, error }: { data?: { locations?: Location.LocationObject[] }; error: { message: string } | null }) => {
  const session = activeBackgroundLaySessionId();
  if (error) {
    console.warn('[bgLocation]', error.message);
    return session.then(sid => Promise.allSettled([
      recordBackgroundLayEvent(sid, 'taskCallback'),
      recordBackgroundLayEvent(sid, 'taskError', 1, diagnosticReason(error, 'native_task_error')),
    ])).then(() => {});
  }
  const locations = data?.locations;
  const handler = activeHandler;
  // Fachliche Verarbeitung + awaited Persistenz — unabhängig von Screen/Handler.
  let outcomes: LayDeliveryOutcome[] = [];
  if (locations?.length) {
    try { outcomes = await deliverBackgroundLocations(locations); } catch (e) { console.warn('[bgLocation] process', e); }
  }
  // Optionale UI-Brücke, erst NACH der Verarbeitung (kein zweiter Verarbeitungspfad).
  if (locations?.length && handler) for (const loc of locations) { try { handler(loc); } catch { /* UI optional */ } }
  return session.then(sid => Promise.allSettled([
    recordBackgroundLayEvent(sid, 'taskCallback'),
    ...(locations?.length ? [recordBackgroundLayEvent(sid, 'locationsReceived', locations.length)] : []),
    ...(locations?.length ? [recordBackgroundLayEvent(sid, handler ? 'handlerPresent' : 'handlerMissing')] : []),
    ...backgroundOutcomeEvents(sid, outcomes, !!handler),
  ])).then(() => {});
});

/** Klar unterscheidbare Zähler für die Hintergrund-Verarbeitung (nur Reason-Codes, keine Rohdaten). */
function backgroundOutcomeEvents(sid: string | null, outcomes: readonly LayDeliveryOutcome[], handlerPresent: boolean): Promise<void>[] {
  const events: Promise<void>[] = [];
  const processed = outcomes.filter(o => o.kind === 'processed').length;
  if (processed && !handlerPresent) events.push(recordBackgroundLayEvent(sid, 'backgroundProcessedWithoutHandler', processed));
  const failures = outcomes.filter(o => o.kind === 'persist_failed').length;
  if (failures) events.push(recordBackgroundLayEvent(sid, 'backgroundPersistAwaitFailure', failures));
  const dropped = new Map<string, number>();
  for (const o of outcomes) if (o.kind === 'dropped') dropped.set(o.reason, (dropped.get(o.reason) ?? 0) + 1);
  for (const [reason, count] of dropped) {
    if (reason === 'duplicate') events.push(recordBackgroundLayEvent(sid, 'backgroundDuplicateDropped', count));
    else if (reason === 'session_finalized') events.push(recordBackgroundLayEvent(sid, 'backgroundFinalizedSessionDropped', count));
    else events.push(recordBackgroundLayEvent(sid, 'backgroundSessionMismatch', count, reason));
  }
  return events;
}

/** Hintergrund-Updates mit Foreground-Service (Android) + iOS-Indikator starten. */
export async function startBackgroundUpdates(opts: {
  notificationTitle: string;
  notificationBody: string;
  notificationColor?: string;
  diagnosticSessionId?: string;
}): Promise<void> {
  const note = (name: 'taskStartAttempt' | 'taskStartSuccess' | 'taskStartFailure' | 'taskRegistered', count = 1, reason?: string) =>
    recordBackgroundLayEvent(opts.diagnosticSessionId, name, count, reason);
  void note('taskStartAttempt').catch(() => {});
  try {
    await Location.startLocationUpdatesAsync(TRACK_LOCATION_TASK, {
    accuracy:                  Location.Accuracy.BestForNavigation,
    timeInterval:              1000,
    distanceInterval:          0,
    // Android's headless JS may acknowledge location jobs slowly after the
    // screen turns off. Batch every 30 s while backgrounded; all raw fixes
    // remain in the batch, while the native job queue stays bounded.
    deferredUpdatesInterval:   Platform.OS === 'android' ? 30_000 : 0,
    deferredUpdatesDistance:   0,
    pausesUpdatesAutomatically: false,            // iOS: nie automatisch pausieren
    activityType:              Location.ActivityType.Fitness,
    showsBackgroundLocationIndicator: true,        // iOS: blaue Pille
    foregroundService: {                           // Android: dauerhafte Anzeige
      notificationTitle: opts.notificationTitle,
      notificationBody:  opts.notificationBody,
      notificationColor: opts.notificationColor,
      killServiceOnDestroy: false,
    },
    });
    void note('taskStartSuccess').catch(() => {});
    void Location.hasStartedLocationUpdatesAsync(TRACK_LOCATION_TASK)
      .then(registered => note('taskRegistered', 1, String(registered)))
      .catch(() => {});
  } catch (e) {
    void note('taskStartFailure', 1, diagnosticReason(e, 'task_start_failed')).catch(() => {});
    throw e;
  }
}

/** Hintergrund-Updates beenden (idempotent, no-op wenn nie gestartet). */
export async function stopBackgroundUpdates(sessionId?: string | null): Promise<void> {
  const diagnosticSessionId = sessionId ?? await activeBackgroundLaySessionId().catch(() => null);
  void recordBackgroundLayEvent(diagnosticSessionId, 'taskStopAttempt').catch(() => {});
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TRACK_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(TRACK_LOCATION_TASK);
    }
    void recordBackgroundLayEvent(diagnosticSessionId, 'taskStopSuccess').catch(() => {});
  } catch (e) {
    void recordBackgroundLayEvent(diagnosticSessionId, 'taskStopFailure', 1, diagnosticReason(e, 'task_stop_failed')).catch(() => {});
    console.warn('[bgLocation] stop', e);
  } finally {
    if (diagnosticSessionId) void endBackgroundLayDiagnostics(diagnosticSessionId).catch(() => {});
  }
}
