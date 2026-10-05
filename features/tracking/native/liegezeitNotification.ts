import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  startLiegezeitActivity, endLiegezeitActivity, liegezeitActivityAvailable,
  type LiegezeitActivityIdentity, type LiegezeitActivityLabels,
} from '@/features/tracking/native/liegezeitLiveActivity';
import type { SessionStatus } from '@/features/tracking/store/trackingStore';

// ──────────────────────────────────────────────────────────────────────────
// P4 — Systemnahe Liegezeit-Anzeige (Lockscreen/Notification).
//
// Android: ONGOING lokale Notification (Option A) — KEIN Foreground-Service,
//          KEINE Standort-/Audio-Berechtigung, Play-konform. Eigener Channel.
// iOS:     Live Activity (je dogId + sessionId, Multi-Dog), sonst lokale Notification als Fallback.
//
// Strikt: startet NIE GPS/Standort/Background-Audio. Läuft nur bei status='resting'.
// Fehlende POST_NOTIFICATIONS → still übersprungen (interne Liegezeit läuft weiter).
// ──────────────────────────────────────────────────────────────────────────

export const LIEGEZEIT_CHANNEL_ID = 'liegezeit';
export const LIEGEZEIT_NOTIFICATION_TYPE = 'liegezeit';

export interface LiegezeitMeta { dogId: string; sessionId: string | null; dogName?: string | null; startedAt: number }

// ── Reine, testbare Logik ──
// Die Anzeige ist genau dann aktiv, wenn die Session in der Liegezeit ist.
export function liegezeitShouldBeActive(status: SessionStatus | null | undefined): boolean {
  return status === 'resting';
}

export function fmtSince(startedAt: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.floor((now - startedAt) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

// Baut den Notification-Inhalt inkl. Deep-Link-Daten (sessionId für „exakt diese Session").
export function buildLiegezeitContent(meta: LiegezeitMeta, now: number = Date.now()) {
  const title = meta.dogName ? `Fährte – Liegezeit (${meta.dogName})` : 'Fährte – Liegezeit läuft';
  const body = `Liegezeit läuft · seit ${fmtSince(meta.startedAt, now)}`;
  return {
    title, body,
    data: { type: LIEGEZEIT_NOTIFICATION_TYPE, sessionId: meta.sessionId ?? '' },
    sticky: true, autoDismiss: false,   // Android: ongoing/persistent
  };
}

// ── Native Nebenwirkungen (best-effort, wirft nie) ──
let androidId: string | null = null;
let iosFallbackId: string | null = null;
let channelEnsured = false;

async function ensureChannel(): Promise<void> {
  if (channelEnsured || Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(LIEGEZEIT_CHANNEL_ID, {
      name: 'Fährte – Liegezeit',
      importance: Notifications.AndroidImportance.LOW,   // kein Ton
      enableVibrate: false,
      showBadge: false,
    });
    channelEnsured = true;
  } catch { /* best-effort */ }
}

async function hasNotificationPermission(): Promise<boolean> {
  try { const p = await Notifications.getPermissionsAsync(); return !!(p.granted || p.status === 'granted'); }
  catch { return false; }
}

// Liegezeit-Anzeige starten (idempotent). Startet KEIN GPS/Standort.
// `labels`: lokalisierte Live-Activity-Beschriftungen (ANYVO-i18n) — nur iOS.
export async function startLiegezeitNotification(meta: LiegezeitMeta, labels: LiegezeitActivityLabels): Promise<void> {
  try {
    if (Platform.OS === 'ios' && liegezeitActivityAvailable()) {
      startLiegezeitActivity(meta, labels);   // Live Activity GENAU dieser Fährte
      return;
    }
    // Android + iOS-Fallback: ongoing lokale Notification.
    if (!(await hasNotificationPermission())) return;   // fehlende Berechtigung → intern weiterlaufen
    await ensureChannel();
    const content = buildLiegezeitContent(meta);
    const id = await Notifications.scheduleNotificationAsync({
      content: { ...content, ...(Platform.OS === 'android' ? { channelId: LIEGEZEIT_CHANNEL_ID } : {}) } as any,
      trigger: null,
    });
    if (Platform.OS === 'ios') iosFallbackId = id; else androidId = id;
  } catch { /* best-effort — Liegezeit läuft intern weiter */ }
}

// Anzeige aktualisieren (gedrosselt aufrufen, z. B. bei App-Rückkehr). Kein Ton.
export async function updateLiegezeitNotification(meta: LiegezeitMeta, labels: LiegezeitActivityLabels): Promise<void> {
  if (Platform.OS === 'ios' && liegezeitActivityAvailable()) return;   // Live Activity: Timer rendert SwiftUI, kein JS-Tick
  if (!androidId && !iosFallbackId) return;                            // nichts aktiv
  await endLiegezeitNotification(meta);
  await startLiegezeitNotification(meta, labels);
}

// Anzeige beenden (searching/completed/cancelled). Idempotent, wirft nie.
// iOS: nur die Live Activity GENAU dieser Fährte (dogId + sessionId) — andere Hunde bleiben.
export async function endLiegezeitNotification(identity: LiegezeitActivityIdentity): Promise<void> {
  try {
    if (Platform.OS === 'ios') await endLiegezeitActivity(identity);
    if (androidId) { await Notifications.dismissNotificationAsync(androidId); androidId = null; }
    if (iosFallbackId) { await Notifications.dismissNotificationAsync(iosFallbackId); iosFallbackId = null; }
  } catch { /* best-effort */ }
}
