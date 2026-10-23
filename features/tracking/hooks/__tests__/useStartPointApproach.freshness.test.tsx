import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useStartPointApproach, type StartApproach } from '../useStartPointApproach';
import type { SearchRecorder } from '../useSearchRecorder';

const START = { lat: 0, lng: 0 };
type Fix = NonNullable<SearchRecorder['liveFix']>;
let renderer: ReactTestRenderer;
let current: StartApproach;
function Harness({ fix, active = true }: { fix: Fix | null; active?: boolean }) {
  current = useStartPointApproach({ active, start: START, liveFix: fix });
  return null;
}
function feed(northM = 0, accuracy = 4, t = Date.now()) {
  act(() => { renderer.update(<Harness fix={{ lat: northM / 111_320, lng: 0, accuracy, t }} />); });
}
beforeEach(() => {
  jest.useFakeTimers({ now: 1_000_000 });
  act(() => { renderer = TestRenderer.create(<Harness fix={null} />); });
});
afterEach(() => { act(() => { renderer.unmount(); }); jest.useRealTimers(); });
function reachStart() {
  feed();
  act(() => { jest.advanceTimersByTime(1000); });
  feed();
  expect(current.armed).toBe(true);
}

it('counts the same measurement only once even when delivered in a new object', () => {
  feed(); feed(); feed();
  expect(current.armed).toBe(false);
  expect(current.fixesRemaining).toBe(1);
});
it('does not infer departure from two imprecise fixes after reaching the start', () => {
  reachStart();
  for (let i = 0; i < 2; i++) {
    act(() => { jest.advanceTimersByTime(1000); }); feed(8, 80);
  }
  expect(current.phase).not.toBe('departed_start');
  expect(current.armed).toBe(false);
});
it('expires start readiness when no fresh measurement follows', () => {
  reachStart();
  act(() => { jest.advanceTimersByTime(5001); });
  expect(current.armed).toBe(false);
  expect(current.withinRadius).toBe(false);
});
it('does not let an out-of-order point poison speed or consume fresh start evidence', () => {
  feed();
  act(() => { jest.advanceTimersByTime(1000); });
  feed(100, 4, 999_000);
  feed();
  expect(current.armed).toBe(true);
});
it('rejects future timestamps and invalid accuracy instead of confirming the start', () => {
  feed(0, -1); act(() => { jest.advanceTimersByTime(1000); }); feed(0, -1);
  expect(current.armed).toBe(false);
  feed(0, 4, Date.now() + 60_000); feed(0, 4, Date.now() + 61_000);
  expect(current.armed).toBe(false);
});
it('still confirms two distinct usable fixes and two usable departures', () => {
  reachStart();
  for (let i = 0; i < 2; i++) {
    act(() => { jest.advanceTimersByTime(1000); }); feed(8, 4);
  }
  expect(current.phase).toBe('departed_start');
});
it('clears evidence and timers when approach is deactivated', () => {
  reachStart();
  act(() => { renderer.update(<Harness active={false} fix={null} />); });
  act(() => { jest.advanceTimersByTime(10_000); });
  expect(current.armed).toBe(false);
  expect(current.startReachedAtMs).toBeNull();
});
it('requires a new reached confirmation after a measurement gap before automatic departure', () => {
  reachStart();
  act(() => { jest.advanceTimersByTime(6000); });
  feed(8);
  act(() => { jest.advanceTimersByTime(1000); }); feed(8);
  expect(current.phase).not.toBe('departed_start');
  act(() => { jest.advanceTimersByTime(1000); }); feed();
  act(() => { jest.advanceTimersByTime(1000); }); feed();
  expect(current.armed).toBe(true);
  for (let i = 0; i < 2; i++) {
    act(() => { jest.advanceTimersByTime(1000); }); feed(8);
  }
  expect(current.phase).toBe('departed_start');
});
it('accepts native fractional milliseconds inside the current JS clock bucket', () => {
  feed(0, 4, Date.now() + 0.5);
  act(() => { jest.advanceTimersByTime(1000); });
  feed(0, 4, Date.now() + 0.5);
  expect(current.armed).toBe(true);
});
it('invalidates reached evidence on the next fix even when suspended JS did not deliver expiry', () => {
  reachStart();
  jest.setSystemTime(Date.now() + 6000);
  feed(8);
  jest.setSystemTime(Date.now() + 1000);
  feed(8);
  expect(current.phase).not.toBe('departed_start');
  expect(current.armed).toBe(false);
  jest.setSystemTime(Date.now() + 1000); feed();
  jest.setSystemTime(Date.now() + 1000); feed();
  expect(current.armed).toBe(true);
});
it('does not retain a departure transition across a gap before the caller consumes it', () => {
  reachStart();
  jest.setSystemTime(Date.now() + 1000); feed(8);
  jest.setSystemTime(Date.now() + 1000); feed(8);
  expect(current.phase).toBe('departed_start');
  jest.setSystemTime(Date.now() + 6000); feed(8);
  expect(current.phase).not.toBe('departed_start');
  expect(current.armed).toBe(false);
});
