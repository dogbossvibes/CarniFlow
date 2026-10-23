import type { LiveShareTransport } from './liveShareController';
import type { ShareGrant } from './liveShareLease';

/** Implemented by the authenticated, timeout-bounded RPC adapter. Its auth epoch
 * must reject a response crossing logout/account change, including A→B→A.
 */
export type GroupRpc = (expectedUserId: string, endpoint: 'training_group_live_v1', action: string,
  request: Record<string, unknown>, signal?: AbortSignal) => Promise<Record<string, unknown>>;
function finiteNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function envelope(data: Record<string, unknown>): void {
  if (data.version !== 1 || !finiteNumber(data.serverNowMs)) throw new Error('GROUP_INVALID_RESPONSE');
}

/** Wire contract reviewed with05; endpoints must be deployed/verified before UI activation. */
export function createLiveShareTransport(rpc: GroupRpc, clock: () => number): LiveShareTransport {
  const anchors = new Map<string, { userId: string; sessionId: string; receivedAt: number; serverNow: number }>();
  const revoked = new Set<string>();
  return {
    async start(input, signal) {
      if (revoked.has(input.shareId)) throw new Error('GROUP_REVOKED');
      const data = await rpc(input.userId, 'training_group_live_v1', 'start', {
        sessionId: input.sessionId, shareId: input.shareId, dogId: input.dogId,
        recipientUserIds: [...input.recipientIds], ttlSeconds: input.durationMs / 1000,
      }, signal);
      envelope(data);
      if (signal.aborted || revoked.has(input.shareId)) throw new Error('GROUP_REVOKED');
      if (data.shareId !== input.shareId || data.userId !== input.userId || data.sessionId !== input.sessionId
        || data.dogId !== input.dogId || !finiteNumber(data.expiresAtMs)
        || !Array.isArray(data.recipientUserIds) || data.recipientUserIds.length !== input.recipientIds.length
        || new Set(data.recipientUserIds).size !== input.recipientIds.length
        || data.recipientUserIds.some(id => typeof id !== 'string' || !input.recipientIds.includes(id))) {
        throw new Error('GROUP_INVALID_RESPONSE');
      }
      const receivedAt = clock();
      if (!Number.isFinite(receivedAt)) throw new Error('GROUP_INVALID_CLOCK');
      anchors.set(input.shareId, { userId: input.userId, sessionId: input.sessionId,
        receivedAt, serverNow: data.serverNowMs as number });
      return { shareId: input.shareId, userId: input.userId, sessionId: input.sessionId, dogId: input.dogId,
        serverNowMs: data.serverNowMs, expiresAtMs: data.expiresAtMs } as ShareGrant;
    },
    async publish(userId, update, signal) {
      const anchor = anchors.get(update.shareId);
      if (!anchor || revoked.has(update.shareId) || anchor.userId !== userId || anchor.sessionId !== update.sessionId
        || !finiteNumber(update.observedAtMonotonicMs) || update.observedAtMonotonicMs < anchor.receivedAt
        || update.observedAtMonotonicMs > clock()) throw new Error('GROUP_INVALID_REQUEST');
      const data = await rpc(userId, 'training_group_live_v1', 'publish', {
        sessionId: update.sessionId, shareId: update.shareId, sequence: update.sequence,
        latitude: update.latitude, longitude: update.longitude, accuracyM: update.accuracyM,
        // The wire schema requires integer milliseconds; performance.now() is fractional.
        observedAtServerMs: Math.floor(anchor.serverNow + update.observedAtMonotonicMs - anchor.receivedAt),
      }, signal);
      envelope(data);
      if (data.shareId !== update.shareId || data.sequence !== update.sequence || data.accepted !== true) {
        throw new Error('GROUP_INVALID_RESPONSE');
      }
    },
    async revoke(userId, entry) {
      // Invalidate the anchor before awaiting the server. Late start cannot restore it.
      revoked.add(entry.shareId); anchors.delete(entry.shareId);
      const data = await rpc(userId, 'training_group_live_v1', 'revoke', { ...entry });
      envelope(data);
      if (data.shareId !== entry.shareId || data.revoked !== true) throw new Error('GROUP_INVALID_RESPONSE');
    },
  };
}
