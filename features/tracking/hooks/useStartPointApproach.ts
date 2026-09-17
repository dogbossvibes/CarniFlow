import { useEffect, useRef, useState } from 'react';
import { calculateDistance, type LatLng } from '@/features/tracking/utils/gpsFilter';
import type { SearchRecorder } from '@/features/tracking/hooks/useSearchRecorder';
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
// Fährtenansatz. Liest die ungeglätteten Live-Fixes des Search-Recorders,
// der die Positionsquelle allein besitzt. Kein Start/Stop einer eigenen Quelle.
// Die Bewertung (dynamischer Radius,
// mehrere gültige Fixes, Stale-/Ausreißerfilter) läuft über die reine
// reduceApproach-Logik. Der Absuche-Recorder bleibt ungestartet (Suchzeit läuft
// erst nach bewusstem Tippen auf „Jetzt starten").
export function useStartPointApproach(
  { active, start, liveFix, config = DEFAULT_APPROACH_CONFIG }:
  { active: boolean; start: LatLng | null; liveFix: SearchRecorder['liveFix']; config?: ApproachConfig },
): StartApproach {
  const [state, setState] = useState<StartApproach>(IDLE);
  const approachRef = useRef(INITIAL_APPROACH);
  const lastFixRef  = useRef<{ lat: number; lng: number; t: number } | null>(null);
  const processedFixRef = useRef<SearchRecorder['liveFix']>(null);
  const startLat = start?.lat;
  const startLng = start?.lng;

  useEffect(() => {
    setState(IDLE);
    approachRef.current = INITIAL_APPROACH;
    lastFixRef.current = null;
    processedFixRef.current = null;
  }, [active, startLat, startLng, config]);

  useEffect(() => {
    if (!active || startLat == null || startLng == null || !liveFix || processedFixRef.current === liveFix) return;
    processedFixRef.current = liveFix;   // UI-Renders zählen denselben Fix nicht erneut.
    const pos: LatLng = { lat: liveFix.lat, lng: liveFix.lng };
    const acc = liveFix.accuracy ?? null;
    const now = Date.now();
    const dist = calculateDistance(pos, { lat: startLat, lng: startLng });
    const ageMs = liveFix.t ? Math.max(0, now - liveFix.t) : null;
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
  }, [active, startLat, startLng, liveFix, config]);

  return state;
}
