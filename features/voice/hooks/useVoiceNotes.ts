import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchVoiceNotes, deleteVoiceNote, uploadVoiceNote,
  type VoiceNote, type UploadVoiceNoteInput,
} from '@/features/voice/services/voiceUploadService';

// Sprachmemos einer Einheit/Track-Session laden + verwalten.
export function useVoiceNotes(opts: { trainingUnitId?: string; trainingSessionId?: string }) {
  const qc = useQueryClient();
  const key = ['voiceNotes', opts.trainingUnitId ?? null, opts.trainingSessionId ?? null];
  const enabled = !!(opts.trainingUnitId || opts.trainingSessionId);

  const q = useQuery<VoiceNote[], Error>({
    queryKey: key,
    enabled,
    queryFn: async () => {
      const { data } = await fetchVoiceNotes(opts);
      return data ?? [];
    },
  });

  const add = async (input: UploadVoiceNoteInput) => {
    const res = await uploadVoiceNote(input);
    if (!res.error) qc.invalidateQueries({ queryKey: key });
    return res;
  };

  const remove = async (id: string) => {
    await deleteVoiceNote(id);
    qc.invalidateQueries({ queryKey: key });
  };

  return { notes: q.data ?? [], isLoading: enabled && q.isPending, refetch: q.refetch, add, remove };
}
