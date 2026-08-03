import { readFileSync } from 'fs';
import {
  hasActiveUserEntitlement,
  hasEffectiveCapability,
  isActiveUserEntitlement,
  isKnownUserEntitlement,
  REGULAR_PRODUCT_CAPABILITIES,
  resolveEffectiveCapabilities,
  type UserEntitlementRecord,
} from '@/features/subscription/plans';

const now = new Date('2026-08-02T12:00:00.000Z');

const entitlement = (patch: Partial<UserEntitlementRecord> = {}): UserEntitlementRecord => ({
  id: patch.id ?? 'entitlement-1',
  userId: patch.userId ?? 'user-1',
  entitlement: patch.entitlement ?? 'lifetime',
  grantedAt: patch.grantedAt ?? '2026-08-01T12:00:00.000Z',
  expiresAt: patch.expiresAt ?? null,
  revokedAt: patch.revokedAt ?? null,
  notes: patch.notes ?? null,
});

describe('User-Entitlements', () => {
  it('lifetime ohne Ablaufdatum ist aktiv', () => {
    expect(isActiveUserEntitlement(entitlement(), now)).toBe(true);
    expect(hasActiveUserEntitlement([entitlement()], 'lifetime', now)).toBe(true);
  });

  it('lifetime mit zukünftigem Ablaufdatum ist aktiv', () => {
    expect(isActiveUserEntitlement(entitlement({ expiresAt: '2026-09-01T00:00:00.000Z' }), now)).toBe(true);
  });

  it('beta_tester wird kontrolliert erkannt', () => {
    expect(isKnownUserEntitlement('beta_tester')).toBe(true);
    expect(hasActiveUserEntitlement([entitlement({ entitlement: 'beta_tester' })], 'beta_tester', now)).toBe(true);
  });

  it('abgelaufene und widerrufene Entitlements sind nicht aktiv', () => {
    expect(isActiveUserEntitlement(entitlement({ expiresAt: '2026-07-01T00:00:00.000Z' }), now)).toBe(false);
    expect(isActiveUserEntitlement(entitlement({ revokedAt: '2026-08-01T13:00:00.000Z' }), now)).toBe(false);
  });

  it('unbekannte Entitlement-Werte werden defensiv abgelehnt', () => {
    expect(isKnownUserEntitlement('developer_admin')).toBe(false);
  });
});

describe('resolveEffectiveCapabilities', () => {
  it('NEWBIE ohne Entitlement erhält keine Premiumrechte', () => {
    const effective = resolveEffectiveCapabilities({
      subscription: { plan: 'newbie', status: 'trialing' },
      entitlements: [],
    }, now);
    expect(effective.pro_member).toBe(false);
    expect(effective.trainer_module).toBe(false);
    expect(hasEffectiveCapability(effective, 'training.create')).toBe(true);
    expect(hasEffectiveCapability(effective, 'ai.feedback')).toBe(false);
  });

  it('NEWBIE mit lifetime erhält alle regulären Premium- und Trainerrechte', () => {
    const effective = resolveEffectiveCapabilities({
      subscription: { plan: 'newbie', status: 'trialing' },
      entitlements: [entitlement()],
    }, now);
    expect(effective.pro_member).toBe(true);
    expect(effective.trainer_module).toBe(true);
    expect(effective.hasLifetimeAccess).toBe(true);
    for (const capability of REGULAR_PRODUCT_CAPABILITIES) {
      expect(hasEffectiveCapability(effective, capability)).toBe(true);
    }
  });

  it('ACTIVE mit lifetime bleibt vollständig freigeschaltet', () => {
    const effective = resolveEffectiveCapabilities({
      subscription: { plan: 'active', status: 'active' },
      entitlements: [entitlement()],
    }, now);
    expect(effective.pro_member).toBe(true);
    expect(effective.trainer_module).toBe(true);
  });

  it('TRAINER ohne Entitlement behält bestehende Trainerrechte', () => {
    const effective = resolveEffectiveCapabilities({
      subscription: { plan: 'trainer', status: 'active' },
      entitlements: [],
    }, now);
    expect(effective.pro_member).toBe(true);
    expect(effective.trainer_module).toBe(true);
    expect(hasEffectiveCapability(effective, 'trainer.dashboard')).toBe(true);
  });

  it('lifetime gewährt keine Admin- oder Debugrechte', () => {
    const effective = resolveEffectiveCapabilities({
      subscription: null,
      entitlements: [entitlement()],
    }, now);
    expect(hasEffectiveCapability(effective, 'admin.dashboard')).toBe(false);
    expect(hasEffectiveCapability(effective, 'debug.tools')).toBe(false);
  });

  it('mehrere Entitlements werden zusammengeführt', () => {
    const effective = resolveEffectiveCapabilities({
      subscription: null,
      entitlements: [entitlement({ entitlement: 'beta_tester' }), entitlement()],
    }, now);
    expect(effective.activeEntitlements).toEqual(['beta_tester', 'lifetime']);
    expect(effective.hasLifetimeAccess).toBe(true);
  });

  it('Subscription-Refresh entfernt lifetime nicht', () => {
    const effective = resolveEffectiveCapabilities({
      subscription: { plan: 'active', status: 'expired' },
      entitlements: [entitlement()],
    }, now);
    expect(effective.pro_member).toBe(true);
    expect(effective.trainer_module).toBe(true);
  });

  it('Logout oder Benutzerwechsel ohne Entitlements übernimmt keine alten Rechte', () => {
    const firstUser = resolveEffectiveCapabilities({
      subscription: null,
      entitlements: [entitlement()],
    }, now);
    const secondUser = resolveEffectiveCapabilities({
      subscription: null,
      entitlements: [],
    }, now);
    expect(firstUser.hasLifetimeAccess).toBe(true);
    expect(secondUser).toMatchObject({ pro_member: false, trainer_module: false, hasLifetimeAccess: false });
  });
});

describe('user_entitlements migration', () => {
  const sql = readFileSync('supabase/migrations/20260802100000_user_entitlements.sql', 'utf8').toLowerCase();

  it('beschränkt Entitlement-Werte und definiert aktive Lese-RLS', () => {
    for (const value of ['lifetime', 'beta_tester', 'ambassador', 'staff']) {
      expect(sql).toContain(`'${value}'`);
    }
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/for select\s+to authenticated/);
    expect(sql).toMatch(/user_id\s*=\s*auth\.uid\(\)/);
    expect(sql).toMatch(/revoked_at is null/);
    expect(sql).toMatch(/expires_at is null or expires_at > now\(\)/);
  });

  it('gibt authenticated keine Schreibpolicy und nutzt den bestehenden updated_at-Trigger', () => {
    expect(sql).not.toMatch(/for insert\s+to authenticated/);
    expect(sql).not.toMatch(/for update\s+to authenticated/);
    expect(sql).not.toMatch(/for delete\s+to authenticated/);
    expect(sql).toMatch(/execute function public\.set_updated_at\(\)/);
  });
});
