// ──────────────────────────────────────────────────────────────────────────
// Reine Fix-Annahme der Absuche (P1) — bewusst OHNE React/Expo/Native-Imports,
// damit sie isoliert testbar ist. Entscheidet, ob ein GPS-Fix ein gültiger
// Linien-Fix ist, mit denselben Gates wie der Lege-Recorder (useTrackRecorder):
//   • Genauigkeit ≤ maxAccuracyM (Default 45 m, wie MAX_ACCURACY_M beim Legen)
//   • Geschwindigkeit ≤ maxSpeedMps (Default 12 m/s, wie MAX_SPEED_MPS beim Legen),
//     berechnet aus Position/Zeit gegen den letzten AKZEPTIERTEN Fix
//   • KEIN absoluter Jump-Filter (wie beim Legen)
// Fehlende accuracy/speed führen NICHT zur Ablehnung.
// ──────────────────────────────────────────────────────────────────────────

// Defaults gespiegelt aus useTrackRecorder (dort modul-lokal, nicht exportiert;
// der Lege-Recorder wird bewusst nicht verändert).
export const SEARCH_MAX_ACCURACY_M = 45;
export const SEARCH_MAX_SPEED_MPS = 12;

type LL = { latitude: number; longitude: number };

const toRad = (d: number) => (d * Math.PI) / 180;
export function distM(a: LL, b: LL): number {
  const R = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const la1 = toRad(a.latitude), la2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type SearchFixReason = 'first' | 'ok' | 'accuracy' | 'speed';
export interface SearchFixDecision {
  accepted:  boolean;
  reason:    SearchFixReason;
  accuracy:  number | null;
  speed:     number | null;
  jumpM:     number | null;   // Distanz zum letzten akzeptierten Fix (Diagnose)
}
export interface SearchFixPrev { lat: number; lng: number; t: number }
export interface SearchFixCur  { lat: number; lng: number; t: number; accuracy: number | null; speed: number | null }

export function evaluateSearchFix(
  prev: SearchFixPrev | null,
  cur: SearchFixCur,
  params?: { maxAccuracyM?: number; maxSpeedMps?: number },
): SearchFixDecision {
  const maxAccuracyM = params?.maxAccuracyM ?? SEARCH_MAX_ACCURACY_M;
  const maxSpeedMps  = params?.maxSpeedMps ?? SEARCH_MAX_SPEED_MPS;

  // Genauigkeit: nur ablehnen, wenn vorhanden UND zu grob (fehlend = akzeptieren).
  if (cur.accuracy != null && cur.accuracy > maxAccuracyM) {
    return { accepted: false, reason: 'accuracy', accuracy: cur.accuracy, speed: cur.speed, jumpM: null };
  }

  // Erster Fix: kein Sprungvergleich möglich → akzeptieren.
  if (!prev) {
    return { accepted: true, reason: 'first', accuracy: cur.accuracy, speed: cur.speed, jumpM: null };
  }

  // Speed-Gate (aus Position/Zeit, wie Legen): unrealistischer Sprung = Ausreisser.
  const jumpM = distM({ latitude: prev.lat, longitude: prev.lng }, { latitude: cur.lat, longitude: cur.lng });
  const dt = (cur.t - prev.t) / 1000;
  if (dt > 0 && jumpM / dt > maxSpeedMps) {
    return { accepted: false, reason: 'speed', accuracy: cur.accuracy, speed: cur.speed, jumpM };
  }
  return { accepted: true, reason: 'ok', accuracy: cur.accuracy, speed: cur.speed, jumpM };
}
