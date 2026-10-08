import { supabase } from '@/lib/supabase';
import { getMyCapabilities } from '../capabilityService';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

const from = supabase.from as unknown as jest.Mock;
let trainer = false;
let revoked = false;
let tester = false;
beforeEach(() => {
  trainer = false; revoked = false; tester = false;
  from.mockImplementation((table: string) => {
    let uid = '';
    const data = () => {
      if (table === 'user_entitlements') return uid === 'one' ? [{ id: 'g', user_id: uid, entitlement: 'active_lifetime', granted_at: '2026-01-01T00:00:00Z', expires_at: null, revoked_at: revoked ? '2026-01-02T00:00:00Z' : null, notes: null }] : [];
      if (table === 'user_capabilities') return { pro_member: trainer, trainer_module: trainer };
      if (table === 'subscriptions') return { plan: 'active', status: 'expired', trial_ends_at: null };
      return { is_internal_tester: tester, tester_level: tester ? 'qa' : null };
    };
    const q = {
      select: () => q,
      eq: (_key: string, value: string) => { uid = value; return q; },
      is: () => q,
      or: async () => ({ data: data(), error: null }),
      maybeSingle: async () => ({ data: data(), error: null }),
    };
    return q;
  });
});

it('resolves real DB grant rows into ACTIVE-only capabilities', async () => {
  expect(await getMyCapabilities('one')).toMatchObject({ pro_member: true, trainer_module: false, hasLifetimeAccess: false, hasActiveLifetimeAccess: true });
});
it('revocation and another account do not inherit ACTIVE', async () => {
  revoked = true;
  expect(await getMyCapabilities('one')).toMatchObject({ pro_member: false, trainer_module: false });
  expect(await getMyCapabilities('two')).toMatchObject({ pro_member: false, trainer_module: false });
});
it('existing paid trainer and tester unions remain intact', async () => {
  trainer = true;
  expect(await getMyCapabilities('one')).toMatchObject({ pro_member: true, trainer_module: true });
  trainer = false; tester = true;
  expect(await getMyCapabilities('two')).toMatchObject({ pro_member: true, trainer_module: true });
});
