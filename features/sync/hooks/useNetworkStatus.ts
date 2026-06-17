import { useEffect, useState } from 'react';
import { useSyncStore } from '@/features/sync/store/syncStore';
import { addNetListener } from '@/features/sync/services/netinfo';
import type { NetworkStatus } from '@/features/sync/types/sync';

// Netzwerkstatus via NetInfo (defensiv geladen — siehe services/netinfo.ts).
// Spiegelt isOnline in den syncStore. Reconnect-Sync zentral im SyncProvider.
export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isConnected: true, isInternetReachable: true, connectionType: null, isOffline: false,
  });
  const setOnlineStatus = useSyncStore(s => s.setOnlineStatus);

  useEffect(() => {
    const unsub = addNetListener(({ online, type }) => {
      setStatus({ isConnected: online, isInternetReachable: online, connectionType: type, isOffline: !online });
      setOnlineStatus(online);
    });
    return () => { try { unsub(); } catch { /* egal */ } };
  }, [setOnlineStatus]);

  return status;
}
