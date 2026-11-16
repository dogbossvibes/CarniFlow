-- Gruppentraining Stufe 4a: Auswertung teilen, Trainer-Sicht, Rolle Trainer:in.
--
-- Entscheidungen 16.11.2026 (Sandra):
--   * Eine Auswertung (gelegte Linie, Absuchelinie, Kennzahlen) teilt nur die
--     Hundeführerin, ausdrücklich und widerrufbar: an einzelne Mitglieder der
--     Gruppe (Leger:in, Trainer:in, andere) oder an die ganze Gruppe. Standard: aus.
--     Auch die Leger:in sieht die Absuche nur mit Freigabe.
--   * Teilen geht nach der Absuche und später aus der Fährte heraus.
--   * Rolle Trainer:in: vergibt nur die Inhaberin; ohne Verwaltungsrechte und ohne
--     Einsicht ausser in das, was man ihr teilt.
--   * Gruppeneinstellung «Auswertungen auch ausserhalb der Gruppe teilen»
--     (nur die Inhaberin), Standard aus. Das Teilen ausserhalb läuft über die
--     bestehende Trainer-Freigabe der Fährte (track_shares); die App bietet sie für
--     Gruppenfährten nur an, wenn die Gruppe es erlaubt.
--   * Nie Notizen, Gesundheit oder Dokumente. Sichtbar nur für aktive Mitglieder;
--     wer die Gruppe verlässt, verliert die Einsicht. Gelöscht 30 Tage nach dem
--     letzten Teilen oder sofort beim Widerruf.
--
-- Datenwirkung: additiv. Zwei neue Spalten mit Standardwert (keine bestehende
-- Zeile ändert ihre Bedeutung), zwei neue Tabellen. Keine Daten werden gelöscht
-- oder umgeschrieben.

set check_function_bodies = off;

-- 1) Neue Spalten
alter table public.training_private_groups add column if not exists share_outside boolean not null default false;
alter table public.training_private_members add column if not exists is_trainer boolean not null default false;

-- 2) Geteilte Auswertungen (unabhängig von der Fährte, die nach 7 Tagen gelöscht wird)
create table if not exists public.training_private_evaluations (
  track_id uuid not null,
  group_id uuid not null,
  session_id uuid not null,
  handler_id uuid not null,
  layer_id uuid not null,
  handler_name text not null,
  layer_name text not null,
  dog_name text not null,
  package jsonb not null,
  shared_to_group boolean not null default false,
  created_at timestamp with time zone not null default clock_timestamp(),
  updated_at timestamp with time zone not null default clock_timestamp(),
  constraint training_private_evaluations_pkey primary key (track_id),
  constraint training_private_evaluations_group_fkey foreign key (group_id) references public.training_private_groups(id) on delete cascade,
  constraint training_private_evaluations_handler_fkey foreign key (handler_id) references auth.users(id) on delete cascade,
  constraint training_private_evaluations_layer_fkey foreign key (layer_id) references auth.users(id) on delete cascade
);
create index if not exists training_private_evaluations_group on public.training_private_evaluations using btree (group_id, updated_at desc);
create table if not exists public.training_private_evaluation_grants (
  track_id uuid not null,
  recipient_id uuid not null,
  created_at timestamp with time zone not null default clock_timestamp(),
  constraint training_private_evaluation_grants_pkey primary key (track_id, recipient_id),
  constraint training_private_evaluation_grants_track_fkey foreign key (track_id) references public.training_private_evaluations(track_id) on delete cascade,
  constraint training_private_evaluation_grants_recipient_fkey foreign key (recipient_id) references auth.users(id) on delete cascade
);
create index if not exists training_private_evaluation_grants_recipient on public.training_private_evaluation_grants using btree (recipient_id);
alter table public.training_private_evaluations enable row level security;
alter table public.training_private_evaluation_grants enable row level security;
revoke all on table public.training_private_evaluations, public.training_private_evaluation_grants from public, anon, authenticated;
grant all on table public.training_private_evaluations, public.training_private_evaluation_grants to service_role;

-- 3) Wer die Gruppe verlässt, ist auch nicht mehr Trainer:in
create or replace function public.training_private_member_left()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
 if new.left_at is not null and old.left_at is null then new.is_trainer := false; end if;
 return new;
end $function$;
drop trigger if exists training_private_member_left on public.training_private_members;
create trigger training_private_member_left before update of left_at on public.training_private_members
 for each row execute function public.training_private_member_left();

