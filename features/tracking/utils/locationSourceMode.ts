// QA-A/B-Schalter LEGACY/PRECISION (Build-43-Feldtest-Audit).
//
// LEGACY erzwingt exakt den alten, auf echtem iPhone nachweislich
// funktionierenden Pfad (Build 40, Commit 82bd17c): reines expo-location,
// {accuracy: BestForNavigation, timeInterval: 1000, distanceInterval: 0} —
// AnyvoPrecisionLocation wird dabei NICHT gestartet. PRECISION ist der
// heutige native Pfad (Default, unverändertes Verhalten).
//
// Bewusst NUR ein Schalter für die GPS-QUELLE — Glättung (EMA_ALPHA/
// SMOOTH_ALPHA), Distanz-Gates (MIN_STEP_M/MIN_SEGMENT), Search-Start-
// Acquisition und Corner-Detection bleiben in BEIDEN Modi exakt identisch
// (useTrackRecorder/useSearchRecorder kennen den Modus nicht — nur
// positionSource.ts liest ihn). So ist ein Feldtest am selben Ort ein
// reiner GPS-Quellen-Vergleich, kein Vergleich unterschiedlicher Algorithmen.
//
// Persistiert (AsyncStorage), damit ein einmal für einen Feldtest gesetzter
// Modus einen App-Neustart übersteht — echte Feldtests laufen typischerweise
// über App-Neustarts zwischen Legen/Ansatz/Absuche hinweg.
import AsyncStorage from '@react-native-async-storage/async-storage';

export type LocationSourceMode = 'legacy' | 'precision';

const STORAGE_KEY = 'anyvo.qa.locationSourceMode';
const DEFAULT_MODE: LocationSourceMode = 'precision';

let currentMode: LocationSourceMode = DEFAULT_MODE;
let loaded = false;
const listeners = new Set<(mode: LocationSourceMode) => void>();

function isValidMode(v: unknown): v is LocationSourceMode {
  return v === 'legacy' || v === 'precision';
}

// Synchron nutzbar (Default bis der persistierte Wert geladen ist) — der
// GPS-Start selbst ist ohnehin async, ein einmaliges Nachladen beim
// App-Start reicht (siehe loadPersistedLocationSourceMode).
export function getLocationSourceMode(): LocationSourceMode {
  return currentMode;
}

export function setLocationSourceMode(mode: LocationSourceMode): void {
  currentMode = mode;
  listeners.forEach(fn => fn(mode));
  AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => {});
}

export function subscribeLocationSourceMode(fn: (mode: LocationSourceMode) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Einmal beim App-Start aufrufen (z. B. root layout) — best-effort, kein
// Fehler blockiert irgendetwas; ohne Aufruf bleibt einfach der Default.
export async function loadPersistedLocationSourceMode(): Promise<LocationSourceMode> {
  if (loaded) return currentMode;
  loaded = true;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (isValidMode(stored)) {
      currentMode = stored;
      listeners.forEach(fn => fn(currentMode));
    }
  } catch { /* Default bleibt aktiv */ }
  return currentMode;
}
