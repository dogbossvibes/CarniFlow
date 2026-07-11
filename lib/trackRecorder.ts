import type { TrackPoint } from '@/types/tracking';

// ─────────────────────────────────────────────────────────────────────────
// LEGACY / eingeschränkter Umfang.
//
// Diese Datei ist NICHT mehr der Fährten-Recorder. Die aktive Aufnahme läuft
// ausschliesslich über features/tracking/hooks/useTrackRecorder.ts (inkl. der
// Play-konformen Hintergrundstandort-Disclosure VOR dem Start).
//
// Der frühere Pfad `startRecording()`/`stopRecording()` hat den Hintergrund-
// standort OHNE In-App-Offenlegung angefragt (eigener Task 'anyvo-track-
// location'). Er wurde nirgends mehr aufgerufen und ist entfernt, damit es
// keinen zweiten, abweichenden Flow gibt.
//
// Was hier bleibt (und weiterhin genutzt wird):
//   • Puffer für Punkte von EXTERNEM BLE-GPS (lib/externalGps.ts → pushPoint)
//   • Abo/Snapshot für den Positions-Stream (features/tracking/utils/positionStream.ts)
// Kein Zugriff auf Telefon-GPS oder Hintergrundstandort in dieser Datei.
// ─────────────────────────────────────────────────────────────────────────

interface RecState { points: TrackPoint[]; accuracy: number | null; }

let state: RecState = { points: [], accuracy: null };
const listeners = new Set<() => void>();
let externalMode = false;   // true = Punkte kommen von externem BLE-GPS

// Externes GPS aktiv? (nur Buchhaltung — startet selbst kein GPS).
export function setExternalMode(on: boolean) { externalMode = on; }
export function isExternalMode() { return externalMode; }

// Einzelnen Punkt von extern (BLE-GPS / NMEA) einspeisen.
export function pushPoint(lat: number, lng: number, accuracy: number | null = null) {
  const pts = state.points.slice();
  pts.push({
    lat, lng,
    accuracy_m: accuracy,
    altitude_m: null,
    timestamp:  new Date().toISOString(),
    seq:        pts.length,
  });
  state = { points: pts, accuracy: accuracy != null ? Math.round(accuracy) : state.accuracy };
  emit();
}

function emit() { for (const l of listeners) l(); }

export function resetRecorder() {
  state = { points: [], accuracy: null };
  emit();
}

export function getRecordedPoints(): TrackPoint[] {
  return state.points;
}

function subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb); }

// Für den neuen Fährten-Flow: auf eingehende (externe BLE-) Punkte hören.
export const subscribeRecorder = subscribe;
