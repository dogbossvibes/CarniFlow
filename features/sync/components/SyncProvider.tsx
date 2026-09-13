import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useNetworkStatus } from '@/features/sync/hooks/useNetworkStatus';
import { useSyncStore } from '@/features/sync/store/syncStore';
import { syncNow, retryFailedSync, updateSyncCounts } from '@/features/sync/services/syncEngine';
import { getLocalDb } from '@/lib/localDb/client';

// Zentrale Sync-Steuerung: App-Start, Reconnect (debounced), Vordergrund.
// Wird einmal in der App-Wurzel gerendert (kein UI).
export function SyncProvider() {
  const net = useNetworkStatus();
  const online = !net.isOffline;
  const wasOnline = useRef(online);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `retryFailed`: fehlgeschlagene Queue-Items (status 'failed') EINMAL je
  // Auslöser wieder in den Retry-Pfad nehmen (failed → pending, attempts
  // bleiben gezählt) — beim App-Start und bei jedem Wechsel in den Vordergrund.
  // Vorher lief hier nur syncNow() (nur 'pending'); 'failed' blieb liegen, bis
  // jemand den Sync-Screen oder die Fährten-Startliste bediente.
  const triggerSync = (delay = 1500, retryFailed = false) => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { (retryFailed ? retryFailedSync() : syncNow()).catch(() => {}); }, delay);
  };

  // App-Start: DB init + Counts + (falls online) Sync inkl. Retry der Fehlgeschlagenen.
  useEffect(() => {
    (async () => {
      try { await getLocalDb(); await updateSyncCounts(); } catch { /* DB nur im Dev-/Store-Build */ }
      if (useSyncStore.getState().isOnline) triggerSync(800, true);
    })();
  }, []);

  // Reconnect: offline → online ⇒ Sync.
  useEffect(() => {
    if (!wasOnline.current && online) triggerSync();
    wasOnline.current = online;
  }, [online]);

  // Vordergrund: Sync nachziehen — inkl. einmaligem Retry der Fehlgeschlagenen.
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active' && useSyncStore.getState().isOnline) triggerSync(1000, true);
    });
    return () => sub.remove();
  }, []);

  return null;
}
