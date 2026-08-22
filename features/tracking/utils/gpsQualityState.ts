// ──────────────────────────────────────────────────────────────────────────
// GPS QUALITY ENGINE — laufender, deterministischer Signal-Qualitätszustand.
//
// Anders als die momentane Einzelwert-Einstufung (utils/gpsFilter.getGpsQuality
// bzw. engine/gpsQuality) bewertet diese Engine ein ROLLING WINDOW der letzten
// Fixes und liefert einen geglätteten Score 0..1 + Level mit Hysterese. Sie ändert
// KEINE Track-Geometrie und trifft KEINE Reject-Entscheidung — sie beschreibt nur
// die Signalstabilität als Kontext (u. a. für die adaptive Corner Confirmation).
//
// Keine ML/Cloud, keine native Dependency, keine DB. Ein einzelner schlechter Fix
// senkt den Score nur leicht; erst mehrere schlechte Fixes ziehen ihn deutlich.
// ──────────────────────────────────────────────────────────────────────────

export type GpsQualityLevel = 'excellent' | 'good' | 'degraded' | 'poor';

export interface GpsQualitySample {
  t:             number;          // ms
  accuracy:      number | null;   // horizontale Accuracy (m); null = unbrauchbar
  distFromPrevM: number | null;   // Roh-zu-Roh-Distanz zum vorherigen (akzeptierten) Fix
  dtMs:          number | null;   // Roh-zu-Roh-Zeit
  rejected:      boolean;         // vom bestehenden Accuracy-/Speed-Filter verworfen
  rejectReason?: 'accuracy' | 'jump' | null;
  speedMps?:     number | null;   // gemeldete GPS-Geschwindigkeit (für motionConsistency, optional)
}

export interface GpsQualityState {
  score:            number;       // 0..1, geglättet (Hysterese)
  level:            GpsQualityLevel;
  valid:            boolean;      // false während Warmup / zu wenig Evidenz
  components: {
    accuracy:          number;    // robuste Accuracy (Median des Fensters)
    sampleConsistency: number;    // Regelmäßigkeit der Sample-Abstände
    jumpStability:     number;    // implausible Sprünge / rejectete Jumps
    rejectionHealth:   number;    // accepted vs rejected im Fenster
    temporalStability: number;    // Streuung der Accuracy (auch bei ähnlichem Median)
    motionConsistency?: number;   // optional: GPS-Speed vs. Geometrie (nur wenn Bewegung + Speed)
  };
  sampleCount:      number;
  windowDurationMs: number;
  reasons:          string[];
}

export interface GpsQualityConfig {
  windowMs:         number;   // Rolling-Window-Dauer (~12 s bei ~1 Hz)
  maxSamples:       number;   // harte Obergrenze der Historie
  minSamplesValid:  number;   // darunter: valid=false (Warmup / insufficient_data)
  smoothingAlpha:   number;   // EMA-Faktor für den geglätteten Score (Hysterese)
  levelMarginDown:  number;   // Deadband: Downgrade erst, wenn klar unter der Grenze
  accExcellentM:    number;   // Accuracy ≤ diesem Wert → Score 1
  accFloorM:        number;   // Accuracy ≥ diesem Wert → Score ~0
  gapFactor:        number;   // dt > gapFactor × Median-dt zählt als Lücke
  cvTolerance:      number;   // Variationskoeffizient bis hier ist normales Scheduling
  jumpSpeedMps:     number;   // implizite Geschwindigkeit darüber = Sprung (Fuß-Plausibilität)
  accVarScaleM:     number;   // Normierung der Accuracy-Streuung (Std-Abw.)
  motionMinMps:     number;   // darunter „Stillstand" → nicht in motionConsistency (kein Straf-Signal)
}

export const DEFAULT_GPS_QUALITY_CONFIG: GpsQualityConfig = {
  windowMs:         12_000,
  maxSamples:       20,
  minSamplesValid:  4,
  smoothingAlpha:   0.35,
  levelMarginDown:  0.04,
  accExcellentM:    4,
  accFloorM:        35,
  gapFactor:        2.5,
  cvTolerance:      0.5,
  jumpSpeedMps:     8,     // > MAX_SPEED_MPS-Fußbereich; echte Wander-Schritte liegen darunter
  accVarScaleM:     8,
  motionMinMps:     0.3,
};

