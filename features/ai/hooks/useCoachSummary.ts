import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/hooks/useSession';
import { refreshCoachSummary, UNAVAILABLE_SUMMARY } from '@/features/ai/services/insightService';
import type { CoachSummary } from '@/features/ai/types/aiCoach';

// KI-Zusammenfassung — läuft NICHT automatisch (LLM-Kosten), erst auf „Aktualisieren".
export function useCoachSummary(dogId?: string | null, periodDays = 7) {
  const { session } = useSession();
  const uid = session?.user.id;
  const [started, setStarted] = useState(false);

  const q = useQuery<CoachSummary, Error>({
    queryKey: ['coachSummary', uid, dogId ?? null, periodDays],
    enabled: !!uid && started,
    staleTime: 10 * 60 * 1000,
    queryFn: () => refreshCoachSummary(periodDays, dogId),
  });

  return {
    summary: q.data ?? null,
    isLoading: started && q.isFetching,
    hasRun: started,
    refresh: () => { setStarted(true); q.refetch(); },
    unavailable: UNAVAILABLE_SUMMARY,
  };
}
