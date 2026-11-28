/**
 * Laufauswertung: verständliche Zusammenfassung EINER Absuche.
 *
 * Reine, lesende Ableitung aus bereits gespeicherten Daten (Analytics der Absuche,
 * gelegte Linie inkl. GPS-Höhe, Suchspur, Fundzahl). Dieses Modul schreibt nichts,
 * verändert keine Geometrie, keinen Score und keine Kundendaten. Fehlen Daten
 * (ältere Fährten, keine Höhe, keine Suchspur), fällt der jeweilige Teil weg.
 *
 * Inhalt:
 *  - Winkel (aus der bestehenden Winkelanalyse) und Bögen (geometrisch aus der
 *    gelegten Linie erkannt, inkl. ob der Hund innen abkürzt oder aussen läuft)
 *  - Fundquote und ruhiges Verweisen
 *  - Tempo (km/h, Gleichmässigkeit, Verlauf Anfang → Ende)
 *  - Höhenprofil der gelegten Fährte (GPS-Höhe, geglättet)
 *  - Einschätzung mit Stärken und konkreten Tipps
 */
import type { TrackAnalytics } from '@/features/tracking/engine/trackAnalytics';
import type { TrackAnalyticsV3 } from '@/features/tracking/engine/trackAnalyticsV3';

// ── Eingaben ──────────────────────────────────────────────────────────────

export interface InsightLayPoint {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  breakBefore?: boolean;
}

export interface InsightRunPoint {
  lat: number;
  lng: number;
  breakBefore?: boolean;
}

export interface RunInsightsInput {
  analytics: TrackAnalytics | TrackAnalyticsV3 | null | undefined;
  layPoints?: InsightLayPoint[] | null;
  runPoints?: InsightRunPoint[] | null;
  /** Gefundene / bewertete Gegenstände (bereits um Korrekturen und Joker bereinigt). */
  objectsFound?: number | null;
  objectsTotal?: number | null;
}

// ── Ausgaben ──────────────────────────────────────────────────────────────

export type ElementQuality = 'clean' | 'checked' | 'overshoot' | 'long_search' | 'cut_inside' | 'wide_outside' | 'unknown';

export interface AngleInsight {
  index: number;
  atM: number;
  side: 'links' | 'rechts' | 'unbekannt';
  sharp: boolean;
  quality: ElementQuality;
  overshootM: number | null;
  settleSec: number | null;
}

export interface ArcInsight {
  index: number;
  startM: number;
  endM: number;
  lengthM: number;
  turnDeg: number;
  side: 'links' | 'rechts';
  /** Mittlere seitliche Abweichung der Suchspur im Bogen (m); null ohne Suchspur. */
  meanOffsetM: number | null;
  quality: ElementQuality;
}

export interface FindRateInsight {
  found: number;
  total: number;
  percent: number;
  /** Gegenstände mit ruhigem Stopp (nur V3-Analyse), sonst null. */
  calmStops: number | null;
  /** Gegenstände ohne Stopp passiert (nur V3-Analyse), sonst null. */
  passedWithoutStop: number | null;
}

export type PaceBand = 'very_calm' | 'calm' | 'brisk' | 'fast';
export type PaceTrend = 'steady' | 'slower' | 'faster';

export interface PaceInsight {
  avgKmh: number;
  medianKmh: number;
  band: PaceBand;
  consistencyPct: number;
  stops: number | null;
  trend: PaceTrend | null;
  /** Tempo je Abschnitt in Laufrichtung (km/h), für den Tempoverlauf. */
  profileKmh: number[];
}

export interface ElevationInsight {
  minM: number;
  maxM: number;
  ascentM: number;
  descentM: number;
  rangeM: number;
  flat: boolean;
  /** Geglättetes Profil über die Strecke, höchstens ~48 Punkte. */
  profile: { distM: number; altM: number }[];
}

export type VerdictLevel = 'strong' | 'solid' | 'work' | 'uncertain';

export interface InsightMessage {
  key: string;
  params?: Record<string, string | number>;
}

export interface RunInsights {
  angles: AngleInsight[];
  arcs: ArcInsight[];
  elementsClean: number;
  elementsTotal: number;
  findRate: FindRateInsight | null;
  pace: PaceInsight | null;
  elevation: ElevationInsight | null;
  verdict: {
    level: VerdictLevel;
    strengths: InsightMessage[];
    tips: InsightMessage[];
  };
}

// ── Schwellen (zentral, bewusst konservativ) ─────────────────────────────