-- 4) Gruppen-JSON: zusätzlich isTrainer und shareOutside (ältere Apps ignorieren beides)
CREATE OR REPLACE FUNCTION public.training_private_group_json(g uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('groupId',v.id,'title',v.title,'ownerUserId',v.owner_id,'status',case when v.ended_at is null then 'active' else 'ended' end,'createdAtMs',public.training_private_ms(v.created_at),'shareOutside',v.share_outside,'members',coalesce((select jsonb_agg(jsonb_build_object('membershipId',m.epoch,'userId',m.user_id,'displayName',m.display_name,'role',case when m.user_id=v.owner_id then 'owner' else 'member' end,'isOrganizer',(m.user_id<>v.owner_id and m.role='organizer'),'isTrainer',(m.user_id<>v.owner_id and m.is_trainer),'joinedAtMs',public.training_private_ms(m.joined_at)) order by m.joined_at,m.user_id) from public.training_private_members m where m.group_id=g and m.left_at is null),'[]')) from public.training_private_groups v where v.id=g
$function$;

-- 5) Paket prüfen: nur Linien und Kennzahlen, höchstens 1.5 MB
create or replace function public.training_private_evaluation_package(pkg jsonb)
 returns jsonb
 language plpgsql
 immutable
 set search_path to ''
as $function$
declare m jsonb; k text;
begin
 if jsonb_typeof(pkg) is distinct from 'object' or octet_length(pkg::text)>1500000
    or (select array_agg(x order by x) from jsonb_object_keys(pkg) x)<>array['laid','metrics','search','version']
    or pkg->'version'<>'1'::jsonb
    or jsonb_typeof(pkg->'laid')<>'array' or jsonb_typeof(pkg->'search')<>'array'
    or jsonb_array_length(pkg->'laid') not between 2 and 5000 or jsonb_array_length(pkg->'search') not between 2 and 10000 then
  raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
 if exists(select 1 from (select e from jsonb_array_elements(pkg->'laid') e union all select e from jsonb_array_elements(pkg->'search') e) a
   where jsonb_typeof(a.e)<>'object'
      or exists(select 1 from jsonb_object_keys(a.e) x where x not in ('lat','lng','breakBefore'))
      or jsonb_typeof(a.e->'lat')<>'number' or jsonb_typeof(a.e->'lng')<>'number'
      or (a.e->>'lat')::numeric not between -90 and 90 or (a.e->>'lng')::numeric not between -180 and 180
      or (a.e ? 'breakBefore' and a.e->'breakBefore'<>'true'::jsonb)) then
  raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
 m:=pkg->'metrics';
 if jsonb_typeof(m) is distinct from 'object'
    or (select array_agg(x order by x) from jsonb_object_keys(m) x)<>array['articlesFound','articlesTotal','breaks','deviationAvgM','distanceM','durationS'] then
  raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
 foreach k in array array['articlesFound','articlesTotal','breaks','distanceM','durationS'] loop
  if jsonb_typeof(m->k)<>'number' or (m->>k)::numeric not between 0 and 1000000 then
   raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
 end loop;
 if jsonb_typeof(m->'deviationAvgM') not in ('number','null') or (jsonb_typeof(m->'deviationAvgM')='number' and (m->>'deviationAvgM')::numeric not between 0 and 100000) then
  raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
 return pkg;
end $function$;

