import * as Location from 'expo-location';
import { isExternalMode, subscribeRecorder, getRecordedPoints, resetRecorder } from '@/lib/trackRecorder';
import { precisionLocationClient as client } from '@/features/tracking/native/precisionLocationClient';
import type { GpsSample } from '@/features/tracking/utils/gpsFilter';
import { normalizeFixQuality, type LocationFixQuality } from './locationFixQuality';

// Reichere Probe inkl. der Felder, die nur Telefon-GPS liefert.
export interface StreamSample extends GpsSample, LocationFixQuality {
  altitude?: number | null;
  speed?:    number | null;
  course?:   number | null;   // Bewegungsrichtung (Telefon-GPS)
  provider?: string | null;   // z. B. 'gps' / 'expo-location' (Debug)
  source?:   'native' | 'expo' | 'external';   // woher der Fix stammt (Debug)
}

// Einheitliche Positions-Quelle für die Fährtenaufnahme:
//   1) externes BLE-GPS (über lib/trackRecorder.pushPoint), wenn verbunden
//   2) sonst die native Precision-Engine (anyvo-precision-location), die intern
//      auf expo-location zurückfällt, falls das native Modul nicht im Build ist.
// Gibt eine Aufräum-Funktion zurück. Die Hooks müssen die Quelle nicht kennen.
export async function startPositionStream(
  onSample: (s: StreamSample) => void,
  opts: Location.LocationOptions,
): Promise<() => void> {
  if (isExternalMode()) {
    resetRecorder();
    let lastIdx = 0;
    const unsub = subscribeRecorder(() => {
      const pts = getRecordedPoints();
      for (let i = lastIdx; i < pts.length; i++) {
        const p = pts[i];
        onSample({ lat: p.lat, lng: p.lng, accuracy: p.accuracy_m, t: Date.parse(p.timestamp), altitude: p.altitude_m, source: 'external', provider: 'external-ble' });
      }
      lastIdx = pts.length;
    });
    return unsub;
  }

  // Native Precision-Engine (Telefon-GPS) — fällt intern auf expo-location zurück.
  let active = true;
  const sub = client.onLocation(loc => {
    if (!active) return;
    onSample({
      lat: loc.latitude,
      lng: loc.longitude,
      accuracy: loc.accuracy ?? null,
      t: loc.timestamp || Date.now(),
      altitude: loc.altitude ?? null,
      ...normalizeFixQuality({ altitudeAccuracy: loc.altitudeAccuracy,
        speedAccuracy: loc.speedAccuracy, courseAccuracy: loc.headingAccuracy }),
      speed: loc.speed ?? null,
      course: loc.heading ?? loc.bearing ?? null,
      provider: loc.provider ?? null,
      source: client.isNativeAvailable() ? 'native' : 'expo',
    });
  });
  try {
    await client.start({
      intervalMs: opts.timeInterval ?? 1000,
      mode: 'tracking_dog_sport',   // BestForNavigation, kein Auto-Pause
      enableHeading: false,         // Heading läuft separat über watchHeadingAsync
      allowBackground: false,
      enableGnssStatusAndroid: true, // diagnostics only; never enables raw measurements
    });
  } catch (error) {
    active = false;
    sub.remove(); // failed native startup must not leak into the Expo fallback
    throw error;
  }
  return () => { active = false; sub.remove(); void client.stop(); };
}
