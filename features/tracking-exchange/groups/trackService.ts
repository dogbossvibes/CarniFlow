import * as Crypto from 'expo-crypto';
import { GroupApiError, type createGroupRpcClient } from './groupRpc';
import { id, number, record, values } from './groupModels';
import { parseTrackTransferReference, type TrackTransferReference } from '@/features/tracking-transfer/reference';

// Stufe 2 Gruppentraining: Fährten für andere legen.
// Server: supabase/migrations/20261113090000_training_group_stage2a.sql (training_group_tracks_v1).
// Alle sehen nur Status und eine grobe Fläche; den genauen Verlauf (fetch) bekommen
// nur Leger:in und Hundeführer:in.
type Client = ReturnType<typeof createGroupRpcClient>;

/** Stufe 2b: «Fährte legen für …» mit Recorder, Übergabe und Absuche. */
export const GROUP_TRACK_HANDOVER_READY: boolean = true;

export type GroupTrackStatus = 'laying' | 'lying' | 'searching' | 'searched' | 'revoked';
export interface GroupTrackArea { centerLat: number; centerLng: number; radiusM: number }
export interface GroupTrack {
  trackId: string; sessionId: string; layerUserId: string; handlerUserId: string; handlerParticipationId: string;
  dogId: string; blind: boolean; status: GroupTrackStatus; createdAtMs: number;
  laidAtMs: number | null; searchStartedAtMs: number | null; searchedAtMs: number | null;
  area: GroupTrackArea | null; distanceM: number | null;
}

const STATUSES: readonly GroupTrackStatus[] = ['laying', 'lying', 'searching', 'searched', 'revoked'];
const nullableNumber = (value: unknown) => value === null || value === undefined ? null : number(value);

export function parseGroupTrack(value: unknown): GroupTrack {
  const r = record(value);
  if (!STATUSES.includes(r.status as GroupTrackStatus) || typeof r.blind !== 'boolean') throw new GroupApiError('GROUP_INVALID_RESPONSE');
  let area: GroupTrackArea | null = null;
  if (r.area !== null && r.area !== undefined) {
    const a = record(r.area);
    area = { centerLat: number(a.centerLat), centerLng: number(a.centerLng), radiusM: number(a.radiusM) };
    if (Math.abs(area.centerLat) > 90 || Math.abs(area.centerLng) > 180 || area.radiusM < 25 || area.radiusM > 50000) throw new GroupApiError('GROUP_INVALID_RESPONSE');
  }
  const track: GroupTrack = {
    trackId: id(r.trackId), sessionId: id(r.sessionId), layerUserId: id(r.layerUserId), handlerUserId: id(r.handlerUserId),
    handlerParticipationId: id(r.handlerParticipationId), dogId: id(r.dogId), blind: r.blind, status: r.status as GroupTrackStatus,
    createdAtMs: number(r.createdAtMs), laidAtMs: nullableNumber(r.laidAtMs), searchStartedAtMs: nullableNumber(r.searchStartedAtMs),
    searchedAtMs: nullableNumber(r.searchedAtMs), area, distanceM: nullableNumber(r.distanceM),
  };
  if (track.layerUserId === track.handlerUserId
    || ((track.status === 'lying' || track.status === 'searching' || track.status === 'searched') && (track.laidAtMs === null || !track.area))) {
    throw new GroupApiError('GROUP_INVALID_RESPONSE');
  }
  return track;
}

/** Liegezeit ohne Ziel: läuft ab dem Speichern, bleibt beim Start der Absuche stehen. */
export function lyingMs(track: GroupTrack, serverNowMs: number): number | null {
  if (track.laidAtMs === null) return null;
  const end = track.searchStartedAtMs ?? (track.status === 'lying' ? serverNowMs : track.searchedAtMs ?? serverNowMs);
  return Math.max(0, end - track.laidAtMs);
}

export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000), hours = Math.floor(total / 3600), minutes = Math.floor((total % 3600) / 60), seconds = total % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}

export function createGroupTrackService(client: Client, userId: string) {
  const assignIds = new Map<string, string>();
  const call = (action: string, request: Record<string, unknown>) => client.call(userId, 'training_group_tracks_v1', action, request);
  const single = async (action: string, request: Record<string, unknown>, trackId: string) => {
    const track = parseGroupTrack((await call(action, request)).track);
    if (track.trackId !== trackId) throw new GroupApiError('GROUP_INVALID_RESPONSE');
    return track;
  };
  return {
    async list(sessionId: string): Promise<{ tracks: GroupTrack[]; serverNowMs: number }> {
      const data = await call('list', { sessionId });
      const tracks = values(data.tracks, parseGroupTrack, 200);
      if (data.sessionId !== sessionId || tracks.some(t => t.sessionId !== sessionId)) throw new GroupApiError('GROUP_INVALID_RESPONSE');
      return { tracks, serverNowMs: data.serverNowMs as number };
    },
    /** Gleiche Eingabe nach unklarer Antwort = gleiche trackId (keine doppelte Fährte). */
    async assign(sessionId: string, handlerParticipationId: string, blind: boolean): Promise<GroupTrack> {
      const key = `${sessionId}\n${handlerParticipationId}\n${blind}`;
      let trackId = assignIds.get(key);
      if (!trackId) { trackId = Crypto.randomUUID(); assignIds.set(key, trackId); }
      try {
        const track = await single('assign', { sessionId, trackId, handlerParticipationId, blind }, trackId);
        if (track.layerUserId !== userId || track.handlerParticipationId !== handlerParticipationId) throw new GroupApiError('GROUP_INVALID_RESPONSE');
        assignIds.delete(key);
        return track;
      } catch (error) {
        if (!(error instanceof GroupApiError) || (error.code !== 'GROUP_CONNECTION' && error.code !== 'GROUP_INVALID_RESPONSE')) assignIds.delete(key);
        throw error;
      }
    },
    setBlind: (trackId: string, blind: boolean) => single('set_blind', { trackId, blind }, trackId),
    cancel: (trackId: string) => single('cancel', { trackId }, trackId),
    /** Paket im Format der Fährten-Übergabe: Zeitstempel und Teilstrecken bleiben für die Absuche erhalten. */
    submit: (trackId: string, reference: TrackTransferReference) => single('submit', { trackId, package: parseTrackTransferReference(reference) }, trackId),
    async fetch(trackId: string): Promise<{ track: GroupTrack; reference: TrackTransferReference }> {
      const data = await call('fetch', { trackId });
      const track = parseGroupTrack(data.track);
      if (track.trackId !== trackId || (track.layerUserId !== userId && track.handlerUserId !== userId)) throw new GroupApiError('GROUP_INVALID_RESPONSE');
      try { return { track, reference: parseTrackTransferReference(data.package) }; }
      catch { throw new GroupApiError('GROUP_INVALID_RESPONSE'); }
    },
    searchStart: (trackId: string) => single('search_start', { trackId }, trackId),
    searched: (trackId: string) => single('searched', { trackId }, trackId),
  };
}
export type GroupTrackService = ReturnType<typeof createGroupTrackService>;
