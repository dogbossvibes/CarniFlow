import { useQuery } from '@tanstack/react-query';
import { getTrackStats } from '@/services/trackingService';
import { useSession } from '@/hooks/useSession';

// Aggregierte Kennzahlen aus dem GPS-Fährtenmodul (track_sessions).
export function useTrackStats() {
  const { session } = useSession();
  const uid = session?.user.id;

  const query = useQuery({
    queryKey: ['trackStats', uid],
    enabled:  !!uid,
    queryFn:  async () => {
      const { data } = await getTrackStats(uid!);
      const rows = (data as { distanz_m: number | null }[]) ?? [];
      return {
        meters: rows.reduce((sum, r) => sum + (r.distanz_m ?? 0), 0),
        count:  rows.length,
      };
    },
  });

  return {
    meters:  query.data?.meters ?? 0,
    count:   query.data?.count ?? 0,
    loading: uid ? query.isPending : false,
    refresh: query.refetch,
  };
}
