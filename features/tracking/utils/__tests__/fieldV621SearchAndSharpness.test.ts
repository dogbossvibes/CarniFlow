// V6.2.1 — realer Feldlauf V6.2-F1-01 (R → L) und V6.2-F2-01 (SR → SL → R → L).
// Fixtures sind datenschutzreduziert (relative x/y/t, keine absoluten Positionen/Zeiten/IDs).
//
// Teil A (Search-Trace): belegt, dass die Replay-Linie die akzeptierten Handler-Fixes ehrlich zeigt
//   (kein Display-Artefakt) — es gibt bewusst KEINE Glättung gegen die Referenzfährte.
// Teil B (Sharpness): „spitz" braucht Multi-Scale-Konsens (≥ 2 gültige Fensterpaare, alle ≤ SPITZ_MAX).
import * as fs from 'fs';
import * as path from 'path';
import { capturedDetectorBuffer } from './helpers/realSessionFixture';
import { fuseTurns, nearestCompatibleTurnEvidence } from '../turnFusion';
import { MotionEvidenceBuffer, type MotionWindowSample } from '../motionTurnEvidence';
import { buildReplayGeometryDetailed, REPLAY_GEOMETRY } from '../searchReplayGeometry';
import { spitzConsensus, legWindows, SHARPNESS_MIN_PAIRS, SPITZ_MAX } from '../shortLegCornerDetection';

const FIX = path.join(__dirname, 'fixtures');
const load = (rel: string) => JSON.parse(fs.readFileSync(path.join(FIX, rel), 'utf8'));
const F1 = load('fieldV62/V6.2-F1-01.json');
const F2 = load('fieldV62/V6.2-F2-01.json');
const M = 111320;

function motionOf(j: any): MotionWindowSample[] {
  const seen = new Map<number, MotionWindowSample>();
  for (const s of j.motionSamples ?? []) seen.set(s.tMs, { t: s.tMs, headingDelta: s.headingDelta, rotationMagnitude: s.rotationMagnitude,
    accelerationMagnitude: s.accelerationMagnitude, stepDelta: s.stepDelta, cadence: s.cadence, movementState: s.movementState });
  for (const c of j.candidateMotionEvidence ?? []) for (const s of c.samples ?? []) { const t = Math.round(c.evaluatedAtMs + s.dtMs);
    seen.set(t, { t, headingDelta: s.headingDelta, rotationMagnitude: s.rotationMagnitude, accelerationMagnitude: s.accelerationMagnitude,
      stepDelta: s.stepDelta, cadence: s.cadence, movementState: s.movementState }); }
  return [...seen.values()].sort((a, b) => a.t - b.t);
}
function run(detector: any[], samples: MotionWindowSample[] | null) {
  const buf = capturedDetectorBuffer(detector);
  const mb = new MotionEvidenceBuffer(1e9); (samples ?? []).forEach(s => mb.push(s));
  return { buf, r: fuseTurns(buf, samples ? {
    turnEvidenceAt: t => t == null ? null : mb.evidenceForTrailing(t),
    turnEvidenceForDirection: (t, dir) => t == null ? null : nearestCompatibleTurnEvidence(t, dir, q => q == null ? null : mb.evidenceFor(q)),
    motionSamples: samples } : {}) };
}
const distToRef = (ref: number[][], p: number[]) => Math.min(...ref.slice(1).map((b, i) => {
  const a = ref[i]; const dx = b[0] - a[0], dy = b[1] - a[1]; const L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)); }));
const at = (arr: any[], t: number) => { if (t <= arr[0].tSec) return [arr[0].x, arr[0].y];
  for (let i = 1; i < arr.length; i++) if (arr[i].tSec >= t) { const a = arr[i - 1], b = arr[i], f = (t - a.tSec) / ((b.tSec - a.tSec) || 1); return [a.x + f * (b.x - a.x), a.y + f * (b.y - a.y)]; }
  const l = arr[arr.length - 1]; return [l.x, l.y]; };

