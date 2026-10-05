import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSession } from '@/hooks/useSession';
import { useDogs } from '@/hooks/useDogs';
import { useT } from '@/i18n';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import { reconcileRestingActivities } from '@/features/tracking/native/restingActivityReconcile';

/**
 * Hält die Liegezeit-Live-Activities (iOS) mit der Active-Track-Registry in Einklang —
 * beim Start (Registry hydriert) und bei jeder Rückkehr in den Vordergrund. Kein UI,
 * kein Timer, kein Polling. Neue Activities nur für Hunde des angemeldeten Nutzers.
 */
export function RestingLiveActivitySync() {
  const { session } = useSession();
  const { dogs, loading, error } = useDogs();
  const hydrated = useActiveFaehrten(s => s.hydrated);
  const { t } = useT();
  const userId = session?.user.id ?? null;
  const dogsReady = !!userId && !loading && !error;

  useEffect(() => {
    if (!hydrated) return;
    const run = () => void reconcileRestingActivities({
      ownDogs: dogsReady ? dogs.map(d => ({ id: d.id, name: d.name })) : null,
      labels: {
        lying: t('track.liveActivity.lying'), since: t('track.liveActivity.since'), fallbackTitle: t('track.liveActivity.fallbackTitle'),
      },
    });
    run();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') run(); });
    return () => sub.remove();
  }, [hydrated, dogsReady, dogs, t]);

  return null;
}
