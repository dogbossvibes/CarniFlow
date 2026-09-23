-- ============================================================================
-- ANYVO LOCAL / CI TEST ONLY
-- DO NOT APPLY TO PRODUCTION
--
-- Reconstructed from the repository's historical production schema snapshot
-- (aa40c4e053b1be86f7c9c9b5a7af249e50715676) and the repository storage setup.
-- This file is intentionally outside supabase/migrations/.
-- It contains the pre-Health-Foundation contract only.
-- ============================================================================

set search_path = public, extensions;

-- Supabase provides auth.users. No auth.users table is created here.

create type public.tester_level as enum ('developer', 'qa', 'trainer', 'admin');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  plan text default 'free',
  plan_expires_at timestamptz,
  trial_used boolean default false,
  created_at timestamptz default now(),
  role text default 'user' not null,
  share_trainings_default boolean default false not null,
  push_token text,
  is_trainer boolean default false,
  trainer_since timestamptz,
  trainer_name text,
  aktive_sparten text[] default array['IGP','Unterordnung','Schutzdienst','Fährte','Obedience','Agility','Begleithund'],
  locale text,
  is_internal_tester boolean default false not null,
  tester_level public.tester_level,
  constraint profiles_locale_check check (locale in ('de-CH', 'de-DE', 'gsw-CH')),
  constraint profiles_plan_check check (plan in ('free', 'premium')),
  constraint profiles_role_check check (role in ('user', 'trainer', 'admin'))
);

create table public.dogs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text not null,
  breed text,
  age integer,
  owner_id uuid,
  photo_url text,
  gender text,
  birth_date date,
  weight_kg numeric,
  titles text[] default '{}' not null,
  sire text,
  dam text,
  kennel text,
  is_favorite boolean default false not null,
  color text,
  discipline text,
  level text,
  best_score text,
  microchip_number text,
  tasso_registered boolean default false not null,
  vet text,
  vaccination text,
  food text,
  constraint dogs_owner_id_fkey foreign key (owner_id) references auth.users(id)
);

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  connected_user_id uuid not null references auth.users(id) on delete cascade,
  status text default 'pending' not null,
  created_by text default 'owner' not null,
  connection_type text default 'trainer_client' not null,
  connection_name text,
  constraint connections_created_by_check check (created_by in ('owner', 'connected')),
  constraint connections_status_check check (status in ('pending', 'accepted', 'declined', 'blocked')),
  unique (owner_user_id, connected_user_id, connection_type)
);

create table public.connection_permissions (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null unique references public.connections(id) on delete cascade,
  view_trainings boolean default true not null,
  view_statistics boolean default true not null,
  view_videos boolean default true not null,
  view_dogs boolean default true not null,
  view_appointments boolean default true not null,
  view_health boolean default false not null,
  view_private_notes boolean default false not null
);

create table public.user_capabilities (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pro_member boolean default false not null,
  trainer_module boolean default false not null,
  updated_at timestamptz default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  tier text,
  product_id text,
  status text default 'active' not null,
  store text default 'app_store',
  expires_at timestamptz,
  updated_at timestamptz default now(),
  created_at timestamptz default now(),
  plan text,
  started_at timestamptz default now(),
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  provider text,
  provider_product_id text,
  provider_subscription_id text,
  cancel_at_period_end boolean default false not null,
  constraint subscriptions_plan_check check (plan is null or plan in ('beginner_trial', 'founder_active', 'active', 'trainer')),
  constraint subscriptions_status_check check (status in ('trialing', 'active', 'expired', 'cancelled', 'past_due'))
);

