import * as Crypto from 'expo-crypto';
import { GroupApiError, type createGroupRpcClient } from './groupRpc';
import { id, number, record, values } from './groupModels';
import { parseTrackTransferReference, type TrackTransferReference } from '@/features/tracking-transfer/reference';
import { parseSharedTrailDetails, type SharedTrailDetails } from '@/features/mantrailing/model';

// Stufe 2 Gruppentraining: Fährten für andere legen. Issue #150: auch eine eigene Fährte
// (Leger:in = Hundeführer:in, eigener angemeldeter Hund; nie «blind», keine Übergabe).
// Server: supabase/migrations/20261113090000_training_group_stage2a.sql (training_group_tracks_v1).
// Alle sehen nur Status und eine grobe Fläche; den genauen Verlauf (fetch) bekommen
// nur Leger:in und Hundeführer:in.
type Client = ReturnType<typeof createGroupRpcClient>;

/** Stufe 2b: «Fährte legen für …» mit Recorder, Übergabe und Absuche. */
export const GROUP_TRACK_HANDOVER_READY: boolean = true;

export type GroupTrackStatus = 'laying' | 'lying' | 'searching' | 'searched' | 'revoked';
export interface GroupTrackArea { centerLat: number; centerLng: number; radiusM: number; polygon: { lat: number; lng: number }[] | null }
export interface GroupTrack {
  trackId: string; sessionId: string; layerUserId: string; handlerUserId: string; handlerParticipationId: string;
  dogId: string; blind: boolean; status: GroupTrackStatus; createdAtMs: number;
  laidAtMs: number | null; searchStartedAtMs: number | null; searchedAtMs: number | null;
  area: GroupTrackArea | null; distanceM: number | null;
  /** Mantrailing (Spec 02). Ältere Server liefern kein Feld → 'track'. */
  kind: GroupTrackKind;
}
export type GroupTrackKind = 'track' | 'mantrail';

const STATUSES: readonly GroupTrackStatus[] = ['laying', 'lying', 'searching', 'searched', 'revoked'];
const nullableNumber = (value: unknown) => value === null || value === undefined ? null : number(value);

export function parseGroupTrack(value: unknown): GroupTrack {
  const r = record(value);
  if (!STATUSES.includes(r.status as GroupTrackStatus) || typeof r.blind !== 'boolean') throw new GroupApiError('GROUP_INVALID_RESPONSE');
  let area: GroupTrackArea | null = null;
  if (r.area !== null && r.area !== undefined) {
    const a = record(r.area);
    // Stufe 3: kantige Fläche (Rechteck). Ältere Server liefern nur Mittelpunkt und Radius.
    const polygon = a.polygon === undefined || a.polygon === null ? null : values(a.polygon, raw => {
      const corner = record(raw);
      const point = { lat: number(corner.lat), lng: number(corner.lng) };
      if (Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) throw new GroupApiError('GROUP_INVALID_RESPONSE');
      return point;
    }, 8);
    if (polygon && polygon.length < 3) throw new GroupApiError('GROUP_INVALID_RESPONSE');
    area = { centerLat: number(a.centerLat), centerLng: number(a.centerLng), radiusM: number(a.radiusM), polygon };
    if (Math.abs(area.centerLat) > 90 || Math.abs(area.centerLng) > 180 || area.radiusM < 25 || area.radiusM > 50000) throw new GroupApiError('GROUP_INVALID_RESPONSE');
  }
  const track: GroupTrack = {
    trackId: id(r.trackId), sessionId: id(r.sessionId), layerUserId: id(r.layerUserId), handlerUserId: id(r.handlerUserId),
    handlerParticipationId: id(r.handlerParticipationId), dogId: id(r.dogId), blind: r.blind, status: r.status as GroupTrackStatus,
    createdAtMs: number(r.createdAtMs), laidAtMs: nullableNumber(r.laidAtMs), searchStartedAtMs: nullableNumber(r.searchStartedAtMs),
    searchedAtMs: nullableNumber(r.searchedAtMs), area, distanceM: nullableNumber(r.distanceM),
    kind: r.kind === 'mantrail' ? 'mantrail' : 'track',
  };
  // Eigene Fährte (Issue #150): Leger:in = Hundeführer:in ist erlaubt, aber nie «blind».
  if ((track.layerUserId === track.handlerUserId && track.blind)
    || ((track.status === 'lying' || track.status === 'searching' || track.status === 'searched') && (track.laidAtMs === null || !track.area))) {
    throw new GroupApiError('GROUP_INVALID_RESPONSE');
  }
  return track;
}

/** Eigene Fährte im Gruppentraining: dieselbe Person legt und sucht ab. */
export const isOwnGroupTrack = (track: Pick<GroupTrack, 'layerUserId' | 'handlerUserId'>) => track.layerUserId === track.handlerUserId;

