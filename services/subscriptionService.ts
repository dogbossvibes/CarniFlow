import { supabase } from '@/lib/supabase';
import type { Tier } from '@/lib/purchases';
import {
  planToCapabilities, PLAN_META, TRIAL_DAYS, normalizeSubscriptionPlan,
  type SubscriptionPlan, type SubscriptionStatus,
} from '@/features/subscription/plans';
import { setCapabilities } from '@/services/capabilityService';

export interface Subscription {
  id:         string;
  user_id:    string;
  tier:       Tier;
  product_id: string | null;
  status:     string;
  store:      string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

// Abo-Beleg upserten (ein Eintrag pro Nutzer). Best-effort, blockiert den
// Kauf-Flow nicht; das Gating selbst läuft über profiles.plan/role.
export async function recordSubscription(args: {
  userId: string; tier: Tier; productId?: string | null; expiresAt?: string | null;
}) {
  try {
    await supabase.from('subscriptions').upsert({
      user_id:    args.userId,
      tier:       args.tier,
      product_id: args.productId ?? null,
      status:     'active',
      store:      'app_store',
      expires_at: args.expiresAt ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch { /* Beleg ist optional */ }
}

export function getMySubscription(userId: string) {
  return supabase.from('subscriptions').select('*').eq('user_id', userId).maybeSingle();
}

// ── Subscription V2 (4 Pläne + Founder) ──────────────────────
export interface PlanSubscription {
  plan:                   SubscriptionPlan | null;
  status:                 SubscriptionStatus | null;
  trial_ends_at:          string | null;
  current_period_ends_at: string | null;
  cancel_at_period_end:   boolean | null;
}

// Aktuelles Abo (plan/status) lesen — Quelle für hasCapability.
// Tolerant gegenüber noch nicht migrierter Spalte cancel_at_period_end: schlägt
// der Select fehl (Spalte fehlt), ohne diese Spalte erneut lesen (Default false).
export async function getPlanSubscription(userId: string): Promise<PlanSubscription | null> {
  // Abwärtskompatibilität: Legacy-DB-Wert 'beginner_trial' wird beim LESEN auf
  // 'newbie' normalisiert (siehe normalizeSubscriptionPlan). Nie neu gespeichert.
  const norm = (d: PlanSubscription | null): PlanSubscription | null =>
    d ? { ...d, plan: normalizeSubscriptionPlan(d.plan) } : null;

  const full = await supabase
    .from('subscriptions')
    .select('plan, status, trial_ends_at, current_period_ends_at, cancel_at_period_end')
    .eq('user_id', userId).maybeSingle();
  if (!full.error) return norm((full.data as PlanSubscription) ?? null);

  const { data } = await supabase
    .from('subscriptions')
    .select('plan, status, trial_ends_at, current_period_ends_at')
    .eq('user_id', userId).maybeSingle();
  return data ? norm({ ...(data as PlanSubscription), cancel_at_period_end: false }) : null;
}

// Testabo kündigen: markiert das Abo als „zum Periodenende gekündigt". Der Status
// bleibt 'trialing', d. h. der Zugriff läuft NORMAL bis trial_ends_at weiter und
// endet dann automatisch (siehe isTrialLapsed im Gating). Da der Newbie-Trial
// app-verwaltet ist (kein Apple-Kauf, keine Auto-Abbuchung), reicht dieser Marker.
export async function cancelTrial(userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('subscriptions')
    .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  return { error: error?.message ?? null };
}

// Plan aktivieren: subscriptions schreiben + user_capabilities daraus ableiten
// + profiles.plan spiegeln (Abwärtskompatibilität fürs bestehende Gating).
export async function activatePlan(args: {
  userId: string;
  plan: SubscriptionPlan;
  status?: SubscriptionStatus;
  periodEndsAt?: string | null;
  trialEndsAt?: string | null;
  providerProductId?: string | null;
  providerSubscriptionId?: string | null;
}): Promise<{ error: string | null }> {
  const meta = PLAN_META[args.plan];
  const status: SubscriptionStatus = args.status ?? (args.plan === 'newbie' ? 'trialing' : 'active');
  const caps = planToCapabilities(args.plan);
  try {
    const { error } = await supabase.from('subscriptions').upsert({
      user_id: args.userId,
      plan: args.plan,
      status,
      tier: args.plan === 'trainer' ? 'trainer' : 'pro',   // Altbestand-Spalte mitführen
      product_id: meta.productId,
      provider: 'app_store',
      store: 'app_store',
      provider_product_id: args.providerProductId ?? meta.productId,
      provider_subscription_id: args.providerSubscriptionId ?? null,
      trial_ends_at: args.trialEndsAt ?? null,
      current_period_ends_at: args.periodEndsAt ?? null,
      expires_at: args.periodEndsAt ?? args.trialEndsAt ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) return { error: error.message };

    // Runtime-Capabilities + profiles spiegeln.
    await setCapabilities(args.userId, caps);
    await supabase.from('profiles').update({
      plan: 'premium',
      plan_expires_at: args.periodEndsAt ?? args.trialEndsAt ?? null,
      trial_used: true,
      is_trainer: caps.trainer_module,
    }).eq('id', args.userId);
    return { error: null };
  } catch (e: any) {
    return { error: e?.message ?? 'Aktivierung fehlgeschlagen' };
  }
}

export const trialEndDate = () => new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString();

// Founder-Slots: Status lesen + beanspruchen (Edge Function).
export async function getFounderSlots(): Promise<{ used: number; remaining: number }> {
  try {
    const { data } = await supabase.rpc('founder_slots_status');
    const row = Array.isArray(data) ? data[0] : data;
    return { used: row?.slots_used ?? 0, remaining: row?.slots_remaining ?? 0 };
  } catch { return { used: 0, remaining: 0 }; }
}

export async function claimFounderSlot(): Promise<{ ok: boolean; remaining: number; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('claim-founder-active');
    if (error) throw error;
    if (!data?.success) return { ok: false, remaining: data?.slotsRemaining ?? 0, error: data?.error ?? 'Founder offer sold out' };
    return { ok: true, remaining: data.slotsRemaining ?? 0 };
  } catch (e: any) {
    return { ok: false, remaining: 0, error: e?.message ?? 'Founder-Slot fehlgeschlagen' };
  }
}
