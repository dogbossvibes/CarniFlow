import { useEffect } from 'react';
import { AppState } from 'react-native';
import type { NetInfoState } from '@react-native-community/netinfo';
import { retryPendingSubscriptionSync } from '@/services/subscriptionAuthorityService';
import { onPendingSubscriptionSync } from '@/services/pendingSubscriptionSync';

/** One observer per signed-in session, rather than one per capability consumer. */
export function useSubscriptionSyncRecovery(uid: string | undefined) {
  useEffect(() => {
    if (!uid) return;
    let active = true;
    let running = false;
    let wasConnected: boolean | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const recover = async () => {
      if (!active || running || wasConnected === false || AppState.currentState !== 'active') return;
      running = true;
      clearTimeout(timer);
      try {
        const retryAt = await retryPendingSubscriptionSync(uid);
        if (active && retryAt !== null && AppState.currentState === 'active') {
          timer = setTimeout(() => { void recover(); }, Math.max(1000, Math.min(60_000, retryAt - Date.now())));
        }
      } catch { /* Foreground/connectivity can retry later. */ }
      finally { running = false; }
    };
    const app = AppState.addEventListener('change', state => {
      if (state === 'active') void recover();
      else clearTimeout(timer);
    });
    let network = () => {};
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- foreground retry also works without the native observer (web/dev).
      const NetInfo = require('@react-native-community/netinfo').default;
      network = NetInfo.addEventListener((state: NetInfoState) => {
        const connected = state.isConnected === true && state.isInternetReachable !== false;
        const reconnect = connected && wasConnected === false;
        wasConnected = connected;
        if (reconnect) void recover();
        if (!connected) clearTimeout(timer);
      });
    } catch { /* Keep session/foreground/timer recovery available. */ }
    const pending = onPendingSubscriptionSync(account => { if (account === uid) void recover(); });
    void recover();
    return () => { active = false; clearTimeout(timer); app.remove(); network(); pending(); };
  }, [uid]);
}
