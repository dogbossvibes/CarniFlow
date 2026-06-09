import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/hooks/useSession';
import { getMyCapabilities } from '@/services/capabilityService';
import { planLevelOf, type PlanLevel, type UserCapabilities } from '@/types/capabilities';

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

  return {
    capabilities:    cap,
    isPro,
    isTrainerModule,
    plan,
    loading:         uid ? query.isPending : false,
    refresh:         query.refetch,
  };
}
