// QA-Diagnosemodus für die Fährtenaufzeichnung (Default AUS).
//
// Schaltet ausschliesslich BEOBACHTENDE Zusatzfunktionen frei:
//   • die Anzeige der tatsächlich aktiven Engine/Source im Lege-Screen,
//   • das Mitschreiben von Kandidaten-Diagnosezeilen,
//   • den Core-Motion-Mitschnitt beim Legen (nur ENGINE=CURRENT).
//
// Er verändert NIE die Erkennung: keine Kandidaten, keine Confidence, keine
// GPS-Quelle, keine Distanz. Ist er aus, verhält sich die App exakt wie zuvor.
//
// Dasselbe Muster wie locationSourceMode.ts/trackingEngineMode.ts, damit es nur
// EINE Art von QA-Einstellung gibt — keine zweite Settings-Architektur.
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'anyvo.qa.diagnosticsMode';
const DEFAULT_ENABLED = false;

let enabled = DEFAULT_ENABLED;
let loaded = false;
const listeners = new Set<(on: boolean) => void>();

export function isQaDiagnosticsEnabled(): boolean {
  return enabled;
}

export function setQaDiagnosticsEnabled(on: boolean): void {
  enabled = on;
  listeners.forEach(fn => fn(on));
  AsyncStorage.setItem(STORAGE_KEY, on ? 'true' : 'false').catch(() => {});
}

export function subscribeQaDiagnostics(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function loadPersistedQaDiagnostics(): Promise<boolean> {
  if (loaded) return enabled;
  loaded = true;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === 'true' || stored === 'false') {
      enabled = stored === 'true';
      listeners.forEach(fn => fn(enabled));
    }
  } catch { /* Default bleibt aktiv */ }
  return enabled;
}
