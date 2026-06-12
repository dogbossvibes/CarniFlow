import * as Location from 'expo-location';
import { isExternalMode, subscribeRecorder, getRecordedPoints, resetRecorder } from '@/lib/trackRecorder';
import type { GpsSample } from '@/features/tracking/utils/gpsFilter';

// Reichere Probe inkl. der Felder, die nur Telefon-GPS liefert.
export interface StreamSample extends GpsSample {
  altitude?: number | null;
  speed?:    number | null;
  course?:   number | null;   // Bewegungsrichtung (Telefon-GPS)
}

// Einheitliche Positions-Quelle: externes BLE-GPS (über lib/trackRecorder.pushPoint)
// wenn verbunden, sonst Telefon-GPS via watchPositionAsync. Gibt eine
// Aufräum-Funktion zurück. So müssen die Hooks die Quelle nicht kennen.
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
        onSample({ lat: p.lat, lng: p.lng, accuracy: p.accuracy_m, t: Date.parse(p.timestamp), altitude: p.altitude_m });
      }
      lastIdx = pts.length;
    });
    return unsub;
  }

  const sub = await Location.watchPositionAsync(opts, loc => onSample({
    lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: loc.coords.accuracy,
    t: loc.timestamp || Date.now(), altitude: loc.coords.altitude, speed: loc.coords.speed, course: loc.coords.heading,
  }));
  return () => sub.remove();
}
