import { useQuery } from '@tanstack/react-query';
import type { TrainingUnit } from '@/types/trainingUnit';
import type { TrainingSession } from '@/types';
import type { TrackSession } from '@/types/tracking';
import { getTrainingUnits } from '@/services/trainingUnitService';
import { getTrainingSessions } from '@/services/training';
import { getTrackSessions } from '@/services/trackingService';
import { buildFeed, type FeedItem } from '@/services/trainingFeed';
import { useSession } from '@/hooks/useSession';

// Vereinheitlichte Trainings-Zeitleiste (alt + neu) für Verlauf, Stats, Dashboard.
// Über React Query gecacht + dedupliziert (gleicher queryKey → ein Fetch für
// alle Consumer).
export function useTrainingFeed(dogId?: string) {
  const { session } = useSession();
  const uid = session?.user.id;

  const query = useQuery({
    queryKey: ['trainingFeed', uid, dogId ?? null],
    enabled:  !!uid,
    queryFn:  async (): Promise<FeedItem[]> => {
      const [u, s, t] = await Promise.all([
        getTrainingUnits(uid!, dogId),
        getTrainingSessions(uid!, dogId),
        getTrackSessions(uid!, dogId),
      ]);
      const units    = (u.data as TrainingUnit[])    ?? [];
      const sessions = (s.data as TrainingSession[]) ?? [];
      const tracks   = (t.data as TrackSession[])    ?? [];
      return buildFeed(units, sessions, tracks);
    },
  });

  return {
    feed:    query.data ?? [],
    loading: uid ? query.isPending : false,
    refresh: query.refetch,
  };
}
