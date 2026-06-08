-- ANYVO — Training Hub / Kalender
-- Im Supabase SQL-Editor ausführen. Idempotent.

create table if not exists public.calendar_events (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,   -- Kalender-Eigentümer (Kunde)
  created_by  uuid not null references auth.users(id) on delete cascade,   -- wer angelegt hat
  dog_id      uuid references public.dogs(id) on delete set null,
  trainer_id  uuid references auth.users(id) on delete set null,
  type        text not null default 'training',
  title       text not null,
  start_at    timestamptz not null,
  end_at      timestamptz,
  location    text,
  discipline  text,
  notes       text,
  status      text not null default 'confirmed',
  reminder_minutes integer[] not null default '{}',
  repeat      text not null default 'none',
  created_at  timestamptz not null default now()
);

create index if not exists calendar_events_owner_start_idx
  on public.calendar_events (owner_id, start_at);

alter table public.calendar_events enable row level security;

-- Sichtbar für Eigentümer, Ersteller und verknüpfte Trainer:in.
drop policy if exists calendar_select on public.calendar_events;
create policy calendar_select on public.calendar_events for select
  using (owner_id = auth.uid() or created_by = auth.uid() or trainer_id = auth.uid());

-- Anlegen: nur als Ersteller (Kunde für sich selbst, Trainer für Kunden).
drop policy if exists calendar_insert on public.calendar_events;
create policy calendar_insert on public.calendar_events for insert
  with check (created_by = auth.uid());

-- Ändern: Eigentümer (z. B. Accept/Decline), Ersteller oder Trainer.
drop policy if exists calendar_update on public.calendar_events;
create policy calendar_update on public.calendar_events for update
  using (owner_id = auth.uid() or created_by = auth.uid() or trainer_id = auth.uid());

drop policy if exists calendar_delete on public.calendar_events;
create policy calendar_delete on public.calendar_events for delete
  using (owner_id = auth.uid() or created_by = auth.uid());
