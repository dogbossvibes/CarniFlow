-- ============================================================================
-- CONNECT_SETUP.sql — ANYVO CONNECT (Community-Bereich)
--
-- ADDITIV. Löscht/verändert KEINE bestehenden Tabellen. Alle Tabellen mit RLS.
-- NICHT automatisch gegen Produktion ausführen — erst im Staging prüfen.
--
-- Sicherheits-Design:
--   • RLS-Policies referenzieren NIE dieselbe Tabelle direkt (keine Rekursion).
--     Sichtbarkeits-Checks (Freundschaft, Block, Conversation-Mitglied,
--     Event-Teilnehmer) laufen über SECURITY-DEFINER-Helferfunktionen, die als
--     Eigentümer laufen und dadurch die RLS der gelesenen Tabelle umgehen →
--     bricht jede potenzielle Rekursion.
--   • Exakte Event-Treffpunkte liegen in einer SEPARATEN Tabelle
--     (connect_event_locations) mit eigener RLS — Spaltenschutz ist in Postgres
--     nicht per-Spalte via RLS möglich, deshalb Auslagerung (sicherer als ein
--     jsonb-Feld). Nur Ersteller + bestätigte Teilnehmer sehen den Ort.
--   • Blockierungen (connect_blocks) wirken bidirektional in Sichtbarkeit.
--   • Kein Service-Role-Key im Client. Moderation (Reports) nur serverseitig.
--
-- Reihenfolge: Tabellen → Helferfunktionen → Policies → Indizes → Storage → Trigger.
-- Idempotent (if not exists / drop policy if exists / create or replace).
-- ============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ────────────────────────────────────────────────────────────────────────────
-- 1. TABELLEN
-- ────────────────────────────────────────────────────────────────────────────

