// ──────────────────────────────────────────────────────────────────────────
// Track Analytics Engine (Punkt 10/11/13) — REIN deterministisch, KEINE KI,
// keine erfundenen Punktemaxima. Nimmt ausschliesslich In-Session-Daten
// (Abweichungs-Samples, Ecken/Gegenstände aus den bestehenden Markern, Breaks)
// entgegen — KEINE gespeicherten Rohpunkte (payload_json.run speichert nur
// {lat,lng}, siehe localTrackRun.ts, dafür nicht reichhaltig genug).
//
// WICHTIG (Punkt 9): "Track Score" (hier: trackScore) und "Analysis
// Confidence" (analysisConfidence) sind STRIKT getrennt. Schlechtes GPS/
// niedrige Motion-Confidence senkt NIE trackScore — es senkt ausschliesslich
// analysisConfidence und schaltet einen erklärenden UI-Hinweis frei
// (analysisConfidenceHint). trackScore ist additiv und ersetzt NICHT das
// bestehende, manuelle Pro-Schenkel-Scoring (trackEvaluation.ts) — beide
// Systeme existieren unabhängig nebeneinander.
// ──────────────────────────────────────────────────────────────────────────

export const ANALYTICS_VERSION = 1 as const;

// Dieselbe Abweichungs-Konvention wie useSearchRecorder.computeScore (FULL_DEV_M/
// ZERO_DEV_M) — eine Quelle der Wahrheit für "was gilt als gut/schlecht auf der
// Fährte", kein zweiter, abweichender Massstab. Exportiert, damit
// trackSegmentAnalysis.ts (Segment-Zonen/-Score) dieselben Konstanten
// wiederverwendet, statt eigene, abweichende Grenzen zu erfinden (Punkt 3/14
// der Segmentanalyse-Nachbesserung).
export const FULL_DEV_M = 1.5;
export const ZERO_DEV_M = 10;
export const ON_TRACK_M = 3.0;          // wie useSearchRecorder ON_TRACK_M
export const RELIABLE_CONFIDENCE_FLOOR = 0.5;   // ab hier zählt ein Sample für "maxReliableM"/Score

export const CORNER_WINDOW_BEFORE_M = 8;
export const CORNER_WINDOW_AFTER_M = 15;
const CORNER_ARRIVAL_TOLERANCE_M = 3;
const CORNER_DEV_FULL_M = 1.0;
const CORNER_DEV_ZERO_M = 8;
const CORNER_OVERSHOOT_ZERO_M = 10;

export const OBJECT_AREA_M = 2.5;       // wie useSearchRecorder OBJECT_HIT_M
const OBJECT_STATIONARY_MIN_S = 1.5;

// ── Eingaben ──────────────────────────────────────────────────────────────

export interface AnalyticsSample {
  /** Handler-Fortschritt entlang der Soll-Fährte (Bogenlänge, m) zum Zeitpunkt dieses Fixes. */
  atM: number;
  /** Sekunden seit Absuche-Start. */
  tSec: number;
  /** Seitliche Abweichung zur Soll-Fährte (m) zu diesem Zeitpunkt. */
  devM: number;
  /**
   * 0..1 — Fusion-/GPS-Confidence dieses Fixes (aus trackFusionEngine, falls
   * verdrahtet; sonst 1 für jeden akzeptierten Fix — reines gps_only-Verhalten
   * bleibt dadurch identisch zum bisherigen, ungewichteten Score).
   */
  confidence: number;
  /** m/s, falls von der Plattform geliefert; sonst null (wird aus atM/tSec-Deltas geschätzt). */
  speedMps: number | null;
}

// Bewusst lokal deklariert (kein Import aus trackingStore) — reines,
// abhängigkeitsfreies Engine-Modul, gleiches Prinzip wie searchStartAcquisition.ts.
// 'absatz'/'abriss' bewusst NICHT Teil dieser Union: das sind kein Winkel für
// die Analytics (Start-/Endmarker bzw. bereits über `breaks` abgedeckter Abriss)
// — der Aufrufer filtert sie vor dem Bau von AnalyticsCorner[] heraus.
export type AnalyticsAngleKind = 'links' | 'rechts' | 'spitz_links' | 'spitz_rechts' | 'spitz' | 'gw' | 'ow' | 'bw';

