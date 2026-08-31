import { supabase } from '@/lib/supabase';
import { applyRemoteLocale, getLocale, setRemotePersist, type AppLocale } from '@/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Optionaler Profil-Sync der App-Sprache (Remote ⇄ App).
// Die Sprache lebt lokal in AsyncStorage und funktioniert auch ohne dieses Modul.
//
// Die Spalte `profiles.locale` hat einen CHECK auf die erlaubten Locale-Codes
// (Migrationen 20260824120000/20260825120000, bereits auf Production angewendet).
// Wir schreiben DB-kompatible Legacy-/App-Werte (de → de-CH, gsw → gsw-CH,
// fr → fr-CH, it → it-CH, en → en-GB). Beim Lesen werden Legacy-Werte
// normalisiert (de-CH → de, gsw-CH → gsw, …).
// ─────────────────────────────────────────────────────────────────────────────
export const LOCALE_SYNC_ENABLED = true;

// AppLocale → DB-erlaubter Legacy-Wert (oder null, wenn nicht speicherbar).
function toDbLocale(locale: AppLocale): string | null {
  if (locale === 'de')  return 'de-CH';
  if (locale === 'gsw') return 'gsw-CH';
  if (locale === 'fr')  return 'fr-CH';
  if (locale === 'it')  return 'it-CH';
  if (locale === 'en')  return 'en-GB';
  return null;
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
    if (!dbValue) return;
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
