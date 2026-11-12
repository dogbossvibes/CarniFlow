import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import { useMapScaleBar } from '../useMapScaleBar';
import type { MapScaleProjection } from '../../utils/mapScaleBar';

const M = 6371000 * Math.PI / 180;
const project = async ({ x }: { x: number }) => ({ latitude: 47 + x / M, longitude: 8 });
let current: ReturnType<typeof useMapScaleBar>;
let stateChange: (state: 'active' | 'background') => void;
let renderer: ReturnType<typeof TestRenderer.create>;
const props = { enabled: true, ready: true, width: 360, height: 500, bottom: 86 };
function Probe(p: typeof props & { mapRef: { current: MapScaleProjection | null } }) {
  current = useMapScaleBar(p);
  return null;
}
async function advance(ms = 100) { await act(async () => { jest.advanceTimersByTime(ms); }); }
function mount(coordinateForPoint = jest.fn(project), overrides = {}) {
  const mapRef = { current: { coordinateForPoint } };
  act(() => { renderer = TestRenderer.create(<Probe {...props} {...overrides} mapRef={mapRef} />); });
  return { mapRef, coordinateForPoint };
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    stateChange = listener;
    return { remove: jest.fn() };
  });
});
afterEach(() => { act(() => renderer?.unmount()); jest.restoreAllMocks(); jest.useRealTimers(); });

it('measures after layout/readiness, keeps the ruler above metrics', async () => {
  const { coordinateForPoint } = mount();
  expect(current.scale).toBeNull();
  await advance();
  expect(current.scale?.meters).toBe(100);
  expect(coordinateForPoint.mock.calls[0][0]).toEqual({ x: 22, y: 405 });
});
it.each([{ enabled: false }, { ready: false }, { width: 0 }, { height: 100 }])('does not probe unusable layout/state %s', async overrides => {
  const { coordinateForPoint } = mount(jest.fn(project), overrides);
  await advance();
  expect(coordinateForPoint).not.toHaveBeenCalled();
});
it('discards late projection results after explicit lifecycle invalidation', async () => {
  let resolve!: (value: { latitude: number; longitude: number }) => void;
  const slow = new Promise<{ latitude: number; longitude: number }>(r => { resolve = r; });
  const coordinateForPoint = jest.fn(project).mockImplementationOnce(() => slow);
  mount(coordinateForPoint);
  await advance();
  act(() => current.invalidate());
  await act(async () => { resolve({ latitude: 47 + 22 / M, longitude: 8 }); });
  expect(current.scale).toBeNull();
  act(() => current.refresh());
  await advance();
  expect(current.scale?.meters).toBe(100);
});
it('clears a previous ruler on explicit invalidation, then recalculates', async () => {
  mount(); await advance();
  act(() => current.invalidate()); expect(current.scale).toBeNull();
  act(() => current.refresh()); await advance(); expect(current.scale?.meters).toBe(100);
});
it('bounds failed native retries and never invents a ruler', async () => {
  const coordinateForPoint = jest.fn(project).mockRejectedValue(new Error('not ready'));
  mount(coordinateForPoint);
  await advance(); await advance(250); await advance(250); await advance(5000);
  expect(coordinateForPoint).toHaveBeenCalledTimes(6);
  expect(current.scale).toBeNull();
});
it('suspends in background and refreshes on resume', async () => {
  const { coordinateForPoint } = mount(); await advance();
  act(() => stateChange('background')); expect(current.scale).toBeNull();
  coordinateForPoint.mockClear(); act(() => current.refresh()); await advance();
  expect(coordinateForPoint).not.toHaveBeenCalled();
  act(() => stateChange('active')); await advance(); expect(current.scale?.meters).toBe(100);
});
it('cancels scheduled native work at unmount', async () => {
  const { coordinateForPoint } = mount();
  act(() => renderer.unmount()); await advance(); expect(coordinateForPoint).not.toHaveBeenCalled();
});

it('coalesces motion storms instead of postponing the next sample', async () => {
  const { coordinateForPoint } = mount(); await advance();
  coordinateForPoint.mockClear();
  for (let i = 0; i < 125; i++) {
    act(() => current.onRegionChange());
    await advance(16);
  }
  expect(current.scale?.meters).toBe(100);
  // Five native reads/sample, at most five samples/second (+ one boundary sample).
  expect(coordinateForPoint.mock.calls.length).toBeGreaterThan(5);
  expect(coordinateForPoint.mock.calls.length).toBeLessThanOrEqual(55);
});
it('updates zoom under ongoing camera motion without a completion event', async () => {
  const { coordinateForPoint } = mount(); await advance();
  coordinateForPoint.mockImplementation(async ({ x }) => ({ latitude: 47 + x * 4 / M, longitude: 8 }));
  for (let i = 0; i < 20; i++) { act(() => current.onRegionChange()); await advance(16); }
  expect(current.scale?.meters).toBe(200);
  expect(current.scale?.width).toBeCloseTo(50, 3);
});
it('expires a moving ruler when native reads stop responding and bounds retries', async () => {
  const { coordinateForPoint } = mount(); await advance();
  coordinateForPoint.mockImplementation(() => new Promise(() => {}));
  act(() => current.onRegionChange());
  await advance(200); await advance(301);
  expect(current.scale).toBeNull();
  await advance(200); await advance(301); await advance(200); await advance(301); await advance(5000);
  // Initial successful five reads, then one physically pending two-read batch.
  expect(coordinateForPoint.mock.calls.length).toBe(7);
});
it('does not start a second sample while a native measurement is in flight', async () => {
  const coordinateForPoint = jest.fn(project).mockImplementation(() => new Promise(() => {}));
  mount(coordinateForPoint); await advance();
  for (let i = 0; i < 10; i++) { act(() => current.onRegionChange()); await advance(16); }
  expect(coordinateForPoint).toHaveBeenCalledTimes(2);
});
it('does not start the verification batch after unmount', async () => {
  let resolve!: (p: { latitude: number; longitude: number }) => void;
  const slow = new Promise<{ latitude: number; longitude: number }>(r => { resolve = r; });
  const coordinateForPoint = jest.fn(project).mockImplementationOnce(() => slow);
  mount(coordinateForPoint); await advance();
  act(() => renderer.unmount());
  await act(async () => { resolve({ latitude: 47 + 22 / M, longitude: 8 }); });
  expect(coordinateForPoint).toHaveBeenCalledTimes(2);
});
it('retains a stationary verified ruler without polling or expiring it', async () => {
  const { coordinateForPoint } = mount(); await advance();
  await advance(5000);
  expect(current.scale?.meters).toBe(100);
  expect(coordinateForPoint).toHaveBeenCalledTimes(5);
});

