import { supabase } from '@/lib/supabase';
import type { ReceivedHealthGrant } from '@/features/dogs/sharing/model';

export async function loadReceivedHealthDogs(dogId?: string): Promise<ReceivedHealthGrant[]> {
  const { data, error } = await supabase.rpc('list_received_health_dogs', { p_dog_id: dogId ?? null });
  if (error) throw new Error('shared_health_unavailable');
  if (!Array.isArray(data) || data.some(row => !row ||
    typeof row.grant_id !== 'string' || typeof row.dog_id !== 'string' ||
    typeof row.dog_name !== 'string' || typeof row.starts_at !== 'string' ||
    (row.owner_display_name !== null && typeof row.owner_display_name !== 'string') ||
    (row.expires_at !== null && typeof row.expires_at !== 'string') ||
    !Array.isArray(row.permissions) || row.permissions.some((permission: unknown) => typeof permission !== 'string')
  )) throw new Error('shared_health_invalid_response');
  return data as ReceivedHealthGrant[];
}
