import { Platform } from 'react-native';

// ──────────────────────────────────────────────────────────────────────────
// iOS Live Activity für die LIEGEZEIT (P4). Eigener Activity-Slot, zeitlich
// exklusiv zur Lege-Activity (faehrteLiveActivity): das Legen endet, BEVOR die
// Liegezeit beginnt. KEIN GPS, KEIN Standort, KEIN Background-Mode.
//
// • iOS-only, Lazy-Require (Android/ältere iOS = no-op).
// • Systemseitige Zeitdarstellung bevorzugt (timerType 'digital'); die Anzeige
//   wird NICHT im Sekundentakt aus JS aktualisiert.
// • Deep-Link zurück auf die laufende Liegezeit-Session.
// ──────────────────────────────────────────────────────────────────────────

type LiveActivityLib = typeof import('expo-live-activity');
let lib: LiveActivityLib | null = null;
let resolved = false;
let activityId: string | null = null;

function getLib(): LiveActivityLib | null {
  if (Platform.OS !== 'ios') return null;
  if (!resolved) {
    resolved = true;
    try { lib = require('expo-live-activity') as LiveActivityLib; }
    catch (e) { if (__DEV__) console.warn('[liegezeitLiveActivity] Modul nicht verfügbar', e); lib = null; }
  }
  return lib;
}

export function liegezeitActivityAvailable(): boolean {
  return getLib() != null;
}

export interface LiegezeitActivityMeta { sessionId: string | null; dogName?: string | null; startedAt: number }

// Live Activity beim Liegezeit-Start anlegen. Idempotent (mehrfacher Start → no-op).
export function startLiegezeitActivity(meta: LiegezeitActivityMeta): void {
  const la = getLib();
  if (!la || activityId) return;
  try {
    const title = meta.dogName ? `Liegezeit – ${meta.dogName}` : 'Fährte – Liegezeit';
    const deepLinkUrl = meta.sessionId ? `/track/liegen?id=${meta.sessionId}` : '/track/liegen';
    const id = la.startActivity(
      { title, subtitle: 'Fährte reift …' },
      { backgroundColor: '#0F1115', titleColor: '#FFFFFF', subtitleColor: '#15E6C3', deepLinkUrl, timerType: 'digital' },
    );
    activityId = id ?? null;
  } catch (e) { if (__DEV__) console.warn('[liegezeitLiveActivity] start', e); }
}

// Liegezeit-Activity beenden (searching/completed/cancelled). Idempotent.
export function endLiegezeitActivity(): void {
  const la = getLib();
  if (!la || !activityId) { activityId = null; return; }
  try { la.stopActivity(activityId, { title: 'Liegezeit beendet' }); }
  catch (e) { if (__DEV__) console.warn('[liegezeitLiveActivity] stop', e); }
  activityId = null;
}

// Nur für Tests / Diagnose.
export function _hasLiegezeitActivity(): boolean { return activityId != null; }
