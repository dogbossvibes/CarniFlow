import React from 'react';
import { Platform } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { AndroidTrackingDiagnosticsCard } from '../AndroidTrackingDiagnosticsCard';

const mockRead = jest.fn();
jest.setTimeout(30_000);
jest.mock('@/features/tracking/native/androidTrackingDiagnostics', () => ({
  readAndroidTrackingDiagnostics: () => mockRead(),
}));

// Repository renderer typings lack the traversal/JSON helpers.
let renderer: any;
const originalPlatform = Platform.OS;
const mount = () => { act(() => { renderer = TestRenderer.create(<AndroidTrackingDiagnosticsCard />); }); };
const button = () => renderer.root.findAll((node: any) => node.props.accessibilityLabel === 'Android-Systemzustand abfragen')[0];

beforeEach(() => { Platform.OS = 'android'; mockRead.mockReset(); });
afterEach(() => { act(() => renderer?.unmount()); renderer = null; Platform.OS = originalPlatform; });

it('reads only after an explicit query, with no automatic query on iOS', async () => {
  mount();
  expect(mockRead).not.toHaveBeenCalled();
  act(() => renderer.unmount());
  Platform.OS = 'ios';
  mount();
  expect(renderer.toJSON()).toBeNull();
  expect(mockRead).not.toHaveBeenCalled();
});

it('keeps old-binary unavailability explicit and does not start a repeated query on a double tap', async () => {
  let resolve!: (value: null) => void;
  mockRead.mockImplementation(() => new Promise(done => { resolve = done; }));
  mount();
  act(() => { button().props.onPress(); button().props.onPress(); });
  expect(mockRead).toHaveBeenCalledTimes(1);
  expect(button().props.accessibilityState).toEqual({ disabled: true, busy: true });
  await act(async () => { resolve(null); });
  expect(JSON.stringify(renderer.toJSON())).toContain('Native Diagnose nicht verfügbar');
  expect(button().props.accessibilityState).toEqual({ disabled: false, busy: false });
});

it('labels a snapshot separately from a track and does not turn unavailable state or zero into success', async () => {
  mockRead.mockResolvedValue({
    fineLocationGranted: false, coarseLocationGranted: true, backgroundLocationGranted: null,
    screenInteractive: false, powerSaveMode: null, deviceIdleMode: null, batteryOptimizationExempt: null,
    locationForegroundServiceObserved: false,
    precisionListener: { nativeListenerStarted: false, receivedFixCount: 0, lastFixAgeAtReceiptMs: 0, lastCallbackAgeMs: null },
  });
  mount();
  await act(async () => { button().props.onPress(); });
  const json = JSON.stringify(renderer.toJSON());
  expect(json).toContain('nicht zu einer gespeicherten Fährte');
  expect(json).toContain('unbekannt');
  expect(json).toContain('0 ms');
  expect(json).toContain('nein');
  expect(json).toContain('Bestätigung des Hintergrundtasks: nicht verfügbar');
});

it('ignores completion after unmount', async () => {
  let resolve!: (value: null) => void;
  mockRead.mockImplementation(() => new Promise(done => { resolve = done; }));
  mount();
  act(() => { button().props.onPress(); renderer.unmount(); });
  await act(async () => { resolve(null); });
  expect(mockRead).toHaveBeenCalledTimes(1);
});
