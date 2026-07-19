import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { de } from './locales/de';
import { gsw } from './locales/gsw';
import { fr } from './locales/fr';

// expo-localization DEFENSIV laden (gleiches Muster wie expo-haptics/-sensors).
// Ein statischer `import ... from 'expo-localization'` wirft beim Modul-Import,
// wenn das native Modul (ExpoLocalization) fehlt/nicht gelinkt ist — und würde
// die gesamte Boot-Kette (config → i18n → localeSync → session-context →
// _layout) sprengen und die App am Splash festhängen lassen. Lazy require in
// try/catch → fehlt das Modul, fällt die Spracherkennung still auf de zurück.
function readDeviceLocaleTag(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Localization = require('expo-localization') as typeof import('expo-localization');
    const first = Localization.getLocales?.()?.[0];
    return first?.languageTag ?? first?.languageCode ?? '';
  } catch {
    if (__DEV__) console.warn('[boot] expo-localization unavailable – fallback to de');
    return '';
  }
}

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
  const norm = normalizeLocale(readDeviceLocaleTag());
  return norm === 'gsw' ? 'de' : norm;
}

// Synchrone Init mit gebündelten Ressourcen. Startsprache = Gerätesprache
// (entspricht „Automatisch"); eine gespeicherte manuelle Wahl wird danach in
// i18n/index.ts asynchron aus AsyncStorage nachgezogen.
if (!i18n.isInitialized) {
  // Die Init läuft beim Modul-Import (Boot-Kette: _layout → session-context →
  // localeSync → i18n). Sie darf NIEMALS werfen — ein Fehler hier würde den
  // gesamten Root-Import scheitern lassen und die App am nativen Splash
  // festhängen (kein sichtbarer Crash). Deshalb defensiv gekapselt: schlägt die
  // Init fehl, startet die App trotzdem (Übersetzungen fallen auf Keys/Fallback
  // zurück), statt am Splash zu blockieren.
  try {
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
  } catch (e) {
    if (__DEV__) console.warn('[boot] i18n init failed', e);
  }
}

export default i18n;
