// Welche Engine/Source ist GERADE im Lege-Recorder aktiv?
//
// Zweck (QA): der Diagnose-Screen zeigt die gespeicherte Präferenz. Sobald der
// GPS-Warmup läuft, ist die tatsächlich verwendete Quelle aber festgeschrieben
// — `startWarmup()` ist idempotent, ein späteres Umschalten wechselt den
// laufenden Stream NICHT. Damit das nicht still passiert, hält dieses Modul
// fest, was beim Start wirklich gelesen wurde.
//
// Bewusst KEIN Hot-Swap der Location-Subscription nur für QA: eine laufende
// Aufzeichnung mitten im Feld auf eine andere Quelle umzuhängen ist das
// riskantere Verhalten. Stattdessen wird der Unterschied sichtbar gemacht.
import type { LocationSourceMode } from '@/features/tracking/utils/locationSourceMode';
import type { TrackingEngineMode } from '@/features/tracking/utils/trackingEngineMode';

export interface ActiveTrackingModes {
  /** true, solange ein GPS-Warmup/Stream im Lege-Recorder offen ist. */
  warmupActive: boolean;
  /** Beim GPS-Start gelesene Engine — nicht die aktuelle Präferenz. */
  engine: TrackingEngineMode | null;
  /** Beim GPS-Start gelesene Quelle — nicht die aktuelle Präferenz. */
  source: LocationSourceMode | null;
  /** Was die Positionsquelle danach tatsächlich gemeldet hat ('native'/'expo'/…). */
  reportedSource: string | null;
  /** Zeitpunkt des GPS-Starts (ms). */
  startedAt: number | null;
  /**
   * Core-Motion-Mitschnitt beim Legen (QA-only):
   *   'off'     — läuft nicht (kein QA-Modus, oder ENGINE=BUILD40)
   *   'waiting' — gestartet, aber noch kein Sample eingetroffen
   *   'live'    — Samples kommen an
   * Rein diagnostisch. Motion beeinflusst die Erkennung nicht.
   */
  motion: 'off' | 'waiting' | 'live';
  /** Anzahl empfangener Motion-Samples in dieser Aufzeichnung. */
  motionSamples: number;
}

const IDLE: ActiveTrackingModes = {
  warmupActive: false, engine: null, source: null, reportedSource: null, startedAt: null,
  motion: 'off', motionSamples: 0,
};

let state: ActiveTrackingModes = IDLE;
const listeners = new Set<(s: ActiveTrackingModes) => void>();

export function getActiveTrackingModes(): ActiveTrackingModes {
  return state;
}

export function subscribeActiveTrackingModes(fn: (s: ActiveTrackingModes) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(next: ActiveTrackingModes): void {
  state = next;
  listeners.forEach(fn => fn(next));
}

/** Vom Recorder aufgerufen, sobald die Positionsquelle tatsächlich gestartet wurde. */
export function markWarmupStarted(engine: TrackingEngineMode, source: LocationSourceMode): void {
  emit({
    warmupActive: true, engine, source, reportedSource: null, startedAt: Date.now(),
    motion: 'off', motionSamples: 0,
  });
}

/** Der QA-Motion-Mitschnitt wurde gestartet — Samples werden noch erwartet. */
export function markMotionStarted(): void {
  if (!state.warmupActive || state.motion !== 'off') return;
  emit({ ...state, motion: 'waiting', motionSamples: 0 });
}

// Nicht jedes 4-Hz-Sample löst ein Update aus: gemeldet wird der Übergang
// „keine Samples" → „läuft" und danach nur noch gelegentlich, damit die
// QA-Anzeige lebendig bleibt, ohne die Oberfläche zu fluten.
const MOTION_EMIT_EVERY = 25;

export function markMotionSample(): void {
  if (!state.warmupActive || state.motion === 'off') return;
  const next = state.motionSamples + 1;
  if (state.motion === 'waiting' || next % MOTION_EMIT_EVERY === 0) {
    emit({ ...state, motion: 'live', motionSamples: next });
  } else {
    state = { ...state, motionSamples: next };   // still mitzählen, kein Re-Render
  }
}

/** Was die Quelle im ersten Sample gemeldet hat (rein informativ). */
export function markReportedSource(reported: string | null): void {
  if (!state.warmupActive || state.reportedSource === reported) return;
  emit({ ...state, reportedSource: reported });
}

/** Vom Recorder aufgerufen, wenn der Stream geschlossen wird. */
export function markWarmupStopped(): void {
  if (!state.warmupActive) return;
  emit(IDLE);
}
