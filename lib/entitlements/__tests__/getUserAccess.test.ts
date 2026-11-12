import { getPlanSubscription } from '@/services/subscriptionService';
import { getActiveEntitlements } from '@/services/entitlementService';
import { getUserAccess } from '../getUserAccess';

jest.mock('@/services/subscriptionService', () => ({ getPlanSubscription: jest.fn() }));
jest.mock('@/services/entitlementService', () => ({ getActiveEntitlements: jest.fn() }));

const sub = getPlanSubscription as jest.Mock;
const grants = getActiveEntitlements as jest.Mock;
const active = { id: 'a', userId: 'one', entitlement: 'active_lifetime', grantedAt: '2026-01-01T00:00:00Z', expiresAt: null, revokedAt: null };
beforeEach(() => { sub.mockReset().mockResolvedValue(null); grants.mockReset().mockResolvedValue([]); });

it('identifiziert lebenslang ACTIVE getrennt von Lifetime-TRAINER', async () => {
  sub.mockResolvedValue({ plan: 'active', status: 'expired' });
  grants.mockResolvedValue([active]);
  expect(await getUserAccess('one')).toEqual({ hasActiveAccess: true, hasTrainerAccess: false, source: 'admin', planType: 'active_lifetime', isLifetime: true, expiresAt: null });
  expect(grants).toHaveBeenCalledWith('one');
});

it('Store-Expiration/Refresh löscht den Grant nicht und Widerruf sperrt wieder', async () => {
  grants.mockResolvedValue([active]);
  expect((await getUserAccess('one')).hasActiveAccess).toBe(true);
  sub.mockResolvedValue({ plan: 'active', status: 'expired' });
  expect((await getUserAccess('one')).hasActiveAccess).toBe(true);
  grants.mockResolvedValue([{ ...active, revokedAt: '2026-01-02T00:00:00Z' }]);
  expect(await getUserAccess('one')).toMatchObject({ hasActiveAccess: false, hasTrainerAccess: false, isLifetime: false });
});

it('bewahrt echte TRAINER-Käufe und priorisiert bestehendes Voll-Lifetime', async () => {
  sub.mockResolvedValue({ plan: 'trainer', status: 'active' });
  grants.mockResolvedValue([active]);
  expect(await getUserAccess('one')).toMatchObject({ hasTrainerAccess: true, planType: 'active_lifetime' });
  grants.mockResolvedValue([active, { ...active, id: 'b', entitlement: 'lifetime' }]);
  expect(await getUserAccess('one')).toMatchObject({ hasTrainerAccess: true, planType: 'lifetime' });
});

it('NEWBIE und Accountwechsel bekommen kein manuelles ACTIVE-Recht', async () => {
  sub.mockResolvedValue({ plan: 'newbie', status: 'active' });
  expect((await getUserAccess('two')).hasActiveAccess).toBe(false);
  expect(grants).toHaveBeenCalledWith('two');
});
