import { importOwnCopy } from './ownImport';
import { parseOwnCopy } from './ownCopy';
import * as Crypto from 'expo-crypto';
import { TransferApiError, type createTransferRpcClient } from './rpc';
import { createTransferJournal } from './operationJournal';
import { assertSameTrackTransferReference, parseTrackTransferReference, type TrackTransferReference } from './reference';
import { readTrackTransferSource, type SourceDependencies } from './source';
import { parseTransferReceipt, type ImportDependencies } from './importPlan';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const digestPattern = /^[0-9a-f]{64}$/;
function valid(condition: unknown): asserts condition { if (!condition) throw new TransferApiError('INVALID_RESPONSE'); }
export interface TransferOffer {
  transferId: string; senderUserId: string; recipientUserId: string; sourceTrainingId: string; referenceDigest: string;
  createdAtMs: number; expiresAtMs: number; status: 'pending' | 'accepted' | 'revoked' | 'expired' | 'unavailable';
}
export function parseTransferOffer(value: unknown): TransferOffer {
  valid(value && typeof value === 'object' && !Array.isArray(value));
  const o = value as Record<string, unknown>;
  valid(Object.keys(o).length === 8 && ['transferId', 'senderUserId', 'recipientUserId', 'sourceTrainingId'].every(k => typeof o[k] === 'string' && uuidPattern.test(o[k] as string))
    && typeof o.referenceDigest === 'string' && digestPattern.test(o.referenceDigest)
    && typeof o.createdAtMs === 'number' && Number.isSafeInteger(o.createdAtMs) && o.createdAtMs > 0
    && typeof o.expiresAtMs === 'number' && Number.isSafeInteger(o.expiresAtMs) && o.expiresAtMs > o.createdAtMs
    && ['pending', 'accepted', 'revoked', 'expired', 'unavailable'].includes(String(o.status)) && o.senderUserId !== o.recipientUserId);
  return { transferId: o.transferId as string, senderUserId: o.senderUserId as string, recipientUserId: o.recipientUserId as string,
    sourceTrainingId: o.sourceTrainingId as string, referenceDigest: o.referenceDigest,
    createdAtMs: o.createdAtMs, expiresAtMs: o.expiresAtMs, status: o.status as TransferOffer['status'] };
}
export function requireSearchableReference(reference: TrackTransferReference) {
  if (reference.distanceM === null || reference.durationSeconds === null || reference.markers.some(m => m.distanceFromStartM === null)) {
    throw new TransferApiError('SOURCE_INCOMPLETE');
  }
}
function quota(value: unknown) {
  const q = value as { success?: unknown; used?: unknown; limit?: unknown } | null;
  valid(q && q.success === true && typeof q.used === 'number' && Number.isSafeInteger(q.used) && q.used >= 0
    && typeof q.limit === 'number' && Number.isSafeInteger(q.limit));
}
export interface TransferServiceDependencies {
  client: Pick<ReturnType<typeof createTransferRpcClient>, 'call'>;
  local: SourceDependencies & ImportDependencies;
  journal: ReturnType<typeof createTransferJournal>;
  uuid(): string;
  hash(value: string): Promise<string>;
}
/** Every mutation is an explicit user action. IDs are durably reserved before the first request. */
export function createTrackTransferService(userId: string, deps: TransferServiceDependencies) {
  const captured = deps.local.currentScope();
  const check = () => {
    const now = deps.local.currentScope();
    if (!userId || captured.userId !== userId || now.userId !== userId || now.epoch !== captured.epoch) throw new TransferApiError('ACCOUNT_CHANGED');
  };
  let busy = false;
  async function mutation<T>(action: () => Promise<T>) {
    check(); if (busy) throw new TransferApiError('BUSY'); busy = true;
    try { const result = await action(); check(); return result; } finally { busy = false; }
  }
  async function call(action: string, request: Record<string, unknown>) {
    check(); const result = await deps.client.call(userId, action, request); check(); return result;
  }
  async function read(transferId: string) {
    const data = await call('read', { transferId }), transfer = parseTransferOffer(data.transfer);
    valid(transfer.transferId === transferId && (transfer.senderUserId === userId || transfer.recipientUserId === userId)
      && data.referenceDigest === transfer.referenceDigest);
    const reference = parseTrackTransferReference(data.reference); requireSearchableReference(reference);
    return { transfer, reference, serverNowMs: data.serverNowMs as number, receipt: data.receipt, quota: data.quota };
  }
  async function importResponse(data: Record<string, unknown>, expected: { transferId: string; receiptId?: string; recipientDogId: string; ownSessionId?: string; ownRunId?: string; referenceDigest: string }, reference: TrackTransferReference) {
    const receipt = parseTransferReceipt(data.receipt); quota(data.quota);
    valid(receipt.recipientUserId === userId && receipt.transferId === expected.transferId && receipt.recipientDogId === expected.recipientDogId
      && receipt.referenceDigest === expected.referenceDigest
      && (!expected.receiptId || receipt.receiptId === expected.receiptId)
      && (!expected.ownSessionId || receipt.ownSessionId === expected.ownSessionId) && (!expected.ownRunId || receipt.ownRunId === expected.ownRunId));
    const copy = parseOwnCopy(data.ownCopy, receipt);
    assertSameTrackTransferReference(reference, copy.reference); check();
    const result = await importOwnCopy(deps.local, userId, receipt, copy); check();
    return { ...result, dogId: receipt.recipientDogId };
  }
  return {
    read,
    async list() {
      const data = await call('list', {});
      valid(Array.isArray(data.incoming) && Array.isArray(data.outgoing) && data.incoming.length <= 500 && data.outgoing.length <= 500);
      const incoming = data.incoming.map(parseTransferOffer), outgoing = data.outgoing.map(parseTransferOffer);
      valid(incoming.every(t => t.recipientUserId === userId) && outgoing.every(t => t.senderUserId === userId)
        && new Set([...incoming, ...outgoing].map(t => t.transferId)).size === incoming.length + outgoing.length);
      return { incoming, outgoing, serverNowMs: data.serverNowMs as number };
    },
    async listOwned(afterReceiptId: string | null = null) {
      const data = await call('list_own', { afterReceiptId });
      valid(Array.isArray(data.owned) && data.owned.length <= 50);
      let previous = afterReceiptId ?? '';
      const owned = data.owned.map(value => {
        valid(value && typeof value === 'object' && !Array.isArray(value));
        const row = value as Record<string, unknown>, receipt = parseTransferReceipt(row.receipt);
        valid(Object.keys(row).length === 3 && receipt.recipientUserId === userId && typeof row.revision === 'number'
          && Number.isSafeInteger(row.revision) && row.revision >= 1 && row.revision <= 10001 && typeof row.deleted === 'boolean'
          && receipt.receiptId > previous); previous = receipt.receiptId;
        return { receipt, revision: row.revision as number, deleted: row.deleted as boolean };
      });
      return { owned, next: owned.length === 50 ? previous : null };
    },
    restoreOwned(receiptId: string) { return mutation(async () => {
      const stored = await deps.local.snapshot(db => db.getFirstAsync<{ local_id: string; user_id: string; dog_id: string; payload_json: string }>(
        `select local_id,user_id,dog_id,payload_json from local_training_sessions where user_id=? and deleted_at is null
         and json_extract(case when json_valid(payload_json) then payload_json else '{}' end, '$.trackTransferReceipt.receiptId')=? limit 1`, userId, receiptId)); check();
      if (stored) {
        const saved = parseTransferReceipt(JSON.parse(stored.payload_json).trackTransferReceipt);
        valid(saved.receiptId === receiptId && saved.recipientUserId === userId && stored.user_id === userId
          && saved.recipientDogId === stored.dog_id && saved.ownSessionId === stored.local_id);
        return { sessionId: saved.ownSessionId, runId: saved.ownRunId, dogId: saved.recipientDogId, created: false };
      }
      const data = await call('restore', { receiptId }), receipt = parseTransferReceipt(data.receipt); quota(data.quota);
      valid(receipt.receiptId === receiptId && receipt.recipientUserId === userId);
      return importOwnCopy(deps.local, userId, receipt, data.ownCopy);
    }); },
    offer(localId: string, recipientUserId: string) { return mutation(async () => {
      valid(uuidPattern.test(recipientUserId) && recipientUserId !== userId);
      const source = await readTrackTransferSource(deps.local, userId, localId); check(); requireSearchableReference(source.reference);
      const fingerprint = await deps.hash(JSON.stringify([source.sourceTrainingId, source.reference])); check();
      const preparation = await deps.journal.reserve(`prepare:${fingerprint}`, () => ({ preparationId: deps.uuid(), sourceTrainingId: source.sourceTrainingId })); check();
      valid(preparation.sourceTrainingId === source.sourceTrainingId && uuidPattern.test(preparation.preparationId));
      const offerKey = `offer:${preparation.preparationId}:${recipientUserId}`;
      const prior = (await deps.journal.entries()).find(e => e.key === offerKey)?.request; check();
      if (prior) {
        // Reconcile a lost offer ACK before retrying a preparation that may since have expired.
        const listed = await call('list', {}); valid(Array.isArray(listed.outgoing));
        const existing = listed.outgoing.map(parseTransferOffer).find(t => t.transferId === prior.transferId);
        if (existing) {
          valid(existing.senderUserId === userId && existing.recipientUserId === recipientUserId
            && existing.sourceTrainingId === source.sourceTrainingId && existing.referenceDigest === prior.referenceDigest);
          return existing;
        }
      }
      let prepared: Record<string, unknown>;
      try { prepared = await call('prepare', { ...preparation, ownerReferenceV1: source.reference }); }
      catch (error) {
        if (error instanceof TransferApiError && error.code === 'TRANSFER_REFERENCE_EXPIRED') {
          // Only a definitive server expiry permits a fresh preparation on a NEW explicit user action.
          await deps.journal.forget(`prepare:${fingerprint}`, preparation);
          if (prior) await deps.journal.forget(offerKey, prior);
        }
        throw error;
      }
      valid(prepared.preparationId === preparation.preparationId && prepared.sourceTrainingId === source.sourceTrainingId
        && typeof prepared.referenceDigest === 'string' && digestPattern.test(prepared.referenceDigest)
        && typeof prepared.expiresAtMs === 'number' && Number.isSafeInteger(prepared.expiresAtMs));
      assertSameTrackTransferReference(source.reference, prepared.reference);
      const fresh = await readTrackTransferSource(deps.local, userId, localId); check();
      valid(fresh.sourceTrainingId === source.sourceTrainingId && fresh.sourceDogId === source.sourceDogId);
      assertSameTrackTransferReference(source.reference, fresh.reference);
      const body = await deps.journal.reserve(offerKey, () => ({ transferId: deps.uuid(),
        preparationId: preparation.preparationId, referenceDigest: prepared.referenceDigest as string, recipientUserId })); check();
      valid(body.preparationId === preparation.preparationId && body.referenceDigest === prepared.referenceDigest && body.recipientUserId === recipientUserId);
      const data = await call('offer', body), transfer = parseTransferOffer(data.transfer);
      valid(transfer.transferId === body.transferId && transfer.senderUserId === userId && transfer.recipientUserId === recipientUserId
        && transfer.sourceTrainingId === source.sourceTrainingId && transfer.referenceDigest === prepared.referenceDigest);
      return transfer;
    }); },
    accept(offer: TransferOffer, reference: TrackTransferReference, dogId: string) { return mutation(async () => {
      valid(offer.recipientUserId === userId && uuidPattern.test(dogId)); requireSearchableReference(reference);
      const body = await deps.journal.reserve(`accept:${offer.transferId}`, () => ({ transferId: offer.transferId, receiptId: deps.uuid(),
        recipientDogId: dogId, ownSessionId: deps.uuid(), ownRunId: deps.uuid() })); check();
      // An ambiguous prior acceptance cannot silently be rebound to another dog.
      if (body.recipientDogId !== dogId) throw new TransferApiError('TRANSFER_CONFLICT');
      valid(body.transferId === offer.transferId && ['receiptId', 'ownSessionId', 'ownRunId'].every(k => uuidPattern.test(body[k])));
      const data = await call('accept', body);
      return importResponse(data, { transferId: offer.transferId, receiptId: body.receiptId, recipientDogId: dogId,
        ownSessionId: body.ownSessionId, ownRunId: body.ownRunId, referenceDigest: offer.referenceDigest }, reference);
    }); },
    recover(offer: TransferOffer) { return mutation(async () => {
      valid(offer.recipientUserId === userId && offer.status === 'accepted');
      // A previously committed own copy is usable offline, including after server payload retention ends.
      const stored = await deps.local.snapshot(db => db.getFirstAsync<{ local_id: string; user_id: string; dog_id: string; payload_json: string }>(
        `select local_id,user_id,dog_id,payload_json from local_training_sessions where user_id=? and deleted_at is null
         and json_extract(case when json_valid(payload_json) then payload_json else '{}' end, '$.trackTransferReceipt.transferId')=? limit 1`,
        userId, offer.transferId)); check();
      if (stored) {
        const saved = parseTransferReceipt(JSON.parse(stored.payload_json).trackTransferReceipt);
        valid(saved.transferId === offer.transferId && saved.recipientUserId === userId && stored.user_id === userId
          && saved.recipientDogId === stored.dog_id && saved.ownSessionId === stored.local_id && saved.referenceDigest === offer.referenceDigest);
        return { sessionId: saved.ownSessionId, runId: saved.ownRunId, dogId: saved.recipientDogId, created: false };
      }
      const records = await deps.journal.entries(); check();
      const request = records.find(e => e.key === `accept:${offer.transferId}`)?.request;
      const data = request ? await call('restore', { receiptId: request.receiptId }) : await call('read', { transferId: offer.transferId });
      const receipt = parseTransferReceipt(data.receipt), reference = parseOwnCopy(data.ownCopy, receipt).reference;
      requireSearchableReference(reference);
      return importResponse(data, { transferId: offer.transferId, recipientDogId: receipt.recipientDogId,
        receiptId: request?.receiptId, ownSessionId: request?.ownSessionId, ownRunId: request?.ownRunId,
        referenceDigest: offer.referenceDigest }, reference);
    }); },
    revoke(transferId: string) { return mutation(async () => {
      const data = await call('revoke', { transferId }); valid(data.transferId === transferId && data.revoked === true && typeof data.accepted === 'boolean');
      return { accepted: data.accepted };
    }); },
  };
}
export const transferCrypto = { uuid: () => Crypto.randomUUID(), hash: (value: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value) };