// Level-Grenzen (an Testdaten kalibriert). Downgrade nur mit Deadband (Hysterese).
const LEVEL_MIN: Record<GpsQualityLevel, number> = {
  excellent: 0.85,
  good:      0.65,
  degraded:  0.45,
  poor:      0,
};
const LEVEL_RANK: Record<GpsQualityLevel, number> = { poor: 0, degraded: 1, good: 2, excellent: 3 };

// Gewichte der Pflicht-Komponenten (Summe = 1). motionConsistency ist optional und
// bewusst NICHT im gewichteten Score (kein Doppelstraf-/Stillstands-Artefakt).
const WEIGHTS = {
  accuracy:          0.30,
  temporalStability: 0.20,
  jumpStability:     0.20,
  rejectionHealth:   0.20,
  sampleConsistency: 0.10,
} as const;

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }
function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN; }
function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length);
}

function levelFromScore(score: number): GpsQualityLevel {
  if (score >= LEVEL_MIN.excellent) return 'excellent';
  if (score >= LEVEL_MIN.good) return 'good';
  if (score >= LEVEL_MIN.degraded) return 'degraded';
  return 'poor';
}

// Accuracy-Score aus dem robusten Median (nicht aus Einzel-Extremwerten).
function accuracyComponent(accs: number[], cfg: GpsQualityConfig): number {
  const med = median(accs);
  if (!Number.isFinite(med)) return 0;
  return clamp01((cfg.accFloorM - med) / (cfg.accFloorM - cfg.accExcellentM));
}

// Regelmäßigkeit der Sample-Abstände: Lücken + Variationskoeffizient. Normales
// Plattform-Jitter (cv ≤ cvTolerance) wird nicht bestraft.
function sampleConsistencyComponent(dts: number[], cfg: GpsQualityConfig): number {
  const valid = dts.filter(d => d > 0);
  if (valid.length < 2) return 1;
  const medDt = median(valid);
  const gaps = valid.filter(d => d > cfg.gapFactor * medDt).length;
  const gapRate = gaps / valid.length;
  const m = mean(valid);
  const cv = m > 0 ? stdev(valid) / m : 0;
  const cvPenalty = clamp01((cv - cfg.cvTolerance) / 1.0);
  return clamp01(1 - 0.7 * gapRate - 0.5 * cvPenalty);
}

// Implausible Sprünge: bereits rejectete Jumps + implizite Übergeschwindigkeit.
function jumpStabilityComponent(samples: GpsQualitySample[], cfg: GpsQualityConfig): number {
  let relevant = 0, jumps = 0;
  for (const s of samples) {
    if (s.rejectReason === 'jump') { relevant++; jumps++; continue; }
    if (s.distFromPrevM != null && s.dtMs != null && s.dtMs > 0) {
      relevant++;
      if (s.distFromPrevM / (s.dtMs / 1000) > cfg.jumpSpeedMps) jumps++;
    }
  }
  if (!relevant) return 1;
  return clamp01(1 - 1.2 * (jumps / relevant));
}

// accepted vs rejected im Fenster (nicht die absolute Zahl; ein Reject wird toleriert).
function rejectionHealthComponent(samples: GpsQualitySample[]): number {
  if (!samples.length) return 1;
  const rej = samples.filter(s => s.rejected).length;
  return clamp01(1 - 0.9 * (rej / samples.length));
}

// Streuung der Accuracy — unterscheidet [3,4,3,4,5] (stabil) von [3,18,4,25,3] (instabil),
// selbst wenn der Median ähnlich wäre.
function temporalStabilityComponent(accs: number[], cfg: GpsQualityConfig): number {
  if (accs.length < 2) return 1;
  return clamp01(1 - stdev(accs) / cfg.accVarScaleM);
}

