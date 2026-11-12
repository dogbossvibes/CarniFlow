import { useEffect, useState } from 'react';
import { listConnections, PERSON_CONNECTION_TYPE } from '@/services/connectionService';
/** Reuses existing accepted connections; never broadens profile lookup or creates a connection. */
export function useConnectedInviteTargets(userId: string | null, revision: number) {
  const [state, setState] = useState<{ userId: string; targets: { userId: string; displayName: string | null }[] } | null>(null);
  useEffect(() => {
    let current = true; setState(null);
    if (userId) void Promise.all([listConnections(userId), listConnections(userId, PERSON_CONNECTION_TYPE)])
      .then(results => {
        if (!current) return;
        const targets = new Map<string, { userId: string; displayName: string | null }>();
        for (const row of results.flat()) if (row.status === 'accepted' && row.counterpartId !== userId
          && (row.owner_user_id === userId || row.connected_user_id === userId)) {
          targets.set(row.counterpartId, { userId: row.counterpartId, displayName: row.counterpartName ?? row.counterpartUsername ?? null });
        }
        setState({ userId, targets: [...targets.values()] });
      }).catch(() => { if (current) setState(null); });
    return () => { current = false; };
  }, [userId, revision]);
  return state?.userId === userId ? state.targets : [];
}
