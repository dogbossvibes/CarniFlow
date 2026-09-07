// ──────────────────────────────────────────────────────────────────────────
// Track Segment Analysis — REIN deterministisch, KEINE KI. Zerlegt eine
// Absuche nachträglich in logische Abschnitte (Start/Gerade/Winkel/
// Gegenstandszone/Neuaufnahme/Ziel) für Replay-Timeline, Segment-Detailkarten
// und Highlights.
//
// WICHTIG: baut AUSSCHLIESSLICH auf den bereits von trackAnalytics.ts
// berechneten Bausteinen auf (AnalyticsSample[], CornerAnalysis[],
// ObjectAnalysis[], Break-Zeitstempel) — keine zweite, abweichende
// Winkel-/Gegenstandsanalyse, keine neue Datenquelle. Zonen-Konstanten sind
// dieselben wie in trackAnalytics.ts (CORNER_WINDOW_BEFORE_M/AFTER_M/
// OBJECT_AREA_M) — eine Quelle der Wahrheit.
// ──────────────────────────────────────────────────────────────────────────

import {
  computeDeviationStats, confidenceBand, computeTrackAnalytics,
  CORNER_WINDOW_BEFORE_M, CORNER_WINDOW_AFTER_M,
  FULL_DEV_M, ZERO_DEV_M,
  type AnalyticsSample, type CornerAnalysis, type ObjectAnalysis,
  type AnalyticsBreakInput, type ConfidenceBand,
  type TrackAnalytics, type TrackAnalyticsInput,
} from '@/features/tracking/engine/trackAnalytics';

// ── Zonen-Konstanten (Punkt 3: zentral, dokumentiert, nicht verstreut) ─────

/** Bogenlänge der Start-Zone ab Bogenlänge 0 (m). */
export const START_ZONE_M = 5;
/** Bogenlänge der Ziel-Zone vor dem Fährtenende (m). */
export const FINISH_ZONE_M = 5;
/** Winkelzone: identisch zu trackAnalytics' CORNER_WINDOW_BEFORE_M/AFTER_M — eine Quelle der Wahrheit. */
export const CORNER_ZONE_BEFORE_M = CORNER_WINDOW_BEFORE_M;
export const CORNER_ZONE_AFTER_M = CORNER_WINDOW_AFTER_M;
/** Gegenstandszone: symmetrisch um die Gegenstandsposition, identisch zu analyzeObjects' Suchfenster. */
export const OBJECT_ZONE_RADIUS_M = CORNER_WINDOW_BEFORE_M;
/** Score-Skala für Re-Acquisition-Segmente: ab dieser Dauer (s) gilt der Score als 0. */
export const REACQUISITION_SCORE_ZERO_S = 20;

// ── Typen ────────────────────────────────────────────────────────────────

// Bewusst NICHT "TrackSegment"/"TrackSegmentType" genannt: diese Namen sind
// bereits vom Lege-Planungssystem belegt (features/tracking/utils/
// trackSegments.ts — "Teilstrecken" wie no_food/distraction/custom, ein
// komplett anderes Konzept: geplante Fütterungs-/Trainingsabschnitte beim
// Legen, keine geometrische Nachanalyse der Absuche). "Analytics"-Präfix
// passend zum Rest dieser Datei (AnalyticsSample/AnalyticsCornerInput/…).
export type AnalyticsSegmentType = 'straight' | 'corner' | 'object_zone' | 'reacquisition' | 'start' | 'finish';

export interface AnalyticsSegment {
  id: string;
  index: number;
  type: AnalyticsSegmentType;

  startDistanceM: number;
  endDistanceM: number;
  lengthM: number;

  startTimeSec: number | null;
  endTimeSec: number | null;
  durationSec: number | null;

  meanDeviationM: number | null;
  medianDeviationM: number | null;
  p95DeviationM: number | null;
  maxDeviationM: number | null;
  /** Sekunden innerhalb 1.5 m / 2 m — dieselbe Konvention wie DeviationStats. */
  timeWithinM15S: number | null;
  timeWithinM2S: number | null;
  /** Sekunden ausserhalb 3 m / 5 m. */
  timeOutsideM3S: number | null;
  timeOutsideM5S: number | null;

