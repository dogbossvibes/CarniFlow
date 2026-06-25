import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/hooks/useSession';
import { getUserAccess, type UserAccess } from '@/lib/entitlements/getUserAccess';

const NONE: UserAccess = {
  hasActiveAccess: false, hasTrainerAccess: false,
  source: 'none', planType: null, isLifetime: false, expiresAt: null,
};

// Vereinheitlichter Zugriff (Abo ODER Lifetime/manuelles Entitlement) für die UI.
// Das Feature-Gating selbst läuft weiter über useCapabilities (das die
// Entitlements bereits einbezieht); useAccess liefert v. a. isLifetime/source
// für Anzeige & Kauf-Buttons.
export function useAccess() {
  const { session } = useSession();
  const uid = session?.user.id;

  const query = useQuery({
    queryKey: ['userAccess', uid],
    enabled:  !!uid,
    queryFn:  async (): Promise<UserAccess> => getUserAccess(uid!),
  });

  return {
    access:  query.data ?? NONE,
    loading: uid ? query.isPending : false,
    refresh: query.refetch,
  };
}
