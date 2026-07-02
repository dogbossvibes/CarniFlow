import { useEffect, useRef } from 'react';
import { distanceM, type LatLng } from '@/lib/trackGuidance';
import type { GuidanceAngle } from '@/features/tracking/hooks/useTrackVoiceGuidance';

// expo-haptics defensiv laden (nativ; kein Crash, wenn das Modul fehlt).
let Haptics: typeof import('expo-haptics') | null = null;
try { Haptics = require('expo-haptics'); } catch { Haptics = null; }

export interface GuidanceObject { id: string; lat: number; lng: number }

const ANGLE_AHEAD_M  = 6;    // Winkel etwas voraus (~8 Schritte)
const OBJECT_AHEAD_M = 4;    // Gegenstände etwas enger
const GAP_MS         = 2500; // Entprellung zwischen zwei Auslösungen
const PULSE_GAP_MS   = 170;  // Abstand zwischen den zwei Winkel-Vibrationen

// Vibrationsmuster: n kurze, kräftige Impulse nacheinander.
async function buzz(n: number) {
  if (!Haptics) return;
  for (let i = 0; i < n; i++) {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch { /* ignore */ }
    if (i < n - 1) await new Promise(r => setTimeout(r, PULSE_GAP_MS));
  }
}

// Haptische Führung beim Absuchen: 1× vibrieren, wenn sich ein Gegenstand nähert,
// 2× vibrieren, wenn ein Winkel voraus liegt — jeden Punkt genau einmal. Läuft
// unabhängig von der Sprachausgabe.
export function useTrackHapticGuidance(
  position: LatLng | null,
  angles: GuidanceAngle[],
  objects: GuidanceObject[],
  enabled: boolean,
) {
  const firedRef = useRef<Set<string>>(new Set());
  const lastRef  = useRef(0);

  // Bei neuem Lauf (neue Listen) die „schon ausgelöst"-Menge zurücksetzen.
  useEffect(() => { firedRef.current = new Set(); }, [angles, objects]);

  useEffect(() => {
    if (!enabled || !position || !Haptics) return;
    const now = Date.now();
    if (now - lastRef.current < GAP_MS) return;

    // Nächsten noch nicht ausgelösten Punkt in Reichweite suchen (Winkel = 2×,
    // Gegenstand = 1×). Bei Gleichstand gewinnt der nähere.
    let bestId: string | null = null, bestD = Infinity, pulses = 0;
    for (const a of angles) {
      if (firedRef.current.has(a.id)) continue;
      const d = distanceM(position, { lat: a.lat, lng: a.lng });
      if (d <= ANGLE_AHEAD_M && d < bestD) { bestD = d; bestId = a.id; pulses = 2; }
    }
    for (const o of objects) {
      if (firedRef.current.has(o.id)) continue;
      const d = distanceM(position, { lat: o.lat, lng: o.lng });
      if (d <= OBJECT_AHEAD_M && d < bestD) { bestD = d; bestId = o.id; pulses = 1; }
    }
    if (bestId) {
      firedRef.current.add(bestId);
      lastRef.current = now;
      void buzz(pulses);
    }
  }, [position, angles, objects, enabled]);
}