export interface AnalyticsCornerInput {
  atM: number;
  angleKind: AnalyticsAngleKind;
}

export interface AnalyticsObjectInput {
  atM: number;
  material: string | null;
  found: boolean;
}

export interface AnalyticsBreakInput {
  /** Sekunden seit Absuche-Start, an dem der Hund/die virtuelle Position den äusseren Korridor tatsächlich verlassen hat. */
  startedAtSec: number;
  /** Sekunden seit Absuche-Start, an dem die Position wieder stabil im inneren Korridor war — `null`, wenn die Session im Abriss endete (kein Recovery). */
  recoveredAtSec: number | null;
  /** `recoveredAtSec - startedAtSec`, nur gesetzt wenn `recoveredAtSec` vorhanden. Redundant zu recoveredAtSec/startedAtSec mitgegeben, damit der Aufrufer die Berechnung nicht duplizieren muss. */
  durationSec: number | null;
}

export interface TrackAnalyticsInput {
  samples: AnalyticsSample[];          // zeitlich aufsteigend sortiert erwartet
  corners: AnalyticsCornerInput[];
  objects: AnalyticsObjectInput[];
  breaks: AnalyticsBreakInput[];
  trackLengthM: number;
  durationS: number;
}

// ── Ausgaben ──────────────────────────────────────────────────────────────

export type ConfidenceBand = 'excellent' | 'good' | 'limited' | 'unreliable';

export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.90) return 'excellent';
  if (confidence >= 0.75) return 'good';
  if (confidence >= 0.50) return 'limited';
  return 'unreliable';
}

export interface DeviationStats {
  meanM: number;
  medianM: number;
  p95M: number;
  /** Nur über Samples mit confidence >= RELIABLE_CONFIDENCE_FLOOR — ein einzelner unsicherer GPS-Spike darf den Maximalwert nicht dominieren. */
  maxReliableM: number;
  /** Diagnostisch, inkl. unsicherer Punkte. */
  maxRawM: number;
  timeWithinM15S: number;
  timeWithinM2S: number;
  timeOutsideM3S: number;
  timeOutsideM5S: number;
}

export type CornerSide = 'links' | 'rechts' | 'unbekannt';
export type CornerSharpness = 'rechtwinklig' | 'spitz' | 'unbekannt';

export interface CornerAnalysis {
  atM: number;
  side: CornerSide;
  sharpness: CornerSharpness;
  arrivalTSec: number | null;
  speedBeforeMps: number | null;
  minDistanceM: number | null;
  maxLateralDeviationM: number | null;
  overshootM: number | null;
  reacquisitionSec: number | null;
}

export interface ObjectAnalysis {
  atM: number;
  material: string | null;
  found: boolean;
  minDistanceM: number | null;
  approachSpeedMps: number | null;
  timeInAreaSec: number;
  behavior: 'stationary' | 'walked_past' | 'unbekannt';
}

export interface ReacquisitionStats {
  /** Alle Breaks, inkl. noch offener (nicht erholter) am Session-Ende. */
  count: number;
  /** Nur Breaks mit echter Recovery — Basis für meanSec/maxSec/medianSec. */
  completedCount: number;
  meanSec: number | null;
  maxSec: number | null;
  /** Optional (Punkt 1: "nur wenn sinnvoll und ohne UI-Aufblähung") — wird berechnet, aber aktuell nicht in der UI angezeigt. */
  medianSec: number | null;
}

export interface PaceStats {
  avgMps: number;
  medianMps: number;
  /** 0..1 — 1 = sehr gleichmässiges Tempo (niedrige Streuung relativ zum Mittel). Unempfindlich gegen kurze Stillstands-Jitter (siehe computePace). */
  consistency: number;
}

