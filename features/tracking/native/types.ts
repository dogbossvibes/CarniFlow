// App-seitige Bridge-Typen für das native Precision-Location-Modul.
// Re-exportiert die kanonischen Typen aus modules/anyvo-precision-location,
// damit App-Code stabil über '@/features/tracking/native/types' importiert,
// ohne direkt in den Modul-Ordner zu greifen.
export type {
  PrecisionLocation,
  ProviderStatus,
  PrecisionTrackingOptions,
  RawGnssSupportStatus,
  RawGnssReason,
  GnssStatusAndroid,
  GnssMeasurementAndroid,
  GnssMeasurementBatchAndroid,
  ConstellationType,
  TrackingError,
  TrackingErrorCode,
  AnyvoPrecisionLocationModuleEvents,
  // Phase 3 (iOS)
  IosProviderStatus,
  IosAuthStatus,
  AccuracyAuthorization,
  HeadingPoint,
  TemporaryFullAccuracyResult,
  TrackingMode,
  LocationQuality,
} from '@/modules/anyvo-precision-location';
