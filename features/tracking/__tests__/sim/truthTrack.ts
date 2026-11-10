// Fährten-Simulator (T-192) — reiner Testcode.
// Erzeugt die WAHRE Fährte: Geometrie (Schenkel, Winkel, Bögen, Gegenstände) und
// den zeitlichen Ablauf eines Fährtenlegers. Alles in lokalen Metern
// (x = Ost, y = Nord). Positive Winkel = Linksdrehung.
import type { AngleKind } from '../../store/trackingStore';
import { NORMAL_MAX, NORMAL_MIN, SPITZ_MAX, SPITZ_MIN } from '../../utils/shortLegCornerDetection';
import { gaussMarkovStep, type Rng } from './rng';

export type TrackPart =
  | { leg: number }                                    // gerader Schenkel in Metern
  | { turn: number }                                   // Richtungsänderung in Grad (+ links, − rechts)
  | { arc: { radiusM: number; sweepDeg: number } };    // Bogen (z. B. IFH-3-Halbkreis), tangential angeschlossen

export interface TrackSpec {
  name: string;
  parts: TrackPart[];
  /** Gegenstände als Wegstrecke ab Start (Meter). */
  articlesAtM?: number[];
}

export interface WalkSpec {
  speedMps: number;
  /** Tempo-Schwankung (RMS, m/s). Kowalsky 2021: ~0,05 auf Wiese. */
  speedJitterMps: number;
  /** Radius, mit dem ein Winkel real gegangen wird. ANNAHME (keine Messdaten gefunden). */
  cornerRadiusM: number;
  /** Anteil, um den das Tempo im Winkel sinkt (0,3 = 30 % langsamer). Orendurff 2006: 20–40 %. */
  cornerSlow: number;
  /** Stehen am Abgang vor dem Losgehen (s). */
  startStandS: number;
  /** Stehen am Ende (s). */
  endStandS: number;
}

export const DEFAULT_WALK: WalkSpec = {
  speedMps: 1.0, speedJitterMps: 0.05, cornerRadiusM: 0.6, cornerSlow: 0.3, startStandS: 6, endStandS: 3,
};

export interface TruthSample { tS: number; x: number; y: number; sM: number; headingDeg: number; speedMps: number }

export interface TruthCorner {
  index: number;
  /** Nomineller Winkelpunkt (Schnittpunkt der beiden Schenkel). */
  x: number; y: number;
  /** Wegstrecke und Zeit in der Mitte der gegangenen Kurve. */
  sM: number; tS: number;
  turnDeg: number;
  dir: 'links' | 'rechts';
  /** Innenwinkel = 180° − |Richtungsänderung| (90° = rechter Winkel, 45° = Spitzwinkel). */
  interiorDeg: number;
  /** Klasse, die die App nach ihren eigenen Schwellen vergeben sollte; null = ausserhalb der App-Klassen. */
  expectedKind: AngleKind | null;
  /** Alle Klassen, die als richtig gelten (an Klassengrenzen beide Nachbarn). */
  acceptableKinds: AngleKind[];
  legBeforeM: number; legAfterM: number;
}

export interface TruthArticle { index: number; atM: number; x: number; y: number; tS: number }

export interface TruthTrack {
  spec: TrackSpec;
  walk: WalkSpec;
  dtS: number;
  samples: TruthSample[];
  corners: TruthCorner[];
  articles: TruthArticle[];
  lengthM: number;
  durationS: number;
  /** Dichter Weg (alle PATH_DS Meter) für Abstandsberechnungen. */
  path: { x: number[]; y: number[]; s: number[]; headingDeg: number[] };
}

export const PATH_DS = 0.1;
export const TRUTH_DT_S = 0.05;
/** Toleranz an Klassengrenzen (Grad Innenwinkel), innerhalb derer beide Nachbarklassen als richtig zählen. */
export const KIND_BOUNDARY_TOLERANCE_DEG = 5;

