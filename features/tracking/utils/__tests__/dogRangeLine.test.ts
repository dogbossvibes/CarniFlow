import { buildArc, dogRangeLine, haversineM, DOG_RANGE_MIN_M, type LL } from '@/features/tracking/utils/searchGeometry';

const M_LAT = 1 / 111320;
// L-förmige Fährte: 40 m nach Norden, dann 40 m nach Osten (Winkel bei 40 m).
const LNG_PER_M = 1 / (111320 * Math.cos((47 * Math.PI) / 180));
const track: LL[] = [
  { latitude: 47, longitude: 8 },
  { latitude: 47 + 20 * M_LAT, longitude: 8 },
  { latitude: 47 + 40 * M_LAT, longitude: 8 },
  { latitude: 47 + 40 * M_LAT, longitude: 8 + 20 * LNG_PER_M },
  { latitude: 47 + 40 * M_LAT, longitude: 8 + 40 * LNG_PER_M },
];
const length = (line: LL[]) => line.slice(1).reduce((sum, p, i) => sum + haversineM(line[i], p), 0);

describe('Bereich des Hundes als Linienstück (T-217)', () => {
  const arc = buildArc(track);

  it('reicht von der Hundeführerin bis zur Hundeposition', () => {
    const line = dogRangeLine(track, arc.cum, 5, 15);
    expect(line).toHaveLength(2);
    expect(length(line)).toBeCloseTo(10, 0);
    expect(haversineM(line[0], track[0])).toBeCloseTo(5, 0);
  });

  it('folgt dem Winkel: der Eckpunkt liegt im Band', () => {
    const line = dogRangeLine(track, arc.cum, 35, 45);
    expect(line).toHaveLength(3);
    expect(line[1]).toEqual({ latitude: track[2].latitude, longitude: track[2].longitude });
    expect(length(line)).toBeCloseTo(10, 0);
  });

  it('endet am Fährtenende und läuft nie darüber hinaus', () => {
    const line = dogRangeLine(track, arc.cum, 74, 200);
    expect(length(line)).toBeCloseTo(arc.total - 74, 0);
    expect(line[line.length - 1].longitude).toBeCloseTo(track[4].longitude, 9);
  });

  it(`unter ${DOG_RANGE_MIN_M} m gibt es kein Band (1-m-Abstand, Halt am Gegenstand)`, () => {
    expect(dogRangeLine(track, arc.cum, 10, 11)).toEqual([]);
    expect(dogRangeLine(track, arc.cum, 30, 30)).toEqual([]);
    expect(dogRangeLine(track, arc.cum, 30, 20)).toEqual([]);
    expect(dogRangeLine(track, arc.cum, arc.total - 1, arc.total + 10)).toEqual([]);
  });

  it('zieht keine Linie über eine Lücke der Referenz', () => {
    const gapped: LL[] = [track[0], track[1], { ...track[3], breakBefore: true }, track[4]];
    const gapArc = buildArc(gapped);
    expect(dogRangeLine(gapped, gapArc.cum, 15, 25)).toEqual([]);
    expect(dogRangeLine(gapped, gapArc.cum, 5, 15)).toHaveLength(2);
  });

  it('ungültige Eingaben ergeben kein Band', () => {
    expect(dogRangeLine([], [], 0, 10)).toEqual([]);
    expect(dogRangeLine([track[0]], [0], 0, 10)).toEqual([]);
    expect(dogRangeLine(track, arc.cum, NaN, 10)).toEqual([]);
    expect(dogRangeLine(track, [0, 1], 0, 10)).toEqual([]);
  });
});
