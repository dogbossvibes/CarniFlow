import fixture from './fixtures/native-core-contract.json';
import { motionForFix, type TimedMotionInput } from '@/features/tracking/engine/trackFusionEngine';

// Fixture emitted by the exact product Swift core; no device/Sensor SDK claim.
describe('native measurement payload with published JS freshness guard', () => {
  const sample = fixture.fresh as TimedMotionInput;
  it('accepts native measurement time rather than requiring timer dispatch time', () => {
    expect(sample.timestamp).toBe(99950);
    expect(motionForFix(sample, 100000, 100000)).toBe(sample);
  });
  it('expires the actual native payload when measurement delivery stops', () => {
    expect(motionForFix(sample, 102001, 102001)).toBeNull();
  });
  it('falls back to GPS for an empty native window and a different GPS time window', () => {
    expect(fixture.empty).toBeNull();
    expect(motionForFix(fixture.empty, 100000, 100000)).toBeNull();
    expect(motionForFix(sample, 104000, 100000)).toBeNull();
  });
  it('rejects the previous native generation after stop and restart', () => {
    expect(fixture.previousRunRejected).toBe(true);
    expect(fixture.newRunIsDifferent).toBe(true);
  });
});