// Optional: GPS-Speed vs. geometrische Geschwindigkeit. Stillstand/langsames Gehen
// werden AUSGESCHLOSSEN (kein Straf-Signal), nur bewegte Samples zählen.
function motionConsistencyComponent(samples: GpsQualitySample[], cfg: GpsQualityConfig): number | undefined {
  let moving = 0, agree = 0;
  for (const s of samples) {
    if (s.speedMps == null || s.distFromPrevM == null || s.dtMs == null || s.dtMs <= 0) continue;
    const geo = s.distFromPrevM / (s.dtMs / 1000);
    if (geo < cfg.motionMinMps && s.speedMps < cfg.motionMinMps) continue;   // Stillstand → ignorieren
    moving++;
    const tol = Math.max(1.5, 0.6 * Math.max(geo, s.speedMps));
    if (Math.abs(geo - s.speedMps) <= tol) agree++;
  }
  if (moving < 2) return undefined;   // zu wenig Bewegungs-Evidenz → nicht ausweisen
  return clamp01(agree / moving);
}

export interface GpsQualityTracker {
  observe(sample: GpsQualitySample): GpsQualityState;
  current(): GpsQualityState | null;
  reset(): void;
}

export function createGpsQualityTracker(config: GpsQualityConfig = DEFAULT_GPS_QUALITY_CONFIG): GpsQualityTracker {
  const cfg = config;
  let window: GpsQualitySample[] = [];
  let smoothed: number | null = null;
  let level: GpsQualityLevel = 'good';   // neutraler Startpunkt bis genug Evidenz
  let last: GpsQualityState | null = null;

  function prune(nowT: number): void {
    window = window.filter(s => nowT - s.t <= cfg.windowMs);
    if (window.length > cfg.maxSamples) window = window.slice(window.length - cfg.maxSamples);
  }

  function observe(sample: GpsQualitySample): GpsQualityState {
    window.push(sample);
    prune(sample.t);

    const accs = window.map(s => (s.accuracy == null ? cfg.accFloorM : s.accuracy));
    const dts = window.map(s => (s.dtMs == null ? 0 : s.dtMs)).filter(d => d > 0);

    const accuracy = accuracyComponent(accs, cfg);
    const sampleConsistency = sampleConsistencyComponent(dts, cfg);
    const jumpStability = jumpStabilityComponent(window, cfg);
    const rejectionHealth = rejectionHealthComponent(window);
    const temporalStability = temporalStabilityComponent(accs, cfg);
    const motionConsistency = motionConsistencyComponent(window, cfg);

    const rawScore =
      WEIGHTS.accuracy * accuracy +
      WEIGHTS.temporalStability * temporalStability +
      WEIGHTS.jumpStability * jumpStability +
      WEIGHTS.rejectionHealth * rejectionHealth +
      WEIGHTS.sampleConsistency * sampleConsistency;

    // EMA-Glättung → Hysterese: ein Einzel-Ausreißer bewegt den Score nur wenig.
    smoothed = smoothed == null ? rawScore : smoothed + (rawScore - smoothed) * cfg.smoothingAlpha;
    const score = clamp01(smoothed);

    // Level mit Deadband beim Downgrade (kein Flackern good↔degraded).
    const target = levelFromScore(score);
    if (LEVEL_RANK[target] > LEVEL_RANK[level]) {
      level = target;                                   // Upgrade sofort erlaubt
    } else if (LEVEL_RANK[target] < LEVEL_RANK[level]) {
      if (score < LEVEL_MIN[level] - cfg.levelMarginDown) level = target;   // Downgrade nur klar darunter
    }

    const valid = window.length >= cfg.minSamplesValid;

    const reasons: string[] = [];
    if (!valid) reasons.push('insufficient_data');
    if (accuracy < 0.6) reasons.push('accuracy');
    if (temporalStability < 0.6) reasons.push('accuracy_variance');
    if (jumpStability < 0.6) reasons.push('jumps');
    if (rejectionHealth < 0.6) reasons.push('reject_rate');
    if (sampleConsistency < 0.6) reasons.push('irregular_sampling');

    const windowDurationMs = window.length ? sample.t - window[0].t : 0;

    last = {
      score, level, valid,
      components: {
        accuracy, sampleConsistency, jumpStability, rejectionHealth, temporalStability,
        ...(motionConsistency === undefined ? {} : { motionConsistency }),
      },
      sampleCount: window.length,
      windowDurationMs,
      reasons,
    };
    return last;
  }

  return {
    observe,
    current() { return last; },
    reset() { window = []; smoothed = null; level = 'good'; last = null; },
  };
}
