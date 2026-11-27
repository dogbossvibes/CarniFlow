import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

// ──────────────────────────────────────────────────────────────────────────
// T-209: Android-Absuche bei ausgeschaltetem Bildschirm.
//
// Die Absuche liest ihre Positionen aus der normalen Positionsquelle; auf
// Android seit dem Feldfehler 26.11. von Anfang an expo-location (Fused), mit
// dem Precision-Modul nur als Ausweichweg (positionSource,
// androidUseFusedLocation). Ohne Vordergrund-Dienst drosselt
// Android die Ortung einer App ohne sichtbares Fenster auf wenige Werte pro
// Stunde: Bildschirm aus = keine Positionen, keine Sprachführung.
//
// Dieser Wachhalter startet während einer laufenden Absuche einen
// expo-location-Vordergrund-Dienst mit Dauerbenachrichtigung. Solange er läuft,
// gilt die App für Android als im Vordergrund und die bestehende Quelle liefert
// weiter im Sekundentakt. Der Dienst selbst liefert KEINE Fixes an die Absuche
// (kein zweiter Verarbeitungspfad); er fragt bewusst sparsam an.
//
// Nur Android. Auf iOS ist alles ein No-op (dort T-206: allowBackground im
// Precision-Modul). Das Legen (anyvo-faehrte-bg) bleibt unberührt.
// ──────────────────────────────────────────────────────────────────────────

export const SEARCH_KEEPALIVE_TASK = 'anyvo-absuche-bg';

const isAndroid = () => Platform.OS === 'android';

// Soll-Zustand: läuft gerade eine Absuche, die den Dienst braucht?
let wanted = false;
// Start/Stopp strikt nacheinander, damit ein schneller Stopp einen laufenden Start nicht überholt.
let queue: Promise<void> = Promise.resolve();
const serialize = (step: () => Promise<void>): Promise<void> => {
  const next = queue.then(step, step);
  queue = next.catch(() => {});
  return queue;
};

async function isRunning(): Promise<boolean> {
  try { return await Location.hasStartedLocationUpdatesAsync(SEARCH_KEEPALIVE_TASK); } catch { return false; }
}

async function stopNative(): Promise<void> {
  try {
    if (await isRunning()) await Location.stopLocationUpdatesAsync(SEARCH_KEEPALIVE_TASK);
  } catch (e) { console.warn('[searchKeepalive] stop', e); }
}

if (isAndroid()) {
  // Muss global definiert sein (TaskManager stellt registrierte Tasks beim App-Start wieder her).
  const define = TaskManager.defineTask as (task: string, executor: (body: any) => void | Promise<void>) => void;
  define(SEARCH_KEEPALIVE_TASK, async ({ error }: { error: { message: string } | null }) => {
    if (error) { console.warn('[searchKeepalive]', error.message); return; }
    // Verwaister Dienst (z. B. nach App-Neustart ohne laufende Absuche) → Benachrichtigung entfernen.
    if (!wanted) await serialize(async () => { if (!wanted) await stopNative(); });
  });
}

/** Während einer laufenden Absuche aufrufen (App im Vordergrund). Idempotent; Fehler blockieren die Absuche nie. */
export function startSearchKeepalive(): Promise<void> {
  if (!isAndroid()) return Promise.resolve();
  wanted = true;
  return serialize(async () => {
    if (!wanted || await isRunning()) return;
    try {
      await Location.startLocationUpdatesAsync(SEARCH_KEEPALIVE_TASK, {
        // Nur Wachhalter: die Absuche nutzt diese Werte nicht.
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 30_000,
        distanceInterval: 0,
        deferredUpdatesInterval: 0,
        foregroundService: {
          notificationTitle: '🐾 Absuche läuft',
          notificationBody: 'Ortung aktiv – tippen, um ANYVO zu öffnen',
          notificationColor: '#00FFCC',
          // App beendet → Dienst und Benachrichtigung weg (die Absuche lebt nur mit der App).
          killServiceOnDestroy: true,
        },
      });
    } catch (e) {
      // z. B. App nicht im Vordergrund oder Berechtigung fehlt: Absuche läuft wie bisher weiter.
      console.warn('[searchKeepalive] start', e);
      return;
    }
    // Während des Starts beendet → gleich wieder stoppen.
    if (!wanted) await stopNative();
  });
}

/** Absuche beendet/verlassen. Idempotent. */
export function stopSearchKeepalive(): Promise<void> {
  if (!isAndroid()) return Promise.resolve();
  wanted = false;
  return serialize(async () => { if (!wanted) await stopNative(); });
}
