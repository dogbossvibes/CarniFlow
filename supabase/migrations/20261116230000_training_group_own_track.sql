-- Gruppentraining: eigene Fährte im Gruppentraining legen (Issue #150).
--
-- Anforderung 16.11.2026 (Sandra): Im Gruppentraining kann jede Person auch eine
-- Fährte für den eigenen angemeldeten Hund legen, damit alle auf der gemeinsamen
-- Karte sehen, wo schon gelegt ist. «Für andere legen» bleibt unverändert.
--
--   * Leger:in = Hundeführer:in ist erlaubt (Bedingung layer_id <> handler_id entfällt).
--   * Keine Übergabe an eine andere Person, nie «blind» (assign/set_blind lehnen es ab).
--   * Keine Mitteilung an sich selbst: group_notify_enqueue (Stufe 3) reiht nichts ein,
--     wenn Empfänger:in = Auslöser:in. Unverändert, in den SQL-Fällen geprüft.
--   * Fläche für alle im Training wie bei fremden Fährten; genauer Verlauf (fetch)
--     nur für die Person selbst (u in (layer_id, handler_id), unverändert).
--   * Ältere App-Versionen lehnen Zeilen mit Leger:in = Hundeführer:in ab. Darum
--     liefert «list» eigene Fährten nur, wenn die App includeOwn=true mitschickt.
--     Ältere Apps sehen diese Flächen nicht, alles andere bleibt für sie gleich.
--     Die neue App erkennt einen Server ohne diese Migration daran, dass er
--     includeOwn mit GROUP_INVALID_REQUEST ablehnt, und fragt dann ohne nach.
--
-- Datenwirkung: keine. Eine Prüfbedingung entfällt, eine Funktion wird ersetzt.
-- Keine Zeile wird geändert oder gelöscht; bestehende Fährten (Leger:in und
-- Hundeführer:in verschieden) verhalten sich wie bisher.
-- Rückweg: Bedingung lässt sich nur wieder anlegen, solange keine eigene Fährte
-- gespeichert ist (Server-Kopien werden 7 Tage nach Trainingsende gelöscht).

set check_function_bodies = off;

alter table public.training_private_tracks drop constraint if exists training_private_tracks_people_check;

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
  pkg jsonb; h text; own_too boolean := false;
begin
 if u is null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
 case p_action
 when 'list' then
  -- Eigene Fährten (Leger:in = Hundeführer:in) nur an Apps, die sie ausdrücklich verlangen:
  -- ältere App-Versionen lehnen solche Zeilen ab und würden die ganze Liste verlieren.
  if p_request ? 'includeOwn' then
   perform public.training_private_request(p_request,array['includeOwn','sessionId']);
   if p_request->'includeOwn' is distinct from 'true'::jsonb then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
   own_too:=true;
  else perform public.training_private_request(p_request,array['sessionId']); end if;
  s:=public.training_private_uuid(p_request,'sessionId');
  select * into v from public.training_private_sessions where id=s;
  if not found or not public.training_private_member(v.group_id,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  body:=jsonb_build_object('sessionId',s,'tracks',coalesce((select jsonb_agg(public.training_private_track_json(x.id,u) order by x.created_at,x.id)
   from public.training_private_tracks x where x.session_id=s and (own_too or x.layer_id<>x.handler_id)),'[]'));
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
   if not found or not public.training_private_participant(s,hpart.user_id) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
   -- Eigene Fährte (eigener angemeldeter Hund): erlaubt, aber nie «blind».
   if hpart.user_id=u and (p_request->>'blind')::boolean then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
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
