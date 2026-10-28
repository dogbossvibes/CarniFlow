import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { SplashScreen } from 'expo-router';
import { captureError } from '@/lib/monitoring';
import { useDismissStartupSplash } from '../useDismissStartupSplash';
import { readFileSync } from 'fs';
jest.mock('expo-router', () => ({ SplashScreen: { hideAsync: jest.fn(async () => undefined) } }));
jest.mock('@/lib/monitoring', () => ({ captureError: jest.fn() }));
const layout = (width = 390, height = 844) => ({ nativeEvent: { layout: { width, height, x: 0, y: 0 } } });
function Host() { return <View testID="root" onLayout={useDismissStartupSplash()} />; }
let tree: ReturnType<typeof TestRenderer.create>;
const render = (element: React.ReactElement) => { act(() => { tree = TestRenderer.create(element); }); return { getByTestId: (_: string) => tree.root.findByType(View), rerender: (next: React.ReactElement) => act(() => tree.update(next)) }; };
const fireEvent = (node: ReactTestInstance, _name: string, event: unknown) => node.props.onLayout(event);
beforeEach(() => { jest.clearAllMocks(); });
afterEach(() => { act(() => tree?.unmount()); jest.restoreAllMocks(); });
it('dismisses on first real layout without touch, timers or animation frames', async () => {
  const frame = jest.spyOn(global, 'requestAnimationFrame').mockImplementation(() => 1);
  const ui = render(<Host />);
  expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
  await act(async () => { fireEvent(ui.getByTestId('root'), 'layout', layout()); });
  expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  expect(frame).not.toHaveBeenCalled();
  frame.mockRestore();
});
it.each([[0, 0], [390, 0], [-1, 844], [NaN, 844]])('does not expose an unlaid-out root %s/%s', async (w, h) => {
  const ui = render(<Host />);
  await act(async () => { fireEvent(ui.getByTestId('root'), 'layout', layout(w, h)); });
  expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
});
it('does not repeat dismissal on rerender or rotation', async () => {
  const ui = render(<Host />);
  await act(async () => { fireEvent(ui.getByTestId('root'), 'layout', layout()); });
  ui.rerender(<Host />);
  await act(async () => { fireEvent(ui.getByTestId('root'), 'layout', layout(844, 390)); });
  expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
});
it('reports rejection and permits retry on a later layout', async () => {
  (SplashScreen.hideAsync as jest.Mock).mockRejectedValueOnce(new Error('native hide failed'));
  const ui = render(<Host />);
  await act(async () => { fireEvent(ui.getByTestId('root'), 'layout', layout()); });
  expect(captureError).toHaveBeenCalledTimes(1);
  await act(async () => { fireEvent(ui.getByTestId('root'), 'layout', layout()); });
  expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(2);
});
it('contains synchronous bridge failures instead of crashing startup', async () => {
  (SplashScreen.hideAsync as jest.Mock).mockImplementationOnce(() => { throw new Error('bridge failed'); });
  const ui = render(<Host />);
  await act(async () => { fireEvent(ui.getByTestId('root'), 'layout', layout()); });
  expect(captureError).toHaveBeenCalledTimes(1);
});
it('keeps the guard connected to normal root and error fallback in future builds', () => {
  const source = readFileSync('app/_layout.tsx', 'utf8');
  expect(source).toContain('<GestureHandlerRootView style={{ flex: 1 }} onLayout={dismissSplash}>');
  expect(source).toContain('<View style={eb.wrap} onLayout={dismissSplash}>');
  const hook = readFileSync('hooks/useDismissStartupSplash.ts', 'utf8');
  expect(hook).not.toMatch(/requestAnimationFrame\s*\(|setTimeout\s*\(|reloadAsync\s*\(|preventAutoHideAsync\s*\(/);
});
it('coalesces layouts while native dismissal is pending', async () => {
  let resolve!: () => void;
  (SplashScreen.hideAsync as jest.Mock).mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
  const ui = render(<Host />);
  act(() => { fireEvent(ui.getByTestId('root'), 'layout', layout()); fireEvent(ui.getByTestId('root'), 'layout', layout()); });
  expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  await act(async () => { resolve(); });
});
it('handles a late native failure after unmount without a reload or state update', async () => {
  let reject!: (error: Error) => void;
  (SplashScreen.hideAsync as jest.Mock).mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; }));
  const ui = render(<Host />);
  act(() => { fireEvent(ui.getByTestId('root'), 'layout', layout()); tree.unmount(); });
  await act(async () => { reject(new Error('late native failure')); });
  expect(captureError).toHaveBeenCalledTimes(1);
});
