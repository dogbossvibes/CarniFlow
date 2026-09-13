/**
 * Canonical Reference Progress — kanonische Eventposition auf der Search-Referenzlinie.
 *
 * Synthetische Linie: L-Form, 20 m nach Norden, dann 20 m nach Osten, Linien-
 * punkte alle 2 m (wie MIN_STEP_M der aufgezeichneten Linie). Marker werden in
 * Metern relativ zum Startpunkt platziert und in lat/lng umgerechnet.
 */
import { buildSearchEventArcs, canonicalArcM } from '@/features/tracking/utils/canonicalArc';
import { buildArc, type LL } from '@/features/tracking/utils/searchGeometry';
import { stepGuidanceEngine, DEFAULT_GUIDANCE_OPTIONS } from '@/features/tracking/utils/guidanceEngine';

const LAT0 = 47.0, LNG0 = 8.0;
const M_PER_LAT = 111320;
const M_PER_LNG = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const at = (xE: number, yN: number) => ({ lat: LAT0 + yN / M_PER_LAT, lng: LNG0 + xE / M_PER_LNG });
const ll = (xE: number, yN: number): LL => { const p = at(xE, yN); return { latitude: p.lat, longitude: p.lng }; };

// L-Linie: (0,0) → (0,20) → (20,20), 2-m-Raster.
const LINE: LL[] = [];
for (let y = 0; y <= 20; y += 2) LINE.push(ll(0, y));
for (let x = 2; x <= 20; x += 2) LINE.push(ll(x, 20));
const ARC = buildArc(LINE);

const near = (a: number | null, b: number, tol = 0.02) => { expect(a).not.toBeNull(); expect(Math.abs((a as number) - b)).toBeLessThanOrEqual(tol); };

