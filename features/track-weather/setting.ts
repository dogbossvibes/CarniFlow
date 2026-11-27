import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Profil-Schalter «Fährtenwetter anzeigen». Standard: an. Aus = keine Karte,
// keine Hinweise, kein Wetterabruf für diese Funktion. Gerätebezogen gespeichert.
export const TRACK_WEATHER_SETTING_KEY = 'track_weather_enabled';

let enabled = true;
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export function parseTrackWeatherSetting(stored: string | null): boolean {
  return stored !== 'false';
}

function load(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (!loading) {
    loading = AsyncStorage.getItem(TRACK_WEATHER_SETTING_KEY)
      .then(v => { enabled = parseTrackWeatherSetting(v); })
      .catch(() => { /* Standard bleibt an */ })
      .finally(() => { loaded = true; emit(); });
  }
  return loading;
}

export async function setTrackWeatherEnabled(value: boolean): Promise<void> {
  enabled = value;
  loaded = true;
  emit();
  try { await AsyncStorage.setItem(TRACK_WEATHER_SETTING_KEY, value ? 'true' : 'false'); } catch { /* bleibt im Speicher */ }
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => (loaded ? (enabled ? 'on' : 'off') : 'loading');

/** { enabled, loaded, setEnabled } — alle Bildschirme sehen Änderungen sofort. */
export function useTrackWeatherSetting() {
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => { void load(); }, []);
  return { enabled: state === 'on', loaded: state !== 'loading', setEnabled: setTrackWeatherEnabled };
}

/** Nur für Tests. */
export function __resetTrackWeatherSettingForTests() {
  enabled = true; loaded = false; loading = null; listeners.clear();
}