  averageSpeedMps: number | null;
  /** 0..1 — 1 = sehr gleichmässiges Tempo, dieselbe Definition wie PaceStats.consistency. */
  speedConsistency: number | null;
  analysisConfidence: number;
  analysisConfidenceBand: ConfidenceBand;

  /** 0..100 — additiv, unabhängig von der Analysis Confidence (Punkt 5/9). `null`, wenn keine anwendbare Metrik vorliegt (z. B. 0 Samples). */
  score: number | null;

  /** Index in TrackAnalytics.corners — nur bei type === 'corner'. */
  cornerIndex?: number;
  /** Index in TrackAnalytics.objects — nur bei type === 'object_zone'. */
  objectIndex?: number;
}

export interface SegmentationCornerInput { atM: number }
export interface SegmentationObjectInput { atM: number }

export interface TrackSegmentationInput {
  samples: AnalyticsSample[];
  corners: SegmentationCornerInput[];
  cornerAnalysis: CornerAnalysis[];       // gleiche Reihenfolge/Länge wie `corners` (1:1, aus trackAnalytics.analyzeCorners)
  objects: SegmentationObjectInput[];
  objectAnalysis: ObjectAnalysis[];       // gleiche Reihenfolge/Länge wie `objects` (1:1, aus trackAnalytics.analyzeObjects)
  breaks: AnalyticsBreakInput[];
  trackLengthM: number;
}

// ── Hilfsfunktionen ─────────────────────────────────────────────────────

function round1(x: number): number { return Math.round(x * 10) / 10; }
function round2(x: number): number { return Math.round(x * 100) / 100; }
function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }

// Bogenlänge (atM) zu einem Zeitpunkt (tSec) — lineare Interpolation zwischen
// den beiden umgebenden Samples. Nur für die Platzierung von Re-Acquisition-
// Segmenten gebraucht (Breaks kennen Zeit, keine Bogenlänge). `null`, wenn
// ausserhalb des Sample-Zeitraums nicht bestimmbar.
function atMAtTime(samples: AnalyticsSample[], tSec: number): number | null {
  if (!samples.length) return null;
  if (tSec <= samples[0].tSec) return samples[0].atM;
  if (tSec >= samples[samples.length - 1].tSec) return samples[samples.length - 1].atM;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].tSec >= tSec) {
      const a = samples[i - 1], b = samples[i];
      const span = b.tSec - a.tSec;
      const t = span > 0 ? (tSec - a.tSec) / span : 0;
      return a.atM + (b.atM - a.atM) * t;
    }
  }
  return samples[samples.length - 1].atM;
}

function samplesInRange(samples: AnalyticsSample[], startM: number, endM: number): AnalyticsSample[] {
  return samples.filter(s => s.atM >= startM && s.atM <= endM);
}

function timeRange(samples: AnalyticsSample[]): { startTimeSec: number | null; endTimeSec: number | null; durationSec: number | null } {
  if (!samples.length) return { startTimeSec: null, endTimeSec: null, durationSec: null };
  const startTimeSec = samples[0].tSec, endTimeSec = samples[samples.length - 1].tSec;
  return { startTimeSec: round1(startTimeSec), endTimeSec: round1(endTimeSec), durationSec: round1(Math.max(0, endTimeSec - startTimeSec)) };
}

// Durchschnittstempo + Tempokonstanz für ein Segment — dieselbe Definition
// wie computePace, aber auf ein Bogenlängen-Fenster begrenzt (kein neuer
// Algorithmus, nur ein engerer Input).
function segmentPace(samples: AnalyticsSample[]): { averageSpeedMps: number | null; speedConsistency: number | null } {
  if (samples.length < 2) return { averageSpeedMps: null, speedConsistency: null };
  const speeds: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].tSec - samples[i - 1].tSec;
    if (dt <= 0) continue;
    const dAt = samples[i].atM - samples[i - 1].atM;
    if (dAt < 0) continue;
    speeds.push(dAt / dt);
  }
  if (!speeds.length) return { averageSpeedMps: null, speedConsistency: null };
  const avg = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  const variance = speeds.reduce((a, s) => a + (s - avg) ** 2, 0) / speeds.length;
  const sd = Math.sqrt(variance);
  const cv = avg > 0 ? sd / avg : 0;
  return { averageSpeedMps: round2(avg), speedConsistency: round2(clamp01(1 - Math.min(1, cv))) };
}

