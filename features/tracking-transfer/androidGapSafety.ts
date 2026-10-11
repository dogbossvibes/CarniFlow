/** Android104 transfer-only compatibility gate. No recording data is changed. */
import type { SketchPoint } from '@/features/tracking/utils/trackSketchGeometry';
const obj = (v: unknown): Record<string, unknown> => {
  if (typeof v === 'string') { try { return obj(JSON.parse(v)); } catch { return {}; } }
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
};
const rows = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
export function transferGapPoints(value: unknown): SketchPoint[] {
  const v = obj(value), session = obj(v.session), payload = obj(v.track_data ?? v.payload_json ?? session.payload_json);
  const stamps = rows(obj(payload.layContinuity).breakBeforeTimestamps).map(t => typeof t === 'number' ? t : Date.parse(String(t)));
  return rows(v.trackPoints ?? v.points ?? v.layPoints)
    .filter(raw => (obj(raw).point_type ?? obj(raw).pointType ?? 'lay') === 'lay').map(raw => {
    const p = obj(raw), extra = obj(p.payload_json);
    const time = typeof p.t === 'number' ? p.t : Date.parse(String(p.timestamp));
    return { lat: Number(p.lat ?? p.latitude), lng: Number(p.lng ?? p.longitude),
      ...(p.breakBefore === true || extra.breakBefore === true || stamps.includes(time) ? { breakBefore: true } : {}) };
  });
}
export function hasTransferredGaps(value: unknown): boolean {
  const v = obj(value), payload = obj(v.track_data ?? v.payload_json ?? obj(v.session).payload_json);
  if (!(v.transferReceipt ?? payload.trackTransferReceipt)) return false;
  const run = obj(payload.run);
  return transferGapPoints(value).some(p => p.breakBefore)
    || rows(obj(payload.layContinuity).breakBeforeTimestamps).length > 0
    || [v.searchPoints, v.searchTrackPoints, v.runPoints, run.run_points, run.replay_points,
      rows(v.points ?? v.layPoints).filter(p => (obj(p).point_type ?? obj(p).pointType) === 'search'),
      ...rows(v.runs).flatMap(r => [obj(r).run_points, obj(r).replay_points])]
      .some(ps => rows(ps).some(p => obj(p).breakBefore === true || obj(obj(p).payload_json).breakBefore === true));
}
export class UnsupportedTransferGapsError extends Error {
  readonly code = 'TRANSFER_GAPS_UNSUPPORTED';
  constructor() { super('TRANSFER_GAPS_UNSUPPORTED'); }
}
export function assertSupportedTransfer(value: unknown): void {
  if (hasTransferredGaps(value)) throw new UnsupportedTransferGapsError();
}

export function transferRecipientId(value: unknown): string | null {
  const v = obj(value), payload = obj(v.track_data ?? v.payload_json ?? obj(v.session).payload_json);
  const id = obj(v.transferReceipt ?? payload.trackTransferReceipt).recipientUserId;
  return typeof id === 'string' ? id : null;
}
