// Fährten-Maßstab: Ticks entlang der Referenz-Bogenlänge (buildArc, wie Cursor/
// canonicalArc), adaptive Zoom-Stufen, Live-Distanz, nächster Gegenstand.
import {
  DISTANCE_SCALE, buildDistanceTicks, distanceScaleLevel, distanceScaleRender, labelStepM, nextObjectDistance,
  pointsAtSortedDistances, pointsPerMeter, regionBounds, scaleRegionChanged, searchDistanceReadout, tickClass,
} from '@/features/tracking/utils/distanceScale';
import { buildArc, haversineM, pointAtDistance, type LL } from '@/features/tracking/utils/searchGeometry';

const M_PER_DEG = (6371000 * Math.PI) / 180;
const O: LL = { latitude: 47.0, longitude: 8.0 };
const cosLat = Math.cos((O.latitude * Math.PI) / 180);
/** Punkt (east, north) Meter vom Ursprung. */
const at = (e: number, n: number): LL => ({ latitude: O.latitude + n / M_PER_DEG, longitude: O.longitude + e / (M_PER_DEG * cosLat) });
const north = (len: number) => [at(0, 0), at(0, len)];

describe('Arc-Length / Tickpositionen', () => {
  it('gerade 10-m-Linie: Ticks bei 1…10 m, Abstand vom Start = Bogenlänge', () => {
    const { totalM, ticks } = buildDistanceTicks(north(10));
    expect(totalM).toBeCloseTo(10, 6);
    expect(ticks.map(t => t.m)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const t of ticks) expect(haversineM(at(0, 0), t.at)).toBeCloseTo(t.m, 3);
  });
  it('Klassen: 1 m = one, 5 m = five, 10 m = ten', () => {
    expect([1, 4, 5, 9, 10, 15, 20].map(tickClass)).toEqual(['one', 'one', 'five', 'one', 'ten', 'five', 'ten']);
    const { ticks } = buildDistanceTicks(north(10));
    expect(ticks.filter(t => t.cls === 'five').map(t => t.m)).toEqual([5]);
    expect(ticks.filter(t => t.cls === 'ten').map(t => t.m)).toEqual([10]);
  });
  it('Tick senkrecht zur Fährte (Nord-Linie → Normale Ost/West)', () => {
    const { ticks } = buildDistanceTicks(north(10));
    const n = ticks[4].normal!;
    expect(Math.abs(n.east)).toBeCloseTo(1, 6);
    expect(n.north).toBeCloseTo(0, 6);
  });
  it('Segmentübergang: Tick folgt der Linie über mehrere Segmente (kein Luftlinien-Versatz)', () => {
    const line = [at(0, 0), at(0, 2.5), at(0, 6), at(0, 10)];
    const { ticks } = buildDistanceTicks(line);
    expect(ticks.map(t => t.m)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const t of ticks) expect(haversineM(at(0, 0), t.at)).toBeCloseTo(t.m, 3);
  });
  it('Interpolation identisch zu pointAtDistance (eine Distanzlogik)', () => {
    const line = [at(0, 0), at(3, 4), at(10, 4), at(10, 20)];
    const { cum } = buildArc(line);
    const ds = [0, 0.5, 3, 5, 5.01, 11.9, 12, 20, 27.99, 40];
    const mine = pointsAtSortedDistances(line, cum, ds);
    ds.forEach((d, i) => {
      const ref = pointAtDistance(line, cum, d)!;
      expect(mine[i].latitude).toBeCloseTo(ref.latitude, 12);
      expect(mine[i].longitude).toBeCloseTo(ref.longitude, 12);
    });
  });
  it('90°-Ecke: Ticks auf beiden Schenkeln quer zum jeweiligen Schenkel, Ecke selbst ohne Überlänge', () => {
    const line = [at(0, 0), at(0, 10), at(10, 10)];   // 10 m Nord, dann 10 m Ost
    const { ticks } = buildDistanceTicks(line);
    const t5 = ticks.find(t => t.m === 5)!, t15 = ticks.find(t => t.m === 15)!, t10 = ticks.find(t => t.m === 10)!;
    expect(Math.abs(t5.normal!.east)).toBeCloseTo(1, 6);     // Nord-Schenkel → Ost/West
    expect(Math.abs(t15.normal!.north)).toBeCloseTo(1, 6);   // Ost-Schenkel → Nord/Süd
    // Eckpunkt: Tangente = Winkelhalbierende, Normale ist Einheitsvektor (keine Überlänge)
    expect(Math.hypot(t10.normal!.east, t10.normal!.north)).toBeCloseTo(1, 6);
  });
  it('Spitzwinkel: an der Spitze keine Querrichtung → Tick-Strich entfällt statt falscher Geometrie', () => {
    const line = [at(0, 0), at(0, 10), at(0.5, 0)];   // ~177° Kehre
    const { ticks } = buildDistanceTicks(line);
    expect(ticks.find(t => t.m === 10)!.normal).toBeNull();
    expect(ticks.find(t => t.m === 5)!.normal).not.toBeNull();
    const r = distanceScaleRender(buildDistanceTicks(line), 20, null);
    expect(r.segments.some(s => s.key === 'tick-10')).toBe(false);
    expect(r.labels.some(l => l.m === 10)).toBe(false);
  });
  it('sehr kurze Strecke (< 1 m) → keine Ticks; 1.5 m → genau ein Tick', () => {
    expect(buildDistanceTicks(north(0.6)).ticks).toEqual([]);
    expect(buildDistanceTicks(north(1.5)).ticks.map(t => t.m)).toEqual([1]);
  });
  it('leere/ungültige Geometrie → keine Ticks, kein Absturz', () => {
    expect(buildDistanceTicks([])).toEqual({ totalM: 0, ticks: [] });
    expect(buildDistanceTicks([at(0, 0)])).toEqual({ totalM: 0, ticks: [] });
    expect(buildDistanceTicks([at(0, 0), { latitude: NaN, longitude: 8 }]).ticks).toEqual([]);
    expect(buildDistanceTicks([at(0, 0), at(0, 0)]).ticks).toEqual([]);
  });
});