function confidenceForSegment(samples: AnalyticsSample[]): number {
  if (!samples.length) return 1;   // "nichts gemessen" ≠ "schlecht" — dieselbe Konvention wie computeAnalysisConfidence([])
  let sw = 0, swx = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = Math.max(0.1, samples[i].tSec - samples[i - 1].tSec);
    sw += dt; swx += dt * samples[i].confidence;
  }
  if (sw === 0) return clamp01(samples[0].confidence);
  return clamp01(swx / sw);
}

// Deterministischer Segment-Score aus der lokalen Abweichung — dieselbe
// Formel/Skala wie trackAnalytics' spurtreueScore (FULL_DEV_M/ZERO_DEV_M),
// EIN Massstab für "gute Spurtreue" im ganzen System.
function deviationScore(meanM: number): number {
  return Math.round(100 * clamp01((ZERO_DEV_M - meanM) / (ZERO_DEV_M - FULL_DEV_M)));
}

// ── Kern: Metriken für ein Bogenlängen-Fenster ─────────────────────────

interface SegmentMetrics {
  meanDeviationM: number | null; medianDeviationM: number | null; p95DeviationM: number | null; maxDeviationM: number | null;
  timeWithinM15S: number | null; timeWithinM2S: number | null; timeOutsideM3S: number | null; timeOutsideM5S: number | null;
  startTimeSec: number | null; endTimeSec: number | null; durationSec: number | null;
  averageSpeedMps: number | null; speedConsistency: number | null;
  analysisConfidence: number; analysisConfidenceBand: ConfidenceBand;
}

function computeSegmentMetrics(samples: AnalyticsSample[]): SegmentMetrics {
  const { startTimeSec, endTimeSec, durationSec } = timeRange(samples);
  const { averageSpeedMps, speedConsistency } = segmentPace(samples);
  const analysisConfidence = round2(confidenceForSegment(samples));
  if (!samples.length) {
    return {
      meanDeviationM: null, medianDeviationM: null, p95DeviationM: null, maxDeviationM: null,
      timeWithinM15S: null, timeWithinM2S: null, timeOutsideM3S: null, timeOutsideM5S: null,
      startTimeSec, endTimeSec, durationSec, averageSpeedMps, speedConsistency,
      analysisConfidence, analysisConfidenceBand: confidenceBand(analysisConfidence),
    };
  }
  const dev = computeDeviationStats(samples);
  return {
    meanDeviationM: dev.meanM, medianDeviationM: dev.medianM, p95DeviationM: dev.p95M, maxDeviationM: dev.maxReliableM,
    timeWithinM15S: dev.timeWithinM15S, timeWithinM2S: dev.timeWithinM2S, timeOutsideM3S: dev.timeOutsideM3S, timeOutsideM5S: dev.timeOutsideM5S,
    startTimeSec, endTimeSec, durationSec, averageSpeedMps, speedConsistency,
    analysisConfidence, analysisConfidenceBand: confidenceBand(analysisConfidence),
  };
}

// ── Zonenmodell (Punkt 3) ───────────────────────────────────────────────

type Anchor =
  | { kind: 'corner'; atM: number; index: number; zoneStart: number; zoneEnd: number }
  | { kind: 'object'; atM: number; index: number; zoneStart: number; zoneEnd: number };

function buildAnchors(input: TrackSegmentationInput): Anchor[] {
  const anchors: Anchor[] = [
    ...input.corners.map((c, index): Anchor => ({
      kind: 'corner', atM: c.atM, index,
      zoneStart: c.atM - CORNER_ZONE_BEFORE_M, zoneEnd: c.atM + CORNER_ZONE_AFTER_M,
    })),
    ...input.objects.map((o, index): Anchor => ({
      kind: 'object', atM: o.atM, index,
      zoneStart: o.atM - OBJECT_ZONE_RADIUS_M, zoneEnd: o.atM + OBJECT_ZONE_RADIUS_M,
    })),
  ];
  anchors.sort((a, b) => a.atM - b.atM);
  // Überlappende Nachbarzonen (Punkt 3/21: "Gegenstand nah am Winkel") am
  // Mittelpunkt zwischen den beiden Ankern trennen — keine Zone frisst die
  // andere, beide bleiben als eigene Segmente erkennbar.
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i], b = anchors[i + 1];
    if (a.zoneEnd > b.zoneStart) {
      const mid = (a.atM + b.atM) / 2;
      a.zoneEnd = mid;
      b.zoneStart = mid;
    }
  }
  return anchors;
}

