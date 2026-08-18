-- ANYVO: additive dog deworming records for Health Phase 2.
--
-- This file is intentionally local-only until an explicit Supabase migration
-- approval. It creates no medical interval defaults: next_due_date is always
-- chosen by the owner when they have the scheduling capability.

create table if not exists public.dog_deworming_entries (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users(id) on delete cascade,
  dog_id             uuid not null references public.dogs(id) on delete cascade,
  treatment_date     date not null default current_date,
  product            text,
  note               text,
  next_due_date      date,
  created_at         timestamptz not null default now(),
  constraint dog_deworming_next_due_after_treatment_chk
    check (next_due_date is null or next_due_date >= treatment_date)
);

create index if not exists dog_deworming_entries_dog_treatment_idx
  on public.dog_deworming_entries (dog_id, treatment_date desc, created_at desc);

alter table public.dog_deworming_entries enable row level security;

-- Health records are private: every operation requires both the authenticated
-- owner and ownership of the referenced dog. No connected-trainer exception.
drop policy if exists dog_deworming_entries_select on public.dog_deworming_entries;
create policy dog_deworming_entries_select on public.dog_deworming_entries
  for select using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.dogs d
      where d.id = dog_deworming_entries.dog_id
        and d.owner_id = auth.uid()
    )
  );

drop policy if exists dog_deworming_entries_insert on public.dog_deworming_entries;
create policy dog_deworming_entries_insert on public.dog_deworming_entries
  for insert with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.dogs d
      where d.id = dog_deworming_entries.dog_id
        and d.owner_id = auth.uid()
    )
  );

drop policy if exists dog_deworming_entries_update on public.dog_deworming_entries;
create policy dog_deworming_entries_update on public.dog_deworming_entries
  for update using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.dogs d
      where d.id = dog_deworming_entries.dog_id
        and d.owner_id = auth.uid()
    )
  ) with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.dogs d
      where d.id = dog_deworming_entries.dog_id
        and d.owner_id = auth.uid()
    )
  );

drop policy if exists dog_deworming_entries_delete on public.dog_deworming_entries;
create policy dog_deworming_entries_delete on public.dog_deworming_entries
  for delete using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.dogs d
      where d.id = dog_deworming_entries.dog_id
        and d.owner_id = auth.uid()
    )
  );
