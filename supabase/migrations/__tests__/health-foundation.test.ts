import { readFileSync } from 'fs';

const readMigration = (name: string) =>
  readFileSync(`supabase/migrations/${name}`, 'utf8');

const metadata = readMigration('20260921100000_health_document_metadata.sql');
const domain = readMigration('20260921110000_health_domain.sql');
const grants = readMigration('20260921120000_health_access_grants.sql');
const calendar = readMigration('20260921130000_health_calendar_sources.sql');

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
});
