import { Platform } from 'react-native';
import {
  endRestingActivity, isRestingActivityModuleAvailable, isRestingActivitySupported, startRestingActivity,
} from '@/modules/anyvo-resting-activity';

// ──────────────────────────────────────────────────────────────────────────
// iOS Live Activity für die LIEGEZEIT.
//
// V2 (natives Modul anyvo-resting-activity, eigener ActivityAttributes-Typ):
//   • eine Activity JE offener Fährte, eindeutig über dogId + sessionId (Multi-Dog,
//     kein Singleton, kein „latest/first"-Fallback)
//   • echter Hundename + fachlicher Liegezeit-Beginn (persistierter Zeitstempel)
//   • die laufende Zeit rendert SwiftUI selbst (Text-Timer) — KEIN JS-Timer, KEIN
//     sekündliches Update, KEIN Polling über die Bridge
//   • Deep-Link exakt auf diese Fährte (anyvo://track/liegen?dogId=…&id=…)
// V1-Fallback (nur ohne V2-Modul, z. B. älterer Build): expo-live-activity, ebenfalls
//   je dogId + sessionId verwaltet; ohne Timer (das V1-Widget kann nicht hochzählen).
//
// Die Activity ist NUR Darstellung — nie Source of Truth für offen/abgebrochen/Hund.
// iOS-only, Android/ältere iOS = no-op. KEIN GPS, KEIN Standort.
// ──────────────────────────────────────────────────────────────────────────

/** App-Schema aus app.json („scheme"). */
export const ANYVO_URL_SCHEME = 'anyvo';

export interface LiegezeitActivityIdentity { dogId: string; sessionId: string | null }

export interface LiegezeitActivityMeta extends LiegezeitActivityIdentity {
  /** Anzeigename des Hundes (beim Start bekannt). Leer → neutrale Beschriftung, nie „Hund". */
  dogName?: string | null;
  /** Fachlicher Beginn der Liegezeit (ms) — derselbe Zeitstempel wie die Liegezeit-Anzeige der App. */
  startedAt: number;
}

/** Bereits lokalisierte Beschriftungen (ANYVO-i18n, App-Sprache). */
export interface LiegezeitActivityLabels { lying: string; since: string; fallbackTitle: string }

/** Pfad + Query auf GENAU diese Fährte (beide Identitätsparameter). */
export function restingDeepLinkPath(dogId: string, sessionId: string): string {
  return `/track/liegen?dogId=${encodeURIComponent(dogId)}&id=${encodeURIComponent(sessionId)}`;
}

/** Vollständige Deep-Link-URL (V2-Widget öffnet sie direkt). */
export function restingDeepLinkUrl(dogId: string, sessionId: string): string {
  return `${ANYVO_URL_SCHEME}:/${restingDeepLinkPath(dogId, sessionId)}`;
}

const key = (dogId: string, sessionId: string) => `${dogId}\u0000${sessionId}`;

// ── V1-Fallback (expo-live-activity) ──
type LiveActivityLib = typeof import('expo-live-activity');
let lib: LiveActivityLib | null = null;
let resolved = false;
const v1Ids = new Map<string, string>();   // dogId+sessionId → V1-Activity-ID (nur dieser Prozess)

function getV1Lib(): LiveActivityLib | null {
  if (Platform.OS !== 'ios') return null;
  if (!resolved) {
    resolved = true;
    try { lib = require('expo-live-activity') as LiveActivityLib; }
    catch (e) { if (__DEV__) console.warn('[liegezeitLiveActivity] Modul nicht verfügbar', e); lib = null; }
  }
  return lib;
}

function hasV2(): boolean {
  return Platform.OS === 'ios' && isRestingActivityModuleAvailable();
}

export function liegezeitActivityAvailable(): boolean {
  if (Platform.OS !== 'ios') return false;
  return hasV2() ? isRestingActivitySupported() : getV1Lib() != null;
}

function fmtClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Live Activity für genau diese Fährte starten. Idempotent je dogId + sessionId.
 * Ohne sessionId/dogId/Startzeit keine Activity (keine eindeutige Identität → fail closed).
 */
export function startLiegezeitActivity(meta: LiegezeitActivityMeta, labels: LiegezeitActivityLabels): void {
  if (Platform.OS !== 'ios' || !meta.dogId || !meta.sessionId || !(meta.startedAt > 0)) return;
  const dogName = meta.dogName?.trim() || labels.fallbackTitle;
  if (hasV2()) {
    startRestingActivity({
      dogId: meta.dogId,
      sessionId: meta.sessionId,
      dogName,
      lyingStartedAtMs: meta.startedAt,
      lyingLabel: labels.lying,
      sinceLabel: labels.since,
      deepLinkUrl: restingDeepLinkUrl(meta.dogId, meta.sessionId),
    });
    return;
  }
  const la = getV1Lib();
  const k = key(meta.dogId, meta.sessionId);
  if (!la || v1Ids.has(k)) return;
  try {
    const id = la.startActivity(
      { title: `${dogName} · ${labels.lying}`, subtitle: `${labels.since} ${fmtClock(meta.startedAt)}` },
      // Das V1-Widget setzt das Schema selbst davor → nur Pfad + Query.
      { backgroundColor: '#0F1115', titleColor: '#FFFFFF', subtitleColor: '#15E6C3',
        deepLinkUrl: restingDeepLinkPath(meta.dogId, meta.sessionId), timerType: 'digital' },
    );
    if (id) v1Ids.set(k, id);
  } catch (e) { if (__DEV__) console.warn('[liegezeitLiveActivity] start', e); }
}

/** Activity GENAU dieser Fährte beenden (andere Hunde/Sessions bleiben). Idempotent. */
export async function endLiegezeitActivity(identity: LiegezeitActivityIdentity): Promise<void> {
  if (Platform.OS !== 'ios' || !identity.dogId || !identity.sessionId) return;
  if (hasV2()) { await endRestingActivity(identity.dogId, identity.sessionId); return; }
  const k = key(identity.dogId, identity.sessionId);
  const id = v1Ids.get(k);
  v1Ids.delete(k);
  const la = getV1Lib();
  if (!la || !id) return;
  // V1 verlangt beim Beenden einen Titel; die Activity verschwindet sofort.
  try { la.stopActivity(id, { title: ' ' }); }
  catch (e) { if (__DEV__) console.warn('[liegezeitLiveActivity] stop', e); }
}

// Nur für Tests / Diagnose.
export function _v1ActivityCount(): number { return v1Ids.size; }
