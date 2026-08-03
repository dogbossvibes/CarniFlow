/* eslint-disable import/first */
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import { supabase } from '@/lib/supabase';
import { getActiveEntitlements } from '@/services/entitlementService';

const from = supabase.from as unknown as jest.Mock;

function queryResult(result: unknown) {
  const or = jest.fn().mockResolvedValue(result);
  const is = jest.fn(() => ({ or }));
  const eq = jest.fn(() => ({ is }));
  const select = jest.fn(() => ({ eq }));
  from.mockReturnValue({ select });
  return { select, eq, is, or };
}

describe('getActiveEntitlements', () => {
  afterEach(() => from.mockReset());

  it('lädt nur eigene aktive Spalten aus user_entitlements', async () => {
    const chain = queryResult({
      data: [{
        id: 'ent-1',
        user_id: 'user-1',
        entitlement: 'lifetime',
        granted_at: '2026-08-01T00:00:00.000Z',
        expires_at: null,
        revoked_at: null,
        notes: 'manual grant',
      }],
      error: null,
    });

    await expect(getActiveEntitlements('user-1')).resolves.toEqual([{
      id: 'ent-1',
      userId: 'user-1',
      entitlement: 'lifetime',
      grantedAt: '2026-08-01T00:00:00.000Z',
      expiresAt: null,
      revokedAt: null,
      notes: 'manual grant',
    }]);
    expect(from).toHaveBeenCalledWith('user_entitlements');
    expect(chain.select).toHaveBeenCalledWith('id,user_id,entitlement,granted_at,expires_at,revoked_at,notes');
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(chain.is).toHaveBeenCalledWith('revoked_at', null);
    expect(chain.or).toHaveBeenCalledWith(expect.stringMatching(/expires_at\.is\.null,expires_at\.gt\./));
  });

  it('ignoriert unbekannte Werte und gibt bei Fehlern keine Rechte frei', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    queryResult({
      data: [{
        id: 'ent-1',
        user_id: 'user-1',
        entitlement: 'root',
        granted_at: '2026-08-01T00:00:00.000Z',
        expires_at: null,
        revoked_at: null,
        notes: null,
      }],
      error: null,
    });
    await expect(getActiveEntitlements('user-1')).resolves.toEqual([]);
    warn.mockRestore();

    queryResult({ data: null, error: { message: 'missing table' } });
    await expect(getActiveEntitlements('user-1')).resolves.toEqual([]);
  });
});
