import { supabase } from '@/lib/supabase';
import { SHARED_READ_PERMISSIONS, type ReceivedHealthGrant } from '@/features/dogs/sharing/model';

export async function loadReceivedHealthDogs(dogId?: string): Promise<ReceivedHealthGrant[]> {
  const { data, error } = await supabase.rpc('list_received_health_dogs', { p_dog_id: dogId ?? null });
  if (error) throw new Error('shared_health_unavailable');
  if (!Array.isArray(data) || data.some(row => !row ||
    typeof row.grant_id !== 'string' || !row.grant_id || typeof row.dog_id !== 'string' || !row.dog_id ||
    (dogId !== undefined && row.dog_id !== dogId) ||
    typeof row.dog_name !== 'string' || !row.dog_name || typeof row.starts_at !== 'string' || !Number.isFinite(Date.parse(row.starts_at)) ||
    (row.owner_display_name !== null && typeof row.owner_display_name !== 'string') ||
    (row.expires_at !== null && (typeof row.expires_at !== 'string' || !Number.isFinite(Date.parse(row.expires_at)))) ||
    !Array.isArray(row.permissions) || row.permissions.some((permission: unknown) => typeof permission !== 'string')
  )) throw new Error('shared_health_invalid_response');
  const rows: ReceivedHealthGrant[] = data.map(row => ({
    grant_id: row.grant_id, dog_id: row.dog_id, dog_name: row.dog_name,
    owner_display_name: row.owner_display_name, starts_at: row.starts_at, expires_at: row.expires_at,
    permissions: SHARED_READ_PERMISSIONS.filter(permission => row.permissions.includes(permission)),
  }));
  const seen = new Map<string, string>();
  for (const row of rows) {
    const encoded = JSON.stringify(row);
    if (seen.has(row.grant_id) && seen.get(row.grant_id) !== encoded) throw new Error('shared_health_invalid_response');
    seen.set(row.grant_id, encoded);
  }
  return rows;
}
