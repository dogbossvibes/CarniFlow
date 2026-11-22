// Fährten-Simulator (T-192) — reiner Testcode.
// Vergleicht, was die App aufgezeichnet hat, mit der wahren Fährte.
import type { SimFix } from './gpsModel';
import type { LayRunResult, RecordedCorner } from './layRunner';
import { truthAt, type TruthCorner, type TruthTrack } from './truthTrack';

export interface CornerScore {
  truth: TruthCorner;
  detected: RecordedCorner | null;
  /** Abstand erkannter Winkel ↔ wahrer Winkelpunkt (m). */
  apexErrM: number | null;
  directionCorrect: boolean;
  kindCorrect: boolean;
  /** Ecken-Abschnitt: Abstand des wahren Winkelpunkts zur aufgezeichneten Linie (m). */
  cutM: number | null;
  /** Dasselbe nach Abzug der mittleren Verschiebung der Linie (Form statt Lage). */
  cutShapeM: number | null;
  /** Dasselbe gegen den Winkelpunkt, wie das GPS ihn sah (wahrer Punkt + mittlerer Messfehler um den Winkel). Nur mit `fixes`. */
  cutGpsM: number | null;
}

export interface LayScore {
  cornersTruth: number;
  cornersFound: number;
  cornersMissed: number;
  /** Erkannte Winkel ohne wahren Winkel in der Nähe. */
  cornersSpurious: number;
  directionCorrect: number;
  kindCorrect: number;
  apexErrMeanM: number | null;
  corners: CornerScore[];
  /** Seitlicher Abstand der aufgezeichneten Linie zur wahren Fährte. */
  lineErrMeanM: number | null;
  lineErrP95M: number | null;
  lineErrMaxM: number | null;
  /** Dasselbe nach Abzug der mittleren Verschiebung — misst die FORM, nicht die absolute Lage. */
  shapeErrMeanM: number | null;
  /**
   * Ecken-Abschnitt (m): Abstand jedes wahren Winkelpunkts zur aufgezeichneten Linie, über alle Winkel der Fährte.
   * Untergrenze ist nicht 0: Der Winkel wird mit Radius gegangen (90° bei 0,6 m Radius ≈ 0,25 m).
   */
  cornerCutMeanM: number | null;
  cornerCutMaxM: number | null;
  /** Nach Abzug der mittleren Verschiebung der Linie. */
  cornerCutShapeMeanM: number | null;
  /** Gegen den Winkelpunkt, wie das GPS ihn sah — trennt die Verarbeitung vom Messfehler. Nur mit `fixes`. */
  cornerCutGpsMeanM: number | null;
  /** Abstand der von der App GEMELDETEN Winkelpunkte zur aufgezeichneten Linie (dieselbe Messung wie an Feldaufnahmen). */
  apexToLineMeanM: number | null;
  /** Länge des gespeicherten Linienzugs (m) und Abweichung zur wahren Länge (%). Nicht die angezeigte Distanz (`distanceErrPct`). */
  lineLengthM: number;
  lineLengthErrPct: number;
  /** Unruhe: mittlere Richtungsänderung je Linienpunkt (Grad) ausserhalb von 4 m um die wahren Winkel. */
  lineWiggleDeg: number | null;
  /** (aufgezeichnete Länge − wahre Länge) / wahre Länge. */
  distanceErrPct: number;
  /** Anteil der wahren Fährte, der von der Linie abgedeckt ist (0..1). */
  coverage: number;
  startErrM: number | null;
  startDelayS: number | null;
  linePoints: number;
  rejectedFixes: number;
}

/** Suchradius für die Zuordnung erkannter Winkel (m): grosszügig, aber kleiner als der halbe kürzeste Schenkel. */
export function matchRadiusM(c: TruthCorner): number {
  return Math.max(4, Math.min(12, 0.45 * Math.min(c.legBeforeM || Infinity, c.legAfterM || Infinity)));
}

