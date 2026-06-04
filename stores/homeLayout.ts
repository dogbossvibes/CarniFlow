import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Welche Abschnitte auf dem Startbildschirm sichtbar sind. Vom Nutzer im
// Profil → „Startbildschirm" wählbar, persistiert über AsyncStorage.
// Der Hero/Begrüßungs-Block bleibt immer sichtbar (Identität des Screens).

export interface HomeLayout {
  woche:           boolean;  // Wochenübersicht
  hauptaktionen:   boolean;  // Training starten / Dokumentieren
  letzteEinheiten: boolean;  // Letzte Einheiten
  hunde:           boolean;  // Meine Hunde
  schnellzugriff:  boolean;  // Schnellzugriff
}

export const HOME_SECTIONS: { key: keyof HomeLayout; label: string; beschreibung: string }[] = [
  { key: 'woche',           label: 'Wochenübersicht',   beschreibung: 'Trainingstage dieser Woche' },
  { key: 'hauptaktionen',   label: 'Hauptaktionen',     beschreibung: 'Training starten & Dokumentieren' },
  { key: 'letzteEinheiten', label: 'Letzte Einheiten',  beschreibung: 'Deine zuletzt erfassten Einheiten' },
  { key: 'hunde',           label: 'Meine Hunde',       beschreibung: 'Übersicht deiner Hunde' },
  { key: 'schnellzugriff',  label: 'Schnellzugriff',    beschreibung: 'Direktlinks zu häufigen Aktionen' },
];

const DEFAULT: HomeLayout = {
  woche:           true,
  hauptaktionen:   true,
  letzteEinheiten: true,
  hunde:           true,
  schnellzugriff:  true,
};

const STORAGE_KEY = 'home_layout';

let state: HomeLayout = DEFAULT;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

// Einmaliges Hydrieren aus AsyncStorage beim ersten Import.
AsyncStorage.getItem(STORAGE_KEY)
  .then(raw => {
    if (raw) {
      try { state = { ...DEFAULT, ...JSON.parse(raw) }; } catch { /* defekt → Default */ }
      emit();
    }
  })
  .catch(() => { /* Default behalten */ });

export function setHomeSection(key: keyof HomeLayout, value: boolean) {
  state = { ...state, [key]: value };
  emit();
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => { /* best-effort */ });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return state;
}

export function useHomeLayout(): HomeLayout {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