// ── Hauptfunktion: Segmentierung + Metriken (ohne Re-Acquisition-Split) ──

function buildBaseSegments(input: TrackSegmentationInput): Omit<AnalyticsSegment, 'score'>[] {
  const total = Math.max(0, input.trackLengthM);
  const anchors = buildAnchors(input);
  const segs: Omit<AnalyticsSegment, 'score'>[] = [];
  let cursor = 0;
  let index = 0;

  const pushRange = (type: AnalyticsSegmentType, startM: number, endM: number, extra?: { cornerIndex?: number; objectIndex?: number }) => {
    const s = Math.max(0, Math.min(startM, total));
    const e = Math.max(s, Math.min(endM, total));
    if (e <= s && type !== 'start' && type !== 'finish') return;   // leere Zwischenstrecke, nichts zu erzeugen
    const metrics = computeSegmentMetrics(samplesInRange(input.samples, s, e));
    segs.push({
      id: `seg-${index}`, index, type,
      startDistanceM: round1(s), endDistanceM: round1(e), lengthM: round1(e - s),
      ...metrics,
      ...extra,
    });
    index++;
  };

  // Start-Zone (auf die Fährtenlänge geklemmt, falls sehr kurz).
  const startZoneEnd = Math.min(START_ZONE_M, total);
  pushRange('start', 0, startZoneEnd);
  cursor = startZoneEnd;

  const finishZoneStart = Math.max(startZoneEnd, total - FINISH_ZONE_M);

  for (const anchor of anchors) {
    const zoneStart = Math.max(cursor, Math.min(anchor.zoneStart, finishZoneStart));
    const zoneEnd = Math.max(zoneStart, Math.min(anchor.zoneEnd, finishZoneStart));
    if (zoneStart > cursor) pushRange('straight', cursor, zoneStart);
    if (zoneEnd > zoneStart) {
      if (anchor.kind === 'corner') pushRange('corner', zoneStart, zoneEnd, { cornerIndex: anchor.index });
      else pushRange('object_zone', zoneStart, zoneEnd, { objectIndex: anchor.index });
    }
    cursor = Math.max(cursor, zoneEnd);
  }

  if (finishZoneStart > cursor) pushRange('straight', cursor, finishZoneStart);
  pushRange('finish', finishZoneStart, total);

  return segs;
}

// ── Re-Acquisition-Segmente aus Breaks ableiten ─────────────────────────
// Nur Breaks, deren Bogenlängen-Fenster AUSSERHALB jeder Winkelzone liegt,
// werden zu einem eigenen 'reacquisition'-Segment (innerhalb einer Winkelzone
// ist die Neuaufnahme bereits über cornerAnalysis[i].reacquisitionSec
// abgedeckt — keine doppelte, widersprüchliche zweite Analyse, Punkt 4/21).
function splitInReacquisitions(
  base: Omit<AnalyticsSegment, 'score'>[], input: TrackSegmentationInput, cornerZones: { start: number; end: number }[],
): Omit<AnalyticsSegment, 'score'>[] {
  const result = [...base];
  for (const b of input.breaks) {
    const startM = atMAtTime(input.samples, b.startedAtSec);
    const endM = b.recoveredAtSec != null ? atMAtTime(input.samples, b.recoveredAtSec) : null;
    if (startM == null || endM == null || endM <= startM) continue;
    if (cornerZones.some(z => startM >= z.start && startM <= z.end)) continue;   // schon über die Ecke abgedeckt

    const hostIdx = result.findIndex(s => s.type === 'straight' && startM >= s.startDistanceM && endM <= s.endDistanceM);
    if (hostIdx === -1) continue;   // kein sauber enthaltender Gerade-Abschnitt (z. B. Überlappung mehrerer Zonen) → nicht splitten, lieber nichts erfinden
    const host = result[hostIdx];
    const before = { ...host, id: `${host.id}a`, endDistanceM: round1(startM), lengthM: round1(startM - host.startDistanceM) };
    const after = { ...host, id: `${host.id}b`, startDistanceM: round1(endM), lengthM: round1(host.endDistanceM - endM) };
    const reacq: Omit<AnalyticsSegment, 'score'> = {
      ...host, id: `${host.id}-reacq`, type: 'reacquisition',
      startDistanceM: round1(startM), endDistanceM: round1(endM), lengthM: round1(endM - startM),
      ...computeSegmentMetrics(samplesInRange(input.samples, startM, endM)),
      // Zeit/Dauer kommen bewusst direkt vom Break, nicht aus den (an ~2 m-
      // Schritten diskretisierten) Sample-Grenzen — der Break kennt die
      // exakten Verlassen-/Erholungszeitpunkte (Punkt 1 der Fusion-
      // Nachbesserung), das ist präziser als eine Sample-Fenster-Näherung.
      startTimeSec: round1(b.startedAtSec), endTimeSec: round1(b.recoveredAtSec!), durationSec: round1(b.recoveredAtSec! - b.startedAtSec),
    };
    const replacement = [
      ...(before.lengthM > 0 ? [{ ...before, ...computeSegmentMetrics(samplesInRange(input.samples, host.startDistanceM, startM)) }] : []),
      reacq,
      ...(after.lengthM > 0 ? [{ ...after, ...computeSegmentMetrics(samplesInRange(input.samples, endM, host.endDistanceM)) }] : []),
    ];
    result.splice(hostIdx, 1, ...replacement);
  }
  return result.map((s, i) => ({ ...s, index: i, id: `seg-${i}` }));
}

