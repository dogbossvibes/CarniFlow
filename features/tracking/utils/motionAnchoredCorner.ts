// ──────────────────────────────────────────────────────────────────────────
// Sensorverankerter Winkel (T-215): Rückfall für Winkel, die bei schlechtem
// GPS weder Regelpfad noch Split-Apex noch Langschenkel-Pfad finden.
//
// Befund (Simulator, Feldrand/Wald/Laubdach): an verpassten Winkeln zeigt der
// Bewegungssensor immer eine klare Drehung (≥ 70° in 3 s), die GPS-Spur ist
// in der Nähe des Scheitels aber zu verrauscht für die kurzen Fenster des
// Regelpfads und für die Geradheits-Gates des Langschenkel-Pfads.
//
// Prinzip: Der Sensor liefert den ZEITPUNKT der Drehung (und damit den
// Scheitel), das GPS muss sie über lange Strecken BESTÄTIGEN:
//   1. Dreh-Episode im Sensor: ≥ 45° in einem 3-s-Fenster, überwiegend in eine
//      Richtung, mit Gehnachweis.
//   2. Scheitel = Detektorpunkt, der zeitlich am nächsten liegt (≤ 3 s).
//   3. GPS-Richtung 12–16 m VOR dem Scheitel gegen 12–16 m DANACH: Drehung
//      ≥ 60°, gleiche Richtung wie der Sensor, Betrag höchstens 60° neben dem
//      Sensor-Drehwinkel.
//
// Das ist KEIN reines Sensor-Ereignis: ohne die GPS-Bestätigung entsteht kein
// Winkel («Handy im Gehen drehen» allein reicht nie). Restrisiko: Handydrehung
// auf gerader Strecke, während die GPS-Spur zufällig in dieselbe Richtung
// knickt — im Simulator bei schlechtem GPS rund 8 % solcher Handydrehungen.
//
// Gemeldet wird immer ein NORMALER Winkel der Richtung; die Schärfe klärt die
// bestehende Nachprüfung (T-211) rein geometrisch.
//
// Reine Funktionen, kein React/Native.
// ──────────────────────────────────────────────────────────────────────────
import { calculateHeading } from '@/features/tracking/utils/gpsFilter';
import { MOTION_YAW_LEFT_SIGN, TURN_EVIDENCE_DEFAULTS, type MotionWindowSample } from '@/features/tracking/utils/motionTurnEvidence';
import { normalizeDeg, type ShortLegPoint } from '@/features/tracking/utils/shortLegCornerDetection';

/** Gleitendes Fenster der Dreh-Episode (s). */
export const ANCHOR_EPISODE_WINDOW_S = 3;
/** Mindest-Drehung im Fenster (Grad). */
export const ANCHOR_EPISODE_MIN_YAW_DEG = 45;
/** Netto ÷ Brutto: die Drehung muss überwiegend in eine Richtung gehen (kein Gang-Wackeln). */
export const ANCHOR_EPISODE_MIN_MONOTONICITY = 0.45;
/** Zwei Episoden näher als so viele Sekunden sind dieselbe Drehung. */
export const ANCHOR_EPISODE_MERGE_S = 4;
/** Der Scheitel-Detektorpunkt darf höchstens so weit neben der Episode liegen (s). */
export const ANCHOR_APEX_MAX_DT_S = 3;
/** Messstrecke vor und nach dem Scheitel (m) und wie viel davon belegt sein muss. */
export const ANCHOR_BASELINE_M = 16;
export const ANCHOR_BASELINE_MIN_FILL = 0.8;
/** Die Richtung wird zwischen dem Scheitelbereich und dem äusseren Band (Ende der Messstrecke) gemessen (m). */
export const ANCHOR_BAND_M = 4;
export const ANCHOR_APEX_RADIUS_M = 2;
/** GPS-Drehung über die Messstrecke: Mindest- und Höchstbetrag (Grad). */
export const ANCHOR_MIN_GPS_TURN_DEG = 60;
export const ANCHOR_MAX_GPS_TURN_DEG = 165;
/** GPS-Drehung und Sensor-Drehwinkel dürfen höchstens so weit auseinanderliegen (Grad). */
export const ANCHOR_MAX_YAW_MISMATCH_DEG = 60;

