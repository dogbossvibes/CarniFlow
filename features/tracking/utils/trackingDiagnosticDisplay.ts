import type { TrackingEngineMode } from './trackingEngineMode';
import type { LocationSourceMode } from './locationSourceMode';
import type { ActiveTrackingModes } from './trackingWarmupState';

export function trackingEngineDisplayLabel(mode: TrackingEngineMode | null): string {
  return mode === 'build40' ? 'Legacy · Build 40' : mode === 'current' ? 'CURRENT' : '—';
}

export function selectedLocationSourceLabel(mode: LocationSourceMode | null): string {
  return mode === 'legacy' ? 'Expo Location' : mode === 'precision' ? 'Native Precision' : '—';
}

/** UI-only view of the selected path and the source reported by an actual lay fix. */
export function trackingLocationDiagnosticDisplay(input: {
  selected: LocationSourceMode;
  active: ActiveTrackingModes;
  nativeModuleAvailable: boolean;
  platform: 'ios' | 'android' | 'web';
}): { selected: string; streamSelection: string; active: string; runtimeProvider: string; nativeModule: string } {
  const { selected, active, nativeModuleAvailable, platform } = input;
  const osProvider = platform === 'ios' ? 'iOS Core Location'
    : platform === 'android' ? 'Android LocationManager' : 'Plattform-Standortdienst';
  const reported = active.warmupActive ? active.reportedSource : null;
  const runtimeProvider = !active.warmupActive ? '—'
    : reported === 'native' ? `AnyvoPrecisionLocation / ${osProvider}`
      : reported === 'expo' ? `expo-location / ${osProvider}`
        : reported === 'external' ? 'Externes BLE-GPS'
          : 'Wartet auf ersten Fix';
  return {
    selected: selectedLocationSourceLabel(selected),
    streamSelection: active.warmupActive ? selectedLocationSourceLabel(active.source) : 'Kein Lege-Stream aktiv',
    active: !active.warmupActive ? 'Kein Lege-Stream aktiv'
      : reported === 'native' ? 'Native Precision'
        : reported === 'expo' ? 'Expo Location'
          : reported === 'external' ? 'Externes BLE-GPS' : 'Wartet auf ersten Fix',
    runtimeProvider,
    nativeModule: nativeModuleAvailable ? 'Verfügbar' : 'Nicht verfügbar',
  };
}
