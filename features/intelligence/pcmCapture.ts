import type { AudioCleanup, AudioFiles } from './audioCleanup';
import { AUDIO_LIMITS } from './transcriptionHttp';

export interface PcmRecorder {
  uri: string | null;
  prepareToRecordAsync(): Promise<void>;
  record(options: { forDuration: number }): void;
  stop(): Promise<void>;
  release(): void;
}
export interface PcmTake {
  start(): void;
  bytes(): Promise<Uint8Array>;
  close(): Promise<boolean>;
}
let activePcmOwner: symbol | null = null;
export interface PcmCapturePort {
  onInterruption?(listener: () => void): () => void;
  available(): boolean;
  permitted(): Promise<boolean>;
  recover(): Promise<boolean>;
  prepare(signal: AbortSignal): Promise<PcmTake>;
}
// Exact dedicated recorder ownership. No scan, blanket deletion, shared mode
// reset or reuse of the tracking listener. Registration precedes microphone use.
export function createPcmCapturePort(deps: {
  onInterruption?: (listener: () => void) => () => void;
  available: () => boolean; permitted: () => Promise<boolean>;
  mode: () => Promise<void>; create: () => PcmRecorder;
  files: AudioFiles & { bytes(uri: string): Promise<Uint8Array> };
  cleanup: AudioCleanup; audioIdle: () => boolean;
}): PcmCapturePort {
  const owner = Symbol();
  let busy = false; let blocked = false;
  let failedPreparation: (() => Promise<boolean>) | null = null;
  return {
    onInterruption: deps.onInterruption,
    available: deps.available, permitted: deps.permitted,
    recover: async () => {
      if (failedPreparation) {
        if (!await failedPreparation()) return false;
        failedPreparation = null;
      }
      if (busy || activePcmOwner !== null) return false;
      const clean = await deps.cleanup.recover();
      if (clean) blocked = false;
      return clean;
    },
    async prepare(signal) {
      if (busy || blocked || activePcmOwner !== null || signal.aborted || !deps.audioIdle()) throw new Error('Capture unavailable');
      busy = true; activePcmOwner = owner;
      let recorder: PcmRecorder | null = null; let uri: string | null = null;
      let registered = false; let started = false; let stopped = false; let released = false;
      let closing: Promise<boolean> | null = null;
      const active = () => !signal.aborted && deps.audioIdle();
      const stop = async () => {
        if (stopped) return;
        if (recorder) await recorder.stop();
        stopped = true;
      };
      const close = () => closing ??= (async () => {
        // A failed stop must never be interpreted as a safe deletion ACK.
        try { await stop(); } catch { return false; }
        try { if (!released) { recorder?.release(); released = true; } } catch { /* retain journal */ }
        let clean = recorder === null;
        if (uri && released) {
          if (registered) clean = await deps.cleanup.cleanup(uri);
          else if (deps.cleanup.valid(uri)) {
            // Journal write failed before record(). Only this just-created,
            // never-started file may be removed without durable registration.
            try { await deps.files.remove(uri); clean = (await deps.files.info(uri)).exists === false; } catch { clean = false; }
          }
        }
        if (activePcmOwner === owner) activePcmOwner = null;
        busy = false; blocked = !clean;
        return clean;
      })().then(clean => { if (!clean) closing = null; return clean; });
      try {
        await deps.mode(); if (!active()) throw new Error('Capture interrupted');
        recorder = deps.create(); uri = recorder.uri;
        if (!uri || !deps.cleanup.valid(uri)) throw new Error('Invalid recorder path');
        registered = await deps.cleanup.register(uri);
        if (!registered || !active()) throw new Error('Capture unavailable');
        // Do not pass options again: native SDK would allocate another URI.
        await recorder.prepareToRecordAsync();
        if (!active() || recorder.uri !== uri) throw new Error('Capture interrupted');
        const owned = recorder; const file = uri;
        return {
          start() {
            if (started || closing || !active()) throw new Error('Capture interrupted');
            owned.record({ forDuration: AUDIO_LIMITS.maxSeconds }); started = true;
          },
          async bytes() {
            if (!started || closing || !active()) throw new Error('Capture interrupted');
            await stop(); if (!active()) throw new Error('Capture interrupted');
            const info = await deps.files.info(file);
            if (!active() || info.exists !== true || info.isDirectory === true || !Number.isSafeInteger(info.size)
              || info.size! < 46 || info.size! > AUDIO_LIMITS.uploadBytes) throw new Error('Invalid audio');
            const bytes = await deps.files.bytes(file);
            if (!active() || bytes.byteLength !== info.size || bytes.byteLength > AUDIO_LIMITS.uploadBytes) {
              bytes.fill(0); throw new Error('Invalid audio');
            }
            return bytes;
          },
          close,
        };
      } catch (error) { if (!await close()) failedPreparation = close; throw error; }
    },
  };
}
