import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import { dogTrackSettingsStore, type DogTrackSettings } from '@/features/tracking/dogTrackSettings';

/**
 * Fährten-Einstellungen eines Hundes: zuerst die Gerätekopie (sofort, offline),
 * danach der Kontostand. `loaded` wird true, sobald die Gerätekopie gelesen ist.
 * Nie die Einstellungen eines anderen Hundes oder Kontos zurückgeben.
 */
export function useDogTrackSettings(dogId: string | null | undefined) {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const key = `${userId ?? ''}:${dogId ?? ''}`;
  const [state, setState] = useState<{ key: string; settings: DogTrackSettings; loaded: boolean }>({ key: '', settings: {}, loaded: false });
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const token = ++generation.current;
    const cached = await dogTrackSettingsStore.loadCached(userId, dogId);   // ohne Konto/Hund: {}
    if (token !== generation.current) return;
    setState({ key, settings: cached, loaded: true });
    if (!userId || !dogId) return;
    const { settings } = await dogTrackSettingsStore.load(userId, dogId);
    if (token !== generation.current) return;
    setState({ key, settings, loaded: true });
  }, [userId, dogId, key]);
  useEffect(() => {
    void reload();
    const ref = generation;
    return () => { ref.current++; };
  }, [reload]);
  const current = state.key === key ? state : { key, settings: {} as DogTrackSettings, loaded: false };
  return { settings: current.settings, loaded: current.loaded, userId, reload };
}