/** Klassifikation nach den Schwellen der App (shortLegCornerDetection). */
export function expectedKindFor(turnDeg: number): { expected: AngleKind | null; acceptable: AngleKind[] } {
  const dir: 'links' | 'rechts' = turnDeg > 0 ? 'links' : 'rechts';
  const spitz = (dir === 'links' ? 'spitz_links' : 'spitz_rechts') as AngleKind;
  const interior = 180 - Math.abs(turnDeg);
  const inNormal = (v: number) => v >= NORMAL_MIN && v <= NORMAL_MAX;
  const inSpitz = (v: number) => v >= SPITZ_MIN && v <= SPITZ_MAX;
  const expected: AngleKind | null = inNormal(interior) ? dir : inSpitz(interior) ? spitz : null;
  const acceptable = new Set<AngleKind>();
  for (const d of [-KIND_BOUNDARY_TOLERANCE_DEG, 0, KIND_BOUNDARY_TOLERANCE_DEG]) {
    if (inNormal(interior + d)) acceptable.add(dir);
    if (inSpitz(interior + d)) acceptable.add(spitz);
  }
  return { expected, acceptable: [...acceptable] };
}

type Prim =
  | { type: 'line'; len: number }
  | { type: 'arc'; r: number; sweepRad: number; corner?: { turnDeg: number; tangentM: number } };

const RAD = Math.PI / 180;

function toPrims(spec: TrackSpec, cornerRadiusM: number): Prim[] {
  const prims: Prim[] = [];
  const turnAt: number[] = [];
  for (const p of spec.parts) {
    if ('leg' in p) prims.push({ type: 'line', len: p.leg });
    else if ('arc' in p) prims.push({ type: 'arc', r: p.arc.radiusM, sweepRad: p.arc.sweepDeg * RAD });
    else { turnAt.push(prims.length); prims.push({ type: 'arc', r: 0, sweepRad: p.turn * RAD, corner: { turnDeg: p.turn, tangentM: 0 } }); }
  }
  // Winkel werden als kleine Kurve gegangen: beide Nachbar-Schenkel um die Tangentenlänge kürzen.
  for (const i of turnAt) {
    const before = prims[i - 1]; const after = prims[i + 1]; const c = prims[i];
    if (!before || !after || before.type !== 'line' || after.type !== 'line' || c.type !== 'arc' || !c.corner)
      throw new Error(`TrackSpec "${spec.name}": ein Winkel braucht davor und danach einen geraden Schenkel.`);
    const half = Math.abs(c.sweepRad) / 2;
    if (half < 1e-6) { c.r = 1; c.sweepRad = 0; continue; }
    const want = cornerRadiusM * Math.tan(half);
    const tangent = Math.min(want, before.len * 0.45, after.len * 0.45);
    c.r = tangent / Math.tan(half);
    c.corner.tangentM = tangent;
    before.len -= tangent; after.len -= tangent;
  }
  return prims;
}

