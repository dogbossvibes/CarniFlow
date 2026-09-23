-- ANYVO Health Foundation: structured health domain.
-- Additive only. Existing health rows and API contracts remain valid.

-- Existing vet appointments become a backward-compatible unified appointment/visit record.
alter table public.dog_vet_appointments
  add column if not exists status text not null default 'scheduled',
  add column if not exists clinic_name text,
  add column if not exists diagnosis text,
  add column if not exists treatment text,
  add column if not exists cost_amount numeric(10,2),
  add column if not exists document_id uuid references public.dog_documents(id) on delete set null,
  add column if not exists completed_at timestamptz,
  add column if not exists note text;

alter table public.dog_vet_appointments
  drop constraint if exists dog_vet_appointments_status_check,
  drop constraint if exists dog_vet_appointments_cost_amount_check;

alter table public.dog_vet_appointments
  add constraint dog_vet_appointments_status_check
    check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
  add constraint dog_vet_appointments_cost_amount_check
    check (cost_amount is null or cost_amount >= 0);

create index if not exists dog_vet_dog_status_at_idx
  on public.dog_vet_appointments (dog_id, status, appointment_at);

-- Existing deworming rows become the default parasite-treatment type.
alter table public.dog_deworming_entries
  add column if not exists treatment_type text not null default 'deworming';

alter table public.dog_deworming_entries
  drop constraint if exists dog_deworming_entries_treatment_type_check;

alter table public.dog_deworming_entries
  add constraint dog_deworming_entries_treatment_type_check
    check (treatment_type in ('deworming', 'flea_tick', 'heartworm', 'other'));

create index if not exists dog_parasite_entries_dog_type_date_idx
  on public.dog_deworming_entries (dog_id, treatment_type, treatment_date desc);

create table if not exists public.dog_health_vaccinations (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users(id) on delete cascade,
  dog_id           uuid not null references public.dogs(id) on delete cascade,
  vaccine_type     text not null,
  administered_on  date not null,
  next_due_on      date,
  clinic_name      text,
  vaccine_name     text,
  note             text,
  document_id      uuid references public.dog_documents(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint dog_health_vaccinations_next_due_check
    check (next_due_on is null or next_due_on >= administered_on)
);

create index if not exists dog_health_vaccinations_dog_date_idx
  on public.dog_health_vaccinations (dog_id, administered_on desc);

create table if not exists public.dog_health_medications (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  dog_id      uuid not null references public.dogs(id) on delete cascade,
  name        text not null,
  dosage      text,
  frequency   text,
  starts_on   date not null,
  ends_on     date,
  is_active   boolean not null default true,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint dog_health_medications_end_date_check
    check (ends_on is null or ends_on >= starts_on)
);

create index if not exists dog_health_medications_dog_active_idx
  on public.dog_health_medications (dog_id, is_active, starts_on desc);

create table if not exists public.dog_health_conditions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  dog_id      uuid not null references public.dogs(id) on delete cascade,
  kind        text not null,
  name        text not null,
  status      text not null default 'active',
  started_on  date,
  ended_on    date,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint dog_health_conditions_kind_check
    check (kind in ('diagnosis', 'allergy', 'intolerance')),
  constraint dog_health_conditions_status_check
    check (status in ('active', 'resolved', 'chronic', 'suspected', 'historical', 'inactive', 'other')),
  constraint dog_health_conditions_end_date_check
    check (ended_on is null or started_on is null or ended_on >= started_on)
);

create index if not exists dog_health_conditions_dog_kind_status_idx
  on public.dog_health_conditions (dog_id, kind, status);

-- Initial owner-only policies are deliberately replaced by the grant-aware
-- policies in the following security migration.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'dog_health_vaccinations',
    'dog_health_medications',
    'dog_health_conditions'
  ] loop
    execute format('alter table public.%I enable row level security;', table_name);
    execute format('drop policy if exists %I_owner_select on public.%I;', table_name, table_name);
    execute format('create policy %I_owner_select on public.%I for select using (owner_id = auth.uid());', table_name, table_name);
    execute format('drop policy if exists %I_owner_insert on public.%I;', table_name, table_name);
    execute format('create policy %I_owner_insert on public.%I for insert with check (owner_id = auth.uid());', table_name, table_name);
    execute format('drop policy if exists %I_owner_update on public.%I;', table_name, table_name);
    execute format('create policy %I_owner_update on public.%I for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());', table_name, table_name);
    execute format('drop policy if exists %I_owner_delete on public.%I;', table_name, table_name);
    execute format('create policy %I_owner_delete on public.%I for delete using (owner_id = auth.uid());', table_name, table_name);
  end loop;
end $$;
