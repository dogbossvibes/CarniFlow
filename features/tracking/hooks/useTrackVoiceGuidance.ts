import { useEffect, useRef } from 'react';
import { angleEvent, objectEvent, trackEventGuidanceKey } from '@/features/tracking/utils/trackEventVoice';
import type { AngleKind } from '@/features/tracking/store/trackingStore';
import { DEFAULT_GUIDANCE_OPTIONS, stepGuidanceEngine, type GuidanceFeature, type GuidanceFeatureState } from '@/features/tracking/utils/guidanceEngine';
import { metersToSteps } from '@/features/tracking/utils/steps';
import i18n, { type AppLocale } from '@/i18n/config';
import type { TranslationKey } from '@/i18n/de-CH';
import { requestVoice, cancelVoiceEvents, noteSuppressedVoice } from '@/features/tracking/utils/voiceEvents';

// expo-speech defensiv laden (nativ; kein Crash, wenn das Modul fehlt).
let Speech: typeof import('expo-speech') | null = null;
try { Speech = require('expo-speech'); } catch { Speech = null; }
export const SPEECH_AVAILABLE = Speech != null;

const SPEAK_GAP_MS     = 3500;   // Entprellung zwischen zwei Ansagen

// arcM = Bogenlänge des Winkels entlang der gelegten Fährte (= marker.distance_from_start).
export interface GuidanceAngle { id: string; arcM: number; angleKind: AngleKind | null; lat?: number | null; lng?: number | null }
export interface VoicePhysicalContext {
  handlerPosition: { latitude: number; longitude: number } | null;
  configuredDogLeadM: number;
  activeObjectWait: boolean;
}

export const maxVoiceDistanceM = (dogLeadM: number) => Math.min(8, Math.max(3, dogLeadM + 2.5));
function handlerDistanceM(a: NonNullable<VoicePhysicalContext['handlerPosition']>, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dy = (a.latitude - b.lat) * 111_320;
  const dx = (a.longitude - b.lng) * 111_320 * Math.cos(a.latitude * rad);
  return Math.hypot(dx, dy);
}

