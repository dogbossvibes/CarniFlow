import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform, Settings } from 'react-native';
import { useRootNavigationState, useRouter } from 'expo-router';
import { useSession } from '@/hooks/useSession';
import { PENDING_INTENT_ROUTE_KEY, consumePendingIntentRoute } from '@/features/appIntents/pendingIntentRoute';

/**
 * Übernimmt das von einem App Intent (Siri/Kurzbefehl/Action Button) hinterlegte Ziel und
 * öffnet die feste Expo-Route GENAU EINMAL — erst wenn Navigation bereit und die Session
 * geladen ist (kein Rennen gegen den Router-Start, keine verlorene Route beim Kaltstart).
 *
 * Quellen: Start-Snapshot (Kaltstart), Settings-Änderungs-Event (App läuft) und Rückkehr in
 * den Vordergrund (Hintergrund). Kein UI, iOS-only.
 */
export function AppIntentRouteHandler() {
  const router = useRouter();
  const navState = useRootNavigationState();
  const { session, loading } = useSession();
  const navReady = !!navState?.key;
  const canNavigate = Platform.OS === 'ios' && navReady && !loading && !!session;
  const lastId = useRef<string | null>(null);

  const check = useCallback(() => {
    if (!canNavigate) return;   // Eintrag bleibt liegen (TTL), bis Navigation + Anmeldung bereit sind
    const hit = consumePendingIntentRoute(Settings, Date.now(), lastId.current);
    if (!hit) return;
    lastId.current = hit.id;
    router.navigate(hit.path as never);
  }, [canNavigate, router]);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    check();
    const watchId = Settings.watchKeys([PENDING_INTENT_ROUTE_KEY], check);
    const sub = AppState.addEventListener('change', s => { if (s === 'active') check(); });
    return () => { Settings.clearWatch(watchId); sub.remove(); };
  }, [check]);

  return null;
}
