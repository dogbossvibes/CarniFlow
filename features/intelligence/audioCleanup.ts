import type { ConsentStorage } from './consentOutbox';
import { createConsentStorageQueue } from './consentController';
export const AUDIO_CLEANUP_KEY = 'anyvo.intelligence.pending-audio-cleanup.v1';
const queue = createConsentStorageQueue();
export interface AudioFiles {
  info(uri: string): Promise<{ exists: boolean; size?: number; isDirectory?: boolean }>;
  remove(uri: string): Promise<void>;
}
// This never scans ExpoAudio or legacy media. Only exact filenames durably
// registered by our dedicated recorder may enter recovery/deletion.
export function createAudioCleanup(storage: ConsentStorage, files: AudioFiles, cacheDirectory: string) {
  const base = cacheDirectory.endsWith('/') ? cacheDirectory : `${cacheDirectory}/`;
  const prefix = `${base}ExpoAudio/`;
  const valid = (uri: unknown): uri is string => typeof uri === 'string' && base.startsWith('file:///')
    && uri.startsWith(prefix) && /^recording-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.wav$/i.test(uri.slice(prefix.length));
  async function read() {
    const raw = await storage.getItem(AUDIO_CLEANUP_KEY); if (raw === null) return [] as string[];
    if (typeof raw !== 'string' || raw.length > 65536) throw new Error('Invalid audio cleanup journal');
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > 32 || !value.every(valid) || new Set(value).size !== value.length) throw new Error('Invalid audio cleanup journal');
    return value as string[];
  }
  async function deleteAndVerify(uri: string) {
    await files.remove(uri);
    const result = await files.info(uri);
    return result.exists === false;
  }
  return {
    valid,
    async register(uri: string) {
      if (!valid(uri)) return false;
      try { return await queue.run(async () => {
        const records = await read(); if (records.includes(uri)) return false; if (records.length >= 32) return false;
        await storage.setItem(AUDIO_CLEANUP_KEY, JSON.stringify([...records, uri])); return true;
      }); } catch { return false; }
    },
    async cleanup(uri: string) {
      if (!valid(uri)) return false;
      try { return await queue.run(async () => {
        const records = await read(); if (!records.includes(uri)) return false;
        if (!await deleteAndVerify(uri)) return false;
        await storage.setItem(AUDIO_CLEANUP_KEY, JSON.stringify(records.filter(value => value !== uri))); return true;
      }); } catch { return false; }
    },
    async recover() {
      try { return await queue.run(async () => {
        const records = await read(); const remaining: string[] = [];
        for (const uri of records) {
          try { if (!await deleteAndVerify(uri)) remaining.push(uri); } catch { remaining.push(uri); }
        }
        if (records.length) await storage.setItem(AUDIO_CLEANUP_KEY, JSON.stringify(remaining));
        return remaining.length === 0;
      }); } catch { return false; }
    },
  };
}
export type AudioCleanup = ReturnType<typeof createAudioCleanup>;