describe('canonicalArcM — Projektion auf laidPoints', () => {
  it('Linie: 40 m Gesamtlänge, cum monoton', () => {
    near(ARC.total, 40, 0.05);
    for (let i = 1; i < ARC.cum.length; i++) expect(ARC.cum[i]).toBeGreaterThan(ARC.cum[i - 1]);
  });

  it('1. Auto-Winkel: Detektor-Koordinate leicht neben dem Scheitel, gespeicherte Detektor-Distanz falsch → projiziert', () => {
    // Scheitel bei arc 20 m; Detektor-Punkt 0,8 m innen versetzt; stored = Detektor-Maßstab (17,1 m).
    const m = { id: 'angle-1-rechts', ...at(0.8, 19.4), distance_from_start: 17.1 };
    const r = canonicalArcM(m, LINE, ARC.cum);
    expect(r.source).toBe('projected');
    // Nächste Stelle: entweder Nord-Schenkel bei y=19,4 (arc 19,4, dev 0,8) oder Ost-Schenkel bei x=0,8 (arc 20,8, dev 0,6) → Ost gewinnt.
    near(r.arcM, 20.8, 0.05);
    near(r.offLineM, 0.6, 0.05);
    expect(r.arcM).not.toBe(17.1);
  });

  it('2. Marker seitlich neben der Linie → arcM = Lotfusspunkt, offLineM = seitlicher Abstand', () => {
    const r = canonicalArcM({ id: 'x', ...at(1.5, 7), distance_from_start: 0 }, LINE, ARC.cum);
    expect(r.source).toBe('projected');
    near(r.arcM, 7);
    near(r.offLineM, 1.5);
  });

  it('3.–6. manueller Winkel, Gegenstand, Dübel, GW/OW/BW/Abriss: ein Pfad für alle Typen', () => {
    const markers = [
      { id: 'winkel-manual', type: 'winkel', angleKind: 'links', ...at(0.3, 10), distance_from_start: 9.6 },
      { id: 'gegenstand-1', type: 'gegenstand', material: 'stoff', ...at(-0.4, 5), distance_from_start: 5.1 },
      { id: 'duebel-1', type: 'gegenstand', material: 'duebel', ...at(0.2, 15), distance_from_start: 14.9 },
      { id: 'gw', type: 'winkel', angleKind: 'gw', ...at(4, 20.5), distance_from_start: 24 },
      { id: 'ow', type: 'winkel', angleKind: 'ow', ...at(8, 19.7), distance_from_start: 28 },
      { id: 'bw', type: 'winkel', angleKind: 'bw', ...at(12, 20), distance_from_start: 32 },
      { id: 'abriss', type: 'winkel', angleKind: 'abriss', ...at(16, 20.9), distance_from_start: 36 },
    ];
    const arcs = buildSearchEventArcs(markers, LINE);
    const expected: Record<string, [number, number]> = {
      'winkel-manual': [10, 0.3], 'gegenstand-1': [5, 0.4], 'duebel-1': [15, 0.2],
      gw: [24, 0.5], ow: [28, 0.3], bw: [32, 0], abriss: [36, 0.9],
    };
    for (const [id, [arc, off]] of Object.entries(expected)) {
      expect(arcs[id].source).toBe('projected');
      near(arcs[id].arcM, arc, 0.05);
      near(arcs[id].offLineM, off, 0.05);
    }
  });

  it('7. mehrere Marker: Reihenfolge folgt der Linie, nicht dem gespeicherten (falschen) Maßstab', () => {
    // Gespeichert: B (Detektor 9,0) vor A (Detektor 11,0) — geometrisch liegt A bei 6 m, B bei 14 m.
    const markers = [
      { id: 'A', ...at(0.2, 6), distance_from_start: 11.0 },
      { id: 'B', ...at(-0.2, 14), distance_from_start: 9.0 },
    ];
    const arcs = buildSearchEventArcs(markers, LINE);
    expect(arcs.A.arcM as number).toBeLessThan(arcs.B.arcM as number);
    // Guidance-Engine nutzt die kanonische Reihenfolge: Hund bei 0 m → A (6 m) ist die nächste Ansage.
    const res = stepGuidanceEngine(
      [{ id: 'A', arcM: arcs.A.arcM as number, kind: 'angle', angleKind: 'rechts' },
       { id: 'B', arcM: arcs.B.arcM as number, kind: 'angle', angleKind: 'links' }],
      0, {}, DEFAULT_GUIDANCE_OPTIONS,
    );
    expect(res.announcement?.feature.id).toBe('A');
  });

  it('8. historisch falscher distance_from_start wird bei vorhandener Koordinate NICHT verwendet', () => {
    const r = canonicalArcM({ id: 'h', ...at(0, 12), distance_from_start: 99 }, LINE, ARC.cum);
    expect(r.source).toBe('projected');
    near(r.arcM, 12);
  });

  it('9. Koordinate exakt auf der Linie → arcM identisch mit der Bogenlänge, offLineM ≈ 0', () => {
    const r = canonicalArcM({ id: 'v', lat: LINE[4].latitude, lng: LINE[4].longitude, distance_from_start: 0 }, LINE, ARC.cum);
    near(r.arcM, ARC.cum[4], 1e-6);
    near(r.offLineM, 0, 1e-6);
  });

  it('10. Event am Segmentübergang (Scheitel der L-Form) → arcM = cum des Knickpunkts', () => {
    const r = canonicalArcM({ id: 's', ...at(0, 20), distance_from_start: 0 }, LINE, ARC.cum);
    near(r.arcM, ARC.cum[10], 1e-6);
  });

  it('11. Event nahe Start: vor dem Startpunkt → auf 0 geklemmt, Abstand = Distanz zum Start', () => {
    const r = canonicalArcM({ id: 'st', ...at(0, -1.5), distance_from_start: 0.3 }, LINE, ARC.cum);
    expect(r.source).toBe('projected');
    near(r.arcM, 0, 1e-6);
    near(r.offLineM, 1.5);
  });

  it('12. Event nahe Ende: hinter dem Endpunkt → auf total geklemmt', () => {
    const r = canonicalArcM({ id: 'en', ...at(21.2, 20), distance_from_start: 39 }, LINE, ARC.cum);
    near(r.arcM, ARC.total, 1e-6);
    near(r.offLineM, 1.2);
  });

  describe('Fallbacks (dokumentiert, keine erfundenen Werte)', () => {
    it('ohne Koordinate, mit distance_from_start → stored_fallback', () => {
      const r = canonicalArcM({ id: 'f1', lat: null, lng: null, distance_from_start: 7.5 }, LINE, ARC.cum);
      expect(r).toEqual({ arcM: 7.5, offLineM: null, source: 'stored_fallback' });
    });
    it('ohne Koordinate, ohne distance_from_start → unavailable (kein Wert)', () => {
      const r = canonicalArcM({ id: 'f2', lat: null, lng: null }, LINE, ARC.cum);
      expect(r).toEqual({ arcM: null, offLineM: null, source: 'unavailable' });
    });
    it('Linie mit < 2 Punkten → Projektion technisch unmöglich → stored_fallback', () => {
      const one = [LINE[0]];
      const r = canonicalArcM({ id: 'f3', ...at(1, 1), distance_from_start: 3 }, one, buildArc(one).cum);
      expect(r.source).toBe('stored_fallback');
      expect(r.arcM).toBe(3);
    });
    it('leere Linie, keine Distanz → unavailable', () => {
      const r = canonicalArcM({ id: 'f4', ...at(1, 1) }, [], buildArc([]).cum);
      expect(r.source).toBe('unavailable');
    });
  });
});
