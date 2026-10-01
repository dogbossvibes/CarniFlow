import { confirmLayMovement, type LayMovementFix, type LayGaitSample } from '../layMovementConfirmation';

const anchor = { lat: 47, lng: 8 };
const north = (m: number): LayMovementFix => ({ lat: anchor.lat + m / 111_320, lng: anchor.lng, accuracy: 4.5, t: 1000 + m * 400 });
const gait = (t: number, stepDelta: number, movementState = 'walking', accelerationMagnitude = 0.14): LayGaitSample =>
  ({ t, stepDelta, movementState, accelerationMagnitude });
const input = (fixes: LayMovementFix[], samples: LayGaitSample[], nowMs: number) => ({
  anchor, anchorAccuracyM: 4.5, acceptedFixes: fixes, gaitSamples: samples,
  sessionStartedMs: 1000, nowMs, fallbackAfterMs: 12_000,
});

it('confirms two session steps even before the GPS displacement threshold', () => {
  const result = confirmLayMovement(input([north(0)], [gait(1200, 1), gait(1600, 1)], 1700));
  expect(result).toMatchObject({ confirmed: true, source: 'pedometer', stepDelta: 2 });
});

it('requires two consecutive accepted fixes away from the median anchor', () => {
  expect(confirmLayMovement(input([north(0), north(2.5)], [], 3000)).confirmed).toBe(false);
  expect(confirmLayMovement(input([north(0), north(2.5), north(3)], [], 3100)).source).toBe('gps_displacement');
  expect(confirmLayMovement(input([north(0), north(2.5), north(0.2)], [], 3100)).confirmed).toBe(false);
});

it('accepts sustained walking with acceleration and small real GPS movement', () => {
  const result = confirmLayMovement(input([north(0), north(1.1), north(1.3)], [gait(1100, 0), gait(2200, 0)], 2300));
  expect(result.source).toBe('motion_gps');
});

it('does not release on stationary GPS jitter or IMU alone', () => {
  expect(confirmLayMovement(input([north(0), north(0.6), north(0.4)], [], 3000)).confirmed).toBe(false);
  expect(confirmLayMovement(input([north(0)], [gait(1100, 0), gait(2200, 0)], 2300)).confirmed).toBe(false);
  expect(confirmLayMovement(input([north(0), north(1.3)], [gait(1100, 0), gait(2200, 0)], 2300)).confirmed).toBe(false);
});

it('uses fallback only for geometry after twelve seconds', () => {
  expect(confirmLayMovement(input([north(0)], [], 12_999)).source).toBeNull();
  expect(confirmLayMovement(input([north(0)], [], 13_000)).source).toBe('fallback');
});

it('never uses samples or steps from before session start', () => {
  expect(confirmLayMovement(input([north(0)], [gait(0, 20)], 2000)).confirmed).toBe(false);
});
