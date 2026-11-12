import { attachSpecialGeometry, isSpecialAngle, readSpecialGeometry, specialAngleKey } from '@/features/tracking/utils/specialAngleGeometry';
import type { LocalTrainingSession, LocalTrackPoint, LocalTrackMarker } from '@/features/sync/types/sync';
import { parseTrackTransferReference, TransferReferenceError, TRANSFER_LIMITS } from './reference';

type RecordValue = Record<string, unknown>;
export interface SourceReader {
  getFirstAsync<T>(sql: string, ...params: (string | number)[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: (string | number)[]): Promise<T[]>;
}
export interface SourceDependencies {
  currentScope(): { userId: string | null; epoch: number };
  sourceIsRecording(sessionLocalId: string): boolean;
  /** All callback queries MUST use the same isolated SQLite transaction connection. */
  snapshot<T>(read: (db: SourceReader) => Promise<T>): Promise<T>;
}
export class TransferSourceError extends Error {
  constructor(readonly code: 'ACCOUNT_CHANGED' | 'SOURCE_UNAVAILABLE' | 'SOURCE_ACTIVE' | 'SOURCE_NOT_SYNCED' | 'DIRECTION_TRANSFER_UNAVAILABLE') {
    super(code); this.name = 'TransferSourceError';
  }
}
function obj(v: unknown): RecordValue {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new TransferReferenceError('SOURCE_INCOMPLETE');
  return v as RecordValue;
}
function json(v: string | null): RecordValue {
  if (v === null) return {};
  try { return obj(JSON.parse(v)); } catch { throw new TransferReferenceError('SOURCE_INCOMPLETE'); }
}
function timestamp(v: unknown): number {
  if (typeof v !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(v)) {
    throw new TransferReferenceError('SOURCE_INCOMPLETE');
  }
  const t = Date.parse(v);
  if (!Number.isSafeInteger(t)) throw new TransferReferenceError('SOURCE_INCOMPLETE');
  return t;
}
function projectSegment(v: unknown, dogId: string, sessionId: string) {
  const s = obj(v);
  if (s.dogId !== dogId || (s.trackSessionId !== null && s.trackSessionId !== sessionId)) {
    throw new TransferReferenceError('SOURCE_INCOMPLETE');
  }
  return { id: s.id, type: s.type, customLabel: s.customLabel === '' ? null : s.customLabel ?? null,
    plannedLengthSteps: s.plannedLengthSteps, startStep: s.startStep, endStep: s.endStep,
    startCoordinate: s.startCoordinate, endCoordinate: s.endCoordinate, startedAt: s.startedAt, completedAt: s.completedAt,
    status: s.status, voiceEnabled: s.voiceEnabled, createdAt: s.createdAt, updatedAt: s.updatedAt,
    colorToken: s.colorToken ?? null, startTrackPointIndex: s.startTrackPointIndex ?? null, endTrackPointIndex: s.endTrackPointIndex ?? null };
}

/** Only the completed laid reference is projected; never send this local SQL snapshot itself. */
export function projectTrackTransferSource(session: LocalTrainingSession, points: LocalTrackPoint[], markers: LocalTrackMarker[]) {
  const payload = json(session.payload_json);
  if (session.type !== 'track' || session.status !== 'completed' || session.deleted_at || !session.dog_id
    || payload.trackLifecycleStatus || payload.trackTransferReceipt) throw new TransferSourceError('SOURCE_UNAVAILABLE');
  const start = timestamp(session.started_at), end = timestamp(session.ended_at);
  const projectedPoints = points.map(p => {
    if (p.session_local_id !== session.local_id || p.point_type !== 'lay') throw new TransferReferenceError('SOURCE_INCOMPLETE');
    const extra = json(p.payload_json);
    return { lat: p.latitude, lng: p.longitude, t: timestamp(p.timestamp), accuracy: p.accuracy, altitude: p.altitude,
      speed: p.speed, heading: p.heading, breakBefore: extra.breakBefore ?? false, measuredDistanceM: extra.measuredDistanceM ?? null };
  });
  if (payload.layContinuity !== undefined) {
    const continuity = obj(payload.layContinuity);
    if (continuity.version !== 1 || !Array.isArray(continuity.breakBeforeTimestamps)
      || continuity.breakBeforeTimestamps.length > projectedPoints.length) throw new TransferReferenceError('SOURCE_INCOMPLETE');
    const byTime = new Map<number, typeof projectedPoints[number] | null>();
    for (const p of projectedPoints) byTime.set(p.t, byTime.has(p.t) ? null : p);
    for (const raw of continuity.breakBeforeTimestamps) {
      const match = byTime.get(timestamp(raw));
      // A timestamp referring to two fixes cannot locate a unique boundary honestly.
      if (!match) throw new TransferReferenceError('SOURCE_INCOMPLETE');
      match.breakBefore = true;
    }
  }
  const projectedMarkers = markers.map(m => {
    if (m.session_local_id !== session.local_id) throw new TransferReferenceError('SOURCE_INCOMPLETE');
    const original = json(m.payload_json);
    if (typeof original.sourceMarkerId !== 'string' || !Number.isSafeInteger(original.recordedAtMs)
      || timestamp(m.created_at) !== original.recordedAtMs) throw new TransferReferenceError('SOURCE_INCOMPLETE');
    return { id: original.sourceMarkerId, type: m.marker_type, material: m.material, angleKind: m.angle_kind,
      lat: m.latitude, lng: m.longitude, accuracy: m.accuracy, distanceFromStartM: m.distance_from_start, t: original.recordedAtMs };
  });
  const sourceGeometry = Array.isArray(payload.manualAngleGeometry) ? payload.manualAngleGeometry : null;
  const annotated = attachSpecialGeometry(projectedMarkers.map((m, i) => ({ ...m, ...readSpecialGeometry(json(markers[i].payload_json)), distance_from_start: m.distanceFromStartM })), sourceGeometry);
  // V1 cannot express an Abriss direction. Never silently discard that information.
  if (annotated.some(m => m.angleKind === 'abriss' && (m.geometryDirection === 'links' || m.geometryDirection === 'rechts'))) throw new TransferSourceError('DIRECTION_TRANSFER_UNAVAILABLE');
  const manual = annotated.filter(m => isSpecialAngle(m.angleKind) && m.angleKind !== 'abriss');
  const transferGeometry = sourceGeometry ? { truncated: manual.length > 100, markers: manual.slice(0, 100).map((m, i) => {
    const keyed = sourceGeometry.filter(e => e && typeof e === 'object' && e.markerKey === specialAngleKey(m));
    const legacy = sourceGeometry[i];
    const entry = keyed.length === 1 ? keyed[0] : sourceGeometry.every(e => e && typeof e === 'object' && !('markerKey' in e)) && legacy?.manualMarkerType === m.angleKind ? legacy : null;
    return { manualMarkerType: m.angleKind, geometryDirection: m.geometryDirection ?? 'unresolved', geometrySharpness: m.geometrySharpness ?? 'unresolved',
      geometryQuality: entry?.geometryQuality ?? null, confidence: entry?.confidence ?? null, motionDirection: entry?.motionDirection ?? null,
      directionAgrees: entry?.directionAgrees ?? null, classificationSource: entry?.classificationSource ?? null };
  }) } : payload.manualAngleGeometry ?? null;
  const segments = payload.segments ?? [];
  if (!Array.isArray(segments)) throw new TransferReferenceError('SOURCE_INCOMPLETE');
  return parseTrackTransferReference({ version: 1, startedAtMs: start, finishedAtMs: end,
    distanceM: payload.distanceMeters ?? null, durationSeconds: session.duration_seconds,
    points: projectedPoints, markers: projectedMarkers,
    segments: segments.map(s => projectSegment(s, session.dog_id!, session.local_id)),
    manualAngleGeometry: transferGeometry });
}

/** No network, mutations, legacy repair or inferred marker timestamps. Caller revalidates server ownership. */
export async function readTrackTransferSource(deps: SourceDependencies, userId: string, localId: string) {
  const scope = deps.currentScope();
  const check = () => {
    const now = deps.currentScope();
    if (!userId || scope.userId !== userId || now.userId !== userId || now.epoch !== scope.epoch) throw new TransferSourceError('ACCOUNT_CHANGED');
    if (deps.sourceIsRecording(localId)) throw new TransferSourceError('SOURCE_ACTIVE');
  };
  check();
  const result = await deps.snapshot(async db => {
    check();
    const session = await db.getFirstAsync<LocalTrainingSession>(
      'select * from local_training_sessions where local_id=? and user_id=? and deleted_at is null', localId, userId);
    check();
    if (!session || session.user_id !== userId || session.local_id !== localId) throw new TransferSourceError('SOURCE_UNAVAILABLE');
    // Only a known uploaded parent can be authorised by the server. Local changes are still compared as owner reference.
    if (!session.remote_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.remote_id)) {
      throw new TransferSourceError('SOURCE_NOT_SYNCED');
    }
    const points = await db.getAllAsync<LocalTrackPoint>(
      "select * from local_track_points where session_local_id=? and point_type='lay' order by timestamp asc, rowid asc limit ?",
      localId, TRANSFER_LIMITS.points + 1);
    check();
    const markers = await db.getAllAsync<LocalTrackMarker>(
      'select * from local_track_markers where session_local_id=? order by created_at asc, rowid asc limit ?', localId, TRANSFER_LIMITS.markers + 1);
    check();
    if (points.length > TRANSFER_LIMITS.points || markers.length > TRANSFER_LIMITS.markers) throw new TransferReferenceError('REFERENCE_TOO_LARGE');
    return { sourceTrainingId: session.remote_id, sourceLocalId: localId, sourceDogId: session.dog_id,
      sourceUpdatedAt: session.updated_at, reference: projectTrackTransferSource(session, points, markers) };
  });
  check(); return result;
}
