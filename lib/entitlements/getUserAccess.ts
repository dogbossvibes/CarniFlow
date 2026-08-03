import { getPlanSubscription } from '@/services/subscriptionService';
import { getActiveEntitlements } from '@/services/entitlementService';
import {
  isTrainerPlan,
  isTrialLapsed,
  resolveEffectiveCapabilities,
} from '@/features/subscription/plans';

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
    getActiveEntitlements(userId),
  ]);

  // 1) Aktives Store-Abo (Apple/Google). Abgelaufener Trial zählt NICHT als aktiv.
  const subActive  = !!sub?.plan && !!sub.status && STATUS_ACTIVE.includes(sub.status) && !isTrialLapsed(sub);
  const subPro     = subActive;                          // alle Pläne sind „pro"
  const subTrainer = subActive && isTrainerPlan(sub!.plan);

  const effective = resolveEffectiveCapabilities({
    subscription: sub,
    entitlements: ent,
  });
  const entPro     = effective.hasLifetimeAccess;
  const entTrainer = effective.hasLifetimeAccess;

  const hasActiveAccess  = subPro || entPro;
  const hasTrainerAccess = subTrainer || entTrainer;

  // Quelle/Plan: Entitlement hat Vorrang in der Anzeige (es ist der „besondere"
  // Zugang); sonst das Store-Abo.
  let source: UserAccess['source'] = 'none';
  let planType: string | null = null;
  let isLifetime = false;
  let expiresAt: string | null = null;

  if (entPro || entTrainer) {
    source = 'admin';
    planType = 'lifetime';
    isLifetime = true;
    expiresAt = ent.find((item) => item.entitlement === 'lifetime')?.expiresAt ?? null;
  } else if (subActive) {
    source = 'apple';   // Store-Abo (RevenueCat/App Store); Google analog erweiterbar
    planType = sub!.plan;
    expiresAt = sub!.current_period_ends_at ?? null;
  }

  return { hasActiveAccess, hasTrainerAccess, source, planType, isLifetime, expiresAt };
}
