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
