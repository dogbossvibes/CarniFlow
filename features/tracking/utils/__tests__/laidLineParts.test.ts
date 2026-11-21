import { buildArc, laidLineParts, haversineM, type LL } from '@/features/tracking/utils/searchGeometry';
import { nextEventArcM, type SearchEvent } from '@/features/tracking/utils/searchMapView';

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
const total = (parts: LL[][]) => parts.reduce((sum, part) => sum + length(part), 0);

describe('Stücke der gelegten Linie für die Absuche-Anzeige', () => {
  const arc = buildArc(track);

  it('abgesuchter Teil: vom Start bis zum Fortschritt, mit interpoliertem Ende', () => {
    const parts = laidLineParts(track, arc.cum, 0, 30);
    expect(parts).toHaveLength(1);
    expect(total(parts)).toBeCloseTo(30, 0);
    expect(parts[0][0]).toEqual({ latitude: 47, longitude: 8 });
    expect(parts[0][parts[0].length - 1].longitude).toBeCloseTo(8, 9);
  });

  it('folgt dem Winkel', () => {
    const parts = laidLineParts(track, arc.cum, 30, 55);
    expect(parts).toHaveLength(1);
    expect(total(parts)).toBeCloseTo(25, 0);
    expect(parts[0]).toHaveLength(3);
    expect(parts[0][1]).toEqual({ latitude: track[2].latitude, longitude: track[2].longitude });
  });

  it('auch sehr kurze Stücke werden gezeichnet (kein Mindestmass wie beim Hundeband)', () => {
    expect(total(laidLineParts(track, arc.cum, 10, 10.5))).toBeCloseTo(0.5, 1);
  });

  it('leer bei Fortschritt 0, verkehrtem Bereich oder unbrauchbaren Eingaben', () => {
    expect(laidLineParts(track, arc.cum, 0, 0)).toEqual([]);
    expect(laidLineParts(track, arc.cum, 30, 20)).toEqual([]);
    expect(laidLineParts(track, arc.cum, 0, Number.NaN)).toEqual([]);
    expect(laidLineParts(track.slice(0, 1), [0], 0, 10)).toEqual([]);
    expect(laidLineParts(track, arc.cum.slice(1), 0, 10)).toEqual([]);
  });

  it('läuft nie über das Fährtenende hinaus', () => {
    expect(total(laidLineParts(track, arc.cum, 70, 500))).toBeCloseTo(arc.total - 70, 0);
  });

  it('trennt an einer Lücke der Referenz und zieht nie eine Linie darüber', () => {
    const gapped: LL[] = [track[0], track[1], { ...track[3], breakBefore: true }, track[4]];
    const gapArc = buildArc(gapped);
    const parts = laidLineParts(gapped, gapArc.cum, 5, 35);
    expect(parts).toHaveLength(2);
    expect(length(parts[0])).toBeCloseTo(15, 0);
    expect(length(parts[1])).toBeCloseTo(15, 0);
    expect(parts[0][parts[0].length - 1]).toEqual({ latitude: track[1].latitude, longitude: track[1].longitude });
    expect(parts[1][0]).toEqual({ latitude: track[3].latitude, longitude: track[3].longitude });
  });
});

describe('Ziel der Betonung: nächstes Ereignis oder Fährtenende', () => {
  const events: SearchEvent[] = [
    { id: 'w1', arcM: 40, label: '90 R' },
    { id: 'g1', arcM: 60, label: 'G1' },
  ];

  it('nächstes Ereignis vor der virtuellen Hundeposition', () => {
    expect(nextEventArcM(events, 10, 15, 80)).toBe(40);
  });

  it('ein Ereignis zwischen Hundeführerin und Hund ist schon angesagt → das übernächste', () => {
    expect(nextEventArcM(events, 36, 46, 80)).toBe(60);
  });

  it('liegt der Hund am Gegenstand, endet die Betonung dort', () => {
    expect(nextEventArcM(events, 55, 60, 80)).toBe(60);
  });

  it('ohne weiteres Ereignis bis zum Fährtenende', () => {
    expect(nextEventArcM(events, 62, 72, 80)).toBe(80);
    expect(nextEventArcM([], 0, 5, 80)).toBe(80);
  });
});
