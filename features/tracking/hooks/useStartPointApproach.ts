import { useEffect, useRef, useState } from 'react';
import { calculateDistance, type LatLng } from '@/features/tracking/utils/gpsFilter';
import type { SearchRecorder } from '@/features/tracking/hooks/useSearchRecorder';
import {
  DEFAULT_APPROACH_CONFIG, INITIAL_APPROACH, effectiveRadiusM, fixesRemaining,
  reduceApproach, type ApproachConfig,
  isEligible,
  nextStartZonePhase, type StartZonePhase,
} from '@/features/tracking/engine/startApproach';

export interface StartApproach {
  position:       LatLng | null;   // aktuelle Position (nur während der Annäherung)
  distanceM:      number | null;   // Live-Distanz zum Fährtenansatz
  accuracy:       number | null;   // gemeldete GPS-Genauigkeit (m)
  radiusM:        number | null;   // aktueller DYNAMISCHER Startradius (m)
  withinRadius:   boolean;         // aktuell im dynamischen Zielradius
  armed:          boolean;         // Startpunkt erreicht + stabil → Absuche darf starten
  fixesRemaining: number;          // verbleibende gültige Fixes bis zur stabilen Startbereitschaft
  phase: StartZonePhase;
  startZoneEnteredAtMs: number | null;
  firstStableFixAtMs: number | null;
  armedAtMs: number | null;
  departedStartAtMs: number | null;
  reason: string | null;
}

const IDLE: StartApproach = {
  position: null, distanceM: null, accuracy: null, radiusM: null,
  withinRadius: false, armed: false, fixesRemaining: DEFAULT_APPROACH_CONFIG.requiredFixes,
  phase: 'approaching', startZoneEnteredAtMs: null, firstStableFixAtMs: null,
  armedAtMs: null, departedStartAtMs: null, reason: null,
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
  const phaseRef = useRef<StartApproach['phase']>('approaching');
  const enteredRef = useRef<number | null>(null);
  const stableRef = useRef<number | null>(null);
  const armedRef = useRef<number | null>(null);
  const departedRef = useRef<number | null>(null);
  const startLat = start?.lat;
  const startLng = start?.lng;

  useEffect(() => {
    setState(IDLE);
    approachRef.current = INITIAL_APPROACH;
    lastFixRef.current = null;
    processedFixRef.current = null;
    phaseRef.current = 'approaching'; enteredRef.current = null; stableRef.current = null; armedRef.current = null; departedRef.current = null;
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
    const eligible = isEligible({ distanceM: dist, accuracy: acc, t: now, ageMs, jumpSpeedMps }, config);
    if (eligible) stableRef.current ??= now;
    const beforePhase = phaseRef.current;
    phaseRef.current = nextStartZonePhase(beforePhase, eligible, next.armed);
    if (beforePhase === 'approaching' && phaseRef.current === 'start_zone_entered') enteredRef.current = now;
    if (phaseRef.current === 'at_start') armedRef.current ??= now;
    if (phaseRef.current === 'departed_start') departedRef.current ??= now;
    setState({
      position: pos, distanceM: dist, accuracy: acc, radiusM: r,
      withinRadius: r != null && dist <= r, armed: next.armed,
      fixesRemaining: fixesRemaining(next, config),
      phase: phaseRef.current, startZoneEnteredAtMs: enteredRef.current,
      firstStableFixAtMs: stableRef.current, armedAtMs: armedRef.current,
      departedStartAtMs: departedRef.current,
      reason: eligible ? null : acc == null || acc > config.maxAccuracyM ? 'accuracy' :
        !r || dist > r ? 'outside_zone' : 'stale_or_jump',
    });
  }, [active, startLat, startLng, liveFix, config]);

  return state;
}
