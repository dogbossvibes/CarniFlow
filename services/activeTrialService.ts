import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { ACTIVE_TRIAL_EVENTS, type ActiveTrialEvent } from '@/features/subscription/activeTrial';

// Serverseitiger ACTIVE-Trial-Status (auf der bestehenden `subscriptions`-Tabelle,
// erweitert um active_trial_*). Verhindert erneutes Triggern durch Logout/Reinstall
// und misst den Funnel. Diese Daten sind NICHT Ersatz für Apple-/Google-/RevenueCat-
// Eligibility — der `started`-Status ist der plattformübergreifende Anti-Abuse-Marker.
// Alle Funktionen sind tolerant gegenüber noch nicht ausgeführter Migration (kein Crash).

export interface ActiveTrialStatus {
  offeredAt:  string | null;
  startedAt:  string | null;
  platform:   string | null;
  offerCount: number;
}

const NEUTRAL: ActiveTrialStatus = { offeredAt: null, startedAt: null, platform: null, offerCount: 0 };

export async function getActiveTrialStatus(userId: string): Promise<ActiveTrialStatus> {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('active_trial_offered_at, active_trial_started_at, active_trial_platform, active_trial_offer_count')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return NEUTRAL;
    const d = data as Record<string, unknown>;
    return {
      offeredAt:  (d.active_trial_offered_at as string) ?? null,
      startedAt:  (d.active_trial_started_at as string) ?? null,
      platform:   (d.active_trial_platform as string) ?? null,
      offerCount: (d.active_trial_offer_count as number) ?? (d.active_trial_offered_at ? 1 : 0),
    };
  } catch {
    return NEUTRAL;
  }
}

// „Angebot gezeigt" markieren (Frequency-Capping + Funnel). Best-effort UPSERT; auf
// Konflikt (bestehende Zeile) werden nur die Trial-Offer-Felder gesetzt, Plan/Status
// bleiben unangetastet. Verbraucht KEINE Eligibility (kein started_at).
export async function markActiveTrialOffered(userId: string): Promise<void> {
  try {
    const cur = await getActiveTrialStatus(userId);
    await supabase.from('subscriptions').upsert({
      user_id:                  userId,
      active_trial_offered_at:  new Date().toISOString(),
      active_trial_offer_count: (cur.offerCount ?? 0) + 1,
      updated_at:               new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch { /* best-effort: fällt auf lokales Cooldown zurück */ }
}

// „Trial gestartet" markieren — NACH bestätigtem Store-Purchase. Idempotent: setzt
// started_at nur, wenn noch nicht gesetzt (kein zweiter Trial durch Plattformwechsel).
export async function markActiveTrialStarted(userId: string, platform: string = Platform.OS): Promise<void> {
  try {
    await supabase.from('subscriptions')
      .update({
        active_trial_started_at: new Date().toISOString(),
        active_trial_platform:   platform,
        updated_at:              new Date().toISOString(),
      })
      .eq('user_id', userId)
      .is('active_trial_started_at', null);
  } catch { /* best-effort */ }
}

// ── Funnel-Analytics-Seam ────────────────────────────────────────────────────
// KEINE zweite Analytics-Lösung: dünner, zentraler Einstiegspunkt. Aktuell nur
// DEV-Log; produktiv später an eine bestehende Analytics-Senke anzuhängen. Die
// Kern-Funnel-Zahlen sind zusätzlich serverseitig aus subscriptions.active_trial_*
// + dem Abo-/RevenueCat-Status ableitbar.
export function logActiveTrialEvent(event: ActiveTrialEvent, props?: Record<string, string | number | boolean | null>): void {
  if (__DEV__) console.log(`[analytics] ${event}`, props ?? {});
}

export const ACTIVE_TRIAL_ANALYTICS = ACTIVE_TRIAL_EVENTS;
