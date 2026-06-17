import { useQuery } from '@tanstack/react-query';
import {
  searchTrainingMemory, MIN_QUERY_LENGTH,
  type SemanticSearchFilters, type SemanticSearchResult,
} from '@/features/ai/services/semanticSearchService';

// Semantische Trainingssuche mit React Query. `query` ist die ABGESCHICKTE Suche
// (nicht der laufende Tippeingabe-Text) — so feuert die Suche erst bei Submit und
// die Ergebnisse werden pro Query/Filter gecacht.
export function useSemanticTrainingSearch(query: string, filters: SemanticSearchFilters = {}) {
  const trimmed = (query ?? '').trim();
  const enabled = trimmed.length >= MIN_QUERY_LENGTH;

  const q = useQuery<SemanticSearchResult[], Error>({
    queryKey: ['semanticSearch', trimmed, filters.dogId ?? null, filters.category ?? null, filters.targetUserId ?? null],
    enabled,
    queryFn: () => searchTrainingMemory(trimmed, filters),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return {
    results:   q.data ?? [],
    isLoading: enabled && q.isPending,
    isFetching: q.isFetching,
    isError:   q.isError,
    error:     q.error,
    isEmpty:   enabled && !q.isPending && (q.data?.length ?? 0) === 0,
    enabled,
    refetch:   q.refetch,
  };
}