// ── Score je Segment (Punkt 5) ───────────────────────────────────────────

function scoreForSegment(seg: Omit<AnalyticsSegment, 'score'>, input: TrackSegmentationInput): number | null {
  if (seg.type === 'object_zone' && seg.objectIndex != null) {
    const obj = input.objectAnalysis[seg.objectIndex];
    return obj ? (obj.found ? 100 : 0) : null;
  }
  if (seg.type === 'corner' && seg.cornerIndex != null) {
    const c = input.cornerAnalysis[seg.cornerIndex];
    if (!c) return null;
    const devScore = c.maxLateralDeviationM == null ? null : clamp01((CORNER_WINDOW_AFTER_M - c.maxLateralDeviationM) / CORNER_WINDOW_AFTER_M);
    const overshootScore = c.overshootM == null ? null : clamp01(1 - c.overshootM / 10);
    const parts = [devScore, overshootScore].filter((v): v is number => v != null);
    if (!parts.length) return null;
    return Math.round(100 * (parts.reduce((a, b) => a + b, 0) / parts.length));
  }
  if (seg.type === 'reacquisition') {
    if (seg.durationSec == null) return null;   // Break noch offen — keine erfundene Bewertung
    return Math.round(100 * clamp01(1 - seg.durationSec / REACQUISITION_SCORE_ZERO_S));
  }
  // straight / start / finish: reine Spurtreue, nur wenn überhaupt gemessen wurde.
  if (seg.meanDeviationM == null) return null;
  return deviationScore(seg.meanDeviationM);
}

// ── Öffentliche Hauptfunktion ─────────────────────────────────────────────

export function computeTrackSegments(input: TrackSegmentationInput): AnalyticsSegment[] {
  if (input.trackLengthM <= 0) return [];
  const base = buildBaseSegments(input);
  const cornerZones = base.filter(s => s.type === 'corner').map(s => ({ start: s.startDistanceM, end: s.endDistanceM }));
  const withReacquisitions = splitInReacquisitions(base, input, cornerZones);
  return withReacquisitions.map(seg => ({ ...seg, score: scoreForSegment(seg, input) }));
}

// ── Highlights (Punkt 16) — rein aus echten Metriken, keine Wertung ───────

export interface SegmentHighlight {
  labelKey:
    | 'track.segments.highlights.lowestDeviation'
    | 'track.segments.highlights.highestDeviation'
    | 'track.segments.highlights.fastestReacquisition'
    | 'track.segments.highlights.mostUncertain';
  segmentId: string;
  segmentIndex: number;
  valueText: string;  // bereits formatierter Wert (z. B. "1.3 m", "4.6 s") — reine Zahl, keine Bewertung
}

