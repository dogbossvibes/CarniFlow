import { readFileSync } from 'fs';
const migration = readFileSync('supabase/migrations/20261008190000_internal_tracking_diagnostics_access.sql', 'utf8');
const code = migration.replace(/--[^\n]*/g, '');
const grant = readFileSync('supabase/operations/20261008_grant_personal_tracking_diagnostics.sql', 'utf8');
it('adds a default-deny capability with separate INSERT/UPDATE protection and fixed search path', () => {
  expect(code).toMatch(/can_use_internal_tracking_diagnostics boolean not null default false/);
  expect(code).toMatch(/security definer set search_path = ''/);
  expect(code).toMatch(/auth\.role\(\) is distinct from 'service_role'/);
  expect(code).toMatch(/if tg_op = 'INSERT'[\s\S]*new\.can_use_internal_tracking_diagnostics := false/);
  expect(code).toMatch(/new\.can_use_internal_tracking_diagnostics := old\.can_use_internal_tracking_diagnostics/);
  expect(code).toMatch(/before insert or update on public\.profiles/);
});
it('limits the personal grant to one account without changing existing tester, paid or trainer authority', () => {
  expect(code).toMatch(/create unique index[\s\S]*where can_use_internal_tracking_diagnostics = true/);
  expect(code).not.toMatch(/is_internal_tester|tester_level|subscription|user_capabilities|create policy|update public\.profiles/);
});
it('requires a single confirmed existing account and verifies unrelated profile fields in the admin operation', () => {
  expect(grant).toContain("lower(email) = 'einfachich503@gmail.com'");
  expect(grant).toContain('if matches <> 1'); expect(grant).toContain('email_confirmed_at is not null');
  expect(grant).toContain('if before_profile is null'); expect(grant).toContain('unrelated profile fields changed');
  expect(grant).toContain('profiles RLS is disabled'); expect(grant).toContain('policies differ from reviewed');
  expect(grant).not.toMatch(/insert into|delete from|set\s+is_internal_tester|set\s+tester_level/i);
});
