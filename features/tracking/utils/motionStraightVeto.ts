// ──────────────────────────────────────────────────────────────────────────
// Geradeaus-Sperre (T-214): ein schwach belegter GPS-Winkel wird NICHT gemeldet,
// wenn der Bewegungssensor im selben Zeitraum lückenlos mitlief, die Person
// nachweislich ging und sich das Handy praktisch nicht gedreht hat.
//
// Hintergrund (Simulator, Wald/Feldrand/Hosentasche): fast alle falschen
// Zusatzwinkel entstehen auf gerader Strecke aus GPS-Drift. Dort misst der
// Drehratensensor in keinem 3-s-Fenster mehr als rund 5–11° — an echten Winkeln
// dagegen 45° und mehr. Die bestehende Kopplung (±0,12, anteilig) zieht in
// diesem Fall nur etwa 0,02 ab und kann den Winkel nicht verhindern.
//
// Die Sperre wirkt nur in EINE Richtung: Sie kann einen GPS-Winkel
// zurückhalten, nie einen erzeugen. Ohne Bewegungsdaten, bei Lücken, ohne
// Gehnachweis oder bei starker GPS-Geometrie entscheidet sie nichts
// (`decided: false`) — dann gilt die Erkennung wie bisher.
//
// Reine Funktion, kein React/Native.
// ──────────────────────────────────────────────────────────────────────────
import { COUPLING_DEFAULTS, TURN_EVIDENCE_DEFAULTS, type MotionWindowSample } from '@/features/tracking/utils/motionTurnEvidence';

/** So weit vor dem GPS-Scheitel wird nach einer Drehung gesucht (s). Der Scheitel kann bei Drift mehrere Meter neben dem echten Winkel liegen. */
export const STRAIGHT_VETO_LOOKBACK_S = 8;
/** Gleitendes Fenster, in dem die Drehung aufsummiert wird (s). */
export const STRAIGHT_VETO_WINDOW_S = 3;
/** Unterhalb dieser Drehung (Grad) in JEDEM Fenster und über den ganzen Zeitraum gilt «geradeaus». */
export const STRAIGHT_VETO_MAX_YAW_DEG = 20;
/** Der Scheitel darf höchstens so alt sein (s) — sonst deckt der 20-s-Ringpuffer den Rückblick nicht mehr sicher ab. */
export const STRAIGHT_VETO_MAX_AGE_S = 10;
/** Grösste erlaubte Lücke zwischen zwei Sensor-Samples (s). */
export const STRAIGHT_VETO_MAX_GAP_S = 1.5;
/** Ab dieser GPS-Confidence gilt die Geometrie als stark — Motion hält dann nichts zurück (wie bei der bestehenden Kopplung). */
export const STRAIGHT_VETO_STRONG_GPS_CONFIDENCE = COUPLING_DEFAULTS.strongGpsConfidence;
/** Ein bereits gesperrter Scheitel bleibt innerhalb dieses Abstands (Detektor-Meter) gesperrt, wenn später keine Sensordaten mehr vorliegen. */
export const STRAIGHT_VETO_STICKY_M = 4;

export interface StraightVetoResult {
  /** false = keine belastbare Aussage (keine/lückenhafte Daten, kein Gehnachweis, zu alt). */
  decided: boolean;
  /** true = Sensor belegt: gegangen, aber nicht gedreht. Nur gültig, wenn `decided`. */
  straight: boolean;
  /** Grösste Drehung in einem Fenster (Grad, mit Vorzeichen), null ohne Aussage. */
  maxWindowYawDeg: number | null;
  /** Drehung über den ganzen geprüften Zeitraum (Grad, mit Vorzeichen). */
  netYawDeg: number | null;
  reason: 'ok' | 'no_samples' | 'too_old' | 'not_covered' | 'gap' | 'no_locomotion';
}

const undecided = (reason: StraightVetoResult['reason']): StraightVetoResult =>
  ({ decided: false, straight: false, maxWindowYawDeg: null, netYawDeg: null, reason });

/**
 * Prüft, ob der Bewegungssensor zwischen `apexTimeMs − Rückblick` und `nowMs`
 * eine Drehung gesehen hat. `samples` = Inhalt des Ringpuffers (zeitlich sortiert).
 */
export function evaluateStraightWalk(
  samples: readonly MotionWindowSample[], apexTimeMs: number | null | undefined, nowMs: number,
): StraightVetoResult {
  if (apexTimeMs == null || !Number.isFinite(apexTimeMs) || !Number.isFinite(nowMs)) return undecided('no_samples');
  if (nowMs - apexTimeMs > STRAIGHT_VETO_MAX_AGE_S * 1000 || nowMs < apexTimeMs) return undecided('too_old');
  const from = apexTimeMs - STRAIGHT_VETO_LOOKBACK_S * 1000;
  const win = samples.filter(s => s.t >= from && s.t <= nowMs);
  if (win.length < 4) return undecided('no_samples');
  const maxGapMs = STRAIGHT_VETO_MAX_GAP_S * 1000;
  // Der Zeitraum muss an beiden Enden und dazwischen lückenlos belegt sein.
  if (win[0].t - from > maxGapMs || nowMs - win[win.length - 1].t > maxGapMs) return undecided('not_covered');
  for (let i = 1; i < win.length; i++) if (win[i].t - win[i - 1].t > maxGapMs) return undecided('gap');
  // Gehnachweis: ein stiller Sensor-Strom (lauter Nullen) beweist kein Geradeausgehen.
  let steps = 0, gait = 0;
  for (const s of win) { steps += s.stepDelta; if (s.accelerationMagnitude >= TURN_EVIDENCE_DEFAULTS.gaitAccelThresholdG) gait++; }
  if (steps <= 0 && gait / win.length < TURN_EVIDENCE_DEFAULTS.gaitAccelMinFraction) return undecided('no_locomotion');

  const windowMs = STRAIGHT_VETO_WINDOW_S * 1000;
  let net = 0, maxWindow = 0, sum = 0, lo = 0;
  for (let hi = 0; hi < win.length; hi++) {
    net += win[hi].headingDelta; sum += win[hi].headingDelta;
    while (win[hi].t - win[lo].t > windowMs) { sum -= win[lo].headingDelta; lo++; }
    if (Math.abs(sum) > Math.abs(maxWindow)) maxWindow = sum;
  }
  const straight = Math.abs(maxWindow) < STRAIGHT_VETO_MAX_YAW_DEG && Math.abs(net) < STRAIGHT_VETO_MAX_YAW_DEG;
  return { decided: true, straight, maxWindowYawDeg: Math.round(maxWindow * 10) / 10, netYawDeg: Math.round(net * 10) / 10, reason: 'ok' };
}
