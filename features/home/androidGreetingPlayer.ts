import { requireOptionalNativeModule } from 'expo-modules-core';

export type AndroidGreetingPlayer = { play(): Promise<boolean>; stop(): Promise<void> };
type NativeGreeting = {
  getApiVersion(): number;
  beginSession(remainingMs: number): string | null;
  play(token: string): Promise<boolean>;
  cancel(token: string): void;
  stop(token: string): Promise<boolean>;
};

// Only called on Android. Old binaries fail closed; never fall back to media audio.
export function createAndroidGreetingPlayer(remainingMs: number): AndroidGreetingPlayer | null {
  try {
    const native = requireOptionalNativeModule<NativeGreeting>('AnyvoGreetingAudio');
    if (!native || native.getApiVersion() !== 1) return null;
    const token = native.beginSession(remainingMs);
    if (!token) return null;
    let stopped = false;
    let stopping: Promise<void> | null = null;
    return {
      async play() {
        if (stopped) return false;
        try { return await native.play(token) === true && !stopped; }
        catch { return false; }
      },
      stop() {
        if (stopping) return stopping;
        stopped = true;
        try { native.cancel(token); } catch { /* Native lifecycle/deadline remain active. */ }
        stopping = (async () => {
          try { await native.stop(token); } catch { /* Lost module: no global audio reset. */ }
        })();
        return stopping;
      },
    };
  } catch { return null; }
}
