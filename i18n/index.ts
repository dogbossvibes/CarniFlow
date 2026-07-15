import { useCallback } from 'react';
import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n, {
  type AppLocale,
  APP_LOCALES,
  normalizeLocale,
  detectDeviceLocale,
} from './config';
import type { TranslationKey as BaseKey } from './de-CH';

// ── Öffentliche i18n-API für Anyvo (react-i18next-basiert) ──
// Rückwärtskompatibel: useT()/translate()/getLocale() bleiben erhalten, damit
// bestehende Consumer unverändert weiterlaufen.

export type { AppLocale };
export { detectDeviceLocale, normalizeLocale } from './config';
export type LanguagePreference = 'auto' | AppLocale;

// Plural-Referenzkeys (nicht Teil des Basis-Dictionaries).
export type PluralKey = 'trainingCount' | 'minuteCount' | 'articleCount';
export type TranslationKey = BaseKey | PluralKey;

// Kompat-Alias für Altimporte.
export type Locale = AppLocale;

// Native Sprachnamen (in ihrer eigenen Sprache dargestellt).
export const NATIVE_NAME: Record<AppLocale, string> = {
  de:  'Deutsch',
  gsw: 'Schwiizerdütsch',
  fr:  'Français',
};

const STORAGE_KEY = 'app_locale';

// ── Preference-Store (Quelle der Wahrheit für die Auswahl) ──
let preference: LanguagePreference = 'auto';
const listeners = new Set<() => void>();
function emit() { for (const l of listeners) l(); }
function subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb); }
function getPreferenceSnapshot() { return preference; }

// Optionaler Remote-Persister (Profil-Sync, via services/localeSync.ts).
let remotePersist: ((l: AppLocale) => void) | null = null;
export function setRemotePersist(fn: ((l: AppLocale) => void) | null) { remotePersist = fn; }

function resolve(pref: LanguagePreference): AppLocale {
  return pref === 'auto' ? detectDeviceLocale() : pref;
}

// Legacy-/neue Speicherwerte auf eine gültige Preference normalisieren.
// 'auto' bleibt 'auto'; 'de-CH'/'de-DE'/'de' → 'de'; 'gsw-CH'/'gsw' → 'gsw'; 'fr*' → 'fr'.
function parseStoredPreference(raw: string): LanguagePreference {
  if (raw === 'auto') return 'auto';
  return normalizeLocale(raw);
}

function applyPreference(pref: LanguagePreference, opts: { persist?: boolean; remote?: boolean } = {}) {
  const { persist = true, remote = true } = opts;
  preference = pref;
  const resolved = resolve(pref);
  if (i18n.language !== resolved) i18n.changeLanguage(resolved);
  emit();
  if (persist) AsyncStorage.setItem(STORAGE_KEY, pref).catch(() => { /* best-effort */ });
  if (remote) remotePersist?.(resolved);
}

// Einmaliges Hydrieren aus AsyncStorage. Bis dahin gilt die Gerätesprache
// (in config.ts als Startsprache gesetzt) — entspricht „Automatisch".
AsyncStorage.getItem(STORAGE_KEY)
  .then(raw => {
    if (raw) applyPreference(parseStoredPreference(raw), { persist: false, remote: false });
  })
  .catch(() => { /* Gerätesprache behalten */ });

// ── Öffentliche Funktionen ──

// Aktuell aufgelöste Sprache (für Nicht-React-Code).
export function getLocale(): AppLocale { return i18n.language as AppLocale; }

// Aktuelle Auswahl-Preference.
export function getPreference(): LanguagePreference { return preference; }

// Manuelle Auswahl (überschreibt Automatisch), persistiert lokal + remote.
export function setPreference(pref: LanguagePreference) {
  if (pref !== 'auto' && !APP_LOCALES.includes(pref)) return;
  applyPreference(pref, { persist: true, remote: true });
}

// Aus dem Profil übernommene Sprache (Remote → App), OHNE Rück-Sync (kein Loop).
export function applyRemoteLocale(raw: string) {
  applyPreference(normalizeLocale(raw), { persist: true, remote: false });
}

// Kern-Übersetzung ausserhalb von React. Fehlender Key → de-Fallback (nie leer/Key/Crash).
export function translate(
  key: TranslationKey,
  params?: Record<string, string | number>,
  locale?: AppLocale,
): string {
  return i18n.t(key, { lng: locale, ...(params ?? {}) }) as string;
}

// Reaktiver Hook: `t` (an aktuelle Sprache gebunden) + Locale + Preference.
export function useT() {
  const { t: i18t } = useTranslation();
  const pref = useSyncExternalStore(subscribe, getPreferenceSnapshot, getPreferenceSnapshot);
  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => i18t(key, params) as string,
    [i18t],
  );
  return {
    t,
    locale: i18n.language as AppLocale,
    preference: pref,
    setPreference,
  };
}
