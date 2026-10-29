import { createConsentStorageQueue, type ConsentOutbox, type PendingRevocation } from './consentController';
import { validId } from './contract';

// Shared across dog-bound conversations and account-only privacy routes.
export const consentOutboxQueue = createConsentStorageQueue();

export const CONSENT_OUTBOX_KEY = 'anyvo.intelligence.pending-revocations.v1';
export interface ConsentStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
const MAX_RECORDS = 256;
const validRecords = (v: unknown): v is PendingRevocation[] => Array.isArray(v) && v.length <= MAX_RECORDS
  && v.every(r => r && typeof r === 'object' && !Array.isArray(r) && validId(r.accountId) && validId(r.policyId)
    && Object.keys(r).every(k => k === 'accountId' || k === 'policyId'));

// Inject the existing app storage at composition time. No storage is opened on
// import. Keep this namespace across logout; it contains no prompts or audio.
export function createConsentOutbox(storage: ConsentStorage): ConsentOutbox {
  return {
    async read() {
      const raw = await storage.getItem(CONSENT_OUTBOX_KEY);
      if (raw === null) return [];
      if (typeof raw !== 'string' || raw.length > 100000) throw new Error('Invalid consent outbox');
      const records: unknown = JSON.parse(raw);
      if (!validRecords(records)) throw new Error('Invalid consent outbox');
      return records.map(r => ({ ...r }));
    },
    async write(records) {
      if (!validRecords(records)) throw new Error('Invalid consent outbox');
      await storage.setItem(CONSENT_OUTBOX_KEY, JSON.stringify(records));
    },
  };
}