function quantile(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

/** Nächster Punkt auf dem dichten wahren Weg, gesucht in einem Fenster um den letzten Treffer. */
function nearestOnPath(truth: TruthTrack, x: number, y: number, hint: number, windowPts: number): { index: number; dx: number; dy: number } {
  const { path } = truth;
  const lo = Math.max(0, hint - windowPts), hi = Math.min(path.x.length - 1, hint + windowPts);
  let best = lo, bestD = Infinity;
  for (let i = lo; i <= hi; i++) {
    const d = (path.x[i] - x) ** 2 + (path.y[i] - y) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return { index: best, dx: x - path.x[best], dy: y - path.y[best] };
}

/** Abstand eines Punkts zum Linienzug (m); null bei weniger als zwei Punkten. */
export function distanceToPolylineM(line: readonly { x: number; y: number }[], x: number, y: number): number | null {
  if (line.length < 2) return null;
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)));
  }
  return best;
}

export function polylineLengthM(line: readonly { x: number; y: number }[]): number {
  let sum = 0;
  for (let i = 1; i < line.length; i++) sum += Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y);
  return sum;
}

/** Mittlere Richtungsänderung je inneren Linienpunkt (Grad), ohne Punkte näher als `skipM` an einem der `near`-Punkte. */
export function lineWiggleDeg(line: readonly { x: number; y: number }[], near: readonly { x: number; y: number }[] = [], skipM = 4): number | null {
  let sum = 0, n = 0;
  for (let i = 1; i < line.length - 1; i++) {
    const p = line[i];
    if (near.some(c => Math.hypot(c.x - p.x, c.y - p.y) < skipM)) continue;
    const h1 = Math.atan2(p.y - line[i - 1].y, p.x - line[i - 1].x), h2 = Math.atan2(line[i + 1].y - p.y, line[i + 1].x - p.x);
    let d = ((h2 - h1) * 180) / Math.PI;
    while (d > 180) d -= 360; while (d < -180) d += 360;
    sum += Math.abs(d); n++;
  }
  return n ? sum / n : null;
}

/** Mittlerer Messfehler (Vektor) der GPS-Messungen innerhalb von `windowS` um den Zeitpunkt `tS` der wahren Fährte. */
function gpsErrorAround(truth: TruthTrack, fixes: readonly SimFix[], t0Ms: number, tS: number, windowS = 4): { dx: number; dy: number } | null {
  let dx = 0, dy = 0, n = 0;
  for (const f of fixes) {
    const fS = (f.tMs - t0Ms) / 1000;
    if (Math.abs(fS - tS) > windowS) continue;
    const at = truthAt(truth, fS);
    dx += f.x - at.x; dy += f.y - at.y; n++;
  }
  return n ? { dx: dx / n, dy: dy / n } : null;
}