export interface TrackAnalytics {
  analyticsVersion: typeof ANALYTICS_VERSION;
  analysisConfidence: number;
  analysisConfidenceBand: ConfidenceBand;
  /** Nur gesetzt, wenn analysisConfidenceBand 'limited'/'unreliable' ist (Punkt 9). */
  analysisConfidenceHint: string | null;
  deviation: DeviationStats;
  corners: CornerAnalysis[];
  objects: ObjectAnalysis[];
  reacquisition: ReacquisitionStats;
  pace: PaceStats;
  /** 0..100 — Track Score 2.0, additiv, unabhängig von trackEvaluation.ts. */
  trackScore: number;
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }

function weightedMean(values: number[], weights: number[]): number {
  let sw = 0, swx = 0;
  for (let i = 0; i < values.length; i++) { sw += weights[i]; swx += values[i] * weights[i]; }
  return sw > 0 ? swx / sw : 0;
}

// Gewichteter Perzentil-Schätzer: Werte nach Grösse sortiert, kumulatives
// Gewicht bis zur Ziel-Fraktion aufsummiert. Reduziert sich bei gleichem
// Gewicht (=1) auf den gewöhnlichen Perzentil-Nearest-Rank.
function weightedPercentile(values: number[], weights: number[], p: number): number {
  if (!values.length) return 0;
  const idx = values.map((v, i) => i).sort((a, b) => values[a] - values[b]);
  const totalW = weights.reduce((a, b) => a + b, 0);
  if (totalW <= 0) return values[idx[Math.floor((values.length - 1) * p)]];
  const target = totalW * p;
  let acc = 0;
  for (const i of idx) {
    acc += weights[i];
    if (acc >= target) return values[i];
  }
  return values[idx[idx.length - 1]];
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ── Abweichungsstatistik ──────────────────────────────────────────────────

export function computeDeviationStats(samples: AnalyticsSample[]): DeviationStats {
  if (!samples.length) {
    return { meanM: 0, medianM: 0, p95M: 0, maxReliableM: 0, maxRawM: 0, timeWithinM15S: 0, timeWithinM2S: 0, timeOutsideM3S: 0, timeOutsideM5S: 0 };
  }
  const devs = samples.map(s => s.devM);
  const weights = samples.map(s => Math.max(0.05, s.confidence));   // nie ganz 0 — ein Sample bleibt immer minimal repräsentiert
  const meanM = weightedMean(devs, weights);
  const medianM = median(devs);
  const p95M = weightedPercentile(devs, weights, 0.95);
  const reliable = samples.filter(s => s.confidence >= RELIABLE_CONFIDENCE_FLOOR);
  const maxReliableM = reliable.length ? Math.max(...reliable.map(s => s.devM)) : Math.max(...devs);
  const maxRawM = Math.max(...devs);

  let timeWithin15 = 0, timeWithin2 = 0, timeOutside3 = 0, timeOutside5 = 0, totalT = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = Math.max(0, samples[i].tSec - samples[i - 1].tSec);
    if (dt <= 0) continue;
    const w = Math.max(0.05, samples[i].confidence);
    const wt = dt * w;
    totalT += wt;
    if (samples[i].devM <= 1.5) timeWithin15 += wt;
    if (samples[i].devM <= 2.0) timeWithin2 += wt;
    if (samples[i].devM > 3.0) timeOutside3 += wt;
    if (samples[i].devM > 5.0) timeOutside5 += wt;
  }
  const totalDurationS = samples.length > 1 ? samples[samples.length - 1].tSec - samples[0].tSec : 0;
  // Gewichtete Fraktion auf die tatsächliche Gesamtdauer zurückskaliert — bei
  // durchgängig confidence=1 (kein Fusion-Signal) identisch zur reinen, ungewichteten Zeit.
  const scale = totalT > 0 ? totalDurationS / totalT : 0;
  return {
    meanM: round1(meanM), medianM: round1(medianM), p95M: round1(p95M),
    maxReliableM: round1(maxReliableM), maxRawM: round1(maxRawM),
    timeWithinM15S: round1(timeWithin15 * scale), timeWithinM2S: round1(timeWithin2 * scale),
    timeOutsideM3S: round1(timeOutside3 * scale), timeOutsideM5S: round1(timeOutside5 * scale),
  };
}

function round1(x: number): number { return Math.round(x * 10) / 10; }

