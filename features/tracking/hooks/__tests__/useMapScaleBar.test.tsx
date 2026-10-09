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
it('discards late projection results after camera movement', async () => {
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
it('clears a previous ruler while moving, then recalculates', async () => {
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
