import { Platform } from 'react-native';

// ──────────────────────────────────────────────────────────────────────────
// Dünner Wrapper um expo-live-activity (Software Mansion) für die Fährten-
// Aufnahme. Zeigt Timer + Distanz auf Lockscreen / Dynamic Island (iOS 16.2+).
//
// • iOS-only: auf Android / älteren iOS-Versionen sind alle Funktionen no-op.
// • Lazy-Require: das native Modul wird NUR auf iOS geladen, damit der
//   Android-Build/-Start nicht über ein fehlendes Native-Modul stolpert.
// • Updates bewusst gedrosselt (alle paar Sekunden, nicht im Sekundentakt) —
//   Apple throttelt häufige Live-Activity-Updates.
// ──────────────────────────────────────────────────────────────────────────

type LiveActivityLib = typeof import('expo-live-activity');
let lib: LiveActivityLib | null = null;
let resolved = false;

function getLib(): LiveActivityLib | null {
  if (Platform.OS !== 'ios') return null;
  if (!resolved) {
    resolved = true;
    try { lib = require('expo-live-activity') as LiveActivityLib; }
    catch (e) { console.warn('[liveActivity] Modul nicht verfügbar', e); lib = null; }
  }
  return lib;
}

let activityId: string | null = null;

function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function fmtDist(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

/** Live Activity beim Aufnahmestart anlegen. Idempotent. */
export function startFaehrteActivity(dogName?: string): void {
  const la = getLib();
  if (!la || activityId) return;
  try {
    const title = dogName ? `🐾 Fährte – ${dogName}` : '🐾 Fährte läuft';
    const id = la.startActivity(
      { title, subtitle: `${fmtDist(0)} · ${fmtClock(0)}` },
      {
        backgroundColor:        '#0F1115',
        titleColor:             '#FFFFFF',
        subtitleColor:          '#15E6C3',
        progressViewTint:       '#15E6C3',
        progressViewLabelColor: '#FFFFFF',
        deepLinkUrl:            '/track/legen',
        timerType:              'digital',
      },
    );
    activityId = id ?? null;
  } catch (e) { console.warn('[liveActivity] start', e); }
}

/** Laufende Live Activity mit Timer/Distanz aktualisieren (gedrosselt aufrufen). */
export function updateFaehrteActivity(opts: { elapsedS: number; distanceM: number; paused?: boolean; dogName?: string }): void {
  const la = getLib();
  if (!la || !activityId) return;
  try {
    const title = opts.paused
      ? '⏸︎ Fährte pausiert'
      : (opts.dogName ? `🐾 Fährte – ${opts.dogName}` : '🐾 Fährte läuft');
    la.updateActivity(activityId, {
      title,
      subtitle: `${fmtDist(opts.distanceM)} · ${fmtClock(opts.elapsedS)}`,
    });
  } catch (e) { console.warn('[liveActivity] update', e); }
}

/** Live Activity beim Beenden schliessen. Idempotent. */
export function stopFaehrteActivity(opts?: { elapsedS: number; distanceM: number }): void {
  const la = getLib();
  if (!la || !activityId) return;
  try {
    la.stopActivity(activityId, {
      title: '✓ Fährte beendet',
      subtitle: opts ? `${fmtDist(opts.distanceM)} · ${fmtClock(opts.elapsedS)}` : undefined,
    });
  } catch (e) { console.warn('[liveActivity] stop', e); }
  activityId = null;
}