export function speechLanguage(locale: AppLocale) {
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

export function say(msg: string, locale: AppLocale = getCurrentLocale()) {
  requestVoice({ eventType: 'status', text: msg, language: speechLanguage(locale),
    priority: 1, onceKey: `status:${msg}:${Date.now()}`, phase: 'search' });
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
  // Zuordnung Event → Schlüssel liegt zentral in trackEventVoice.ts, damit
  // Legen und Absuche dieselben fachlichen Begriffe verwenden (Punkt 3).
  return translateKey(trackEventGuidanceKey(angleEvent(kind)), { inSteps }, locale);
}

// Gegenstand-Ansage (dog-basiert). Dübel wird namentlich angesagt, sonst „Gegenstand".
export function objectPhrase(material: string | null | undefined, steps: number, locale: AppLocale = getCurrentLocale()): string {
  const inSteps = inStepsText(steps, locale);
  return translateKey(trackEventGuidanceKey(objectEvent(material)), { inSteps }, locale);
}

// Sprachführung beim Ablaufen: kündigt den nächsten gelegten Winkel/Abriss ODER
// Gegenstand (inkl. „Dübel") „etwas voraus" an — Distanz relativ zur VIRTUELLEN
// HUNDEPOSITION (dogProgressM, Bogenlänge), jeden Punkt genau einmal.
// Recovery (Search-Recovery-State): `initialAnnouncedIds` seedet Features, die in
// DIESEM Run bereits angesagt wurden (→ nie erneut); `onAnnounced` spiegelt jede
// neue Ansage nach aussen (Persistenz). Schwellen/Texte/Locale unverändert.
export interface VoiceGuidanceRecovery {
  initialAnnouncedIds?: readonly string[];
  onAnnounced?: (featureId: string) => void;
  // Activation Guard: solange false (Arming, Recovery-Dialog, vor beginSearchNow,
  // nach Stop/Discard), wird die Guidance-Engine NICHT gerechnet — kein Feature
  // wird angesagt UND keines als approaching/announced/reached/passed
  // „verbraucht". Default true (bestehende Aufrufer unverändert).
  enabled?: boolean;
}

export function useTrackVoiceGuidance(
  dogProgressM: number | null,
  angles: GuidanceAngle[],
  voiceOn: boolean,
  stepLengthM?: number,
  objects: { id: string; arcM: number; material?: string | null; lat?: number | null; lng?: number | null }[] = [],
  recovery?: VoiceGuidanceRecovery,
  physical?: VoicePhysicalContext,
) {
  const stateRef     = useRef<Record<string, GuidanceFeatureState>>({});
  const lastSpeakRef = useRef(0);
  const onAnnouncedRef = useRef(recovery?.onAnnounced);
  const suppressedRef = useRef<Set<string>>(new Set());
  onAnnouncedRef.current = recovery?.onAnnounced;
  const initialIds = recovery?.initialAnnouncedIds;
  const enabled = recovery?.enabled ?? true;
  const latestRef = useRef({ enabled, voiceOn, dogProgressM, physical });
  latestRef.current = { enabled, voiceOn, dogProgressM, physical };

  // Bei neuem Lauf (neue Listen) die „schon angesagt"-Menge zurücksetzen — bzw.
  // aus dem Recovery-State desselben Runs seeden ('announced' → nie wieder).
  useEffect(() => {
    const seeded: Record<string, GuidanceFeatureState> = {};
    for (const id of initialIds ?? []) seeded[id] = 'announced';
    stateRef.current = seeded;
    suppressedRef.current.clear();
  }, [angles, objects, initialIds]);

  useEffect(() => {
    // Guard VOR dem Engine-Schritt: disabled darf keinen Zustand fortschreiben.
    if (!enabled || !voiceOn || dogProgressM == null || !SPEECH_AVAILABLE) return;
    const now = Date.now();
    if (now - lastSpeakRef.current < SPEAK_GAP_MS) return;

    const all = [
      ...angles.map(a => ({ ...a, kind: 'angle' as const })),
      ...objects.map(o => ({ ...o, kind: 'object' as const })),
    ];
    const candidates: GuidanceFeature[] = all.filter(feature => {
      const aheadM = feature.arcM - dogProgressM;
      if (aheadM < 0 || aheadM > DEFAULT_GUIDANCE_OPTIONS.announceAheadM) return true;
      const reason = physical?.activeObjectWait ? 'active_object_wait'
        : physical && (!physical.handlerPosition || feature.lat == null || feature.lng == null) ? 'physical_position_missing'
        : physical?.handlerPosition && feature.lat != null && feature.lng != null
          && handlerDistanceM(physical.handlerPosition, { lat: feature.lat, lng: feature.lng })
            > maxVoiceDistanceM(physical.configuredDogLeadM) ? 'physical_distance' : null;
      if (reason) {
        const key = `${feature.id}:${reason}`;
        if (!suppressedRef.current.has(key)) {
          suppressedRef.current.add(key);
          noteSuppressedVoice({ eventType: feature.kind, text: '', language: '', priority: 4,
            onceKey: `feature:${feature.id}`, phase: 'search', progressM: dogProgressM, distanceM: aheadM }, reason);
        }
      }
      return !reason;
    });
    const result = stepGuidanceEngine(candidates, dogProgressM, stateRef.current, DEFAULT_GUIDANCE_OPTIONS);
    stateRef.current = result.state;
    if (result.announcement) {
      const best = result.announcement.feature;
      const bestD = result.announcement.distanceM;
      const locale = getCurrentLocale();
      lastSpeakRef.current = now;
      // Distanz → geschätzte Schritte über die zentrale Utility (persönliche Schrittlänge optional).
      const steps = Math.max(1, metersToSteps(bestD, stepLengthM));
      requestVoice({
        eventType: best.kind, text: best.kind === 'angle' ? phraseFor(best.angleKind, steps, locale) : objectPhrase(best.material, steps, locale),
        language: speechLanguage(locale), priority: 4, onceKey: `feature:${best.id}`, phase: 'search',
        progressM: dogProgressM, distanceM: bestD,
        valid: () => { const latest = latestRef.current;
          const nowPhysical = latest.physical;
          return latest.enabled && latest.voiceOn && latest.dogProgressM != null
            && !nowPhysical?.activeObjectWait
            && (!(nowPhysical?.handlerPosition && best.lat != null && best.lng != null)
              || handlerDistanceM(nowPhysical.handlerPosition, { lat: best.lat, lng: best.lng })
                <= maxVoiceDistanceM(nowPhysical.configuredDogLeadM))
            && best.arcM - latest.dogProgressM >= -DEFAULT_GUIDANCE_OPTIONS.passedM
            && best.arcM - latest.dogProgressM <= DEFAULT_GUIDANCE_OPTIONS.announceAheadM; },
      });
      onAnnouncedRef.current?.(best.id);
    }
  }, [enabled, dogProgressM, angles, objects, voiceOn, stepLengthM, physical]);

  // Beim Verlassen / Stummschalten laufende Ansage stoppen.
  useEffect(() => { if (!voiceOn) cancelVoiceEvents(); }, [voiceOn]);
  useEffect(() => () => cancelVoiceEvents(), []);
}
