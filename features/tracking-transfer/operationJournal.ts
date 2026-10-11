import AsyncStorage from '@react-native-async-storage/async-storage';
import { TransferApiError } from './rpc';

export interface JournalEntry { key: string; request: Record<string, string> }
export interface JournalStorage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }
const locks = new Map<string, Promise<unknown>>();
/** Metadata only: no coordinates, tokens, names or reference payloads. Failed writes prevent sending. */
export function createTransferJournal(userId: string, storage: JournalStorage = AsyncStorage) {
  const storageKey = `anyvo_track_transfer_operations_v1:${userId}`;
  async function entries(): Promise<JournalEntry[]> {
    const raw = await storage.getItem(storageKey); if (raw === null) return [];
    let parsed: unknown; try { parsed = JSON.parse(raw); } catch { throw new TransferApiError('STORAGE'); }
    if (!Array.isArray(parsed) || parsed.length > 200 || parsed.some(e => !e || typeof e.key !== 'string'
      || e.key.length > 240 || !e.request || typeof e.request !== 'object' || Array.isArray(e.request)
      || Object.keys(e.request).length > 8 || Object.values(e.request).some(v => typeof v !== 'string' || v.length > 128))) {
      throw new TransferApiError('STORAGE');
    }
    return parsed as JournalEntry[];
  }
  return {
    entries,
    async forget(key: string, expected: Record<string, string>) {
      const previous = locks.get(storageKey) ?? Promise.resolve();
      const operation = previous.catch(() => {}).then(async () => {
        const all = await entries();
        const same = (request: Record<string, string>) => Object.keys(request).length === Object.keys(expected).length
          && Object.keys(expected).every(k => request[k] === expected[k]);
        await storage.setItem(storageKey, JSON.stringify(all.filter(e => e.key !== key || !same(e.request))));
      });
      locks.set(storageKey, operation);
      try { await operation; } catch { throw new TransferApiError('STORAGE'); }
      finally { if (locks.get(storageKey) === operation) locks.delete(storageKey); }
    },
    async reserve(key: string, create: () => Record<string, string>): Promise<Record<string, string>> {
      const previous = locks.get(storageKey) ?? Promise.resolve();
      const operation = previous.catch(() => {}).then(async () => {
        const all = await entries(), existing = all.find(e => e.key === key);
        if (existing) return existing.request;
        if (all.length >= 200) throw new TransferApiError('TRANSFER_LIMIT_REACHED');
        const request = create();
        await storage.setItem(storageKey, JSON.stringify([...all, { key, request }]));
        return request;
      });
      locks.set(storageKey, operation);
      try { return await operation; }
      catch (e) { throw e instanceof TransferApiError ? e : new TransferApiError('STORAGE'); }
      finally { if (locks.get(storageKey) === operation) locks.delete(storageKey); }
    },
  };
}