// ── Eckenanalyse ──────────────────────────────────────────────────────────

function cornerSideSharpness(kind: AnalyticsAngleKind): { side: CornerSide; sharpness: CornerSharpness } {
  switch (kind) {
    case 'links': return { side: 'links', sharpness: 'rechtwinklig' };
    case 'rechts': return { side: 'rechts', sharpness: 'rechtwinklig' };
    case 'spitz_links': return { side: 'links', sharpness: 'spitz' };
    case 'spitz_rechts': return { side: 'rechts', sharpness: 'spitz' };
    case 'spitz': return { side: 'unbekannt', sharpness: 'spitz' };
    default: return { side: 'unbekannt', sharpness: 'unbekannt' };   // gw/ow/bw — Fachwinkel ohne feste Schärfe-Zuordnung
  }
}

export function analyzeCorners(samples: AnalyticsSample[], corners: AnalyticsCornerInput[]): CornerAnalysis[] {
  return corners.map(corner => {
    const { side, sharpness } = cornerSideSharpness(corner.angleKind);
    const window = samples.filter(s => s.atM >= corner.atM - CORNER_WINDOW_BEFORE_M && s.atM <= corner.atM + CORNER_WINDOW_AFTER_M);
    if (!window.length) {
      return { atM: corner.atM, side, sharpness, arrivalTSec: null, speedBeforeMps: null, minDistanceM: null, maxLateralDeviationM: null, overshootM: null, reacquisitionSec: null };
    }

    // Nächster Sample zur Eckenposition (Bogenlänge) — Näherung der realen
    // Distanz über Längs- (atM-Differenz) und Querabweichung (devM) kombiniert.
    let nearest = window[0], nearestDist = Infinity;
    for (const s of window) {
      const dist = Math.hypot(s.atM - corner.atM, s.devM);
      if (dist < nearestDist) { nearestDist = dist; nearest = s; }
    }
    const arrivalTSec = nearestDist <= CORNER_ARRIVAL_TOLERANCE_M + CORNER_WINDOW_BEFORE_M ? nearest.tSec : null;
    const minDistanceM = round1(nearestDist);
    const maxLateralDeviationM = round1(Math.max(...window.map(s => s.devM)));

    const before = window.filter(s => s.atM < corner.atM);
    const speedBeforeMps = estimateAverageSpeed(before);

    // Overshoot/Re-Acquisition: nach der Ecke — gab es eine Abweichungsspitze
    // über ON_TRACK_M, die erst später wieder abklingt?
    const after = window.filter(s => s.atM >= corner.atM).sort((a, b) => a.atM - b.atM);
    let overshootM: number | null = 0;
    let reacquisitionSec: number | null = 0;
    let excursionStart: AnalyticsSample | null = null;
    for (const s of after) {
      if (!excursionStart) {
        if (s.devM > ON_TRACK_M) excursionStart = s;
      } else if (s.devM <= ON_TRACK_M) {
        overshootM = round1(s.atM - corner.atM);
        reacquisitionSec = round1(s.tSec - excursionStart.tSec);
        excursionStart = null;
        break;
      }
    }
    if (excursionStart) { overshootM = null; reacquisitionSec = null; }   // Ausflug erkannt, aber Fenster endet, bevor er endet — nicht bestimmbar

    return { atM: corner.atM, side, sharpness, arrivalTSec, speedBeforeMps, minDistanceM, maxLateralDeviationM, overshootM, reacquisitionSec };
  });
}

function estimateAverageSpeed(samples: AnalyticsSample[]): number | null {
  if (samples.length < 2) return samples[0]?.speedMps ?? null;
  const withSpeed = samples.filter(s => s.speedMps != null);
  if (withSpeed.length >= 2) {
    const sum = withSpeed.reduce((a, s) => a + (s.speedMps as number), 0);
    return round2(sum / withSpeed.length);
  }
  // Fallback: aus atM/tSec-Deltas geschätzt.
  let distSum = 0, timeSum = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].tSec - samples[i - 1].tSec;
    if (dt <= 0) continue;
    distSum += Math.max(0, samples[i].atM - samples[i - 1].atM);
    timeSum += dt;
  }
  return timeSum > 0 ? round2(distSum / timeSum) : null;
}

