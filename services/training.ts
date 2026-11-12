import { deleteGpsCaptures } from '@/features/tracking/storage/gpsCapture';
import { gpsCaptureScope } from '@/features/tracking/storage/gpsCaptureScope';
import { supabase } from '@/lib/supabase';
import type { NewTrainingSession, TrainingSession } from '@/types';

export function getTrainingSessions(ownerId: string, dogId?: string) {
  let q = supabase
    .from('training_sessions')
    .select('*, dog:dogs(name)')
    .eq('owner_id', ownerId)
    .order('session_date', { ascending: false })
    .order('created_at',   { ascending: false });

  if (dogId) q = q.eq('dog_id', dogId);
  return q;
}

export async function addTrainingSession(ownerId: string, session: NewTrainingSession) {
  const payload = { ...session, owner_id: ownerId };

  const { data, error } = await supabase
    .from('training_sessions')
    .insert(payload)
    .select('*, dog:dogs(name)')
    .single();

  return { data, error };
}

export function getTrainingSessionById(sessionId: string) {
  return supabase
    .from('training_sessions')
    .select('*, dog:dogs(name)')
    .eq('id', sessionId)
    .single();
}

export function updateTrainingSession(sessionId: string, updates: Partial<Omit<TrainingSession, 'id' | 'owner_id' | 'created_at' | 'dog'>>) {
  return supabase
    .from('training_sessions')
    .update(updates)
    .eq('id', sessionId)
    .select('*, dog:dogs(name)')
    .single();
}

export async function deleteTrainingSession(sessionId: string) {
  const scope = gpsCaptureScope();
  const result = await supabase.from('training_sessions').delete().eq('id', sessionId);
  if (!result.error && scope.userId) {
    if (gpsCaptureScope().userId !== scope.userId || gpsCaptureScope().epoch !== scope.epoch) throw new Error('ACCOUNT_CHANGED');
    await deleteGpsCaptures(sessionId);
  }
  return result;
}