export function scoreLay(truth: TruthTrack, run: LayRunResult, t0Ms: number, fixes?: readonly SimFix[]): LayScore {
  // ── Winkel: eins-zu-eins-Zuordnung, nächstes Paar zuerst.
  const pairs: { ti: number; di: number; d: number }[] = [];
  truth.corners.forEach((c, ti) => run.corners.forEach((r, di) => {
    const d = Math.hypot(r.x - c.x, r.y - c.y);
    if (d <= matchRadiusM(c)) pairs.push({ ti, di, d });
  }));
  pairs.sort((a, b) => a.d - b.d);
  const truthTaken = new Map<number, { di: number; d: number }>();
  const detTaken = new Set<number>();
  for (const p of pairs) {
    if (truthTaken.has(p.ti) || detTaken.has(p.di)) continue;
    truthTaken.set(p.ti, { di: p.di, d: p.d }); detTaken.add(p.di);
  }
  const corners: CornerScore[] = truth.corners.map((c, ti) => {
    const m = truthTaken.get(ti);
    const detected = m ? run.corners[m.di] : null;
    const detectedDir = detected ? (detected.kind.includes('links') ? 'links' : detected.kind.includes('rechts') ? 'rechts' : null) : null;
    return {
      truth: c, detected, apexErrM: m ? m.d : null,
      directionCorrect: detectedDir === c.dir,
      kindCorrect: !!detected && c.acceptableKinds.includes(detected.kind),
      cutM: distanceToPolylineM(run.line, c.x, c.y), cutShapeM: null, cutGpsM: null,
    };
  });
  const found = corners.filter(c => c.detected);
  const apexErrs = found.map(c => c.apexErrM as number);

  // ── Linie: seitlicher Abstand zum wahren Weg.
  const ds = truth.path.s[1] - truth.path.s[0] || 0.1;
  const windowPts = Math.round(40 / ds);
  const errs: number[] = [], dxs: number[] = [], dys: number[] = [];
  let hint = 0, maxIndex = 0, minIndex = truth.path.x.length - 1;
  for (const p of run.line) {
    const n = nearestOnPath(truth, p.x, p.y, hint, windowPts);
    hint = n.index; maxIndex = Math.max(maxIndex, n.index); minIndex = Math.min(minIndex, n.index);
    errs.push(Math.hypot(n.dx, n.dy)); dxs.push(n.dx); dys.push(n.dy);
  }
  const sorted = [...errs].sort((a, b) => a - b);
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  let shapeErrMeanM: number | null = null;
  if (errs.length) {
    const mx = mean(dxs), my = mean(dys);
    shapeErrMeanM = mean(dxs.map((dx, i) => Math.hypot(dx - mx, dys[i] - my)));
    for (const c of corners) c.cutShapeM = distanceToPolylineM(run.line, c.truth.x + mx, c.truth.y + my);
  }
  if (fixes) for (const c of corners) {
    const e = gpsErrorAround(truth, fixes, t0Ms, c.truth.tS);
    if (e) c.cutGpsM = distanceToPolylineM(run.line, c.truth.x + e.dx, c.truth.y + e.dy);
  }
  const meanOf = (values: (number | null)[]) => { const v = values.filter((x): x is number => x != null); return v.length ? mean(v) : null; };
  const cuts = corners.map(c => c.cutM).filter((x): x is number => x != null);
  const lineLengthM = polylineLengthM(run.line);
  const first = run.line[0];
  return {
    cornersTruth: truth.corners.length,
    cornersFound: found.length,
    cornersMissed: truth.corners.length - found.length,
    cornersSpurious: run.corners.length - detTaken.size,
    directionCorrect: found.filter(c => c.directionCorrect).length,
    kindCorrect: found.filter(c => c.kindCorrect).length,
    apexErrMeanM: apexErrs.length ? mean(apexErrs) : null,
    corners,
    lineErrMeanM: errs.length ? mean(errs) : null,
    lineErrP95M: errs.length ? quantile(sorted, 0.95) : null,
    lineErrMaxM: errs.length ? sorted[sorted.length - 1] : null,
    shapeErrMeanM,
    cornerCutMeanM: meanOf(cuts),
    cornerCutMaxM: cuts.length ? Math.max(...cuts) : null,
    cornerCutShapeMeanM: meanOf(corners.map(c => c.cutShapeM)),
    cornerCutGpsMeanM: meanOf(corners.map(c => c.cutGpsM)),
    apexToLineMeanM: meanOf(run.corners.map(r => distanceToPolylineM(run.line, r.x, r.y))),
    lineLengthM,
    lineLengthErrPct: truth.lengthM > 0 ? ((lineLengthM - truth.lengthM) / truth.lengthM) * 100 : 0,
    lineWiggleDeg: lineWiggleDeg(run.line, truth.corners),
    distanceErrPct: truth.lengthM > 0 ? ((run.distanceM - truth.lengthM) / truth.lengthM) * 100 : 0,
    coverage: errs.length ? Math.max(0, truth.path.s[maxIndex] - truth.path.s[minIndex]) / truth.lengthM : 0,
    startErrM: first ? Math.hypot(first.x - truth.path.x[0], first.y - truth.path.y[0]) : null,
    startDelayS: first ? (first.tMs - t0Ms) / 1000 - truth.walk.startStandS : null,
    linePoints: run.line.length,
    rejectedFixes: Object.values(run.rejects).reduce((s, v) => s + (v ?? 0), 0),
  };
}
