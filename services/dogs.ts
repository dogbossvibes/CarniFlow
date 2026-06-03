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
