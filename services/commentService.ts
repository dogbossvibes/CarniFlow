import { supabase } from '@/lib/supabase';
import type { NewComment, TrainingComment } from '@/types/comment';

export function getComments(unitId: string) {
  return supabase
    .from('training_comments')
    .select('*')
    .eq('unit_id', unitId)
    .order('created_at', { ascending: true });
}

export async function addComment(unitId: string, authorId: string, c: NewComment) {
  return supabase
    .from('training_comments')
    .insert({ unit_id: unitId, author_id: authorId, ...c })
    .select('*')
    .single<TrainingComment>();
}

export function deleteComment(id: string) {
  return supabase.from('training_comments').delete().eq('id', id);
}
