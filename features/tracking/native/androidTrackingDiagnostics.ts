import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

/** Snapshot of this application; service presence is not a session/fix-delivery ACK. */
export type AndroidTrackingDiagnostics = {
  schemaVersion: 1;
  scope: 'application_snapshot';
  androidApiLevel: number | null;
  observedElapsedMs: number | null;
  fineLocationGranted: boolean | null;
  coarseLocationGranted: boolean | null;
  backgroundLocationGranted: boolean | null;
  screenInteractive: boolean | null;
  powerSaveMode: boolean | null;
  deviceIdleMode: boolean | null;
  batteryOptimizationExempt: boolean | null;
  locationServiceCount: number | null;
  locationForegroundServiceObserved: boolean | null;
  serviceLifecycleAvailable: false;
  taskAcknowledgementAvailable: false;
  precisionListener: {
    generation: number | null;
    nativeListenerStarted: boolean | null;
    receivedFixCount: number | null;
    firstReceivedMs: number | null;
    lastReceivedMs: number | null;
    lastFixAgeAtReceiptMs: number | null;
    lastCallbackAgeMs: number | null;
    invalidMonotonicFixTimeCount: number | null;
    stopReason: 'listener_stopped' | 'permission_denied' | 'start_failed' | null;
  };
};

const bool = (value: unknown) => typeof value === 'boolean' ? value : null;
const nonnegative = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const object = (value: unknown): Record<string, unknown> | null =>
  value != null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

/** Explicit allow-list: native extensions, coordinates and raw messages cannot leak through. */
export function parseAndroidTrackingDiagnostics(value: unknown): AndroidTrackingDiagnostics | null {
  const raw = object(value);
  if (!raw || raw.schemaVersion !== 1 || raw.scope !== 'application_snapshot') return null;
  const listener = object(raw.precisionListener) ?? {};
  const reason = listener.stopReason;
  return {
    schemaVersion: 1, scope: 'application_snapshot',
    androidApiLevel: nonnegative(raw.androidApiLevel), observedElapsedMs: nonnegative(raw.observedElapsedMs),
    fineLocationGranted: bool(raw.fineLocationGranted), coarseLocationGranted: bool(raw.coarseLocationGranted),
    backgroundLocationGranted: bool(raw.backgroundLocationGranted), screenInteractive: bool(raw.screenInteractive),
    powerSaveMode: bool(raw.powerSaveMode), deviceIdleMode: bool(raw.deviceIdleMode),
    batteryOptimizationExempt: bool(raw.batteryOptimizationExempt),
    locationServiceCount: nonnegative(raw.locationServiceCount),
    locationForegroundServiceObserved: bool(raw.locationForegroundServiceObserved),
    serviceLifecycleAvailable: false, taskAcknowledgementAvailable: false,
    precisionListener: {
      generation: nonnegative(listener.generation), nativeListenerStarted: bool(listener.nativeListenerStarted),
      receivedFixCount: nonnegative(listener.receivedFixCount), firstReceivedMs: nonnegative(listener.firstReceivedMs),
      lastReceivedMs: nonnegative(listener.lastReceivedMs), lastFixAgeAtReceiptMs: nonnegative(listener.lastFixAgeAtReceiptMs),
      lastCallbackAgeMs: nonnegative(listener.lastCallbackAgeMs),
      invalidMonotonicFixTimeCount: nonnegative(listener.invalidMonotonicFixTimeCount),
      stopReason: reason === 'listener_stopped' || reason === 'permission_denied' || reason === 'start_failed' ? reason : null,
    },
  };
}

/** Older binaries/platforms remain explicitly unavailable; querying does not start sensors. */
export async function readAndroidTrackingDiagnostics(): Promise<AndroidTrackingDiagnostics | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const native = requireOptionalNativeModule<{ getAndroidTrackingDiagnostics?: () => Promise<unknown> }>('AnyvoPrecisionLocation');
    if (typeof native?.getAndroidTrackingDiagnostics !== 'function') return null;
    return parseAndroidTrackingDiagnostics(await native.getAndroidTrackingDiagnostics());
  } catch { return null; }
}
