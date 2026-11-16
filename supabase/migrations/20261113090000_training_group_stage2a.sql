-- Gruppentraining Stufe 2a: mehrere Hunde pro Person, Fährten-Zuteilung mit
-- Fläche für alle und genauem Verlauf nur für Leger:in und Hundeführer:in,
-- Liegezeit ohne Zielzeit, Löschung der Server-Kopie 7 Tage nach Ende,
-- Abo-Regel in der Gruppe.
--
-- Entscheidungen 12.11.2026 (claude/GRUPPENFAEHRTEN_KONZEPT.md und Chat):
--   * Mit mehreren eigenen Hunden beitreten (höchstens 10 je Person).
--   * Alle im Gruppentraining sehen von fremden Fährten nur eine grobe Fläche
--     (Mittelpunkt auf ~10 m gerundet, Radius in 25-m-Schritten, mind. 50 m).
--     Den genauen Verlauf liefert der Server nur an Leger:in und Hundeführer:in.
--   * «Blind absuchen» ist ein Merkmal der Fährte; die App zeigt den Verlauf
--     dann erst nach der Absuche und gibt keine Abweichungswarnungen.
--   * Liegezeit ohne Ziel: zählt ab dem Speichern (laid_at), bleibt beim Start
--     der Absuche stehen (search_started_at).
--   * Server-Kopie der Fährte wird 7 Tage nach Ende des Gruppentrainings gelöscht;
--     die importierte Kopie bei der Hundeführerin bleibt (App, Stufe 2b).
--   * Verleitungsaufgaben und Standort teilen in der Gruppe ohne ACTIVE.
--     Gruppe erstellen und Gruppentraining starten brauchen weiter ACTIVE.
--   * Gruppentraining dauert bis zu 24 Stunden (bisher höchstens 2 Stunden),
--     damit es bis Mitternacht laufen kann.
--
-- Datenwirkung: additiv. Neue Tabelle training_private_tracks. Der Eindeutig-
-- keits-Index «eine aktive Teilnahme pro Person» wird durch «eine aktive
-- Teilnahme pro Person und Hund» ersetzt (nur Index, keine Daten).
--
-- Ältere App-Versionen: Teilnehmerlisten können eine Person mehrfach enthalten
-- (je Hund). Ältere Apps zeigen dann mehrere Zeilen; sie nutzen weiter genau
-- einen Hund und brechen nicht.

set check_function_bodies = off;

-- 1) Mehrere Hunde pro Person
drop index if exists public.training_private_one_active_participant;
create unique index if not exists training_private_one_active_dog
  on public.training_private_participants using btree (session_id, user_id, dog_id) where (left_at is null);

-- 2) Fährten im Gruppentraining
create table if not exists public.training_private_tracks (
  id uuid not null,
  session_id uuid not null,
  layer_id uuid not null,
  handler_id uuid not null,
  handler_participation uuid not null,
  dog_id uuid not null,
  blind boolean not null default false,
  status text not null default 'laying',
  request jsonb not null,
  package jsonb,
  package_hash text,
  area jsonb,
  distance_m numeric,
  created_at timestamp with time zone not null default clock_timestamp(),
  laid_at timestamp with time zone,
  search_started_at timestamp with time zone,
  searched_at timestamp with time zone,
  revoked_at timestamp with time zone,
  constraint training_private_tracks_pkey primary key (id),
  constraint training_private_tracks_people_check check (layer_id <> handler_id),
  constraint training_private_tracks_status_check check (status in ('laying', 'lying', 'searching', 'searched', 'revoked')),
  constraint training_private_tracks_package_check check ((status = 'laying') or (status = 'revoked') or (package is not null and laid_at is not null and area is not null)),
  constraint training_private_tracks_session_id_fkey foreign key (session_id) references public.training_private_sessions(id) on delete cascade,
  constraint training_private_tracks_layer_id_fkey foreign key (layer_id) references auth.users(id) on delete cascade,
  constraint training_private_tracks_handler_id_fkey foreign key (handler_id) references auth.users(id) on delete cascade
);
create index if not exists training_private_tracks_session on public.training_private_tracks using btree (session_id, created_at);
alter table public.training_private_tracks enable row level security;
revoke all on table public.training_private_tracks from public, anon, authenticated;
grant all on table public.training_private_tracks to service_role;