export interface MotionTurnEpisode {
  /** Mitte der Drehung (ms, Unix). */
  tMs: number;
  /** Drehwinkel im Fenster, mit Vorzeichen (positiv = links). */
  yawDeg: number;
  direction: 'links' | 'rechts';
}

/** Sucht klare Dreh-Episoden im Sensor-Ringpuffer (zeitlich sortierte Samples). */
export function detectMotionTurnEpisodes(samples: readonly MotionWindowSample[]): MotionTurnEpisode[] {
  const windowMs = ANCHOR_EPISODE_WINDOW_S * 1000;
  const candidates: (MotionTurnEpisode & { strength: number })[] = [];
  let lo = 0, net = 0, gross = 0, steps = 0, gait = 0;
  for (let hi = 0; hi < samples.length; hi++) {
    const s = samples[hi];
    net += s.headingDelta; gross += Math.abs(s.headingDelta); steps += s.stepDelta;
    if (s.accelerationMagnitude >= TURN_EVIDENCE_DEFAULTS.gaitAccelThresholdG) gait++;
    while (s.t - samples[lo].t > windowMs) {
      const d = samples[lo];
      net -= d.headingDelta; gross -= Math.abs(d.headingDelta); steps -= d.stepDelta;
      if (d.accelerationMagnitude >= TURN_EVIDENCE_DEFAULTS.gaitAccelThresholdG) gait--;
      lo++;
    }
    const count = hi - lo + 1;
    if (count < 4 || Math.abs(net) < ANCHOR_EPISODE_MIN_YAW_DEG) continue;
    if (gross <= 0 || Math.abs(net) / gross < ANCHOR_EPISODE_MIN_MONOTONICITY) continue;
    // Gehnachweis im selben Fenster: Schritte oder Gangbeschleunigung.
    if (steps <= 0 && gait / count < TURN_EVIDENCE_DEFAULTS.gaitAccelMinFraction) continue;
    // Mitte der Drehung: dort, wo die Hälfte des Drehwinkels erreicht ist.
    let acc = 0, mid = samples[lo].t;
    for (let k = lo; k <= hi; k++) { acc += samples[k].headingDelta; if (Math.abs(acc) >= Math.abs(net) / 2) { mid = samples[k].t; break; } }
    candidates.push({ tMs: mid, yawDeg: net, direction: net * MOTION_YAW_LEFT_SIGN > 0 ? 'links' : 'rechts', strength: Math.abs(net) });
  }
  // Stärkstes Fenster je Drehung behalten.
  candidates.sort((a, b) => b.strength - a.strength || a.tMs - b.tMs);
  const kept: MotionTurnEpisode[] = [];
  for (const c of candidates) {
    if (kept.some(k => Math.abs(k.tMs - c.tMs) < ANCHOR_EPISODE_MERGE_S * 1000)) continue;
    kept.push({ tMs: c.tMs, yawDeg: Math.round(c.yawDeg * 10) / 10, direction: c.direction });
  }
  return kept.sort((a, b) => a.tMs - b.tMs);
}

export interface MotionAnchoredHit {
  apexIndex: number;
  atM: number;
  direction: 'links' | 'rechts';
  /** GPS-Drehung über die Messstrecke, mit Vorzeichen (positiv = rechts). */
  gpsTurnDeg: number;
  yawDeg: number;
}

export type MotionAnchorVerdict =
  | { status: 'hit'; hit: MotionAnchoredHit }
  /** Noch nicht genug Weg hinter dem Scheitel — später erneut prüfen. */
  | { status: 'wait' }
  | { status: 'rejected'; reason: 'no_apex' | 'short_before' | 'no_band' | 'gps_turn_small' | 'gps_turn_large' | 'direction_conflict' | 'yaw_mismatch' };

