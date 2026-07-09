import { supabase } from '@/lib/supabase';
import { applyRemoteLocale, getLocale, setRemotePersist, type Locale } from '@/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Optionaler Profil-Sync der App-Sprache (Remote ⇄ App).
// STANDARD: AUS. Die Sprache lebt lokal in AsyncStorage und funktioniert ohne
// dieses Modul vollständig. Erst nach dem Ausführen von SUPABASE_USER_LOCALE.sql
// (Spalte profiles.locale) und dem Umlegen des Flags unten wird synchronisiert.
// ─────────────────────────────────────────────────────────────────────────────
export const LOCALE_SYNC_ENABLED = true;

const VALID: Locale[] = ['de-CH', 'de-DE', 'gsw-CH'];

// Beim Login aufrufen: lädt die Profil-Sprache (falls vorhanden) und registriert
// das Zurückschreiben bei künftigen Sprachwechseln. No-op, solange deaktiviert.
export async function initLocaleSync(userId: string | null | undefined) {
  if (!LOCALE_SYNC_ENABLED || !userId) return;
  try {
    const { data } = await supabase.from('profiles').select('locale').eq('id', userId).single();
    const remote = data?.locale as string | undefined;
    if (remote && (VALID as string[]).includes(remote)) applyRemoteLocale(remote as Locale);
  } catch { /* Spalte fehlt o. Ä. → lokal bleiben */ }

  // Künftige Wechsel zusätzlich ins Profil schreiben.
  setRemotePersist((locale) => {
    supabase.from('profiles').update({ locale }).eq('id', userId).then(
      () => { /* ok */ },
      () => { /* best-effort */ },
    );
  });
}

// Beim Logout: Remote-Persister wieder entfernen.
export function stopLocaleSync() {
  setRemotePersist(null);
}

// Aktuelle Sprache (Convenience, falls ausserhalb von React benötigt).
export function currentLocale(): Locale {
  return getLocale();
}
