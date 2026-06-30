import { useEffect, useRef } from 'react';
import type { AngleKind } from '@/features/tracking/store/trackingStore';
import { distanceM, type LatLng } from '@/lib/trackGuidance';

// expo-speech defensiv laden (nativ; kein Crash, wenn das Modul fehlt).
let Speech: typeof import('expo-speech') | null = null;
try { Speech = require('expo-speech'); } catch { Speech = null; }
export const SPEECH_AVAILABLE = Speech != null;

const STEP_M           = 0.75;   // 1 Schritt ≈ 0,75 m → Distanz in Schritten ansagen
const ANNOUNCE_AHEAD_M = 6;      // ab dieser Nähe ankündigen (~8 Schritte voraus)
const SPEAK_GAP_MS     = 3500;   // Entprellung zwischen zwei Ansagen

export interface GuidanceAngle { id: string; lat: number; lng: number; angleKind: AngleKind | null }

function say(msg: string) { try { Speech?.stop(); Speech?.speak(msg, { language: 'de-DE', rate: 1.0 }); } catch { /* ignore */ } }

// Sprechtext: Winkel/Spitzwinkel/Abriss inkl. Richtung, Distanz in Schritten.
function phraseFor(kind: AngleKind | null, steps: number): string {
  const inSteps = `in ${steps} Schritt${steps === 1 ? '' : 'en'}`;
  switch (kind) {
    case 'links':        return `Linkswinkel ${inSteps}.`;
    case 'rechts':       return `Rechtswinkel ${inSteps}.`;
    case 'spitz_links':  return `Spitzwinkel nach links ${inSteps}.`;
    case 'spitz_rechts': return `Spitzwinkel nach rechts ${inSteps}.`;
    case 'spitz':        return `Spitzwinkel ${inSteps}.`;
    case 'abriss':       return `Abriss ${inSteps}.`;
    default:             return `Winkel ${inSteps}.`;
  }
}

// Sprachführung beim Ablaufen: kündigt den nächsten gelegten Winkel/Spitzwinkel/
// Abriss „etwas voraus" an (Distanz in Schritten), jeden Punkt genau einmal.
export function useTrackVoiceGuidance(position: LatLng | null, angles: GuidanceAngle[], voiceOn: boolean) {
  const spokenRef    = useRef<Set<string>>(new Set());
  const lastSpeakRef = useRef(0);

  // Bei neuem Lauf (neue Winkel-Liste) die „schon angesagt"-Menge zurücksetzen.
  useEffect(() => { spokenRef.current = new Set(); }, [angles]);

  useEffect(() => {
    if (!voiceOn || !position || !SPEECH_AVAILABLE) return;
    const now = Date.now();
    if (now - lastSpeakRef.current < SPEAK_GAP_MS) return;

    // Nächsten noch nicht angesagten Winkel suchen.
    let best: GuidanceAngle | null = null, bestD = Infinity;
    for (const a of angles) {
      if (spokenRef.current.has(a.id)) continue;
      const d = distanceM(position, { lat: a.lat, lng: a.lng });
      if (d < bestD) { bestD = d; best = a; }
    }
    if (best && bestD <= ANNOUNCE_AHEAD_M) {
      spokenRef.current.add(best.id);
      lastSpeakRef.current = now;
      say(phraseFor(best.angleKind, Math.max(1, Math.round(bestD / STEP_M))));
    }
  }, [position, angles, voiceOn]);

  // Beim Verlassen / Stummschalten laufende Ansage stoppen.
  useEffect(() => { if (!voiceOn) { try { Speech?.stop(); } catch { /* ignore */ } } }, [voiceOn]);
  useEffect(() => () => { try { Speech?.stop(); } catch { /* ignore */ } }, []);
}
