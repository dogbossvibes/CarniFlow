import { isLiveShareReleaseReady } from './releaseGate';
import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { LiveShareViewLease } from './liveShareLease';
import { parseLivePosition, values, type LivePeerPosition } from '../groups/groupModels';
import { GroupApiError, type createGroupRpcClient } from '../groups/groupRpc';
type GroupClient = ReturnType<typeof createGroupRpcClient>;

/** Foreground screen-only polling; every snapshot is a fresh server authorization.
 * Separate 1s expiry timer clears the map even when the network request is stuck.
 */
export function useGroupLivePositions(userId: string | null, sessionId: string | null, client: GroupClient) {
  const [view, setView] = useState<{ userId: string; sessionId: string; positions: LivePeerPosition[]; unavailable: boolean } | null>(null);
  useEffect(() => {
    setView(null);
    if (!isLiveShareReleaseReady() || !userId || !sessionId) return;
    const lease = new LiveShareViewLease(() => performance.now());
    let alive = true, generation = 0, physicalRequest = false, online = true;
    let pending: AbortController | null = null;
    let next: ReturnType<typeof setTimeout> | null = null;
    let leaseExpiry: ReturnType<typeof setTimeout> | null = null;
    const clear = (unavailable: boolean) => {
      generation++; lease.clear();
      if (leaseExpiry) clearTimeout(leaseExpiry); leaseExpiry = null;
      pending?.abort(); pending = null;
      if (next) clearTimeout(next); next = null;
      if (alive) setView({ userId, sessionId, positions: [], unavailable });
    };
    const refresh = async () => {
      if (!alive || !online || AppState.currentState !== 'active' || physicalRequest) return;
      if (next) clearTimeout(next); next = null;
      const token = generation;
      const requestedAt = performance.now();
      const request = lease.beginRefresh();
      const aborter = new AbortController(); pending = aborter; physicalRequest = true;
      try {
        const data = await client.call(userId, 'training_group_live_v1', 'snapshot', { sessionId }, aborter.signal);
        if (!alive || generation !== token || AppState.currentState !== 'active') return;
        if (data.leaseMs !== 5000) throw new GroupApiError('GROUP_INVALID_RESPONSE');
        const serverNow = data.serverNowMs as number;
        const positions = values(data.positions, p => parseLivePosition(p, sessionId, serverNow), 49);
        if (new Set(positions.map(p => p.shareId)).size !== positions.length) throw new GroupApiError('GROUP_INVALID_RESPONSE');
        const expires = Math.min(serverNow + 5000, ...positions.map(p => p.expiresAtMs));
        if (!lease.acceptRefresh(request, positions, serverNow, expires)) throw new GroupApiError('GROUP_INVALID_RESPONSE');
        setView({ userId, sessionId, positions, unavailable: false });
        if (leaseExpiry) clearTimeout(leaseExpiry);
        // Expire at the lease deadline, not at the next coarse polling tick.
        // Reading an expired lease must not cancel a newer in-flight refresh.
        const remaining = Math.max(0, Math.min(5000, expires - serverNow) - (performance.now() - requestedAt));
        leaseExpiry = setTimeout(() => {
          lease.read();
          if (alive) setView(v => v ? { ...v, positions: [], unavailable: true } : v);
        }, remaining);
      } catch {
        if (alive && generation === token) clear(true);
      } finally {
        physicalRequest = false;
        if (pending === aborter) pending = null;
        if (alive && online && AppState.currentState === 'active') next = setTimeout(() => { void refresh(); }, 2000);
      }
    };
    const listener = AppState.addEventListener('change', state => {
      if (state !== 'active') clear(false);
      else void refresh();
    });
    const network = NetInfo.addEventListener(status => {
      if (status.isConnected === false || status.isInternetReachable === false) { online = false; clear(true); }
      else if (status.isConnected === true) { online = true; void refresh(); }
    });
    const expiry = setInterval(() => {
      if (!lease.read().length) setView(current => current?.positions.length
        ? { ...current, positions: [], unavailable: true } : current);
    }, 1000);
    void refresh();
    return () => { alive = false; clear(false); clearInterval(expiry); listener.remove(); network(); };
  }, [userId, sessionId, client]);
  return isLiveShareReleaseReady() && view?.userId === userId && view.sessionId === sessionId ? view
    : { userId, sessionId, positions: [] as LivePeerPosition[], unavailable: false };
}
