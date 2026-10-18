import { useEffect, useState } from 'react';
import { listConnectedInviteTargets } from './connectedInviteTargets';
/** Reuses existing accepted connections; never broadens profile lookup or creates a connection. */
export function useConnectedInviteTargets(userId: string | null, revision: number) {
  const [state, setState] = useState<{ userId: string; targets: { userId: string; displayName: string | null }[] } | null>(null);
  useEffect(() => {
    let current = true; setState(null);
    if (userId) void listConnectedInviteTargets(userId)
      .then(targets => {
        if (!current) return;
        setState({ userId, targets });
      }).catch(() => { if (current) setState(null); });
    return () => { current = false; };
  }, [userId, revision]);
  return state?.userId === userId ? state.targets : [];
}
