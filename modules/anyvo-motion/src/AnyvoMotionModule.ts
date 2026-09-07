import { NativeModule, requireOptionalNativeModule } from 'expo';
import type { AnyvoMotionModuleEvents, MotionStatus, MotionUpdateOptions } from './AnyvoMotion.types';

declare class AnyvoMotionModule extends NativeModule<AnyvoMotionModuleEvents> {
  isAvailable(): boolean;
  getStatus(): Promise<MotionStatus>;
  startMotionUpdates(options: MotionUpdateOptions): Promise<void>;
  stopMotionUpdates(): Promise<void>;
}

// requireOptionalNativeModule → `null`, wenn das native Modul (noch) nicht im
// Build steckt (z. B. Expo Go, Android, oder ein Build vor Einführung des
// Moduls). Der Wrapper in ../index.ts fällt dann sauber auf
// fusionMode = 'gps_only' zurück — dasselbe Muster wie
// anyvo-precision-location.
export default requireOptionalNativeModule<AnyvoMotionModule>('AnyvoMotion');
