import { supabase } from '@/lib/supabase';
import type { EmbeddingSourceType } from './semanticSearchService';

// Erstellt Embeddings nach dem Speichern von Trainingsinhalten — über die Edge
// Function 'generate-training-embedding'. ALLE Funktionen sind NON-BLOCKING:
// Sie werfen nie, sondern loggen Fehler und liefern { ok:false }. Das Speichern
// einer Trainingseinheit darf dadurch niemals scheitern.

export interface EmbeddingInput {
  trainingSessionId?: string;
  sourceId?:          string;          // ID der Quelle (Unit/Exercise/Marker/Media) für Re-Embedding
  content:            string;
  contentSummary?:    string;
  metadata?:          Record<string, any>;
}

export interface EmbeddingResult { ok: boolean; id?: string; error?: string; skipped?: boolean }

const MIN_LENGTH = 10;

async function generate(sourceType: EmbeddingSourceType, input: EmbeddingInput): Promise<EmbeddingResult> {
  try {
    if (!input.content || input.content.trim().length < MIN_LENGTH) {
      return { ok: false, skipped: true };   // zu kurz → still überspringen
    }
    const { data, error } = await supabase.functions.invoke('generate-training-embedding', {
      body: {
        sourceType,
        trainingSessionId: input.trainingSessionId,
        sourceId: input.sourceId,
        content: input.content,
        contentSummary: input.contentSummary,
        metadata: input.metadata ?? {},
      },
    });
    if (error) throw error;
    if (data?.skipped) return { ok: false, skipped: true };
    return { ok: true, id: data?.id };
  } catch (e: any) {
    // Bewusst nur loggen — Retry kann später ergänzt werden (z. B. Queue-Tabelle).
    console.warn(`[trainingEmbeddingService:${sourceType}]`, e?.message ?? e);
    return { ok: false, error: e?.message ?? 'Embedding fehlgeschlagen' };
  }
}

export const createEmbeddingForTrainingSession = (i: EmbeddingInput) => generate('training_notes', i);
export const createEmbeddingForExerciseNote    = (i: EmbeddingInput) => generate('exercise_notes', i);
export const createEmbeddingForCoachFeedback   = (i: EmbeddingInput) => generate('coach_feedback', i);
export const createEmbeddingForVoiceTranscript = (i: EmbeddingInput) => generate('voice_transcript', i);
export const createEmbeddingForMediaDescription= (i: EmbeddingInput) => generate('media_description', i);
export const createEmbeddingForTrackSummary    = (i: EmbeddingInput) => generate('track_summary', i);
