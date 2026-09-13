/**
 * canonicalArc — Self-Crossing / Parallel-Leg (synthetisch).
 *
 * Linienpunkte tragen `t` (wie TrackPointSample.t), Marker `t` (wie
 * MarkerSample.t, Commit-Zeit). Auswahl über die gemeinsame Zeitachse; ohne
 * Zeiten exakt das bisherige Nearest-Verhalten. Keine Meter-/Sekunden-Schwellen.
 */
import { buildSearchEventArcs, canonicalArcM, arcCandidates, lineTimesMs, type CanonicalArcLinePoint } from '@/features/tracking/utils/canonicalArc';
import { buildArc, projectForward, projectOntoSegments, type LL } from '@/features/tracking/utils/searchGeometry';

const LAT0 = 47.0, LNG0 = 8.0;
const M_PER_LAT = 111320;
const M_PER_LNG = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const at = (xE: number, yN: number) => ({ lat: LAT0 + yN / M_PER_LAT, lng: LNG0 + xE / M_PER_LNG });
const ll = (xE: number, yN: number): LL => { const p = at(xE, yN); return { latitude: p.lat, longitude: p.lng }; };
/** Linie aus Eckpunkten, 2-m-Raster, 1 m/s → t = Bogenlänge in ms·1000 ab t0. */
function polyline(corners: [number, number][], t0 = 1_000_000): CanonicalArcLinePoint[] {
  const pts: CanonicalArcLinePoint[] = [{ ...ll(corners[0][0], corners[0][1]), t: t0 }];
  let arc = 0;
  for (let c = 0; c < corners.length - 1; c++) {
    const [x0, y0] = corners[c], [x1, y1] = corners[c + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    // Zwischenpunkte im 2-m-Raster, Eckpunkt IMMER als Linienpunkt (wie ein realer Scheitel).
    for (let d = 2; d < len - 1e-9; d += 2) {
      const f = d / len;
      pts.push({ ...ll(x0 + f * (x1 - x0), y0 + f * (y1 - y0)), t: t0 + (arc + d) * 1000 });
    }
    arc += len;
    pts.push({ ...ll(x1, y1), t: t0 + arc * 1000 });
  }
  return pts;
}
const strip = (line: CanonicalArcLinePoint[]): LL[] => line.map(p => ({ latitude: p.latitude, longitude: p.longitude }));
const near = (a: number | null, b: number, tol = 0.05) => { expect(a).not.toBeNull(); expect(Math.abs((a as number) - b)).toBeLessThanOrEqual(tol); };

describe('A. einfache, nicht kreuzende Linie → identisch zu CURRENT (Nearest)', () => {
  const line = polyline([[0, 0], [0, 20], [20, 20]]);
  const { cum, total } = buildArc(strip(line));
  it('mit und ohne Zeit dieselbe Position, Zeit-Auswahl nur als Kennzeichnung', () => {
    const markers = [
      { id: 'a', ...at(0.4, 6), distance_from_start: 6, t: 1_000_000 + 6_500 },
      { id: 'b', ...at(8, 20.5), distance_from_start: 28, t: 1_000_000 + 30_000 },
    ];
    const withT = buildSearchEventArcs(markers, line);
    const noT = buildSearchEventArcs(markers.map(({ t: _t, ...m }) => m), strip(line));
    for (const id of ['a', 'b']) {
      expect(withT[id].selection).toBe('time');
      expect(noT[id].selection).toBe('nearest');
      expect(withT[id].arcM).toBe(noT[id].arcM);
      expect(withT[id].segmentIndex).toBe(noT[id].segmentIndex);
    }
    near(withT.a.arcM, 6); near(withT.b.arcM, 28);
  });
  it('Nearest-Fallback ist numerisch identisch zu projectForward (Vollfenster)', () => {
    for (const [x, y] of [[0.4, 6], [8, 20.5], [-1.5, 0], [21, 21], [3, 17]]) {
      const p = ll(x, y);
      const ref = projectForward(p, strip(line), cum, 0, total, 0);
      const r = canonicalArcM({ id: 'p', lat: p.latitude, lng: p.longitude }, strip(line), cum);
      expect(r.arcM).toBe(Math.max(0, Math.min(total, ref.atM)));
      expect(r.offLineM).toBe(ref.devM);
    }
  });
  it('projectOntoSegments liefert je Segment einen Kandidaten; argmin = projectForward', () => {
    const p = ll(3, 17);
    const all = projectOntoSegments(p, strip(line), cum);
    expect(all).toHaveLength(line.length - 1);
    const best = all.reduce((b, c) => (c.offLineM < b.offLineM ? c : b));
    const ref = projectForward(p, strip(line), cum, 0, total, 0);
    expect(best.arcM).toBe(ref.atM);
  });
});

describe('B. zwei räumlich nahe parallele Schenkel → später Marker bleibt auf dem späten Traversal', () => {
  // Hin: (0,0)→(0,30); Bogen (0,30)→(1.2,30); zurück: (1.2,30)→(1.2,0). Abstand 1.2 m.
  const line = polyline([[0, 0], [0, 30], [1.2, 30], [1.2, 0]]);
  const { cum } = buildArc(strip(line));
  const t0 = 1_000_000;
  it('Marker auf dem Rückweg bei y=10 (Commit bei 51 s, 1 m/s): Kandidaten früh (10 m) und spät (51.2 m), Zeit wählt spät', () => {
    // Koordinate näher am HIN-Schenkel (x=0.5) — Nearest würde früh wählen.
    const m = { id: 'late', ...at(0.5, 10), distance_from_start: 0, t: t0 + 51_000 };
    const cands = arcCandidates({ latitude: m.lat, longitude: m.lng }, line, cum, lineTimesMs(line));
    expect(cands.map(c => Math.round(c.arcM))).toEqual([10, 51]);
    const r = canonicalArcM(m, line, cum);
    expect(r.selection).toBe('time');
    near(r.arcM, 51.2, 0.1);
    // Ohne Zeit: bisheriges Verhalten (früh, weil offLine 0.5 < 0.7).
    const legacy = canonicalArcM({ ...m, t: undefined }, line, cum);
    expect(legacy.selection).toBe('nearest');
    near(legacy.arcM, 10, 0.05);
  });
  it('Marker auf dem Hinweg (Commit bei 12 s) bleibt früh, auch wenn der Rückweg geometrisch näher ist', () => {
    const m = { id: 'early', ...at(0.7, 10), distance_from_start: 0, t: t0 + 12_000 };
    const r = canonicalArcM(m, line, cum);
    expect(r.selection).toBe('time');
    near(r.arcM, 10, 0.05);
    near(canonicalArcM({ ...m, t: undefined }, line, cum).arcM, 51.2, 0.1);   // Nearest hätte spät gewählt
  });
  it('Auto-Winkel-Lag: Scheitel am Wendepunkt (30 m), Commit erst 4 s später auf dem Rückweg → Kandidaten beidseits des Scheitels, kein Sprung', () => {
    const m = { id: 'apex', ...at(0.6, 30.3), distance_from_start: 0, t: t0 + 34_000 };
    const r = canonicalArcM(m, line, cum);
    expect(r.selection).toBe('time');
    // Beide Kandidaten liegen am Bogen (30 … 31.2 m) — Auswahl ändert die Position nur um Dezimeter.
    expect(r.arcM as number).toBeGreaterThanOrEqual(29.5);
    expect(r.arcM as number).toBeLessThanOrEqual(31.7);
  });
});

describe('C. echte Selbstkreuzung → Marker-Reihenfolge bleibt konsistent', () => {
  // Acht-Form: (0,0)→(20,20)→(20,0)→(0,20). Kreuzung bei (10,10) auf Segmentzug 1 (t≈14 s) und 3 (t≈62 s).
  const line = polyline([[0, 0], [20, 20], [20, 0], [0, 20]]);
  const { cum } = buildArc(strip(line));
  const t0 = 1_000_000;
  it('drei Marker: vor der Kreuzung, an der Kreuzung beim ZWEITEN Durchgang, danach → arcM streng aufsteigend', () => {
    const markers = [
      { id: 'm1', ...at(5.2, 5), distance_from_start: 0, t: t0 + 8_000 },
      { id: 'm2', ...at(10.1, 10), distance_from_start: 0, t: t0 + 64_000 },   // zweiter Durchgang (Commit 64 s)
      { id: 'm3', ...at(3, 17), distance_from_start: 0, t: t0 + 73_000 },
    ];
    const arcs = buildSearchEventArcs(markers, line);
    const a = ['m1', 'm2', 'm3'].map(id => arcs[id].arcM as number);
    expect(a[0]).toBeLessThan(a[1]);
    expect(a[1]).toBeLessThan(a[2]);
    near(arcs.m2.arcM, 20 * Math.SQRT2 + 20 + 10 * Math.SQRT2, 0.3);   // Kreuzung auf dem dritten Schenkel
    // Derselbe Kreuzungsmarker beim ERSTEN Durchgang (Commit 15 s) → erster Schenkel.
    const first = canonicalArcM({ ...markers[1], t: t0 + 15_000 }, line, cum);
    near(first.arcM, 10 * Math.SQRT2, 0.3);
  });
});

describe('D. nur ein Marker ohne Order-Kontext → definierter, kompatibler Fallback', () => {
  const line = polyline([[0, 0], [0, 30], [1.2, 30], [1.2, 0]]);
  const { cum } = buildArc(strip(line));
  it('Marker ohne t auf Linie MIT Zeiten → Nearest (wie bisher), Kennzeichnung nearest', () => {
    const r = canonicalArcM({ id: 'x', ...at(0.5, 10), distance_from_start: 0 }, line, cum);
    expect(r.selection).toBe('nearest');
    near(r.arcM, 10, 0.05);
  });
  it('Marker MIT t auf Linie OHNE Zeiten → Nearest', () => {
    const r = canonicalArcM({ id: 'x', ...at(0.5, 10), distance_from_start: 0, t: 5 }, strip(line), cum);
    expect(r.selection).toBe('nearest');
  });
  it('Linie mit lückenhaften/unsortierten Zeiten → als „keine Zeit" behandelt', () => {
    const gap = line.map((p, i) => (i === 3 ? { ...p, t: undefined } : p));
    expect(lineTimesMs(gap)).toBeNull();
    const unsorted = line.map((p, i) => (i === 3 ? { ...p, t: (p.t as number) - 10_000 } : p));
    expect(lineTimesMs(unsorted)).toBeNull();
    expect(canonicalArcM({ id: 'x', ...at(0.5, 10), t: 1_000_000 + 51_000 }, gap, cum).selection).toBe('nearest');
  });
});

describe('E. Marker ohne Koordinate / ohne Zeit → kein Crash, bestehende Fallbacks', () => {
  const line = polyline([[0, 0], [0, 20]]);
  const { cum } = buildArc(strip(line));
  it('stored_fallback / unavailable unverändert, mit oder ohne t', () => {
    expect(canonicalArcM({ id: 'f1', lat: null, lng: null, distance_from_start: 7.5, t: 123 }, line, cum))
      .toEqual({ arcM: 7.5, offLineM: null, source: 'stored_fallback', segmentIndex: null, selection: null });
    expect(canonicalArcM({ id: 'f2', lat: null, lng: null }, line, cum).source).toBe('unavailable');
    expect(canonicalArcM({ id: 'f3', ...at(1, 1), distance_from_start: 3, t: NaN }, [line[0]], buildArc([strip(line)[0]]).cum).source).toBe('stored_fallback');
    expect(canonicalArcM({ id: 'f4', ...at(1, 1), t: Infinity }, line, cum).selection).toBe('nearest');
  });
});

describe('Markerarten (Phase 10): auto Winkel, manuelle Winkel, Gegenstand, Dübel, GW/OW/BW/Abriss — ein Pfad', () => {
  const line = polyline([[0, 0], [0, 30], [1.2, 30], [1.2, 0]]);
  const { cum } = buildArc(strip(line));
  const t0 = 1_000_000;
  it('alle Typen folgen ihrer Commit-Zeit; manuelle Marker (t = Ort und Zeit) exakt am Ort', () => {
    const markers = [
      { id: 'angle-1-rechts', type: 'winkel', angleKind: 'rechts', ...at(0.3, 8), distance_from_start: 9.9, t: t0 + 11_000 },      // auto, Lag 3 s
      { id: 'winkel-2', type: 'winkel', angleKind: 'links', ...at(0.4, 20), distance_from_start: 20, t: t0 + 20_000 },              // manuell
      { id: 'gegenstand-1', type: 'gegenstand', material: 'stoff', ...at(0.5, 25), distance_from_start: 25, t: t0 + 25_000 },
      { id: 'gegenstand-2', type: 'gegenstand', material: 'duebel', ...at(0.6, 12), distance_from_start: 49.2, t: t0 + 49_000 },   // Rückweg
      { id: 'gw', type: 'winkel', angleKind: 'gw', ...at(0.5, 5), distance_from_start: 56.2, t: t0 + 56_000 },                    // Rückweg
      { id: 'abriss', type: 'winkel', angleKind: 'abriss', ...at(0.7, 2), distance_from_start: 59.2, t: t0 + 59_000 },            // Rückweg
    ];
    const arcs = buildSearchEventArcs(markers, line);
    const expected: Record<string, number> = { 'angle-1-rechts': 8, 'winkel-2': 20, 'gegenstand-1': 25, 'gegenstand-2': 49.2, gw: 56.2, abriss: 59.2 };
    for (const [id, arc] of Object.entries(expected)) {
      expect(arcs[id].selection).toBe('time');
      near(arcs[id].arcM, arc, 0.1);
    }
    // Reihenfolge = Commit-Reihenfolge = Bogenlänge aufsteigend.
    const seq = markers.map(m => arcs[m.id].arcM as number);
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThan(seq[i - 1]);
    // Ohne Zeit (Legacy) landet ein Rückweg-Marker in der Mitte zwischen den Schenkeln auf dem frühen Durchgang.
    const legacy = buildSearchEventArcs(markers.map(({ t: _t, ...m }) => m), strip(line));
    expect(legacy['gegenstand-2'].selection).toBe('nearest');
    near(legacy['gegenstand-2'].arcM, 12, 0.1);   // Dübel x=0.6: Hinweg 0.6 m, Rückweg 0.6 m → erstes Minimum = früh (Legacy)
  });
});
