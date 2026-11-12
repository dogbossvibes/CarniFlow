import * as Crypto from 'expo-crypto';
import { GroupApiError, type createGroupRpcClient } from './groupRpc';
import { id, number, record, text, values } from './groupModels';

// Stufe 1 Gruppentraining: Einladungscodes, Beitrittsanfragen, Rollen.
// Server: supabase/migrations/20261112140000_training_group_stage1.sql (training_group_join_v1).
type Client = ReturnType<typeof createGroupRpcClient>;

export const GROUP_JOIN_LINK_PREFIX = 'anyvo://groups/join?code=';
export const GROUP_CODE_LENGTH = 12;

export interface GroupJoinCode { groupId: string; code: string; expiresAtMs: number; maxUses: number }
export interface GroupJoinPreview { groupTitle: string; inviterName: string; status: 'none' | 'pending' | 'member' }
export interface OwnJoinRequest { requestId: string; groupId: string; groupTitle: string; displayName: string; createdAtMs: number }
export interface PendingJoinRequest { requestId: string; userId: string; displayName: string; createdAtMs: number }
export type GroupRole = 'member' | 'organizer';

/** Code aus Eingabe, QR-Inhalt oder Link herauslösen (Gross-/Kleinschreibung und Trennzeichen egal). */
export function parseGroupCode(raw: string): string {
  const value = raw.trim();
  const fromLink = /[?&]code=([^&#\s]+)/i.exec(value);
  let candidate = value;
  if (fromLink) {
    try { candidate = decodeURIComponent(fromLink[1]); } catch { candidate = fromLink[1]; }
  }
  return candidate.replace(/[^0-9a-z]/gi, '').toUpperCase().slice(0, GROUP_CODE_LENGTH);
}

/** Zur besseren Lesbarkeit in Vierergruppen: ABCD-EFGH-IJKL. */
export function formatGroupCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, '$1-');
}

export function groupJoinLink(code: string): string {
  return `${GROUP_JOIN_LINK_PREFIX}${encodeURIComponent(code)}`;
}

function parseOwnRequest(value: unknown): OwnJoinRequest {
  const r = record(value);
  if (r.status !== 'pending') throw new GroupApiError('GROUP_INVALID_RESPONSE');
  return { requestId: id(r.requestId), groupId: id(r.groupId), groupTitle: text(r.groupTitle),
    displayName: text(r.displayName, 60), createdAtMs: number(r.createdAtMs) };
}
function parsePending(value: unknown): PendingJoinRequest {
  const r = record(value);
  return { requestId: id(r.requestId), userId: id(r.userId), displayName: text(r.displayName, 60), createdAtMs: number(r.createdAtMs) };
}

/**
 * Wie createTrainingGroupService: keine automatische Wiederholung, keine Offline-Warteschlange.
 * Die Anfrage-ID bleibt für dieselbe Eingabe stabil, solange der Dienst lebt; eine unklare
 * Antwort kann so gefahrlos erneut gesendet werden.
 */
export function createGroupJoinService(client: Client, userId: string) {
  const requestIds = new Map<string, string>();
  const call = (action: string, request: Record<string, unknown>) => client.call(userId, 'training_group_join_v1', action, request);
  return {
    async createCode(groupId: string): Promise<GroupJoinCode> {
      const data = await call('code_create', { groupId });
      const code = text(data.code, GROUP_CODE_LENGTH);
      if (data.groupId !== groupId || code.length !== GROUP_CODE_LENGTH || !/^[0-9A-F]+$/.test(code)) throw new GroupApiError('GROUP_INVALID_RESPONSE');
      return { groupId, code, expiresAtMs: number(data.expiresAtMs), maxUses: number(data.maxUses) };
    },
    async revokeCodes(groupId: string): Promise<void> {
      const data = await call('code_revoke', { groupId });
      if (data.groupId !== groupId || data.revoked !== true) throw new GroupApiError('GROUP_INVALID_RESPONSE');
    },
    /** null = Code ungültig, abgelaufen oder nicht (mehr) nutzbar. */
    async preview(code: string): Promise<GroupJoinPreview | null> {
      const data = await call('preview', { code: parseGroupCode(code) });
      if (data.invalidCode === true) return null;
      const p = record(data.preview);
      if (p.status !== 'none' && p.status !== 'pending' && p.status !== 'member') throw new GroupApiError('GROUP_INVALID_RESPONSE');
      return { groupTitle: text(p.groupTitle), inviterName: text(p.inviterName, 60), status: p.status };
    },
    /** null = Code ungültig. */
    async request(code: string, displayName: string): Promise<OwnJoinRequest | null> {
      const normalized = parseGroupCode(code), name = displayName.trim();
      const key = `${normalized}\n${name}`;
      let requestId = requestIds.get(key);
      if (!requestId) { requestId = Crypto.randomUUID(); requestIds.set(key, requestId); }
      try {
        const data = await call('request', { code: normalized, requestId, displayName: name });
        if (data.invalidCode === true) { requestIds.delete(key); return null; }
        const request = parseOwnRequest(data.request);
        if (request.requestId !== requestId) throw new GroupApiError('GROUP_INVALID_RESPONSE');
        requestIds.delete(key);
        return request;
      } catch (error) {
        // Nur bei unklarem Ausgang dieselbe ID behalten.
        if (!(error instanceof GroupApiError) || (error.code !== 'GROUP_CONNECTION' && error.code !== 'GROUP_INVALID_RESPONSE')) requestIds.delete(key);
        throw error;
      }
    },
    async mine(): Promise<OwnJoinRequest[]> {
      return values((await call('mine', {})).requests, parseOwnRequest, 20);
    },
    async cancel(requestId: string): Promise<void> {
      const data = await call('cancel', { requestId });
      if (data.requestId !== requestId || data.cancelled !== true) throw new GroupApiError('GROUP_INVALID_RESPONSE');
    },
    async pending(groupId: string): Promise<PendingJoinRequest[]> {
      const data = await call('pending', { groupId });
      if (data.groupId !== groupId) throw new GroupApiError('GROUP_INVALID_RESPONSE');
      return values(data.requests, parsePending, 50);
    },
    async decide(groupId: string, requestId: string, approve: boolean): Promise<void> {
      const data = await call(approve ? 'approve' : 'decline', { groupId, requestId });
      if (data.groupId !== groupId || data.requestId !== requestId || data[approve ? 'approved' : 'declined'] !== true) {
        throw new GroupApiError('GROUP_INVALID_RESPONSE');
      }
    },
    async setRole(groupId: string, memberUserId: string, membershipId: string, role: GroupRole): Promise<void> {
      const data = await call('set_role', { groupId, memberUserId, membershipId, role });
      if (data.groupId !== groupId || data.memberUserId !== memberUserId || data.role !== role) throw new GroupApiError('GROUP_INVALID_RESPONSE');
    },
  };
}
export type GroupJoinService = ReturnType<typeof createGroupJoinService>;