/** Baut Geometrie und Zeitablauf der wahren Fährte. */
export function buildTruthTrack(spec: TrackSpec, walk: WalkSpec, rng: Rng): TruthTrack {
  const prims = toPrims(spec, walk.cornerRadiusM);
  const px: number[] = [0], py: number[] = [0], ps: number[] = [0], ph: number[] = [90];
  let x = 0, y = 0, heading = Math.PI / 2, s = 0;
  const push = () => { px.push(x); py.push(y); ps.push(s); ph.push(heading / RAD); };
  const cornerGeo: { x: number; y: number; sM: number; turnDeg: number; legBeforeM: number; legAfterM: number }[] = [];
  const nominalLegs = spec.parts.filter((p): p is { leg: number } => 'leg' in p).map(p => p.leg);
  let legCounter = 0;

  for (const prim of prims) {
    if (prim.type === 'line') {
      legCounter++;
      const n = Math.max(1, Math.round(prim.len / PATH_DS));
      const step = prim.len / n;
      for (let i = 0; i < n; i++) { x += Math.cos(heading) * step; y += Math.sin(heading) * step; s += step; push(); }
      continue;
    }
    const sign = Math.sign(prim.sweepRad) || 1;
    const sweep = Math.abs(prim.sweepRad);
    if (prim.corner) {
      // Nomineller Winkelpunkt = Kurvenanfang + Tangentenlänge in alter Richtung.
      cornerGeo.push({
        x: x + Math.cos(heading) * prim.corner.tangentM, y: y + Math.sin(heading) * prim.corner.tangentM,
        sM: s + (prim.r * sweep) / 2, turnDeg: prim.corner.turnDeg,
        legBeforeM: nominalLegs[legCounter - 1] ?? 0, legAfterM: nominalLegs[legCounter] ?? 0,
      });
    }
    if (sweep < 1e-9) continue;
    const arcLen = prim.r * sweep;
    const n = Math.max(2, Math.round(arcLen / PATH_DS));
    const dTheta = sweep / n;
    const cx = x - Math.sin(heading) * prim.r * sign, cy = y + Math.cos(heading) * prim.r * sign;
    for (let i = 0; i < n; i++) {
      heading += dTheta * sign;
      x = cx + Math.sin(heading) * prim.r * sign; y = cy - Math.cos(heading) * prim.r * sign;
      s += arcLen / n; push();
    }
  }
  const lengthM = s;

  const at = (dist: number) => {
    const d = Math.max(0, Math.min(lengthM, dist));
    let lo = 0, hi = ps.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ps[mid] <= d) lo = mid; else hi = mid; }
    const span = ps[hi] - ps[lo];
    const f = span > 0 ? (d - ps[lo]) / span : 0;
    return { x: px[lo] + (px[hi] - px[lo]) * f, y: py[lo] + (py[hi] - py[lo]) * f, headingDeg: ph[lo] + (ph[hi] - ph[lo]) * f };
  };

  // ── Zeitablauf: stehen, gehen (mit Tempo-Schwankung und Abbremsen im Winkel), stehen.
  const samples: TruthSample[] = [];
  const cornerS = cornerGeo.map(c => c.sM);
  const cornerT: (number | null)[] = cornerGeo.map(() => null);
  // Der letzte Gegenstand liegt am Fährtenende; die gegangene Kurve ist minimal kürzer als die Nennlänge.
  const articleS = [...(spec.articlesAtM ?? [])].map(a => Math.max(0, Math.min(lengthM, a))).sort((a, b) => a - b);
  const articleT: (number | null)[] = articleS.map(() => null);
  let t = 0, dist = 0, ou = 0;
  const record = (v: number) => { const p = at(dist); samples.push({ tS: t, x: p.x, y: p.y, sM: dist, headingDeg: p.headingDeg, speedMps: v }); };
  for (let i = 0, n = Math.round(walk.startStandS / TRUTH_DT_S); i < n; i++) { record(0); t += TRUTH_DT_S; }
  let guard = 0;
  while (dist < lengthM && guard++ < 5_000_000) {
    ou = gaussMarkovStep(ou, walk.speedJitterMps, 3, TRUTH_DT_S, rng);
    let slow = 0;
    for (const cs of cornerS) { const d = dist - cs; slow = Math.max(slow, Math.exp(-0.5 * d * d)); }
    const v = Math.max(0.2, (walk.speedMps + ou) * (1 - walk.cornerSlow * slow));
    record(v);
    const next = Math.min(lengthM, dist + v * TRUTH_DT_S);
    cornerS.forEach((cs, i) => { if (cornerT[i] == null && next >= cs) cornerT[i] = t; });
    articleS.forEach((as, i) => { if (articleT[i] == null && next >= as) articleT[i] = t; });
    dist = next; t += TRUTH_DT_S;
  }
  for (let i = 0, n = Math.max(1, Math.round(walk.endStandS / TRUTH_DT_S)); i < n; i++) { record(0); t += TRUTH_DT_S; }

  const corners: TruthCorner[] = cornerGeo.map((c, index) => {
    const k = expectedKindFor(c.turnDeg);
    return {
      index, x: c.x, y: c.y, sM: c.sM, tS: cornerT[index] ?? t, turnDeg: c.turnDeg,
      dir: c.turnDeg > 0 ? 'links' : 'rechts', interiorDeg: 180 - Math.abs(c.turnDeg),
      expectedKind: k.expected, acceptableKinds: k.acceptable, legBeforeM: c.legBeforeM, legAfterM: c.legAfterM,
    };
  });
  const articles: TruthArticle[] = articleS.map((atM, index) => { const p = at(atM); return { index, atM, x: p.x, y: p.y, tS: articleT[index] ?? t }; });

  return { spec, walk, dtS: TRUTH_DT_S, samples, corners, articles, lengthM, durationS: t, path: { x: px, y: py, s: ps, headingDeg: ph } };
}

