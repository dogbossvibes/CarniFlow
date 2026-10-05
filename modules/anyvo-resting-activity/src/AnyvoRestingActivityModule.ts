import { NativeModule, requireOptionalNativeModule } from 'expo';
import type { RestingActivityInfo, RestingActivityStartInput } from './AnyvoRestingActivity.types';

declare class AnyvoRestingActivityModule extends NativeModule {
  isSupported(): boolean;
  start(input: RestingActivityStartInput): string | null;
  end(dogId: string, sessionId: string): Promise<number>;
  endActivity(activityId: string): Promise<boolean>;
  list(): RestingActivityInfo[];
  endLegacyResting(): Promise<number>;
}

// `null`, wenn das native Modul nicht im Build steckt (Android, Expo Go, Build vor V2) —
// der Wrapper fällt dann sicher zurück (gleiches Muster wie anyvo-motion).
export default requireOptionalNativeModule<AnyvoRestingActivityModule>('AnyvoRestingActivity');