export function computeSegmentHighlights(segments: AnalyticsSegment[]): SegmentHighlight[] {
  const highlights: SegmentHighlight[] = [];

  const straightLike = segments.filter(s => s.meanDeviationM != null && (s.type === 'straight' || s.type === 'start' || s.type === 'finish'));
  if (straightLike.length) {
    const best = straightLike.reduce((a, b) => (a.meanDeviationM! <= b.meanDeviationM! ? a : b));
    highlights.push({ labelKey: 'track.segments.highlights.lowestDeviation', segmentId: best.id, segmentIndex: best.index, valueText: `${best.meanDeviationM!.toFixed(1)} m` });
  }

  const withMaxDev = segments.filter(s => s.maxDeviationM != null);
  if (withMaxDev.length) {
    const worst = withMaxDev.reduce((a, b) => (a.maxDeviationM! >= b.maxDeviationM! ? a : b));
    highlights.push({ labelKey: 'track.segments.highlights.highestDeviation', segmentId: worst.id, segmentIndex: worst.index, valueText: `${worst.maxDeviationM!.toFixed(1)} m` });
  }

  const corners = segments.filter(s => s.type === 'corner' && s.durationSec != null);
  if (corners.length) {
    const fastest = corners.reduce((a, b) => (a.durationSec! <= b.durationSec! ? a : b));
    highlights.push({ labelKey: 'track.segments.highlights.fastestReacquisition', segmentId: fastest.id, segmentIndex: fastest.index, valueText: `${fastest.durationSec!.toFixed(1)} s` });
  }

  const byConfidence = segments.filter(s => s.meanDeviationM != null);
  if (byConfidence.length) {
    const leastCertain = byConfidence.reduce((a, b) => (a.analysisConfidence <= b.analysisConfidence ? a : b));
    highlights.push({ labelKey: 'track.segments.highlights.mostUncertain', segmentId: leastCertain.id, segmentIndex: leastCertain.index, valueText: `${Math.round(leastCertain.analysisConfidence * 100)}%` });
  }

  return highlights.slice(0, 4);
}

// ── Analytics v2 — additiver Wrapper um computeTrackAnalytics (Punkt 6) ────
//
// Bewusst NICHT in trackAnalytics.ts selbst gebaut: dieses Modul importiert
// bereits VON trackAnalytics.ts (CornerAnalysis/ObjectAnalysis/…) — ein
// Rückimport dort würde einen zirkulären Modul-Import erzeugen. Die
// bestehende, unveränderte v1-Struktur (analyticsVersion: 1, keine
// `segments`) bleibt exakt wie vorher — TrackAnalyticsV2 ist ein separater,
// zusätzlicher Typ mit `analyticsVersion: 2`. Alte, bereits gespeicherte
// Fährten mit v1 bleiben unverändert lesbar (kein Migrations-, kein
// Schreibzwang); computeTrackAnalyticsV2() ist das, was NEUE Absuchen ab
// jetzt tatsächlich berechnen/speichern.
export interface TrackAnalyticsV2 extends Omit<TrackAnalytics, 'analyticsVersion'> {
  analyticsVersion: 2;
  segments: AnalyticsSegment[];
  segmentHighlights: SegmentHighlight[];
}

export function isTrackAnalyticsV2(a: TrackAnalytics | TrackAnalyticsV2 | null | undefined): a is TrackAnalyticsV2 {
  return !!a && a.analyticsVersion === 2;
}

export function computeTrackAnalyticsV2(input: TrackAnalyticsInput): TrackAnalyticsV2 {
  const base = computeTrackAnalytics(input);   // v1-Kernberechnung UNVERÄNDERT — keine zweite, abweichende Logik
  const segments = computeTrackSegments({
    samples: input.samples,
    corners: input.corners, cornerAnalysis: base.corners,     // dieselben, bereits berechneten Ergebnisse — keine doppelte Winkelanalyse
    objects: input.objects, objectAnalysis: base.objects,     // dieselben, bereits berechneten Ergebnisse — keine doppelte Gegenstandsanalyse
    breaks: input.breaks,
    trackLengthM: input.trackLengthM,
  });
  const segmentHighlights = computeSegmentHighlights(segments);
  return { ...base, analyticsVersion: 2, segments, segmentHighlights };
}
