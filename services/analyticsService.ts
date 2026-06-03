import { supabase } from '@/lib/supabase';
import type { TrainingAnalysis, TrainingRecommendation } from '@/types/analytics';

type NewAnalysis = Omit<TrainingAnalysis, 'id' | 'created_at'>;

export async function upsertAnalysis(data: NewAnalysis) {
  // Delete old analysis for this session, then insert fresh one
  await supabase.from('training_analysis').delete().eq('session_id', data.session_id);
  return supabase.from('training_analysis').insert(data).select().single();
}

export async function getAnalysisForDog(dogId: string, limit = 1) {
  return supabase
    .from('training_analysis')
    .select('*')
    .eq('dog_id', dogId)
    .order('created_at', { ascending: false })
    .limit(limit);
}

export async function getAnalysisForSession(sessionId: string) {
  return supabase
    .from('training_analysis')
    .select('*')
    .eq('session_id', sessionId)
    .single();
}

export async function upsertRecommendations(
  userId: string,
  dogId: string,
  items: Pick<TrainingRecommendation, 'typ' | 'titel' | 'beschreibung' | 'prioritaet'>[],
) {
  // Replace recommendations for this dog
  await supabase.from('training_recommendations').delete().eq('dog_id', dogId);
  if (!items.length) return;
  return supabase.from('training_recommendations').insert(
    items.map(item => ({ ...item, user_id: userId, dog_id: dogId, aktiv: true })),
  );
}

export async function getRecommendations(dogId: string) {
  return supabase
    .from('training_recommendations')
    .select('*')
    .eq('dog_id', dogId)
    .eq('aktiv', true)
    .order('prioritaet', { ascending: false })
    .limit(5);
}
