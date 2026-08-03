import { readFileSync } from 'fs';

describe('lifetime quota migration', () => {
  const sql = readFileSync(
    'supabase/migrations/20260802110000_lifetime_quota_access.sql',
    'utf8',
  ).toLowerCase();

  it('extends is_pro_member additively with active lifetime', () => {
    expect(sql).toMatch(/create or replace function public\.is_pro_member\(p_user_id uuid\)/);
    expect(sql).toContain('from public.user_capabilities');
    expect(sql).toContain('from public.user_entitlements');
    expect(sql).toMatch(/ue\.entitlement\s*=\s*'lifetime'/);
    expect(sql).toMatch(/ue\.revoked_at\s+is\s+null/);
    expect(sql).toMatch(/ue\.expires_at\s+is\s+null\s+or\s+ue\.expires_at\s*>\s*now\(\)/);
    expect(sql).toMatch(/coalesce\([\s\S]*\)\s+or\s+exists/);
  });

  it('does not mirror entitlements or grant direct access to normal clients', () => {
    expect(sql).not.toMatch(/insert\s+into\s+public\.user_capabilities/);
    expect(sql).not.toMatch(/update\s+public\.user_capabilities/);
    expect(sql).toMatch(/revoke execute on function public\.is_pro_member\(uuid\) from public, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.is_pro_member\(uuid\) to service_role/);
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/set search_path\s*=\s*public/);
  });
});
