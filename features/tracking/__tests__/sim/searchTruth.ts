// Fährten-Simulator (T-192) — reiner Testcode.
// Die WAHRE Absuche: der Hund folgt der gelegten Fährte (mit seitlichem Pendeln,
// Überlaufen und Kreisen am Winkel, Verweisen der Gegenstände), der Hundeführer
// hängt an der Leine dahinter. Das Handy trägt der Hundeführer — die App sieht
// also dessen Weg, nicht die Hundenase.
//
// Für Sport-Fährtenhunde gibt es KEINE Messstudien; die Hundetypen sind
// einstellbare Annahmen (README.md), keine Verhaltensmodelle.
import { gaussMarkovStep, type Rng } from './rng';
import { TRUTH_DT_S, type Timeline, type TruthSample, type TruthTrack } from './truthTrack';

export interface DogSpec {
  name: string;
  speedMps: number;
  speedJitterMps: number;
  /** Seitliches Pendeln um die Fährte: Streuung (m) und Länge, über die es sich ändert (m). */
  lateralSigmaM: number; lateralCorrLenM: number;
  /** Mittleres Überlaufen am Winkel (m). */
  overshootMeanM: number;
  /** Wahrscheinlichkeit und Radius eines Suchkreises nach dem Überlaufen. */
  castProb: number; castRadiusM: number;
  /** Wahrscheinlichkeit, dass ein Gegenstand verwiesen wird. */
  indicateProb: number;
  /** Aufnehmen der Witterung am Abgang (s). */
  startDwellS: number;
}

export const DOGS: Record<'ruhig' | 'eifrig' | 'unsicher', DogSpec> = {
  ruhig:    { name: 'Ruhiger Sporthund',   speedMps: 0.6, speedJitterMps: 0.05, lateralSigmaM: 0.3, lateralCorrLenM: 6,  overshootMeanM: 0.8, castProb: 0.1, castRadiusM: 1.5, indicateProb: 1,   startDwellS: 6 },
  eifrig:   { name: 'Eifriger, schneller Hund', speedMps: 1.1, speedJitterMps: 0.12, lateralSigmaM: 0.8, lateralCorrLenM: 8,  overshootMeanM: 3,   castProb: 0.4, castRadiusM: 2.5, indicateProb: 0.9, startDwellS: 3 },
  unsicher: { name: 'Unsicherer, weit pendelnder Hund', speedMps: 0.8, speedJitterMps: 0.15, lateralSigmaM: 2.5, lateralCorrLenM: 10, overshootMeanM: 5,   castProb: 0.6, castRadiusM: 4,   indicateProb: 0.7, startDwellS: 8 },
};

export interface HandlerSpec {
  /** Leinenlänge (m): Abstand Hundeführer ↔ Hund bei gespannter Leine. */
  lineM: number;
  /** Aufenthalt beim Hund am Gegenstand: loben, aufnehmen, zeigen (s). */
  pickupS: number;
  approachSpeedMps: number;
  /** Stehen am Abgang vor dem Ansetzen (s). */
  preStandS: number;
}
export const DEFAULT_HANDLER: HandlerSpec = { lineM: 10, pickupS: 8, approachSpeedMps: 1.0, preStandS: 5 };

export interface SearchArticleTruth { index: number; atM: number; x: number; y: number; indicated: boolean; arrivedTS: number | null; leftTS: number | null }

export interface SearchTruth {
  dog: DogSpec;
  handler: HandlerSpec;
  /** Weg des Hundeführers (= Weg des Handys). */
  handlerTimeline: Timeline;
  dogSamples: { tS: number; x: number; y: number; progressM: number; lateralM: number }[];
  articles: SearchArticleTruth[];
  /** Überlaufen je Winkel (m). */
  overshootsM: number[];
  /** Wahre mittlere/maximale seitliche Abweichung des Hundes und des Hundeführers von der Fährte (m). */
  dogMeanLateralM: number; dogMaxLateralM: number;
  handlerMeanLateralM: number; handlerMaxLateralM: number;
  durationS: number;
}