-- 3) Angepasste bestehende Funktionen

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
  perform public.training_private_request(p_request,array['groupId','sessionId','title','ttlSeconds','dogId']);g:=public.training_private_uuid(p_request,'groupId');s:=public.training_private_uuid(p_request,'sessionId');d:=public.training_private_uuid(p_request,'dogId');ttl:=public.training_private_number(p_request,'ttlSeconds',60,86400,true);t:=public.training_private_text(p_request,'title',80);
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
   elsif part.left_at is null then
    -- Mehrere Hunde: nur diesen Hund abmelden, solange ein anderer eigener Hund dabei bleibt.
    if exists(select 1 from public.training_private_participants where session_id=s and user_id=u and left_at is null and epoch<>ep) then
     update public.training_private_participants set left_at=clock_timestamp() where epoch=ep;
     update public.training_live_grants set revoked_at=coalesce(revoked_at,clock_timestamp()) where session_id=s and owner_id=u and sender_epoch=ep;
     delete from public.training_live_last_positions p using public.training_live_grants l where p.share_id=l.id and l.session_id=s and l.owner_id=u and l.sender_epoch=ep;
     update public.training_private_tracks set status='revoked',revoked_at=clock_timestamp() where session_id=s and handler_participation=ep and status in('laying','lying');
    else perform public.training_private_invalidate(g,s,u);
    end if;
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
     -- Mehrere Hunde pro Person: je Hund höchstens eine aktive Teilnahme, höchstens 10 Hunde.
     if exists(select 1 from public.training_private_participants where session_id=s and user_id=u and dog_id=d and left_at is null) then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
     if (select count(*) from public.training_private_participants where session_id=s and user_id=u and left_at is null)>=10 then raise exception using errcode='P0001',message='GROUP_LIMIT';end if;
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

