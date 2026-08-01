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

// KI-ENTFERNUNG: KEINE Embeddings/Vektor-/Semantik-Suche mehr (keine externe API).
// Stattdessen eine lokale, deterministische Volltext-Suche über die eigenen
// Trainingsnotizen/Übungen (Supabase, RLS-geschützt). Gleiche Signatur/Rückgabe.
export async function searchTrainingMemory(
  query: string,
  filters: SemanticSearchFilters = {},
): Promise<SemanticSearchResult[]> {
  const q = (query ?? '').trim();
  if (q.length < MIN_QUERY_LENGTH) {
    throw new SemanticSearchError('Bitte gib eine etwas ausführlichere Suchanfrage ein.');
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    const uid = filters.targetUserId ?? user?.id;
    if (!uid) return [];

    let sel = supabase
      .from('training_units')
      .select('id, dog_id, session_date, notes, exercises:training_exercises(discipline, exercise_name, notes)')
      .eq('owner_id', uid)
      .order('session_date', { ascending: false })
      .limit(200);
    if (filters.dogId) sel = sel.eq('dog_id', filters.dogId);

    const { data, error } = await sel;
    if (error) throw error;

    const needle = q.toLowerCase();
    const max = filters.matchCount ?? 10;
    const results: SemanticSearchResult[] = [];
    for (const u of (data ?? []) as any[]) {
      const exs = (u.exercises ?? []) as any[];
      if (filters.category && !exs.some(e => e.discipline === filters.category)) continue;
      const exText = exs.map(e => [e.discipline, e.exercise_name, e.notes].filter(Boolean).join(' ')).join('\n');
      const hay = `${u.notes ?? ''}\n${exText}`.toLowerCase();
      if (hay.includes(needle)) {
        results.push({
          id: u.id,
          trainingSessionId: u.id,
          sourceType: 'training_notes',
          content: (u.notes || exText || '').slice(0, 400),
          summary: null,
          similarity: 1,
          metadata: { unit_id: u.id, dog_id: u.dog_id, session_date: u.session_date },
        });
        if (results.length >= max) break;
      }
    }
    return results;
  } catch (e) {
    console.warn('[semanticSearchService] local search error:', (e as Error)?.message);
    throw new SemanticSearchError('Die Suche ist gerade nicht verfügbar. Bitte versuche es später erneut.');
  }
}
