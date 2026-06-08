import { supabase } from '@/lib/supabase';
import type { Antwort, NeuerTermin, TrainerUmfrage, UmfrageAntwort, UmfrageTermin } from '@/types/umfrage';

// TT.MM.JJJJ → YYYY-MM-DD (Postgres date)
function toISODate(ch: string): string | null {
  const m = ch.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}
function toTime(hm: string): string {
  return /^\d{1,2}:\d{2}$/.test(hm.trim()) ? `${hm.trim()}:00` : hm.trim();
}

export async function createUmfrage(args: {
  trainerId: string; trainerName: string; arten: string[]; notiz: string;
  termine: NeuerTermin[]; kundenIds: string[];
}): Promise<{ error: string | null }> {
  const { data: umfrage, error } = await supabase
    .from('trainer_umfragen')
    .insert({ trainer_id: args.trainerId, trainer_name: args.trainerName, training_arten: args.arten, notiz: args.notiz || null })
    .select()
    .single();
  if (error || !umfrage) return { error: error?.message ?? 'Fehler beim Anlegen.' };

  const terminRows = args.termine.map(t => ({
    umfrage_id: umfrage.id,
    datum:       toISODate(t.datum),
    uhrzeit_von: toTime(t.von),
    uhrzeit_bis: t.bis ? toTime(t.bis) : toTime(t.von),
    ort:         t.ort || null,
  }));
  if (terminRows.some(r => !r.datum)) return { error: 'Ungültiges Datum (TT.MM.JJJJ).' };

  const { error: tErr } = await supabase.from('umfrage_termine').insert(terminRows);
  if (tErr) return { error: tErr.message };

  if (args.kundenIds.length) {
    const inv = args.kundenIds.map(uid => ({ umfrage_id: umfrage.id, user_id: uid }));
    const { error: iErr } = await supabase.from('umfrage_einladungen').insert(inv);
    if (iErr) return { error: iErr.message };

    // Eingeladene per Push benachrichtigen (best-effort; Edge-Function notify-appointment).
    supabase.functions.invoke('notify-appointment', {
      body: { umfrage_id: umfrage.id, trainer_name: args.trainerName, training_arten: args.arten },
    }).catch(() => {});
  }
  return { error: null };
}

export function getUmfrage(id: string) {
  return supabase.from('trainer_umfragen').select('*').eq('id', id).single();
}

export function getTermine(umfrageId: string) {
  return supabase.from('umfrage_termine').select('*').eq('umfrage_id', umfrageId).order('datum').order('uhrzeit_von');
}

export function getAntworten(umfrageId: string) {
  return supabase.from('umfrage_antworten').select('*').eq('umfrage_id', umfrageId);
}

export function saveAntwort(terminId: string, umfrageId: string, userId: string, antwort: Antwort) {
  return supabase
    .from('umfrage_antworten')
    .upsert({ termin_id: terminId, umfrage_id: umfrageId, user_id: userId, antwort }, { onConflict: 'termin_id,user_id' });
}

// Umfragen, zu denen ich eingeladen bin.
export async function getMyInvitations(userId: string): Promise<TrainerUmfrage[]> {
  const { data: inv } = await supabase.from('umfrage_einladungen').select('umfrage_id').eq('user_id', userId);
  const ids = (inv ?? []).map(i => i.umfrage_id);
  if (!ids.length) return [];
  const { data } = await supabase.from('trainer_umfragen').select('*').in('id', ids).order('created_at', { ascending: false });
  return (data as TrainerUmfrage[]) ?? [];
}

// Vom Trainer angelegte Umfragen.
export async function getMyUmfragen(trainerId: string): Promise<TrainerUmfrage[]> {
  const { data } = await supabase.from('trainer_umfragen').select('*').eq('trainer_id', trainerId).order('created_at', { ascending: false });
  return (data as TrainerUmfrage[]) ?? [];
}

export type { TrainerUmfrage, UmfrageTermin, UmfrageAntwort };
