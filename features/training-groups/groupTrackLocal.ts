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
import { isOwnGroupTrack, type GroupTrack, type GroupTrackKind, type GroupTrackService } from '@/features/tracking-exchange/groups/trackService';
import { emptyMantrailData, MANTRAIL_CATEGORY, MANTRAIL_SESSION_TYPE, MANTRAIL_TITLE, sharedTrailDetails, type SharedTrailDetails } from '@/features/mantrailing/model';
import { getLocalMantrailDetails } from '@/features/mantrailing/localRepository';

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
  return { reference: projectTrackTransferSource(session, points, markers, { allowMantrail: true }), dogId: session.dog_id };
}

/** own = eigene Fährte (Issue #150): die Fläche wird eingetragen, die Fährte bleibt die eigene, offene Fährte des Hundes. */
export interface PendingHandover { trackId: string; localId: string; groupId: string; sessionId: string; createdAtMs: number; own?: boolean }
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

// ── Eigene Fährte (Issue #150) ───────────────────────────────────────────────
// Die lokal gelegte Fährte bleibt unverändert die eigene, normale Fährte. Gemerkt wird nur,
// welche lokale Fährte zu welcher Gruppenfährte gehört (kleine Liste, keine Änderung an der Fährte).
export interface OwnGroupTrackLink { trackId: string; localId: string; sessionId: string; createdAtMs: number }
const ownKey = (userId: string) => `anyvo_group_own_tracks_v1:${userId}`;

export async function listOwnGroupTracks(userId: string): Promise<OwnGroupTrackLink[]> {
  try {
    const value = JSON.parse((await AsyncStorage.getItem(ownKey(userId))) ?? '[]');
    return Array.isArray(value) ? value.filter(v => v && typeof v.trackId === 'string' && typeof v.localId === 'string') : [];
  } catch { return []; }
}
export async function rememberOwnGroupTrack(userId: string, link: OwnGroupTrackLink) {
  const list = (await listOwnGroupTracks(userId)).filter(e => e.trackId !== link.trackId);
  await AsyncStorage.setItem(ownKey(userId), JSON.stringify([...list, link].slice(-50)));
}

// ── Angefangene Gruppenfährte (Hinweis #156) ─────────────────────────────────
// Beim Start der Aufnahme wird gemerkt, welche lokale Fährte zu welcher Gruppenfährte gehört.
// Wird die Aufnahme unterbrochen und über den gewohnten Fährten-Weg fortgesetzt und gestoppt, fehlt
// danach der Schritt «eintragen/übergeben»: der Gruppeneintrag bliebe sonst auf «wird gelegt».
// Nur eine kleine Liste; die Fährte selbst wird dabei nicht verändert.
export type LayingGroupTrack = PendingHandover;
const layingKey = (userId: string) => `anyvo_group_track_laying_v1:${userId}`;

export async function listLayingGroupTracks(userId: string): Promise<LayingGroupTrack[]> {
  try {
    const value = JSON.parse((await AsyncStorage.getItem(layingKey(userId))) ?? '[]');
    return Array.isArray(value) ? value.filter(v => v && typeof v.trackId === 'string' && typeof v.localId === 'string'
      && typeof v.groupId === 'string' && typeof v.sessionId === 'string') : [];
  } catch { return []; }
}
export async function rememberLayingGroupTrack(userId: string, entry: LayingGroupTrack) {
  const list = (await listLayingGroupTracks(userId)).filter(e => e.trackId !== entry.trackId);
  await AsyncStorage.setItem(layingKey(userId), JSON.stringify([...list, entry].slice(-20)));
}
async function forgetLayingGroupTrack(userId: string, trackId: string) {
  const list = await listLayingGroupTracks(userId);
  if (list.some(e => e.trackId === trackId)) await AsyncStorage.setItem(layingKey(userId), JSON.stringify(list.filter(e => e.trackId !== trackId)));
}

/**
 * Angefangene Gruppenfährten dieser Sitzung, die lokal inzwischen fertig gelegt sind, aber noch nicht
 * eingetragen bzw. übergeben wurden (nur solche, die der Server noch als «wird gelegt» führt).
 * Nur lesend. Eine schon selbst abgesuchte Fährte für eine andere Person wird nicht nachträglich übergeben.
 */
