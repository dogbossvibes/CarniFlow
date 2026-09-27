import { readFileSync } from 'fs';

const migration = readFileSync('supabase/migrations/20260929090000_health_vaccination_medication_history.sql', 'utf8');

describe('health vaccination + medication administration history migration (Phase 3, 28.09.2026)', () => {
  it('is additive only — no drops, no destructive statements', () => {
    expect(migration).not.toMatch(/drop table/i);
    expect(migration).not.toMatch(/^\s*delete from/im);
    expect(migration).not.toMatch(/drop column/i);
    expect(migration).not.toMatch(/rename column/i);
    expect(migration).toContain('add column if not exists');
    expect(migration).toContain('create table if not exists');
  });

  it('adds batch_number to the existing vaccination table without touching any existing column', () => {
    expect(migration).toContain('alter table public.dog_health_vaccinations');
    expect(migration).toContain('add column if not exists batch_number text;');
  });

  it('adds new nullable medication columns alongside the existing dosage/frequency fields', () => {
    expect(migration).toContain('alter table public.dog_health_medications');
    expect(migration).toContain('add column if not exists dose_amount numeric(10,2)');
    expect(migration).toContain('add column if not exists dose_unit text');
    expect(migration).toContain('add column if not exists administration_route text');
    expect(migration).toContain('add column if not exists prescribing_vet text');
    expect(migration).not.toContain('drop column if exists dosage');
    expect(migration).not.toContain('drop column if exists frequency');
  });

  it('creates the administration history table with the required fields and foreign keys', () => {
    expect(migration).toContain('create table if not exists public.dog_health_medication_administrations');
    for (const column of ['id', 'owner_id', 'dog_id', 'medication_id', 'administered_at', 'amount', 'unit', 'administration_route', 'location', 'note', 'created_at', 'updated_at']) {
      expect(migration).toContain(column);
    }
    expect(migration).toContain('references public.dogs(id) on delete cascade');
    expect(migration).toContain('references public.dog_health_medications(id) on delete cascade');
  });

  it('each administration is independent — no uniqueness constraint blocks repeat amount/date combinations', () => {
    expect(migration).not.toMatch(/unique\s*\(\s*medication_id/i);
    expect(migration).not.toMatch(/unique\s*\(\s*dog_id.*administered_at/i);
  });

  it('reuses the existing can_view_medications grant permission — does not invent a broader one', () => {
    expect(migration).toContain("can_view_dog_health(dog_id, 'can_view_medications')");
    expect(migration).not.toMatch(/can_view_medication_administrations/);
  });

  it('write policies are owner-only and validate medication_id belongs to the same dog/owner', () => {
    expect(migration).toContain('dog_health_medication_administrations_insert');
    expect(migration).toContain('dog_health_medication_administrations_update');
    expect(migration).toContain('dog_health_medication_administrations_delete');
    expect(migration).toContain('owner_id = auth.uid()');
    expect(migration).toContain('health_dog_owner_matches(dog_id, owner_id)');
    const matches = migration.match(/select 1 from public\.dog_health_medications m\s*where m\.id = medication_id/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2); // insert + update
  });

  it('enables row level security on the new table', () => {
    expect(migration).toContain('alter table public.dog_health_medication_administrations enable row level security;');
  });
});
