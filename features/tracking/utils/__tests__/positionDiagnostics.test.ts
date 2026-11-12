import { beginPositionDiagnostics, recordPositionDiagnostics, recordGnssDiagnostics, endPositionDiagnostics, getPositionDiagnostics, diagnosticIsFresh, subscribePositionDiagnostics } from '../positionDiagnostics';
import { normalizeFixQuality } from '../locationFixQuality';
it('normalizes missing/invalid uncertainty and preserves zero', () => {
  expect(normalizeFixQuality({ altitudeAccuracy: 0, speedAccuracy: -1, courseAccuracy: Infinity })).toEqual({ altitudeAccuracy: 0, speedAccuracy: null, courseAccuracy: null });
  expect(normalizeFixQuality({})).toEqual({ altitudeAccuracy: null, speedAccuracy: null, courseAccuracy: null });
});
it('isolates generations, validates satellite counts and clears GNSS on fallback', () => {
  const old = beginPositionDiagnostics(); const current = beginPositionDiagnostics();
  recordPositionDiagnostics(old, { lat: 1, lng: 2, source: 'native', t: 1000 }); endPositionDiagnostics(old);
  expect(getPositionDiagnostics()).toMatchObject({ active: true, fix: null });
  recordGnssDiagnostics(current, { satelliteCount: 3, usedInFixCount: 4, timestamp: 1000, hasRawMeasurements: false, averageCn0DbHz: 20, maxCn0DbHz: 30 });
  expect(getPositionDiagnostics().gnss).toBeNull();
  recordGnssDiagnostics(current, { satelliteCount: 12, usedInFixCount: 7, timestamp: 1000, hasRawMeasurements: false, averageCn0DbHz: 20, maxCn0DbHz: 30 });
  expect(getPositionDiagnostics().gnss).toMatchObject({ satelliteCount: 12, usedInFixCount: 7 });
  recordPositionDiagnostics(current, { lat: 1, lng: 2, source: 'expo', t: 1000 });
  recordGnssDiagnostics(current, { satelliteCount: 12, usedInFixCount: 7, timestamp: 1000, hasRawMeasurements: false, averageCn0DbHz: 20, maxCn0DbHz: 30 });
  expect(getPositionDiagnostics().gnss).toBeNull();
  endPositionDiagnostics(current);
});
it('diagnostic listener failure cannot interrupt recording and no coordinates are retained', () => {
  const unsubscribe = subscribePositionDiagnostics(() => { throw new Error('bad observer'); });
  const id = beginPositionDiagnostics();
  expect(() => recordPositionDiagnostics(id, { lat: 47, lng: 8, accuracy: 3, source: 'native', t: 1000 })).not.toThrow();
  expect(getPositionDiagnostics().fix).not.toHaveProperty('lat'); unsubscribe(); endPositionDiagnostics(id);
});
it('shows old, absent and future status as unavailable using existing freshness limit', () => {
  expect(diagnosticIsFresh(1000, 2000)).toBe(true); expect(diagnosticIsFresh(1000, 10000)).toBe(false);
  expect(diagnosticIsFresh(undefined, 2000)).toBe(false); expect(diagnosticIsFresh(3000, 2000)).toBe(false);
});
