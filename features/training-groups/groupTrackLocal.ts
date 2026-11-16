import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocalDb } from '@/lib/localDb/client';
import type { LocalTrainingSession, LocalTrackMarker, LocalTrackPoint } from '@/features/sync/types/sync';
import { isScoredObject } from '@/features/tracking/utils/objectMarkers';
import { attachSpecialGeometry, countLaidCorners, readSpecialGeometry, specialAngleKey } from '@/features/tracking/utils/specialAngleGeometry';
import { clearPending, peekPending } from '@/features/tracking/store/trackPersist';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import { projectTrackTransferSource } from '@/features/tracking-transfer/source';
import { parseTrackTransferReference, TRANSFER_LIMITS, type TrackTransferReference } from '@/features/tracking-transfer/reference';
import { GroupApiError } from '@/features/tracking-exchange/groups/groupRpc';
import type { GroupTrack, GroupTrackService } from '@/features/tracking-exchange/groups/trackService';

// Stufe 2b Gruppentraining: lokale Seite der Fährtenübergabe.
// Leger:in: die mit dem gewohnten Recorder gelegte Fährte wird als Paket (Format der
// Fährten-Übergabe) an den Server geschickt. Ohne Netz bleibt sie in einer kleinen
// Warteschlange und wird beim nächsten Öffnen des Gruppentrainings nachgereicht.
// Hundeführer:in: das Paket wird als eigene, normale Fährte ihres Hundes angelegt
// (keine Übergabe-Quittung, «bei ihr ist es eine normale Fährte von ihr»). Die
// Absuche läuft danach über den bestehenden Wiederaufnahme-Weg (applyTrackRecovery).

export { GROUP_TRACK_KEY, readGroupTrackMarker, isBlindSearch, type GroupTrackMarker } from './blindSearch';
import { GROUP_TRACK_KEY, readGroupTrackMarker, type GroupTrackMarker } from './blindSearch';

// ── Leger:in ────────────────────────────────────────────────────────────────

/** Liest die eigene, fertig gelegte Fährte lokal (ohne Netz, ohne Sync-Voraussetzung). */
export async function readLaidReference(userId: string, localId: string): Promise<{ reference: TrackTransferReference; dogId: string }> {
  const db = await getLocalDb();
  const session = await db.getFirstAsync<LocalTrainingSession>(
    'select * from local_training_sessions where local_id=? and user_id=? and deleted_at is null', localId, userId);
  if (!session || !session.dog_id) throw new GroupApiError('GROUP_UNAVAILABLE');
  const points = await db.getAllAsync<LocalTrackPoint>(
    "select * from local_track_points where session_local_id=? and point_type='lay' order by timestamp asc, rowid asc limit ?",
    localId, TRANSFER_LIMITS.points + 1);
  const markers = await db.getAllAsync<LocalTrackMarker>(
    'select * from local_track_markers where session_local_id=? order by created_at asc, rowid asc limit ?', localId, TRANSFER_LIMITS.markers + 1);
  if (points.length > TRANSFER_LIMITS.points || markers.length > TRANSFER_LIMITS.markers) throw new GroupApiError('GROUP_LIMIT');
  return { reference: projectTrackTransferSource(session, points, markers), dogId: session.dog_id };
}

export interface PendingHandover { trackId: string; localId: string; groupId: string; sessionId: string; createdAtMs: number;
  /** Issue #146: Fährte berührt die Heimzone der Leger:in; vor der Übergabe als «nie teilbar» markieren. */
  homeZone?: boolean }
/** Markiert die Fährte auf dem Server als nie teilbar (evaluations.block). */
export type BlockEvaluation = (trackId: string) => Promise<unknown>;
const handoverKey = (userId: string) => `anyvo_group_track_handover_v1:${userId}`;

export async function listPendingHandovers(userId: string): Promise<PendingHandover[]> {
  try {
    const value = JSON.parse((await AsyncStorage.getItem(handoverKey(userId))) ?? '[]');
    return Array.isArray(value) ? value.filter(v => v && typeof v.trackId === 'string' && typeof v.localId === 'string') : [];
  } catch { return []; }
}
async function writePendingHandovers(userId: string, list: PendingHandover[]) {
  await AsyncStorage.setItem(handoverKey(userId), JSON.stringify(list.slice(-20)));
}
export async function addPendingHandover(userId: string, entry: PendingHandover) {
  const list = (await listPendingHandovers(userId)).filter(e => e.trackId !== entry.trackId);
  await writePendingHandovers(userId, [...list, entry]);
}
async function removePendingHandover(userId: string, trackId: string) {
  await writePendingHandovers(userId, (await listPendingHandovers(userId)).filter(e => e.trackId !== trackId));
}

/** Nach der Übergabe ist die Fährte für den eigenen Hund nicht mehr «offen». Nur wenn sie zu dieser Sitzung gehört. */
async function releaseLayerDog(dogId: string, localId: string) {
  const pending = await peekPending(dogId).catch(() => null);
  if (pending?.sessionId === localId) await clearPending(dogId);
  const registry = useActiveFaehrten.getState();
  if (registry.get(dogId)?.sessionId === localId) registry.remove(dogId);
}