create table public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  dog_id uuid not null references public.dogs(id) on delete cascade,
  title text,
  category text not null,
  training_type text default 'privat' not null,
  trainer_name text,
  session_date date not null,
  duration_minutes integer,
  rating integer,
  notes text,
  created_at timestamptz default now() not null,
  motivation smallint,
  konzentration smallint,
  praezision smallint,
  ausdauer smallint,
  trieblage smallint,
  impulskontrolle smallint,
  belastung smallint,
  ort text,
  wetter text,
  audio_urls text[] default '{}',
  video_url text,
  photo_urls text[] default '{}',
  score integer,
  type text default 'privat',
  status text default 'completed',
  track_data jsonb,
  surface_types text[],
  terrain_conditions text[],
  laying_duration_seconds integer,
  search_duration_seconds integer,
  lying_time_minutes integer,
  distance_meters numeric(9,1),
  average_deviation_meters numeric(6,2),
  gps_quality_average numeric(6,2),
  articles_total integer,
  articles_found integer,
  corners_total integer,
  distractions_total integer,
  location_name text,
  latitude double precision,
  longitude double precision,
  temperature numeric(5,1),
  weather_condition text,
  wind_speed numeric(5,1),
  humidity integer,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  constraint training_sessions_ausdauer_check check (ausdauer between 1 and 5),
  constraint training_sessions_belastung_check check (belastung between 1 and 5),
  constraint training_sessions_impulskontrolle_check check (impulskontrolle between 1 and 5),
  constraint training_sessions_konzentration_check check (konzentration between 1 and 5),
  constraint training_sessions_motivation_check check (motivation between 1 and 5),
  constraint training_sessions_praezision_check check (praezision between 1 and 5),
  constraint training_sessions_rating_check check (rating between 1 and 5),
  constraint training_sessions_trieblage_check check (trieblage between 1 and 5)
);

create table public.training_units (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  dog_id uuid not null references public.dogs(id) on delete cascade,
  session_date date default current_date not null,
  started_at timestamptz,
  ended_at timestamptz,
  duration_sec integer,
  rating smallint,
  notes text,
  status text default 'active' not null,
  created_at timestamptz default now() not null,
  score smallint,
  photos text[] default '{}' not null,
  videos text[] default '{}' not null,
  audio_files jsonb default '[]' not null,
  motivation smallint,
  konzentration smallint,
  praezision smallint,
  ausdauer smallint,
  trieblage smallint,
  impulskontrolle smallint,
  shared_with_trainer boolean default false not null,
  constraint training_units_ausdauer_check check (ausdauer between 1 and 5),
  constraint training_units_impulskontrolle_check check (impulskontrolle between 1 and 5),
  constraint training_units_konzentration_check check (konzentration between 1 and 5),
  constraint training_units_motivation_check check (motivation between 1 and 5),
  constraint training_units_praezision_check check (praezision between 1 and 5),
  constraint training_units_rating_check check (rating between 1 and 5),
  constraint training_units_score_check check (score between 1 and 10),
  constraint training_units_status_check check (status in ('active', 'completed')),
  constraint training_units_trieblage_check check (trieblage between 1 and 5)
);

-- Legacy target intentionally retained so the 20260803120000 migration can
-- reproduce the production FK correction to training_sessions.
create table public.trainings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  title text,
  training_date timestamp,
  type text,
  trainer_name text,
  notes text,
  created_at timestamp default now(),
  video_url text,
  audio_urls text[] default '{}'
);

create table public.shared_trainings (
  id uuid primary key default gen_random_uuid(),
  training_id uuid,
  owner_id uuid,
  token text default encode(extensions.gen_random_bytes(16), 'hex') not null,
  expires_at timestamptz default (now() + interval '30 days') not null,
  include_notes boolean default true,
  include_video boolean default true,
  include_audio boolean default true,
  include_score boolean default true,
  view_count integer default 0,
  created_at timestamptz default now(),
  constraint shared_trainings_training_id_fkey foreign key (training_id) references public.trainings(id) on delete cascade,
  constraint shared_trainings_owner_id_fkey foreign key (owner_id) references auth.users(id) on delete cascade
);

create table public.dog_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  dog_id uuid not null references public.dogs(id) on delete cascade,
  kind text not null,
  title text,
  file_url text,
  issued_on date,
  note text,
  created_at timestamptz default now() not null,
  constraint dog_documents_kind_check check (kind in ('impfpass', 'stammbaum', 'hd_ed', 'pruefung', 'sonstiges'))
);

