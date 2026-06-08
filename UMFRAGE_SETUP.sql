-- ANYVO — Trainer-Terminumfrage (Doodle-Style)
-- Im Supabase SQL-Editor ausführen.

create table if not exists trainer_umfragen (
  id uuid default gen_random_uuid() primary key,
  trainer_id uuid references auth.users(id),
  trainer_name text not null,
  training_arten text[] default '{}',
  notiz text,
  status text default 'offen' check (status in ('offen','abgeschlossen')),
  created_at timestamptz default now()
);

create table if not exists umfrage_termine (
  id uuid default gen_random_uuid() primary key,
  umfrage_id uuid references trainer_umfragen(id) on delete cascade,
  datum date not null,
  uhrzeit_von time not null,
  uhrzeit_bis time not null,
  ort text,
  created_at timestamptz default now()
);

create table if not exists umfrage_antworten (
  id uuid default gen_random_uuid() primary key,
  termin_id uuid references umfrage_termine(id) on delete cascade,
  umfrage_id uuid references trainer_umfragen(id) on delete cascade,
  user_id uuid references auth.users(id),
  antwort text check (antwort in ('ja','evtl','nein')),
  created_at timestamptz default now(),
  unique(termin_id, user_id)
);

create table if not exists umfrage_einladungen (
  id uuid default gen_random_uuid() primary key,
  umfrage_id uuid references trainer_umfragen(id) on delete cascade,
  user_id uuid references auth.users(id),
  gesehen boolean default false,
  created_at timestamptz default now()
);

alter table trainer_umfragen   enable row level security;
alter table umfrage_termine     enable row level security;
alter table umfrage_antworten   enable row level security;
alter table umfrage_einladungen enable row level security;

drop policy if exists "Trainer manage own umfragen" on trainer_umfragen;
create policy "Trainer manage own umfragen" on trainer_umfragen for all to authenticated
  using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

drop policy if exists "Invited users see umfragen" on trainer_umfragen;
create policy "Invited users see umfragen" on trainer_umfragen for select to authenticated
  using (id in (select umfrage_id from umfrage_einladungen where user_id = auth.uid()));

drop policy if exists "All manage termine" on umfrage_termine;
create policy "All manage termine" on umfrage_termine for all to authenticated
  using (true) with check (true);

drop policy if exists "Users manage own antworten" on umfrage_antworten;
create policy "Users manage own antworten" on umfrage_antworten for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "All see antworten" on umfrage_antworten;
create policy "All see antworten" on umfrage_antworten for select to authenticated
  using (true);

drop policy if exists "All see einladungen" on umfrage_einladungen;
create policy "All see einladungen" on umfrage_einladungen for all to authenticated
  using (true) with check (true);