-- 6) Sichtbarkeit: Hundeführerin immer; sonst aktives Mitglied mit Freigabe (einzeln oder Gruppe),
--    solange die Hundeführerin selbst noch Mitglied ist.
create or replace function public.training_private_evaluation_visible(t uuid, u uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
 select exists(select 1 from public.training_private_evaluations e where e.track_id=t and (e.handler_id=u or (
   public.training_private_member(e.group_id,u) and public.training_private_member(e.group_id,e.handler_id)
   and (e.shared_to_group or exists(select 1 from public.training_private_evaluation_grants x where x.track_id=t and x.recipient_id=u)))))
$function$;

create or replace function public.training_private_evaluation_json(e public.training_private_evaluations, u uuid, full_package boolean)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
 select jsonb_build_object('trackId',e.track_id,'groupId',e.group_id,'sessionId',e.session_id,
  'handlerUserId',e.handler_id,'handlerName',e.handler_name,'layerUserId',e.layer_id,'layerName',e.layer_name,'dogName',e.dog_name,
  'metrics',e.package->'metrics','mine',e.handler_id=u,'updatedAtMs',public.training_private_ms(e.updated_at))
  || case when full_package then jsonb_build_object('laid',e.package->'laid','search',e.package->'search') else '{}'::jsonb end
$function$;

-- Stand der Freigaben für die Hundeführerin, mit möglichen Empfänger:innen
create or replace function public.training_private_evaluation_state(t uuid, g uuid, u uuid, layer uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
 select jsonb_build_object('trackId',t,'groupId',g,
  'shareOutside',coalesce((select share_outside from public.training_private_groups where id=g),false),
  'shared',exists(select 1 from public.training_private_evaluations where track_id=t),
  'group',coalesce((select shared_to_group from public.training_private_evaluations where track_id=t),false),
  'recipientUserIds',coalesce((select jsonb_agg(recipient_id order by recipient_id) from public.training_private_evaluation_grants where track_id=t),'[]'),
  'candidates',coalesce((select jsonb_agg(jsonb_build_object('userId',m.user_id,'displayName',m.display_name,
     'isTrainer',(m.user_id<>gr.owner_id and m.is_trainer),'isLayer',m.user_id=layer) order by (m.user_id=layer) desc,(m.is_trainer) desc,m.display_name,m.user_id)
   from public.training_private_members m join public.training_private_groups gr on gr.id=m.group_id
   where m.group_id=g and m.left_at is null and m.user_id<>u),'[]'))
$function$;

-- 7) Endpunkt
create or replace function public.training_group_eval_v1(p_action text, p_request jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
 set lock_timeout to '3s'
as $function$
declare
  u uuid := auth.uid(); t uuid; g uuid; target uuid; ep uuid; flag boolean; body jsonb; ids uuid[];
  tv public.training_private_tracks; sv public.training_private_sessions; ev public.training_private_evaluations;
  hname text; lname text; dname text; pkg jsonb;
begin
 if u is null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
 case p_action
 when 'get' then
  perform public.training_private_request(p_request,array['trackId']); t:=public.training_private_uuid(p_request,'trackId');
  select * into tv from public.training_private_tracks where id=t;
  select * into ev from public.training_private_evaluations where track_id=t;
  if tv.id is not null and tv.handler_id=u then
   select * into sv from public.training_private_sessions where id=tv.session_id;
   body:=public.training_private_evaluation_state(t,sv.group_id,u,tv.layer_id);
  elsif ev.track_id is not null and ev.handler_id=u then
   body:=public.training_private_evaluation_state(t,ev.group_id,u,ev.layer_id);
  else raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  body:=body||jsonb_build_object('searched',coalesce(tv.status='searched',ev.track_id is not null));
 when 'share' then
  if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>1600000
     or (select array_agg(x order by x) from jsonb_object_keys(p_request) x)<>array['evaluation','group','recipientUserIds','trackId']
     or jsonb_typeof(p_request->'group')<>'boolean' or jsonb_typeof(p_request->'recipientUserIds')<>'array'
     or jsonb_array_length(p_request->'recipientUserIds')>50
     or jsonb_typeof(p_request->'evaluation') not in ('object','null') then
   raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
  t:=public.training_private_uuid(p_request,'trackId'); flag:=(p_request->>'group')::boolean;
  begin
   select coalesce(array_agg(distinct x::uuid),'{}') into ids from jsonb_array_elements_text(p_request->'recipientUserIds') x;
  exception when invalid_text_representation then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end;
  if exists(select 1 from jsonb_array_elements(p_request->'recipientUserIds') x where jsonb_typeof(x)<>'string') then
   raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
  select * into ev from public.training_private_evaluations where track_id=t for update;
  select * into tv from public.training_private_tracks where id=t;
  if ev.track_id is not null then
   if ev.handler_id<>u then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
   g:=ev.group_id;
  else
   if tv.id is null or tv.handler_id<>u then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
   if tv.status<>'searched' then raise exception using errcode='P0001',message='GROUP_CONFLICT'; end if;
   select * into sv from public.training_private_sessions where id=tv.session_id; g:=sv.group_id;
  end if;
  if not public.training_private_member(g,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  if u=any(ids) or exists(select 1 from unnest(ids) r where not public.training_private_member(g,r)) then
   raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  if not flag and cardinality(ids)=0 then
   delete from public.training_private_evaluations where track_id=t;
  else
   if ev.track_id is null then
    if jsonb_typeof(p_request->'evaluation')<>'object' then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
    pkg:=public.training_private_evaluation_package(p_request->'evaluation');
    select display_name into hname from public.training_private_members where group_id=g and user_id=u;
    select display_name into lname from public.training_private_members where group_id=g and user_id=tv.layer_id;
    select name into dname from public.dogs where id=tv.dog_id;
    insert into public.training_private_evaluations(track_id,group_id,session_id,handler_id,layer_id,handler_name,layer_name,dog_name,package,shared_to_group)
     values(t,g,tv.session_id,u,tv.layer_id,coalesce(hname,''),coalesce(lname,''),coalesce(left(dname,60),''),pkg,flag);
   else
    if jsonb_typeof(p_request->'evaluation')='object' then pkg:=public.training_private_evaluation_package(p_request->'evaluation'); end if;
    update public.training_private_evaluations set shared_to_group=flag,package=coalesce(pkg,package),updated_at=clock_timestamp() where track_id=t;
   end if;
   delete from public.training_private_evaluation_grants where track_id=t and recipient_id<>all(ids);
   insert into public.training_private_evaluation_grants(track_id,recipient_id) select t,r from unnest(ids) r on conflict do nothing;
  end if;
  body:=public.training_private_evaluation_state(t,g,u,coalesce(tv.layer_id,ev.layer_id))||jsonb_build_object('searched',true);
 when 'list' then
  perform public.training_private_request(p_request,array['groupId']); g:=public.training_private_uuid(p_request,'groupId');
  if not public.training_private_member(g,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  body:=jsonb_build_object('groupId',g,'evaluations',coalesce((select jsonb_agg(public.training_private_evaluation_json(e,u,false) order by e.updated_at desc,e.track_id)
   from public.training_private_evaluations e where e.track_id in (select e1.track_id from public.training_private_evaluations e1
    where e1.group_id=g and public.training_private_evaluation_visible(e1.track_id,u) order by e1.updated_at desc limit 100)),'[]'));
 when 'fetch' then
  perform public.training_private_request(p_request,array['trackId']); t:=public.training_private_uuid(p_request,'trackId');
  select * into ev from public.training_private_evaluations where track_id=t;
  if ev.track_id is null or not public.training_private_evaluation_visible(t,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  body:=jsonb_build_object('evaluation',public.training_private_evaluation_json(ev,u,true));
 when 'set_trainer' then
  perform public.training_private_request(p_request,array['groupId','memberUserId','membershipId','trainer']);
  g:=public.training_private_uuid(p_request,'groupId'); target:=public.training_private_uuid(p_request,'memberUserId');
  ep:=public.training_private_uuid(p_request,'membershipId');
  if jsonb_typeof(p_request->'trainer')<>'boolean' then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
  perform public.training_private_lock_group(g);
  if not exists(select 1 from public.training_private_groups where id=g and owner_id=u and ended_at is null) or target=u then
   raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  update public.training_private_members set is_trainer=(p_request->>'trainer')::boolean where group_id=g and user_id=target and epoch=ep and left_at is null;
  if not found then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  body:=jsonb_build_object('group',public.training_private_group_json(g));
 when 'set_share_outside' then
  perform public.training_private_request(p_request,array['groupId','value']); g:=public.training_private_uuid(p_request,'groupId');
  if jsonb_typeof(p_request->'value')<>'boolean' then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
  perform public.training_private_lock_group(g);
  update public.training_private_groups set share_outside=(p_request->>'value')::boolean where id=g and owner_id=u and ended_at is null;
  if not found then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  body:=jsonb_build_object('group',public.training_private_group_json(g));
 else raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';
 end case;
 return jsonb_build_object('version',1,'serverNowMs',public.training_private_ms(clock_timestamp()))||body;
end $function$;

-- 8) Löschjob: zusätzlich Auswertungen 30 Tage nach dem letzten Teilen
create or replace function public.training_private_tracks_purge()
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare n integer; m integer;
begin
 delete from public.training_private_tracks t using public.training_private_sessions s
  where t.session_id=s.id and least(coalesce(s.ended_at,s.expires_at),s.expires_at)<clock_timestamp()-interval '7 days';
 get diagnostics n=row_count;
 delete from public.training_private_evaluations where updated_at<clock_timestamp()-interval '30 days';
 get diagnostics m=row_count;
 return n+m;
end $function$;

-- 9) Rechte
revoke all on function public.training_private_member_left() from public, anon, authenticated;
revoke all on function public.training_private_evaluation_package(jsonb) from public, anon, authenticated;
revoke all on function public.training_private_evaluation_visible(uuid, uuid) from public, anon, authenticated;
revoke all on function public.training_private_evaluation_json(public.training_private_evaluations, uuid, boolean) from public, anon, authenticated;
revoke all on function public.training_private_evaluation_state(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.training_private_evaluation_package(jsonb) to service_role;
grant execute on function public.training_private_evaluation_visible(uuid, uuid) to service_role;
grant execute on function public.training_private_evaluation_state(uuid, uuid, uuid, uuid) to service_role;
revoke all on function public.training_group_eval_v1(text, jsonb) from public, anon, authenticated;
grant execute on function public.training_group_eval_v1(text, jsonb) to authenticated;

reset check_function_bodies;
