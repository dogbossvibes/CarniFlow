import { supabase } from '@/lib/supabase';
import { applyRemoteLocale, getLocale, setRemotePersist, type AppLocale } from '@/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Optionaler Profil-Sync der App-Sprache (Remote ⇄ App).
// Die Sprache lebt lokal in AsyncStorage und funktioniert auch ohne dieses Modul.
//
// WICHTIG (keine DB-Migration): Die Spalte `profiles.locale` hat aktuell einen
// CHECK auf ('de-CH','de-DE','gsw-CH'). Wir schreiben deshalb DB-kompatible
// Legacy-Werte (de → de-CH, gsw → gsw-CH). Für `fr` gibt es noch keinen erlaubten
// Wert → bleibt vorerst lokal (kein Remote-Write, kein Crash). Beim Lesen werden
// Legacy-Werte normalisiert (de-CH → de, gsw-CH → gsw, …).
// ─────────────────────────────────────────────────────────────────────────────
export const LOCALE_SYNC_ENABLED = true;

// AppLocale → DB-erlaubter Legacy-Wert (oder null, wenn nicht speicherbar).
function toDbLocale(locale: AppLocale): string | null {
  if (locale === 'de')  return 'de-CH';
  if (locale === 'gsw') return 'gsw-CH';
  return null; // fr (und künftige) noch nicht im DB-CHECK → nicht schreiben
}

export async function initLocaleSync(userId: string | null | undefined) {
  if (!LOCALE_SYNC_ENABLED || !userId) return;
  try {
    const { data } = await supabase.from('profiles').select('locale').eq('id', userId).single();
    const remote = data?.locale as string | undefined;
    if (remote) applyRemoteLocale(remote); // normalisiert Legacy- & neue Werte
  } catch { /* Spalte fehlt o. Ä. → lokal bleiben */ }

  // Künftige Wechsel zusätzlich ins Profil schreiben (nur DB-kompatible Werte).
  setRemotePersist((locale) => {
    const dbValue = toDbLocale(locale);
    if (!dbValue) return; // z. B. fr → vorerst nur lokal
    supabase.from('profiles').update({ locale: dbValue }).eq('id', userId).then(
      () => { /* ok */ },
      () => { /* best-effort */ },
    );
  });
}

export function stopLocaleSync() {
  setRemotePersist(null);
}

export function currentLocale(): AppLocale {
  return getLocale();
}