function round2(x: number): number { return Math.round(x * 100) / 100; }

// ── Gegenstandsanalyse ────────────────────────────────────────────────────

export function analyzeObjects(samples: AnalyticsSample[], objects: AnalyticsObjectInput[]): ObjectAnalysis[] {
  return objects.map(obj => {
    const window = samples.filter(s => Math.abs(s.atM - obj.atM) <= CORNER_WINDOW_BEFORE_M);
    if (!window.length) {
      return { atM: obj.atM, material: obj.material, found: obj.found, minDistanceM: null, approachSpeedMps: null, timeInAreaSec: 0, behavior: 'unbekannt' };
    }
    const dists = window.map(s => Math.hypot(s.atM - obj.atM, s.devM));
    const minDistanceM = round1(Math.min(...dists));
    const before = window.filter(s => s.atM < obj.atM);
    const approachSpeedMps = estimateAverageSpeed(before);

    const inArea = window.filter((s, i) => dists[i] <= OBJECT_AREA_M);
    let timeInAreaSec = 0;
    for (let i = 1; i < inArea.length; i++) {
      const dt = inArea[i].tSec - inArea[i - 1].tSec;
      if (dt > 0 && dt < 5) timeInAreaSec += dt;   // >5s Lücke = separate Annäherung, nicht dieselbe Verweildauer
    }
    const behavior: ObjectAnalysis['behavior'] = !inArea.length
      ? 'unbekannt'
      : timeInAreaSec >= OBJECT_STATIONARY_MIN_S ? 'stationary' : 'walked_past';

    return { atM: obj.atM, material: obj.material, found: obj.found, minDistanceM, approachSpeedMps, timeInAreaSec: round1(timeInAreaSec), behavior };
  });
}

// ── Re-Acquisition (aus breaks) ───────────────────────────────────────────

// Punkt 1: count zählt ALLE Breaks (inkl. offener, nicht erholter am Session-
// Ende — die dürfen `count` sinnvoll beeinflussen). meanSec/maxSec/medianSec
// werden NUR aus abgeschlossenen Breaks (durationSec != null) berechnet — ein
// offener Break geht NIE als (unvollständige) Dauer in den Durchschnitt ein.
export function computeReacquisitionStats(breaks: AnalyticsBreakInput[]): ReacquisitionStats {
  if (!breaks.length) return { count: 0, completedCount: 0, meanSec: null, maxSec: null, medianSec: null };
  const durations = breaks
    .filter((b): b is AnalyticsBreakInput & { durationSec: number } => b.durationSec != null)
    .map(b => b.durationSec);
  if (!durations.length) return { count: breaks.length, completedCount: 0, meanSec: null, maxSec: null, medianSec: null };
  const meanSec = round1(durations.reduce((a, b) => a + b, 0) / durations.length);
  const maxSec = round1(Math.max(...durations));
  const medianSec = round1(median(durations));
  return { count: breaks.length, completedCount: durations.length, meanSec, maxSec, medianSec };
}

// ── Tempo ─────────────────────────────────────────────────────────────────

// Mindest-Zeitfenster (s) pro Tempo-Sample. Ein einzelner verrauschter Fix
// (Cursor-/GPS-Jitter genau während eines kurzen Stillstands: minimal
// negatives oder winzig positives Delta über ~1 s) würde als eigener, stark
// abweichender Geschwindigkeitswert in die Statistik einfliessen und
// "Konsistenz" künstlich verschlechtern — Distanz/Zeit werden deshalb so
// lange akkumuliert, bis ein plausibles Zeitfenster erreicht ist, BEVOR ein
// Geschwindigkeits-Sample gebildet wird.
const PACE_MIN_WINDOW_S = 2;

