import { attachSpecialGeometry, countLaidCorners, readSpecialGeometry, specialAngleKey } from '@/features/tracking/utils/specialAngleGeometry';
import { parseTrackTransferReference, type TrackTransferReference } from './reference';

export interface TrackTransferReceipt {
  version: 1;
  transferId: string;
  receiptId: string;
  recipientUserId: string;
  recipientDogId: string;
  ownSessionId: string;
  ownRunId: string;
  referenceDigest: string;
  acceptedAtMs: number;
}
export class TransferImportError extends Error {
  constructor(readonly code: 'RECEIPT_INVALID' | 'IMPORT_CONFLICT' | 'ACCOUNT_CHANGED') { super(code); this.name = 'TransferImportError'; }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseTransferReceipt(v: unknown): TrackTransferReceipt {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new TransferImportError('RECEIPT_INVALID');
  const o = v as Record<string, unknown>;
  const ids = ['transferId', 'receiptId', 'recipientUserId', 'recipientDogId', 'ownSessionId', 'ownRunId'] as const;
  if (Object.keys(o).length !== 9 || o.version !== 1 || ids.some(k => typeof o[k] !== 'string' || !UUID.test(o[k] as string))
    || typeof o.referenceDigest !== 'string' || !/^[0-9a-f]{64}$/.test(o.referenceDigest)
    || typeof o.acceptedAtMs !== 'number' || !Number.isSafeInteger(o.acceptedAtMs) || o.acceptedAtMs <= 0
    || o.acceptedAtMs > 8_640_000_000_000_000 || o.ownSessionId === o.ownRunId) throw new TransferImportError('RECEIPT_INVALID');
  return { version: 1, transferId: o.transferId as string, receiptId: o.receiptId as string,
    recipientUserId: o.recipientUserId as string, recipientDogId: o.recipientDogId as string,
    ownSessionId: o.ownSessionId as string, ownRunId: o.ownRunId as string,
    referenceDigest: o.referenceDigest, acceptedAtMs: o.acceptedAtMs };
}
type SQLValue = string | number | null;
export interface ImportStatement { sql: string; params: SQLValue[] }
function insert(table: string, row: Record<string, SQLValue>): ImportStatement {
  const keys = Object.keys(row);
  return { sql: `insert into ${table} (${keys.join(',')}) values (${keys.map(() => '?').join(',')})`, params: keys.map(k => row[k]) };
}
export function transferReceiptMatches(stored: unknown, expected: TrackTransferReceipt): boolean {
  try { return JSON.stringify(parseTransferReceipt(stored)) === JSON.stringify(parseTransferReceipt(expected)); }
  catch { return false; }
}

/** Pure plan. Execute every statement inside ONE exclusive transaction, never with OR REPLACE/IGNORE. */
export function createTrackTransferImportPlan(receiptValue: unknown, referenceValue: unknown) {
  const receipt = parseTransferReceipt(receiptValue), reference = parseTrackTransferReference(referenceValue);
  const createdAt = new Date(receipt.acceptedAtMs).toISOString();
  const segments = reference.segments.map(s => ({ ...s, dogId: receipt.recipientDogId, trackSessionId: receipt.ownSessionId }));
  const annotated = attachSpecialGeometry(reference.markers.map(marker => ({ ...marker, distance_from_start: marker.distanceFromStartM })), reference.manualAngleGeometry?.markers);
  const manualMarkers = annotated.filter(marker => ['bw', 'ow', 'gw'].includes(marker.angleKind ?? ''));
  // Legacy nullable coordinates cannot form stable keys. Keep their validated ordinal contract intact.
  const geometryKeys = manualMarkers.map(specialAngleKey);
  const canKeyGeometry = geometryKeys.every(key => key !== null) && new Set(geometryKeys).size === geometryKeys.length;
  const geometry = reference.manualAngleGeometry?.markers.map((entry, index) => ({
    ...entry, ...(canKeyGeometry ? { markerKey: specialAngleKey(manualMarkers[index]) } : {}),
  }));
  const payload = {
    distanceMeters: reference.distanceM,
    articlesTotal: reference.markers.filter(m => m.type === 'gegenstand').length,
    cornersTotal: countLaidCorners(annotated),
    segments,
    layContinuity: { version: 1, breakBeforeTimestamps: reference.points.filter(p => p.breakBefore).map(p => new Date(p.t).toISOString()) },
    ...(geometry ? { manualAngleGeometry: geometry } : {}),
    trackTransferReceipt: receipt,
  };
  const parent = insert('local_training_sessions', {
    local_id: receipt.ownSessionId, remote_id: null, user_id: receipt.recipientUserId, dog_id: receipt.recipientDogId,
    category: 'IGP', type: 'track', status: 'completed', title: null, notes: null, score: null, visibility: 'private',
    started_at: new Date(reference.startedAtMs).toISOString(), ended_at: new Date(reference.finishedAtMs).toISOString(),
    duration_seconds: reference.durationSeconds, location_name: null, latitude: reference.points[0].lat, longitude: reference.points[0].lng,
    temperature: null, weather_condition: null, wind_speed: null, humidity: null, surface_types: null, terrain_conditions: null,
    created_at: createdAt, updated_at: createdAt, deleted_at: null, sync_status: 'pending', sync_attempts: 0,
    last_sync_error: null, last_synced_at: null, dirty_fields: null, payload_json: JSON.stringify(payload),
  });
  const points = reference.points.map((p, i) => insert('local_track_points', {
    local_id: `transfer:${receipt.receiptId}:point:${i}`, remote_id: null, session_local_id: receipt.ownSessionId, session_remote_id: null,
    latitude: p.lat, longitude: p.lng, accuracy: p.accuracy, altitude: p.altitude, speed: p.speed, heading: p.heading,
    timestamp: new Date(p.t).toISOString(), point_type: 'lay', created_at: createdAt, sync_status: 'pending',
    payload_json: JSON.stringify({ ...(p.breakBefore ? { breakBefore: true } : {}),
      ...(p.measuredDistanceM !== null ? { measuredDistanceM: p.measuredDistanceM } : {}) }),
  }));
  const markers = reference.markers.map((m, i) => insert('local_track_markers', {
    local_id: `transfer:${receipt.receiptId}:marker:${i}`, remote_id: null, session_local_id: receipt.ownSessionId, session_remote_id: null,
    marker_type: m.type, material: m.material, angle_kind: m.angleKind, latitude: m.lat, longitude: m.lng,
    accuracy: m.accuracy, distance_from_start: m.distanceFromStartM, note: null, audio_local_uri: null, audio_remote_url: null,
    created_at: new Date(m.t).toISOString(), sync_status: 'pending', payload_json: JSON.stringify({ sourceMarkerId: m.id, recordedAtMs: m.t, ...readSpecialGeometry(annotated[i]) }),
  }));
  const queue = insert('sync_queue', { id: `transfer:${receipt.receiptId}:sync`, entity_type: 'training_session',
    entity_local_id: receipt.ownSessionId, operation: 'create', priority: 5, payload_json: null,
    created_at: createdAt, updated_at: createdAt, attempts: 0, last_error: null, status: 'pending' });
  return { receipt, reference, statements: [parent, ...points, ...markers, queue] };
}

export interface ImportTransaction {
  getFirstAsync<T>(sql: string, ...params: SQLValue[]): Promise<T | null>;
  runAsync(sql: string, ...params: SQLValue[]): Promise<unknown>;
}
export interface ImportDependencies {
  currentScope(): { userId: string | null; epoch: number };
  exclusive<T>(write: (db: ImportTransaction) => Promise<T>): Promise<T>;
}
/** Caller MUST obtain a current authorised receipt and quota acknowledgement from the server first. */
export async function importTrackTransfer(deps: ImportDependencies, expectedUserId: string, receiptValue: unknown, reference: TrackTransferReference) {
  const plan = createTrackTransferImportPlan(receiptValue, reference), scope = deps.currentScope();
  const check = () => {
    const current = deps.currentScope();
    if (!expectedUserId || plan.receipt.recipientUserId !== expectedUserId || scope.userId !== expectedUserId
      || current.userId !== expectedUserId || current.epoch !== scope.epoch) throw new TransferImportError('ACCOUNT_CHANGED');
  };
  check();
  const result = await deps.exclusive(async db => {
    check();
    const stored = await db.getFirstAsync<{ user_id: string; dog_id: string; deleted_at: string | null; payload_json: string | null }>(
      'select user_id,dog_id,deleted_at,payload_json from local_training_sessions where local_id=?', plan.receipt.ownSessionId);
    check();
    if (stored) {
      let payload: Record<string, unknown> = {};
      try { payload = JSON.parse(stored.payload_json ?? '{}'); } catch { /* reject without repairing */ }
      if (!payload || stored.user_id !== expectedUserId || stored.dog_id !== plan.receipt.recipientDogId || stored.deleted_at
        || !transferReceiptMatches(payload.trackTransferReceipt, plan.receipt)) throw new TransferImportError('IMPORT_CONFLICT');
      // An already searched or edited own session is retained. Never overwrite it with the original import.
      return { sessionId: plan.receipt.ownSessionId, runId: plan.receipt.ownRunId, created: false };
    }
    for (const statement of plan.statements) { check(); await db.runAsync(statement.sql, ...statement.params); }
    check();
    return { sessionId: plan.receipt.ownSessionId, runId: plan.receipt.ownRunId, created: true };
  });
  check(); return result;
}
