import type { EmbeddingSourceType } from './semanticSearchService';

// KI-ENTFERNUNG: Es werden KEINE Embeddings mehr erzeugt. Kein Aufruf externer
// APIs (OpenAI/Edge Function) und KEINE Übertragung von Trainings-/Notizdaten.
// Alle Funktionen bleiben als No-op erhalten (Aufrufer/Interfaces unverändert),
// damit das Speichern einer Einheit nie scheitert. DB-Objekte bleiben bestehen;
// ein späteres Backend-Cleanup erfolgt separat.

export interface EmbeddingInput {
  trainingSessionId?: string;
  sourceId?:          string;          // ID der Quelle (Unit/Exercise/Marker/Media) für Re-Embedding
  content:            string;
  contentSummary?:    string;
  metadata?:          Record<string, any>;
}

export interface EmbeddingResult { ok: boolean; id?: string; error?: string; skipped?: boolean }

async function generate(_sourceType: EmbeddingSourceType, _input: EmbeddingInput): Promise<EmbeddingResult> {
  // Deaktiviert: keine Embedding-Erzeugung, kein externer API-Aufruf.
  return { ok: false, skipped: true };
}

export const createEmbeddingForTrainingSession = (i: EmbeddingInput) => generate('training_notes', i);
export const createEmbeddingForExerciseNote    = (i: EmbeddingInput) => generate('exercise_notes', i);
export const createEmbeddingForCoachFeedback   = (i: EmbeddingInput) => generate('coach_feedback', i);
export const createEmbeddingForVoiceTranscript = (i: EmbeddingInput) => generate('voice_transcript', i);
export const createEmbeddingForMediaDescription= (i: EmbeddingInput) => generate('media_description', i);
export const createEmbeddingForTrackSummary    = (i: EmbeddingInput) => generate('track_summary', i);
