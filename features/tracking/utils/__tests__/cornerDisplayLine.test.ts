import { cornerDisplayLine, cornerPointsFromMarkers, CORNER_MAX_SNAP_M } from '../cornerDisplayLine';

const LAT0 = 47.3, LNG0 = 8.5, M = 111320, KX = M * Math.cos((LAT0 * Math.PI) / 180);
const at = (x: number, y: number, breakBefore?: boolean) => ({ latitude: LAT0 + y / M, longitude: LNG0 + x / KX, ...(breakBefore ? { breakBefore: true } : {}) });
const xy = (p: { latitude: number; longitude: number }) => ({ x: +((p.longitude - LNG0) * KX).toFixed(2), y: +((p.latitude - LAT0) * M).toFixed(2) });

// Feldaufnahme vom 22.11.2026 (lokale Meter): ausgedünnte Linie und die drei Winkelpunkte.
const FIELD = [[0, 0.2], [2.1, 0.6], [4.1, 0.9], [4.2, 2.6], [3.8, 5.1], [3.2, 7.4], [4.3, 10.0], [5.8, 10.8], [8.5, 11.7], [8.6, 10.7], [8.1, 9.5], [8.0, 7.3], [9.0, 8.6], [10.9, 10.6]].map(([x, y]) => at(x, y));
const FIELD_CORNERS = [at(5.2, 0.9), at(3.0, 9.8), at(9.4, 11.8)];

describe('cornerDisplayLine', () => {
  test('Feldaufnahme: die drei Ecken liegen danach genau auf den Winkelpunkten', () => {
    const r = cornerDisplayLine(FIELD, FIELD_CORNERS);
    expect(r.changed).toBe(3);
    expect(r.points).toHaveLength(FIELD.length);
    expect(xy(r.points[2])).toEqual({ x: 5.2, y: 0.9 });
    expect(xy(r.points[6])).toEqual({ x: 3, y: 9.8 });
    expect(xy(r.points[8])).toEqual({ x: 9.4, y: 11.8 });
    // alle anderen Punkte unverändert, Eingabe nicht verändert
    [0, 1, 3, 4, 5, 7, 9, 10, 11, 12, 13].forEach(i => expect(r.points[i]).toBe(FIELD[i]));
    expect(xy(FIELD[2])).toEqual({ x: 4.1, y: 0.9 });
  });

  test('abgeschnittene Ecke ohne nahen Linienpunkt: Winkelpunkt wird eingefügt, Bogenlängen bleiben die der Linie', () => {
    const line = [at(0, 0), at(0, 8), at(8, 10), at(16, 10)];
    const cum = [0, 8, 16.25, 24.25];
    const r = cornerDisplayLine(line, [at(2, 11)], cum);
    expect(r.changed).toBe(1);
    expect(r.points).toHaveLength(5);
    expect(xy(r.points[2])).toEqual({ x: 2, y: 11 });
    expect(r.cum).toHaveLength(5);
    expect(r.cum![2]).toBeGreaterThan(8);
    expect(r.cum![2]).toBeLessThan(16.25);
    expect([r.cum![0], r.cum![1], r.cum![3], r.cum![4]]).toEqual(cum);
    for (let i = 1; i < r.cum!.length; i++) expect(r.cum![i]).toBeGreaterThanOrEqual(r.cum![i - 1]);
  });

  test('versetzter Linienpunkt behält seine Bogenlänge', () => {
    const cum = FIELD.map((_, i) => i * 2);
    const r = cornerDisplayLine(FIELD, FIELD_CORNERS, cum);
    expect(r.cum).toEqual(cum);
  });

  test('Anfang, Ende und Punkte an einer Lücke werden nie versetzt', () => {
    const line = [at(0, 0), at(0, 10), at(10, 10)];
    expect(cornerDisplayLine(line, [at(-1, -0.5)]).changed).toBe(0);
    expect(cornerDisplayLine(line, [at(10.5, 11)]).changed).toBe(0);
    const gap = [at(0, 0), at(0, 5), at(0, 10), at(20, 10, true), at(25, 10), at(30, 10)];
    const r = cornerDisplayLine(gap, [at(1, 10.5), at(19.5, 11)]);
    expect(r.changed).toBe(0);
    expect(r.points).toEqual(gap);
  });

  test('Lücke wird nicht überbrückt und bleibt erhalten', () => {
    const gap = [at(0, 0), at(0, 5), at(0, 10), at(20, 10, true), at(25, 10), at(30, 10)];
    const r = cornerDisplayLine(gap, [at(10, 10.5), at(1, 5)]);
    expect(xy(r.points[1])).toEqual({ x: 1, y: 5 });
    expect(r.points[3].breakBefore).toBe(true);
    expect(r.changed).toBe(1);
  });

  test('ferne, sehr nahe und ungültige Winkelpunkte ändern nichts', () => {
    const line = [at(0, 0), at(0, 10), at(10, 10)];
    expect(cornerDisplayLine(line, [at(-(CORNER_MAX_SNAP_M + 1), 10)]).changed).toBe(0);
    expect(cornerDisplayLine(line, [at(0.1, 5)]).changed).toBe(0);
    expect(cornerDisplayLine(line, [{ latitude: NaN, longitude: 8.5 }]).changed).toBe(0);
    expect(cornerDisplayLine(line, []).points).toEqual(line);
    expect(cornerDisplayLine(line.slice(0, 2), [at(1, 5)]).changed).toBe(0);
  });

  test('zwei Winkelpunkte versetzen nie denselben Linienpunkt', () => {
    const line = [at(0, 0), at(0, 10), at(10, 10)];
    const r = cornerDisplayLine(line, [at(-1, 10.5), at(-0.5, 11)]);
    expect(r.changed).toBe(1);
    expect(xy(r.points[1])).toEqual({ x: -1, y: 10.5 });
  });

  test('cornerPointsFromMarkers: nur Winkel mit Position, kein Abriss', () => {
    expect(cornerPointsFromMarkers([
      { type: 'winkel', angleKind: 'rechts', lat: 1, lng: 2 },
      { type: 'winkel', angleKind: 'abriss', lat: 3, lng: 4 },
      { type: 'winkel', angleKind: 'links', lat: null, lng: 4 },
      { type: 'gegenstand', lat: 5, lng: 6 },
    ])).toEqual([{ latitude: 1, longitude: 2 }]);
  });
});