it('waits for a timed-out native batch to settle, then starts a fresh sample', async () => {
  let resolve!: (p: { latitude: number; longitude: number }) => void;
  const slow = new Promise<{ latitude: number; longitude: number }>(r => { resolve = r; });
  const coordinateForPoint = jest.fn(project).mockImplementationOnce(() => slow);
  mount(coordinateForPoint); await advance(); await advance(301); await advance(100);
  expect(current.scale).toBeNull(); expect(coordinateForPoint).toHaveBeenCalledTimes(2);
  await act(async () => { resolve({ latitude: 60, longitude: 100 }); });
  expect(current.scale).toBeNull();
  await advance(); expect(current.scale?.meters).toBe(100);
  expect(coordinateForPoint).toHaveBeenCalledTimes(7);
});
it('waits for old native layout work, then samples the new bar position', async () => {
  let resolve!: (p: { latitude: number; longitude: number }) => void;
  const slow = new Promise<{ latitude: number; longitude: number }>(r => { resolve = r; });
  const coordinateForPoint = jest.fn(project).mockImplementationOnce(() => slow);
  const { mapRef } = mount(coordinateForPoint); await advance();
  act(() => { (renderer as unknown as { update: (element: React.ReactElement) => void }).update(<Probe {...props} height={600} mapRef={mapRef} />); });
  await advance(); expect(current.scale).toBeNull(); expect(coordinateForPoint).toHaveBeenCalledTimes(2);
  await act(async () => { resolve({ latitude: 60, longitude: 100 }); });
  await advance(); expect(current.scale?.meters).toBe(100);
  expect(coordinateForPoint.mock.calls[2][0]).toEqual({ x: 22, y: 505 });
});
it('discards native results resolved in the background and samples again on resume', async () => {
  let resolve!: (p: { latitude: number; longitude: number }) => void;
  const slow = new Promise<{ latitude: number; longitude: number }>(r => { resolve = r; });
  const coordinateForPoint = jest.fn(project).mockImplementationOnce(() => slow);
  mount(coordinateForPoint); await advance();
  act(() => stateChange('background'));
  await act(async () => { resolve({ latitude: 47 + 22 / M, longitude: 8 }); });
  expect(current.scale).toBeNull(); expect(coordinateForPoint).toHaveBeenCalledTimes(2);
  act(() => stateChange('active')); await advance(); expect(current.scale?.meters).toBe(100);
});

it('keeps physical native calls bounded during an eight-second motion storm', async () => {
  const coordinateForPoint = jest.fn(project).mockImplementation(() => new Promise(() => {}));
  mount(coordinateForPoint); await advance();
  for (let i = 0; i < 500; i++) { act(() => current.onRegionChange()); await advance(16); }
  expect(coordinateForPoint).toHaveBeenCalledTimes(2);
  expect(current.scale).toBeNull();
});
it('does not release a pending sibling native call when another call rejects', async () => {
  const coordinateForPoint = jest.fn(project)
    .mockRejectedValueOnce(new Error('native failed'))
    .mockImplementation(() => new Promise(() => {}));
  mount(coordinateForPoint); await advance();
  for (let i = 0; i < 100; i++) { act(() => current.onRegionChange()); await advance(16); }
  expect(coordinateForPoint).toHaveBeenCalledTimes(2);
  expect(current.scale).toBeNull();
});
it('retains the physical native budget across repeated background/resume and hook remounts', async () => {
  const coordinateForPoint = jest.fn(project).mockImplementation(() => new Promise(() => {}));
  const { mapRef } = mount(coordinateForPoint); await advance();
  for (let i = 0; i < 5; i++) {
    act(() => stateChange('background')); act(() => stateChange('active')); await advance(400);
    act(() => renderer.unmount());
    act(() => { renderer = TestRenderer.create(<Probe {...props} mapRef={mapRef} />); });
    await advance(400);
  }
  expect(coordinateForPoint).toHaveBeenCalledTimes(2);
});
