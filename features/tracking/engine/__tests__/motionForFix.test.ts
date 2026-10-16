import { motionForFix, type TimedMotionInput } from '../trackFusionEngine';

const sample: TimedMotionInput = {
  timestamp: 10000, movementState: 'stationary', stepDelta: 0,
  accelerationMagnitude: 0, rotationMagnitude: 0, headingDelta: 0, motionConfidence: 1,
};

describe('motionForFix', () => {
  it('keeps fresh native evidence, including the freshness boundary', () => {
    expect(motionForFix(sample, 11000, 12000)).toBe(sample);
  });
  it.each([
    [10000, 12001], [7999, 10000], [12001, 10000],
    [10000, 9999], [NaN, 10000], [10000, Infinity],
  ])('falls back to GPS for incompatible fix/clock %s / %s', (fix, now) => {
    expect(motionForFix(sample, fix, now)).toBeNull();
  });
  it('accepts native fractional milliseconds within the current JS clock tick', () => {
    const native = { ...sample, timestamp: 10000.9 };
    expect(motionForFix(native, 10000, 10000)).toBe(native);
  });
  it('rejects absent or invalid timestamps', () => {
    expect(motionForFix(null, 10000, 10000)).toBeNull();
    expect(motionForFix({ ...sample, timestamp: NaN }, 10000, 10000)).toBeNull();
  });
});
