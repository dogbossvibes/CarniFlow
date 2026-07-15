import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import { de } from './locales/de';
import { gsw } from './locales/gsw';
import { fr } from './locales/fr';

// ── i18next-Konfiguration für Anyvo ──
// Basissprache/Fallback = de. Sprachen: de, gsw, fr (später it, en).
// Ressourcen sind gebündelt (.ts) → offline-first, kein Netzwerk-Load.

export type AppLocale = 'de' | 'gsw' | 'fr';
export const APP_LOCALES: AppLocale[] = ['de', 'gsw', 'fr'];
export const FALLBACK_LOCALE: AppLocale = 'de';

// Beliebige (auch Legacy-)Locale-Strings auf die interne AppLocale normalisieren.
// de-CH/de-DE/de → de · gsw-CH/gsw → gsw · fr-CH/fr-FR/fr → fr · sonst → de.
export function normalizeLocale(raw: string | null | undefined): AppLocale {
  const s = (raw ?? '').toLowerCase();
  if (s.startsWith('fr')) return 'fr';
  if (s.startsWith('gsw')) return 'gsw';
  if (s.startsWith('de')) return 'de';
  return 'de';
}

// Gerätesprache erkennen. WICHTIG: Schweizerdeutsch wird NIEMALS automatisch
// aktiviert — ein gsw-Gerät fällt bewusst auf de zurück. Unbekannt → de.
export function detectDeviceLocale(): AppLocale {
  try {
    const first = getLocales?.()?.[0];
    const tag = first?.languageTag ?? first?.languageCode ?? '';
    const norm = normalizeLocale(tag);
    return norm === 'gsw' ? 'de' : norm;
  } catch {
    return 'de';
  }
}

// Synchrone Init mit gebündelten Ressourcen. Startsprache = Gerätesprache
// (entspricht „Automatisch"); eine gespeicherte manuelle Wahl wird danach in
// i18n/index.ts asynchron aus AsyncStorage nachgezogen.
if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      de:  { translation: de },
      gsw: { translation: gsw },
      fr:  { translation: fr },
    },
    lng: detectDeviceLocale(),
    fallbackLng: FALLBACK_LOCALE,
    supportedLngs: APP_LOCALES,
    returnNull: false,
    returnEmptyString: false,
    interpolation: {
      prefix: '{',                       // bestehende Keys nutzen {param}
      suffix: '}',
      escapeValue: false,                // RN braucht kein HTML-Escaping
    },
    saveMissing: __DEV__,
    missingKeyHandler: (lngs, _ns, key) => {
      if (__DEV__) console.warn('[i18n] fehlender Key:', key, '(' + lngs.join(',') + ')');
    },
    react: { useSuspense: false },
  });
}

export default i18n;
