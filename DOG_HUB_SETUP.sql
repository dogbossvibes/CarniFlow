-- DOG_HUB_SETUP.sql  ·  VORSCHLAG zur Freigabe — NICHT automatisch ausgeführt.
-- Legt die Tabellen für die noch fehlenden Dog-Hub-Bereiche an:
--   Ziele (dog_goals) · Dokumente (dog_documents) · Gesundheit (dog_health_entries,
--   dog_vet_appointments).
-- Konventionen wie bestehende *_SETUP.sql: public-Schema, owner_id/dog_id mit FK,
-- idempotent. RLS: Eigentümer voll, verbundene Trainer (public.connections,
-- status='accepted') NUR lesend. In Supabase → SQL-Editor ausführen (nach Review).
-- Bestehende Tabellen werden NICHT verändert.

-- ── Ziele ────────────────────────────────────────────────────────────────────
create table if not exists public.dog_goals (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  dog_id      uuid not null references public.dogs(id) on delete cascade,
  title       text not null,                                   -- z. B. "IGP 1"
  overall_pct integer not null default 0 check (overall_pct between 0 and 100),
  parts       jsonb   not null default '[]'::jsonb,            -- [{ "label":"Unterordnung","pct":70 }, ...]
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists dog_goals_dog_active_idx on public.dog_goals (dog_id, is_active);

-- ── Dokumente ────────────────────────────────────────────────────────────────
-- file_url verweist auf eine Datei im Storage-Bucket (siehe Hinweis unten).
create table if not exists public.dog_documents (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  dog_id     uuid not null references public.dogs(id) on delete cascade,
  kind       text not null check (kind in ('impfpass','stammbaum','hd_ed','pruefung','sonstiges')),
  title      text,
  file_url   text,                                             -- Storage-Pfad/URL
  issued_on  date,
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists dog_documents_dog_kind_idx on public.dog_documents (dog_id, kind);

-- ── Gesundheit / Belastung (Zeitreihe) ───────────────────────────────────────
create table if not exists public.dog_health_entries (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  dog_id      uuid not null references public.dogs(id) on delete cascade,
  entry_date  date not null default current_date,
  weight_kg   numeric(5,2),
  load_level  text check (load_level in ('leicht','mittel','hoch')),
  is_rest_day boolean not null default false,
  is_intense  boolean not null default false,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists dog_health_dog_date_idx on public.dog_health_entries (dog_id, entry_date desc);

-- ── Tierarzttermine (für „nächster Termin") ──────────────────────────────────
create table if not exists public.dog_vet_appointments (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  dog_id         uuid not null references public.dogs(id) on delete cascade,
  appointment_at timestamptz not null,
  reason         text,
  created_at     timestamptz not null default now()
);
create index if not exists dog_vet_dog_at_idx on public.dog_vet_appointments (dog_id, appointment_at);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- SELECT: Eigentümer ODER ein über public.connections verbundener Trainer
--   (status='accepted'). Schreiben (insert/update/delete) bleibt eigentümer-only.
do $$
declare t text;
begin
  foreach t in array array['dog_goals','dog_documents','dog_health_entries','dog_vet_appointments']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I_select on public.%I;', t, t);
    execute format($f$create policy %I_select on public.%I for select using (
      owner_id = auth.uid()
      or exists (
        select 1 from public.connections c
        where c.owner_user_id = public.%I.owner_id
          and c.connected_user_id = auth.uid()
          and c.status = 'accepted'
      )
    );$f$, t, t, t);
    execute format('drop policy if exists %I_insert on public.%I;', t, t);
    execute format('create policy %I_insert on public.%I for insert with check (owner_id = auth.uid());', t, t);
    execute format('drop policy if exists %I_update on public.%I;', t, t);
    execute format('create policy %I_update on public.%I for update using (owner_id = auth.uid());', t, t);
    execute format('drop policy if exists %I_delete on public.%I;', t, t);
    execute format('create policy %I_delete on public.%I for delete using (owner_id = auth.uid());', t, t);
  end loop;
end $$;

-- HINWEIS Dokumente-Dateien: zusätzlich einen Storage-Bucket anlegen
--   (Supabase → Storage → New bucket, z. B. "dog-documents", privat) und dafür
--   Storage-Policies setzen. Das ist NICHT Teil dieses SQL (separater Schritt),
--   damit hier nur Tabellen entstehen.
