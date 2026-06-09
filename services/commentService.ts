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
  const res = await supabase
    .from('training_comments')
    .insert({ unit_id: unitId, author_id: authorId, ...c })
    .select('*')
    .single<TrainingComment>();

  // Kund:in (Einheiten-Besitzer:in) per Push benachrichtigen, wenn jemand
  // anderes (z. B. die Trainer:in) kommentiert oder Sprach-/Video-Feedback gibt.
  if (!res.error) {
    notifyUnitOwner(unitId, authorId, c.kind).catch(() => {});
  }
  return res;
}

async function notifyUnitOwner(unitId: string, authorId: string, kind: NewComment['kind']) {
  const { data: unit } = await supabase.from('training_units').select('owner_id').eq('id', unitId).single();
  const ownerId = unit?.owner_id as string | undefined;
  if (!ownerId || ownerId === authorId) return;  // kein Selbst-Ping

  const { data: author } = await supabase.from('profiles').select('full_name, trainer_name').eq('id', authorId).single();
  const name = (author?.trainer_name ?? author?.full_name ?? 'Deine Trainer:in') as string;
  const label = kind === 'voice' ? '🎙️ Sprach-Feedback' : kind === 'video' ? '🎥 Video-Feedback' : '💬 Neuer Kommentar';

  await supabase.functions.invoke('notify', {
    body: {
      user_ids: [ownerId],
      title:    label,
      body:     `${name} hat deine Einheit kommentiert.`,
      data:     { type: 'comment', unit_id: unitId },
    },
  });
}

export function deleteComment(id: string) {
  return supabase.from('training_comments').delete().eq('id', id);
}