export function computePace(samples: AnalyticsSample[]): PaceStats {
  if (samples.length < 2) return { avgMps: 0, medianMps: 0, consistency: 1 };
  const speeds: number[] = [];
  let distAcc = 0, timeAcc = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].tSec - samples[i - 1].tSec;
    if (dt <= 0) continue;
    const dAt = samples[i].atM - samples[i - 1].atM;
    // Rückwärts-Rauschen (Cursor-/GPS-Jitter) zählt weder als Distanz noch als Zeit.
    if (dAt < 0) continue;
    distAcc += dAt; timeAcc += dt;
    if (timeAcc >= PACE_MIN_WINDOW_S) {
      speeds.push(distAcc / timeAcc);
      distAcc = 0; timeAcc = 0;
    }
  }
  if (timeAcc > 0) speeds.push(distAcc / timeAcc);   // Rest des letzten, kürzeren Fensters
  if (!speeds.length) return { avgMps: 0, medianMps: 0, consistency: 1 };
  const avg = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  const med = median(speeds);
  const variance = speeds.reduce((a, s) => a + (s - avg) ** 2, 0) / speeds.length;
  const sd = Math.sqrt(variance);
  // Variationskoeffizient invertiert auf 0..1 — 0 Streuung → consistency 1.
  const cv = avg > 0 ? sd / avg : 0;
  const consistency = clamp01(1 - Math.min(1, cv));
  return { avgMps: round2(avg), medianMps: round2(med), consistency: round2(consistency) };
}

// ── Track Score 2.0 ───────────────────────────────────────────────────────

const SCORE_WEIGHTS_DEFAULT = { spurtreue: 40, winkel: 25, gegenstaende: 15, reacquisition: 10, tempo: 10 } as const;

function spurtreueScore(dev: DeviationStats): number {
  return Math.round(100 * clamp01((ZERO_DEV_M - dev.meanM) / (ZERO_DEV_M - FULL_DEV_M)));
}

function winkelScore(corners: CornerAnalysis[]): number | null {
  if (!corners.length) return null;
  const perCorner = corners.map(c => {
    const devScore = c.maxLateralDeviationM == null ? 0.5 : clamp01((CORNER_DEV_ZERO_M - c.maxLateralDeviationM) / (CORNER_DEV_ZERO_M - CORNER_DEV_FULL_M));
    const overshootScore = c.overshootM == null ? 0.5 : clamp01(1 - c.overshootM / CORNER_OVERSHOOT_ZERO_M);
    return (devScore + overshootScore) / 2;
  });
  return Math.round(100 * (perCorner.reduce((a, b) => a + b, 0) / perCorner.length));
}

function gegenstaendeScore(objects: ObjectAnalysis[]): number | null {
  if (!objects.length) return null;
  const found = objects.filter(o => o.found).length;
  return Math.round(100 * (found / objects.length));
}

function reacquisitionScore(reacq: ReacquisitionStats): number {
  return Math.round(Math.max(0, 100 - reacq.count * 8));
}

function tempoScore(pace: PaceStats): number {
  return Math.round(100 * pace.consistency);
}

// Gewichte nur über TATSÄCHLICH anwendbare Kategorien normalisiert (Punkt 11:
// "darf fehlende Gegenstände/eckenlose Fährten/schlechtes GPS nicht bestrafen").
// Fehlt eine Kategorie (keine Ecken/keine Gegenstände auf dieser Fährte),
// verteilt sich ihr Gewicht proportional auf die übrigen — die Fährte wird NIE
// schlechter bewertet, nur weil es z. B. nichts zu verweisen gab.
function computeTrackScore(dev: DeviationStats, corners: CornerAnalysis[], objects: ObjectAnalysis[], reacq: ReacquisitionStats, pace: PaceStats): number {
  const raw: Record<string, number | null> = {
    spurtreue: spurtreueScore(dev),
    winkel: winkelScore(corners),
    gegenstaende: gegenstaendeScore(objects),
    reacquisition: reacquisitionScore(reacq),
    tempo: tempoScore(pace),
  };
  const applicableWeight = (Object.keys(raw) as (keyof typeof SCORE_WEIGHTS_DEFAULT)[])
    .filter(k => raw[k] != null)
    .reduce((sum, k) => sum + SCORE_WEIGHTS_DEFAULT[k], 0);
  if (applicableWeight <= 0) return 0;
  let score = 0;
  for (const k of Object.keys(raw) as (keyof typeof SCORE_WEIGHTS_DEFAULT)[]) {
    const v = raw[k];
    if (v == null) continue;
    score += v * (SCORE_WEIGHTS_DEFAULT[k] / applicableWeight);
  }
  return Math.round(Math.max(0, Math.min(100, score)));
}

