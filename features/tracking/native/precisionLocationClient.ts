// Dünner Client über die native Precision-Location-Bridge
// (modules/anyvo-precision-location). Bündelt Start/Stop, Status und alle
// Event-Listener an einer Stelle, damit Engine/Hooks nicht direkt ins Modul
// greifen. Fällt intern (im Modul) auf expo-location zurück.
import {
  isNativeModuleAvailable, isRawGnssSupported, getProviderStatus,
  startPrecisionTracking, stopPrecisionTracking, requestTemporaryFullAccuracy,
  addPrecisionLocationListener, addProviderStatusListener,
  addGnssStatusListener, addGnssMeasurementListener, addHeadingListener,
  addTrackingErrorListener,
} from '@/modules/anyvo-precision-location';

export const precisionLocationClient = {
  isNativeAvailable:   isNativeModuleAvailable,
  isRawGnssSupported,
  getProviderStatus,
  start:               startPrecisionTracking,
  stop:                stopPrecisionTracking,
  requestTemporaryFullAccuracy,
  // Events
  onLocation:          addPrecisionLocationListener,
  onProviderStatus:    addProviderStatusListener,
  onHeading:           addHeadingListener,
  onGnssStatus:        addGnssStatusListener,
  onGnssMeasurement:   addGnssMeasurementListener,
  onError:             addTrackingErrorListener,
};

export type PrecisionLocationClient = typeof precisionLocationClient;