export const RUN_INSIGHT_THRESHOLDS = Object.freeze({
  angleCleanMaxLateralM: 3,
  angleOvershootM: 3,
  angleLongSearchSec: 10,
  arcResampleStepM: 3,
  arcMinStepTurnDeg: 3,
  arcMaxStepTurnDeg: 30,
  arcMinTotalTurnDeg: 45,
  arcMinLengthM: 12,
  arcCornerClearanceM: 8,
  arcCleanOffsetM: 2.5,
  arcMinRunPoints: 3,
  paceVeryCalmKmh: 1.5,
  paceCalmMaxKmh: 4,
  paceBriskMaxKmh: 5.5,
  paceTrendRatio: 0.2,
  paceUnevenConsistency: 0.5,
  elevationMinPoints: 8,
  elevationHysteresisM: 2,
  elevationFlatRangeM: 3,
  elevationSteepAscentM: 15,
  manyDeviationEvents: 3,
} as const);

// ── Geometrie-Helfer (lokale, flache Projektion; für Fährtenlängen ausreichend) ─

interface XY { x: number; y: number }

function projector(lat0: number, lng0: number) {
  const k = Math.cos((lat0 * Math.PI) / 180);
  const m = 111_320;
  return (lat: number, lng: number): XY => ({ x: (lng - lng0) * m * k, y: (lat - lat0) * m });
}

