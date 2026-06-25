import { supabase } from '@/lib/supabase';
import type { NewDog } from '@/types';

export function getDogs(userId: string) {
  return supabase
    .from('dogs')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });
}

export async function addDog(userId: string, dog: NewDog) {
  const payload = { ...dog, owner_id: userId };
  const { data, error } = await supabase
    .from('dogs')
    .insert(payload)
    .select()
    .single();
  return { data, error };
}

export function getDogById(dogId: string) {
  return supabase.from('dogs').select('*').eq('id', dogId).single();
}

export function updateDog(dogId: string, updates: Partial<NewDog>) {
  return supabase
    .from('dogs')
    .update(updates)
    .eq('id', dogId)
    .select()
    .single();
}

export function deleteDog(dogId: string) {
  return supabase.from('dogs').delete().eq('id', dogId);
}

// Tabellen mit direkter dog_id-Referenz — werden vor dem Hund gelöscht, damit
// keine Fremdschlüssel blockieren und keine Waisen-Daten zurückbleiben.
// Kinder von training_sessions (track_points/markers/runs) hängen per session_id
// und werden über deren ON-DELETE-CASCADE mitgelöscht.
const DOG_DEPENDENT_TABLES = [
  'training_recommendations',
  'training_embeddings',
  'ai_insights',
  'training_analysis',
  'calendar_events',
  'shared_trainings',
  'training_units',
  'training_sessions',
] as const;

// Löscht den Hund inkl. abhängiger Daten (best-effort je Tabelle). Gibt erst
// einen Fehler zurück, wenn das Löschen des Hundes selbst scheitert.
export async function deleteDogWithDependents(dogId: string): Promise<{ error: Error | null }> {
  for (const table of DOG_DEPENDENT_TABLES) {
    const { error } = await supabase.from(table).delete().eq('dog_id', dogId);
    if (error) console.warn(`[deleteDog] ${table}:`, error.message);   // z. B. Tabelle ohne dog_id → ignorieren
  }
  const { error } = await supabase.from('dogs').delete().eq('id', dogId);
  return { error: error ? new Error(error.message) : null };
}
