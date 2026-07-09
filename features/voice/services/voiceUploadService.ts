import { supabase } from '@/lib/supabase';
import { uploadAudio } from '@/services/mediaService';

export type VoiceContext = 'training_note' | 'exercise_note' | 'track_marker' | 'coach_feedback' | 'general_note';
export type TranscriptStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'disabled';

export interface VoiceNote {
  id:                  string;
  user_id:             string;
  training_session_id: string | null;
  training_unit_id:    string | null;
  dog_id:              string | null;
  marker_id:           string | null;
  context:             VoiceContext;
  audio_url:           string;
  duration_seconds:    number | null;
  transcript:          string | null;
  transcript_status:   TranscriptStatus;
  metadata:            Record<string, any>;
  created_at:          string;
}

export interface Result<T> { data: T | null; error: string | null }
function fail<T>(scope: string, e: unknown): Result<T> {
  const msg = (e as { message?: string })?.message ?? String(e);
  console.warn(`[voiceUploadService:${scope}]`, e);
  return { data: null, error: msg };
}

export interface UploadVoiceNoteInput {
  localUri:            string;
  context:            VoiceContext;
  trainingSessionId?: string | null;
  trainingUnitId?:    string | null;
  dogId?:             string | null;
  markerId?:          string | null;
  durationSeconds?:   number | null;
  metadata?:          Record<string, any>;
}

// Reuse der bestehenden Audio-Upload-Logik (mediaService → Bucket media-audio),
// danach voice_notes-Eintrag. transcript_status startet 'pending'.
export async function uploadVoiceNote(input: UploadVoiceNoteInput): Promise<Result<VoiceNote>> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: 'Nicht angemeldet' };

    const { url } = await uploadAudio(input.localUri);

    const { data, error } = await supabase.from('voice_notes').insert({
      user_id:             user.id,
      training_session_id: input.trainingSessionId ?? null,
      training_unit_id:    input.trainingUnitId ?? null,
      dog_id:              input.dogId ?? null,
      marker_id:           input.markerId ?? null,
      context:             input.context,
      audio_url:           url,
      duration_seconds:    input.durationSeconds ?? null,
      transcript_status:   'pending',
      metadata:            input.metadata ?? {},
    }).select('*').single();
    if (error) return fail('insert', error);
    return { data: data as VoiceNote, error: null };
  } catch (e) { return fail('uploadVoiceNote', e); }
}

export async function fetchVoiceNotes(opts: { trainingUnitId?: string; trainingSessionId?: string }): Promise<Result<VoiceNote[]>> {
  try {
    let q = supabase.from('voice_notes').select('*').order('created_at', { ascending: true });
    if (opts.trainingUnitId)    q = q.eq('training_unit_id', opts.trainingUnitId);
    if (opts.trainingSessionId) q = q.eq('training_session_id', opts.trainingSessionId);
    const { data, error } = await q;
    if (error) return fail('fetch', error);
    return { data: (data ?? []) as VoiceNote[], error: null };
  } catch (e) { return fail('fetchVoiceNotes', e); }
}

// media-audio ist ein öffentlicher Bucket (wie der bestehende Audio-Upload) →
// die gespeicherte URL ist bereits abspielbar. Helper bleibt für späteren
// Wechsel auf signierte URLs erhalten.
export async function getVoiceNoteSignedUrl(voiceNoteId: string): Promise<Result<string>> {
  try {
    const { data, error } = await supabase.from('voice_notes').select('audio_url').eq('id', voiceNoteId).single();
    if (error) return fail('signedUrl', error);
    return { data: (data as any).audio_url as string, error: null };
  } catch (e) { return fail('getVoiceNoteSignedUrl', e); }
}

export async function deleteVoiceNote(voiceNoteId: string): Promise<Result<null>> {
  try {
    const { error } = await supabase.from('voice_notes').delete().eq('id', voiceNoteId);
    if (error) return fail('delete', error);
    return { data: null, error: null };
  } catch (e) { return fail('deleteVoiceNote', e); }
}

// Transkription anstossen (Edge Function). Non-blocking nutzbar.
export async function startTranscription(voiceNoteId: string): Promise<Result<{ status: TranscriptStatus; transcript?: string }>> {
  try {
    const { data, error } = await supabase.functions.invoke('transcribe-voice-note', { body: { voiceNoteId } });
    if (error) return fail('transcribe', error);
    return { data, error: null };
  } catch (e) { return fail('startTranscription', e); }
}
