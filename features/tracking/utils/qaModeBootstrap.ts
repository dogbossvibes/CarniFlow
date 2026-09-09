// Rehydrierung der QA-Einstellungen beim normalen App-Start.
//
// BEHOBENER FEHLER: `loadPersistedLocationSourceMode()` und
// `loadPersistedTrackingEngineMode()` wurden ausschliesslich im Diagnose-Screen
// aufgerufen. Der Modul-Zustand stand nach jedem App-Neustart wieder auf den
// Defaults (PRECISION + CURRENT), obwohl im Speicher z. B. EXPO + BUILD40 lag —
// ein QA-Feldtest lief damit unbemerkt in der falschen Konfiguration.
//
// Keine neue Settings-Architektur: dieselben drei bestehenden Module, nur an
// EINER zusätzlichen Stelle einmalig geladen (app/_layout.tsx, dasselbe
// Bootstrapping-Muster wie `useActiveFaehrten.hydrate()`).
import { loadPersistedLocationSourceMode } from '@/features/tracking/utils/locationSourceMode';
import { loadPersistedTrackingEngineMode } from '@/features/tracking/utils/trackingEngineMode';
import { loadPersistedQaDiagnostics } from '@/features/tracking/utils/qaDiagnosticsMode';

let pending: Promise<void> | null = null;

/**
 * Lädt alle persistierten QA-Einstellungen. Idempotent und billig: nach dem
 * ersten Aufruf wird dieselbe Promise zurückgegeben, die einzelnen Loader
 * haben zusätzlich ihr eigenes `loaded`-Flag.
 *
 * Bewusst awaitbar: der GPS-Start (`useTrackRecorder.startWarmup`) wartet
 * darauf, damit die Quelle garantiert aus dem persistierten Wert bestimmt wird
 * und nicht aus dem Default — auch dann, wenn der Nutzer sofort nach dem
 * App-Start eine Fährte beginnt.
 */
export function hydrateQaModes(): Promise<void> {
  if (!pending) {
    pending = Promise.all([
      loadPersistedLocationSourceMode(),
      loadPersistedTrackingEngineMode(),
      loadPersistedQaDiagnostics(),
    ]).then(() => undefined).catch(() => undefined);
  }
  return pending;
}
