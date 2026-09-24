-- ANYVO: private, trainer-scoped sharing for completed track sessions.
-- This migration intentionally contains no changes to recording, detection,
-- analytics, replay, or marker persistence.

create table public.track_shares (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.training_sessions(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  trainer_user_id uuid not null references auth.users(id) on delete cascade,
  shared_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint track_shares_distinct_users check (owner_user_id <> trainer_user_id)
);

create unique index track_shares_active_unique
  on public.track_shares(track_id, trainer_user_id)
  where revoked_at is null;

create index track_shares_trainer_active_idx
  on public.track_shares(trainer_user_id, shared_at desc)
  where revoked_at is null;

create index track_shares_owner_track_idx
  on public.track_shares(owner_user_id, track_id);

create table public.track_feedback (
  id uuid primary key default gen_random_uuid(),
  track_share_id uuid not null references public.track_shares(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  reaction text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint track_feedback_body_not_blank check (length(btrim(body)) > 0),
  constraint track_feedback_reaction_check check (reaction is null or reaction in ('👍', '✅', '👀', '💡'))
);

create index track_feedback_share_created_idx
  on public.track_feedback(track_share_id, created_at asc);

-- Shared-track reads are intentionally limited to the exact session and to a
-- still-accepted trainer relationship. SECURITY DEFINER avoids recursive RLS
-- evaluation when this predicate is used by the related track tables.
create or replace function public.can_view_shared_track(p_track_id uuid, p_viewer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.track_shares sh
    join public.connections c
      on c.owner_user_id = sh.owner_user_id
     and c.connected_user_id = sh.trainer_user_id
     and c.connection_type = 'trainer_client'
     and c.status = 'accepted'
    where p_viewer_id = auth.uid()
      and sh.track_id = p_track_id
      and sh.trainer_user_id = p_viewer_id
      and sh.revoked_at is null
  );
$$;

revoke all on function public.can_view_shared_track(uuid, uuid) from public, anon;
grant execute on function public.can_view_shared_track(uuid, uuid) to authenticated;

-- Share and feedback identities cannot be reassigned through UPDATE.
create function public.protect_track_share_identity() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.id, new.track_id, new.owner_user_id, new.trainer_user_id, new.shared_at)
     is distinct from (old.id, old.track_id, old.owner_user_id, old.trainer_user_id, old.shared_at)
     or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
    raise exception 'Share identity/revocation is immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger protect_track_share_identity before update on public.track_shares
for each row execute function public.protect_track_share_identity();

create function public.protect_track_feedback_identity() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.id, new.track_share_id, new.author_user_id, new.created_at)
     is distinct from (old.id, old.track_share_id, old.author_user_id, old.created_at) then
    raise exception 'Feedback identity is immutable' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger protect_track_feedback_identity before update on public.track_feedback
for each row execute function public.protect_track_feedback_identity();

alter table public.track_shares enable row level security;
alter table public.track_feedback enable row level security;

-- A share can only be created for a track owned by the caller and an accepted
-- trainer_client connection. The relationship is checked in RLS, not only in
-- the client UI.
create policy track_shares_owner_insert
  on public.track_shares for insert to authenticated
  with check (
    owner_user_id = auth.uid()
    and exists (
      select 1
      from public.training_sessions s
      where s.id = track_shares.track_id
        and s.owner_id = auth.uid()
        and s.type = 'track'
        and s.status = 'completed'
    )
    and exists (
      select 1
      from public.connections c
      where c.owner_user_id = auth.uid()
        and c.connected_user_id = track_shares.trainer_user_id
        and c.connection_type = 'trainer_client'
        and c.status = 'accepted'
    )
  );

create policy track_shares_select
  on public.track_shares for select to authenticated
  using (owner_user_id = auth.uid() or (trainer_user_id = auth.uid() and revoked_at is null and public.can_view_shared_track(track_id, auth.uid())));

