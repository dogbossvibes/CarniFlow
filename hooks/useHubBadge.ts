import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/hooks/useSession';
import { useCapabilities } from '@/hooks/useCapabilities';
import { getPendingClientCount } from '@/services/connectionService';

// Badge auf dem Hub-Tab: Anzahl offener Kundenanfragen (Aktion erforderlich).
// Nur relevant, wenn das Trainer-Modul aktiv ist.
export function useHubBadge(): number {
  const { session } = useSession();
  const { isTrainerModule } = useCapabilities();
  const uid = session?.user.id;

  const { data } = useQuery({
    queryKey: ['hubBadge', uid],
    enabled:  !!uid && isTrainerModule,
    queryFn:  () => getPendingClientCount(uid!),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  return isTrainerModule ? (data ?? 0) : 0;
}
