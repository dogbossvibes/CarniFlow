import { useEffect, useRef } from 'react';
import type { AngleKind } from '@/features/tracking/store/trackingStore';
import { forwardDistanceFromDog } from '@/features/tracking/utils/searchGeometry';
import { metersToSteps } from '@/features/tracking/utils/steps';

// expo-speech defensiv laden (nativ; kein Crash, wenn das Modul fehlt).
let Speech: typeof import('expo-speech') | null = null;
try { Speech = require('expo-speech'); } catch { Speech = null; }
export const SPEECH_AVAILABLE = Speech != null;

const ANNOUNCE_AHEAD_M = 6;      // ab dieser Nähe ankündigen (~8 Schritte voraus)
const SPEAK_GAP_MS     = 3500;   // Entprellung zwischen zwei Ansagen

// arcM = Bogenlänge des Winkels entlang der gelegten Fährte (= marker.distance_from_start).
export interface GuidanceAngle { id: string; arcM: number; angleKind: AngleKind | null }

function say(msg: string) { try { Speech?.stop(); Speech?.speak(msg, { language: 'de-DE', rate: 1.0 }); } catch { /* ignore */ } }

// Sprechtext: Winkel/Spitzwinkel/Abriss inkl. Richtung, Distanz in GESCHÄTZTEN
// Schritten („ca.", da aus GPS-Distanz abgeleitet — kein echter Pedometer).
function phraseFor(kind: AngleKind | null, steps: number): string {
  const inSteps = `in ca. ${steps} Schritt${steps === 1 ? '' : 'en'}`;
  switch (kind) {
    case 'links':        return `Linkswinkel ${inSteps}.`;
    case 'rechts':       return `Rechtswinkel ${inSteps}.`;
    case 'spitz_links':  return `Spitzwinkel nach links ${inSteps}.`;
    case 'spitz_rechts': return `Spitzwinkel nach rechts ${inSteps}.`;
    case 'spitz':        return `Spitzwinkel ${inSteps}.`;
    case 'abriss':       return `Abriss ${inSteps}.`;
    case 'gw':           return `Geschlossener Winkel ${inSteps}.`;
    case 'ow':           return `Offener Winkel ${inSteps}.`;
    case 'bw':           return `Bodenwinkel ${inSteps}.`;
    default:             return `Winkel ${inSteps}.`;
  }
}

// Gegenstand-Ansage (dog-basiert). Dübel wird namentlich angesagt, sonst „Gegenstand".
export function objectPhrase(material: string | null | undefined, steps: number): string {
  const inSteps = `in ca. ${steps} Schritt${steps === 1 ? '' : 'en'}`;
  return material === 'duebel' ? `Dübel ${inSteps}.` : `Gegenstand ${inSteps}.`;
}

// Ereignis-Kandidat für die Ansage (Winkel ODER Gegenstand), Distanz entlang der Bogenlänge.
type SpeakCandidate = { id: string; arcM: number; kind: 'angle'; angleKind: AngleKind | null }
  | { id: string; arcM: number; kind: 'object'; material?: string | null };

// Sprachführung beim Ablaufen: kündigt den nächsten gelegten Winkel/Abriss ODER
// Gegenstand (inkl. „Dübel") „etwas voraus" an — Distanz relativ zur VIRTUELLEN
// HUNDEPOSITION (dogProgressM, Bogenlänge), jeden Punkt genau einmal.
export function useTrackVoiceGuidance(
  dogProgressM: number | null,
  angles: GuidanceAngle[],
  voiceOn: boolean,
  stepLengthM?: number,
  objects: { id: string; arcM: number; material?: string | null }[] = [],
) {
  const spokenRef    = useRef<Set<string>>(new Set());
  const lastSpeakRef = useRef(0);

  // Bei neuem Lauf (neue Listen) die „schon angesagt"-Menge zurücksetzen.
  useEffect(() => { spokenRef.current = new Set(); }, [angles, objects]);

  useEffect(() => {
    if (!voiceOn || dogProgressM == null || !SPEECH_AVAILABLE) return;
    const now = Date.now();
    if (now - lastSpeakRef.current < SPEAK_GAP_MS) return;

    // Nächstes noch nicht angesagtes Ereignis (Winkel ODER Gegenstand) VOR dem Hund.
    const candidates: SpeakCandidate[] = [
      ...angles.map(a => ({ id: a.id, arcM: a.arcM, kind: 'angle' as const, angleKind: a.angleKind })),
      ...objects.map(o => ({ id: o.id, arcM: o.arcM, kind: 'object' as const, material: o.material })),
    ];
    let best: SpeakCandidate | null = null, bestD = Infinity;
    for (const c of candidates) {
      if (spokenRef.current.has(c.id)) continue;
      const d = forwardDistanceFromDog(c.arcM, dogProgressM);
      if (d != null && d < bestD) { bestD = d; best = c; }
    }
    if (best && bestD <= ANNOUNCE_AHEAD_M) {
      spokenRef.current.add(best.id);
      lastSpeakRef.current = now;
      // Distanz → geschätzte Schritte über die zentrale Utility (persönliche Schrittlänge optional).
      const steps = Math.max(1, metersToSteps(bestD, stepLengthM));
      say(best.kind === 'angle' ? phraseFor(best.angleKind, steps) : objectPhrase(best.material, steps));
    }
  }, [dogProgressM, angles, objects, voiceOn, stepLengthM]);

  // Beim Verlassen / Stummschalten laufende Ansage stoppen.
  useEffect(() => { if (!voiceOn) { try { Speech?.stop(); } catch { /* ignore */ } } }, [voiceOn]);
  useEffect(() => () => { try { Speech?.stop(); } catch { /* ignore */ } }, []);
}
