// Öffentliche Typen des anyvo-precision-location Moduls.
//
// Phase 1: einfache High-Accuracy-Location (Android LocationManager /
//          iOS Core Location) + expo-location-Fallback.
// Phase 2: Android Raw GNSS Measurements + GNSS Status (nur Android).
//          iOS bleibt funktional unverändert (rawGnss immer false).
// Phase 3: iOS Core-Location-Feintuning + Heading/Kompass + Precise-Location.

export type LocationQuality = 'excellent' | 'good' | 'poor' | 'bad';

// ── Position ─────────────────────────────────────────────────────
export interface PrecisionLocation {
  latitude:  number;
  longitude: number;
  accuracy:  number | null;   // horizontale Genauigkeit in Metern
  altitude:  number | null;   // Meter
  speed:     number | null;   // m/s
  bearing:   number | null;   // Grad (0..360), Bewegungsrichtung (= heading)
  timestamp: number;          // ms seit Epoch
  provider:  string;          // 'gps' | 'ios_core_location' | 'expo-location' | …
  source:    'native' | 'expo-location';
  // Phase 3 (additiv, optional — Android/Fallback setzen sie nicht):
  altitudeAccuracy?: number | null;
  speedAccuracy?:    number | null;
  heading?:          number | null;   // Kurs (iOS course); = bearing
  headingAccuracy?:  number | null;
  quality?:          LocationQuality;
  rawGnssAvailable?: boolean;
  isMocked?:         boolean;
}

// ── Raw GNSS (Android) ───────────────────────────────────────────
export type ConstellationType =
  | 'GPS' | 'GLONASS' | 'GALILEO' | 'BEIDOU' | 'QZSS' | 'SBAS' | 'UNKNOWN';

export interface GnssMeasurementAndroid {
  constellationType:                          ConstellationType | string;
  svid:                                       number;
  cn0DbHz:                                    number | null;
  carrierFrequencyHz:                         number | null;
  pseudorangeRateMetersPerSecond:             number | null;
  pseudorangeRateUncertaintyMetersPerSecond:  number | null;
  accumulatedDeltaRangeMeters:                number | null;
  accumulatedDeltaRangeUncertaintyMeters:     number | null;
  receivedSvTimeNanos:                        number | null;
  receivedSvTimeUncertaintyNanos:             number | null;
  timeOffsetNanos:                            number | null;
  state:                                      number | null;
  multipathIndicator:                         number | null;
  timestamp:                                  number;
}

// Ein Batch = alle Messungen einer GNSS-Epoche (≈1 Hz). Performanter als
// Einzel-Events (siehe Kommentar im Kotlin-Modul).
export interface GnssMeasurementBatchAndroid {
  timestamp:    number;
  measurements: GnssMeasurementAndroid[];
}

export interface GnssStatusAndroid {
  satelliteCount:     number;
  usedInFixCount:     number;
  averageCn0DbHz:     number | null;
  maxCn0DbHz:         number | null;
  hasRawMeasurements: boolean;
  timestamp:          number;
}

export type RawGnssReason =
  | 'SUPPORTED'
  | 'ANDROID_VERSION_TOO_OLD'
  | 'GPS_FEATURE_MISSING'
  | 'LOCATION_PERMISSION_MISSING'
  | 'LOCATION_PROVIDER_DISABLED'
  | 'UNKNOWN';

export interface RawGnssSupportStatus {
  supported:           boolean;
  reason:              RawGnssReason | string | null;
  androidApiLevel:     number;
  gpsFeatureAvailable: boolean;
  providerEnabled:     boolean;
}

// ── Fehler ───────────────────────────────────────────────────────
export type TrackingErrorCode =
  // Android (Phase 2)
  | 'RAW_GNSS_NOT_SUPPORTED'
  | 'LOCATION_PERMISSION_MISSING'
  | 'GPS_PROVIDER_DISABLED'
  | 'GNSS_CALLBACK_FAILED'
  // iOS (Phase 3)
  | 'IOS_LOCATION_PERMISSION_DENIED'
  | 'IOS_REDUCED_ACCURACY'
  | 'IOS_HEADING_UNAVAILABLE'
  | 'IOS_HEADING_UNRELIABLE'
  | 'IOS_LOCATION_SERVICES_DISABLED'
  | 'IOS_BACKGROUND_LOCATION_NOT_ALLOWED'
  | 'TEMPORARY_FULL_ACCURACY_NOT_AVAILABLE'
  // gemeinsam
  | 'UNKNOWN_NATIVE_ERROR';