const RAD = Math.PI / 180;

interface PathPoint { x: number; y: number; progressM: number }

/** Der Weg der Hundenase: Fährte + Pendeln, mit Überlaufen/Kreisen an den Winkeln. */
function buildDogPath(lay: TruthTrack, dog: DogSpec, rng: Rng): { points: PathPoint[]; overshootsM: number[] } {
  const { path } = lay;
  const ds = path.s[1] - path.s[0];
  const at = (s: number) => {
    const i = Math.max(0, Math.min(path.s.length - 1, Math.round(s / ds)));
    return { x: path.x[i], y: path.y[i], headingDeg: path.headingDeg[i], s: path.s[i] };
  };
  // Detours je Winkel vorbereiten.
  const detours = lay.corners.map(c => {
    const raw = -Math.log(Math.max(1e-6, rng())) * dog.overshootMeanM;
    const overshoot = Math.min(3 * dog.overshootMeanM, raw);
    return { corner: c, overshoot, cast: overshoot >= 0.5 && rng() < dog.castProb, rejoinM: Math.max(2, 0.8 * overshoot) };
  });
  // Seitliches Pendeln als glatte Überlagerung weniger Wellen (kein Zickzack von Punkt zu Punkt).
  const waves = Array.from({ length: 4 }, () => ({ lambda: dog.lateralCorrLenM * (2 + 4 * rng()), phase: 2 * Math.PI * rng() }));
  const sway = (dist: number) => dog.lateralSigmaM * Math.SQRT1_2 * waves.reduce((sum, w) => sum + Math.sin((2 * Math.PI * dist) / w.lambda + w.phase), 0);
  const points: PathPoint[] = [];
  let s = 0;
  let di = 0;
  while (s <= lay.lengthM) {
    const d = detours[di];
    if (d && d.overshoot >= 0.5 && s >= d.corner.sM - 1) {
      // Geradeaus über den Winkel hinaus, optional ein Suchkreis, dann zurück auf den neuen Schenkel.
      const inHeading = at(d.corner.sM - 1.5).headingDeg * RAD;
      const from = points[points.length - 1] ?? { x: 0, y: 0, progressM: 0 };
      const push = (x: number, y: number, progressM: number) => points.push({ x, y, progressM });
      const line = (ax: number, ay: number, bx: number, by: number, p0: number, p1: number) => {
        const len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(len / ds));
        for (let i = 1; i <= n; i++) push(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n, p0 + ((p1 - p0) * i) / n);
      };
      line(from.x, from.y, d.corner.x, d.corner.y, from.progressM, d.corner.sM);
      const ox = d.corner.x + Math.cos(inHeading) * d.overshoot, oy = d.corner.y + Math.sin(inHeading) * d.overshoot;
      line(d.corner.x, d.corner.y, ox, oy, d.corner.sM, d.corner.sM);
      let cx = ox, cy = oy;
      if (d.cast) {
        const sign = d.corner.turnDeg > 0 ? 1 : -1;
        const centerX = ox - Math.sin(inHeading) * dog.castRadiusM * sign, centerY = oy + Math.cos(inHeading) * dog.castRadiusM * sign;
        const n = Math.max(8, Math.round((2 * Math.PI * dog.castRadiusM) / ds));
        for (let i = 1; i <= n; i++) {
          const a = inHeading + (2 * Math.PI * i * sign) / n;
          cx = centerX + Math.sin(a) * dog.castRadiusM * sign; cy = centerY - Math.cos(a) * dog.castRadiusM * sign;
          push(cx, cy, d.corner.sM);
        }
      }
      const rejoinS = Math.min(lay.lengthM, d.corner.sM + d.rejoinM);
      const r = at(rejoinS);
      line(cx, cy, r.x, r.y, d.corner.sM, rejoinS);
      s = rejoinS + ds; di++;
      continue;
    }
    if (d && s > d.corner.sM + 0.5) di++;
    // An Abgang, Ende und Winkeln läuft das Pendeln aus (dort übernimmt das Überlaufen).
    const nearCorner = Math.min(...lay.corners.map(c => Math.abs(s - c.sM)), Infinity);
    const offset = sway(s);
    const taper = Math.max(0, Math.min(1, s / 2, (lay.lengthM - s) / 2, nearCorner / 3));
    const p = at(s);
    const h = p.headingDeg * RAD;
    points.push({ x: p.x - Math.sin(h) * offset * taper, y: p.y + Math.cos(h) * offset * taper, progressM: s });
    s += ds;
  }
  return { points, overshootsM: detours.map(d => (d.overshoot >= 0.5 ? d.overshoot : 0)) };
}