function centroid(points: readonly ShortLegPoint[], from: number, to: number): { lat: number; lng: number } | null {
  if (to < from) return null;
  let lat = 0, lng = 0;
  for (let i = from; i <= to; i++) { lat += points[i].lat; lng += points[i].lng; }
  const n = to - from + 1;
  return { lat: lat / n, lng: lng / n };
}

/** Prüft EINE Dreh-Episode gegen die GPS-Spur des Detektor-Puffers. */
export function evaluateMotionAnchoredCorner(points: readonly ShortLegPoint[], episode: MotionTurnEpisode): MotionAnchorVerdict {
  // Scheitel: zeitlich nächster Detektorpunkt.
  let apex = -1, bestDt = Infinity;
  for (let i = 0; i < points.length; i++) {
    const t = points[i].t;
    if (t == null) continue;
    const dt = Math.abs(t - episode.tMs);
    if (dt < bestDt) { bestDt = dt; apex = i; }
  }
  if (apex < 0 || bestDt > ANCHOR_APEX_MAX_DT_S * 1000) {
    // Die Episode kann jünger sein als der letzte Detektorpunkt — dann kommt der Scheitel noch.
    const lastT = points.length ? points[points.length - 1].t ?? null : null;
    return lastT != null && lastT < episode.tMs ? { status: 'wait' } : { status: 'rejected', reason: 'no_apex' };
  }
  const atM = points[apex].cumDist;
  const need = ANCHOR_BASELINE_M * ANCHOR_BASELINE_MIN_FILL;
  if (points[points.length - 1].cumDist - atM < need) return { status: 'wait' };
  if (atM - points[0].cumDist < need) return { status: 'rejected', reason: 'short_before' };

  // Bänder: Scheitelbereich (±2 m) und je ein äusseres Band am Ende der Messstrecke.
  const range = (lo: number, hi: number): [number, number] => {
    let a = -1, b = -1;
    for (let i = 0; i < points.length; i++) { const d = points[i].cumDist - atM; if (d >= lo && d <= hi) { if (a < 0) a = i; b = i; } }
    return [a, b];
  };
  const [a0, a1] = range(-ANCHOR_APEX_RADIUS_M, ANCHOR_APEX_RADIUS_M);
  const [b0, b1] = range(-ANCHOR_BASELINE_M, -(ANCHOR_BASELINE_M - ANCHOR_BAND_M));
  const [c0, c1] = range(ANCHOR_BASELINE_M - ANCHOR_BAND_M, ANCHOR_BASELINE_M);
  const mid = centroid(points, a0, a1), before = b0 < 0 ? null : centroid(points, b0, b1), after = c0 < 0 ? null : centroid(points, c0, c1);
  if (!mid || !before || !after) return { status: 'rejected', reason: 'no_band' };

  const gpsTurn = normalizeDeg(calculateHeading(mid, after) - calculateHeading(before, mid));
  const magnitude = Math.abs(gpsTurn);
  if (magnitude < ANCHOR_MIN_GPS_TURN_DEG) return { status: 'rejected', reason: 'gps_turn_small' };
  if (magnitude > ANCHOR_MAX_GPS_TURN_DEG) return { status: 'rejected', reason: 'gps_turn_large' };
  const gpsDirection = gpsTurn > 0 ? 'rechts' : 'links';
  if (gpsDirection !== episode.direction) return { status: 'rejected', reason: 'direction_conflict' };
  if (Math.abs(magnitude - Math.abs(episode.yawDeg)) > ANCHOR_MAX_YAW_MISMATCH_DEG) return { status: 'rejected', reason: 'yaw_mismatch' };
  return { status: 'hit', hit: { apexIndex: apex, atM, direction: gpsDirection, gpsTurnDeg: Math.round(gpsTurn * 10) / 10, yawDeg: episode.yawDeg } };
}
