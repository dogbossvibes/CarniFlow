import { supabase } from '@/lib/supabase';
import { loadReceivedHealthDogs } from '@/services/sharedHealthDogs';
import { projectSharedDogs, type ReceivedHealthGrant } from '@/features/dogs/sharing/model';

export type LegacyHealthRouteAccess = { kind: 'owner' } | { kind: 'recipient'; grants: ReceivedHealthGrant[] } | { kind: 'denied' };
async function assertAccount(account: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error || data.session?.user.id !== account) throw new Error('health_route_account_changed');
}

/** An empty owner-only probe is not proof of recipient rights. Errors never become owner=false. */
export async function resolveLegacyHealthRouteAccess(dogId: string, account: string): Promise<LegacyHealthRouteAccess> {
  if (!dogId || !account) throw new Error('health_route_scope_missing');
  await assertAccount(account);
  const { data, error } = await supabase.from('dogs').select('id,owner_id').eq('id', dogId).eq('owner_id', account).maybeSingle();
  if (error) throw new Error('health_route_owner_unavailable');
  if (data) {
    if (data.id !== dogId || data.owner_id !== account) throw new Error('health_route_invalid_owner');
    await assertAccount(account);
    return { kind: 'owner' };
  }
  const grants = await loadReceivedHealthDogs(dogId);
  await assertAccount(account);
  return projectSharedDogs(grants).some(dog => dog.id === dogId) ? { kind: 'recipient', grants } : { kind: 'denied' };
}
