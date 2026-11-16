import { NativeModule, requireOptionalNativeModule } from 'expo';

export interface DailyWidgetTransport {
  isAvailable(): boolean;
  beginSession(ownerId: string | null): string;
  updateSnapshot(token: string, sequence: number, json: string): Promise<boolean>;
  updateAvailability(token: string, sequence: number, state: 'offline' | 'error'): Promise<boolean>;
}

declare class AnyvoDailyWidgetModule extends NativeModule implements DailyWidgetTransport {
  isAvailable(): boolean;
  beginSession(ownerId: string | null): string;
  updateSnapshot(token: string, sequence: number, json: string): Promise<boolean>;
  updateAvailability(token: string, sequence: number, state: 'offline' | 'error'): Promise<boolean>;
}

// Older binaries, Expo Go and web must never acquire data for an absent widget.
export const dailyWidgetTransport = requireOptionalNativeModule<AnyvoDailyWidgetModule>('AnyvoDailyWidget');
