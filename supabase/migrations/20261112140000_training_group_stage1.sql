-- Gruppentraining Stufe 1: Einladen per Code/Link, Beitrittsanfragen, Rolle
-- Organisator:in, Abo-Regel (ACTIVE) auf dem Server.
--
-- Entscheidungen 11./12.11.2026 (claude/GRUPPENFAEHRTEN_KONZEPT.md):
--   * Gruppe erstellen und Gruppentraining starten brauchen ACTIVE; beitreten nicht.
--   * Beitritt per Code immer mit Bestätigung durch Inhaber:in oder Organisator:in.
--   * Einladungen an bestehende Kontakte brauchen keine Bestätigung (wie bisher).
--   * Gruppentraining starten und beenden: nur Inhaber:in und Organisator:innen.
--   * Organisator:innen ernennt nur die Inhaberin bzw. der Inhaber.
--   * Vor der Bestätigung sieht die anfragende Person nur Gruppenname und den
--     Anzeigenamen der einladenden Person.
--
-- Datenwirkung: nur additiv. Neue Spalte training_private_members.role mit
-- Vorgabe 'member' (bestehende Mitglieder bleiben Mitglieder), drei neue
-- Tabellen. Nichts wird gelöscht oder umgeschrieben.
--
-- Rückwärtskompatibel zu installierten App-Versionen: Die Mitgliederliste behält
-- role = 'owner' | 'member' und bekommt zusätzlich isOrganizer (ältere Apps
-- ignorieren das Feld). Neu abgelehnt werden für ältere Apps nur: Gruppe ohne
-- ACTIVE erstellen und Gruppentraining als einfaches Mitglied starten.

set check_function_bodies = off;

-- 1) Daten
alter table public.training_private_members add column if not exists role text not null default 'member';
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'training_private_members_role_check') then
    alter table public.training_private_members
      add constraint training_private_members_role_check check (role in ('member', 'organizer'));
  end if;
end
$c$;

create table if not exists public.training_private_join_codes (
  id uuid not null default gen_random_uuid(),
  group_id uuid not null,
  created_by uuid not null,
  code_hash text not null,
  expires_at timestamp with time zone not null,
  max_uses integer not null,
  uses integer not null default 0,
  revoked_at timestamp with time zone,
  created_at timestamp with time zone not null default clock_timestamp(),
  constraint training_private_join_codes_pkey primary key (id),
  constraint training_private_join_codes_code_hash_key unique (code_hash),
  constraint training_private_join_codes_uses_check check (max_uses between 1 and 50 and uses between 0 and max_uses),
  constraint training_private_join_codes_group_id_fkey foreign key (group_id) references public.training_private_groups(id) on delete cascade,
  constraint training_private_join_codes_created_by_fkey foreign key (created_by) references auth.users(id) on delete cascade
);
create index if not exists training_private_join_codes_group on public.training_private_join_codes using btree (group_id, created_by);

create table if not exists public.training_private_join_requests (
  id uuid not null,
  group_id uuid not null,
  user_id uuid not null,
  code_id uuid,
  display_name text not null,
  request jsonb not null,
  created_at timestamp with time zone not null default clock_timestamp(),
  decided_at timestamp with time zone,
  decided_by uuid,
  decision text,
  constraint training_private_join_requests_pkey primary key (id),
  constraint training_private_join_requests_display_name_check check (length(display_name) between 1 and 60),
  constraint training_private_join_requests_decision_check check (
    (decided_at is null and decision is null)
    or (decided_at is not null and decision in ('approved', 'declined', 'cancelled', 'closed'))),
  constraint training_private_join_requests_group_id_fkey foreign key (group_id) references public.training_private_groups(id) on delete cascade,
  constraint training_private_join_requests_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade,
  constraint training_private_join_requests_code_id_fkey foreign key (code_id) references public.training_private_join_codes(id) on delete set null
);
create unique index if not exists training_private_join_requests_one_pending
  on public.training_private_join_requests using btree (group_id, user_id) where (decided_at is null);
create index if not exists training_private_join_requests_user on public.training_private_join_requests using btree (user_id, created_at);

