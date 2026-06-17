import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useNetworkStatus } from '@/features/sync/hooks/useNetworkStatus';
import { useSyncStore } from '@/features/sync/store/syncStore';
import { syncNow, updateSyncCounts } from '@/features/sync/services/syncEngine';
import { getLocalDb } from '@/lib/localDb/client';

// Zentrale Sync-Steuerung: App-Start, Reconnect (debounced), Vordergrund.
// Wird einmal in der App-Wurzel gerendert (kein UI).
export function SyncProvider() {
  const net = useNetworkStatus();
  const online = !net.isOffline;
  const wasOnline = useRef(online);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerSync = (delay = 1500) => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { syncNow().catch(() => {}); }, delay);
  };

  // App-Start: DB init + Counts + (falls online) Sync.
  useEffect(() => {
    (async () => {
      try { await getLocalDb(); await updateSyncCounts(); } catch { /* DB nur im Dev-/Store-Build */ }
      if (useSyncStore.getState().isOnline) triggerSync(800);
    })();
  }, []);

  // Reconnect: offline → online ⇒ Sync.
  useEffect(() => {
    if (!wasOnline.current && online) triggerSync();
    wasOnline.current = online;
  }, [online]);

  // Vordergrund: Sync nachziehen.
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active' && useSyncStore.getState().isOnline) triggerSync(1000);
    });
    return () => sub.remove();
  }, []);

  return null;
}
