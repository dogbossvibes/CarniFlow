import { supabase } from '@/lib/supabase';
import type { NewCustomCategory } from '@/types/customCategory';

export function getCustomCategories(ownerId: string) {
  return supabase
    .from('custom_categories')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true });
}

export function getCustomCategoryById(id: string) {
  return supabase.from('custom_categories').select('*').eq('id', id).single();
}

export function createCustomCategory(ownerId: string, cat: NewCustomCategory) {
  return supabase
    .from('custom_categories')
    .insert({ ...cat, owner_id: ownerId })
    .select('*')
    .single();
}

export function updateCustomCategory(id: string, patch: NewCustomCategory) {
  return supabase
    .from('custom_categories')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
}

export function deleteCustomCategory(id: string) {
  return supabase.from('custom_categories').delete().eq('id', id);
}
