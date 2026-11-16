-- Gruppentraining Stufe 2b: Fährtenübergabe mit vollständigem Verlauf.
--
-- Die gelegte Fährte wird im Format der bestehenden Fährten-Übergabe
-- (features/tracking-transfer/reference.ts, TrackTransferReference) gespeichert:
-- Zeitstempel, Genauigkeit, Teilstrecken und Spezialwinkel bleiben erhalten,
-- damit die Hundeführerin daraus eine eigene, normale Fährte für ihren Hund
-- anlegen und mit der gewohnten Absuche ausarbeiten kann.
--
-- Ersetzt nur die grobe Paketprüfung und erhöht die Grösse auf 4 MB (wie die
-- Fährten-Übergabe). Fläche, Sichtbarkeit und Rechte bleiben wie in Stufe 2a.
-- Datenwirkung: keine (nur Funktionen).

set check_function_bodies = off;

create or replace function public.training_private_track_package(pkg jsonb)
 returns void
 language plpgsql
 immutable
 set search_path to ''
as $function$
begin
 if jsonb_typeof(pkg) is distinct from 'object' or octet_length(pkg::text)>4000000
    or (select coalesce(array_agg(k order by k),'{}') from jsonb_object_keys(pkg) k)
       <>array['distanceM','durationSeconds','finishedAtMs','manualAngleGeometry','markers','points','segments','startedAtMs','version']
    or pkg->'version'<>'1'::jsonb
    or jsonb_typeof(pkg->'startedAtMs') is distinct from 'number' or jsonb_typeof(pkg->'finishedAtMs') is distinct from 'number'
    or (pkg->>'finishedAtMs')::numeric<(pkg->>'startedAtMs')::numeric
    or jsonb_typeof(pkg->'points') is distinct from 'array' or jsonb_typeof(pkg->'markers') is distinct from 'array'
    or jsonb_typeof(pkg->'segments') is distinct from 'array'
    or jsonb_array_length(pkg->'points') not between 2 and 20000 or jsonb_array_length(pkg->'markers')>256
    or jsonb_array_length(pkg->'segments')>128
    or exists(select 1 from jsonb_array_elements(pkg->'points') e where jsonb_typeof(e->'lat') is distinct from 'number' or jsonb_typeof(e->'lng') is distinct from 'number'
      or (e->>'lat')::numeric not between -90 and 90 or (e->>'lng')::numeric not between -180 and 180) then
  raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';
 end if;
end $function$;

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
   if jsonb_typeof(p_request) is distinct from 'object' or octet_length(p_request::text)>4200000
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

reset check_function_bodies;
