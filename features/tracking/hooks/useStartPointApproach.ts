import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { calculateDistance, type LatLng } from '@/features/tracking/utils/gpsFilter';
import { startPositionSource } from '@/features/tracking/utils/positionSource';
import { precisionLocationClient } from '@/features/tracking/native/precisionLocationClient';
import {
  DEFAULT_APPROACH_CONFIG, INITIAL_APPROACH, effectiveRadiusM, fixesRemaining,
  reduceApproach, type ApproachConfig,
} from '@/features/tracking/engine/startApproach';

export interface StartApproach {
  position:       LatLng | null;   // aktuelle Position (nur während der Annäherung)
  distanceM:      number | null;   // Live-Distanz zum Fährtenansatz
  accuracy:       number | null;   // gemeldete GPS-Genauigkeit (m)
  radiusM:        number | null;   // aktueller DYNAMISCHER Startradius (m)
  withinRadius:   boolean;         // aktuell im dynamischen Zielradius
  armed:          boolean;         // Startpunkt erreicht + stabil → Absuche darf starten
  fixesRemaining: number;          // verbleibende gültige Fixes bis zur stabilen Startbereitschaft
}

const IDLE: StartApproach = {
  position: null, distanceM: null, accuracy: null, radiusM: null,
  withinRadius: false, armed: false, fixesRemaining: DEFAULT_APPROACH_CONFIG.requiredFixes,
};

// Beobachtet die Live-Position AUSSCHLIESSLICH während der Annäherung an den
// Fährtenansatz. Nutzt dieselbe GPS-Abstraktion wie Legen/Absuche
// (positionSource → natives Precision-Modul, expo-Fallback intern gekapselt) —
// KEIN eigener zweiter GPS-Pfad mehr. Die Bewertung (dynamischer Radius,
// mehrere gültige Fixes, Stale-/Ausreißerfilter) läuft über die reine
// reduceApproach-Logik. Der Absuche-Recorder bleibt ungestartet (Suchzeit läuft
// erst nach bewusstem Tippen auf „Jetzt starten").
export function useStartPointApproach(
  { active, start, config = DEFAULT_APPROACH_CONFIG }:
  { active: boolean; start: LatLng | null; config?: ApproachConfig },
): StartApproach {
  const [state, setState] = useState<StartApproach>(IDLE);
  const approachRef = useRef(INITIAL_APPROACH);
  const lastFixRef  = useRef<{ lat: number; lng: number; t: number } | null>(null);

  useEffect(() => {
    if (!active || !start) { setState(IDLE); approachRef.current = INITIAL_APPROACH; lastFixRef.current = null; return; }
    approachRef.current = INITIAL_APPROACH;
    lastFixRef.current = null;
    let alive = true;
    let stop: (() => void) | null = null;

    (async () => {
      // Berechtigung ist beim Legen bereits erteilt; defensiv erneut prüfen.
      let granted = (await Location.getForegroundPermissionsAsync()).status === 'granted';
      if (!granted) granted = (await Location.requestForegroundPermissionsAsync()).status === 'granted';
      if (!alive || !granted) return;

      // iOS: falls „Genauer Standort" reduziert ist, einmalig präzise Ortung
      // anfragen (gleiches Vorgehen wie beim Legen). Best-effort; no-op ohne
      // natives Modul oder wenn bereits präzise.
      try { precisionLocationClient.requestTemporaryFullAccuracy('TrackingDogSportPrecision'); } catch { /* best-effort */ }

      try {
        // Dieselbe Positionsquelle wie Legen/Absuche (nativ bevorzugt, expo-Fallback intern).
        const handle = await startPositionSource((s) => {
          if (!alive) return;
          const pos: LatLng = { lat: s.lat, lng: s.lng };
          const acc  = s.accuracy ?? null;
          const now  = Date.now();
          const dist = calculateDistance(pos, start);
          // Alter des Fixes (Stale-Erkennung) — s.t ist der Fix-Zeitstempel.
          const ageMs = s.t ? Math.max(0, now - s.t) : null;
          // Sprunggeschwindigkeit gegen den letzten Fix (Ausreißer-Erkennung).
          let jumpSpeedMps: number | null = null;
          const prev = lastFixRef.current;
          if (prev) {
            const dt = (now - prev.t) / 1000;
            if (dt > 0) jumpSpeedMps = calculateDistance(pos, { lat: prev.lat, lng: prev.lng }) / dt;
          }
          lastFixRef.current = { lat: pos.lat, lng: pos.lng, t: now };

          const next = reduceApproach(approachRef.current, { distanceM: dist, accuracy: acc, t: now, ageMs, jumpSpeedMps }, config);
          approachRef.current = next;
          const r = effectiveRadiusM(acc, config);
          setState({
            position: pos, distanceM: dist, accuracy: acc, radiusM: r,
            withinRadius: r != null && dist <= r, armed: next.armed,
            fixesRemaining: fixesRemaining(next, config),
          });
        }, { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 });

        if (!alive) { handle.stop(); return; }
        stop = handle.stop;
      } catch (e) {
        // positionSource kapselt bereits den expo-Fallback; hier nur defensiv loggen.
        console.warn('[startApproach] positionSource fehlgeschlagen', e);
      }
    })();

    return () => { alive = false; stop?.(); };
  }, [active, start?.lat, start?.lng, config]);

  return state;
}
