-- ============================================================================
-- 20261125200000_training_group_mantrail.sql
-- Mantrailing (Spec docs/specs/phase2/02-mantrailing.md, PR B2): Übergabe Trailer →
-- Hundeführer:in über die bestehende Gruppen-Übergabe (training_group_tracks_v1).
--
-- Rein additiv:
--   1) training_private_tracks.kind ('track' | 'mantrail'), Standard 'track'. Bestehende
--      Zeilen bekommen 'track' und verhalten sich unverändert.
--   2) training_private_track_json liefert zusätzlich 'kind'. Ältere Apps ignorieren
--      unbekannte Felder (parseGroupTrack liest nur bekannte Schlüssel).
--   3) training_group_tracks_v1: Grundlage ist die Fassung aus
--      20261116230000_training_group_own_track.sql (auf Staging am 2026-11-25 lesend
--      verglichen: identisch). Geändert sind nur
--        * 'assign' nimmt optional kind='mantrail' an,
--        * 'list' liefert Trails nur bei includeMantrail=true (ältere Apps sehen sie nicht).
--      Alle Rechte-, Besitz-, Status- und Paketprüfungen bleiben wortgleich.
--
-- Datenwirkung: keine Zeile wird geändert oder gelöscht; neue Spalte mit Standardwert.
-- Rückweg: Spalte bleibt harmlos bestehen; Funktion lässt sich durch die Fassung aus
-- 20261116230000 ersetzen (Trails erscheinen dann wie IGP-Fährten).
-- Anwendung: zuerst Staging; Production NUR mit ausdrücklicher Freigabe.
-- ============================================================================

set check_function_bodies = off;

alter table public.training_private_tracks add column if not exists kind text not null default 'track';
alter table public.training_private_tracks drop constraint if exists training_private_tracks_kind_check;
alter table public.training_private_tracks add constraint training_private_tracks_kind_check check (kind in ('track', 'mantrail'));

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
   'distanceM',case when viewer in(x.layer_id,x.handler_id) then x.distance_m else null end,
   'kind',x.kind)
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
  pkg jsonb; h text; own_too boolean := false; mantrail_too boolean := false; k text := 'track';
begin
 if u is null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
 case p_action
 when 'list' then
  -- Eigene Fährten (Leger:in = Hundeführer:in) nur an Apps, die sie ausdrücklich verlangen:
  -- ältere App-Versionen lehnen solche Zeilen ab und würden die ganze Liste verlieren.
  -- Mantrailing (Spec 02): Trails nur an Apps, die includeMantrail=true schicken (ältere Apps
  -- würden einen Trail sonst wie eine IGP-Fährte behandeln). includeMantrail nur zusammen mit includeOwn.
  if p_request ? 'includeMantrail' then
   perform public.training_private_request(p_request,array['includeMantrail','includeOwn','sessionId']);
   if p_request->'includeOwn' is distinct from 'true'::jsonb or p_request->'includeMantrail' is distinct from 'true'::jsonb then
    raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
   own_too:=true; mantrail_too:=true;
  elsif p_request ? 'includeOwn' then
   perform public.training_private_request(p_request,array['includeOwn','sessionId']);
   if p_request->'includeOwn' is distinct from 'true'::jsonb then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
   own_too:=true;
  else perform public.training_private_request(p_request,array['sessionId']); end if;
  s:=public.training_private_uuid(p_request,'sessionId');
  select * into v from public.training_private_sessions where id=s;
  if not found or not public.training_private_member(v.group_id,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  body:=jsonb_build_object('sessionId',s,'tracks',coalesce((select jsonb_agg(public.training_private_track_json(x.id,u) order by x.created_at,x.id)
   from public.training_private_tracks x where x.session_id=s and (own_too or x.layer_id<>x.handler_id)
    and (mantrail_too or x.kind='track')),'[]'));
 when 'assign' then
  -- Mantrailing (Spec 02): optional kind='mantrail'; ohne kind wie bisher eine IGP-Fährte.
  if p_request ? 'kind' then
   perform public.training_private_request(p_request,array['blind','handlerParticipationId','kind','sessionId','trackId']);
   if p_request->'kind' is distinct from '"mantrail"'::jsonb then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
   k:='mantrail';
  else perform public.training_private_request(p_request,array['sessionId','trackId','handlerParticipationId','blind']); end if;
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
   if not found or not public.training_private_participant(s,hpart.user_id) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
   -- Eigene Fährte (eigener angemeldeter Hund): erlaubt, aber nie «blind».
   if hpart.user_id=u and (p_request->>'blind')::boolean then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
   if (select count(*) from public.training_private_tracks where session_id=s)>=200
      or (select count(*) from public.training_private_tracks where session_id=s and layer_id=u and status='laying')>=3 then
    raise exception using errcode='P0001',message='GROUP_LIMIT'; end if;
   insert into public.training_private_tracks(id,session_id,layer_id,handler_id,handler_participation,dog_id,blind,request,kind)
    values(t,s,u,hpart.user_id,hp,hpart.dog_id,(p_request->>'blind')::boolean,p_request,k);
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
   if tv.layer_id=tv.handler_id and (p_request->>'blind')::boolean then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
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

-- Rechte wie bisher (create or replace lässt sie unverändert); zur Sicherheit wiederholt.
revoke all on function public.training_private_track_json(uuid, uuid) from public, anon, authenticated;
grant execute on function public.training_private_track_json(uuid, uuid) to service_role;
revoke all on function public.training_group_tracks_v1(text, jsonb) from public, anon, authenticated;
grant execute on function public.training_group_tracks_v1(text, jsonb) to authenticated;
