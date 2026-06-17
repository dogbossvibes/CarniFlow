import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/hooks/useSession';
import { useDogs } from '@/hooks/useDogs';
import {
  loadCoachDataset, generateLocalInsights, getCategoryBalance, getScoreTrends,
  getRecommendations, getWeeklyTrainingStats, fetchDismissedKeys, dismissInsight,
} from '@/features/ai/services/insightService';
import type {
  AiInsight, TrainingBalance, ScoreTrend, CoachRecommendation,
} from '@/features/ai/types/aiCoach';

export interface AiCoachData {
  insights:        AiInsight[];
  balance:         TrainingBalance[];
  trends:          ScoreTrend[];
  recommendations: CoachRecommendation[];
  weekly:          { sessions: number; avgScore: number | null };
}

const EMPTY: AiCoachData = { insights: [], balance: [], trends: [], recommendations: [], weekly: { sessions: 0, avgScore: null } };

// Lädt Trainingsdaten, erzeugt regelbasierte Insights + Aggregate. Dismiss
// persistiert in ai_insights und invalidiert den Cache.
export function useAiCoach(dogId?: string | null) {
  const { session } = useSession();
  const { dogs } = useDogs();
  const uid = session?.user.id;
  const qc = useQueryClient();

  const q = useQuery<AiCoachData, Error>({
    queryKey: ['aiCoach', uid, dogId ?? null, dogs.length],
    enabled: !!uid,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const ds = await loadCoachDataset(uid!, dogId);
      const dismissed = await fetchDismissedKeys(uid!);
      const insights = generateLocalInsights(ds, dogs).filter(i => !dismissed.has(i.key));
      return {
        insights,
        balance: getCategoryBalance(ds),
        trends: getScoreTrends(ds),
        recommendations: getRecommendations(ds, dogs),
        weekly: getWeeklyTrainingStats(ds),
      };
    },
  });

  const dismiss = async (insight: AiInsight) => {
    if (!uid) return;
    await dismissInsight(uid, insight);
    qc.invalidateQueries({ queryKey: ['aiCoach', uid] });
  };

  return {
    data: q.data ?? EMPTY,
    isLoading: !!uid && q.isPending,
    isError: q.isError,
    refetch: q.refetch,
    dismiss,
  };
}
