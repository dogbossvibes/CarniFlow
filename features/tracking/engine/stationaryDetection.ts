// Stillstand-Erkennung. Zwei Sichten:
//  • isStationary(): zeitfensterbasiert über die letzten Rohpunkte (zustandslos).
//  • updateStationaryState(): laufender Zustandsautomat MOVING/SLOW_MOVING/
//    STATIONARY samt stationarySince. Reine Funktionen → testbar.
import { distanceM } from '@/lib/trackGuidance';
import { PRECISION } from '@/features/tracking/engine/gpsQuality';

export interface StationarySample { lat: number; lng: number; t: number }

export function isStationary(
  recent: StationarySample[], now: number,
  radiusM = PRECISION.STATIONARY_RADIUS_M, windowMs = PRECISION.STATIONARY_WINDOW_MS,
): boolean {
  const win = recent.filter(p => now - p.t <= windowMs);
  if (win.length < 2) return false;
  if (now - win[0].t < windowMs * 0.8) return false;   // Fenster noch nicht voll
  const ref = win[win.length - 1];
  return win.every(p => distanceM(p, ref) <= radiusM);
}

// --- Laufender Stillstands-Zustand ---

export type StationaryStatus = 'MOVING' | 'SLOW_MOVING' | 'STATIONARY';

// Sobald die Bewegung weg vom Anker diese Distanz übersteigt → MOVING.
const MOVING_DIST_M = 3;

export interface StationaryState {
  status:          StationaryStatus;
  stationarySince: number | null;
  // Referenz = letzter akzeptierter Punkt; gegen ihn wird die Distanz gemessen.
  // Bleibt während Stillstand/Slow stehen, damit kumulative Bewegung MOVING auslöst.
  anchor:          { lat: number; lng: number } | null;
}

export const INITIAL_STATIONARY_STATE: StationaryState = {
  status: 'MOVING', stationarySince: null, anchor: null,
};

// Aktualisiert den Stillstands-Zustand anhand des nächsten Punktes.
export function updateStationaryState(
  previousState: StationaryState | null,
  currentPoint: StationarySample,
): StationaryState {
  const prev = previousState ?? INITIAL_STATIONARY_STATE;
  const here = { lat: currentPoint.lat, lng: currentPoint.lng };

  // Noch kein Anker (erster Punkt) → Bewegung, Anker setzen.
  if (!prev.anchor) {
    return { status: 'MOVING', stationarySince: null, anchor: here };
  }

  const dist = distanceM(prev.anchor, currentPoint);

  // Klare Bewegung (auch kumulativ) → MOVING, Anker mitziehen, Timer zurücksetzen.
  if (dist > MOVING_DIST_M) {
    return { status: 'MOVING', stationarySince: null, anchor: here };
  }

  // Eng am Anker → Stillstands-Timer starten/halten.
  if (dist < PRECISION.STATIONARY_RADIUS_M) {
    const stationarySince = prev.stationarySince ?? currentPoint.t;
    const duration = currentPoint.t - stationarySince;
    const status: StationaryStatus =
      duration >= PRECISION.STATIONARY_WINDOW_MS ? 'STATIONARY' : 'SLOW_MOVING';
    // Anker NICHT bewegen: wir akzeptieren keine neuen Linienpunkte beim Verharren.
    return { status, stationarySince, anchor: prev.anchor };
  }

  // 1,5–3 m: langsame Bewegung; Anker halten, damit kumulatives Gehen MOVING wird.
  return { status: 'SLOW_MOVING', stationarySince: null, anchor: prev.anchor };
}
