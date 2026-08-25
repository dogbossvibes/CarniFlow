import { useEffect, useRef } from 'react';
import type { AngleKind } from '@/features/tracking/store/trackingStore';
import { forwardDistanceFromDog } from '@/features/tracking/utils/searchGeometry';
import { metersToSteps } from '@/features/tracking/utils/steps';
import i18n, { type AppLocale } from '@/i18n/config';
import type { TranslationKey } from '@/i18n/de-CH';
import { logVoiceGuidance, type GuidanceCandidateDiag } from '@/features/tracking/utils/angleDiagnostics';

// expo-speech defensiv laden (nativ; kein Crash, wenn das Modul fehlt).
let Speech: typeof import('expo-speech') | null = null;
try { Speech = require('expo-speech'); } catch { Speech = null; }
export const SPEECH_AVAILABLE = Speech != null;

const ANNOUNCE_AHEAD_M = 6;      // ab dieser Nähe ankündigen (~8 Schritte voraus)
const SPEAK_GAP_MS     = 3500;   // Entprellung zwischen zwei Ansagen

// arcM = Bogenlänge des Winkels entlang der gelegten Fährte (= marker.distance_from_start).
export interface GuidanceAngle { id: string; arcM: number; angleKind: AngleKind | null }

function speechLanguage(locale: AppLocale) {
  if (locale === 'fr') return 'fr-CH';
  if (locale === 'it') return 'it-IT';
  if (locale === 'en') return 'en-GB';
  return 'de-CH';
}

function getCurrentLocale(): AppLocale {
  return (i18n.language as AppLocale) || 'de';
}

function translateKey(key: TranslationKey, params: Record<string, string | number>, locale: AppLocale) {
  return i18n.t(key, { lng: locale, ...params }) as string;
}

// Einmalige Ansage über den bestehenden Speech-Service (stop-then-speak, locale-aware).
// Wiederverwendbar (z. B. Off-Track-Feedback) — KEINE zweite Speech-Engine.
export function say(msg: string, locale: AppLocale = getCurrentLocale()) {
  try {
    if (!Speech) return false;
    Speech.stop();
    Speech.speak(msg, { language: speechLanguage(locale), rate: 1.0 });
    return true;
  } catch {
    return false;
  }
}

function inStepsText(steps: number, locale: AppLocale) {
  let plural = steps === 1 ? '' : 'en';
  if (locale === 'en') plural = steps === 1 ? '' : 's';
  if (locale === 'fr') plural = '';
  if (locale === 'it') plural = steps === 1 ? 'o' : 'i';
  return translateKey('track.voiceInSteps', { steps, plural }, locale);
}

// Sprechtext: Winkel/Spitzwinkel/Abriss inkl. Richtung, Distanz in GESCHÄTZTEN
// Schritten („ca.", da aus GPS-Distanz abgeleitet — kein echter Pedometer).
function phraseFor(kind: AngleKind | null, steps: number, locale: AppLocale = getCurrentLocale()): string {
  const inSteps = inStepsText(steps, locale);
  const keyFor = (key: TranslationKey) => translateKey(key, { inSteps }, locale);
  switch (kind) {
    case 'links':        return keyFor('track.voiceLeft');
    case 'rechts':       return keyFor('track.voiceRight');
    case 'spitz_links':  return keyFor('track.voiceAcuteLeft');
    case 'spitz_rechts': return keyFor('track.voiceAcuteRight');
    case 'spitz':        return keyFor('track.voiceAcute');
    case 'abriss':       return keyFor('track.voiceBreak');
    case 'gw':           return keyFor('track.voiceGw');
    case 'ow':           return keyFor('track.voiceOw');
    case 'bw':           return keyFor('track.voiceBw');
    default:             return keyFor('track.voiceAngle');
  }
}

// Gegenstand-Ansage (dog-basiert). Dübel wird namentlich angesagt, sonst „Gegenstand".
export function objectPhrase(material: string | null | undefined, steps: number, locale: AppLocale = getCurrentLocale()): string {
  const inSteps = inStepsText(steps, locale);
  return translateKey(material === 'duebel' ? 'track.voiceDowel' : 'track.voiceObject', { inSteps }, locale);
}

// Ereignis-Kandidat für die Ansage (Winkel ODER Gegenstand), Distanz entlang der Bogenlänge.
type SpeakCandidate = { id: string; arcM: number; kind: 'angle'; angleKind: AngleKind | null }
  | { id: string; arcM: number; kind: 'object'; material?: string | null };

