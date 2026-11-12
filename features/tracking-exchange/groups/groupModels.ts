import { GroupApiError } from './groupRpc';
export interface GroupMember { membershipId: string; userId: string; displayName: string; role: 'owner' | 'member'; joinedAtMs: number }
export interface TrainingGroup { groupId: string; title: string; ownerUserId: string; status: 'active' | 'ended'; createdAtMs: number; members: GroupMember[] }
export interface GroupInvitation { invitationId: string; groupId: string; groupTitle: string; inviterUserId: string;
  recipientUserId: string; status: 'pending' | 'accepted' | 'revoked' | 'expired'; expiresAtMs: number }
export interface GroupParticipant { participationId: string; userId: string; displayName: string; dogId: string; dogName: string; colorKey: string | null }
export interface GroupSessionSummary { sessionId: string; groupId: string; ownerUserId: string; title: string; status: 'active' | 'ended'; expiresAtMs: number }
export interface GroupSession extends GroupSessionSummary { participants: GroupParticipant[] }
export interface LivePeerPosition { shareId: string; userId: string; sessionId: string; dogId: string;
  latitude: number; longitude: number; accuracyM: number; sequence: number; observedAtMs: number;
  receivedAtMs: number; expiresAtMs: number }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new GroupApiError('GROUP_INVALID_RESPONSE');
  return value as Record<string, unknown>;
}
export function text(value: unknown, max = 80): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new GroupApiError('GROUP_INVALID_RESPONSE');
  return value;
}
export function id(value: unknown): string { const v = text(value, 36); if (!UUID.test(v)) throw new GroupApiError('GROUP_INVALID_RESPONSE'); return v; }
export function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new GroupApiError('GROUP_INVALID_RESPONSE'); return value;
}
export function values<T>(value: unknown, parse: (v: unknown) => T, max = 100): T[] {
  if (!Array.isArray(value) || value.length > max) throw new GroupApiError('GROUP_INVALID_RESPONSE');
  return value.map(parse);
}
function status(value: unknown): 'active' | 'ended' {
  if (value !== 'active' && value !== 'ended') throw new GroupApiError('GROUP_INVALID_RESPONSE'); return value;
}
export function parseGroup(value: unknown): TrainingGroup {
  const r = record(value);
  return { groupId: id(r.groupId), title: text(r.title), ownerUserId: id(r.ownerUserId), status: status(r.status),
    createdAtMs: number(r.createdAtMs), members: values(r.members, member => {
      const m = record(member);
      if (m.role !== 'owner' && m.role !== 'member') throw new GroupApiError('GROUP_INVALID_RESPONSE');
      return { membershipId: id(m.membershipId), userId: id(m.userId), displayName: text(m.displayName, 60), role: m.role, joinedAtMs: number(m.joinedAtMs) };
    }, 50) };
}
export function parseInvitation(value: unknown): GroupInvitation {
  const r = record(value);
  if (!['pending', 'accepted', 'revoked', 'expired'].includes(String(r.status))) throw new GroupApiError('GROUP_INVALID_RESPONSE');
  return { invitationId: id(r.invitationId), groupId: id(r.groupId), groupTitle: text(r.groupTitle),
    inviterUserId: id(r.inviterUserId), recipientUserId: id(r.recipientUserId),
    status: r.status as GroupInvitation['status'], expiresAtMs: number(r.expiresAtMs) };
}
export function parseSessionSummary(value: unknown): GroupSessionSummary {
  const r = record(value);
  return { sessionId: id(r.sessionId), groupId: id(r.groupId), ownerUserId: id(r.ownerUserId), title: text(r.title),
    status: status(r.status), expiresAtMs: number(r.expiresAtMs) };
}
export function parseSession(value: unknown): GroupSession {
  const r = record(value);
  return { ...parseSessionSummary(r), participants: values(r.participants, participant => {
    const p = record(participant);
    return { participationId: id(p.participationId), userId: id(p.userId), displayName: text(p.displayName, 60), dogId: id(p.dogId), dogName: text(p.dogName, 120),
      colorKey: p.colorKey === null ? null : text(p.colorKey, 30) };
  }, 50) };
}
export function parseLivePosition(value: unknown, sessionId: string, serverNow: number): LivePeerPosition {
  const r = record(value);
  const p = { shareId: id(r.shareId), userId: id(r.userId), sessionId: id(r.sessionId), dogId: id(r.dogId),
    latitude: number(r.latitude), longitude: number(r.longitude), accuracyM: number(r.accuracyM), sequence: number(r.sequence),
    observedAtMs: number(r.observedAtMs), receivedAtMs: number(r.receivedAtMs), expiresAtMs: number(r.expiresAtMs) };
  if (p.sessionId !== sessionId || Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180
    || p.accuracyM < 0 || p.accuracyM > 10000 || !Number.isSafeInteger(p.sequence) || p.sequence < 1
    || p.sequence > 2147483647 || p.observedAtMs < serverNow - 10000 || p.observedAtMs > serverNow + 2000
    || p.receivedAtMs > serverNow || p.expiresAtMs <= serverNow) throw new GroupApiError('GROUP_INVALID_RESPONSE');
  return p;
}
