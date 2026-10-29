import { auditMotionArrivals } from '../motionArrivalAudit';
import type { QaMotionTimeline } from '../qaSessionCapture';
const timeline = (times: [number, number][], omitted = 0): QaMotionTimeline => ({
  version: 1, limit: 4096, observed: times.length + omitted, omitted,
  timeBasis: 'relative_to_first_recorded_fix', samples: times.map(([tMs, receivedMs]) => ({
    tMs, receivedMs, headingDelta: 1, rotationMagnitude: .1, accelerationMagnitude: .1,
    stepDelta: 1, cadence: 100, movementState: 'walking',
  })),
});
it('keeps delayed future arrivals out of an earlier decision', () => {
  expect(auditMotionArrivals(timeline([[100, 110], [200, 1000]]), 500)).toMatchObject({ accepted: 1, notYetReceived: 1, retained: 1 });
});
it('retains actual arrival order and uses the production duplicate/backwards guard', () => {
  const input = timeline([[200, 210], [100, 220], [200, 230], [300, 350]]);
  const original = JSON.stringify(input);
  expect(auditMotionArrivals(input, 400)).toMatchObject({ accepted: 2, rejectedNonIncreasing: 2, retained: 2, maxDelayMs: 120 });
  expect(JSON.stringify(input)).toBe(original);
});
it('uses the production retention window', () => {
  expect(auditMotionArrivals(timeline([[0, 0], [21000, 21000]]), 22000)).toMatchObject({ accepted: 2, retained: 1 });
});
it('does not claim full reconstruction for truncated capture', () => {
  expect(auditMotionArrivals(timeline([[100, 110]], 4), 120).status).toBe('partial_capture');
});
it('rejects a backwards reception clock instead of sorting it away', () => {
  expect(auditMotionArrivals(timeline([[100, 200], [200, 190]]), 220).status).toBe('invalid_time_basis');
});
it('does not synthesize legacy motion events', () => {
  expect(auditMotionArrivals(undefined, 0).status).toBe('unavailable');
});