-- Ratenbegrenzung für Code-Eingaben (nur Zeitpunkt, keine Codes gespeichert).
create table if not exists public.training_private_code_attempts (
  user_id uuid not null,
  attempted_at timestamp with time zone not null default clock_timestamp(),
  constraint training_private_code_attempts_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);
create index if not exists training_private_code_attempts_user on public.training_private_code_attempts using btree (user_id, attempted_at);

alter table public.training_private_join_codes enable row level security;
alter table public.training_private_join_requests enable row level security;
alter table public.training_private_code_attempts enable row level security;
revoke all on table public.training_private_join_codes, public.training_private_join_requests,
  public.training_private_code_attempts from public, anon, authenticated;
grant all on table public.training_private_join_codes, public.training_private_join_requests,
  public.training_private_code_attempts to service_role;

-- 2) Hilfsfunktion: verwaltet die Gruppe (Inhaber:in oder Organisator:in, aktive Gruppe)
create or replace function public.training_private_manager(g uuid, u uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
 select exists(select 1 from public.training_private_members m join public.training_private_groups g1 on g1.id=m.group_id
   where m.group_id=g and m.user_id=u and m.left_at is null and g1.ended_at is null and (g1.owner_id=u or m.role='organizer'))
$function$;

-- 3) Bestehende Funktionen (Änderungen gegenüber 20261112120000 markiert im PR)