// ── Analysis Confidence (Punkt 8/9) ───────────────────────────────────────

const CONFIDENCE_HINTS: Record<ConfidenceBand, string | null> = {
  excellent: null,
  good: null,
  limited: 'Die GPS-/Sensor-Grundlage für diese Analyse war eingeschränkt. Der Track Score des Hundes ist davon nicht betroffen — er bewertet weiterhin ausschliesslich die tatsächliche Fährtenarbeit.',
  unreliable: 'Die GPS-/Sensor-Grundlage für diese Analyse war unzuverlässig. Einzelne Analyse-Details (z. B. Eckenwerte) können ungenau sein — der Track Score des Hundes ist davon unabhängig und nicht herabgesetzt.',
};

// Root-Cause-Fix (echtes iPhone, Build 43 — "100 Punkte/Vorzüglich trotz 0 m
// Suchspur, 0 Winkel, 0 Teilstrecken"): bei GAR KEINEN Samples (Absuche hat
// keine verwertbare Geometrie erzeugt) wurde bisher `1` (== 'excellent',
// höchste Konfidenz) zurückgegeben — exakt das Gegenteil der Realität.
// „Keine Daten" muss die NIEDRIGSTE Konfidenz sein, nicht die höchste, sonst
// zeigt die Auswertung fälschlich "Analyse-Grundlage: sehr gut" für eine
// Absuche, die de facto nie stattgefunden hat.
function computeAnalysisConfidence(samples: AnalyticsSample[]): number {
  if (!samples.length) return 0;
  let sw = 0, swx = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = Math.max(0.1, samples[i].tSec - samples[i - 1].tSec);
    sw += dt; swx += dt * samples[i].confidence;
  }
  if (sw === 0) return clamp01(samples[0].confidence);
  return clamp01(swx / sw);
}

// ── Öffentliche Hauptfunktion ─────────────────────────────────────────────

export function computeTrackAnalytics(input: TrackAnalyticsInput): TrackAnalytics {
  const deviation = computeDeviationStats(input.samples);
  const corners = analyzeCorners(input.samples, input.corners);
  const objects = analyzeObjects(input.samples, input.objects);
  const reacquisition = computeReacquisitionStats(input.breaks);
  const pace = computePace(input.samples);
  // Root-Cause-Fix (echtes iPhone, Build 43 — "100 Punkte/Vorzüglich trotz
  // 0 m Suchspur"): spurtreueScore/tempoScore/reacquisitionScore sind bewusst
  // NICHT nullable (anders als winkelScore/gegenstaendeScore) — "keine Ecken"
  // und "keine Gegenstände" sollen die Fährte zurecht NICHT bestrafen, aber
  // "0 m Abweichung"/"0 Breaks"/"perfekte Pace-Konsistenz" aus schlicht LEEREN
  // Samples ist keine echte Leistung, sondern Abwesenheit jeder Daten — ohne
  // diesen Guard ergäbe computeTrackScore trotzdem ~100, obwohl gar keine
  // Absuche-Geometrie vorlag. Betrifft NUR den Fall "überhaupt keine Samples"
  // — eine echte Absuche mit z. B. 0 Ecken/0 Gegenständen bleibt unverändert
  // unbestraft (siehe winkelScore/gegenstaendeScore, dort weiterhin nullable).
  const trackScore = input.samples.length === 0 ? 0 : computeTrackScore(deviation, corners, objects, reacquisition, pace);
  const analysisConfidence = computeAnalysisConfidence(input.samples);
  const band = confidenceBand(analysisConfidence);

  return {
    analyticsVersion: ANALYTICS_VERSION,
    analysisConfidence: round2(analysisConfidence),
    analysisConfidenceBand: band,
    analysisConfidenceHint: CONFIDENCE_HINTS[band],
    deviation, corners, objects, reacquisition, pace, trackScore,
  };
}