export type HandoverResult = 'sent' | 'queued' | 'dropped';
/** Schickt die gelegte Fährte. Unklarer Ausgang (Netz) → in der Warteschlange lassen. */
export async function submitHandover(service: GroupTrackService, userId: string, entry: PendingHandover, block?: BlockEvaluation): Promise<HandoverResult> {
  await addPendingHandover(userId, entry);
  const { reference, dogId } = await readLaidReference(userId, entry.localId);
  try {
    // Erst markieren, dann übergeben: ohne Markierung verlässt eine Heimzonen-Fährte das Gerät nicht.
    if (entry.homeZone) {
      if (!block) return 'queued';
      await block(entry.trackId);
    }
    await service.submit(entry.trackId, reference);
  } catch (error) {
    if (error instanceof GroupApiError && (error.code === 'GROUP_CONNECTION' || error.code === 'GROUP_INVALID_RESPONSE'
      || error.code === 'GROUP_MAINTENANCE_UNAVAILABLE' || error.code === 'GROUP_ACCOUNT_CHANGED')) return 'queued';
    // Endgültig (abgebrochen, verlassen, ungültig): nicht endlos wiederholen.
    await removePendingHandover(userId, entry.trackId);
    if (error instanceof GroupApiError && (error.code === 'GROUP_REVOKED' || error.code === 'GROUP_UNAVAILABLE')) return 'dropped';
    throw error;
  }
  await removePendingHandover(userId, entry.trackId);
  await releaseLayerDog(dogId, entry.localId);
  return 'sent';
}

export async function flushPendingHandovers(service: GroupTrackService, userId: string, sessionId?: string, block?: BlockEvaluation) {
  for (const entry of await listPendingHandovers(userId)) {
    if (sessionId && entry.sessionId !== sessionId) continue;
    try { await submitHandover(service, userId, entry, block); } catch { /* bleibt sichtbar als «wird gelegt» */ }
  }
}

// ── Hundeführer:in ──────────────────────────────────────────────────────────

export interface ImportedGroupTrack { localId: string; dogId: string; blind: boolean; searched: boolean }

export async function findImportedGroupTrack(userId: string, trackId: string): Promise<ImportedGroupTrack | null> {
  const db = await getLocalDb();
  const row = await db.getFirstAsync<{ local_id: string; dog_id: string; payload_json: string | null }>(
    `select local_id,dog_id,payload_json from local_training_sessions where user_id=? and deleted_at is null
     and json_extract(case when json_valid(payload_json) then payload_json else '{}' end, '$.${GROUP_TRACK_KEY}.trackId')=? limit 1`, userId, trackId);
  if (!row) return null;
  const marker = readGroupTrackMarker(row.payload_json);
  let searched = false;
  try { searched = !!JSON.parse(row.payload_json ?? '{}')?.run; } catch { searched = false; }
  return { localId: row.local_id, dogId: row.dog_id, blind: marker?.blind ?? false, searched };
}

type SQLValue = string | number | null;
function insert(table: string, row: Record<string, SQLValue>) {
  const keys = Object.keys(row);
  return { sql: `insert into ${table} (${keys.join(',')}) values (${keys.map(() => '?').join(',')})`, params: keys.map(k => row[k]) };
}