describe('fixtures are privacy-reduced', () => {
  it.each([['F1', F1], ['F2', F2]])('%s has only relative data', (_n, j) => {
    const s = JSON.stringify(j);
    expect(s).not.toMatch(/"(?:lat|lng|lon|latitude|longitude|sessionId|session_id|userId|email|createdAt|created_at|timestamp|recordedAt|startedAt|endedAt)"/i);
    expect(s).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe('Teil A — Search-Trace: die Replay-Linie zeigt die akzeptierten Handler-Fixes ehrlich', () => {
  const g = F2.search.geometry;
  const ref = F2.points.map((p: any) => [p.x, p.y]);   // gelegte Referenz — NUR Messung im Test, nie Produktions-Input

  it('F2: der Ausschlag t≈9–16 s steckt in den RAW-Fixes (≥ 8 aufeinanderfolgende, monoton wachsend, bis ≈ 4,2 m)', () => {
    const d = (t: number) => distToRef(ref, at(g.raw, t));
    const seq = [9, 10, 11, 12, 13, 14, 15, 16].map(d);
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThan(seq[i - 1]);
    expect(seq[0]).toBeGreaterThan(1.5); expect(seq[seq.length - 1]).toBeGreaterThan(4);
    // kein Einzelausreisser: die Schrittweiten liegen im Gehbereich (≤ 1,5 m/s)
    for (let i = 9; i <= 16; i++) expect(Math.hypot(g.raw[i].x - g.raw[i - 1].x, g.raw[i].y - g.raw[i - 1].y)).toBeLessThan(1.5);
  });

  it('F2: die Replay-Stufe verstärkt den Ausschlag nicht (≤ Roh-Maximum, ≤ 1 m vom Rohpfad)', () => {
    let maxRaw = 0, maxReplay = 0, maxGap = 0;
    for (let t = 8; t <= 16; t += 0.5) {
      const r = at(g.raw, t), p = at(g.replay, t);
      maxRaw = Math.max(maxRaw, distToRef(ref, r)); maxReplay = Math.max(maxReplay, distToRef(ref, p));
      maxGap = Math.max(maxGap, Math.hypot(r[0] - p[0], r[1] - p[1]));
    }
    expect(maxReplay).toBeLessThanOrEqual(maxRaw);
    expect(maxGap).toBeLessThan(1);
  });

  it.each([['F1', F1], ['F2', F2]])('%s: Replay = Douglas-Peucker(EMA 0,7 der akzeptierten Rohfixes); filtered = EMA 0,4 — exakt reproduziert', (_n, j) => {
    const geo = j.search.geometry;
    const accepted = geo.raw.filter((p: any) => new Set(geo.filtered.map((f: any) => f.tSec)).has(p.tSec));
    let e: any = null;
    const dense = accepted.map((p: any) => { e = e ? { x: e.x + REPLAY_GEOMETRY.emaAlpha * (p.x - e.x), y: e.y + REPLAY_GEOMETRY.emaAlpha * (p.y - e.y) } : { x: p.x, y: p.y };
      return { lat: e.y / M, lng: e.x / M, t: p.tSec }; });
    const rebuilt = buildReplayGeometryDetailed(dense)!.points;
    expect(rebuilt.length).toBe(geo.replay.length);
    geo.replay.forEach((p: any, i: number) => expect(Math.hypot(p.x - rebuilt[i].lng * M, p.y - rebuilt[i].lat * M)).toBeLessThan(0.01));
    let s: any = null;
    accepted.forEach((p: any, i: number) => { s = s ? { x: s.x + 0.4 * (p.x - s.x), y: s.y + 0.4 * (p.y - s.y) } : { x: p.x, y: p.y };
      expect(Math.hypot(geo.filtered[i].x - s.x, geo.filtered[i].y - s.y)).toBeLessThan(0.01); });
  });

  it('F2: abgelehnte Fixes liegen nicht im Ausschlagfenster (Rejection formt die Linie dort nicht)', () => {
    const keep = new Set(g.filtered.map((f: any) => f.tSec));
    const rejected = g.raw.filter((p: any) => !keep.has(p.tSec)).map((p: any) => p.tSec);
    expect(rejected.length).toBe(5);
    expect(rejected.every((t: number) => t < 8 || t > 16)).toBe(true);
  });

  it('kein Track-Snapping: der Display-Strom im Recorder liest weder Referenz noch gelegte Fährte', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'hooks', 'useSearchRecorder.ts'), 'utf8');
    const block = src.slice(src.indexOf('const pe = replayEmaRef.current;'), src.indexOf('const pts = pointsRef.current;'));
    expect(block.length).toBeGreaterThan(100);
    expect(block).not.toMatch(/laidPoints|arc\.|projectForward|cursor|pointAtDistance/);
  });
});

describe('Teil B — Sharpness: „spitz" nur mit Multi-Scale-Konsens', () => {
  const mF2 = motionOf(F2);

  it('V6.2 F2: Richtungen R L R L bleiben; die ersten drei Klassen bleiben; der vierte Winkel ist links/unresolved', () => {
    const { r } = run(F2.detectorPoints, mF2);
    expect(r.turns.map(t => t.direction)).toEqual(['rechts', 'links', 'rechts', 'links']);
    expect(r.turns.map(t => t.kind)).toEqual(['spitz_rechts', 'spitz_links', 'rechts', 'links']);
    expect(r.turns.map(t => t.sharpness)).toEqual(['spitz', 'spitz', 'normal', 'unresolved']);
    const t4 = r.turns[3];
    expect(t4.flags).toContain('sharpness_no_consensus');
    const d = r.diagnostics.find(x => x.apexIndex === t4.apexIndex)!;
    expect(d.sharpnessConsensusPairs).toBe(1);                         // nur ein einziges gültiges Fensterpaar
    expect(d.interiorAngleDeg!).toBeLessThan(60);                     // GPS „sieht" scharf — aber ohne Konsens
  });

  it('Sharpness ist reine Geometrie: ohne Motion / mit ×3-Motion identisch', () => {
    const base = run(F2.detectorPoints, mF2).r.turns.map(t => `${t.direction}:${t.sharpness}`);
    expect(run(F2.detectorPoints, null).r.turns.map(t => `${t.direction}:${t.sharpness}`)).toEqual(base.map(s => s));
    const boosted = mF2.map(s => ({ ...s, headingDelta: s.headingDelta * 3, rotationMagnitude: s.rotationMagnitude * 3 }));
    expect(run(F2.detectorPoints, boosted).r.turns.map(t => `${t.direction}:${t.sharpness}`)).toEqual(base);
  });

  it('gespiegelt (Geometrie und Yaw): gespiegeltes, gleiches Sharpness-Ergebnis', () => {
    const mirrored = F2.detectorPoints.map((p: any) => ({ ...p, x: -p.x }));
    const mm = mF2.map(s => ({ ...s, headingDelta: -s.headingDelta }));
    const { r } = run(mirrored, mm);
    expect(r.turns.map(t => t.direction)).toEqual(['links', 'rechts', 'links', 'rechts']);
    expect(r.turns.map(t => t.sharpness)).toEqual(['spitz', 'spitz', 'normal', 'unresolved']);
  });

  it('V6.2 F1: R → L unverändert, keine Phantomwinkel', () => {
    const { r } = run(F1.detectorPoints, motionOf(F1));
    expect(r.turns.map(t => t.direction)).toEqual(['rechts', 'links']);
  });

  it('alle bestätigten Spitzwinkel haben Konsens (≥ 4 Paare, alle ≤ 60°) und bleiben spitz', () => {
    const cases: [string, string][] = [['realFieldV21/lauf2-qa-848ea966.json', 'links'], ['realFieldV21/spitz-qa-0ec8c4ca.json', 'links'],
      ['realFieldV21/spitz-qa-0ec8c4ca.json', 'rechts'], ['fieldV61/V6-F2-2FN-01.json', 'rechts'], ['fieldV62/V6.2-F2-01.json', 'rechts'], ['fieldV62/V6.2-F2-01.json', 'links']];
    let checked = 0;
    for (const [file, dir] of cases) {
      const j = load(file); const { buf, r } = run(j.detectorPoints, null);
      for (const t of r.turns.filter(x => x.direction === dir && x.kind.startsWith('spitz'))) {
        const q = t.source === 'gps_split_apex' ? t.apexIndex + 1 : t.apexIndex;
        const c = spitzConsensus(buf, t.apexIndex, q);
        expect(c.pairs).toBeGreaterThanOrEqual(4);
        expect(c.maxInteriorDeg!).toBeLessThanOrEqual(SPITZ_MAX);
        expect(c.supported).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(6);
  });

  it('Boundary: 1 Paar → kein Konsens; ≥ 2 Paare im Spitz-Band → Konsens; ein Paar > 60° → kein Konsens', () => {
    expect(SHARPNESS_MIN_PAIRS).toBe(2);
    // V6.2-F2 vierter Winkel: genau 1 Paar, 39° — gerade NICHT genug Evidenz.
    const f2 = capturedDetectorBuffer(F2.detectorPoints);
    const t4 = run(F2.detectorPoints, null).r.turns[3];
    const one = spitzConsensus(f2, t4.apexIndex, t4.apexIndex);
    expect(one.pairs).toBe(1); expect(one.supported).toBe(false);
    // V6.2-F2 erster Winkel: viele Paare, alle im Band.
    const t1 = run(F2.detectorPoints, null).r.turns[0];
    expect(spitzConsensus(f2, t1.apexIndex, t1.apexIndex).supported).toBe(true);
    // V6.1-F1-02 links: 16 Paare streuen über 58–73° → die Klasse hängt an der Fensterwahl.
    const f102 = load('fieldV61/V6.1-F1-02.json'); const b = capturedDetectorBuffer(f102.detectorPoints);
    const straddle = spitzConsensus(b, 15, 16);
    expect(straddle.pairs).toBeGreaterThan(SHARPNESS_MIN_PAIRS); expect(straddle.maxInteriorDeg!).toBeGreaterThan(SPITZ_MAX);
    expect(straddle.supported).toBe(false);
  });

  it('Boundary (synthetisch): gleiche V-Form mit 4,8-m-Schenkeln → Konsens, mit 2,3-m-Schenkeln → ein Paar', () => {
    const v = (leg: number) => {
      const pts: any[] = []; const step = 0.8; const n = Math.round(leg / step);
      for (let i = n; i >= 1; i--) pts.push({ x: 0, y: -i * step });                         // Hinweg nach Norden
      pts.push({ x: 0, y: 0 });
      const h = (140 * Math.PI) / 180;                                                       // Rückweg mit 140° Richtungsänderung → Innenwinkel 40°
      for (let i = 1; i <= n; i++) pts.push({ x: Math.sin(h) * i * step, y: Math.cos(h) * i * step });
      let cum = 0;
      return capturedDetectorBuffer(pts.map((p, i) => { if (i) cum += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y); return { x: p.x, y: p.y, accuracy: 2, tMs: i * 1000, cumDistM: cum }; }));
    };
    const long = v(4.8), short = v(2.4);
    const apexLong = Math.round(4.8 / 0.8), apexShort = Math.round(2.4 / 0.8);
    const cl = spitzConsensus(long, apexLong, apexLong), cs = spitzConsensus(short, apexShort, apexShort);
    expect(legWindows(long, apexLong, false).length).toBeGreaterThan(1);
    expect(cl.pairs).toBeGreaterThanOrEqual(SHARPNESS_MIN_PAIRS); expect(cl.supported).toBe(true);
    expect(cs.pairs).toBe(1); expect(cs.supported).toBe(false);
  });

  it('Referenz-Fälle bleiben unverändert: F2 Apex 21 unresolved, V6.1-F1-02 Richtungen R L', () => {
    const old = load('fieldV61/V6-F2-2FN-01.json');
    const o = run(old.detectorPoints, motionOf(old)).r.turns.find(t => t.apexIndex === 21)!;
    expect(o).toMatchObject({ direction: 'links', sharpness: 'unresolved', kind: 'links' });
    const f102 = load('fieldV61/V6.1-F1-02.json');
    expect(run(f102.detectorPoints, motionOf(f102)).r.turns.map(t => t.direction)).toEqual(['rechts', 'links']);
  });
});
