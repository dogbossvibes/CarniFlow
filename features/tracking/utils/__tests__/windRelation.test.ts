// T-201: Wind im Verhältnis zur Laufrichtung — reine Logik.
import { compassLabel, walkBearingDeg, windRelation } from '../windRelation';

describe('compassLabel', () => {
  test('acht Sektoren, auch über 360° und negativ', () => {
    expect([0, 44, 46, 90, 180, 270, 315, 359].map(compassLabel)).toEqual(['N', 'NO', 'NO', 'O', 'S', 'W', 'NW', 'N']);
    expect(compassLabel(405)).toBe('NO');
    expect(compassLabel(-90)).toBe('W');
    expect(compassLabel(null)).toBeNull();
    expect(compassLabel(Number.NaN)).toBeNull();
  });
});

describe('windRelation', () => {
  test('Wind aus der Richtung, in die man geht = Gegenwind', () => {
    expect(windRelation(0, 0)).toBe('headwind');
    expect(windRelation(350, 20)).toBe('headwind');
    expect(windRelation(270, 270)).toBe('headwind');
  });
  test('Wind von hinten = Rückenwind', () => {
    expect(windRelation(180, 0)).toBe('tailwind');
    expect(windRelation(90, 270)).toBe('tailwind');
  });
  test('Seitenwind: Wind aus Osten kommt beim Gehen nach Norden von rechts', () => {
    expect(windRelation(90, 0)).toBe('cross_right');
    expect(windRelation(270, 0)).toBe('cross_left');
    expect(windRelation(0, 90)).toBe('cross_left');     // nach Osten gehen, Wind aus Norden
    expect(windRelation(180, 90)).toBe('cross_right');
  });
  test('Sektorgrenzen', () => {
    expect(windRelation(45, 0)).toBe('headwind');
    expect(windRelation(46, 0)).toBe('cross_right');
    expect(windRelation(135, 0)).toBe('tailwind');
    expect(windRelation(226, 0)).toBe('cross_left');
    expect(windRelation(315, 0)).toBe('headwind');
  });
  test('ohne gültige Werte keine Aussage', () => {
    expect(windRelation(null, 0)).toBeNull();
    expect(windRelation(90, undefined)).toBeNull();
    expect(windRelation(Number.NaN, 0)).toBeNull();
  });
});

describe('walkBearingDeg', () => {
  const M = 1 / 111320;
  const north = (m: number) => ({ lat: 47 + m * M, lng: 8 });
  test('zu wenig gelegte Strecke → keine Richtung', () => {
    expect(walkBearingDeg([])).toBeNull();
    expect(walkBearingDeg([north(0), north(3)])).toBeNull();
  });
  test('Richtung der letzten Meter', () => {
    expect(walkBearingDeg([north(0), north(4), north(10)])).toBeCloseTo(0, 3);
    const east = (m: number) => ({ lat: 47, lng: 8 + (m * M) / Math.cos((47 * Math.PI) / 180) });
    expect(walkBearingDeg([east(0), east(12)])).toBeCloseTo(90, 3);
    expect(walkBearingDeg([north(20), north(0)])).toBeCloseTo(180, 3);
  });
  test('nach einem Winkel zählt der neue Schenkel, sobald genug Strecke darauf liegt', () => {
    const corner = { lat: 47 + 30 * M, lng: 8 };
    const after = (m: number) => ({ lat: corner.lat, lng: corner.lng + (m * M) / Math.cos((corner.lat * Math.PI) / 180) });
    expect(walkBearingDeg([north(0), north(15), corner, after(5), after(10)])).toBeCloseTo(90, 0);
  });
});