/** Wie lange ein Server ohne eigene Fährten nicht erneut gefragt wird. */
export const OWN_TRACKS_RETRY_MS = 5 * 60 * 1000;

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
  // Server ohne die Migration für eigene Fährten lehnt «includeOwn» ab: dann ohne fragen.
  let ownUnsupportedUntil = 0;
  // Server ohne die Mantrailing-Migration lehnt «includeMantrail» ab: dann ohne Trails fragen.
  let mantrailUnsupportedUntil = 0;
  const call = (action: string, request: Record<string, unknown>) => client.call(userId, 'training_group_tracks_v1', action, request);
  const single = async (action: string, request: Record<string, unknown>, trackId: string) => {
    const track = parseGroupTrack((await call(action, request)).track);
    if (track.trackId !== trackId) throw new GroupApiError('GROUP_INVALID_RESPONSE');
    return track;
  };
  return {
    /** ownTracks / mantrailTracks = false: der Server kennt eigene Fährten bzw. Trails noch nicht (Migration fehlt). */
    async list(sessionId: string): Promise<{ tracks: GroupTrack[]; serverNowMs: number; ownTracks: boolean; mantrailTracks: boolean }> {
      let data: Record<string, unknown> | null = null;
      let ownTracks = Date.now() >= ownUnsupportedUntil;
      let mantrailTracks = ownTracks && Date.now() >= mantrailUnsupportedUntil;
      if (mantrailTracks) {
        try { data = await call('list', { sessionId, includeOwn: true, includeMantrail: true }); }
        catch (error) {
          if (!(error instanceof GroupApiError) || error.code !== 'GROUP_INVALID_REQUEST') throw error;
          mantrailTracks = false; mantrailUnsupportedUntil = Date.now() + OWN_TRACKS_RETRY_MS;
        }
      }
      if (!data && ownTracks) {
        try { data = await call('list', { sessionId, includeOwn: true }); }
        catch (error) {
          if (!(error instanceof GroupApiError) || error.code !== 'GROUP_INVALID_REQUEST') throw error;
          ownTracks = false; ownUnsupportedUntil = Date.now() + OWN_TRACKS_RETRY_MS;
        }
      }
      data ??= await call('list', { sessionId });
      const tracks = values(data.tracks, parseGroupTrack, 200);
      if (data.sessionId !== sessionId || tracks.some(t => t.sessionId !== sessionId)) throw new GroupApiError('GROUP_INVALID_RESPONSE');
      return { tracks, serverNowMs: data.serverNowMs as number, ownTracks, mantrailTracks };
    },
    /** Gleiche Eingabe nach unklarer Antwort = gleiche trackId (keine doppelte Fährte). */
    async assign(sessionId: string, handlerParticipationId: string, blind: boolean, kind: GroupTrackKind = 'track'): Promise<GroupTrack> {
      const key = `${sessionId}\n${handlerParticipationId}\n${blind}\n${kind}`;
      let trackId = assignIds.get(key);
      if (!trackId) { trackId = Crypto.randomUUID(); assignIds.set(key, trackId); }
      try {
        // Ohne kind bleibt die Anfrage byte-gleich wie bisher (IGP-Fährte).
        const track = await single('assign', { sessionId, trackId, handlerParticipationId, blind, ...(kind === 'mantrail' ? { kind } : {}) }, trackId);
        if (track.layerUserId !== userId || track.handlerParticipationId !== handlerParticipationId || track.kind !== kind) throw new GroupApiError('GROUP_INVALID_RESPONSE');
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
    /** mantrail: Angaben der Leger:in (nur bei Trails); ohne bleibt die Anfrage wie bisher. */
    submit: (trackId: string, reference: TrackTransferReference, mantrail?: SharedTrailDetails | null) =>
      single('submit', { trackId, package: parseTrackTransferReference(reference), ...(mantrail ? { mantrail } : {}) }, trackId),
    async fetch(trackId: string): Promise<{ track: GroupTrack; reference: TrackTransferReference; mantrail: SharedTrailDetails | null }> {
      const data = await call('fetch', { trackId });
      const track = parseGroupTrack(data.track);
      if (track.trackId !== trackId || (track.layerUserId !== userId && track.handlerUserId !== userId)) throw new GroupApiError('GROUP_INVALID_RESPONSE');
      const mantrail = track.kind === 'mantrail' ? parseSharedTrailDetails(data.mantrail) : null;
      try { return { track, reference: parseTrackTransferReference(data.package), mantrail }; }
      catch { throw new GroupApiError('GROUP_INVALID_RESPONSE'); }
    },
    searchStart: (trackId: string) => single('search_start', { trackId }, trackId),
    searched: (trackId: string) => single('searched', { trackId }, trackId),
  };
}
export type GroupTrackService = ReturnType<typeof createGroupTrackService>;

/** Ecken der Fläche: Rechteck vom Server, sonst ein Quadrat um Mittelpunkt und Radius (nie rund). */
export function areaCorners(area: GroupTrackArea): { lat: number; lng: number }[] {
  if (area.polygon && area.polygon.length >= 3) return area.polygon;
  const dLat = area.radiusM / 111320, dLng = area.radiusM / (111320 * Math.max(Math.cos(area.centerLat * Math.PI / 180), 0.2));
  return [
    { lat: area.centerLat - dLat, lng: area.centerLng - dLng }, { lat: area.centerLat - dLat, lng: area.centerLng + dLng },
    { lat: area.centerLat + dLat, lng: area.centerLng + dLng }, { lat: area.centerLat + dLat, lng: area.centerLng - dLng },
  ];
}
