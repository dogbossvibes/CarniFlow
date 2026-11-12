// T-207: Ende-Radius berücksichtigt die Lege-Unsicherheit des Endpunkts.
import { endRadiusM } from '@/features/tracking/utils/guidanceEngine';

describe('Ende-Radius mit Lege-Unsicherheit (T-207)', () => {
  it('ohne Endpunkt-Genauigkeit unverändert', () => {
    expect(endRadiusM(4)).toBe(2);
    expect(endRadiusM(null)).toBe(3);
    expect(endRadiusM(10)).toBe(3);
  });
  it('mit Endpunkt-Genauigkeit wächst er mit beiden Unsicherheiten, gedeckelt bei 5 m, nie kleiner als bisher', () => {
    expect(endRadiusM(4, 4)).toBeCloseTo(1 + 0.5 * Math.hypot(4, 4), 6);
    expect(endRadiusM(15, 15)).toBe(5);
    expect(endRadiusM(1, 1)).toBeGreaterThanOrEqual(endRadiusM(1));
  });
});
