import { supabase } from '@/lib/supabase';

// Manuelle/Lifetime-Entitlements (Tabelle user_entitlements). Zusätzlich zur
// Apple/Google-Abo-Logik. User dürfen nur eigene Zeilen lesen (RLS).
export type EntitlementPlanType = 'free' | 'active' | 'trainer' | 'lifetime_active' | 'lifetime_trainer';
export type EntitlementSource   = 'apple' | 'google' | 'manual' | 'founder' | 'admin';

export interface UserEntitlement {
  id:             string;
  user_id:        string;
  plan_type:      EntitlementPlanType;
  source:         EntitlementSource;
  is_lifetime:    boolean;
  active:         boolean;
  expires_at:     string | null;
  granted_by:     string | null;
  granted_reason: string | null;
  created_at:     string;
  updated_at:     string;
}

const PRO_PLANS:     EntitlementPlanType[] = ['active', 'trainer', 'lifetime_active', 'lifetime_trainer'];
const TRAINER_PLANS: EntitlementPlanType[] = ['trainer', 'lifetime_trainer'];

export function entitlementGrantsPro(e: UserEntitlement): boolean {
  return PRO_PLANS.includes(e.plan_type);
}
export function entitlementGrantsTrainer(e: UserEntitlement): boolean {
  return TRAINER_PLANS.includes(e.plan_type);
}

// Gültig = active && (kein Ablauf ODER in der Zukunft).
function isValid(e: UserEntitlement): boolean {
  if (!e.active) return false;
  if (e.expires_at && new Date(e.expires_at).getTime() <= Date.now()) return false;
  return true;
}

// Höchstwertiges gültiges Entitlement (Trainer vor Active, Lifetime bevorzugt).
export async function getActiveEntitlement(userId: string): Promise<UserEntitlement | null> {
  const { data, error } = await supabase
    .from('user_entitlements')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true);
  if (error || !data?.length) return null;

  const valid = (data as UserEntitlement[]).filter(isValid);
  if (!valid.length) return null;

  const rank = (e: UserEntitlement) =>
    (entitlementGrantsTrainer(e) ? 2 : entitlementGrantsPro(e) ? 1 : 0) + (e.is_lifetime ? 0.5 : 0);
  return valid.sort((a, b) => rank(b) - rank(a))[0];
}
