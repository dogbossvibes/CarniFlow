import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

// ──────────────────────────────────────────────────────────────────────────
// Hintergrundfähige GPS-Quelle für die Fährtenaufnahme.
//
// watchPositionAsync liefert nur im Vordergrund Fixes — sobald das Display aus
// oder die App im Hintergrund ist, pausiert der Stream und die Spur bricht ab.
// startLocationUpdatesAsync + TaskManager ist der von Expo vorgesehene Weg für
// Hintergrund-GPS und bringt die sichtbare Status-Anzeige gleich mit:
//   • Android: dauerhafte Foreground-Service-Benachrichtigung (Pflicht).
//   • iOS:     blaue Statusleisten-Pille (showsBackgroundLocationIndicator).
//
// Der Task MUSS global definiert sein (das OS findet ihn sonst im Hintergrund
// nicht). Er reicht jeden Fix an den aktuell registrierten Recorder-Handler
// weiter — so bleibt die gesamte Aufnahme-Logik (EMA, Filter, Winkel, Store,
// SQLite) im useTrackRecorder unverändert.
// ──────────────────────────────────────────────────────────────────────────

// Eigener Task-Name — NICHT 'anyvo-track-location' (das belegt der ältere
// lib/trackRecorder für den externen-BLE-GPS-Pfad). Zwei defineTask auf denselben
// Namen würden kollidieren.
export const TRACK_LOCATION_TASK = 'anyvo-faehrte-bg';

type FixHandler = (loc: Location.LocationObject) => void;
let activeHandler: FixHandler | null = null;

/** Recorder registriert hier seinen onFix; null = niemand hört zu (verwerfen). */
export function setTrackFixHandler(handler: FixHandler | null): void {
  activeHandler = handler;
}

// defineTask ist über die Plattformen hinweg lose typisiert → schmaler Cast
// (gleiches Vorgehen wie im bestehenden lib/trackRecorder).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const define = TaskManager.defineTask as (task: string, executor: (body: any) => void) => void;
define(TRACK_LOCATION_TASK, ({ data, error }: { data?: { locations?: Location.LocationObject[] }; error: { message: string } | null }) => {
  if (error) { console.warn('[bgLocation]', error.message); return; }
  const locations = data?.locations;
  if (!locations?.length || !activeHandler) return;
  for (const loc of locations) activeHandler(loc);
});

/** Hintergrund-Updates mit Foreground-Service (Android) + iOS-Indikator starten. */
export async function startBackgroundUpdates(opts: {
  notificationTitle: string;
  notificationBody: string;
  notificationColor?: string;
}): Promise<void> {
  await Location.startLocationUpdatesAsync(TRACK_LOCATION_TASK, {
    accuracy:                  Location.Accuracy.BestForNavigation,
    timeInterval:              1000,
    distanceInterval:          0,
    pausesUpdatesAutomatically: false,            // iOS: nie automatisch pausieren
    activityType:              Location.ActivityType.Fitness,
    showsBackgroundLocationIndicator: true,        // iOS: blaue Pille
    foregroundService: {                           // Android: dauerhafte Anzeige
      notificationTitle: opts.notificationTitle,
      notificationBody:  opts.notificationBody,
      notificationColor: opts.notificationColor,
      killServiceOnDestroy: false,
    },
  });
}

/** Hintergrund-Updates beenden (idempotent, no-op wenn nie gestartet). */
export async function stopBackgroundUpdates(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TRACK_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(TRACK_LOCATION_TASK);
    }
  } catch (e) {
    console.warn('[bgLocation] stop', e);
  }
}