/** Seitlicher Abstand eines Punkts zur wahren Fährte, gesucht um den erwarteten Fortschritt. */
function lateralToTrack(lay: TruthTrack, x: number, y: number, progressM: number): number {
  const { path } = lay;
  const ds = path.s[1] - path.s[0];
  const centre = Math.round(progressM / ds), w = Math.round(25 / ds);
  let best = Infinity;
  for (let i = Math.max(0, centre - w); i <= Math.min(path.x.length - 1, centre + w); i++) {
    const d = (path.x[i] - x) ** 2 + (path.y[i] - y) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

export function buildSearchTruth(lay: TruthTrack, dog: DogSpec, handler: HandlerSpec, rng: Rng): SearchTruth {
  const { points, overshootsM } = buildDogPath(lay, dog, rng);
  const dt = TRUTH_DT_S;
  const articles: SearchArticleTruth[] = lay.articles.map(a => ({
    index: a.index, atM: a.atM, x: a.x, y: a.y, indicated: rng() < dog.indicateProb, arrivedTS: null, leftTS: null,
  }));
  // Punktindex, an dem die Hundenase den jeweiligen Gegenstand erreicht.
  const articleIndex = articles.map(a => {
    const i = points.findIndex(p => p.progressM >= a.atM - 1e-6);
    return i < 0 ? points.length - 1 : i;
  });

  const startHeading = lay.path.headingDeg[0] * RAD;
  let hx = lay.path.x[0] - Math.cos(startHeading) * 0.5, hy = lay.path.y[0] - Math.sin(startHeading) * 0.5;
  const handlerRaw: { tS: number; x: number; y: number }[] = [];
  const dogSamples: SearchTruth['dogSamples'] = [];
  let t = 0, idx = 0, frac = 0, ou = 0;
  let nextArticle = 0;
  type Phase = 'pre' | 'dwell' | 'track' | 'approach' | 'pickup' | 'done';
  let phase: Phase = 'pre';
  let phaseLeft = handler.preStandS;
  const cornerS = lay.corners.map(c => c.sM);
  const record = () => {
    const p = points[idx];
    handlerRaw.push({ tS: t, x: hx, y: hy });
    dogSamples.push({ tS: t, x: p.x, y: p.y, progressM: p.progressM, lateralM: lateralToTrack(lay, p.x, p.y, p.progressM) });
  };
  let guard = 0;
  while (phase !== 'done' && guard++ < 4_000_000) {
    record();
    const p = points[idx];
    if (phase === 'pre') { phaseLeft -= dt; if (phaseLeft <= 0) { phase = 'dwell'; phaseLeft = dog.startDwellS; } }
    else if (phase === 'dwell') { phaseLeft -= dt; if (phaseLeft <= 0) phase = 'track'; }
    else if (phase === 'track') {
      ou = gaussMarkovStep(ou, dog.speedJitterMps, 3, dt, rng);
      // Nach einem Winkel sucht der Hund kurz langsamer (Thesen 1993: Tempo fällt beim Entscheiden auf ~60 %).
      const afterCorner = cornerS.some(cs => p.progressM >= cs && p.progressM - cs < 3);
      let move = Math.max(0.15, (dog.speedMps + ou) * (afterCorner ? 0.65 : 1)) * dt;
      while (move > 0 && idx < points.length - 1) {
        const a = points[idx], b = points[idx + 1];
        const seg = Math.hypot(b.x - a.x, b.y - a.y) * (1 - frac);
        if (move >= seg) { move -= seg; idx++; frac = 0; } else { frac += move / Math.max(1e-9, Math.hypot(b.x - a.x, b.y - a.y)); move = 0; }
        if (nextArticle < articles.length && idx >= articleIndex[nextArticle]) {
          const art = articles[nextArticle];
          if (art.indicated) { art.arrivedTS = t; phase = 'approach'; break; }
          nextArticle++;
        }
      }
      if (phase === 'track' && idx >= points.length - 1) { phase = 'pickup'; phaseLeft = 3; }
      // Gespannte Leine: der Hundeführer wird hinterhergezogen (Schleppkurve).
      const q = points[idx];
      const dist = Math.hypot(hx - q.x, hy - q.y);
      if (dist > handler.lineM) { hx = q.x + ((hx - q.x) * handler.lineM) / dist; hy = q.y + ((hy - q.y) * handler.lineM) / dist; }
    } else if (phase === 'approach') {
      // Hund liegt am Gegenstand, der Hundeführer geht zu ihm.
      const dist = Math.hypot(hx - p.x, hy - p.y);
      if (dist <= 1.02) { phase = 'pickup'; phaseLeft = handler.pickupS; }   // Toleranz: sonst bleibt der Abstand durch Rundung knapp über 1 m hängen
      else { const step = Math.min(dist - 1, handler.approachSpeedMps * dt); hx += ((p.x - hx) * step) / dist; hy += ((p.y - hy) * step) / dist; }
    } else if (phase === 'pickup') {
      phaseLeft -= dt;
      if (phaseLeft <= 0) {
        if (nextArticle < articles.length && articles[nextArticle].arrivedTS != null && articles[nextArticle].leftTS == null) {
          articles[nextArticle].leftTS = t; nextArticle++;
        }
        phase = idx >= points.length - 1 ? 'done' : 'track';
      }
    }
    t += dt;
  }
  record();

  // Tempo und Richtung des Hundeführers aus dem Weg ableiten (Richtung entrollt, im Stand gehalten).
  const samples: TruthSample[] = [];
  let heading = lay.path.headingDeg[0], sM = 0;
  const window = Math.round(0.5 / dt);
  for (let i = 0; i < handlerRaw.length; i++) {
    const a = handlerRaw[Math.max(0, i - window)], b = handlerRaw[Math.min(handlerRaw.length - 1, i + window)];
    const dx = b.x - a.x, dy = b.y - a.y, span = Math.max(dt, b.tS - a.tS);
    const speed = Math.hypot(dx, dy) / span;
    if (speed > 0.15) {
      const target = Math.atan2(dy, dx) / RAD;
      let diff = (target - heading) % 360; if (diff > 180) diff -= 360; if (diff < -180) diff += 360;
      heading += diff;
    }
    if (i > 0) sM += Math.hypot(handlerRaw[i].x - handlerRaw[i - 1].x, handlerRaw[i].y - handlerRaw[i - 1].y);
    samples.push({ tS: handlerRaw[i].tS, x: handlerRaw[i].x, y: handlerRaw[i].y, sM, headingDeg: heading, speedMps: speed < 0.05 ? 0 : speed });
  }

  const tracking = dogSamples.filter((_, i) => i % 4 === 0);
  const dogLat = tracking.map(d => d.lateralM);
  const handlerLat = tracking.map((d, i) => lateralToTrack(lay, handlerRaw[i * 4].x, handlerRaw[i * 4].y, Math.max(0, d.progressM - handler.lineM)));
  const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  return {
    dog, handler, handlerTimeline: { dtS: dt, durationS: t, samples }, dogSamples, articles, overshootsM,
    dogMeanLateralM: mean(dogLat), dogMaxLateralM: Math.max(0, ...dogLat),
    handlerMeanLateralM: mean(handlerLat), handlerMaxLateralM: Math.max(0, ...handlerLat),
    durationS: t,
  };
}
