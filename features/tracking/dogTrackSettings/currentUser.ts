// Fährten-Einstellungen für Bildschirme, die bewusst ohne Supabase-Initialisierung
// laden (Liegezeit): Konto und Speicher werden erst bei Bedarf nachgeladen.
// Best-effort: jeder Fehler liefert «keine Einstellungen» (bisheriges Verhalten).
import type { DogTrackSettings } from './model';

export async function loadDogTrackSettingsForCurrentUser(dogId: string | null | undefined): Promise<DogTrackSettings> {
  if (!dogId) return {};
  try {
    /* eslint-disable @typescript-eslint/no-require-imports -- bewusst verzögert geladen */
    const { supabase } = require('@/lib/supabase') as typeof import('@/lib/supabase');
    const { dogTrackSettingsStore } = require('./index') as typeof import('./index');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return {};
    const cached = await dogTrackSettingsStore.loadCached(userId, dogId);
    const loaded = await Promise.race([
      dogTrackSettingsStore.load(userId, dogId).then(r => r.settings),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 4000)),
    ]);
    return loaded ?? cached;
  } catch { return {}; }
}