create policy track_shares_owner_update
  on public.track_shares for update to authenticated
  using (owner_user_id = auth.uid())
  -- Owner must still be able to revoke after the relationship ends.
  with check (owner_user_id = auth.uid());

create policy track_shares_owner_delete
  on public.track_shares for delete to authenticated
  using (owner_user_id = auth.uid());

-- Feedback is visible to the owner for the lifetime of the share and to the
-- trainer only while that specific share remains active.
create policy track_feedback_select
  on public.track_feedback for select to authenticated
  using (
    exists (
      select 1
      from public.track_shares sh
      where sh.id = track_feedback.track_share_id
        and (sh.owner_user_id = auth.uid() or (sh.trainer_user_id = auth.uid() and sh.revoked_at is null and public.can_view_shared_track(sh.track_id, auth.uid())))
    )
  );

create policy track_feedback_insert
  on public.track_feedback for insert to authenticated
  with check (
    author_user_id = auth.uid()
    and exists (
      select 1
      from public.track_shares sh
      where sh.id = track_feedback.track_share_id
        and sh.revoked_at is null
        and (sh.owner_user_id = auth.uid() or (sh.trainer_user_id = auth.uid() and public.can_view_shared_track(sh.track_id, auth.uid())))
    )
  );

create policy track_feedback_author_update
  on public.track_feedback for update to authenticated
  using (author_user_id = auth.uid() and exists (
    select 1 from public.track_shares sh
    where sh.id = track_feedback.track_share_id
      and sh.revoked_at is null
      and (sh.owner_user_id = auth.uid() or (sh.trainer_user_id = auth.uid() and public.can_view_shared_track(sh.track_id, auth.uid())))
  ))
  with check (
    author_user_id = auth.uid()
    and exists (
      select 1 from public.track_shares sh
      where sh.id = track_feedback.track_share_id
        and sh.revoked_at is null
        and (sh.owner_user_id = auth.uid() or (sh.trainer_user_id = auth.uid() and public.can_view_shared_track(sh.track_id, auth.uid())))
    )
  );

create policy track_feedback_author_delete
  on public.track_feedback for delete to authenticated
  using (author_user_id = auth.uid() and exists (
    select 1 from public.track_shares sh where sh.id = track_feedback.track_share_id
    and (sh.owner_user_id = auth.uid() or (sh.revoked_at is null and sh.trainer_user_id = auth.uid() and public.can_view_shared_track(sh.track_id, auth.uid())))
  ));

-- Preserve the existing owner policies and add only a permissive read policy
-- for active shares. No insert/update/delete capability is granted here.
create policy track_sessions_shared_select
  on public.training_sessions for select to authenticated
  using (public.can_view_shared_track(id, auth.uid()));

-- RLS is row-level: granting dogs SELECT would expose every dog column.
-- Provide only the two display names instead; existing profile/dog RLS stays intact.
create function public.shared_track_display(p_track_id uuid)
returns table(dog_name text, owner_name text)
language sql stable security definer set search_path = public as $$
  select d.name::text, p.full_name::text
  from public.training_sessions s
  join public.dogs d on d.id = s.dog_id
  left join public.profiles p on p.id = s.owner_id
  where s.id = p_track_id and (s.owner_id = auth.uid() or public.can_view_shared_track(s.id, auth.uid()));
$$;
revoke all on function public.shared_track_display(uuid) from public, anon;
grant execute on function public.shared_track_display(uuid) to authenticated;

create policy track_points_shared_select
  on public.track_points for select to authenticated
  using (public.can_view_shared_track(session_id, auth.uid()));

create policy track_markers_shared_select
  on public.track_markers for select to authenticated
  using (public.can_view_shared_track(session_id, auth.uid()));

create policy track_runs_shared_select
  on public.track_runs for select to authenticated
  using (public.can_view_shared_track(session_id, auth.uid()));

create policy track_engine_sessions_shared_select
  on public.track_engine_sessions for select to authenticated
  using (public.can_view_shared_track(session_id, auth.uid()));
