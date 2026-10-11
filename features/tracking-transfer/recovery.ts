import type { LocalSessionSnapshot } from '@/features/tracking/store/trackRecovery';
import type { PendingTrack } from '@/features/tracking/store/trackPersist';
import { parseTransferReceipt, TransferImportError, type TrackTransferReceipt } from './importPlan';
import { projectTrackTransferSource } from './source';

/** Exact reference restoration for transfers. Legacy local marker IDs are never substituted. */
export function transferredPending(snap: LocalSessionSnapshot, userId: string | null | undefined, dogId: string, now: number): PendingTrack {
  const payload = JSON.parse(snap.session.payload_json ?? '{}') as Record<string, unknown>;
  const receipt = parseTransferReceipt(payload.trackTransferReceipt);
  transferRunId(receipt, userId, snap.session.local_id, dogId);
  if (snap.session.user_id !== userId || snap.searchPointCount || payload.run || payload.trackLifecycleStatus) {
    throw new TransferImportError('IMPORT_CONFLICT');
  }
  const { trackTransferReceipt: _receipt, ...referencePayload } = payload;
  void _receipt;
  const reference = projectTrackTransferSource({ ...snap.session, payload_json: JSON.stringify(referencePayload) }, snap.layPoints, snap.markers);
  // The current search engine needs these measured values; absent evidence must not become zero.
  if (reference.distanceM === null || reference.durationSeconds === null || reference.markers.some(m => m.distanceFromStartM === null)) {
    throw new TransferImportError('IMPORT_CONFLICT');
  }
  return {
    sessionId: receipt.ownSessionId, dogId, transferReceipt: receipt,
    trackPoints: reference.points.map(p => ({ ...p, measuredDistanceM: p.measuredDistanceM ?? undefined })),
    markers: reference.markers.map(m => ({ id: m.id, type: m.type, material: m.material, angleKind: m.angleKind,
      lat: m.lat, lng: m.lng, accuracy: m.accuracy, distance_from_start: m.distanceFromStartM!, t: m.t,
      note: null, audio_url: null, found: false })),
    segments: reference.segments.map(s => ({ ...s, dogId, trackSessionId: receipt.ownSessionId })),
    runPoints: [], searchPoints: [], distanceMeters: reference.distanceM, durationSeconds: reference.durationSeconds,
    layFinishedAt: reference.finishedAtMs, startAnchor: null, savedAt: now, runId: receipt.ownRunId,
    status: 'resting', paused: false, searchStartedAt: null, searchUpdatedAt: null,
    layStartedAt: reference.finishedAtMs, layUpdatedAt: reference.finishedAtMs,
  };
}

/** Ordinary tracks keep their existing UUID generation. Transfers always use their bound own run. */
export function transferRunId(value: TrackTransferReceipt | null | undefined, userId: string | null | undefined,
  sessionId: string | null, dogId: string | null | undefined): string | null {
  if (value == null) return null;
  const receipt = parseTransferReceipt(value);
  if (!userId || receipt.recipientUserId !== userId || receipt.recipientDogId !== dogId || receipt.ownSessionId !== sessionId) {
    throw new TransferImportError('ACCOUNT_CHANGED');
  }
  return receipt.ownRunId;
}
