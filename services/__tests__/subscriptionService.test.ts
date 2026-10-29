/* eslint-disable import/first */
// activatePlan: NEWBIE ist dauerhaft kostenlos, kein Trial mehr. Belegt: kein
// impliziter status='trialing' für NEWBIE, kein trial_ends_at, und die alte
// profiles-Spiegelung (hooks/usePlan.ts → aiUnlocked in app/dog/[id].tsx) markiert
// NEWBIE nicht mehr fälschlich als 'premium'. ACTIVE/TRAINER bleiben unverändert.
jest.mock('@/services/subscriptionAuthorityService', () => ({syncSubscriptionAuthority:jest.fn(async()=>({error:null}))}));
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import { syncSubscriptionAuthority } from '@/services/subscriptionAuthorityService';
import { supabase } from '@/lib/supabase';
import { activatePlan } from '@/services/subscriptionService';

const from = supabase.from as unknown as jest.Mock;

function mockTables() {
  const calls: { subscriptions: any[]; user_capabilities: any[]; profiles: any[] } = {
    subscriptions: [], user_capabilities: [], profiles: [],
  };
  from.mockImplementation((table: string) => {
    if (table === 'subscriptions' || table === 'user_capabilities') {
      return {
        upsert: jest.fn((payload: any) => {
          calls[table as 'subscriptions' | 'user_capabilities'].push(payload);
          return Promise.resolve({ error: null });
        }),
      };
    }
    if (table === 'profiles') {
      return {
        update: jest.fn((payload: any) => {
          calls.profiles.push(payload);
          return { eq: jest.fn().mockResolvedValue({ error: null }) };
        }),
      };
    }
    throw new Error(`unerwartete Tabelle in diesem Test: ${table}`);
  });
  return calls;
}

describe('activatePlan — NEWBIE ist kein Trial mehr', () => {
  afterEach(() => from.mockReset());

  it('NEWBIE: status active statt trialing, trial_ends_at null', async () => {
    const calls = mockTables();
    const { error } = await activatePlan({ userId: 'u1', plan: 'newbie' });
    expect(error).toBeNull();
    expect(calls.subscriptions[0]).toMatchObject({ plan: 'newbie', status: 'active', trial_ends_at: null });
  });

  it('NEWBIE: profiles-Spiegel ist free ohne Ablaufdatum (nicht mehr premium)', async () => {
    const calls = mockTables();
    await activatePlan({ userId: 'u1', plan: 'newbie' });
    expect(calls.profiles[0]).toMatchObject({ plan: 'free', plan_expires_at: null });
  });

  it('NEWBIE: user_capabilities bleibt pro_member=false, trainer_module=false', async () => {
    const calls = mockTables();
    await activatePlan({ userId: 'u1', plan: 'newbie' });
    expect(calls.user_capabilities[0]).toMatchObject({ pro_member: false, trainer_module: false });
  });

  it.each(['active','trainer','founder_active'] as const)('paid %s delegates to verified sync and never writes client mirrors', async plan => {
    const calls=mockTables();
    await activatePlan({userId:'u1',plan,periodEndsAt:'2099-01-01',providerProductId:'client-product'});
    expect(syncSubscriptionAuthority).toHaveBeenCalledWith('u1',plan);
    expect(calls.subscriptions).toEqual([]);expect(calls.profiles).toEqual([]);expect(calls.user_capabilities).toEqual([]);
  });
  it('untrusted paid status and expiry are not used as authority; pending propagates',async()=>{
    (syncSubscriptionAuthority as jest.Mock).mockResolvedValueOnce({error:'SUBSCRIPTION_SYNC_PENDING',pending:true});
    mockTables();
    await expect(activatePlan({userId:'u1',plan:'active',status:'past_due',periodEndsAt:'2099-01-01'})).resolves.toEqual({error:'SUBSCRIPTION_SYNC_PENDING',pending:true});
    expect(from).not.toHaveBeenCalled();
  });
});