CREATE OR REPLACE FUNCTION public.training_private_group_json(g uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('groupId',v.id,'title',v.title,'ownerUserId',v.owner_id,'status',case when v.ended_at is null then 'active' else 'ended' end,'createdAtMs',public.training_private_ms(v.created_at),'members',coalesce((select jsonb_agg(jsonb_build_object('membershipId',m.epoch,'userId',m.user_id,'displayName',m.display_name,'role',case when m.user_id=v.owner_id then 'owner' else 'member' end,'isOrganizer',(m.user_id<>v.owner_id and m.role='organizer'),'joinedAtMs',public.training_private_ms(m.joined_at)) order by m.joined_at,m.user_id) from public.training_private_members m where m.group_id=g and m.left_at is null),'[]')) from public.training_private_groups v where v.id=g
$function$;

CREATE OR REPLACE FUNCTION public.training_group_v1(p_action text, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
AS $function$
declare u uuid:=auth.uid();g uuid;i uuid;target uuid;n text;t text;ttl integer;gv public.training_private_groups;iv public.training_private_invitations;ep uuid;body jsonb;cnt integer;
begin
 case p_action
 when 'list' then
  perform public.training_private_request(p_request,'{}');
  select count(*) into cnt from public.training_private_members m where m.user_id=u and public.training_private_member(m.group_id,u);
  if cnt>100 then raise exception using errcode='P0001',message='GROUP_CONFLICT'; end if;
  if (select count(*) from public.training_private_invitations v join public.training_private_groups g1 on g1.id=v.group_id where v.recipient_id=u and v.accepted_at is null and v.revoked_at is null and v.expires_at>clock_timestamp() and g1.ended_at is null)>100 then raise exception using errcode='P0001',message='GROUP_CONFLICT'; end if;
  body:=jsonb_build_object('groups',coalesce((select jsonb_agg(public.training_private_group_json(m.group_id) order by m.group_id) from public.training_private_members m where m.user_id=u and public.training_private_member(m.group_id,u)),'[]'),'invitations',coalesce((select jsonb_agg(public.training_private_invitation_json(v.id) order by v.id) from public.training_private_invitations v join public.training_private_groups g1 on g1.id=v.group_id where v.recipient_id=u and v.accepted_at is null and v.revoked_at is null and v.expires_at>clock_timestamp() and g1.ended_at is null and public.training_private_connected(v.inviter_id,u)),'[]'));
 when 'create' then
  perform public.training_private_request(p_request,array['groupId','title','displayName']); g:=public.training_private_uuid(p_request,'groupId');t:=public.training_private_text(p_request,'title',80);n:=public.training_private_text(p_request,'displayName',60);
  -- User-scoped creation lock serializes quota checks, including distinct UUIDs.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('training-group-user:'||u::text,0));
  select * into gv from public.training_private_groups where id=g for update;
  if found then
   if gv.owner_id<>u then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
   if gv.create_request<>p_request or gv.ended_at is not null then raise exception using errcode='P0001',message='GROUP_CONFLICT'; end if;
  else
   perform public.gd_active();
   if (select count(*) from public.training_private_groups where owner_id=u)>=100 then raise exception using errcode='P0001',message='GROUP_CONFLICT'; end if;
   if (select count(*) from public.training_private_members m where m.user_id=u and public.training_private_member(m.group_id,u))>=100 then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
   insert into public.training_private_groups(id,owner_id,title,create_request) values(g,u,t,p_request);
   insert into public.training_private_members(group_id,user_id,epoch,display_name) values(g,u,g,n);
  end if;
  body:=jsonb_build_object('group',public.training_private_group_json(g));
 when 'invite','revoke_invite' then
  if p_action='invite' then perform public.training_private_request(p_request,array['groupId','invitationId','recipientUserId','ttlSeconds']); else perform public.training_private_request(p_request,array['groupId','invitationId']); end if;
  g:=public.training_private_uuid(p_request,'groupId');i:=public.training_private_uuid(p_request,'invitationId');
  if p_action='invite' then
   target:=public.training_private_uuid(p_request,'recipientUserId');
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('training-group-user:'||target::text,0));
  end if;
  perform public.training_private_lock_group(g);
  select * into gv from public.training_private_groups where id=g;
  if not public.training_private_manager(g,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  select * into iv from public.training_private_invitations where id=i for update;
  if found and (iv.group_id<>g or iv.inviter_id<>u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  if p_action='revoke_invite' then
   if iv.id is null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
   if iv.accepted_at is not null then raise exception using errcode='P0001',message='GROUP_CONFLICT'; end if;
   update public.training_private_invitations set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=i;body:=jsonb_build_object('invitationId',i,'revoked',true);
  else
   target:=public.training_private_uuid(p_request,'recipientUserId');ttl:=public.training_private_number(p_request,'ttlSeconds',60,604800,true);
   if target=u or not public.training_private_connected(u,target) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
   if iv.id is not null then
    if iv.request<>p_request then raise exception using errcode='P0001',message='GROUP_CONFLICT'; end if;
    if iv.revoked_at is not null then raise exception using errcode='P0001',message='GROUP_REVOKED'; end if;
    if iv.expires_at<=clock_timestamp() then raise exception using errcode='P0001',message='GROUP_EXPIRED'; end if;
   else
    if public.training_private_member(g,target) or (select count(*) from public.training_private_members where group_id=g and left_at is null)+(select count(*) from public.training_private_invitations where group_id=g and revoked_at is null and accepted_at is null and expires_at>clock_timestamp())>=50 then raise exception using errcode='P0001',message='GROUP_CONFLICT'; end if;
    if (select count(*) from public.training_private_invitations where group_id=g)>=512 or
       (select count(*) from public.training_private_invitations v join public.training_private_groups g1 on g1.id=v.group_id where v.recipient_id=target and v.accepted_at is null and v.revoked_at is null and v.expires_at>clock_timestamp() and g1.ended_at is null)>=100 then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
    insert into public.training_private_invitations(id,group_id,inviter_id,recipient_id,request,expires_at) values(i,g,u,target,p_request,clock_timestamp()+make_interval(secs=>ttl));
   end if;body:=jsonb_build_object('invitation',public.training_private_invitation_json(i));
  end if;
 when 'accept' then
  perform public.training_private_request(p_request,array['invitationId','displayName']); i:=public.training_private_uuid(p_request,'invitationId');n:=public.training_private_text(p_request,'displayName',60);
  select group_id into g from public.training_private_invitations where id=i and recipient_id=u;
  if g is null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('training-group-user:'||u::text,0));
  perform public.training_private_lock_group(g);select * into iv from public.training_private_invitations where id=i for update;
  if not public.training_private_member(g,iv.inviter_id) or not public.training_private_connected(u,iv.inviter_id) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  if iv.revoked_at is not null then raise exception using errcode='P0001',message='GROUP_REVOKED'; end if;
  if iv.accepted_at is not null then
   if iv.accepted_name<>n or not exists(select 1 from public.training_private_members where group_id=g and user_id=u and left_at is null and epoch=iv.accepted_epoch) then raise exception using errcode='P0001',message='GROUP_CONFLICT'; end if;
  else
   if iv.expires_at<=clock_timestamp() then raise exception using errcode='P0001',message='GROUP_EXPIRED'; end if;
   if public.training_private_member(g,u) or (select count(*) from public.training_private_members where group_id=g and left_at is null)>=50 then raise exception using errcode='P0001',message='GROUP_CONFLICT'; end if;
   if (select count(*) from public.training_private_members m where m.user_id=u and public.training_private_member(m.group_id,u))>=100 then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
   ep:=i;
   insert into public.training_private_members(group_id,user_id,epoch,display_name) values(g,u,ep,n) on conflict(group_id,user_id) do update set epoch=excluded.epoch,display_name=excluded.display_name,joined_at=clock_timestamp(),left_at=null,role='member';
   update public.training_private_invitations set accepted_at=clock_timestamp(),accepted_epoch=ep,accepted_name=n where id=i;
  end if;body:=jsonb_build_object('group',public.training_private_group_json(g));
 when 'leave','remove_member','close' then
  if p_action='remove_member' then perform public.training_private_request(p_request,array['groupId','memberUserId','membershipId']);elsif p_action='leave' then perform public.training_private_request(p_request,array['groupId','membershipId']);else perform public.training_private_request(p_request,array['groupId']);end if;
  g:=public.training_private_uuid(p_request,'groupId');perform public.training_private_lock_group(g);select * into gv from public.training_private_groups where id=g;
  if p_action='close' then
   if gv.owner_id<>u then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
   update public.training_private_groups set ended_at=coalesce(ended_at,clock_timestamp()) where id=g;
   update public.training_private_sessions set ended_at=coalesce(ended_at,clock_timestamp()) where group_id=g;
   update public.training_private_invitations set revoked_at=coalesce(revoked_at,clock_timestamp()) where group_id=g and accepted_at is null;
   update public.training_private_join_codes set revoked_at=coalesce(revoked_at,clock_timestamp()) where group_id=g;
   update public.training_private_join_requests set decided_at=clock_timestamp(),decision='closed' where group_id=g and decided_at is null;
   perform public.training_private_invalidate(g,null,null);body:=jsonb_build_object('groupId',g,'ended',true);
  else
   target:=case when p_action='leave' then u else public.training_private_uuid(p_request,'memberUserId') end;
   ep:=public.training_private_uuid(p_request,'membershipId');
   if p_action='remove_member' and (not public.training_private_manager(g,u) or (gv.owner_id<>u and exists(select 1 from public.training_private_members where group_id=g and user_id=target and role='organizer' and left_at is null))) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
   if target=gv.owner_id then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
   if exists(select 1 from public.training_private_members where group_id=g and user_id=target and epoch=ep) then
    update public.training_private_members set left_at=coalesce(left_at,clock_timestamp()),role='member' where group_id=g and user_id=target and epoch=ep;
    update public.training_private_invitations set revoked_at=coalesce(revoked_at,clock_timestamp()) where group_id=g and recipient_id=target and id=ep;
    perform public.training_private_invalidate(g,null,target);
   elsif exists(select 1 from public.training_private_invitations where id=ep and group_id=g and recipient_id=target) then
    -- Cancel a pending acceptance or acknowledge an already superseded membership.
    -- Never invalidate the newer membership/participants/grants.
    update public.training_private_invitations set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=ep and accepted_at is null;
   else raise exception using errcode='42501',message='GROUP_UNAVAILABLE';
   end if;
   body:=case when p_action='leave' then jsonb_build_object('groupId',g,'membershipId',ep,'left',true) else jsonb_build_object('groupId',g,'memberUserId',target,'membershipId',ep,'removed',true) end;
  end if;
 else raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';
 end case;
 return jsonb_build_object('version',1,'serverNowMs',public.training_private_ms(clock_timestamp()))||body;
end $function$;

CREATE OR REPLACE FUNCTION public.training_group_session_v1(p_action text, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
AS $function$
declare u uuid:=auth.uid();g uuid;s uuid;d uuid;ep uuid;me uuid;ttl integer;t text;v public.training_private_sessions;part public.training_private_participants;body jsonb;
begin
 case p_action
 when 'list' then
  perform public.training_private_request(p_request,array['groupId']);g:=public.training_private_uuid(p_request,'groupId');perform public.training_private_lock_group(g);
  if not public.training_private_member(g,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
  if (select count(*) from public.training_private_sessions where group_id=g)>100 then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
  body:=jsonb_build_object('sessions',coalesce((select jsonb_agg(public.training_private_session_json(id,false) order by created_at,id) from public.training_private_sessions where group_id=g),'[]'));
 when 'open' then
  perform public.training_private_request(p_request,array['groupId','sessionId','title','ttlSeconds','dogId']);g:=public.training_private_uuid(p_request,'groupId');s:=public.training_private_uuid(p_request,'sessionId');d:=public.training_private_uuid(p_request,'dogId');ttl:=public.training_private_number(p_request,'ttlSeconds',60,7200,true);t:=public.training_private_text(p_request,'title',80);
  perform public.training_private_lock_group(g);
  if not public.training_private_member(g,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
  perform 1 from public.dogs where id=d and owner_id=u for share;
  if not found then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
  select * into v from public.training_private_sessions where id=s for update;
  if found then
   if v.owner_id<>u or v.group_id<>g then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
   if v.request<>p_request then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
   if not public.training_private_participant(s,u) then raise exception using errcode='P0001',message='GROUP_REVOKED';end if;
  else
   -- Gruppentraining starten: nur Inhaber:in/Organisator:in mit ACTIVE.
   if not public.training_private_manager(g,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
   perform public.gd_active();
   if (select count(*) from public.training_private_sessions where group_id=g)>=100 then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
   insert into public.training_private_sessions(id,group_id,owner_id,title,request,expires_at) values(s,g,u,t,p_request,clock_timestamp()+make_interval(secs=>ttl));
   select epoch into me from public.training_private_members where group_id=g and user_id=u;
   insert into public.training_private_participants(session_id,user_id,dog_id,dog_epoch,member_epoch,epoch) values(s,u,d,public.training_private_dog_epoch(d),me,s);
  end if;
  body:=jsonb_build_object('session',public.training_private_session_json(s,true));
 when 'join','get','leave','end' then
  if p_action='join' then perform public.training_private_request(p_request,array['sessionId','dogId','participationId']);
  elsif p_action='leave' then perform public.training_private_request(p_request,array['sessionId','participationId']);
  else perform public.training_private_request(p_request,array['sessionId']);end if;
  s:=public.training_private_uuid(p_request,'sessionId');g:=public.training_private_lock_session(s);select * into v from public.training_private_sessions where id=s;
  if p_action='leave' then
   ep:=public.training_private_uuid(p_request,'participationId');
   if not exists(select 1 from public.training_private_members where group_id=g and user_id=u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
   select * into part from public.training_private_participants where epoch=ep for update;
   if found and (part.session_id<>s or part.user_id<>u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
   if part.epoch is null then
    if (select count(*) from public.training_private_participants where session_id=s and user_id=u)>=512 then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
    insert into public.training_private_participants(session_id,user_id,epoch,left_at) values(s,u,ep,clock_timestamp());
   elsif part.left_at is null then perform public.training_private_invalidate(g,s,u);
   end if;
   body:=jsonb_build_object('sessionId',s,'left',true,'participationId',ep);
  elsif p_action='end' then
   if (v.owner_id<>u and not public.training_private_manager(g,u)) or not public.training_private_member(g,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
   update public.training_private_sessions set ended_at=coalesce(ended_at,clock_timestamp()) where id=s;
   perform public.training_private_invalidate(g,s,null);body:=jsonb_build_object('sessionId',s,'ended',true);
  else
   if not public.training_private_member(g,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
   if v.ended_at is not null or v.expires_at<=clock_timestamp() then raise exception using errcode='P0001',message='GROUP_EXPIRED';end if;
   if p_action='join' then
    d:=public.training_private_uuid(p_request,'dogId');ep:=public.training_private_uuid(p_request,'participationId');
    perform 1 from public.dogs where id=d and owner_id=u for share;if not found then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
    select * into part from public.training_private_participants where epoch=ep for update;
    if found then
     if part.session_id<>s or part.user_id<>u then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
     if part.left_at is not null then raise exception using errcode='P0001',message='GROUP_REVOKED';end if;
     if part.dog_id<>d or not public.training_private_participant(s,u) then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
    else
     if exists(select 1 from public.training_private_participants where session_id=s and user_id=u and left_at is null) then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
     if (select count(*) from public.training_private_participants where session_id=s and user_id=u)>=512 then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
     select epoch into me from public.training_private_members where group_id=g and user_id=u;
     insert into public.training_private_participants(session_id,user_id,dog_id,dog_epoch,member_epoch,epoch) values(s,u,d,public.training_private_dog_epoch(d),me,ep);
    end if;
   elsif not public.training_private_participant(s,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
   body:=jsonb_build_object('session',public.training_private_session_json(s,true));
  end if;
 else raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';
 end case;
 return jsonb_build_object('version',1,'serverNowMs',public.training_private_ms(clock_timestamp()))||body;
end $function$;

-- 4) Neue RPC: Codes, Beitrittsanfragen, Rollen
create or replace function public.training_group_join_v1(p_action text, p_request jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
 set lock_timeout to '3s'
as $function$
declare
  u uuid := auth.uid(); g uuid; r uuid; target uuid; ep uuid;
  c text; n text; new_role text; body jsonb; invalid jsonb;
  gv public.training_private_groups; cv public.training_private_join_codes; rv public.training_private_join_requests;
begin
 if u is null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
 case p_action
 when 'code_create' then
  perform public.training_private_request(p_request,array['groupId']); g:=public.training_private_uuid(p_request,'groupId');
  perform public.training_private_lock_group(g);
  if not public.training_private_manager(g,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  if (select count(*) from public.training_private_join_codes where group_id=g and created_at>clock_timestamp()-interval '24 hours')>=50 then
   raise exception using errcode='P0001',message='GROUP_LIMIT'; end if;
  -- Je Person und Gruppe gilt immer nur der neueste Code.
  update public.training_private_join_codes set revoked_at=clock_timestamp() where group_id=g and created_by=u and revoked_at is null;
  c:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  insert into public.training_private_join_codes(group_id,created_by,code_hash,expires_at,max_uses)
   values(g,u,encode(sha256(convert_to(c,'UTF8')),'hex'),clock_timestamp()+interval '24 hours',8) returning * into cv;
  body:=jsonb_build_object('groupId',g,'code',c,'expiresAtMs',public.training_private_ms(cv.expires_at),'maxUses',cv.max_uses);
 when 'code_revoke' then
  perform public.training_private_request(p_request,array['groupId']); g:=public.training_private_uuid(p_request,'groupId');
  perform public.training_private_lock_group(g);
  if not public.training_private_manager(g,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  update public.training_private_join_codes c1 set revoked_at=coalesce(c1.revoked_at,clock_timestamp())
   where c1.group_id=g and (c1.created_by=u or exists(select 1 from public.training_private_groups g1 where g1.id=g and g1.owner_id=u));
  body:=jsonb_build_object('groupId',g,'revoked',true);
 when 'preview','request' then
  if p_action='preview' then perform public.training_private_request(p_request,array['code']);
  else perform public.training_private_request(p_request,array['code','requestId','displayName']);
   r:=public.training_private_uuid(p_request,'requestId'); n:=public.training_private_text(p_request,'displayName',60);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('training-group-user:'||u::text,0));
  if p_action='request' then
   select * into rv from public.training_private_join_requests where id=r;
   if found then -- gleiche Anfrage erneut gesendet (unklare Antwort): gleiche Antwort
    if rv.user_id<>u then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
    if rv.request<>p_request then raise exception using errcode='P0001',message='GROUP_CONFLICT'; end if;
    return jsonb_build_object('version',1,'serverNowMs',public.training_private_ms(clock_timestamp()),'request',public.training_private_join_request_json(r));
   end if;
  end if;
  delete from public.training_private_code_attempts where user_id=u and attempted_at<clock_timestamp()-interval '1 day';
  if (select count(*) from public.training_private_code_attempts where user_id=u and attempted_at>clock_timestamp()-interval '1 hour')>=20 then
   raise exception using errcode='P0001',message='GROUP_LIMIT'; end if;
  insert into public.training_private_code_attempts(user_id) values(u);
  c:=upper(regexp_replace(public.training_private_text(p_request,'code',32),'[^0-9A-Za-z]','','g'));
  -- Ungültige Codes werden als Antwort gemeldet, nicht als Fehler: Ein Fehler würde
  -- den Zähler der Ratenbegrenzung mit zurückrollen.
  invalid:=jsonb_build_object('version',1,'serverNowMs',public.training_private_ms(clock_timestamp()),'invalidCode',true);
  if length(c)<>12 then return invalid; end if;
  select * into cv from public.training_private_join_codes
   where code_hash=encode(sha256(convert_to(c,'UTF8')),'hex') and revoked_at is null and expires_at>clock_timestamp() and uses<max_uses for update;
  if not found then return invalid; end if;
  select * into gv from public.training_private_groups where id=cv.group_id;
  -- Code ungültig, sobald Gruppe beendet ist oder die einladende Person nicht mehr verwaltet;
  -- Blockierungen zwischen Anfragender und Inhaber:in/Einladender wirken wie ein ungültiger Code.
  if gv.ended_at is not null or not public.training_private_manager(gv.id,cv.created_by)
     or public.contact_is_blocked(u,gv.owner_id) or public.contact_is_blocked(u,cv.created_by) then
   return invalid; end if;
  if p_action='preview' then
   body:=jsonb_build_object('preview',jsonb_build_object(
    'groupTitle',gv.title,
    'inviterName',(select m.display_name from public.training_private_members m where m.group_id=gv.id and m.user_id=cv.created_by),
    'status',case when public.training_private_member(gv.id,u) then 'member'
                  when exists(select 1 from public.training_private_join_requests q where q.group_id=gv.id and q.user_id=u and q.decided_at is null) then 'pending'
                  else 'none' end));
  else
   perform public.training_private_lock_group(gv.id);
   if public.training_private_member(gv.id,u)
      or exists(select 1 from public.training_private_join_requests q where q.group_id=gv.id and q.user_id=u and q.decided_at is null) then
    raise exception using errcode='P0001',message='GROUP_CONFLICT'; end if;
   if (select count(*) from public.training_private_join_requests q where q.user_id=u and q.decided_at is null)>=20
      or (select count(*) from public.training_private_join_requests q where q.group_id=gv.id and q.decided_at is null)>=50
      or (select count(*) from public.training_private_members where group_id=gv.id and left_at is null)>=50 then
    raise exception using errcode='P0001',message='GROUP_LIMIT'; end if;
   insert into public.training_private_join_requests(id,group_id,user_id,code_id,display_name,request) values(r,gv.id,u,cv.id,n,p_request);
   update public.training_private_join_codes set uses=uses+1 where id=cv.id;
   body:=jsonb_build_object('request',public.training_private_join_request_json(r));
  end if;
 when 'mine' then
  perform public.training_private_request(p_request,'{}');
  body:=jsonb_build_object('requests',coalesce((select jsonb_agg(public.training_private_join_request_json(q.id) order by q.created_at,q.id)
   from public.training_private_join_requests q join public.training_private_groups g1 on g1.id=q.group_id
   where q.user_id=u and q.decided_at is null and g1.ended_at is null),'[]'));
 when 'cancel' then
  perform public.training_private_request(p_request,array['requestId']); r:=public.training_private_uuid(p_request,'requestId');
  select * into rv from public.training_private_join_requests where id=r for update;
  if not found or rv.user_id<>u then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  if rv.decided_at is null then
   update public.training_private_join_requests set decided_at=clock_timestamp(),decided_by=u,decision='cancelled' where id=r;
  elsif rv.decision<>'cancelled' then raise exception using errcode='P0001',message='GROUP_CONFLICT'; end if;
  body:=jsonb_build_object('requestId',r,'cancelled',true);
 when 'pending' then
  perform public.training_private_request(p_request,array['groupId']); g:=public.training_private_uuid(p_request,'groupId');
  if not public.training_private_manager(g,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  body:=jsonb_build_object('groupId',g,'requests',coalesce((select jsonb_agg(jsonb_build_object(
    'requestId',q.id,'userId',q.user_id,'displayName',q.display_name,'createdAtMs',public.training_private_ms(q.created_at)) order by q.created_at,q.id)
   from public.training_private_join_requests q where q.group_id=g and q.decided_at is null),'[]'));
 when 'approve','decline' then
  perform public.training_private_request(p_request,array['groupId','requestId']);
  g:=public.training_private_uuid(p_request,'groupId'); r:=public.training_private_uuid(p_request,'requestId');
  select user_id into target from public.training_private_join_requests where id=r and group_id=g;
  if target is null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('training-group-user:'||target::text,0));
  perform public.training_private_lock_group(g);
  if not public.training_private_manager(g,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  select * into rv from public.training_private_join_requests where id=r for update;
  if rv.decided_at is not null then
   if rv.decision is distinct from (case when p_action='approve' then 'approved' else 'declined' end) then
    raise exception using errcode='P0001',message=case when rv.decision='cancelled' then 'GROUP_REVOKED' else 'GROUP_CONFLICT' end; end if;
  elsif p_action='decline' then
   update public.training_private_join_requests set decided_at=clock_timestamp(),decided_by=u,decision='declined' where id=r;
  else
   if public.training_private_member(g,target) then raise exception using errcode='P0001',message='GROUP_CONFLICT'; end if;
   if (select count(*) from public.training_private_members where group_id=g and left_at is null)>=50
      or (select count(*) from public.training_private_members m where m.user_id=target and public.training_private_member(m.group_id,target))>=100 then
    raise exception using errcode='P0001',message='GROUP_LIMIT'; end if;
   insert into public.training_private_members(group_id,user_id,epoch,display_name) values(g,target,r,rv.display_name)
    on conflict(group_id,user_id) do update set epoch=excluded.epoch,display_name=excluded.display_name,joined_at=clock_timestamp(),left_at=null,role='member';
   update public.training_private_join_requests set decided_at=clock_timestamp(),decided_by=u,decision='approved' where id=r;
  end if;
  body:=jsonb_build_object('groupId',g,'requestId',r,case when p_action='approve' then 'approved' else 'declined' end,true);
 when 'set_role' then
  perform public.training_private_request(p_request,array['groupId','memberUserId','membershipId','role']);
  g:=public.training_private_uuid(p_request,'groupId'); target:=public.training_private_uuid(p_request,'memberUserId');
  ep:=public.training_private_uuid(p_request,'membershipId'); new_role:=public.training_private_text(p_request,'role',20);
  if new_role not in ('member','organizer') then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
  perform public.training_private_lock_group(g); select * into gv from public.training_private_groups where id=g;
  if gv.owner_id is distinct from u or gv.ended_at is not null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  if target=u then raise exception using errcode='P0001',message='GROUP_CONFLICT'; end if;
  update public.training_private_members set role=new_role where group_id=g and user_id=target and epoch=ep and left_at is null;
  if not found then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  body:=jsonb_build_object('groupId',g,'memberUserId',target,'membershipId',ep,'role',new_role);
 else raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';
 end case;
 return jsonb_build_object('version',1,'serverNowMs',public.training_private_ms(clock_timestamp()))||body;
end $function$;

create or replace function public.training_private_join_request_json(q uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
 select jsonb_build_object('requestId',r.id,'groupId',r.group_id,'groupTitle',g1.title,'displayName',r.display_name,
   'status',coalesce(r.decision,'pending'),'createdAtMs',public.training_private_ms(r.created_at))
 from public.training_private_join_requests r join public.training_private_groups g1 on g1.id=r.group_id where r.id=q
$function$;

-- 5) Rechte
revoke all on function public.training_private_manager(uuid, uuid) from public, anon, authenticated;
grant execute on function public.training_private_manager(uuid, uuid) to service_role;
revoke all on function public.training_private_join_request_json(uuid) from public, anon, authenticated;
grant execute on function public.training_private_join_request_json(uuid) to service_role;
revoke all on function public.training_group_join_v1(text, jsonb) from public, anon, authenticated;
grant execute on function public.training_group_join_v1(text, jsonb) to authenticated;

reset check_function_bodies;
