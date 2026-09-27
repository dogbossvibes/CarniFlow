-- ANYVO Health Phase 3: vaccination detail fields + medication administration
-- history ("Gaben"). Additive only — no drops, no renames, no destructive
-- changes, no changes to existing Health data ownership.

-- Vaccinations: batch/lot number is the only required Phase 3 field missing
-- from the existing table (vaccine_type/vaccine_name, administered_on,
-- next_due_on, clinic_name, note, document_id already exist from the Health
-- Foundation migration — audited before adding anything).
alter table public.dog_health_vaccinations
  add column if not exists batch_number text;

-- Medications: the existing dosage/frequency free-text fields are kept
-- exactly as-is (still valid, still displayed everywhere they already are).
-- These are new, optional, structured columns alongside them — nothing
-- existing is renamed, removed, or reinterpreted.
alter table public.dog_health_medications
  add column if not exists dose_amount numeric(10,2),
  add column if not exists dose_unit text,
  add column if not exists administration_route text,
  add column if not exists prescribing_vet text;

alter table public.dog_health_medications
  drop constraint if exists dog_health_medications_dose_amount_check;
alter table public.dog_health_medications
  add constraint dog_health_medications_dose_amount_check
    check (dose_amount is null or dose_amount >= 0);

-- Medication administration history ("Gaben"): each dose actually given is
-- its own independent, historical event. Creating one never overwrites the
-- parent medication row, and never overwrites any other administration —
-- the same medication can have any number of administrations, including
-- several on the same day with the same amount.
create table if not exists public.dog_health_medication_administrations (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references auth.users(id) on delete cascade,
  dog_id                uuid not null references public.dogs(id) on delete cascade,
  medication_id         uuid not null references public.dog_health_medications(id) on delete cascade,
  administered_at       timestamptz not null default now(),
  amount                numeric(10,2),
  unit                  text,
  administration_route  text,
  location              text,
  note                  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint dog_health_medication_administrations_amount_check
    check (amount is null or amount >= 0)
);

create index if not exists dog_health_medication_administrations_med_at_idx
  on public.dog_health_medication_administrations (medication_id, administered_at desc);
create index if not exists dog_health_medication_administrations_dog_idx
  on public.dog_health_medication_administrations (dog_id);

alter table public.dog_health_medication_administrations enable row level security;

-- Same authority as dog_health_medications itself — reuse the existing
-- can_view_medications grant permission, do not invent a broader one.
-- Writes remain owner-only, and medication_id must actually belong to the
-- same dog_id/owner (mirrors how document_id is validated against the same
-- dog for vaccinations/vet appointments elsewhere in this schema), so an
-- administration can never be attached to another owner's medication.
drop policy if exists dog_health_medication_administrations_select on public.dog_health_medication_administrations;
create policy dog_health_medication_administrations_select on public.dog_health_medication_administrations
  for select using (public.can_view_dog_health(dog_id, 'can_view_medications'));

drop policy if exists dog_health_medication_administrations_insert on public.dog_health_medication_administrations;
create policy dog_health_medication_administrations_insert on public.dog_health_medication_administrations
  for insert with check (
    owner_id = auth.uid()
    and public.health_dog_owner_matches(dog_id, owner_id)
    and exists (
      select 1 from public.dog_health_medications m
      where m.id = medication_id
        and m.dog_id = dog_health_medication_administrations.dog_id
        and m.owner_id = owner_id
    )
  );

drop policy if exists dog_health_medication_administrations_update on public.dog_health_medication_administrations;
create policy dog_health_medication_administrations_update on public.dog_health_medication_administrations
  for update using (owner_id = auth.uid() and public.health_dog_owner_matches(dog_id, owner_id))
  with check (
    owner_id = auth.uid()
    and public.health_dog_owner_matches(dog_id, owner_id)
    and exists (
      select 1 from public.dog_health_medications m
      where m.id = medication_id
        and m.dog_id = dog_health_medication_administrations.dog_id
        and m.owner_id = owner_id
    )
  );

drop policy if exists dog_health_medication_administrations_delete on public.dog_health_medication_administrations;
create policy dog_health_medication_administrations_delete on public.dog_health_medication_administrations
  for delete using (owner_id = auth.uid() and public.health_dog_owner_matches(dog_id, owner_id));
