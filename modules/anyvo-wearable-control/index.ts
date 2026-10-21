import { NativeModule, requireOptionalNativeModule } from 'expo';
export type WearableCommandEvent = { requestId: string; peerId: string; expiresAtMs: number; json: string };
type Events = { onCommand: (event: WearableCommandEvent) => void; onConnection: (event: { connected: boolean }) => void };
declare class AnyvoWearableControlModule extends NativeModule<Events> {
  isAvailable(): boolean;
  publishSnapshot(json: string): Promise<boolean>;
  respond(requestId: string, json: string): Promise<boolean>;
  clear(): Promise<void>;
}
/** Old binaries safely omit this module; no fake watch connection. */
export const wearableTransport = requireOptionalNativeModule<AnyvoWearableControlModule>('AnyvoWearableControl');