CREATE OR REPLACE FUNCTION public.training_private_invalidate(g uuid, s uuid, u uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 update public.training_private_participants p set left_at=coalesce(p.left_at,clock_timestamp()) where p.session_id in(select id from public.training_private_sessions where group_id=g and (s is null or id=s)) and (u is null or p.user_id=u);
 update public.training_live_grants l set revoked_at=coalesce(l.revoked_at,clock_timestamp()) where l.session_id in(select id from public.training_private_sessions where group_id=g and (s is null or id=s)) and (u is null or l.owner_id=u or l.recipients ? u::text);
 delete from public.training_live_last_positions p using public.training_live_grants l where p.share_id=l.id and l.revoked_at is not null and l.session_id in(select id from public.training_private_sessions where group_id=g and (s is null or id=s));
 -- Offene Fährten der betroffenen Personen enden (gelegte Kopien bei anderen bleiben).
 update public.training_private_tracks t set status='revoked',revoked_at=clock_timestamp() where t.status in('laying','lying') and t.session_id in(select id from public.training_private_sessions where group_id=g and (s is null or id=s)) and (u is null or t.layer_id=u or t.handler_id=u);
end $function$;

CREATE OR REPLACE FUNCTION public.training_group_live_v1(p_action text, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
AS $function$
declare u uuid:=auth.uid();g uuid;s uuid;sh uuid;d uuid;r uuid;ep uuid;ttl integer;seq integer;lat numeric;lng numeric;acc numeric;obs_ms numeric;obs timestamptz;at_time timestamptz;recips jsonb:='{}';normal jsonb;arr jsonb;item jsonb;body jsonb;l public.training_live_grants;
begin
 -- Abo-Regel 11.11.2026: im Gruppentraining teilen auch Teilnehmende ohne ACTIVE ihren Standort.
 case p_action
 when 'start' then perform public.training_private_request(p_request,array['sessionId','shareId','dogId','recipientUserIds','ttlSeconds']);
 when 'publish' then perform public.training_private_request(p_request,array['sessionId','shareId','sequence','latitude','longitude','accuracyM','observedAtServerMs']);
 when 'revoke' then perform public.training_private_request(p_request,array['sessionId','shareId']);
 when 'snapshot' then perform public.training_private_request(p_request,array['sessionId']);
 else raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';
 end case;
 s:=public.training_private_uuid(p_request,'sessionId');g:=public.training_private_lock_session(s);
 if p_action in('start','publish') and not exists(select 1 from public.training_live_maintenance_state where singleton and last_success_at>clock_timestamp()-interval '3 minutes' and due_remaining_lower_bound=0) then
  raise exception using errcode='P0001',message='GROUP_MAINTENANCE_UNAVAILABLE';
 end if;
 if p_action='snapshot' then
  if not public.training_private_participant(s,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
  at_time:=clock_timestamp();
  select coalesce(jsonb_agg(jsonb_build_object('shareId',v.id,'userId',v.owner_id,'sessionId',v.session_id,'dogId',v.dog_id,'latitude',p.latitude,'longitude',p.longitude,'accuracyM',p.accuracy_m,'sequence',p.sequence,'observedAtMs',public.training_private_ms(p.observed_at),'receivedAtMs',public.training_private_ms(p.received_at),'expiresAtMs',public.training_private_ms(v.expires_at)) order by v.id),'[]') into arr from public.training_live_grants v join public.training_live_last_positions p on p.share_id=v.id where v.session_id=s and v.recipients ? u::text and public.training_private_live_active(v) and p.observed_at>=at_time-interval '10 seconds' and p.observed_at<=at_time+interval '2 seconds';
  return jsonb_build_object('version',1,'serverNowMs',public.training_private_ms(clock_timestamp()),'leaseMs',5000,'positions',arr);
 end if;
 sh:=public.training_private_uuid(p_request,'shareId');
 -- Global per-share lock binds absent-row tombstones across all sessions.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('training-live-share:'||sh::text,0));
 select * into l from public.training_live_grants where id=sh for update;
 if found and (l.owner_id<>u or l.session_id<>s) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
 if p_action='revoke' then
  -- Keep historical participant proof; regular logout does not revoke a still-valid JWT.
  if not exists(select 1 from public.training_private_participants where session_id=s and user_id=u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
  if l.id is null then
   if (select count(*) from public.training_live_grants where session_id=s and owner_id=u)>=512 then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
   insert into public.training_live_grants(id,session_id,owner_id,revoked_at) values(sh,s,u,clock_timestamp());
  else update public.training_live_grants set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=sh;end if;
  delete from public.training_live_last_positions where share_id=sh;
  body:=jsonb_build_object('shareId',sh,'revoked',true);
 elsif p_action='start' then
  if not public.training_private_participant(s,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
  d:=public.training_private_uuid(p_request,'dogId');ttl:=public.training_private_number(p_request,'ttlSeconds',60,7200,true);
  select epoch into ep from public.training_private_participants where session_id=s and user_id=u and dog_id=d and left_at is null;
  if ep is null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
  perform 1 from public.dogs where id=d and owner_id=u for share;if not found then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
  arr:=p_request->'recipientUserIds';
  if jsonb_typeof(arr) is distinct from 'array' then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';end if;
  if jsonb_array_length(arr)<1 or jsonb_array_length(arr)>49 then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';end if;
  for item in select value from jsonb_array_elements(arr) loop
   r:=public.training_private_uuid(jsonb_build_object('id',item),'id');
   if r=u or recips ? r::text then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';end if;
   if not public.training_private_participant(s,r) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
   recips:=recips||jsonb_build_object(r::text,(select epoch::text from public.training_private_participants where session_id=s and user_id=r and left_at is null order by epoch limit 1));
  end loop;
  normal:=(p_request-'recipientUserIds')||jsonb_build_object('recipientUserIds',(select jsonb_agg(key order by key) from jsonb_each(recips)));
  if l.id is not null then
   if l.revoked_at is not null then raise exception using errcode='P0001',message='GROUP_REVOKED';end if;
   if l.request<>normal then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
   if not public.training_private_live_active(l) then raise exception using errcode='P0001',message='GROUP_EXPIRED';end if;
  else
   if (select count(*) from public.training_live_grants where session_id=s and owner_id=u)>=512 or exists(select 1 from public.training_live_grants v where v.session_id=s and v.owner_id=u and public.training_private_live_active(v)) then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
   at_time:=clock_timestamp();
   insert into public.training_live_grants(id,session_id,owner_id,dog_id,sender_epoch,recipients,request,started_at,expires_at) values(sh,s,u,d,ep,recips,normal,at_time,least(at_time+make_interval(secs=>ttl),(select expires_at from public.training_private_sessions where id=s))) returning * into l;
  end if;
  body:=jsonb_build_object('shareId',sh,'userId',u,'sessionId',s,'dogId',l.dog_id,'expiresAtMs',public.training_private_ms(l.expires_at),'recipientUserIds',normal->'recipientUserIds');
 else
  if l.id is null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
  if l.revoked_at is not null then raise exception using errcode='P0001',message='GROUP_REVOKED';end if;
  if not public.training_private_live_active(l) then raise exception using errcode='P0001',message='GROUP_EXPIRED';end if;
  seq:=public.training_private_number(p_request,'sequence',1,2147483647,true);lat:=public.training_private_number(p_request,'latitude',-90,90,false);lng:=public.training_private_number(p_request,'longitude',-180,180,false);acc:=public.training_private_number(p_request,'accuracyM',0,10000,false);obs_ms:=public.training_private_number(p_request,'observedAtServerMs',0,8640000000000000,true);obs:=to_timestamp((obs_ms/1000)::double precision);
  if seq<=l.last_sequence then
   if seq<>l.last_sequence or l.last_payload_hash is distinct from sha256(convert_to(p_request::text,'UTF8')) then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
   -- Idempotent delivery ACK never refreshes stale position/receive time.
   body:=jsonb_build_object('shareId',sh,'sequence',seq,'accepted',false,'expiresAtMs',public.training_private_ms(l.expires_at));
  else
   at_time:=clock_timestamp();
   if obs_ms<public.training_private_ms(l.started_at) or obs<at_time-interval '10 seconds' or obs>at_time+interval '2 seconds' then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';end if;
   if l.last_sequence>0 and (at_time-l.last_received_at<interval '5 seconds' or obs<l.last_observed_at) then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
   update public.training_live_grants set last_sequence=seq,last_payload_hash=sha256(convert_to(p_request::text,'UTF8')),last_observed_at=obs,last_received_at=at_time where id=sh;
   insert into public.training_live_last_positions(share_id,sequence,latitude,longitude,accuracy_m,observed_at,received_at,purge_after,request) values(sh,seq,lat,lng,acc,obs,at_time,least(at_time+interval '60 seconds',l.expires_at,(select expires_at from public.training_private_sessions where id=s)),p_request) on conflict(share_id) do update set sequence=excluded.sequence,latitude=excluded.latitude,longitude=excluded.longitude,accuracy_m=excluded.accuracy_m,observed_at=excluded.observed_at,received_at=excluded.received_at,purge_after=excluded.purge_after,request=excluded.request;
   body:=jsonb_build_object('shareId',sh,'sequence',seq,'accepted',true,'expiresAtMs',public.training_private_ms(l.expires_at));
  end if;
 end if;
 return jsonb_build_object('version',1,'serverNowMs',public.training_private_ms(clock_timestamp()))||body;
end $function$;

CREATE OR REPLACE FUNCTION public.training_group_distraction_v1(p_action text, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
 SET statement_timeout TO '15s'
AS $function$
declare u uuid:=auth.uid();g uuid;task_key uuid;rec uuid;ce uuid;re uuid;t public.group_distraction_tasks;s public.group_distraction_submissions;v jsonb;body jsonb;ttl integer;tm timestamptz;sid uuid;h text;begin
 if u is null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
 if p_request is null or octet_length(p_request::text)>5000000 then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';end if;
 case p_action
 when 'prepare' then perform public.gd_keys(p_request,array['sourceTrainingId']);
 when 'create' then perform public.gd_keys(p_request,array['taskId','groupId','sourceTrainingId','sourceRevision','referenceDigest','recipientUserId','ttlSeconds']);
 when 'list' then perform public.gd_keys(p_request,array['groupId']);
 when 'get','accept','revoke' then perform public.gd_keys(p_request,array['taskId']);
 when 'submit' then perform public.gd_keys(p_request,array['taskId','submissionId','referenceDigest','contribution']);
 when 'review' then perform public.gd_keys(p_request,array['taskId','submissionId','decision']);
 else raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';end case;
 -- Abo-Regel 12.11.2026: Verleitungsaufgaben in der Gruppe auch ohne ACTIVE.
 if p_action='prepare' then body:=public.gd_source(public.gd_uuid(p_request->'sourceTrainingId'));
 else
  if p_action='create' then perform pg_advisory_xact_lock(hashtextextended(u::text,421));end if;
  if p_action in('create','list') then g:=public.gd_uuid(p_request->'groupId');
  else task_key:=public.gd_uuid(p_request->'taskId');select group_id into g from public.group_distraction_tasks where group_distraction_tasks.id=task_key;end if;
  perform public.training_private_lock_group(g);
  if not public.training_private_member(g,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
  if p_action='list' then
   select jsonb_build_object('tasks',coalesce(jsonb_agg(public.gd_meta(x) order by x.created_at,x.id),'[]'::jsonb)) into body from public.group_distraction_tasks x where x.group_id=g and public.gd_access(x,u);
  else
   if p_action='create' then
    task_key:=public.gd_uuid(p_request->'taskId');rec:=public.gd_uuid(p_request->'recipientUserId');
    if rec=u or not public.training_private_member(g,rec) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
    ttl:=public.gd_num(p_request->'ttlSeconds',60,604800,true);
   end if;
   select * into t from public.group_distraction_tasks x where x.id=task_key for update;
   if p_action='create' and not found then
    if (select count(*) from public.group_distraction_tasks where creator_id=u)>=500 or (select count(*) from public.group_distraction_tasks where group_id=g)>=1000 then raise exception using errcode='P0001',message='GROUP_LIMIT';end if;
    v:=public.gd_source(public.gd_uuid(p_request->'sourceTrainingId'));
    if p_request->'sourceRevision' is distinct from v->'sourceRevision' or p_request->'referenceDigest' is distinct from v->'referenceDigest' then raise exception using errcode='P0001',message='GROUP_REFERENCE_CHANGED';end if;
    select epoch into ce from public.training_private_members where group_id=g and user_id=u;
    select epoch into re from public.training_private_members where group_id=g and user_id=rec;tm:=clock_timestamp();
    insert into public.group_distraction_tasks(id,group_id,creator_id,recipient_id,creator_epoch,recipient_epoch,source_id,source_revision,reference_digest,request,reference,created_at,expires_at,purge_at)
    values(task_key,g,u,rec,ce,re,public.gd_uuid(p_request->'sourceTrainingId'),v->>'sourceRevision',v->>'referenceDigest',p_request,v->'reference',tm,tm+ttl*interval '1 second',tm+interval '30 days') returning * into t;
   end if;
   if t.id is null or t.group_id<>g or not public.gd_access(t,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
   if p_action='create' then
    if t.creator_id<>u then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
    if t.request<>p_request then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
   elsif p_action='accept' then
    if t.recipient_id<>u then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
    update public.group_distraction_tasks set accepted_at=coalesce(accepted_at,clock_timestamp()) where group_distraction_tasks.id=task_key returning * into t;
   elsif p_action='submit' then
    if t.recipient_id<>u or t.accepted_at is null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
    if p_request->'referenceDigest' is distinct from to_jsonb(t.reference_digest) then raise exception using errcode='P0001',message='GROUP_REFERENCE_CHANGED';end if;
    sid:=public.gd_uuid(p_request->'submissionId');perform public.gd_contribution(p_request->'contribution',task_key);h:=public.gd_hash(p_request->'contribution');
    select * into s from public.group_distraction_submissions where group_distraction_submissions.id=sid;
    if found then
     if s.task_id<>task_key or s.author_id<>u or s.digest<>h or s.payload is distinct from p_request->'contribution' then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
    else
     if (select count(*) from public.group_distraction_submissions where task_id=task_key)>=32 then raise exception using errcode='P0001',message='GROUP_LIMIT';end if;
     insert into public.group_distraction_submissions(id,task_id,author_id,digest,payload) values(sid,task_key,u,h,p_request->'contribution');
    end if;
   elsif p_action='review' then
    if t.creator_id<>u then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
    sid:=public.gd_uuid(p_request->'submissionId');
    if p_request->>'decision' not in('accepted','changes_requested') or jsonb_typeof(p_request->'decision') is distinct from 'string' then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';end if;
    select * into s from public.group_distraction_submissions where group_distraction_submissions.id=sid and task_id=task_key;
    if not found then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
    if s.decision is not null and s.decision<>p_request->>'decision' then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
    update public.group_distraction_submissions set decision=p_request->>'decision',reviewed_at=coalesce(reviewed_at,clock_timestamp()) where group_distraction_submissions.id=sid;
   elsif p_action='revoke' then
    if t.creator_id<>u then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
    update public.group_distraction_tasks set revoked_at=clock_timestamp() where group_distraction_tasks.id=task_key;
    return jsonb_build_object('version',1,'serverNowMs',public.training_private_ms(clock_timestamp()),'taskId',task_key,'revoked',true);
   end if;
   body:=jsonb_build_object('task',public.gd_meta(t),'reference',case when u=t.creator_id or t.accepted_at is not null then t.reference else null end,
    'submissions',case when t.accepted_at is null then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('submissionId',x.id,'authorUserId',x.author_id,'contribution',x.payload,'decision',x.decision,'createdAtMs',public.training_private_ms(x.created_at),'reviewedAtMs',case when x.reviewed_at is null then null else public.training_private_ms(x.reviewed_at) end) order by x.created_at,x.id),'[]'::jsonb) from public.group_distraction_submissions x where x.task_id=task_key) end);
  end if;
 end if;
 return jsonb_build_object('version',1,'serverNowMs',public.training_private_ms(clock_timestamp()))||body;
exception when unique_violation then raise exception using errcode='P0001',message='GROUP_CONFLICT';
end$function$;

-- 4) Fährten: Fläche aus dem Verlauf (grob, ohne Linie, Winkel und Gegenstände)
create or replace function public.training_private_track_area(pkg jsonb)
 returns jsonb
 language sql
 immutable
 set search_path to ''
as $function$
 with b as (
  select min((e->>'lat')::numeric) a1, max((e->>'lat')::numeric) a2, min((e->>'lng')::numeric) o1, max((e->>'lng')::numeric) o2
  from jsonb_array_elements(pkg->'points') e
 ), c as (
  select (a1+a2)/2 lat, (o1+o2)/2 lng,
   sqrt(power((a2-a1)*111320/2,2) + power((o2-o1)*111320*cos(radians(((a1+a2)/2)::double precision))/2,2)) half from b
 )
 select jsonb_build_object('centerLat',round(lat,4),'centerLng',round(lng,4),
   'radiusM',greatest(50,(ceil((half+25)/25)*25)::integer)) from c
$function$;

-- Paket wie .anyvo-track (features/tracking-exchange/contract.ts): grobe Prüfung auf dem
-- Server, die vollständige Prüfung macht die App beim Laden (parseReference).
create or replace function public.training_private_track_package(pkg jsonb)
 returns void
 language plpgsql
 immutable
 set search_path to ''
as $function$
begin
 if jsonb_typeof(pkg) is distinct from 'object' or octet_length(pkg::text)>3000000
    or (select coalesce(array_agg(k order by k),'{}') from jsonb_object_keys(pkg) k)<>array['date','distanceM','markers','points','version']
    or pkg->'version'<>'1'::jsonb or jsonb_typeof(pkg->'points') is distinct from 'array' or jsonb_typeof(pkg->'markers') is distinct from 'array'
    or jsonb_array_length(pkg->'points') not between 2 and 20000 or jsonb_array_length(pkg->'markers')>256
    or exists(select 1 from jsonb_array_elements(pkg->'points') e where jsonb_typeof(e->'lat') is distinct from 'number' or jsonb_typeof(e->'lng') is distinct from 'number'
      or (e->>'lat')::numeric not between -90 and 90 or (e->>'lng')::numeric not between -180 and 180) then
  raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';
 end if;
end $function$;

create or replace function public.training_private_track_json(t uuid, viewer uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
 select jsonb_build_object('trackId',x.id,'sessionId',x.session_id,'layerUserId',x.layer_id,'handlerUserId',x.handler_id,
   'handlerParticipationId',x.handler_participation,'dogId',x.dog_id,'blind',x.blind,'status',x.status,
   'createdAtMs',public.training_private_ms(x.created_at),
   'laidAtMs',case when x.laid_at is null then null else public.training_private_ms(x.laid_at) end,
   'searchStartedAtMs',case when x.search_started_at is null then null else public.training_private_ms(x.search_started_at) end,
   'searchedAtMs',case when x.searched_at is null then null else public.training_private_ms(x.searched_at) end,
   'area',case when x.status in('lying','searching','searched') then x.area else null end,
   'distanceM',case when viewer in(x.layer_id,x.handler_id) then x.distance_m else null end)
 from public.training_private_tracks x where x.id=t
$function$;

create or replace function public.training_group_tracks_v1(p_action text, p_request jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
 set lock_timeout to '3s'
as $function$
declare
  u uuid := auth.uid(); s uuid; t uuid; g uuid; hp uuid; b boolean; body jsonb;
  v public.training_private_sessions; tv public.training_private_tracks; hpart public.training_private_participants;
  pkg jsonb; h text;
begin
 if u is null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
 case p_action
 when 'list' then
  perform public.training_private_request(p_request,array['sessionId']); s:=public.training_private_uuid(p_request,'sessionId');
  select * into v from public.training_private_sessions where id=s;
  if not found or not public.training_private_member(v.group_id,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  body:=jsonb_build_object('sessionId',s,'tracks',coalesce((select jsonb_agg(public.training_private_track_json(x.id,u) order by x.created_at,x.id)
   from public.training_private_tracks x where x.session_id=s),'[]'));
 when 'assign' then
  perform public.training_private_request(p_request,array['sessionId','trackId','handlerParticipationId','blind']);
  s:=public.training_private_uuid(p_request,'sessionId'); t:=public.training_private_uuid(p_request,'trackId');
  hp:=public.training_private_uuid(p_request,'handlerParticipationId');
  if jsonb_typeof(p_request->'blind') is distinct from 'boolean' then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
  g:=public.training_private_lock_session(s); select * into v from public.training_private_sessions where id=s;
  select * into tv from public.training_private_tracks where id=t for update;
  if found then -- gleiche Anfrage erneut gesendet
   if tv.layer_id<>u or tv.session_id<>s then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
   if tv.request<>p_request then raise exception using errcode='P0001',message='GROUP_CONFLICT'; end if;
  else
   if not public.training_private_participant(s,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
   select * into hpart from public.training_private_participants where epoch=hp and session_id=s and left_at is null;
   if not found or hpart.user_id=u or not public.training_private_participant(s,hpart.user_id) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
   if (select count(*) from public.training_private_tracks where session_id=s)>=200
      or (select count(*) from public.training_private_tracks where session_id=s and layer_id=u and status='laying')>=3 then
    raise exception using errcode='P0001',message='GROUP_LIMIT'; end if;
   insert into public.training_private_tracks(id,session_id,layer_id,handler_id,handler_participation,dog_id,blind,request)
    values(t,s,u,hpart.user_id,hp,hpart.dog_id,(p_request->>'blind')::boolean,p_request);
  end if;
  body:=jsonb_build_object('track',public.training_private_track_json(t,u));
 when 'set_blind','cancel','submit' then
  if p_action='set_blind' then perform public.training_private_request(p_request,array['trackId','blind']);
  elsif p_action='cancel' then perform public.training_private_request(p_request,array['trackId']);
  else
   -- Paket ist grösser als training_private_request erlaubt: Schlüssel hier prüfen.
   if jsonb_typeof(p_request) is distinct from 'object' or octet_length(p_request::text)>3100000
      or (select coalesce(array_agg(k order by k),'{}') from jsonb_object_keys(p_request) k)<>array['package','trackId'] then
    raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
  end if;
  t:=public.training_private_uuid(p_request,'trackId');
  select session_id into s from public.training_private_tracks where id=t and layer_id=u;
  if s is null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  perform public.training_private_lock_session(s);
  select * into tv from public.training_private_tracks where id=t for update;
  if p_action='set_blind' then
   if jsonb_typeof(p_request->'blind') is distinct from 'boolean' then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
   if tv.status not in('laying','lying') then raise exception using errcode='P0001',message='GROUP_CONFLICT'; end if;
   update public.training_private_tracks set blind=(p_request->>'blind')::boolean where id=t;
  elsif p_action='cancel' then
   if tv.status in('searching','searched') then raise exception using errcode='P0001',message='GROUP_CONFLICT'; end if;
   update public.training_private_tracks set status='revoked',revoked_at=coalesce(revoked_at,clock_timestamp()) where id=t;
  else
   pkg:=p_request->'package'; perform public.training_private_track_package(pkg);
   h:=encode(sha256(convert_to(pkg::text,'UTF8')),'hex');
   if tv.status='laying' then
    if not public.training_private_participant(s,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
    update public.training_private_tracks set status='lying',package=pkg,package_hash=h,area=public.training_private_track_area(pkg),
     distance_m=case when jsonb_typeof(pkg->'distanceM')='number' then (pkg->>'distanceM')::numeric end,laid_at=clock_timestamp() where id=t;
   elsif tv.status='revoked' then raise exception using errcode='P0001',message='GROUP_REVOKED';
   elsif tv.package_hash is distinct from h then raise exception using errcode='P0001',message='GROUP_CONFLICT';
   end if;
  end if;
  body:=jsonb_build_object('track',public.training_private_track_json(t,u));
 when 'fetch' then
  perform public.training_private_request(p_request,array['trackId']); t:=public.training_private_uuid(p_request,'trackId');
  select * into tv from public.training_private_tracks where id=t;
  if not found or u not in(tv.layer_id,tv.handler_id) or tv.status not in('lying','searching','searched') then
   raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  select * into v from public.training_private_sessions where id=tv.session_id;
  if not public.training_private_member(v.group_id,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  body:=jsonb_build_object('track',public.training_private_track_json(t,u),'package',tv.package);
 when 'search_start','searched' then
  perform public.training_private_request(p_request,array['trackId']); t:=public.training_private_uuid(p_request,'trackId');
  select session_id into s from public.training_private_tracks where id=t and handler_id=u;
  if s is null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  perform public.training_private_lock_session(s);
  select * into tv from public.training_private_tracks where id=t for update;
  select * into v from public.training_private_sessions where id=s;
  if not public.training_private_member(v.group_id,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  if p_action='search_start' then
   if tv.status='lying' then update public.training_private_tracks set status='searching',search_started_at=clock_timestamp() where id=t;
   elsif tv.status<>'searching' then raise exception using errcode='P0001',message=case when tv.status='revoked' then 'GROUP_REVOKED' else 'GROUP_CONFLICT' end;
   end if;
  else
   if tv.status='searching' then update public.training_private_tracks set status='searched',searched_at=clock_timestamp() where id=t;
   elsif tv.status<>'searched' then raise exception using errcode='P0001',message=case when tv.status='revoked' then 'GROUP_REVOKED' else 'GROUP_CONFLICT' end;
   end if;
  end if;
  body:=jsonb_build_object('track',public.training_private_track_json(t,u));
 else raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';
 end case;
 return jsonb_build_object('version',1,'serverNowMs',public.training_private_ms(clock_timestamp()))||body;
end $function$;

-- 5) Server-Kopie 7 Tage nach Ende des Gruppentrainings löschen
create or replace function public.training_private_tracks_purge()
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare n integer;
begin
 delete from public.training_private_tracks t using public.training_private_sessions s
  where t.session_id=s.id and least(coalesce(s.ended_at,s.expires_at),s.expires_at)<clock_timestamp()-interval '7 days';
 get diagnostics n=row_count;
 return n;
end $function$;

-- 6) Rechte
revoke all on function public.training_private_track_area(jsonb) from public, anon, authenticated;
grant execute on function public.training_private_track_area(jsonb) to service_role;
revoke all on function public.training_private_track_package(jsonb) from public, anon, authenticated;
grant execute on function public.training_private_track_package(jsonb) to service_role;
revoke all on function public.training_private_track_json(uuid, uuid) from public, anon, authenticated;
grant execute on function public.training_private_track_json(uuid, uuid) to service_role;
revoke all on function public.training_private_tracks_purge() from public, anon, authenticated;
grant execute on function public.training_private_tracks_purge() to service_role;
revoke all on function public.training_group_tracks_v1(text, jsonb) from public, anon, authenticated;
grant execute on function public.training_group_tracks_v1(text, jsonb) to authenticated;

-- 7) Löschjob stündlich (nur mit pg_cron; bestehender Job bleibt unverändert)
do $cron$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron fehlt: Löschjob für Gruppenfährten nicht angelegt';
    return;
  end if;
  if not exists (select 1 from cron.job where jobname = 'anyvo-training-tracks-purge-v1') then
    perform cron.schedule('anyvo-training-tracks-purge-v1', '17 * * * *',
      $job$set statement_timeout='30s'; select public.training_private_tracks_purge();$job$);
  end if;
end
$cron$;

reset check_function_bodies;
