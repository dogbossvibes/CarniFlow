import { readFileSync } from 'fs';

const readMigration = (name: string) =>
  readFileSync(`supabase/migrations/${name}`, 'utf8');

const metadata = readMigration('20260921100000_health_document_metadata.sql');
const domain = readMigration('20260921110000_health_domain.sql');
const grants = readMigration('20260921120000_health_access_grants.sql');
const calendar = readMigration('20260921130000_health_calendar_sources.sql');
const localRlsHarness = readFileSync('supabase/local/health_sharing_rls_test.sql', 'utf8');
const stagingHarness = readFileSync('scripts/qa/health-staging-rls.mjs', 'utf8');

describe('health foundation migrations', () => {
  it('keeps legacy document kinds and accepts current UI values', () => {
    expect(metadata).toContain('add column if not exists category text');
    expect(metadata).toContain('add column if not exists subtype text');
    expect(metadata).toContain('impfpass');
    expect(metadata).toContain("when 'gesundheit'");
    expect(metadata).toContain("'tierarzt'");
    expect(metadata).toContain('dog_documents_kind_legacy_compat_check');
    expect(metadata).toContain('category is null');
    expect(metadata).not.toMatch(/drop table[^;]*dog_documents/i);
  });

  it('creates the minimal health domain and extends existing models', () => {
    for (const table of [
      'dog_health_vaccinations',
      'dog_health_medications',
      'dog_health_conditions',
    ]) {
      expect(domain).toContain(`create table if not exists public.${table}`);
      expect(domain).toContain(`'${table}'`);
      expect(domain).toContain("execute format('alter table public.%I enable row level security;', table_name)");
    }
    expect(domain).toContain('alter table public.dog_vet_appointments');
    expect(domain).toContain('add column if not exists treatment_type text');
    expect(domain).toContain("'flea_tick'");
    expect(domain).toContain("kind in ('diagnosis', 'allergy', 'intolerance')");
    expect(domain).not.toContain('dog_health_vet_visits');
  });

  it('defines granular grants with time, connection, and owner checks', () => {
    expect(grants).toContain('create table if not exists public.dog_health_access_grants');
    for (const permission of [
      'can_view_health_summary',
      'can_view_weight',
      'can_view_vaccinations',
      'can_view_parasite_treatments',
      'can_view_medications',
      'can_view_diagnoses',
      'can_view_allergies',
      'can_view_vet_visits',
      'can_view_vet_reports',
      'can_view_lab_results',
      'can_view_health_documents',
      'can_view_emergency_info',
      'can_edit_health',
      'can_add_vet_notes',
    ]) {
      expect(grants).toContain(permission);
    }
    expect(grants).toContain('g.revoked_at is null');
    expect(grants).toContain('g.starts_at <= now()');
    expect(grants).toContain('(g.expires_at is null or g.expires_at > now())');
    expect(grants).toContain('health_dog_owner_matches');
    expect(grants).toContain('health_grant_connection_valid');
    expect(grants).toContain('set search_path = pg_catalog, public');
    expect(grants).toContain('can_view_dog_health(dog_id,');
    expect(grants).toContain("drop policy if exists %I_select on public.%I;");
    expect(grants).toContain("'dog_health_entries'");
    expect(grants).toContain('create policy dog_docs_read on storage.objects');
    expect(grants).toContain('can_read_dog_document_path(name)');
    expect(grants).not.toMatch(/create policy[^;]*can_add_vet_notes[^;]*for (insert|update)/is);
  });

  it('prepares nullable calendar source links without auto-creating events', () => {
    expect(calendar).toContain('add column if not exists source_type text');
    expect(calendar).toContain('add column if not exists source_id uuid');
    for (const sourceType of [
      'health_vaccination',
      'health_parasite_treatment',
      'health_medication',
      'health_vet_visit',
      'health_check',
    ]) {
      expect(calendar).toContain(sourceType);
    }
    expect(calendar).not.toMatch(/insert into public\.calendar_events/i);
  });

  it('does not swallow an unauthorized grant insert in the local harness', () => {
    expect(localRlsHarness).toContain("inserted := true;");
    expect(localRlsHarness).toContain("if inserted then");
    expect(localRlsHarness).toContain("raise exception 'RLS FAIL non-owner grant INSERT'");
    expect(localRlsHarness).not.toMatch(/raise exception 'RLS FAIL non-owner grant INSERT'[\s\S]*exception when others then null/i);
  });

  it('keeps the remote harness fail-closed and Auth-session based', () => {
    expect(stagingHarness).toContain("const EXPECTED_PROJECT_REF = 'cbhrxkjclakzlvajyvfn';");
    expect(stagingHarness).toContain("const PRODUCTION_PROJECT_REF = 'axkkhyqrjrtbkumaulta';");
    expect(stagingHarness).toContain('signInWithPassword');
    expect(stagingHarness).toContain("process.argv.includes('--execute')");
    expect(stagingHarness).toContain('Service-role credentials are forbidden');
    expect(stagingHarness).not.toMatch(/auth\.users/);
    expect(stagingHarness).not.toMatch(/PGPASSWORD/);
  });

  it('reports a sanitized active stage for remote failures', () => {
    expect(stagingHarness).toContain('let activeStage = \'STARTUP\';');
    expect(stagingHarness).toContain('primary_stage=${failure.stage}');
    expect(stagingHarness).toContain('primary_error=${sanitizeError(failure.error)}');
    expect(stagingHarness).toContain('cleanup=FAIL');
    expect(stagingHarness).toContain('cleanup_error=${sanitizeError(cleanupFailure.error)}');
    expect(stagingHarness).toContain('capturePrimaryFailure(error);');
    expect(stagingHarness).toContain('await cleanupSafely');
    expect(stagingHarness).toContain('owner_matches_session=');
    expect(stagingHarness).toContain('bucket_match=');
    expect(stagingHarness).toContain('path_owner_match=');
    expect(stagingHarness).toContain('safeStorageError(uploadError)');
    expect(stagingHarness).toContain('statusCode: error?.statusCode');
    expect(stagingHarness).toContain(".png`");
    expect(stagingHarness).toContain("contentType: 'image/png'");
    expect(stagingHarness).not.toContain("contentType: 'text/plain'");
    expect(stagingHarness).toContain('Bearer [redacted]');
    expect(stagingHarness).toContain('const REQUIRED_ENV_NAMES = [');
    for (const stage of [
      'ENV_VALIDATION', 'PROJECT_REF_GUARD', 'OWNER_AUTH', 'TRAINER_AUTH',
      'VET_AUTH', 'FAMILY_AUTH', 'UNRELATED_AUTH', 'FIXTURE_CREATE',
      'OWNER_RLS', 'UNRELATED_RLS', 'TRAINER_RLS', 'VET_RLS', 'FAMILY_RLS',
      'CUSTOM_GRANT', 'TIME_BOUND_GRANTS', 'LEGACY_BYPASS', 'STORAGE',
      'STORAGE_UPLOAD', 'WRITE_PROTECTION', 'GRANT_MANAGEMENT', 'CROSS_OWNER', 'CLEANUP',
    ]) {
      expect(stagingHarness).toContain(`setStage('${stage}')`);
    }
  });
});