-- 1.1 CONNECT-Profil (Community-Einstellungen eines bestehenden ANYVO-Nutzers)
create table if not exists public.connect_profiles (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid unique not null references auth.users(id) on delete cascade,
  display_name          text,
  username              text unique,
  bio                   text,
  avatar_path           text,
  visibility            text not null default 'friends' check (visibility in ('public','friends','private')),
  discoverable          boolean not null default true,
  allow_friend_requests boolean not null default true,
  allow_messages_from   text not null default 'friends' check (allow_messages_from in ('everyone','friends','none')),
  region_label          text,                 -- z. B. "Zürich" — NIE exakte Koordinaten
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- 1.2 CONNECT-Einstellungen pro bestehendem Hund (dogs bleibt die Datenquelle)
create table if not exists public.connect_dog_profiles (
  id                             uuid primary key default gen_random_uuid(),
  dog_id                         uuid unique not null references public.dogs(id) on delete cascade,
  owner_user_id                  uuid not null references auth.users(id) on delete cascade,
  is_visible                     boolean not null default true,
  bio                            text,
  activity_tags                  text[] not null default '{}',
  experience_level               text check (experience_level in ('beginner','intermediate','advanced','pro')),
  allow_training_partner_requests boolean not null default true,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now()
);

-- 1.3 Freundschaften (ein Datensatz pro Paar, normalisiert)
create table if not exists public.connect_friendships (
  id                 uuid primary key default gen_random_uuid(),
  requester_user_id  uuid not null references auth.users(id) on delete cascade,
  addressee_user_id  uuid not null references auth.users(id) on delete cascade,
  status             text not null default 'pending' check (status in ('pending','accepted','declined','blocked')),
  created_at         timestamptz not null default now(),
  responded_at       timestamptz,
  check (requester_user_id <> addressee_user_id)
);
-- Genau EIN Datensatz je Nutzerpaar, richtungsunabhängig (keine Duplikate/Gegenstücke)
create unique index if not exists connect_friendships_pair_uidx
  on public.connect_friendships (
    least(requester_user_id, addressee_user_id),
    greatest(requester_user_id, addressee_user_id)
  );

-- 1.4 Beiträge
create table if not exists public.connect_posts (
  id                 uuid primary key default gen_random_uuid(),
  author_user_id     uuid not null references auth.users(id) on delete cascade,
  author_dog_id      uuid references public.dogs(id) on delete set null,
  post_type          text not null default 'text' check (post_type in ('text','image','video','training','achievement','event')),
  visibility         text not null default 'friends' check (visibility in ('private','friends','group','public')),
  text_content       text,
  shared_training_id uuid,                 -- lose Referenz auf training_sessions (kein harter FK → entkoppelt)
  shared_event_id    uuid references public.connect_training_events(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

-- 1.5 Medien zu Beiträgen
create table if not exists public.connect_post_media (
  id               uuid primary key default gen_random_uuid(),
  post_id          uuid not null references public.connect_posts(id) on delete cascade,
  storage_path     text not null,
  media_type       text not null check (media_type in ('image','video')),
  sort_order       integer not null default 0,
  width            integer,
  height           integer,
  duration_seconds numeric,
  created_at       timestamptz not null default now()
);

-- 1.6 Reaktionen (MVP: like/paw), genau eine je Nutzer/Beitrag
create table if not exists public.connect_post_reactions (
  post_id       uuid not null references public.connect_posts(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  reaction_type text not null default 'paw' check (reaction_type in ('like','paw')),
  created_at    timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- 1.7 Kommentare (Soft-Delete)
create table if not exists public.connect_post_comments (
  id             uuid primary key default gen_random_uuid(),
  post_id        uuid not null references public.connect_posts(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  author_dog_id  uuid references public.dogs(id) on delete set null,
  text_content   text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- 1.8 Conversations (MVP: direct)
create table if not exists public.connect_conversations (
  id                uuid primary key default gen_random_uuid(),
  conversation_type text not null default 'direct' check (conversation_type in ('direct','group')),
  created_by        uuid references auth.users(id) on delete set null,
  title             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 1.9 Conversation-Mitglieder
create table if not exists public.connect_conversation_members (
  conversation_id uuid not null references public.connect_conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz,
  is_muted        boolean not null default false,
  left_at         timestamptz,
  primary key (conversation_id, user_id)
);

-- 1.10 Nachrichten (Soft-Delete)
create table if not exists public.connect_messages (
  id                 uuid primary key default gen_random_uuid(),
  conversation_id    uuid not null references public.connect_conversations(id) on delete cascade,
  sender_user_id     uuid not null references auth.users(id) on delete cascade,
  sender_dog_id      uuid references public.dogs(id) on delete set null,
  message_type       text not null default 'text' check (message_type in ('text','image','training','event')),
  text_content       text,
  media_path         text,
  shared_training_id uuid,                 -- lose Referenz (kein harter FK)
  shared_event_id    uuid references public.connect_training_events(id) on delete set null,
  created_at         timestamptz not null default now(),
  edited_at          timestamptz,
  deleted_at         timestamptz
);

-- 1.11 Gemeinsame Trainings (Events) — NUR sichere/öffentliche Felder.
--      Exakter Treffpunkt liegt in connect_event_locations (separate RLS).
create table if not exists public.connect_training_events (
  id               uuid primary key default gen_random_uuid(),
  creator_user_id  uuid not null references auth.users(id) on delete cascade,
  creator_dog_id   uuid references public.dogs(id) on delete set null,
  title            text not null,
  description      text,
  discipline       text,
  experience_level text check (experience_level in ('beginner','intermediate','advanced','pro')),
  starts_at        timestamptz,
  ends_at          timestamptz,
  region_label     text,                   -- ungefähre Region (öffentlich)
  approximate_lat  numeric,                -- bewusst gerundet/anonymisiert (öffentlich)
  approximate_lng  numeric,
  max_participants integer,
  visibility       text not null default 'friends' check (visibility in ('private','friends','group','public')),
  status           text not null default 'open' check (status in ('open','full','cancelled','done')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 1.12 Exakter Treffpunkt — nur Ersteller + bestätigte Teilnehmer (RLS unten)
create table if not exists public.connect_event_locations (
  event_id      uuid primary key references public.connect_training_events(id) on delete cascade,
  exact_lat     numeric,
  exact_lng     numeric,
  meeting_point text,                      -- Adresse / Beschreibung
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 1.13 Event-Teilnehmer
create table if not exists public.connect_event_participants (
  event_id     uuid not null references public.connect_training_events(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  dog_id       uuid references public.dogs(id) on delete set null,
  status       text not null default 'requested' check (status in ('requested','accepted','declined','cancelled')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  primary key (event_id, user_id)
);

-- 1.14 Blockierungen (gerichtet; Sichtbarkeit wirkt bidirektional)
create table if not exists public.connect_blocks (
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);

-- 1.15 Meldungen
create table if not exists public.connect_reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_user_id  uuid not null references auth.users(id) on delete cascade,
  target_type       text not null check (target_type in ('post','comment','message','profile','dog_profile','event','user')),
  target_id         uuid not null,
  reason            text not null check (reason in ('spam','harassment','inappropriate','animal_welfare','misinformation','privacy','other')),
  details           text,
  status            text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at        timestamptz not null default now(),
  reviewed_at       timestamptz
);

-- 1.16 Datenschutz-Einstellungen
create table if not exists public.connect_privacy_settings (
  user_id                   uuid primary key references auth.users(id) on delete cascade,
  profile_visibility        text not null default 'friends' check (profile_visibility in ('public','friends','private')),
  training_visibility_default text not null default 'friends' check (training_visibility_default in ('private','friends','public')),
  show_region               boolean not null default true,
  allow_message_requests    boolean not null default true,
  allow_training_requests   boolean not null default true,
  show_online_status        boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. HELFERFUNKTIONEN (SECURITY DEFINER, umgehen RLS → keine Rekursion)
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.connect_dog_owner(p_dog_id uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select owner_id from public.dogs where id = p_dog_id;
$$;

create or replace function public.connect_is_blocked(p_a uuid, p_b uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.connect_blocks
    where (blocker_user_id = p_a and blocked_user_id = p_b)
       or (blocker_user_id = p_b and blocked_user_id = p_a)
  );
$$;

create or replace function public.connect_are_friends(p_a uuid, p_b uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.connect_friendships
    where status = 'accepted'
      and ((requester_user_id = p_a and addressee_user_id = p_b)
        or (requester_user_id = p_b and addressee_user_id = p_a))
  );
$$;

create or replace function public.connect_is_conv_member(p_conv uuid, p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.connect_conversation_members
    where conversation_id = p_conv and user_id = p_user and left_at is null
  );
$$;

create or replace function public.connect_event_creator(p_event uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select creator_user_id from public.connect_training_events where id = p_event;
$$;

create or replace function public.connect_is_event_participant(p_event uuid, p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.connect_event_participants
    where event_id = p_event and user_id = p_user and status = 'accepted'
  );
$$;

-- Kapselt die Beitrags-Sichtbarkeit (für media/reactions/comments, um Rekursion
-- auf connect_posts in deren Policies zu vermeiden).
create or replace function public.connect_can_see_post(p_post uuid, p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.connect_posts p
    where p.id = p_post
      and p.deleted_at is null
      and (
        p.author_user_id = p_user
        or (
          not public.connect_is_blocked(p_user, p.author_user_id)
          and (
            p.visibility = 'public'
            or (p.visibility = 'friends' and public.connect_are_friends(p_user, p.author_user_id))
          )
        )
      )
  );
$$;

revoke execute on function
  public.connect_dog_owner(uuid), public.connect_is_blocked(uuid,uuid),
  public.connect_are_friends(uuid,uuid), public.connect_is_conv_member(uuid,uuid),
  public.connect_event_creator(uuid), public.connect_is_event_participant(uuid,uuid),
  public.connect_can_see_post(uuid,uuid)
from public;
grant execute on function
  public.connect_dog_owner(uuid), public.connect_is_blocked(uuid,uuid),
  public.connect_are_friends(uuid,uuid), public.connect_is_conv_member(uuid,uuid),
  public.connect_event_creator(uuid), public.connect_is_event_participant(uuid,uuid),
  public.connect_can_see_post(uuid,uuid)
to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. RLS AKTIVIEREN + POLICIES
-- ────────────────────────────────────────────────────────────────────────────

alter table public.connect_profiles              enable row level security;
alter table public.connect_dog_profiles           enable row level security;
alter table public.connect_friendships            enable row level security;
alter table public.connect_posts                  enable row level security;
alter table public.connect_post_media             enable row level security;
alter table public.connect_post_reactions          enable row level security;
alter table public.connect_post_comments           enable row level security;
alter table public.connect_conversations           enable row level security;
alter table public.connect_conversation_members    enable row level security;
alter table public.connect_messages               enable row level security;
alter table public.connect_training_events         enable row level security;
alter table public.connect_event_locations         enable row level security;
alter table public.connect_event_participants       enable row level security;
alter table public.connect_blocks                  enable row level security;
alter table public.connect_reports                 enable row level security;
alter table public.connect_privacy_settings        enable row level security;

-- 3.1 connect_profiles
drop policy if exists "cp_select" on public.connect_profiles;
create policy "cp_select" on public.connect_profiles for select to authenticated using (
  user_id = auth.uid()
  or ( not public.connect_is_blocked(auth.uid(), user_id)
       and ( visibility = 'public'
             or (visibility = 'friends' and public.connect_are_friends(auth.uid(), user_id)) ) )
);
drop policy if exists "cp_write" on public.connect_profiles;
create policy "cp_write" on public.connect_profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 3.2 connect_dog_profiles
drop policy if exists "cdp_select" on public.connect_dog_profiles;
create policy "cdp_select" on public.connect_dog_profiles for select to authenticated using (
  owner_user_id = auth.uid()
  or ( is_visible = true and not public.connect_is_blocked(auth.uid(), owner_user_id) )
);
drop policy if exists "cdp_write" on public.connect_dog_profiles;
create policy "cdp_write" on public.connect_dog_profiles for all to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid() and public.connect_dog_owner(dog_id) = auth.uid());

-- 3.3 connect_friendships (nur eigene Zeilen sichtbar/verwaltbar)
drop policy if exists "cf_select" on public.connect_friendships;
create policy "cf_select" on public.connect_friendships for select to authenticated
  using (requester_user_id = auth.uid() or addressee_user_id = auth.uid());
drop policy if exists "cf_insert" on public.connect_friendships;
create policy "cf_insert" on public.connect_friendships for insert to authenticated
  with check (requester_user_id = auth.uid()
              and not public.connect_is_blocked(auth.uid(), addressee_user_id));
drop policy if exists "cf_update" on public.connect_friendships;
create policy "cf_update" on public.connect_friendships for update to authenticated
  using (requester_user_id = auth.uid() or addressee_user_id = auth.uid())
  with check (requester_user_id = auth.uid() or addressee_user_id = auth.uid());
drop policy if exists "cf_delete" on public.connect_friendships;
create policy "cf_delete" on public.connect_friendships for delete to authenticated
  using (requester_user_id = auth.uid() or addressee_user_id = auth.uid());

-- 3.4 connect_posts
drop policy if exists "cpost_select" on public.connect_posts;
create policy "cpost_select" on public.connect_posts for select to authenticated using (
  ( author_user_id = auth.uid() )
  or ( deleted_at is null
       and not public.connect_is_blocked(auth.uid(), author_user_id)
       and ( visibility = 'public'
             or (visibility = 'friends' and public.connect_are_friends(auth.uid(), author_user_id)) ) )
);
drop policy if exists "cpost_insert" on public.connect_posts;
create policy "cpost_insert" on public.connect_posts for insert to authenticated
  with check (author_user_id = auth.uid()
              and (author_dog_id is null or public.connect_dog_owner(author_dog_id) = auth.uid()));
drop policy if exists "cpost_update" on public.connect_posts;
create policy "cpost_update" on public.connect_posts for update to authenticated
  using (author_user_id = auth.uid()) with check (author_user_id = auth.uid());
drop policy if exists "cpost_delete" on public.connect_posts;
create policy "cpost_delete" on public.connect_posts for delete to authenticated
  using (author_user_id = auth.uid());

-- 3.5 connect_post_media (Sichtbarkeit = Sichtbarkeit des Beitrags)
drop policy if exists "cpm_select" on public.connect_post_media;
create policy "cpm_select" on public.connect_post_media for select to authenticated
  using (public.connect_can_see_post(post_id, auth.uid()));
drop policy if exists "cpm_write" on public.connect_post_media;
create policy "cpm_write" on public.connect_post_media for all to authenticated
  using (exists (select 1 from public.connect_posts p where p.id = post_id and p.author_user_id = auth.uid()))
  with check (exists (select 1 from public.connect_posts p where p.id = post_id and p.author_user_id = auth.uid()));

-- 3.6 connect_post_reactions
drop policy if exists "cpr_select" on public.connect_post_reactions;
create policy "cpr_select" on public.connect_post_reactions for select to authenticated
  using (public.connect_can_see_post(post_id, auth.uid()));
drop policy if exists "cpr_write" on public.connect_post_reactions;
create policy "cpr_write" on public.connect_post_reactions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.connect_can_see_post(post_id, auth.uid()));

-- 3.7 connect_post_comments
drop policy if exists "cpc_select" on public.connect_post_comments;
create policy "cpc_select" on public.connect_post_comments for select to authenticated
  using (deleted_at is null and public.connect_can_see_post(post_id, auth.uid()));
drop policy if exists "cpc_insert" on public.connect_post_comments;
create policy "cpc_insert" on public.connect_post_comments for insert to authenticated
  with check (author_user_id = auth.uid()
              and public.connect_can_see_post(post_id, auth.uid())
              and (author_dog_id is null or public.connect_dog_owner(author_dog_id) = auth.uid()));
drop policy if exists "cpc_update" on public.connect_post_comments;
create policy "cpc_update" on public.connect_post_comments for update to authenticated
  using (author_user_id = auth.uid()) with check (author_user_id = auth.uid());

-- 3.8 connect_conversations (nur Mitglieder)
drop policy if exists "cc_select" on public.connect_conversations;
create policy "cc_select" on public.connect_conversations for select to authenticated
  using (public.connect_is_conv_member(id, auth.uid()));
drop policy if exists "cc_insert" on public.connect_conversations;
create policy "cc_insert" on public.connect_conversations for insert to authenticated
  with check (created_by = auth.uid());
-- (Kein Update/Delete für MVP-Direct-Conversations.)

-- 3.9 connect_conversation_members
drop policy if exists "ccm_select" on public.connect_conversation_members;
create policy "ccm_select" on public.connect_conversation_members for select to authenticated
  using (user_id = auth.uid() or public.connect_is_conv_member(conversation_id, auth.uid()));
-- Beitritt: sich selbst hinzufügen; oder der Ersteller fügt Mitglieder hinzu.
drop policy if exists "ccm_insert" on public.connect_conversation_members;
create policy "ccm_insert" on public.connect_conversation_members for insert to authenticated
  with check (
    user_id = auth.uid()
    or exists (select 1 from public.connect_conversations c
               where c.id = conversation_id and c.created_by = auth.uid())
  );
-- last_read_at/is_muted/left_at nur für die eigene Mitgliedschaft.
drop policy if exists "ccm_update" on public.connect_conversation_members;
create policy "ccm_update" on public.connect_conversation_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 3.10 connect_messages (nur Mitglieder lesen; nur Absender schreibt)
drop policy if exists "cm_select" on public.connect_messages;
create policy "cm_select" on public.connect_messages for select to authenticated
  using (public.connect_is_conv_member(conversation_id, auth.uid()));
drop policy if exists "cm_insert" on public.connect_messages;
create policy "cm_insert" on public.connect_messages for insert to authenticated
  with check (sender_user_id = auth.uid()
              and public.connect_is_conv_member(conversation_id, auth.uid()));
drop policy if exists "cm_update" on public.connect_messages;   -- Bearbeiten/Soft-Delete durch Absender
create policy "cm_update" on public.connect_messages for update to authenticated
  using (sender_user_id = auth.uid()) with check (sender_user_id = auth.uid());

-- 3.11 connect_training_events
drop policy if exists "cte_select" on public.connect_training_events;
create policy "cte_select" on public.connect_training_events for select to authenticated using (
  creator_user_id = auth.uid()
  or ( not public.connect_is_blocked(auth.uid(), creator_user_id)
       and ( visibility = 'public'
             or (visibility = 'friends' and public.connect_are_friends(auth.uid(), creator_user_id)) ) )
);
drop policy if exists "cte_write" on public.connect_training_events;
create policy "cte_write" on public.connect_training_events for all to authenticated
  using (creator_user_id = auth.uid())
  with check (creator_user_id = auth.uid()
              and (creator_dog_id is null or public.connect_dog_owner(creator_dog_id) = auth.uid()));

-- 3.12 connect_event_locations (exakter Ort: nur Ersteller + bestätigte Teilnehmer)
drop policy if exists "cel_select" on public.connect_event_locations;
create policy "cel_select" on public.connect_event_locations for select to authenticated using (
  public.connect_event_creator(event_id) = auth.uid()
  or public.connect_is_event_participant(event_id, auth.uid())
);
drop policy if exists "cel_write" on public.connect_event_locations;
create policy "cel_write" on public.connect_event_locations for all to authenticated
  using (public.connect_event_creator(event_id) = auth.uid())
  with check (public.connect_event_creator(event_id) = auth.uid());

-- 3.13 connect_event_participants (Ersteller sieht alle; Teilnehmer sieht sich)
drop policy if exists "cep_select" on public.connect_event_participants;
create policy "cep_select" on public.connect_event_participants for select to authenticated
  using (user_id = auth.uid() or public.connect_event_creator(event_id) = auth.uid());
drop policy if exists "cep_insert" on public.connect_event_participants;   -- Teilnahme anfragen
create policy "cep_insert" on public.connect_event_participants for insert to authenticated
  with check (user_id = auth.uid()
              and not public.connect_is_blocked(auth.uid(), public.connect_event_creator(event_id)));
drop policy if exists "cep_update" on public.connect_event_participants;   -- eigener Status ODER Ersteller bestätigt
create policy "cep_update" on public.connect_event_participants for update to authenticated
  using (user_id = auth.uid() or public.connect_event_creator(event_id) = auth.uid())
  with check (user_id = auth.uid() or public.connect_event_creator(event_id) = auth.uid());

-- 3.14 connect_blocks (nur der Blockierende)
drop policy if exists "cb_select" on public.connect_blocks;
create policy "cb_select" on public.connect_blocks for select to authenticated
  using (blocker_user_id = auth.uid());
drop policy if exists "cb_insert" on public.connect_blocks;
create policy "cb_insert" on public.connect_blocks for insert to authenticated
  with check (blocker_user_id = auth.uid());
drop policy if exists "cb_delete" on public.connect_blocks;
create policy "cb_delete" on public.connect_blocks for delete to authenticated
  using (blocker_user_id = auth.uid());

-- 3.15 connect_reports (Reporter sieht nur eigene; Moderation via service_role)
drop policy if exists "crep_select" on public.connect_reports;
create policy "crep_select" on public.connect_reports for select to authenticated
  using (reporter_user_id = auth.uid());
drop policy if exists "crep_insert" on public.connect_reports;
create policy "crep_insert" on public.connect_reports for insert to authenticated
  with check (reporter_user_id = auth.uid());

-- 3.16 connect_privacy_settings (nur eigene)
drop policy if exists "cps_all" on public.connect_privacy_settings;
create policy "cps_all" on public.connect_privacy_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────────────────────
-- 4. INDIZES
-- ────────────────────────────────────────────────────────────────────────────
create index if not exists connect_posts_created_idx      on public.connect_posts (created_at desc, id);
create index if not exists connect_posts_author_idx       on public.connect_posts (author_user_id);
create index if not exists connect_posts_vis_created_idx  on public.connect_posts (visibility, created_at desc);
create index if not exists connect_friendships_addr_idx   on public.connect_friendships (addressee_user_id, status);
create index if not exists connect_friendships_req_idx    on public.connect_friendships (requester_user_id, status);
create index if not exists connect_conv_members_user_idx  on public.connect_conversation_members (user_id);
create index if not exists connect_conv_members_conv_idx  on public.connect_conversation_members (conversation_id);
create index if not exists connect_messages_conv_idx      on public.connect_messages (conversation_id, created_at desc);
create index if not exists connect_events_starts_idx      on public.connect_training_events (starts_at);
create index if not exists connect_events_region_idx      on public.connect_training_events (region_label);
create index if not exists connect_events_creator_idx     on public.connect_training_events (creator_user_id);
create index if not exists connect_event_parts_event_idx  on public.connect_event_participants (event_id);
create index if not exists connect_event_parts_user_idx   on public.connect_event_participants (user_id);
create index if not exists connect_reports_status_idx     on public.connect_reports (status);
create index if not exists connect_blocks_blocker_idx     on public.connect_blocks (blocker_user_id);
create index if not exists connect_blocks_blocked_idx     on public.connect_blocks (blocked_user_id);
create index if not exists connect_comments_post_idx      on public.connect_post_comments (post_id, created_at);
create index if not exists connect_post_media_post_idx    on public.connect_post_media (post_id, sort_order);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. STORAGE (private Buckets; Upload nur in den eigenen Nutzerpfad)
--    Pfad-Konvention: <user_id>/<random>.<ext>
-- ────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
  values ('connect-post-media', 'connect-post-media', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
  values ('connect-message-media', 'connect-message-media', false)
  on conflict (id) do nothing;

drop policy if exists "connect_post_media_upload" on storage.objects;
create policy "connect_post_media_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'connect-post-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "connect_post_media_modify" on storage.objects;
create policy "connect_post_media_modify" on storage.objects for update to authenticated
  using (bucket_id = 'connect-post-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "connect_post_media_delete" on storage.objects;
create policy "connect_post_media_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'connect-post-media' and (storage.foldername(name))[1] = auth.uid()::text);
-- Lesen: privat; Client greift über zeitlich begrenzte Signed URLs zu (kein public read).
drop policy if exists "connect_post_media_owner_read" on storage.objects;
create policy "connect_post_media_owner_read" on storage.objects for select to authenticated
  using (bucket_id = 'connect-post-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "connect_msg_media_upload" on storage.objects;
create policy "connect_msg_media_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'connect-message-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "connect_msg_media_modify" on storage.objects;
create policy "connect_msg_media_modify" on storage.objects for update to authenticated
  using (bucket_id = 'connect-message-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "connect_msg_media_delete" on storage.objects;
create policy "connect_msg_media_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'connect-message-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "connect_msg_media_owner_read" on storage.objects;
create policy "connect_msg_media_owner_read" on storage.objects for select to authenticated
  using (bucket_id = 'connect-message-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ────────────────────────────────────────────────────────────────────────────
-- 6. updated_at-Trigger
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.connect_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end; $$;

do $$
declare t text;
begin
  foreach t in array array[
    'connect_profiles','connect_dog_profiles','connect_posts','connect_post_comments',
    'connect_conversations','connect_training_events','connect_event_locations','connect_privacy_settings'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t||'_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.connect_touch_updated_at()', t||'_touch', t);
  end loop;
end $$;

-- ============================================================================
-- ROLLBACK (manuell, nur Staging):
--   drop table if exists public.connect_privacy_settings, public.connect_reports,
--     public.connect_blocks, public.connect_event_participants,
--     public.connect_event_locations, public.connect_training_events,
--     public.connect_messages, public.connect_conversation_members,
--     public.connect_conversations, public.connect_post_comments,
--     public.connect_post_reactions, public.connect_post_media,
--     public.connect_posts, public.connect_friendships,
--     public.connect_dog_profiles, public.connect_profiles cascade;
--   drop function if exists public.connect_dog_owner(uuid), public.connect_is_blocked(uuid,uuid),
--     public.connect_are_friends(uuid,uuid), public.connect_is_conv_member(uuid,uuid),
--     public.connect_event_creator(uuid), public.connect_is_event_participant(uuid,uuid),
--     public.connect_can_see_post(uuid,uuid), public.connect_touch_updated_at();
--   -- Storage-Buckets/Objekte separat entfernen.
-- ============================================================================
