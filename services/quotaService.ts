import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import type { QuotaKind } from '@/features/subscription/plans';

export type QuotaStatus = 'ok' | 'exceeded' | 'error';
export interface QuotaResult { status: QuotaStatus; used: number; limit: number; error?: string }

export interface QuotaBlock { message: string; code: 'quota_exceeded' | 'quota_error' }

// Serverautoritativer, atomarer + idempotenter NEWBIE-Quota-Claim via RPC
// claim_newbie_quota (SUBSCRIPTION_NEWBIE_QUOTAS_SETUP.sql).
//
// - training/track: `ref` = stabile (client-generierte) Session-/Track-UUID →
//   der Claim ist idempotent über Offline-Sync, Retry und Resume hinweg
//   (derselbe ref verbraucht KEIN zweites Kontingent).
// - Premium (pro_member=true) wird serverseitig erkannt → status 'ok', kein Verbrauch.
//
// Fail-Verhalten:
//   • quota_exceeded → status 'exceeded' (Upgrade-UX).
//   • RPC/Netz nicht erreichbar:
//       – PRODUCTION: status 'error' (FAIL-CLOSED, KEIN Bypass) → Retry-Hinweis.
//       – DEV: status 'ok' mit klar markiertem [dev-bypass] (pragmatischer Fallback).
export async function claimNewbieQuota(kind: QuotaKind, ref: string): Promise<QuotaResult> {
  try {
    const { data, error } = await supabase.rpc('claim_newbie_quota', { p_kind: kind, p_ref: ref });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.success === true) return { status: 'ok', used: row.used ?? 0, limit: row.limit ?? 0 };
    return { status: 'exceeded', used: row?.used ?? 0, limit: row?.limit ?? 0 };
  } catch (e) {
    if (__DEV__) return { status: 'ok', used: 0, limit: 0, error: `[dev-bypass] ${(e as Error)?.message ?? e}` };
    return { status: 'error', used: 0, limit: 0, error: (e as Error)?.message };   // Production: fail-closed
  }
}

// Gibt eine Fährten-Buchung zurück, wenn die Aufnahme nie zustande kam (RPC
// release_newbie_quota, supabase/migrations/20261123200000_newbie_track_claim_release.sql).
// Der Server entscheidet: nur eigene, frische (≤ 24 h) Buchung im laufenden Monat und nur,
// wenn es unter `ref` keine Fährte gibt. Best-effort: Fehler (Netz, Funktion noch nicht
// vorhanden) ändern nichts am Ablauf, die Buchung bleibt dann wie bisher bestehen.
export async function releaseNewbieQuota(kind: 'track', ref: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('release_newbie_quota', { p_kind: kind, p_ref: ref });
    if (error || data !== true) return false;
    await rememberReleasedTrack(ref);
    return true;
  } catch { return false; }
}

// Lokal gemerkte, zurückgegebene Fährten: nur sie buchen beim Wiederöffnen erneut. Fährten
// ohne Rückgabe (auch alle vor dieser Änderung gelegten) öffnen wie bisher ohne Buchung.
const RELEASED_KEY = 'newbie_released_tracks_v1';
async function readReleased(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RELEASED_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}
async function rememberReleasedTrack(ref: string): Promise<void> {
  try {
    const list = await readReleased();
    if (!list.includes(ref)) await AsyncStorage.setItem(RELEASED_KEY, JSON.stringify([...list, ref].slice(-50)));
  } catch { /* best-effort */ }
}
export async function wasTrackReleased(ref: string): Promise<boolean> {
  return (await readReleased()).includes(ref);
}
export async function forgetReleasedTrack(ref: string): Promise<void> {
  try {
    const list = await readReleased();
    if (list.includes(ref)) await AsyncStorage.setItem(RELEASED_KEY, JSON.stringify(list.filter(x => x !== ref)));
  } catch { /* best-effort */ }
}

// Übersetzt einen QuotaStatus in einen Fehler, der den Save-/Start-Flow abbricht.
// null = ok (fortfahren). Der Code steuert die UX (Upgrade vs. Retry).
export function quotaBlock(status: QuotaStatus): QuotaBlock | null {
  if (status === 'ok') return null;
  return status === 'exceeded'
    ? { code: 'quota_exceeded', message: 'quota_exceeded' }
    : { code: 'quota_error', message: 'quota_error' };
}

// Rest-/Verbrauchsanzeige (Dog = Ist-Bestand, Training/Track = Monats-Claims).
export async function newbieQuotaStatus(kind: QuotaKind): Promise<{ used: number; limit: number }> {
  try {
    const { data } = await supabase.rpc('newbie_quota_status', { p_kind: kind });
    const row = Array.isArray(data) ? data[0] : data;
    return { used: row?.used ?? 0, limit: row?.limit ?? 0 };
  } catch { return { used: 0, limit: 0 }; }
}
