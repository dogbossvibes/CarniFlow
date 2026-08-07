import { readFileSync } from 'fs';
import { Alert } from 'react-native';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

import { supabase } from '@/lib/supabase';
import { claimNewbieQuota, quotaBlock } from '@/services/quotaService';
import { handleQuotaBlock } from '@/features/subscription/quotaUx';

const rpc = supabase.rpc as unknown as jest.Mock;
const withDev = async (dev: boolean, fn: () => Promise<void>) => {
  const prev = (global as any).__DEV__;
  (global as any).__DEV__ = dev;
  try { await fn(); } finally { (global as any).__DEV__ = prev; }
};

describe('claimNewbieQuota — Server-Autorität', () => {
  afterEach(() => rpc.mockReset());

  it('success=true → ok', async () => {
    rpc.mockResolvedValue({ data: [{ success: true, used: 1, limit: 2 }], error: null });
    expect((await claimNewbieQuota('training', 'a')).status).toBe('ok');
  });

  it('success=false → exceeded', async () => {
    rpc.mockResolvedValue({ data: [{ success: false, used: 2, limit: 2 }], error: null });
    expect((await claimNewbieQuota('training', 'a')).status).toBe('exceeded');
  });

  it('Premium (unlimited) → ok', async () => {
    rpc.mockResolvedValue({ data: [{ success: true, used: 0, limit: 2147483647 }], error: null });
    expect((await claimNewbieQuota('track', 'a')).status).toBe('ok');
  });

  it('Idempotenz: derselbe ref liefert erneut ok (Server dedupt)', async () => {
    rpc.mockResolvedValue({ data: [{ success: true, used: 1, limit: 1 }], error: null });
    expect((await claimNewbieQuota('track', 'same-id')).status).toBe('ok');
    expect((await claimNewbieQuota('track', 'same-id')).status).toBe('ok');
  });

  it('PRODUCTION + RPC-Fehler → FAIL-CLOSED (error), kein Bypass', async () => {
    await withDev(false, async () => {
      rpc.mockResolvedValue({ data: null, error: { message: 'network down' } });
      expect((await claimNewbieQuota('track', 'a')).status).toBe('error');
    });
  });

  it('DEV + RPC-Fehler → markierter dev-bypass (ok)', async () => {
    await withDev(true, async () => {
      rpc.mockResolvedValue({ data: null, error: { message: 'network down' } });
      const r = await claimNewbieQuota('track', 'a');
      expect(r.status).toBe('ok');
      expect(r.error).toMatch(/dev-bypass/);
    });
  });
});

describe('quotaBlock', () => {
  it('ok → null (fortfahren)', () => expect(quotaBlock('ok')).toBeNull());
  it('exceeded → quota_exceeded', () => expect(quotaBlock('exceeded')?.code).toBe('quota_exceeded'));
  it('error → quota_error', () => expect(quotaBlock('error')?.code).toBe('quota_error'));
});

describe('handleQuotaBlock — UX', () => {
  const t = ((k: string) => k) as any;
  let alertSpy: jest.SpyInstance;
  beforeEach(() => { alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });
  afterEach(() => alertSpy.mockRestore());

  it('quota_exceeded → Upgrade-Alert + true', () => {
    const onUpgrade = jest.fn();
    expect(handleQuotaBlock({ code: 'quota_exceeded' }, 'track', t, onUpgrade)).toBe(true);
    expect(alertSpy).toHaveBeenCalled();
  });

  it('quota_error → Retry-Alert + true (KEIN Upgrade-Autoöffnen)', () => {
    const onUpgrade = jest.fn();
    expect(handleQuotaBlock({ code: 'quota_error' }, 'training', t, onUpgrade)).toBe(true);
    expect(onUpgrade).not.toHaveBeenCalled();
  });

  it('normaler Fehler → false (Aufrufer zeigt generischen Fehler)', () => {
    expect(handleQuotaBlock({ message: 'db error' }, 'training', t, jest.fn())).toBe(false);
  });
});