/** Wahrer Zustand zu einer Zeit (Sekunden ab Simulationsbeginn), linear interpoliert. */
export function truthAt(track: TruthTrack, tS: number): TruthSample {
  const { samples, dtS } = track;
  const f = Math.max(0, Math.min(samples.length - 1, tS / dtS));
  const i = Math.floor(f), j = Math.min(samples.length - 1, i + 1), w = f - i;
  const a = samples[i], b = samples[j];
  return {
    tS, x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w, sM: a.sM + (b.sM - a.sM) * w,
    headingDeg: a.headingDeg + (b.headingDeg - a.headingDeg) * w, speedMps: a.speedMps + (b.speedMps - a.speedMps) * w,
  };
}

// ── Vorlagen ────────────────────────────────────────────────────────────────
/** Schrittlänge für die Umrechnung der Prüfungsordnung (Schritte → Meter). Die FCI-Ordnung definiert sie nicht. */
export const PACE_M = 0.75;
const paces = (n: number) => n * PACE_M;

/** Ein einzelner Winkel zwischen zwei gleich langen Schenkeln — Grundbaustein der Winkel-Matrix. */
export function singleCornerTrack(turnDeg: number, legM: number): TrackSpec {
  return { name: `winkel${turnDeg > 0 ? 'L' : 'R'}${Math.abs(turnDeg)}_schenkel${legM}`, parts: [{ leg: legM }, { turn: turnDeg }, { leg: legM }] };
}

function legsAndTurns(name: string, legPaces: number[], turns: number[], articlePaces: number[]): TrackSpec {
  const parts: TrackPart[] = [];
  legPaces.forEach((l, i) => { parts.push({ leg: paces(l) }); if (i < turns.length) parts.push({ turn: turns[i] }); });
  return { name, parts, articlesAtM: articlePaces.map(paces) };
}

/**
 * Prüfungsfährten nach FCI-Prüfungsordnung 2025 (Länge, Schenkel, Winkel, Gegenstände).
 * Die konkrete Abfolge links/rechts und die Schenkelaufteilung sind frei gewählt.
 */
export const EXAM_TRACKS: Record<string, TrackSpec> = {
  'IGP-1': legsAndTurns('IGP-1', [100, 100, 100], [-90, -90], [60, 160, 300]),
  'IGP-2': legsAndTurns('IGP-2', [140, 120, 140], [90, 90], [80, 200, 400]),
  'IGP-3': legsAndTurns('IGP-3', [130, 110, 120, 110, 130], [-90, -90, 90, 90], [100, 300, 600]),
  'IFH-1': legsAndTurns('IFH-1', [170, 150, 160, 150, 170], [90, 90, -90, -90], [110, 400, 800]),
  'IFH-2': legsAndTurns('IFH-2', [180, 170, 170, 160, 170, 170, 180], [-90, -90, 90, 90, -90, 135], [110, 420, 800, 1200]),
  'IFH-3': {
    name: 'IFH-3',
    parts: [
      { leg: paces(230) }, { turn: 90 }, { leg: paces(220) }, { turn: -135 }, { leg: paces(230) }, { turn: 90 },
      // Halbkreis-Schenkel (Radius ~30 m) mit kurzen geraden Anschlüssen.
      { leg: paces(40) }, { arc: { radiusM: 30, sweepDeg: -180 } }, { leg: paces(40) },
      { turn: 90 }, { leg: paces(220) }, { turn: -90 }, { leg: paces(220) }, { turn: 135 }, { leg: paces(230) }, { turn: -90 }, { leg: paces(240) },
    ],
    articlesAtM: [110, 350, 600, 850, 1200, 1400, 1790].map(paces),
  },
};
