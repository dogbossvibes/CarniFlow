// anyvo-precision-location — öffentliche API.
//
// Phase 1: einheitliche High-Accuracy-Location (nativ + expo-location-Fallback).
// Phase 2: Android Raw GNSS Measurements + GNSS Status (nur Android).
//
// Fällt automatisch auf expo-location zurück, wenn das native Modul (noch) nicht
// im Build steckt → die App bleibt in jedem Build lauffähig.

import { Platform } from 'react-native';
import * as Location from 'expo-location';
import type { EventSubscription } from 'expo-modules-core';

import Native from './src/AnyvoPrecisionLocationModule';
import type {
  PrecisionLocation, ProviderStatus, PrecisionTrackingOptions,
  RawGnssSupportStatus, GnssStatusAndroid, GnssMeasurementBatchAndroid, TrackingError,
  HeadingPoint, TemporaryFullAccuracyResult,
} from './src/AnyvoPrecisionLocation.types';

export type {
  PrecisionLocation, ProviderStatus, PrecisionTrackingOptions,
  RawGnssSupportStatus, GnssStatusAndroid, GnssMeasurementAndroid,
  GnssMeasurementBatchAndroid, TrackingError, TrackingErrorCode,
  ConstellationType, RawGnssReason, AnyvoPrecisionLocationModuleEvents,
  HeadingPoint, TemporaryFullAccuracyResult, IosProviderStatus, IosAuthStatus,
  AccuracyAuthorization, TrackingMode, LocationQuality,
} from './src/AnyvoPrecisionLocation.types';

type Listener<T> = (event: T) => void;

const NOOP_SUB: EventSubscription = { remove: () => {} };

// Ist das native Modul im aktuellen Build vorhanden?
export function isNativeModuleAvailable(): boolean {
  return Native != null;
}

// ── expo-location-Fallback (wenn kein natives Modul) ──────────────
const locListeners = new Set<Listener<PrecisionLocation>>();
const statusListeners = new Set<Listener<ProviderStatus>>();
let fallbackWatch: Location.LocationSubscription | null = null;

function emitLoc(e: PrecisionLocation) { locListeners.forEach(l => l(e)); }
function emitStatus(e: ProviderStatus) { statusListeners.forEach(l => l(e)); }

function fromExpo(loc: Location.LocationObject): PrecisionLocation {
  const c = loc.coords;
  return {
    latitude: c.latitude, longitude: c.longitude,
    accuracy: c.accuracy ?? null, altitude: c.altitude ?? null,
    speed: c.speed ?? null, bearing: c.heading ?? null,
    timestamp: loc.timestamp ?? Date.now(),
    provider: 'expo-location', source: 'expo-location',
  };
}

// ── Öffentliche API ───────────────────────────────────────────────

// Raw-GNSS-Unterstützung (Android). Fallback/iOS → supported=false.
export function isRawGnssSupported(): RawGnssSupportStatus {
  if (Native) return Native.isRawGnssSupported();
  return {
    supported: false, reason: null, androidApiLevel: 0,
    gpsFeatureAvailable: false, providerEnabled: false,
  };
}

// Aktueller Provider-/Berechtigungs-Status.
export async function getProviderStatus(): Promise<ProviderStatus> {
  if (Native) return Native.getProviderStatus();
  const gpsEnabled = await Location.hasServicesEnabledAsync().catch(() => false);
  const perm = await Location.getForegroundPermissionsAsync().catch(() => null);
  const granted = !!perm?.granted;
  return {
    available: gpsEnabled && granted,
    gpsEnabled,
    provider: 'expo-location',
    source: 'expo-location',
    message: 'Natives Modul nicht im Build — expo-location-Fallback aktiv.',
    platform: (Platform.OS as ProviderStatus['platform']),
    locationPermission: granted ? 'granted' : (perm ? 'denied' : 'unknown'),
    gpsProviderEnabled: gpsEnabled,
    networkProviderEnabled: false,
    rawGnssSupported: false,
    rawGnssActive: false,
    satelliteCount: null,
    usedInFixCount: null,
    averageCn0DbHz: null,
    lastGnssStatusAt: null,
  };
}

// Startet das Präzisions-Tracking (nativ oder Fallback).
export async function startPrecisionTracking(options: PrecisionTrackingOptions = {}): Promise<void> {
  if (Native) { await Native.startPrecisionTracking(options); return; }
  if (fallbackWatch) return;                                   // schon aktiv
  emitStatus(await getProviderStatus());
  fallbackWatch = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: options.intervalMs ?? 1000,
      distanceInterval: 0,
    },
    loc => emitLoc(fromExpo(loc)),
  );
}

// Stoppt das Tracking (inkl. GNSS-Callbacks auf nativer Seite).
export async function stopPrecisionTracking(): Promise<void> {
  if (Native) { await Native.stopPrecisionTracking(); return; }
  fallbackWatch?.remove();
  fallbackWatch = null;
}

// ── Event-Listener ────────────────────────────────────────────────

export function addPrecisionLocationListener(listener: Listener<PrecisionLocation>): EventSubscription {
  if (Native) return Native.addListener('onPrecisionLocation', listener);
  locListeners.add(listener);
  return { remove: () => { locListeners.delete(listener); } };
}

export function addProviderStatusListener(listener: Listener<ProviderStatus>): EventSubscription {
  if (Native) return Native.addListener('onProviderStatus', listener);
  statusListeners.add(listener);
  return { remove: () => { statusListeners.delete(listener); } };
}

// GNSS-Status (nur Android, nativ). Fallback/iOS → no-op.
export function addGnssStatusListener(listener: Listener<GnssStatusAndroid>): EventSubscription {
  if (Native) return Native.addListener('onGnssStatus', listener);
  return NOOP_SUB;
}

// Raw-GNSS-Measurement-Batch (nur Android, nativ). Fallback/iOS → no-op.
export function addGnssMeasurementListener(listener: Listener<GnssMeasurementBatchAndroid>): EventSubscription {
  if (Native) return Native.addListener('onGnssMeasurement', listener);
  return NOOP_SUB;
}

// Tracking-/Native-Fehler. Fallback → no-op.
export function addTrackingErrorListener(listener: Listener<TrackingError>): EventSubscription {
  if (Native) return Native.addListener('onTrackingError', listener);
  return NOOP_SUB;
}

// Kompass/Heading (v. a. iOS, nativ). Fallback/ohne Kompass → no-op.
export function addHeadingListener(listener: Listener<HeadingPoint>): EventSubscription {
  if (Native) return Native.addListener('onHeading', listener);
  return NOOP_SUB;
}

// iOS: temporär volle Genauigkeit anfragen (Reduced-Accuracy-Fall). Fallback/
// Android → graceful: nicht verfügbar.
export async function requestTemporaryFullAccuracy(
  purposeKey: string = 'TrackingDogSportPrecision',
): Promise<TemporaryFullAccuracyResult> {
  if (Native) return Native.requestTemporaryFullAccuracy(purposeKey);
  return {
    granted: false,
    preciseLocationEnabled: false,
    error: 'TEMPORARY_FULL_ACCURACY_NOT_AVAILABLE',
  };
}
