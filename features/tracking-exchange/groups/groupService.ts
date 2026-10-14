import * as Crypto from 'expo-crypto';
import { GroupApiError, type GroupEndpoint, type createGroupRpcClient } from './groupRpc';
import { parseGroup, parseInvitation, parseSession, parseSessionSummary, values } from './groupModels';
type Client = ReturnType<typeof createGroupRpcClient>;

/** Stable IDs survive an unknown response while this account's screen/service is
 * mounted. No offline mutation queue and no automatic retry. Reopening first reads
 * the server lists; a new user action is required. Location data never enters here.
 */
export function createTrainingGroupService(client: Client, userId: string) {
  const requests = new Map<string, Record<string, unknown>>();
  const pending = new Map<string, Promise<Record<string, unknown>>>();
  async function mutation(endpoint: GroupEndpoint, action: string, fields: Record<string, unknown>, idKey?: string) {
    const fingerprint = JSON.stringify([endpoint, action, Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))]);
    const inFlight = pending.get(fingerprint);
    if (inFlight) return inFlight;
    let request = requests.get(fingerprint);
    if (!request) {
      if (requests.size >= 50) throw new GroupApiError('GROUP_CONFLICT');
      request = { ...fields, ...(idKey ? { [idKey]: Crypto.randomUUID() } : {}) };
      requests.set(fingerprint, request);
    }
    const requestData = request;
    const operation = (async () => {
      try {
        const data = await client.call(userId, endpoint, action, requestData);
        const groupAction = endpoint === 'training_group_v1';
        if (action === 'create' || (groupAction && action === 'accept')) {
          const group = parseGroup(data.group);
          if ((action === 'create' && (group.groupId !== requestData.groupId || group.ownerUserId !== userId))
            || !group.members.some(m => m.userId === userId && m.membershipId === (action === 'create' ? requestData.groupId : requestData.invitationId))) throw new GroupApiError('GROUP_INVALID_RESPONSE');
        } else if (action === 'invite') {
          const invite = parseInvitation(data.invitation);
          if (invite.invitationId !== requestData.invitationId || invite.groupId !== requestData.groupId
            || invite.recipientUserId !== requestData.recipientUserId) throw new GroupApiError('GROUP_INVALID_RESPONSE');
        } else if (action === 'open' || action === 'join') {
          const session = parseSession(data.session);
          if (session.sessionId !== requestData.sessionId || !session.participants.some(p => p.userId === userId
            && p.dogId === requestData.dogId && p.participationId === (action === 'open' ? requestData.sessionId : requestData.participationId))) throw new GroupApiError('GROUP_INVALID_RESPONSE');
        } else {
          const identifier = groupAction ? 'groupId' : 'sessionId';
          const ack = action === 'leave' ? 'left' : 'ended';
          if (data[identifier] !== requestData[identifier] || data[ack] !== true
            || (groupAction && action === 'leave' && data.membershipId !== requestData.membershipId)
            || (!groupAction && action === 'leave' && data.participationId !== requestData.participationId)) throw new GroupApiError('GROUP_INVALID_RESPONSE');
        }
        requests.delete(fingerprint);
        return data;
      } catch (error) {
        if (error instanceof GroupApiError && error.code !== 'GROUP_CONNECTION' && error.code !== 'GROUP_INVALID_RESPONSE') {
          requests.delete(fingerprint);
        }
        throw error;
      } finally { pending.delete(fingerprint); }
    })();
    pending.set(fingerprint, operation);
    return operation;
  }
  return {
    async list() {
      const data = await client.call(userId, 'training_group_v1', 'list', {});
      const groups = values(data.groups, parseGroup);
      const invitations = values(data.invitations, parseInvitation);
      if (groups.some(g => !g.members.some(m => m.userId === userId)) || invitations.some(i => i.recipientUserId !== userId)) {
        throw new GroupApiError('GROUP_INVALID_RESPONSE');
      }
      return { groups, invitations, serverNowMs: data.serverNowMs as number };
    },
    async sessions(groupId: string) {
      const data = await client.call(userId, 'training_group_session_v1', 'list', { groupId });
      const sessions = values(data.sessions, parseSessionSummary);
      if (sessions.some(s => s.groupId !== groupId)) throw new GroupApiError('GROUP_INVALID_RESPONSE');
      return { sessions, serverNowMs: data.serverNowMs as number };
    },
    async session(sessionId: string) {
      const data = await client.call(userId, 'training_group_session_v1', 'get', { sessionId });
      const session = parseSession(data.session);
      if (session.sessionId !== sessionId || !session.participants.some(p => p.userId === userId)) throw new GroupApiError('GROUP_INVALID_RESPONSE');
      return { session, serverNowMs: data.serverNowMs as number };
    },
    create: (title: string, displayName: string) => mutation('training_group_v1', 'create', { title: title.trim(), displayName: displayName.trim() }, 'groupId'),
    invite: (groupId: string, recipientUserId: string) => mutation('training_group_v1', 'invite', { groupId, recipientUserId, ttlSeconds: 86400 }, 'invitationId'),
    accept: (invitationId: string, displayName: string) => mutation('training_group_v1', 'accept', { invitationId, displayName: displayName.trim() }),
    leave: (groupId: string, membershipId: string) => mutation('training_group_v1', 'leave', { groupId, membershipId }),
    close: (groupId: string) => mutation('training_group_v1', 'close', { groupId }),
    open: (groupId: string, title: string, dogId: string, ttlSeconds: number) => mutation('training_group_session_v1', 'open', { groupId, title: title.trim(), dogId, ttlSeconds }, 'sessionId'),
    join: (sessionId: string, dogId: string) => mutation('training_group_session_v1', 'join', { sessionId, dogId }, 'participationId'),
    leaveSession: (sessionId: string, participationId: string) => mutation('training_group_session_v1', 'leave', { sessionId, participationId }),
    end: (sessionId: string) => mutation('training_group_session_v1', 'end', { sessionId }),
  };
}
