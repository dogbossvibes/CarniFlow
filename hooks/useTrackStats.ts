import { useQuery } from '@tanstack/react-query';
import { getTrackStatsRows } from '@/features/tracking/services/trackService';
import { useSession } from '@/hooks/useSession';

// Aggregierte Kennzahlen aus dem aktiven Fährtenmodul (training_sessions type='track').
export function useTrackStats() {
  const { session } = useSession();
  const uid = session?.user.id;

  const query = useQuery({
    queryKey: ['trackStats', uid],
    enabled:  !!uid,
    queryFn:  async () => {
      const { data } = await getTrackStatsRows(uid!);
      const rows = data ?? [];
      return {
        meters: rows.reduce((sum, r) => sum + (r.distance_meters ?? 0), 0),
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
