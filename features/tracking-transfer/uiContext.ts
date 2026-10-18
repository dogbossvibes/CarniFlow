import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { createSupabaseTransferClient } from './rpc';
import { createTransferLocalStore } from './localStore';
import { createTransferJournal } from './operationJournal';
import { createTrackTransferService, transferCrypto } from './service';
/** Shared wiring only; all validation, consent and persistence remain in the existing service. */
export function createTransferUiContext(userId: string | null) {
  const client = createSupabaseTransferClient();
  const local = createTransferLocalStore(() => ({ userId, epoch: client.epoch() }), id => {
    const s = useTrackingStore.getState(); return s.currentSessionId === id && (s.isRecording || s.isRunningTrack);
  });
  const service = userId ? createTrackTransferService(userId, { client, local, journal: createTransferJournal(userId), ...transferCrypto }) : null;
  return { client, service };
}