export async function findFinishedLayings(userId: string, sessionId: string, layingTrackIds: ReadonlySet<string>): Promise<LayingGroupTrack[]> {
  const pending = new Set((await listPendingHandovers(userId)).map(e => e.trackId));
  const candidates = (await listLayingGroupTracks(userId))
    .filter(e => e.sessionId === sessionId && layingTrackIds.has(e.trackId) && !pending.has(e.trackId));
  if (candidates.length === 0) return [];
  const db = await getLocalDb();
  const result: LayingGroupTrack[] = [];
  for (const entry of candidates) {
    const row = await db.getFirstAsync<{ status: string | null; payload_json: string | null }>(
      'select status,payload_json from local_training_sessions where local_id=? and user_id=? and deleted_at is null', entry.localId, userId);
    if (!row || row.status !== 'completed') continue;
    if (!entry.own) {
      let searched = false;
      try { searched = !!JSON.parse(row.payload_json ?? '{}')?.run; } catch { searched = false; }
      if (searched) continue;
    }
    result.push(entry);
  }
  return result;
}

/**
 * Hund, unter dem eine Fährte für eine andere Person aufgezeichnet wird (#156): der erste ohne offene
 * Fährte. Haben alle eine offene Fährte, der erste (bisheriges Verhalten, Dialog beim Legen). Rein.
 */
export function pickLayerDog(candidates: readonly string[], hasActiveTrack: (dogId: string) => boolean): string | undefined {
  return candidates.find(id => !hasActiveTrack(id)) ?? candidates[0];
}

export type HandoverResult = 'sent' | 'queued' | 'dropped';
/** Schickt die gelegte Fährte. Unklarer Ausgang (Netz) → in der Warteschlange lassen. */
export async function submitHandover(service: GroupTrackService, userId: string, entry: PendingHandover): Promise<HandoverResult> {
  if (entry.own) await rememberOwnGroupTrack(userId, { trackId: entry.trackId, localId: entry.localId, sessionId: entry.sessionId, createdAtMs: entry.createdAtMs });
  await addPendingHandover(userId, entry);
  const { reference, dogId } = await readLaidReference(userId, entry.localId);
  // Mantrailing: Angaben der Leger:in mitgeben (null bei IGP-Fährten → Anfrage wie bisher).
  const mantrail = sharedTrailDetails(await getLocalMantrailDetails(entry.localId).catch(() => null));
  try {
    await service.submit(entry.trackId, reference, mantrail);
  } catch (error) {
    if (error instanceof GroupApiError && (error.code === 'GROUP_CONNECTION' || error.code === 'GROUP_INVALID_RESPONSE'
      || error.code === 'GROUP_MAINTENANCE_UNAVAILABLE' || error.code === 'GROUP_ACCOUNT_CHANGED')) return 'queued';
    // Endgültig (abgebrochen, verlassen, ungültig): nicht endlos wiederholen.
    await removePendingHandover(userId, entry.trackId);
    await forgetLayingGroupTrack(userId, entry.trackId);
    if (error instanceof GroupApiError && (error.code === 'GROUP_REVOKED' || error.code === 'GROUP_UNAVAILABLE')) return 'dropped';
    throw error;
  }
  await removePendingHandover(userId, entry.trackId);
  await forgetLayingGroupTrack(userId, entry.trackId);
  // Eigene Fährte: bleibt für den eigenen Hund offen (Liegezeit, Absuche wie gewohnt).
  if (!entry.own) await releaseLayerDog(dogId, entry.localId);
  return 'sent';
}

export async function flushPendingHandovers(service: GroupTrackService, userId: string, sessionId?: string) {
  for (const entry of await listPendingHandovers(userId)) {
    if (sessionId && entry.sessionId !== sessionId) continue;
    try { await submitHandover(service, userId, entry); } catch { /* bleibt sichtbar als «wird gelegt» */ }
  }
}

// ── Hundeführer:in ──────────────────────────────────────────────────────────

export interface ImportedGroupTrack { localId: string; dogId: string; blind: boolean; searched: boolean; kind?: 'mantrail' }

export async function findImportedGroupTrack(userId: string, trackId: string): Promise<ImportedGroupTrack | null> {
  const db = await getLocalDb();
  const row = await db.getFirstAsync<{ local_id: string; dog_id: string; type: string | null; payload_json: string | null }>(
    `select local_id,dog_id,type,payload_json from local_training_sessions where user_id=? and deleted_at is null
     and json_extract(case when json_valid(payload_json) then payload_json else '{}' end, '$.${GROUP_TRACK_KEY}.trackId')=? limit 1`, userId, trackId);
  if (!row) return null;
  const marker = readGroupTrackMarker(row.payload_json);
  let searched = false;
  try { searched = !!JSON.parse(row.payload_json ?? '{}')?.run; } catch { searched = false; }
  return { localId: row.local_id, dogId: row.dog_id, blind: marker?.blind ?? false, searched,
    ...(row.type === MANTRAIL_SESSION_TYPE ? { kind: 'mantrail' as const } : {}) };
}

