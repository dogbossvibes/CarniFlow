import { useCapabilities } from '@/hooks/useCapabilities';
import { useProfile } from '@/hooks/useProfile';
import type { Plan } from '@/types';

interface PlanInfo {
  plan: Plan;
  isPremium: boolean;
  isFree: boolean;
  expiresAt: Date | null;
  trialUsed: boolean;
  loading: boolean;
}

// Legacy dog AI gating also honors the central, account-keyed effective access.
export function usePlan(): PlanInfo {
  const profile = useProfile();
  const caps = useCapabilities();
  const isPremium = caps.isPro || profile.isPremium;
  return {
    plan: isPremium ? 'premium' : 'free',
    isPremium,
    isFree: !isPremium,
    expiresAt: caps.hasActiveLifetimeAccess || caps.hasLifetimeAccess ? null : profile.planExpiresAt,
    trialUsed: profile.profile?.trial_used ?? false,
    loading: profile.loading || caps.loading,
  };
}
