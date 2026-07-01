import { getPlanSubscription } from '@/services/subscriptionService';
import {
  getActiveEntitlement, entitlementGrantsPro, entitlementGrantsTrainer,
} from '@/services/entitlementService';
import { isTrainerPlan, isTrialLapsed } from '@/features/subscription/plans';

// Vereinheitlichte Zugriffsauskunft: Apple/Google-Abo ODER manuelles/Lifetime-
// Entitlement. Quelle für UI (Lifetime-Badge, Kauf-Buttons ausblenden).
export interface UserAccess {
  hasActiveAccess:  boolean;
  hasTrainerAccess: boolean;
  source:  'apple' | 'google' | 'manual' | 'founder' | 'admin' | 'none';
  planType: string | null;
  isLifetime: boolean;
  expiresAt: string | null;
}

const STATUS_ACTIVE = ['active', 'trialing'];

export async function getUserAccess(userId: string): Promise<UserAccess> {
  const [sub, ent] = await Promise.all([
    getPlanSubscription(userId),
    getActiveEntitlement(userId),
  ]);

  // 1) Aktives Store-Abo (Apple/Google). Abgelaufener Trial zählt NICHT als aktiv.
  const subActive  = !!sub?.plan && !!sub.status && STATUS_ACTIVE.includes(sub.status) && !isTrialLapsed(sub);
  const subPro     = subActive;                          // alle Pläne sind „pro"
  const subTrainer = subActive && isTrainerPlan(sub!.plan);

  // 2) Manuelles/Lifetime-Entitlement (getActiveEntitlement liefert nur gültige).
  const entPro     = !!ent && entitlementGrantsPro(ent);
  const entTrainer = !!ent && entitlementGrantsTrainer(ent);

  const hasActiveAccess  = subPro || entPro;
  const hasTrainerAccess = subTrainer || entTrainer;

  // Quelle/Plan: Entitlement hat Vorrang in der Anzeige (es ist der „besondere"
  // Zugang); sonst das Store-Abo.
  let source: UserAccess['source'] = 'none';
  let planType: string | null = null;
  let isLifetime = false;
  let expiresAt: string | null = null;

  if (entPro || entTrainer) {
    source = ent!.source;
    planType = ent!.plan_type;
    isLifetime = ent!.is_lifetime === true;
    expiresAt = ent!.expires_at;
  } else if (subActive) {
    source = 'apple';   // Store-Abo (RevenueCat/App Store); Google analog erweiterbar
    planType = sub!.plan;
    expiresAt = sub!.current_period_ends_at ?? null;
  }

  return { hasActiveAccess, hasTrainerAccess, source, planType, isLifetime, expiresAt };
}
