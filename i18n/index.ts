import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deCH, type TranslationKey } from './de-CH';
import { deDE } from './de-DE';
import { gswCH } from './gsw-CH';

// ── Minimales, package-freies i18n für Anyvo ──
// Reaktiver globaler Store (useSyncExternalStore), persistiert per AsyncStorage.
// Kein neues Package. Muster analog stores/homeLayout.ts.

export type Locale = 'de-CH' | 'de-DE' | 'gsw-CH';
export type { TranslationKey };

// Standard, wenn nichts gewählt ist.
export const DEFAULT_LOCALE: Locale = 'de-CH';

// Auswahl-Metadaten für den Sprach-Screen (Reihenfolge = Anzeige-Reihenfolge).
export const LOCALES: { code: Locale; label: string; hint: string }[] = [
  { code: 'de-CH',  label: 'Deutsch Schweiz',     hint: 'Standard · ss-Schreibweise' },
  { code: 'gsw-CH', label: 'Schweizerdeutsch',    hint: 'Mundart · neutral & app-tauglich' },
  { code: 'de-DE',  label: 'Deutsch Deutschland', hint: 'ß-Schreibweise' },
];

const DICTS: Record<Locale, Partial<Record<TranslationKey, string>>> = {
  'de-CH':  deCH,
  'de-DE':  deDE,
  'gsw-CH': gswCH,
};

// Fallback-Ketten. Reihenfolge gemäss Vorgabe: gsw-CH → de-CH → de-DE.
// de-CH ist das vollständige Basis-Dictionary und deckt praktisch alles ab.
const FALLBACK: Record<Locale, Locale[]> = {
  'gsw-CH': ['gsw-CH', 'de-CH', 'de-DE'],
  'de-CH':  ['de-CH', 'de-DE'],
  'de-DE':  ['de-DE', 'de-CH'],
};

const STORAGE_KEY = 'app_locale';
const VALID: Locale[] = ['de-CH', 'de-DE', 'gsw-CH'];

let current: Locale = DEFAULT_LOCALE;
const listeners = new Set<() => void>();
function emit() { for (const l of listeners) l(); }

// Optionaler Remote-Persister (Profil-Sync). Wird von services/localeSync.ts
// registriert — nur wenn LOCALE_SYNC_ENABLED aktiv ist. Bis dahin: kein Effekt.
let remotePersist: ((l: Locale) => void) | null = null;
export function setRemotePersist(fn: ((l: Locale) => void) | null) { remotePersist = fn; }

// Einmaliges Hydrieren aus AsyncStorage beim ersten Import.
AsyncStorage.getItem(STORAGE_KEY)
  .then(raw => {
    if (raw && (VALID as string[]).includes(raw)) { current = raw as Locale; emit(); }
  })
  .catch(() => { /* Default behalten */ });

export function getLocale(): Locale { return current; }

export function setLocale(locale: Locale) {
  if (!VALID.includes(locale) || locale === current) return;
  current = locale;
  emit();
  AsyncStorage.setItem(STORAGE_KEY, locale).catch(() => { /* best-effort */ });
  remotePersist?.(locale);
}

// Sprache aus dem Profil übernehmen (Remote → App), OHNE erneut remote zu
// schreiben (verhindert Sync-Loop). Nutzt localeSync beim Login.
export function applyRemoteLocale(locale: Locale) {
  if (!VALID.includes(locale) || locale === current) return;
  current = locale;
  emit();
  AsyncStorage.setItem(STORAGE_KEY, locale).catch(() => { /* best-effort */ });
}

// Kern-Übersetzung: erste Sprache der Fallback-Kette, die den Key kennt.
// Ohne Treffer wird der Key selbst zurückgegeben (nie „leer" oder Absturz).
// Optionale Platzhalter: t('x.y', { dog: 'Rex' }) ersetzt {dog} im Text.
export function translate(key: TranslationKey, params?: Record<string, string | number>, locale: Locale = current): string {
  let out = key as string;
  for (const loc of FALLBACK[locale]) {
    const val = DICTS[loc][key];
    if (val != null) { out = val; break; }
  }
  if (params) for (const [k, v] of Object.entries(params)) out = out.replace(`{${k}}`, String(v));
  return out;
}

function subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb); }
function getSnapshot() { return current; }

// Reaktiver Hook: liefert `t` (an aktuelle Sprache gebunden) + aktuelle `locale`.
// Komponenten re-rendern automatisch, wenn die Sprache gewechselt wird.
export function useT() {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const t = (key: TranslationKey, params?: Record<string, string | number>) => translate(key, params, locale);
  return { t, locale, setLocale };
}
