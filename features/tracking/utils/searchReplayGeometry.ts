// ──────────────────────────────────────────────────────────────────────────
// Search-Replay-/Display-Geometrie (turn-aware) — getrennt von den Metriken.
//
// FELDBEFUND: die blaue Absuche wirkt diagonal abgeschnitten. Ursache (RC-7):
// die persistierte/gerenderte Suchspur ist die durch das feste 1,5-m-Gate
// (MIN_SEGMENT) ausgedünnte `pointsRef`-Linie — dreht der Hund innerhalb von
// 1,5 m, fehlt der Scheitel und die Ecke wird abgeschnitten.
//
// Diese Geometrie ist ein ZUSÄTZLICHER, rein darstellender Strom:
//   • gespeist VOR dem 1,5-m-Gate, NACH Fix-Akzeptanz und Fusion-Schutzschicht
//     (Outlier/Stillstand erreichen ihn nie),
//   • verändert weder Cursor, Fortschritt, Search-Distanz, Score noch die
//     Analytics (`pointsRef`/`distRef`/`analyticsSamplesRef` bleiben exakt
//     wie sie waren),
//   • wird beim Stop einmal vereinfacht: gerade Strecken ausgedünnt, an Ecken
//     bleiben Vor-Anker · Scheitel · Nach-Anker erhalten.
// NICHT: Snap-to-Track, Projektion auf die gelegte Fährte, Begradigen.
//
// Reine Funktionen, kein React/Native.
// ──────────────────────────────────────────────────────────────────────────

export interface ReplayGeoPoint { lat: number; lng: number; t: number }

export const REPLAY_GEOMETRY = {
  /** Glättung (EMA) des Display-Stroms: leicht, damit Ecken nicht abgerundet werden (Metrik-Glättung ist 0,4). */
  emaAlpha: 0.7,
  /** Douglas-Peucker-Toleranz (m): so weit darf die Vereinfachung von der dichten Spur abweichen. */
  epsilonM: 1.0,
  /** Abstand (m) von Vor-/Nach-Anker zum Scheitel entlang der Spur. */
  anchorM: 1.5,
  /** Richtungsänderung (Grad) der vereinfachten Polylinie an einem Knoten, ab der er als Ecke gilt. */
  turnDeg: 45,
  /** Mindestabstand (m) zwischen nicht geschützten Punkten — das bisherige MIN_SEGMENT. */
  minSpacingM: 1.5,
  /** Sicherheitsgrenze: darüber keine Replay-Geometrie (Fallback = bisherige Punkte). */
  maxDensePoints: 6000,
  maxReplayGapM: 2.5,
  maxReplayGapSec: 5,
} as const;

export interface ReplayGapInsertion { sourceIndex: number; reason: 'spatial_gap' | 'temporal_gap' | 'both' }
export interface ReplayUnfillableGap {
  startSourceIndex: number;
  endSourceIndex: number;
  spatialGapM: number;
  temporalGapSec: number;
  reason: 'no_observed_intermediate_sample';
}
export interface ReplayGeometryDetail { points: ReplayGeoPoint[]; insertedForGap: ReplayGapInsertion[]; unfillableGaps: ReplayUnfillableGap[] }

const M_PER_DEG = 111320;

function toXY(pts: readonly ReplayGeoPoint[]): { x: number[]; y: number[]; cum: number[] } {
  const lat0 = pts[0].lat, lng0 = pts[0].lng;
  const mLng = M_PER_DEG * Math.cos((lat0 * Math.PI) / 180);
  const x = pts.map(p => (p.lng - lng0) * mLng), y = pts.map(p => (p.lat - lat0) * M_PER_DEG);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]));
  return { x, y, cum };
}

function perpDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Iterativer Douglas-Peucker; markiert behaltene Indizes. */
function douglasPeucker(x: number[], y: number[], eps: number): boolean[] {
  const n = x.length;
  const keep = new Array<boolean>(n).fill(false);
  keep[0] = keep[n - 1] = true;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = -1, worstD = eps;
    for (let i = a + 1; i < b; i++) {
      const d = perpDist(x[i], y[i], x[a], y[a], x[b], y[b]);
      if (d > worstD) { worstD = d; worst = i; }
    }
    if (worst >= 0) { keep[worst] = true; stack.push([a, worst], [worst, b]); }
  }
  return keep;
}