describe('Zoom (aus react-native-maps-Region: latitudeDelta + Kartenhöhe)', () => {
  it('pointsPerMeter = Höhe / (latitudeDelta · m/°)', () => {
    expect(pointsPerMeter(0.0016, 500)).toBeCloseTo(500 / (0.0016 * M_PER_DEG), 6);
    expect(pointsPerMeter(0, 500)).toBe(0);
    expect(pointsPerMeter(0.001, 0)).toBe(0);
  });
  it('nah = 1 m, mittel = 5 m, weit = 10 m, Übersicht = aus', () => {
    expect(distanceScaleLevel(12)).toBe('fine');
    expect(distanceScaleLevel(3)).toBe('medium');     // Standard-Delta 0.0016 bei ~500 pt Kartenhöhe ≈ 2.8 pt/m
    expect(distanceScaleLevel(pointsPerMeter(0.0016, 500))).toBe('medium');
    expect(distanceScaleLevel(1.5)).toBe('coarse');
    expect(distanceScaleLevel(1)).toBe('off');        // 10-m-Ticks < 12 pt auseinander → Übersicht ohne Maßstab
    expect(distanceScaleLevel(0.3)).toBe('off');
    expect(distanceScaleLevel(0)).toBe('off');
  });
  it('Stufen zeichnen genau ihre Klassen: fine 1/5/10, medium 5/10, coarse nur 10', () => {
    const set = buildDistanceTicks(north(40));
    const cls = (ptPerM: number) => [...new Set(distanceScaleRender(set, ptPerM, null).segments.map(s => s.cls))].sort();
    expect(cls(12)).toEqual(['five', 'one', 'ten']);
    expect(cls(3)).toEqual(['five', 'ten']);
    expect(cls(1.5)).toEqual(['ten']);
    expect(distanceScaleRender(set, 1, null).segments).toEqual([]);
  });
  it('10-m-Zahlen; bei weitem Zoom ausgedünnt (keine Überlappung)', () => {
    const set = buildDistanceTicks(north(100));
    expect(distanceScaleRender(set, 4, null).labels.map(l => l.m)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(labelStepM(1.5)).toBe(50);
    expect(distanceScaleRender(set, 1.5, null).labels.map(l => l.m)).toEqual([50, 100]);
    expect(labelStepM(4) * 4).toBeGreaterThanOrEqual(DISTANCE_SCALE.minLabelSpacingPt);
  });
  it('Zahlen weichen Gegenständen/Winkeln aus (Marker bleiben sichtbar), Ticks bleiben', () => {
    const set = buildDistanceTicks(north(40));
    const free = distanceScaleRender(set, 4, null);
    const withObject = distanceScaleRender(set, 4, null, undefined, [at(0, 20)]);
    expect(free.labels.map(l => l.m)).toEqual([10, 20, 30, 40]);
    expect(withObject.labels.map(l => l.m)).toEqual([10, 30, 40]);
    expect(withObject.segments).toEqual(free.segments);
  });
  it('Strichlänge bildschirmkonstant (pt), nicht metrisch', () => {
    const set = buildDistanceTicks(north(20));
    const len = (ptPerM: number) => {
      const seg = distanceScaleRender(set, ptPerM, null).segments.find(s => s.key === 'tick-10')!;
      return haversineM(seg.coordinates[0], seg.coordinates[1]) * ptPerM;
    };
    expect(len(4)).toBeCloseTo(DISTANCE_SCALE.halfLengthPt.ten * 2, 3);
    expect(len(12)).toBeCloseTo(DISTANCE_SCALE.halfLengthPt.ten * 2, 3);
  });
  it('Region-Drosselung: kleine Kamerabewegung → kein Neuberechnen; Zoom > 25 % → neu', () => {
    const r = { latitude: 47, longitude: 8, latitudeDelta: 0.0016, longitudeDelta: 0.0016 };
    expect(scaleRegionChanged(null, r)).toBe(true);
    expect(scaleRegionChanged(r, { ...r, latitude: 47.0001 })).toBe(false);
    expect(scaleRegionChanged(r, { ...r, latitudeDelta: 0.0021 })).toBe(true);
    expect(scaleRegionChanged(r, { ...r, latitude: 47.0006 })).toBe(true);
    expect(scaleRegionChanged(r, { ...r, latitudeDelta: NaN })).toBe(false);
  });
});

describe('Performance (lange Fährte)', () => {
  const long = Array.from({ length: 401 }, (_, i) => at(0, i * 2.5));   // 1000 m, 400 Segmente
  it('1000 m: Ticks einmal berechnet, Render nur im sichtbaren Bereich und gedeckelt', () => {
    const set = buildDistanceTicks(long);
    expect(set.ticks).toHaveLength(1000);
    // Ganze Fährte sichtbar, feiner Zoom erzwungen → Obergrenze greift, Stufe wird gröber
    const all = distanceScaleRender(set, 12, null);
    expect(all.segments.length).toBeLessThanOrEqual(DISTANCE_SCALE.maxTickSegments);
    expect(all.labels.length).toBeLessThanOrEqual(DISTANCE_SCALE.maxLabels);
    expect(all.level).not.toBe('fine');
    // Nahansicht (~60 m sichtbar) → 1-m-Ticks nur im Ausschnitt
    const region = { latitude: at(0, 500).latitude, longitude: O.longitude, latitudeDelta: 40 / M_PER_DEG, longitudeDelta: 40 / M_PER_DEG };
    const near = distanceScaleRender(set, 12, regionBounds(region));
    expect(near.level).toBe('fine');
    expect(near.segments.length).toBeGreaterThan(40);
    expect(near.segments.length).toBeLessThan(80);
    expect(near.segments.every(s => { const m = Number(s.key.slice(5)); return m > 450 && m < 550; })).toBe(true);
  });
});

describe('Live-Distanz während der Suche', () => {
  it('Fortschritt / Referenzlänge, gerundet', () => {
    expect(searchDistanceReadout(42.4, 86.2)).toEqual({ currentM: 42, totalM: 86 });
  });
  it('Clamp 0..trackLength; ungültig → 0; ohne Länge keine Anzeige', () => {
    expect(searchDistanceReadout(-3, 86)).toEqual({ currentM: 0, totalM: 86 });
    expect(searchDistanceReadout(120, 86)).toEqual({ currentM: 86, totalM: 86 });
    expect(searchDistanceReadout(NaN, 86)).toEqual({ currentM: 0, totalM: 86 });
    expect(searchDistanceReadout(10, 0)).toBeNull();
  });
});

describe('Nächster Gegenstand (entlang der Fährte)', () => {
  const objs = [{ atM: 20, status: 'pending' }, { atM: 50, status: 'pending' }, { atM: 86, status: 'pending' }];
  it('nächster Gegenstand vorwärts', () => {
    expect(nextObjectDistance(objs, 12)).toEqual({ index: 0, distanceM: 8 });
  });
  it('bereits passierter Gegenstand übersprungen (≤ 0 → nächster)', () => {
    expect(nextObjectDistance(objs, 20)).toEqual({ index: 1, distanceM: 30 });
    expect(nextObjectDistance(objs, 35)).toEqual({ index: 1, distanceM: 15 });
  });
  it('bereits gefundener Gegenstand vor dem Hund übersprungen', () => {
    expect(nextObjectDistance([{ atM: 20, status: 'manual_found' }, ...objs.slice(1)], 12)).toEqual({ index: 1, distanceM: 38 });
  });
  it('kein Gegenstand / keine Position → null', () => {
    expect(nextObjectDistance([], 10)).toBeNull();
    expect(nextObjectDistance([{ atM: null }, { atM: undefined }], 10)).toBeNull();
    expect(nextObjectDistance(objs, NaN)).toBeNull();
  });
  it('Gegenstand am Ende: bis zum Ende angezeigt, danach keiner mehr', () => {
    expect(nextObjectDistance(objs, 80)).toEqual({ index: 2, distanceM: 6 });
    expect(nextObjectDistance(objs, 86)).toBeNull();
  });
  it('Reihenfolge der Liste egal — kleinste positive Distanz gewinnt', () => {
    expect(nextObjectDistance([objs[2], objs[0], objs[1]], 25)).toEqual({ index: 2, distanceM: 25 });
  });
});
