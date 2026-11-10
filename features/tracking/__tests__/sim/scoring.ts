// Fährten-Simulator (T-192) — reiner Testcode.
// Vergleicht, was die App aufgezeichnet hat, mit der wahren Fährte.
import type { LayRunResult, RecordedCorner } from './layRunner';
import type { TruthCorner, TruthTrack } from './truthTrack';

export interface CornerScore {
  truth: TruthCorner;
  detected: RecordedCorner | null;
  /** Abstand erkannter Winkel ↔ wahrer Winkelpunkt (m). */
  apexErrM: number | null;
  directionCorrect: boolean;
  kindCorrect: boolean;
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

export function scoreLay(truth: TruthTrack, run: LayRunResult, t0Ms: number): LayScore {
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
  }
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
    distanceErrPct: truth.lengthM > 0 ? ((run.distanceM - truth.lengthM) / truth.lengthM) * 100 : 0,
    coverage: errs.length ? Math.max(0, truth.path.s[maxIndex] - truth.path.s[minIndex]) / truth.lengthM : 0,
    startErrM: first ? Math.hypot(first.x - truth.path.x[0], first.y - truth.path.y[0]) : null,
    startDelayS: first ? (first.tMs - t0Ms) / 1000 - truth.walk.startStandS : null,
    linePoints: run.line.length,
    rejectedFixes: Object.values(run.rejects).reduce((s, v) => s + (v ?? 0), 0),
  };
}