export interface VoiceGuidanceSelection {
  candidate: SpeakCandidate | null;
  distanceM: number | null;
  diagnostics: GuidanceCandidateDiag[];
}

// Reine Auswahlfunktion: entspricht exakt der Hook-Auswahl und macht die
// Markerreihenfolge/Suppression testbar, ohne Speech oder Timing zu verändern.
export function selectVoiceGuidanceCandidate(input: {
  dogProgressM: number | null;
  angles: GuidanceAngle[];
  objects: { id: string; arcM: number; material?: string | null }[];
  spokenIds: ReadonlySet<string>;
}): VoiceGuidanceSelection {
  const candidates: SpeakCandidate[] = [
    ...input.angles.map(angle => ({ id: angle.id, arcM: angle.arcM, kind: 'angle' as const, angleKind: angle.angleKind })),
    ...input.objects.map(object => ({ id: object.id, arcM: object.arcM, kind: 'object' as const, material: object.material })),
  ];
  if (input.dogProgressM == null) {
    return {
      candidate: null,
      distanceM: null,
      diagnostics: candidates.map(candidate => ({
        id: candidate.id, type: candidate.kind, arcM: candidate.arcM, forwardDistanceM: null,
        alreadySpoken: input.spokenIds.has(candidate.id), selected: false, suppression: 'dog_progress_unavailable',
      })),
    };
  }

  let best: SpeakCandidate | null = null;
  let bestD = Infinity;
  const distances = new Map<string, number | null>();
  for (const candidate of candidates) {
    const distance = forwardDistanceFromDog(candidate.arcM, input.dogProgressM);
    distances.set(candidate.id, distance);
    if (input.spokenIds.has(candidate.id)) continue;
    if (distance != null && distance < bestD) { bestD = distance; best = candidate; }
  }

  return {
    candidate: best,
    distanceM: best ? bestD : null,
    diagnostics: candidates.map(candidate => {
      const distance = distances.get(candidate.id) ?? null;
      const alreadySpoken = input.spokenIds.has(candidate.id);
      const selected = best?.id === candidate.id;
      const suppression = alreadySpoken ? 'already_spoken'
        : distance == null ? 'behind_virtual_dog'
          : selected && distance > ANNOUNCE_AHEAD_M ? 'outside_guidance_window'
            : !selected && distance <= ANNOUNCE_AHEAD_M ? 'other_event_selected'
              : 'outside_guidance_window';
      return { id: candidate.id, type: candidate.kind, arcM: candidate.arcM, forwardDistanceM: distance, alreadySpoken, selected, suppression };
    }),
  };
}

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
    const now = Date.now();
    const selection = selectVoiceGuidanceCandidate({ dogProgressM, angles, objects, spokenIds: spokenRef.current });
    const cooldownActive = now - lastSpeakRef.current < SPEAK_GAP_MS;
    let speechTriggered = false;
    let globalSuppression: string | null = null;
    if (!voiceOn) globalSuppression = 'voice_disabled';
    else if (dogProgressM == null) globalSuppression = 'dog_progress_unavailable';
    else if (!SPEECH_AVAILABLE) globalSuppression = 'speech_unavailable';
    else if (cooldownActive) globalSuppression = 'global_cooldown';
    else if (!selection.candidate || selection.distanceM == null || selection.distanceM > ANNOUNCE_AHEAD_M) globalSuppression = null;
    else {
      const best = selection.candidate;
      const bestD = selection.distanceM;
      const locale = getCurrentLocale();
      spokenRef.current.add(best.id);
      lastSpeakRef.current = now;
      // Distanz → geschätzte Schritte über die zentrale Utility (persönliche Schrittlänge optional).
      const steps = Math.max(1, metersToSteps(bestD, stepLengthM));
      speechTriggered = say(best.kind === 'angle' ? phraseFor(best.angleKind, steps, locale) : objectPhrase(best.material, steps, locale), locale);
    }
    if (__DEV__) {
      logVoiceGuidance({
        dogProgressM, voiceEnabled: voiceOn, speechAvailable: SPEECH_AVAILABLE, cooldownActive, speechTriggered,
        candidates: selection.diagnostics.map(candidate => ({
          ...candidate,
          suppression: globalSuppression ?? candidate.suppression,
        })),
      });
    }
  }, [dogProgressM, angles, objects, voiceOn, stepLengthM]);

  // Beim Verlassen / Stummschalten laufende Ansage stoppen.
  useEffect(() => { if (!voiceOn) { try { Speech?.stop(); } catch { /* ignore */ } } }, [voiceOn]);
  useEffect(() => () => { try { Speech?.stop(); } catch { /* ignore */ } }, []);
}