function dist(a: XY, b: XY): number { return Math.hypot(b.x - a.x, b.y - a.y); }
function heading(a: XY, b: XY): number { return (Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI; }
function wrap(d: number): number {
  let v = d;
  while (v > 180) v -= 360;
  while (v < -180) v += 360;
  return v;
}
function round1(v: number): number { return Math.round(v * 10) / 10; }
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

interface LineSection { pts: XY[]; cum: number[] }

/** Gelegte Linie in zusammenhängende Abschnitte (bei Unterbrechung getrennt) mit globaler Bogenlänge. */
function buildLaySections(points: InsightLayPoint[]): { sections: LineSection[]; project: ((lat: number, lng: number) => XY) | null } {
  const valid = points.filter(p => finite(p.latitude) && finite(p.longitude));
  if (valid.length < 2) return { sections: [], project: null };
  const project = projector(valid[0].latitude, valid[0].longitude);
  const sections: LineSection[] = [];
  let current: LineSection | null = null;
  let total = 0;
  let prev: XY | null = null;
  for (const p of valid) {
    const xy = project(p.latitude, p.longitude);
    if (!current || p.breakBefore) {
      current = { pts: [], cum: [] };
      sections.push(current);
    } else if (prev) {
      total += dist(prev, xy);
    }
    current.pts.push(xy);
    current.cum.push(total);
    prev = xy;
  }
  return { sections: sections.filter(s => s.pts.length >= 2), project };
}

function resample(section: LineSection, step: number): { pts: XY[]; atM: number[] } {
  const pts: XY[] = [section.pts[0]];
  const atM: number[] = [section.cum[0]];
  let next = section.cum[0] + step;
  for (let i = 1; i < section.pts.length; i++) {
    const a = section.pts[i - 1], b = section.pts[i];
    const ca = section.cum[i - 1], cb = section.cum[i];
    while (cb >= next && cb > ca) {
      const f = (next - ca) / (cb - ca);
      pts.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
      atM.push(next);
      next += step;
    }
  }
  return { pts, atM };
}

/** Projektion eines Punktes auf die Linie: Bogenlänge und vorzeichenbehaftete Seitenlage (+ = links). */
function projectOnto(sections: LineSection[], p: XY): { atM: number; offsetM: number } | null {
  let best: { atM: number; offsetM: number; d: number } | null = null;
  for (const s of sections) {
    for (let i = 1; i < s.pts.length; i++) {
      const a = s.pts[i - 1], b = s.pts[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      if (len2 <= 0) continue;
      const f = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
      const fx = a.x + dx * f, fy = a.y + dy * f;
      const d = Math.hypot(p.x - fx, p.y - fy);
      if (!best || d < best.d) {
        const cross = dx * (p.y - a.y) - dy * (p.x - a.x);
        best = { atM: s.cum[i - 1] + Math.sqrt(len2) * f, offsetM: cross >= 0 ? d : -d, d };
      }
    }
  }
  return best ? { atM: best.atM, offsetM: best.offsetM } : null;
}

// ── Winkel ────────────────────────────────────────────────────────────────

function angleInsights(analytics: TrackAnalytics | TrackAnalyticsV3): AngleInsight[] {
  const T = RUN_INSIGHT_THRESHOLDS;
  return analytics.corners.map((c, i) => {
    let quality: ElementQuality;
    const v3 = 'interpretation' in c ? c : null;
    if (v3) {
      quality = v3.interpretation === 'clean' ? 'clean'
        : v3.interpretation === 'short_control_phase' ? 'checked'
          : v3.interpretation === 'likely_overshoot' ? 'overshoot'
            : v3.interpretation === 'longer_search_phase' || v3.interpretation === 'reacquisition_required' ? 'long_search'
              : 'unknown';
    } else if (c.maxLateralDeviationM == null) {
      quality = 'unknown';
    } else if (c.overshootM != null && c.overshootM > T.angleOvershootM) {
      quality = 'overshoot';
    } else if (c.reacquisitionSec != null && c.reacquisitionSec > T.angleLongSearchSec) {
      quality = 'long_search';
    } else {
      quality = c.maxLateralDeviationM <= T.angleCleanMaxLateralM ? 'clean' : 'checked';
    }
    return {
      index: i + 1,
      atM: c.atM,
      side: c.side,
      sharp: c.sharpness === 'spitz',
      quality,
      overshootM: c.overshootM != null && c.overshootM > 0 ? round1(c.overshootM) : null,
      settleSec: v3?.stabilizationTimeSec != null ? round1(v3.stabilizationTimeSec) : null,
    };
  });
}

// ── Bögen ─────────────────────────────────────────────────────────────────

export function detectArcs(
  layPoints: InsightLayPoint[],
  cornerAtM: number[],
  runPoints: InsightRunPoint[] = [],
): ArcInsight[] {
  const T = RUN_INSIGHT_THRESHOLDS;
  const { sections, project } = buildLaySections(layPoints);
  if (!project) return [];
  const found: Omit<ArcInsight, 'index' | 'meanOffsetM' | 'quality'>[] = [];

  for (const section of sections) {
    const { pts, atM } = resample(section, T.arcResampleStepM);
    if (pts.length < 4) continue;
    const headings: number[] = [];
    for (let i = 1; i < pts.length; i++) headings.push(heading(pts[i - 1], pts[i]));
    // Richtungsänderung pro Schritt, leicht geglättet (3er-Mittel), gegen GPS-Zittern.
    const raw: number[] = [];
    for (let i = 1; i < headings.length; i++) raw.push(wrap(headings[i] - headings[i - 1]));
    const turns = raw.map((_, i) => {
      const w = raw.slice(Math.max(0, i - 1), Math.min(raw.length, i + 2));
      return w.reduce((a, b) => a + b, 0) / w.length;
    });

    let start = -1, sum = 0, sign = 0, gap = 0, maxStep = 0;
    const close = (endIdx: number) => {
      if (start < 0) return;
      // turns[i] gehört zum Punkt pts[i + 1].
      const startM = atM[start + 1] - T.arcResampleStepM / 2;
      const endM = atM[endIdx + 1] + T.arcResampleStepM / 2;
      const lengthM = endM - startM;
      const nearCorner = cornerAtM.some(c => c >= startM - T.arcCornerClearanceM && c <= endM + T.arcCornerClearanceM && lengthM < 3 * T.arcCornerClearanceM);
      if (Math.abs(sum) >= T.arcMinTotalTurnDeg && lengthM >= T.arcMinLengthM && maxStep <= T.arcMaxStepTurnDeg && !nearCorner) {
        found.push({ startM: round1(startM), endM: round1(endM), lengthM: round1(lengthM), turnDeg: Math.round(Math.abs(sum)), side: sum > 0 ? 'rechts' : 'links' });
      }
      start = -1; sum = 0; sign = 0; gap = 0; maxStep = 0;
    };

    for (let i = 0; i < turns.length; i++) {
      const t = turns[i];
      const mag = Math.abs(t);
      const s = Math.sign(t);
      if (mag >= T.arcMinStepTurnDeg && (sign === 0 || s === sign)) {
        if (start < 0) start = i;
        sign = s; sum += t; gap = 0; maxStep = Math.max(maxStep, mag);
      } else if (start >= 0 && mag < T.arcMinStepTurnDeg && gap === 0) {
        gap = 1; sum += t; // ein kurzer, fast gerader Schritt im Bogen ist erlaubt
      } else {
        close(i - 1 - gap);
        if (mag >= T.arcMinStepTurnDeg) { start = i; sign = s; sum = t; maxStep = mag; }
      }
    }
    close(turns.length - 1 - gap);
  }

  // Suchspur im Bogen: mittlere Seitenlage relativ zur Drehrichtung.
  const runXY = runPoints.filter(p => finite(p.lat) && finite(p.lng)).map(p => projectOnto(sections, project(p.lat, p.lng))).filter((p): p is { atM: number; offsetM: number } => !!p);
  return found.map((arc, i) => {
    const inside = runXY.filter(p => p.atM >= arc.startM && p.atM <= arc.endM);
    if (inside.length < T.arcMinRunPoints) return { ...arc, index: i + 1, meanOffsetM: null, quality: 'unknown' };
    const meanAbs = inside.reduce((a, p) => a + Math.abs(p.offsetM), 0) / inside.length;
    // + = links der Linie. Bei einem Linksbogen liegt «innen» links.
    const meanSigned = inside.reduce((a, p) => a + p.offsetM, 0) / inside.length;
    const towardInside = arc.side === 'links' ? meanSigned : -meanSigned;
    const quality: ElementQuality = meanAbs <= T.arcCleanOffsetM ? 'clean'
      : towardInside > 0 ? 'cut_inside' : 'wide_outside';
    return { ...arc, index: i + 1, meanOffsetM: round1(meanAbs), quality };
  });
}

// ── Höhe ──────────────────────────────────────────────────────────────────

function medianOf(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function elevationProfile(layPoints: InsightLayPoint[]): ElevationInsight | null {
  const T = RUN_INSIGHT_THRESHOLDS;
  const valid = layPoints.filter(p => finite(p.latitude) && finite(p.longitude));
  if (valid.length < T.elevationMinPoints) return null;
  const project = projector(valid[0].latitude, valid[0].longitude);
  const samples: { distM: number; altM: number }[] = [];
  let total = 0;
  let prev: XY | null = null;
  for (const p of valid) {
    const xy = project(p.latitude, p.longitude);
    if (prev && !p.breakBefore) total += dist(prev, xy);
    prev = xy;
    if (finite(p.altitude)) samples.push({ distM: total, altM: p.altitude });
  }
  if (samples.length < T.elevationMinPoints) return null;
  // Median-Filter gegen Ausreisser, danach gleitendes Mittel gegen Rauschen.
  const med = samples.map((_, i) => medianOf(samples.slice(Math.max(0, i - 2), i + 3).map(s => s.altM)));
  const smooth = med.map((_, i) => {
    const w = med.slice(Math.max(0, i - 2), i + 3);
    return w.reduce((a, b) => a + b, 0) / w.length;
  });
  let ascent = 0, descent = 0, ref = smooth[0];
  for (const v of smooth) {
    if (v - ref >= T.elevationHysteresisM) { ascent += v - ref; ref = v; }
    else if (ref - v >= T.elevationHysteresisM) { descent += ref - v; ref = v; }
  }
  const minM = Math.min(...smooth), maxM = Math.max(...smooth);
  const stride = Math.max(1, Math.ceil(smooth.length / 48));
  const profile: { distM: number; altM: number }[] = [];
  for (let i = 0; i < smooth.length; i += stride) profile.push({ distM: Math.round(samples[i].distM), altM: round1(smooth[i]) });
  const last = smooth.length - 1;
  if (profile[profile.length - 1]?.distM !== Math.round(samples[last].distM)) profile.push({ distM: Math.round(samples[last].distM), altM: round1(smooth[last]) });
  return {
    minM: Math.round(minM), maxM: Math.round(maxM),
    ascentM: Math.round(ascent), descentM: Math.round(descent),
    rangeM: Math.round(maxM - minM),
    flat: maxM - minM < T.elevationFlatRangeM,
    profile,
  };
}

// ── Tempo ─────────────────────────────────────────────────────────────────

function paceInsight(analytics: TrackAnalytics | TrackAnalyticsV3): PaceInsight | null {
  const T = RUN_INSIGHT_THRESHOLDS;
  const pace = analytics.pace;
  if (!pace || !finite(pace.avgMps) || pace.avgMps <= 0) return null;
  const avgKmh = round1(pace.avgMps * 3.6);
  const band: PaceBand = avgKmh < T.paceVeryCalmKmh ? 'very_calm' : avgKmh <= T.paceCalmMaxKmh ? 'calm' : avgKmh <= T.paceBriskMaxKmh ? 'brisk' : 'fast';
  const segments = 'segments' in analytics && Array.isArray(analytics.segments) ? analytics.segments : [];
  const moving = segments
    .filter(s => s.type !== 'reacquisition' && finite(s.averageSpeedMps) && (s.averageSpeedMps as number) > 0 && s.lengthM > 0)
    .sort((a, b) => a.startDistanceM - b.startDistanceM);
  const profileKmh = moving.map(s => round1((s.averageSpeedMps as number) * 3.6));
  let trend: PaceTrend | null = null;
  if (moving.length >= 3) {
    const total = moving.reduce((a, s) => a + s.lengthM, 0);
    let acc = 0, fW = 0, fV = 0, lW = 0, lV = 0;
    for (const s of moving) {
      const mid = acc + s.lengthM / 2;
      acc += s.lengthM;
      const v = s.averageSpeedMps as number;
      if (mid < total / 2) { fW += s.lengthM; fV += v * s.lengthM; } else { lW += s.lengthM; lV += v * s.lengthM; }
    }
    if (fW > 0 && lW > 0) {
      const first = fV / fW, last = lV / lW;
      trend = last < first * (1 - T.paceTrendRatio) ? 'slower' : last > first * (1 + T.paceTrendRatio) ? 'faster' : 'steady';
    }
  }
  return {
    avgKmh,
    medianKmh: round1((pace.medianMps ?? pace.avgMps) * 3.6),
    band,
    consistencyPct: Math.round(Math.max(0, Math.min(1, pace.consistency ?? 0)) * 100),
    stops: 'stopGoPhases' in pace ? pace.stopGoPhases : null,
    trend,
    profileKmh,
  };
}

// ── Fundquote ─────────────────────────────────────────────────────────────

function findRateInsight(analytics: TrackAnalytics | TrackAnalyticsV3 | null | undefined, found: number | null | undefined, total: number | null | undefined): FindRateInsight | null {
  if (!finite(total) || total <= 0 || !finite(found) || found < 0) return null;
  const f = Math.min(found, total);
  const v3Objects = analytics && analytics.objects.length && 'status' in analytics.objects[0] ? (analytics as TrackAnalyticsV3).objects : null;
  return {
    found: f,
    total,
    percent: Math.round((100 * f) / total),
    calmStops: v3Objects ? v3Objects.filter(o => o.reasonCodes.includes('stable_stop')).length : null,
    passedWithoutStop: v3Objects ? v3Objects.filter(o => o.reasonCodes.includes('passed_without_stop')).length : null,
  };
}

// ── Einschätzung ──────────────────────────────────────────────────────────

const ISSUE: ElementQuality[] = ['overshoot', 'long_search', 'cut_inside', 'wide_outside'];

function verdictFor(
  analytics: TrackAnalytics | TrackAnalyticsV3,
  angles: AngleInsight[], arcs: ArcInsight[],
  findRate: FindRateInsight | null, pace: PaceInsight | null, elevation: ElevationInsight | null,
): RunInsights['verdict'] {
  const T = RUN_INSIGHT_THRESHOLDS;
  const strengths: InsightMessage[] = [];
  const tips: InsightMessage[] = [];
  const uncertain = analytics.analysisConfidenceBand === 'unreliable';
  const limited = analytics.analysisConfidenceBand === 'limited';

  // Winkel
  const assessedAngles = angles.filter(a => a.quality !== 'unknown');
  const overshoot = angles.filter(a => a.quality === 'overshoot');
  const longSearch = angles.filter(a => a.quality === 'long_search');
  if (assessedAngles.length >= 1 && overshoot.length === 0 && longSearch.length === 0) {
    strengths.push({ key: 'strength.angles', params: { n: assessedAngles.length } });
  }
  const firstOvershoot = overshoot[0];
  if (firstOvershoot) {
    tips.push({ key: firstOvershoot.sharp ? 'tip.sharpOvershoot' : 'tip.angleOvershoot', params: { n: firstOvershoot.index, m: firstOvershoot.overshootM ?? T.angleOvershootM } });
  }
  if (longSearch[0]) tips.push({ key: 'tip.angleLongSearch', params: { n: longSearch[0].index } });

  // Bögen
  const cut = arcs.find(a => a.quality === 'cut_inside');
  const wide = arcs.find(a => a.quality === 'wide_outside');
  if (cut) tips.push({ key: 'tip.arcCut', params: { n: cut.index, m: Math.round(cut.startM) } });
  else if (wide) tips.push({ key: 'tip.arcWide', params: { n: wide.index, m: Math.round(wide.startM) } });
  const cleanArcs = arcs.filter(a => a.quality === 'clean');
  if (arcs.length > 0 && cleanArcs.length === arcs.length) strengths.push({ key: 'strength.arcs', params: { n: arcs.length } });

  // Fundquote
  if (findRate) {
    if (findRate.found === findRate.total) strengths.push({ key: 'strength.allFound', params: { total: findRate.total } });
    else tips.push({ key: 'tip.findRate', params: { found: findRate.found, total: findRate.total } });
    if (findRate.found > 0 && findRate.passedWithoutStop != null && findRate.passedWithoutStop > 0 && (findRate.calmStops ?? 0) === 0) {
      tips.push({ key: 'tip.indication' });
    } else if (findRate.calmStops != null && findRate.calmStops > 0 && findRate.calmStops >= findRate.found && findRate.found > 0) {
      strengths.push({ key: 'strength.indication' });
    }
  }

  // Linie
  if ('deviationEvents' in analytics) {
    if (analytics.deviationEvents.length >= T.manyDeviationEvents) tips.push({ key: 'tip.deviations', params: { n: analytics.deviationEvents.length } });
    else if (analytics.deviationEvents.length === 0 && !uncertain) strengths.push({ key: 'strength.line' });
  } else if (analytics.deviation.medianM > 0 && analytics.deviation.medianM <= 1.5 && !uncertain) {
    strengths.push({ key: 'strength.line' });
  }

  // Tempo
  if (pace) {
    if (pace.band === 'fast') tips.push({ key: 'tip.paceFast', params: { kmh: pace.avgKmh } });
    if (pace.trend === 'slower') tips.push({ key: 'tip.paceSlower' });
    else if (pace.trend === 'faster') tips.push({ key: 'tip.paceFaster' });
    if (pace.consistencyPct < T.paceUnevenConsistency * 100 && pace.band !== 'fast') tips.push({ key: 'tip.paceUneven', params: { stops: pace.stops ?? 0 } });
    if ((pace.band === 'calm' || pace.band === 'very_calm') && pace.consistencyPct >= T.paceUnevenConsistency * 100 && pace.trend !== 'slower' && pace.trend !== 'faster') {
      strengths.push({ key: 'strength.pace', params: { kmh: pace.avgKmh } });
    }
  }

  // Gelände
  if (elevation && elevation.ascentM >= T.elevationSteepAscentM) tips.push({ key: 'tip.elevation', params: { m: elevation.ascentM } });

  // GPS-Grundlage zuerst nennen, wenn unsicher
  if (uncertain || limited) tips.unshift({ key: 'tip.gps' });

  const issues = angles.filter(a => ISSUE.includes(a.quality)).length + arcs.filter(a => ISSUE.includes(a.quality)).length;
  const missed = findRate ? findRate.total - findRate.found : 0;
  let level: VerdictLevel;
  if (uncertain) level = 'uncertain';
  else if (issues === 0 && missed === 0 && tips.filter(t => t.key !== 'tip.gps').length <= 1) level = 'strong';
  else if (issues <= 1 && missed <= 1) level = 'solid';
  else level = 'work';

  if (tips.length === 0) tips.push({ key: 'tip.nextStep' });
  return { level, strengths: strengths.slice(0, 3), tips: tips.slice(0, 3) };
}

// ── Einstieg ──────────────────────────────────────────────────────────────

export function buildRunInsights(input: RunInsightsInput): RunInsights | null {
  const analytics = input.analytics;
  if (!analytics) return null;
  const angles = angleInsights(analytics);
  const lay = input.layPoints ?? [];
  const arcs = lay.length >= 2 ? detectArcs(lay, analytics.corners.map(c => c.atM), input.runPoints ?? []) : [];
  const findRate = findRateInsight(analytics, input.objectsFound, input.objectsTotal);
  const pace = paceInsight(analytics);
  const elevation = lay.length ? elevationProfile(lay) : null;
  const all = [...angles, ...arcs].filter(e => e.quality !== 'unknown');
  return {
    angles,
    arcs,
    elementsClean: all.filter(e => e.quality === 'clean' || e.quality === 'checked').length,
    elementsTotal: all.length,
    findRate,
    pace,
    elevation,
    verdict: verdictFor(analytics, angles, arcs, findRate, pace, elevation),
  };
}