function nearestIndexAtCum(cum: readonly number[], target: number): number {
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < target) lo = mid + 1; else hi = mid; }
  if (lo > 0 && Math.abs(cum[lo - 1] - target) <= Math.abs(cum[lo] - target)) return lo - 1;
  return lo;
}

function headingDeg(ax: number, ay: number, bx: number, by: number): number {
  return (Math.atan2(bx - ax, by - ay) * 180) / Math.PI;
}
function angleDiffDeg(a: number, b: number): number {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return Math.abs(d);
}

/**
 * Vereinfacht die dichte, zeitgestempelte Suchspur zur Replay-/Display-Geometrie.
 * `null`, wenn keine sinnvolle Geometrie entsteht (< 2 Punkte oder über der
 * Sicherheitsgrenze) — der Aufrufer nimmt dann die bisherigen Suchpunkte.
 */
export function buildReplayGeometryDetailed(dense: readonly ReplayGeoPoint[]): ReplayGeometryDetail | null {
  const n = dense.length;
  if (n < 2 || n > REPLAY_GEOMETRY.maxDensePoints) return null;
  const { x, y, cum } = toXY(dense);

  const keep = douglasPeucker(x, y, REPLAY_GEOMETRY.epsilonM);
  const protectedIdx = new Array<boolean>(n).fill(false);
  protectedIdx[0] = protectedIdx[n - 1] = true;

  // Ecken: ein DP-Knoten, an dem die vereinfachte Polylinie (Sehnen zu den
  // NACHBAR-DP-Knoten, also lange Basislinien statt EMA-verschliffener
  // Kurzsehnen) um ≥ turnDeg abknickt. Vor-Anker, Scheitel und Nach-Anker
  // (±anchorM entlang der Spur) werden geschützt.
  const kept: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) kept.push(i);
  for (let k = 1; k < kept.length - 1; k++) {
    const a = kept[k - 1], i = kept[k], b = kept[k + 1];
    const h1 = headingDeg(x[a], y[a], x[i], y[i]);
    const h2 = headingDeg(x[i], y[i], x[b], y[b]);
    if (angleDiffDeg(h1, h2) < REPLAY_GEOMETRY.turnDeg) continue;
    const pre = nearestIndexAtCum(cum, cum[i] - REPLAY_GEOMETRY.anchorM);
    const post = nearestIndexAtCum(cum, cum[i] + REPLAY_GEOMETRY.anchorM);
    protectedIdx[i] = true;
    if (pre < i) { protectedIdx[pre] = true; keep[pre] = true; }
    if (post > i) { protectedIdx[post] = true; keep[post] = true; }
  }

  // Gerade Strecken dünnen: nicht geschützte Punkte nur ab minSpacingM Abstand
  // zum letzten behaltenen.
  const selected: number[] = [];
  let lastCum = -Infinity;
  for (let i = 0; i < n; i++) {
    if (!keep[i]) continue;
    if (!protectedIdx[i] && cum[i] - lastCum < REPLAY_GEOMETRY.minSpacingM) continue;
    selected.push(i);
    lastCum = cum[i];
  }
  if (selected.length < 2) return null;

  // Restore only observed display samples. A source gap with no intermediate
  // sample remains measurable; no coordinate or time is interpolated.
  const insertedForGap: ReplayGapInsertion[] = [];
  for (let k = 0; k < selected.length - 1;) {
    const a = selected[k], b = selected[k + 1];
    const spatialM = Math.hypot(x[b] - x[a], y[b] - y[a]);
    const temporalSec = Math.abs(dense[b].t - dense[a].t);
    const spatial = spatialM > REPLAY_GEOMETRY.maxReplayGapM;
    const temporal = temporalSec > REPLAY_GEOMETRY.maxReplayGapSec;
    if ((!spatial && !temporal) || b - a <= 1) { k++; continue; }
    const bySpatial = spatialM / REPLAY_GEOMETRY.maxReplayGapM >= temporalSec / REPLAY_GEOMETRY.maxReplayGapSec;
    const target = bySpatial ? (cum[a] + cum[b]) / 2 : (dense[a].t + dense[b].t) / 2;
    let chosen = a + 1;
    for (let i = a + 2; i < b; i++) {
      const candidate = bySpatial ? cum[i] : dense[i].t;
      const current = bySpatial ? cum[chosen] : dense[chosen].t;
      if (Math.abs(candidate - target) < Math.abs(current - target)) chosen = i;
    }
    selected.splice(k + 1, 0, chosen);
    insertedForGap.push({ sourceIndex: chosen, reason: spatial && temporal ? 'both' : spatial ? 'spatial_gap' : 'temporal_gap' });
  }
  const unfillableGaps: ReplayUnfillableGap[] = [];
  for (let k = 0; k < selected.length - 1; k++) {
    const a = selected[k], b = selected[k + 1];
    const spatialGapM = Math.hypot(x[b] - x[a], y[b] - y[a]);
    const temporalGapSec = Math.abs(dense[b].t - dense[a].t);
    if (spatialGapM > REPLAY_GEOMETRY.maxReplayGapM || temporalGapSec > REPLAY_GEOMETRY.maxReplayGapSec)
      unfillableGaps.push({ startSourceIndex: a, endSourceIndex: b,
        spatialGapM: Math.round(spatialGapM * 100) / 100,
        temporalGapSec: Math.round(temporalGapSec * 100) / 100,
        reason: 'no_observed_intermediate_sample' });
  }
  return { points: selected.map(i => ({ lat: dense[i].lat, lng: dense[i].lng, t: dense[i].t })), insertedForGap, unfillableGaps };
}