/** Eigene Gruppenfährte: die lokal gelegte Fährte dieses Geräts (auf anderen Geräten: null). Nur lesend. */
export async function findOwnGroupTrack(userId: string, trackId: string): Promise<ImportedGroupTrack | null> {
  const link = (await listOwnGroupTracks(userId)).find(e => e.trackId === trackId);
  if (!link) return null;
  const db = await getLocalDb();
  const row = await db.getFirstAsync<{ local_id: string; dog_id: string | null; type: string | null; payload_json: string | null }>(
    'select local_id,dog_id,type,payload_json from local_training_sessions where local_id=? and user_id=? and deleted_at is null', link.localId, userId);
  if (!row || !row.dog_id) return null;
  let searched = false;
  try { searched = !!JSON.parse(row.payload_json ?? '{}')?.run; } catch { searched = false; }
  return { localId: row.local_id, dogId: row.dog_id, blind: false, searched,
    ...(row.type === MANTRAIL_SESSION_TYPE ? { kind: 'mantrail' as const } : {}) };
}

/** Lokale Fährte zu einer Gruppenfährte, bei der ich Hundeführer:in bin. */
export function findLocalGroupTrack(userId: string, track: Pick<GroupTrack, 'trackId' | 'layerUserId' | 'handlerUserId'>) {
  return isOwnGroupTrack(track) ? findOwnGroupTrack(userId, track.trackId) : findImportedGroupTrack(userId, track.trackId);
}

type SQLValue = string | number | null;
const stripVersion = (d: SharedTrailDetails | null | undefined) => { if (!d) return {}; const { version: _v, ...rest } = d; return rest; };
function insert(table: string, row: Record<string, SQLValue>) {
  const keys = Object.keys(row);
  return { sql: `insert into ${table} (${keys.join(',')}) values (${keys.map(() => '?').join(',')})`, params: keys.map(k => row[k]) };
}

/** Wie der Import der Fährten-Übergabe, aber als eigene Fährte ohne Quittung. Rein, testbar. */
export function createGroupTrackImportPlan(input: { userId: string; dogId: string; sessionId: string; trackId: string; blind: boolean; nowMs: number; kind?: GroupTrackKind; mantrail?: SharedTrailDetails | null },
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
    // Mantrailing (Spec 02): übergebener Trail; Doppelblind folgt der Blind-Einstellung der Gruppe.
    // Angaben der Leger:in übernehmen; «Negativtrail» zeigt der Bildschirm bei Doppelblind erst nach «Ende».
    ...(input.kind === 'mantrail' ? { mantrail: { ...emptyMantrailData(), ...stripVersion(input.mantrail), trailSource: 'transfer', doubleBlind: input.blind } } : {}),
  };
  const mantrail = input.kind === 'mantrail';
  const parent = insert('local_training_sessions', {
    local_id: input.sessionId, remote_id: null, user_id: input.userId, dog_id: input.dogId,
    category: mantrail ? MANTRAIL_CATEGORY : 'IGP', type: mantrail ? MANTRAIL_SESSION_TYPE : 'track', status: 'completed', title: mantrail ? MANTRAIL_TITLE : null, notes: null, score: null, visibility: 'private',
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
export async function importGroupTrack(userId: string, track: GroupTrack, reference: TrackTransferReference, mantrail?: SharedTrailDetails | null): Promise<ImportedGroupTrack> {
  // Eigene Fährte nie importieren: sie liegt schon als normale Fährte auf dem Gerät, das sie gelegt hat.
  if (track.handlerUserId !== userId || isOwnGroupTrack(track)) throw new GroupApiError('GROUP_UNAVAILABLE');
  const existing = await findImportedGroupTrack(userId, track.trackId);
  if (existing) return existing;
  const sessionId = Crypto.randomUUID();
  const plan = createGroupTrackImportPlan({ userId, dogId: track.dogId, sessionId, trackId: track.trackId, blind: track.blind, nowMs: Date.now(),
    ...(track.kind === 'mantrail' ? { kind: 'mantrail' as const, mantrail: mantrail ?? null } : {}) }, reference);
  const db = await getLocalDb();
  let result: ImportedGroupTrack | null = null;
  await db.withExclusiveTransactionAsync(async tx => {
    const again = await tx.getFirstAsync<{ local_id: string }>(
      `select local_id from local_training_sessions where user_id=? and deleted_at is null
       and json_extract(case when json_valid(payload_json) then payload_json else '{}' end, '$.${GROUP_TRACK_KEY}.trackId')=? limit 1`, userId, track.trackId);
    if (again) return;
    for (const statement of plan.statements) await tx.runAsync(statement.sql, ...statement.params);
    result = { localId: sessionId, dogId: track.dogId, blind: track.blind, searched: false, ...(track.kind === 'mantrail' ? { kind: 'mantrail' as const } : {}) };
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
