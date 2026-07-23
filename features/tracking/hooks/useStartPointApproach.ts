import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { calculateDistance, type LatLng } from '@/features/tracking/utils/gpsFilter';
import {
  DEFAULT_APPROACH_CONFIG, INITIAL_APPROACH, reduceApproach, type ApproachConfig,
} from '@/features/tracking/engine/startApproach';

export interface StartApproach {
  position:     LatLng | null;   // aktuelle Position (nur während der Annäherung)
  distanceM:    number | null;   // Live-Distanz zum Fährtenansatz
  accuracy:     number | null;   // GPS-Genauigkeit (m)
  withinRadius: boolean;         // aktuell im Zielradius
  armed:        boolean;         // Startpunkt erreicht + stabil → Absuche darf starten
}

const IDLE: StartApproach = { position: null, distanceM: null, accuracy: null, withinRadius: false, armed: false };

// Beobachtet die Live-Position AUSSCHLIESSLICH während der Annäherung an den
// Fährtenansatz (eigener, schlanker expo-location-Watch — der eigentliche
// Absuche-Recorder bleibt unberührt/ungestartet, damit die Suchzeit nicht läuft).
// Liefert Live-Distanz + Arming-Status; die Auswertung erfolgt über die reine
// reduceApproach-Logik.
export function useStartPointApproach(
  { active, start, config = DEFAULT_APPROACH_CONFIG }:
  { active: boolean; start: LatLng | null; config?: ApproachConfig },
): StartApproach {
  const [state, setState] = useState<StartApproach>(IDLE);
  const approachRef = useRef(INITIAL_APPROACH);

  useEffect(() => {
    if (!active || !start) { setState(IDLE); return; }
    approachRef.current = INITIAL_APPROACH;
    let alive = true;
    let sub: Location.LocationSubscription | null = null;

    (async () => {
      // Berechtigung ist beim Legen bereits erteilt; defensiv erneut prüfen.
      let granted = (await Location.getForegroundPermissionsAsync()).status === 'granted';
      if (!granted) granted = (await Location.requestForegroundPermissionsAsync()).status === 'granted';
      if (!alive || !granted) return;

      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
        (loc) => {
          if (!alive) return;
          const pos: LatLng = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          const acc = loc.coords.accuracy ?? null;
          const dist = calculateDistance(pos, start);
          const next = reduceApproach(approachRef.current, { distanceM: dist, accuracy: acc, t: Date.now() }, config);
          approachRef.current = next;
          setState({ position: pos, distanceM: dist, accuracy: acc, withinRadius: dist <= config.radiusM, armed: next.armed });
        },
      );
    })();

    return () => { alive = false; sub?.remove(); };
  }, [active, start?.lat, start?.lng, config]);

  return state;
}