export interface TrackingError {
  code:        TrackingErrorCode | string;
  message:     string;
  platform:    'android' | 'ios';
  recoverable: boolean;
}

// ── iOS-spezifisch (Phase 3) ─────────────────────────────────────
export type IosAuthStatus =
  | 'notDetermined' | 'restricted' | 'denied'
  | 'authorizedAlways' | 'authorizedWhenInUse' | 'unknown';

export type AccuracyAuthorization = 'fullAccuracy' | 'reducedAccuracy' | 'unknown';

export interface IosProviderStatus {
  platform:               'ios';
  authorizationStatus:    IosAuthStatus;
  accuracyAuthorization:  AccuracyAuthorization;
  preciseLocationEnabled: boolean;
  locationServicesEnabled: boolean;
  headingAvailable:       boolean;
  backgroundAllowed:      boolean;
  rawGnssAvailable:       false;
  rawGnssSupported:       false;
  lastLocationAt?:        number | null;
  lastHeadingAt?:         number | null;
}

export interface TemporaryFullAccuracyResult {
  granted:                boolean;
  preciseLocationEnabled: boolean;
  error?:                 string | null;
}

export interface HeadingPoint {
  trueHeading?:     number | null;
  magneticHeading?: number | null;
  headingAccuracy?: number | null;
  x?:               number | null;
  y?:               number | null;
  z?:               number | null;
  timestamp:        number;
  platform:         'ios' | 'android';
}

// Aufnahme-Modus (iOS-Tuning, Android ignoriert es).
export type TrackingMode = 'tracking_dog_sport' | 'walking' | 'debug';

// ── Provider-Status (Phase 1 Felder beibehalten, Phase 2/3 additiv) ──
export interface ProviderStatus {
  // Phase 1 (Rückwärtskompatibilität)
  available: boolean;
  gpsEnabled: boolean;
  provider: string;
  source: 'native' | 'expo-location';
  message?: string;
  // Phase 2
  platform: 'android' | 'ios' | 'web';
  locationPermission: 'granted' | 'denied' | 'unknown';
  gpsProviderEnabled: boolean;
  networkProviderEnabled: boolean;
  rawGnssSupported: boolean;
  rawGnssActive: boolean;
  satelliteCount: number | null;
  usedInFixCount: number | null;
  averageCn0DbHz: number | null;
  lastGnssStatusAt: number | null;
  // Phase 3 (iOS; auf Android optional/abwesend)
  authorizationStatus?:    IosAuthStatus;
  accuracyAuthorization?:  AccuracyAuthorization;
  preciseLocationEnabled?: boolean;
  locationServicesEnabled?: boolean;
  headingAvailable?:       boolean;
  backgroundAllowed?:      boolean;
  rawGnssAvailable?:       boolean;
  lastLocationAt?:         number | null;
  lastHeadingAt?:          number | null;
}

export interface PrecisionTrackingOptions {
  intervalMs?:           number;        // gewünschtes Update-Intervall (Default 1000)
  minIntervalMs?:        number;        // schnellstes Intervall (Android, optional)
  enableRawGnssAndroid?: boolean;       // Raw GNSS auf Android aktivieren (Phase 2)
  mode?:                 TrackingMode;  // iOS-Tuning (Phase 3)
  enableHeading?:        boolean;       // iOS Kompass/Heading (Phase 3)
  allowBackground?:      boolean;       // iOS Background-Location (Phase 3)
  purposeKey?:           string;        // iOS Temporary-Full-Accuracy Purpose-Key
}

// ── Native Event-Map ─────────────────────────────────────────────
export type AnyvoPrecisionLocationModuleEvents = {
  onPrecisionLocation: (event: PrecisionLocation) => void;
  onProviderStatus:    (event: ProviderStatus) => void;
  onGnssStatus:        (event: GnssStatusAndroid) => void;            // nur Android
  onGnssMeasurement:   (event: GnssMeasurementBatchAndroid) => void;  // nur Android
  onHeading:           (event: HeadingPoint) => void;                 // v. a. iOS
  onTrackingError:     (event: TrackingError) => void;
};
