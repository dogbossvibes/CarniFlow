import { normalizeConstellations } from '../gnssConstellations';
const gps = { constellation: 'GPS', observed: 3, used: 2, frequenciesHz: [1575420000, 1176450000] };
it('accepts and snapshots observed frequencies without inferring precision', () => {
  const result = normalizeConstellations([gps], 3, 2)!;
  expect(result[0].frequenciesHz).toEqual([1176450000, 1575420000]);
  expect(result[0].frequenciesHz).not.toBe(gps.frequenciesHz);
});
it('retains compatibility with older native builds', () => {
  expect(normalizeConstellations(undefined, 3, 2)).toBeUndefined();
  expect(normalizeConstellations([], 0, 0)).toEqual([]);
});
it.each([
  [{ ...gps, used: 4 }], [{ ...gps, observed: -1 }], [gps, gps],
  [{ ...gps, constellation: 'invented' }], [{ ...gps, frequenciesHz: [NaN] }],
  [{ ...gps, frequenciesHz: [-1] }], [{ ...gps, observed: 2 }],
].map(rows => ({ rows })))('rejects invalid or inconsistent signal reports: %j', ({ rows }) => {
  expect(normalizeConstellations(rows, 3, 2)).toBeUndefined();
});
