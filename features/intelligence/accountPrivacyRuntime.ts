import { validUuid } from './contract';
import { IntelligenceSession } from './session';
import { IntelligenceConsentController, type ConsentGateway } from './consentController';
import { createConsentOutbox, consentOutboxQueue, type ConsentStorage } from './consentOutbox';

// Account-only privacy lane: no dog, policy load, chat, grant or microphone.
// It can send only previously durably recorded revocations of this account.
export function createAccountConsentPrivacy(accountId: string, currentAccount: () => string | null,
  storage: ConsentStorage, gateway: ConsentGateway) {
  if (!validUuid(accountId)) throw new Error('Invalid privacy identity');
  let disposed = false; const pending = new Set<AbortController>();
  const account = () => { try { return !disposed && currentAccount() === accountId ? accountId : null; } catch { return null; } };
  const session = new IntelligenceSession({ respond: async () => null }, () => '');
  const consent = new IntelligenceConsentController(session, createConsentOutbox(storage), {
    readRevision: async () => null, grant: async () => null,
    async revoke(context, signal) {
      if (context.accountId !== account() || signal.aborted) return null;
      const abort = new AbortController(); pending.add(abort);
      const cancel = () => abort.abort(); signal.addEventListener('abort', cancel, { once: true });
      let rejectCancelled!: () => void;
      const cancelled = new Promise<never>((_, reject) => { rejectCancelled = () => reject(new Error('Privacy interrupted')); });
      abort.signal.addEventListener('abort', rejectCancelled, { once: true });
      try {
        const raw = await Promise.race([gateway.revoke({ ...context }, abort.signal), cancelled]);
        return account() && !abort.signal.aborted ? raw : null;
      } finally {
        signal.removeEventListener('abort', cancel); abort.signal.removeEventListener('abort', rejectCancelled); pending.delete(abort);
      }
    },
  }, () => '', 15000, consentOutboxQueue, account);
  return {
    retry: () => account() ? consent.retryRevocations(accountId) : Promise.resolve(false),
    interrupt() { for (const abort of pending) abort.abort(); },
    dispose() { disposed = true; for (const abort of pending) abort.abort(); },
  };
}