/** Wie der Import der Fährten-Übergabe, aber als eigene Fährte ohne Quittung. Rein, testbar. */
export function createGroupTrackImportPlan(input: { userId: string; dogId: string; sessionId: string; trackId: string; blind: boolean; nowMs: number },
  referenceValue: unknown) {
  const reference = parseTrackTransferReference(referenceValue);
  const createdAt = new Date(input.nowMs).toISOString();
  const segments = reference.segments.map(s => ({ ...s, dogId: input.dogId, trackSessionId: input.sessionId }));
  const annotated = attachSpecialGeometry(reference.markers.map(marker => ({ ...marker, distance_from_start: marker.distanceFromStartM })), reference.manualAngleGeometry?.markers);
  const manualMarkers = annotated.filter(marker => ['bw', 'ow', 'gw'].includes(marker.angleKind ?? ''));
  const geometryKeys = manualMarkers.map(specialAngleKey);
  const canKeyGeometry = geometryKeys.every(key => key !== null) && new Set(geometryKeys).size === geometryKeys.length;
  const geometry = reference.manualAngleGeometry?.markers.map((entry, index) => ({
    ...entry, ...(canKeyGeometry ? { markerKey: specialAngleKey(manualMarkers[index]) } : {}),
  }));
  const marker: GroupTrackMarker = { version: 1, trackId: input.trackId, blind: input.blind };
  const payload = {
    distanceMeters: reference.distanceM,
    articlesTotal: reference.markers.filter(isScoredObject).length,
    cornersTotal: countLaidCorners(annotated),
    segments,
    layContinuity: { version: 1, breakBeforeTimestamps: reference.points.filter(p => p.breakBefore).map(p => new Date(p.t).toISOString()) },
    ...(geometry ? { manualAngleGeometry: geometry } : {}),
    [GROUP_TRACK_KEY]: marker,
  };
  const parent = insert('local_training_sessions', {
    local_id: input.sessionId, remote_id: null, user_id: input.userId, dog_id: input.dogId,
    category: 'IGP', type: 'track', status: 'completed', title: null, notes: null, score: null, visibility: 'private',
    started_at: new Date(reference.startedAtMs).toISOString(), ended_at: new Date(reference.finishedAtMs).toISOString(),
    duration_seconds: reference.durationSeconds, location_name: null, latitude: reference.points[0].lat, longitude: reference.points[0].lng,
    temperature: null, weather_condition: null, wind_speed: null, humidity: null, surface_types: null, terrain_conditions: null,
    created_at: createdAt, updated_at: createdAt, deleted_at: null, sync_status: 'pending', sync_attempts: 0,
    last_sync_error: null, last_synced_at: null, dirty_fields: null, payload_json: JSON.stringify(payload),
  });
  const points = reference.points.map((p, i) => insert('local_track_points', {
    local_id: `group:${input.trackId}:point:${i}`, remote_id: null, session_local_id: input.sessionId, session_remote_id: null,
    latitude: p.lat, longitude: p.lng, accuracy: p.accuracy, altitude: p.altitude, speed: p.speed, heading: p.heading,
    timestamp: new Date(p.t).toISOString(), point_type: 'lay', created_at: createdAt, sync_status: 'pending',
    payload_json: JSON.stringify({ ...(p.breakBefore ? { breakBefore: true } : {}),
      ...(p.measuredDistanceM !== null ? { measuredDistanceM: p.measuredDistanceM } : {}) }),
  }));
  const markers = reference.markers.map((m, i) => insert('local_track_markers', {
    local_id: `group:${input.trackId}:marker:${i}`, remote_id: null, session_local_id: input.sessionId, session_remote_id: null,
    marker_type: m.type, material: m.material, angle_kind: m.angleKind, latitude: m.lat, longitude: m.lng,
    accuracy: m.accuracy, distance_from_start: m.distanceFromStartM, note: null, audio_local_uri: null, audio_remote_url: null,
    created_at: new Date(m.t).toISOString(), sync_status: 'pending', payload_json: JSON.stringify({ sourceMarkerId: m.id, recordedAtMs: m.t, ...readSpecialGeometry(annotated[i]) }),
  }));
  const queue = insert('sync_queue', { id: `group:${input.trackId}:sync`, entity_type: 'training_session',
    entity_local_id: input.sessionId, operation: 'create', priority: 5, payload_json: null,
    created_at: createdAt, updated_at: createdAt, attempts: 0, last_error: null, status: 'pending' });
  return { statements: [parent, ...points, ...markers, queue] };
}

/** Legt die Fährte einmalig für den eigenen Hund an. Bestehende (auch schon abgesuchte) Kopie bleibt unverändert. */
export async function importGroupTrack(userId: string, track: GroupTrack, reference: TrackTransferReference): Promise<ImportedGroupTrack> {
  if (track.handlerUserId !== userId) throw new GroupApiError('GROUP_UNAVAILABLE');
  const existing = await findImportedGroupTrack(userId, track.trackId);
  if (existing) return existing;
  const sessionId = Crypto.randomUUID();
  const plan = createGroupTrackImportPlan({ userId, dogId: track.dogId, sessionId, trackId: track.trackId, blind: track.blind, nowMs: Date.now() }, reference);
  const db = await getLocalDb();
  let result: ImportedGroupTrack | null = null;
  await db.withExclusiveTransactionAsync(async tx => {
    const again = await tx.getFirstAsync<{ local_id: string }>(
      `select local_id from local_training_sessions where user_id=? and deleted_at is null
       and json_extract(case when json_valid(payload_json) then payload_json else '{}' end, '$.${GROUP_TRACK_KEY}.trackId')=? limit 1`, userId, track.trackId);
    if (again) return;
    for (const statement of plan.statements) await tx.runAsync(statement.sql, ...statement.params);
    result = { localId: sessionId, dogId: track.dogId, blind: track.blind, searched: false };
  });
  return result ?? (await findImportedGroupTrack(userId, track.trackId))!;
}

/** Blind kann die Leger:in bis zum Start der Absuche ändern: vor dem Start den aktuellen Wert übernehmen. */
export async function syncImportedBlind(localId: string, trackId: string, blind: boolean) {
  const db = await getLocalDb();
  await db.runAsync(
    `update local_training_sessions set payload_json=json_set(payload_json, '$.${GROUP_TRACK_KEY}.blind', json(?))
     where local_id=? and json_valid(payload_json) and json_extract(payload_json, '$.${GROUP_TRACK_KEY}.trackId')=?`,
    blind ? 'true' : 'false', localId, trackId);
}
