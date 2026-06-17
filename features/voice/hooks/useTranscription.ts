import { useState } from 'react';
import { startTranscription, type TranscriptStatus, type VoiceNote } from '@/features/voice/services/voiceUploadService';
import { createEmbeddingForVoiceTranscript } from '@/features/ai/services/trainingEmbeddingService';

// Transkription starten + Status verfolgen. Bei Erfolg wird das Transkript
// zusätzlich (non-blocking) als Embedding gespeichert (semantische Suche).
export function useTranscription(note: VoiceNote, onUpdated?: () => void) {
  const [status, setStatus] = useState<TranscriptStatus>(note.transcript_status);
  const [busy, setBusy] = useState(false);

  const transcribe = async () => {
    setBusy(true);
    setStatus('processing');
    const { data } = await startTranscription(note.id);
    const next = (data?.status as TranscriptStatus) ?? 'failed';
    setStatus(next);
    setBusy(false);

    if (next === 'completed' && data?.transcript) {
      void createEmbeddingForVoiceTranscript({
        trainingSessionId: note.training_session_id ?? undefined,
        sourceId: note.id,
        content: data.transcript,
        metadata: { dog_id: note.dog_id, voice_note_id: note.id, unit_id: note.training_unit_id, context: note.context },
      });
    }
    onUpdated?.();
    return next;
  };

  return { status, busy, transcribe };
}