export function buildReplayGeometry(dense: readonly ReplayGeoPoint[]): ReplayGeoPoint[] | null {
  return buildReplayGeometryDetailed(dense)?.points ?? null;
}

/** Bequem für den Recorder: getrennte Arrays wie `run_points` + `pointsTimeSec`. */
export function replayGeometryArrays(dense: readonly ReplayGeoPoint[]):
  { points: { latitude: number; longitude: number }[]; timeSec: number[];
    insertedForGap: ReplayGapInsertion[]; unfillableGaps: ReplayUnfillableGap[] } | null {
  const detail = buildReplayGeometryDetailed(dense);
  if (!detail) return null;
  return { points: detail.points.map(p => ({ latitude: p.lat, longitude: p.lng })),
    timeSec: detail.points.map(p => p.t), insertedForGap: detail.insertedForGap,
    unfillableGaps: detail.unfillableGaps };
}

/**
 * QA (nur lesend): Richtungswechsel-Knoten der dichten Spur — dieselbe Regel, nach
 * der `buildReplayGeometry` Ecken schützt (DP-Knoten, an dem die vereinfachte
 * Polylinie um ≥ turnDeg abknickt). Verändert `buildReplayGeometry` nicht; dient
 * ausschliesslich der Geometrie-Parität in der QA-Diagnose (keine Ground Truth).
 */
export function findTurnVertices(dense: readonly ReplayGeoPoint[]): { index: number; headingChangeDeg: number }[] {
  const n = dense.length;
  if (n < 3 || n > REPLAY_GEOMETRY.maxDensePoints) return [];
  const { x, y } = toXY(dense);
  const keep = douglasPeucker(x, y, REPLAY_GEOMETRY.epsilonM);
  const kept: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) kept.push(i);
  const out: { index: number; headingChangeDeg: number }[] = [];
  for (let k = 1; k < kept.length - 1; k++) {
    const a = kept[k - 1], i = kept[k], b = kept[k + 1];
    const change = angleDiffDeg(headingDeg(x[a], y[a], x[i], y[i]), headingDeg(x[i], y[i], x[b], y[b]));
    if (change >= REPLAY_GEOMETRY.turnDeg) out.push({ index: i, headingChangeDeg: change });
  }
  return out;
}
