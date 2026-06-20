import { NativeModule, requireOptionalNativeModule } from 'expo';
import type {
  AnyvoPrecisionLocationModuleEvents, PrecisionTrackingOptions, ProviderStatus,
  RawGnssSupportStatus, TemporaryFullAccuracyResult,
} from './AnyvoPrecisionLocation.types';

declare class AnyvoPrecisionLocationModule extends NativeModule<AnyvoPrecisionLocationModuleEvents> {
  isRawGnssSupported(): RawGnssSupportStatus;
  getProviderStatus(): Promise<ProviderStatus>;
  startPrecisionTracking(options: PrecisionTrackingOptions): Promise<void>;
  stopPrecisionTracking(): Promise<void>;
  requestTemporaryFullAccuracy(purposeKey?: string): Promise<TemporaryFullAccuracyResult>;
}

// requireOptionalNativeModule → gibt `null` zurück, wenn das native Modul (noch)
// nicht im Build steckt (z. B. Expo Go oder ein Build vor dem Hinzufügen).
// Der Wrapper in ../index.ts fällt dann sauber auf expo-location zurück.
export default requireOptionalNativeModule<AnyvoPrecisionLocationModule>('AnyvoPrecisionLocation');
