import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/hooks/useSession';
import { getMyCapabilities } from '@/services/capabilityService';
import { planLevelOf, type PlanLevel, type UserCapabilities } from '@/types/capabilities';
import { runtimeGrantsCapability, type Capability } from '@/features/subscription/plans';

// Capability-Modell: Funktionen schalten über Capabilities frei, nicht über
// Rollen. trainer_module impliziert pro_member.
export function useCapabilities() {
  const { session } = useSession();
  const uid = session?.user.id;

  const query = useQuery({
    queryKey: ['capabilities', uid],
    enabled:  !!uid,
    queryFn:  async (): Promise<UserCapabilities | null> => getMyCapabilities(uid!),
  });

  const cap = query.data ?? null;
  const isTrainerModule = cap?.trainer_module === true;
  const isPro           = cap?.pro_member === true || isTrainerModule;
  const plan: PlanLevel = planLevelOf(cap);
  const hasLifetimeAccess = cap?.hasLifetimeAccess === true;
  const entitlements = cap?.entitlements ?? [];

  // Granulare Capability-Prüfung für einzelne UI-Bereiche (statt pauschaler isPro-
  // Sperre). Nutzt die bestehende Capability-Matrix (keine zweite Architektur).
  const can = useCallback(
    (capability: Capability): boolean =>
      runtimeGrantsCapability({ pro_member: isPro, trainer_module: isTrainerModule }, capability),
    [isPro, isTrainerModule],
  );

  return {
    capabilities:    cap,
    isPro,
    isTrainerModule,
    hasLifetimeAccess,
    entitlements,
    plan,
    can,
    loading:         uid ? query.isPending : false,
    refresh:         query.refetch,
  };
}
