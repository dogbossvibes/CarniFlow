import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  startLiegezeitActivity, endLiegezeitActivity, liegezeitActivityAvailable,
} from '@/features/tracking/native/liegezeitLiveActivity';
import type { SessionStatus } from '@/features/tracking/store/trackingStore';

// ──────────────────────────────────────────────────────────────────────────
// P4 — Systemnahe Liegezeit-Anzeige (Lockscreen/Notification).
//
// Android: ONGOING lokale Notification (Option A) — KEIN Foreground-Service,
//          KEINE Standort-/Audio-Berechtigung, Play-konform. Eigener Channel.
// iOS:     Live Activity, sonst lokale Notification als Fallback.
//
// Strikt: startet NIE GPS/Standort/Background-Audio. Läuft nur bei status='resting'.
// Fehlende POST_NOTIFICATIONS → still übersprungen (interne Liegezeit läuft weiter).
// ──────────────────────────────────────────────────────────────────────────

export const LIEGEZEIT_CHANNEL_ID = 'liegezeit';
export const LIEGEZEIT_NOTIFICATION_TYPE = 'liegezeit';

export interface LiegezeitMeta { sessionId: string | null; dogName?: string | null; startedAt: number }

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
export async function startLiegezeitNotification(meta: LiegezeitMeta): Promise<void> {
  try {
    if (Platform.OS === 'ios' && liegezeitActivityAvailable()) {
      startLiegezeitActivity(meta);   // Live Activity
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
export async function updateLiegezeitNotification(meta: LiegezeitMeta): Promise<void> {
  if (Platform.OS === 'ios' && liegezeitActivityAvailable()) return;   // Live Activity: kein JS-Tick nötig
  if (!androidId && !iosFallbackId) return;                            // nichts aktiv
  await endLiegezeitNotification();
  await startLiegezeitNotification(meta);
}

// Anzeige beenden (searching/completed/cancelled). Idempotent, wirft nie.
export async function endLiegezeitNotification(): Promise<void> {
  try {
    if (Platform.OS === 'ios') endLiegezeitActivity();
    if (androidId) { await Notifications.dismissNotificationAsync(androidId); androidId = null; }
    if (iosFallbackId) { await Notifications.dismissNotificationAsync(iosFallbackId); iosFallbackId = null; }
  } catch { /* best-effort */ }
}
