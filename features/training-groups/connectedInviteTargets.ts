import { listConnections, listConnectionsStrict, PERSON_CONNECTION_TYPE } from '@/services/connectionService';
export async function listConnectedInviteTargets(userId: string, strict = false, signal?: AbortSignal) {
  const read = (type: string) => strict ? listConnectionsStrict(userId, type, signal) : listConnections(userId, type);
  const results = await Promise.all([read('trainer_client'), read(PERSON_CONNECTION_TYPE)]);
  const targets = new Map<string, { userId: string; displayName: string | null }>();
  for (const row of results.flat()) if (row.status === 'accepted' && row.counterpartId !== userId
    && (row.owner_user_id === userId || row.connected_user_id === userId)) {
    targets.set(row.counterpartId, { userId: row.counterpartId, displayName: row.counterpartName ?? row.counterpartUsername ?? null });
  }
  return [...targets.values()];
}
