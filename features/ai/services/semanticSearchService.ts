import { supabase } from '@/lib/supabase';

export type EmbeddingSourceType =
  | 'training_notes' | 'exercise_notes' | 'coach_feedback'
  | 'voice_transcript' | 'media_description' | 'track_summary';

export interface SemanticSearchResult {
  id:                string;
  trainingSessionId: string | null;
  sourceType:        EmbeddingSourceType;
  content:           string;
  summary:           string | null;
  similarity:        number;        // 0..1
  metadata:          Record<string, any>;
}

export interface SemanticSearchFilters {
  dogId?:          string;
  category?:       string;
  matchThreshold?: number;          // Default serverseitig 0.5
  matchCount?:     number;          // Default serverseitig 10
  targetUserId?:   string;          // Coach-Vorbereitung: in Kund:innen-Daten suchen
}

export const MIN_QUERY_LENGTH = 10;

export class SemanticSearchError extends Error {}

// Semantische Suche über die Edge Function. Wirft mit benutzerfreundlicher
// Meldung; leere/zu kurze Queries werden vorab abgefangen.
export async function searchTrainingMemory(
  query: string,
  filters: SemanticSearchFilters = {},
): Promise<SemanticSearchResult[]> {
  const q = (query ?? '').trim();
  if (q.length < MIN_QUERY_LENGTH) {
    throw new SemanticSearchError('Bitte gib eine etwas ausführlichere Suchanfrage ein.');
  }

  const { data, error } = await supabase.functions.invoke('search-training-memory', {
    body: {
      query: q,
      dogId: filters.dogId,
      category: filters.category,
      matchThreshold: filters.matchThreshold,
      matchCount: filters.matchCount,
      targetUserId: filters.targetUserId,
    },
  });

  if (error) {
    console.warn('[semanticSearchService] invoke error:', error.message);
    throw new SemanticSearchError('Die Suche ist gerade nicht verfügbar. Bitte versuche es später erneut.');
  }
  return (data?.results ?? []) as SemanticSearchResult[];
}
