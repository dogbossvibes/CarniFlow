import { trackingEngineDisplayLabel, trackingLocationDiagnosticDisplay } from '../trackingDiagnosticDisplay';
import type { ActiveTrackingModes } from '../trackingWarmupState';

const active = (source: ActiveTrackingModes['source'], reportedSource: string | null): ActiveTrackingModes => ({
  warmupActive: true, engine: 'current', source, reportedSource, startedAt: 1,
  motion: 'off', motionSamples: 0,
});

it('labels the historical engine without changing CURRENT', () => {
  expect(trackingEngineDisplayLabel('build40')).toBe('Legacy · Build 40');
  expect(trackingEngineDisplayLabel('current')).toBe('CURRENT');
});

it('shows Expo as active after an Expo fix even when Native Precision is available', () => {
  expect(trackingLocationDiagnosticDisplay({ selected: 'legacy', active: active('legacy', 'expo'),
    nativeModuleAvailable: true, platform: 'ios' })).toEqual({
    selected: 'Expo Location', streamSelection: 'Expo Location', active: 'Expo Location',
    runtimeProvider: 'expo-location / iOS Core Location', nativeModule: 'Verfügbar',
  });
});

it('shows the native runtime provider only after a native fix', () => {
  expect(trackingLocationDiagnosticDisplay({ selected: 'precision', active: active('precision', 'native'),
    nativeModuleAvailable: true, platform: 'ios' })).toMatchObject({
    selected: 'Native Precision', active: 'Native Precision',
    runtimeProvider: 'AnyvoPrecisionLocation / iOS Core Location',
  });
  expect(trackingLocationDiagnosticDisplay({ selected: 'precision', active: active('precision', 'expo'),
    nativeModuleAvailable: true, platform: 'ios' })).toMatchObject({
    selected: 'Native Precision', active: 'Expo Location',
    runtimeProvider: 'expo-location / iOS Core Location',
  });
});

it('does not claim an active provider before the first fix or while idle', () => {
  const waiting = trackingLocationDiagnosticDisplay({ selected: 'legacy', active: active('legacy', null),
    nativeModuleAvailable: true, platform: 'ios' });
  expect(waiting.active).toBe('Wartet auf ersten Fix');
  expect(waiting.runtimeProvider).toBe('Wartet auf ersten Fix');
  const idle = trackingLocationDiagnosticDisplay({ selected: 'legacy', active: {
    ...active(null, null), warmupActive: false,
  }, nativeModuleAvailable: true, platform: 'ios' });
  expect(idle.active).toBe('Kein Lege-Stream aktiv');
  expect(idle.runtimeProvider).toBe('—');
});