create table public.dog_health_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  dog_id uuid not null references public.dogs(id) on delete cascade,
  entry_date date default current_date not null,
  weight_kg numeric(5,2),
  load_level text,
  is_rest_day boolean default false not null,
  is_intense boolean default false not null,
  note text,
  created_at timestamptz default now() not null,
  constraint dog_health_entries_load_level_check check (load_level in ('leicht', 'mittel', 'hoch'))
);

create table public.dog_vet_appointments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  dog_id uuid not null references public.dogs(id) on delete cascade,
  appointment_at timestamptz not null,
  reason text,
  created_at timestamptz default now() not null
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  dog_id uuid references public.dogs(id) on delete set null,
  trainer_id uuid references auth.users(id) on delete set null,
  type text default 'training' not null,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz,
  location text,
  discipline text,
  notes text,
  status text default 'confirmed' not null,
  reminder_minutes integer[] default '{}',
  repeat text default 'none' not null,
  created_at timestamptz default now(),
  types text[] default '{}' not null,
  dog_ids uuid[] default '{}' not null
);

create index calendar_events_owner_start_idx
  on public.calendar_events (owner_id, start_at);

create or replace function public.can_view(p_viewer uuid, p_owner uuid, p_perm text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.connections c
    join public.connection_permissions p on p.connection_id = c.id
    where c.owner_user_id = p_owner and c.connected_user_id = p_viewer
      and c.status = 'accepted'
      and case p_perm
        when 'view_trainings' then p.view_trainings
        when 'view_statistics' then p.view_statistics
        when 'view_videos' then p.view_videos
        when 'view_dogs' then p.view_dogs
        when 'view_appointments' then p.view_appointments
        when 'view_health' then p.view_health
        when 'view_private_notes' then p.view_private_notes
        else false
      end
  );
$$;

create index connections_owner_idx on public.connections(owner_user_id);
create index connections_connected_idx on public.connections(connected_user_id);
create index dog_documents_dog_kind_idx on public.dog_documents(dog_id, kind);
create index dog_health_dog_date_idx on public.dog_health_entries(dog_id, entry_date desc);
create index dog_vet_dog_at_idx on public.dog_vet_appointments(dog_id, appointment_at);
create index training_sessions_dog_date_idx on public.training_sessions(dog_id, session_date desc);
create index training_units_dog_idx on public.training_units(dog_id);

alter table public.dogs enable row level security;
alter table public.profiles enable row level security;
alter table public.connections enable row level security;
alter table public.connection_permissions enable row level security;
alter table public.user_capabilities enable row level security;
alter table public.subscriptions enable row level security;
alter table public.training_sessions enable row level security;
alter table public.training_units enable row level security;
alter table public.shared_trainings enable row level security;
alter table public.dog_documents enable row level security;
alter table public.dog_health_entries enable row level security;
alter table public.dog_vet_appointments enable row level security;
alter table public.calendar_events enable row level security;

create policy dogs_select on public.dogs for select to authenticated using (owner_id = auth.uid() or public.can_view(auth.uid(), owner_id, 'view_dogs'));
create policy dogs_insert on public.dogs for insert to authenticated with check (owner_id = auth.uid());
create policy dogs_update on public.dogs for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy dogs_delete on public.dogs for delete to authenticated using (owner_id = auth.uid());

create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or role = 'trainer');
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy connections_select on public.connections for select to authenticated using (owner_user_id = auth.uid() or connected_user_id = auth.uid());
create policy connections_insert on public.connections for insert to authenticated with check (owner_user_id = auth.uid() or connected_user_id = auth.uid());
create policy connections_update on public.connections for update to authenticated using (owner_user_id = auth.uid() or connected_user_id = auth.uid()) with check (owner_user_id = auth.uid() or connected_user_id = auth.uid());
create policy connections_delete on public.connections for delete to authenticated using (owner_user_id = auth.uid() or connected_user_id = auth.uid());
create policy connection_permissions_select on public.connection_permissions for select to authenticated using (exists (select 1 from public.connections c where c.id = connection_id and (c.owner_user_id = auth.uid() or c.connected_user_id = auth.uid())));
create policy connection_permissions_owner on public.connection_permissions to authenticated using (exists (select 1 from public.connections c where c.id = connection_id and c.owner_user_id = auth.uid())) with check (exists (select 1 from public.connections c where c.id = connection_id and c.owner_user_id = auth.uid()));