describe('SUBSCRIPTION_NEWBIE_QUOTAS_SETUP.sql — Struktur', () => {
  const sql = readFileSync('SUBSCRIPTION_NEWBIE_QUOTAS_SETUP.sql', 'utf8').toLowerCase();
  it('Limits: dog=1, training=1, track=0 (NEWBIE: 1 Training/Monat, keine Fährte)', () => {
    expect(sql).toMatch(/'dog' then 1/);
    expect(sql).toMatch(/'training' then 1/);
    expect(sql).toMatch(/'track' then 0/);
  });
  it('atomar (advisory lock) + idempotent (ref_id primary key)', () => {
    expect(sql).toMatch(/pg_advisory_xact_lock/);
    expect(sql).toMatch(/primary key \(user_id, kind, ref_id\)/);
  });
  it('append-only: Claims werden nicht gelöscht (kein Quota-Refund per Löschen)', () => {
    expect(sql).not.toMatch(/delete\s+from\s+(public\.)?newbie_quota_claims/);
  });
  it('sicher: auth.uid() + SECURITY DEFINER + RLS', () => {
    expect(sql).toMatch(/auth\.uid\(\)/);
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/enable row level security/);
  });
  it('Premium wird durchgelassen (is_pro_member)', () => {
    expect(sql).toMatch(/is_pro_member/);
  });
  it('versioniert den finalen subscriptions.plan-Constraint inklusive newbie und Legacy-Wert', () => {
    expect(sql).toMatch(/drop constraint if exists subscriptions_plan_check/);
    expect(sql).toMatch(/add constraint subscriptions_plan_check/);
    expect(sql).toMatch(/plan is null/);
    for (const plan of ['beginner_trial', 'newbie', 'founder_active', 'active', 'trainer']) {
      expect(sql).toContain(`'${plan}'`);
    }
  });
  it('schreibt keine bestehenden Subscription-Planwerte um', () => {
    expect(sql).not.toMatch(/update\s+public\.subscriptions\s+set\s+plan/);
  });
});

describe('Migration 20260808120000_newbie_training_quota_one.sql — Struktur', () => {
  const mig = readFileSync('supabase/migrations/20260808120000_newbie_training_quota_one.sql', 'utf8').toLowerCase();
  it('ersetzt ausschliesslich newbie_quota_limit (CREATE OR REPLACE)', () => {
    expect(mig).toMatch(/create or replace function public\.newbie_quota_limit/);
  });
  it('finale Server-Limits: dog=1, training=1, track=0', () => {
    expect(mig).toMatch(/'dog' then 1/);
    expect(mig).toMatch(/'training' then 1/);
    expect(mig).toMatch(/'track' then 0/);
  });
  it('Signatur/Attribute erhalten: language sql immutable (kein security definer/search_path)', () => {
    expect(mig).toMatch(/language sql immutable/);
    expect(mig).not.toMatch(/security definer/);
  });
  it('additiv & nicht-destruktiv: kein DROP/DELETE, keine RLS-/Policy-/Grant-Änderung', () => {
    expect(mig).not.toMatch(/drop\s+table/);
    expect(mig).not.toMatch(/drop\s+function/);
    expect(mig).not.toMatch(/\bdelete\s+from\b/);
    expect(mig).not.toMatch(/enable row level security/);
    expect(mig).not.toMatch(/create\s+policy/);
    expect(mig).not.toMatch(/drop\s+policy/);
    expect(mig).not.toMatch(/\brevoke\b/);
    expect(mig).not.toMatch(/create\s+table/);
  });
  it('ändert keine anderen RPCs (nur newbie_quota_limit)', () => {
    expect(mig).not.toMatch(/function public\.claim_newbie_quota/);
    expect(mig).not.toMatch(/function public\.newbie_quota_status/);
    expect(mig).not.toMatch(/function public\.is_pro_member/);
  });
});
