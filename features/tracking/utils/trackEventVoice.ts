// ──────────────────────────────────────────────────────────────────────────
// EINE zentrale Zuordnung Fährten-Event → Sprach-/Anzeigetext. Legen UND
// Absuche verwenden dieselbe Quelle, damit beide Phasen fachlich identische
// Begriffe benutzen und es KEINE zwei unabhängig gepflegten Switch-Blöcke
// gibt (Punkt 3 der Vorgabe).
//
// Zwei Ausprägungen desselben Events:
//   • `trackEventLabelKey`  → schlichter Begriff („Winkel links", „Dübel",
//     „Absatz"). Wird beim LEGEN für Toast UND Sprachbestätigung benutzt.
//   • `trackEventGuidanceKey` → Ansage MIT Distanz („Winkel links {inSteps}.")
//     für die vorausschauende Führung in der ABSUCHE.
//
// Reine Zuordnung: kein React, kein Speech, keine Erkennungslogik. Die
// Event-Erkennung (Corner Detection, Absatz, Gegenstände) bleibt unberührt.
// ──────────────────────────────────────────────────────────────────────────
// Basis-Schlüsseltyp (keyof deCH) — derselbe, den useTrackVoiceGuidance nutzt.
import type { TranslationKey } from '@/i18n/de-CH';
import type { AngleKind, MarkerMaterial } from '@/features/tracking/store/trackingStore';

/** Ein gesetztes bzw. erreichtes Fährten-Event. */
export type TrackEvent =
  | { kind: 'angle'; angleKind: AngleKind | null }
  | { kind: 'object'; material?: MarkerMaterial | string | null };

/** Dübel werden namentlich benannt, alle übrigen Materialien als „Gegenstand". */
export function isDowel(material: MarkerMaterial | string | null | undefined): boolean {
  return material === 'duebel';
}

/**
 * Schlichter Begriff des Events (ohne Distanz) — für Toast und die
 * Sprachbestätigung beim Legen. Nutzt ausschliesslich bereits vorhandene,
 * in allen fünf Sprachen gepflegte Schlüssel.
 */
export function trackEventLabelKey(event: TrackEvent): TranslationKey {
  if (event.kind === 'object') {
    return isDowel(event.material) ? 'track.materialDowel' : 'track.object';
  }
  switch (event.angleKind) {
    case 'links':        return 'track.angleLeftFull';
    case 'rechts':       return 'track.angleRightFull';
    case 'spitz_links':  return 'track.angleAcuteLeftFull';
    case 'spitz_rechts': return 'track.angleAcuteRightFull';
    case 'spitz':        return 'track.angleAcute';
    case 'absatz':       return 'track.angleStep';
    case 'abriss':       return 'track.angleBreak';
    case 'gw':           return 'track.angleGw';
    case 'ow':           return 'track.angleOw';
    case 'bw':           return 'track.angleBw';
    default:             return 'track.angle';
  }
}

/**
 * Vorausschauende Ansage MIT Distanzplatzhalter `{inSteps}` — Absuche.
 * Dieselbe Fallunterscheidung wie oben, nur andere Textform.
 */
export function trackEventGuidanceKey(event: TrackEvent): TranslationKey {
  if (event.kind === 'object') {
    return isDowel(event.material) ? 'track.voiceDowel' : 'track.voiceObject';
  }
  switch (event.angleKind) {
    case 'links':        return 'track.voiceLeft';
    case 'rechts':       return 'track.voiceRight';
    case 'spitz_links':  return 'track.voiceAcuteLeft';
    case 'spitz_rechts': return 'track.voiceAcuteRight';
    case 'spitz':        return 'track.voiceAcute';
    // Absatz hat jetzt eine EIGENE Ansage und fällt nicht mehr in den
    // generischen `track.voiceAngle`-Zweig (Punkt 1 der Vorgabe).
    case 'absatz':       return 'track.voiceAbsatz';
    case 'abriss':       return 'track.voiceBreak';
    case 'gw':           return 'track.voiceGw';
    case 'ow':           return 'track.voiceOw';
    case 'bw':           return 'track.voiceBw';
    default:             return 'track.voiceAngle';
  }
}

/** Bequemer Konstruktor für Winkel-Events. */
export function angleEvent(angleKind: AngleKind | null): TrackEvent {
  return { kind: 'angle', angleKind };
}
/** Bequemer Konstruktor für Gegenstands-/Dübel-Events. */
export function objectEvent(material?: MarkerMaterial | string | null): TrackEvent {
  return { kind: 'object', material };
}
