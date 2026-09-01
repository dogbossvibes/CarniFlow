/* eslint-disable import/first */
// activatePlan: NEWBIE ist dauerhaft kostenlos, kein Trial mehr. Belegt: kein
// impliziter status='trialing' für NEWBIE, kein trial_ends_at, und die alte
// profiles-Spiegelung (hooks/usePlan.ts → aiUnlocked in app/dog/[id].tsx) markiert
// NEWBIE nicht mehr fälschlich als 'premium'. ACTIVE/TRAINER bleiben unverändert.
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

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

  it('ACTIVE bleibt unverändert: status active, profiles premium mit Ablaufdatum aus periodEndsAt', async () => {
    const calls = mockTables();
    await activatePlan({ userId: 'u1', plan: 'active', periodEndsAt: '2026-09-30T00:00:00.000Z' });
    expect(calls.subscriptions[0]).toMatchObject({ plan: 'active', status: 'active' });
    expect(calls.profiles[0]).toMatchObject({ plan: 'premium', plan_expires_at: '2026-09-30T00:00:00.000Z' });
    expect(calls.user_capabilities[0]).toMatchObject({ pro_member: true, trainer_module: false });
  });

  it('TRAINER bleibt unverändert: status active, profiles premium + is_trainer', async () => {
    const calls = mockTables();
    await activatePlan({ userId: 'u1', plan: 'trainer', periodEndsAt: '2026-09-30T00:00:00.000Z' });
    expect(calls.subscriptions[0]).toMatchObject({ plan: 'trainer', status: 'active' });
    expect(calls.profiles[0]).toMatchObject({ plan: 'premium', is_trainer: true });
    expect(calls.user_capabilities[0]).toMatchObject({ pro_member: true, trainer_module: true });
  });

  it('FOUNDER_ACTIVE bleibt unverändert: profiles premium (wie jeder andere Premium-Plan)', async () => {
    const calls = mockTables();
    await activatePlan({ userId: 'u1', plan: 'founder_active', periodEndsAt: '2026-09-30T00:00:00.000Z' });
    expect(calls.profiles[0]).toMatchObject({ plan: 'premium', plan_expires_at: '2026-09-30T00:00:00.000Z' });
  });

  it('ein expliziter args.status wird weiterhin respektiert (kein Verhalten entfernt, nur der NEWBIE-Default)', async () => {
    const calls = mockTables();
    await activatePlan({ userId: 'u1', plan: 'active', status: 'past_due' });
    expect(calls.subscriptions[0]).toMatchObject({ status: 'past_due' });
  });
});