create policy capabilities_select on public.user_capabilities for select to authenticated using (user_id = auth.uid());
create policy capabilities_insert on public.user_capabilities for insert to authenticated with check (user_id = auth.uid());
create policy capabilities_update on public.user_capabilities for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy subscriptions_owner on public.subscriptions to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy training_sessions_select on public.training_sessions for select to authenticated using (owner_id = auth.uid());
create policy training_sessions_insert on public.training_sessions for insert to authenticated with check (owner_id = auth.uid());
create policy training_sessions_update on public.training_sessions for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy training_sessions_delete on public.training_sessions for delete to authenticated using (owner_id = auth.uid());
create policy training_units_owner on public.training_units using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy shared_trainings_owner on public.shared_trainings to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy shared_trainings_public on public.shared_trainings for select to anon using (expires_at > now());

create policy dog_documents_select on public.dog_documents for select using (owner_id = auth.uid() or exists (select 1 from public.connections c where c.owner_user_id = dog_documents.owner_id and c.connected_user_id = auth.uid() and c.status = 'accepted'));
create policy dog_documents_insert on public.dog_documents for insert with check (owner_id = auth.uid());
create policy dog_documents_update on public.dog_documents for update using (owner_id = auth.uid());
create policy dog_documents_delete on public.dog_documents for delete using (owner_id = auth.uid());
create policy dog_health_entries_select on public.dog_health_entries for select using (owner_id = auth.uid() or exists (select 1 from public.connections c where c.owner_user_id = dog_health_entries.owner_id and c.connected_user_id = auth.uid() and c.status = 'accepted'));
create policy dog_health_entries_insert on public.dog_health_entries for insert with check (owner_id = auth.uid());
create policy dog_health_entries_update on public.dog_health_entries for update using (owner_id = auth.uid());
create policy dog_health_entries_delete on public.dog_health_entries for delete using (owner_id = auth.uid());
create policy dog_vet_appointments_select on public.dog_vet_appointments for select using (owner_id = auth.uid() or exists (select 1 from public.connections c where c.owner_user_id = dog_vet_appointments.owner_id and c.connected_user_id = auth.uid() and c.status = 'accepted'));
create policy dog_vet_appointments_insert on public.dog_vet_appointments for insert with check (owner_id = auth.uid());
create policy dog_vet_appointments_update on public.dog_vet_appointments for update using (owner_id = auth.uid());
create policy dog_vet_appointments_delete on public.dog_vet_appointments for delete using (owner_id = auth.uid());

create policy calendar_events_select on public.calendar_events for select using (owner_id = auth.uid() or created_by = auth.uid() or trainer_id = auth.uid());
create policy calendar_events_insert on public.calendar_events for insert with check (created_by = auth.uid());
create policy calendar_events_update on public.calendar_events for update using (owner_id = auth.uid() or created_by = auth.uid() or trainer_id = auth.uid());
create policy calendar_events_delete on public.calendar_events for delete using (owner_id = auth.uid() or created_by = auth.uid());

-- Existing private dog-documents bucket and path contract: <owner>/<dog>/<file>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dog-documents', 'dog-documents', false, 10485760,
        array['application/pdf','image/jpeg','image/png','image/heic','image/webp'])
on conflict (id) do nothing;

create policy dog_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'dog-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy dog_docs_update on storage.objects for update to authenticated
  using (bucket_id = 'dog-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy dog_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'dog-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy dog_docs_read on storage.objects for select to authenticated
  using (bucket_id = 'dog-documents' and ((storage.foldername(name))[1] = auth.uid()::text or exists (select 1 from public.connections c where c.owner_user_id = (storage.foldername(name))[1]::uuid and c.connected_user_id = auth.uid() and c.status = 'accepted')));
