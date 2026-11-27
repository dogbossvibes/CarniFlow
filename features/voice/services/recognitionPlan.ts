import type { RecognitionSetup } from './recognitionSetup';

// Reine Regeln für den Betrieb der Spracherkennung (Release-Review 2026-11-25).
// Kein Expo, kein React: alles hier ist mit Jest prüfbar.
//
// 1) Ergebnis: expo-speech-recognition liefert in `results` die ALTERNATIVEN einer
//    Äusserung, die beste zuerst. Ausgewertet wird nur results[0]; zusätzlich wird
//    nur eine Alternative angefordert (maxAlternatives: 1).
// 2) iOS bis 17: Mit continuous=true kommt ein Endergebnis erst beim Stopp. Darum dort
//    continuous=false (eine Äusserung je Sitzung, danach Neustart) und interimResults=true:
//    ein Zwischenergebnis zählt, sobald es STABIL_MS unverändert bleibt (sonst wartet iOS
//    bis 3 s Stille). Pro Sitzung wird höchstens EIN Befehl ausgelöst, danach wird die
//    Sitzung abgebrochen und neu gestartet, damit das spätere Endergebnis derselben
//    Äusserung nichts doppelt auslöst.
//    iOS 18+ und Android: continuous=true mit Endergebnissen je Äusserung (unverändert).
// 4) Neustart nach Fehlern mit wachsender Pause; nach MAX_FAILED_RESTARTS Fehlern in Folge
//    hört die Erkennung auf (Status «error»), statt endlos neu zu starten.

export interface PlatformInfo { os: string; version: string | number }

/** iOS bis Version 17: Endergebnis erst beim Stopp, darum eigener Betrieb. */
export function isLegacyIos(platform: PlatformInfo): boolean {
  if (platform.os !== 'ios') return false;
  const major = typeof platform.version === 'number' ? Math.floor(platform.version) : parseInt(String(platform.version), 10);
  return Number.isFinite(major) && major < 18;
}

export interface ListenOptions {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: 1; addsPunctuation: false;
  requiresOnDeviceRecognition: boolean; contextualStrings: string[];
}

export function recognitionOptions(platform: PlatformInfo, setup: RecognitionSetup, contextualStrings: readonly string[]): ListenOptions {
  const legacy = isLegacyIos(platform);
  return {
    lang: setup.lang, maxAlternatives: 1, addsPunctuation: false, requiresOnDeviceRecognition: setup.onDevice,
    contextualStrings: [...contextualStrings],
    interimResults: legacy, continuous: !legacy,
  };
}

/** Beste Alternative (expo-speech-recognition: beste zuerst). */
export function bestTranscript(results: readonly { transcript?: string | null }[] | null | undefined): string | null {
  const first = results?.[0]?.transcript;
  return typeof first === 'string' && first.trim() ? first : null;
}

/** Wie lange ein Zwischenergebnis unverändert bleiben muss (iOS bis 17). */
export const STABLE_MS = 700;

/**
 * Ein Befehl je Erkennungssitzung (iOS bis 17). push() bei jedem Ergebnis, due() im Takt.
 * Rückgabe: Text, der jetzt ausgewertet werden soll, sonst null. consume() nach einer
 * Wirkung: bis newSession() wird nichts mehr geliefert.
 */
export function createSessionGate(stableMs = STABLE_MS) {
  let last: { text: string; atMs: number } | null = null;
  let consumed = false;
  return {
    push(text: string | null, isFinal: boolean, nowMs: number): string | null {
      if (consumed || !text) return null;
      if (isFinal) { last = null; return text; }
      if (!last || last.text !== text) last = { text, atMs: nowMs };
      return null;
    },
    due(nowMs: number): string | null {
      if (consumed || !last || nowMs - last.atMs < stableMs) return null;
      const text = last.text;
      last = null;   // dasselbe stabile Zwischenergebnis nur einmal liefern
      return text;
    },
    consume() { consumed = true; last = null; },
    newSession() { consumed = false; last = null; },
    get consumed() { return consumed; },
  };
}

/** Fehler, nach denen die Erkennung NICHT neu startet (Rechte fehlen, Sprache fehlt). */
const FATAL = new Set(['not-allowed', 'service-not-allowed', 'language-not-supported']);
/** Normale Ereignisse im Feld: sofort weiter (kurze Pause gegen Leerlauf-Schleifen). */
const NORMAL = new Set(['no-speech', 'speech-timeout', 'aborted', 'nomatch']);

export type RecognitionErrorKind = 'fatal' | 'normal' | 'transient';
export function classifyError(code: string | null | undefined): RecognitionErrorKind {
  if (code && FATAL.has(code)) return 'fatal';
  if (code && NORMAL.has(code)) return 'normal';
  return 'transient';   // network, audio-capture, interrupted, busy, client, unbekannt …
}

export const NORMAL_RESTART_MS = 250;
export const RESTART_BACKOFF_MS = [500, 1000, 2000, 4000, 8000] as const;
export const MAX_FAILED_RESTARTS = RESTART_BACKOFF_MS.length;

/** Pause vor dem nächsten Start; null = aufhören. failures = Fehler in Folge (0 = keiner). */
export function restartDelay(failures: number): number | null {
  if (failures <= 0) return NORMAL_RESTART_MS;
  if (failures > MAX_FAILED_RESTARTS) return null;
  return RESTART_BACKOFF_MS[failures - 1];
}
