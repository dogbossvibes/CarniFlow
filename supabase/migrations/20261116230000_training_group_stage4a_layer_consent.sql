-- Gruppentraining Stufe 4a, Nachtrag (Issue #146): gelegte Linie nur mit Zustimmung der Leger:in.
--
-- Entscheidungen 16.11.2026 (Sandra):
--   * Die gelegte Linie erscheint in geteilten Auswertungen nur, wenn die Leger:in
--     für diese Gruppe zugestimmt hat (Standard: nicht gefragt = nein). Die App fragt
--     einmal bei der ersten Übergabe; jederzeit änderbar, wirkt sofort, weil beim
--     Abrufen gefiltert wird. Gilt auch für bereits geteilte Auswertungen.
--   * Ohne Zustimmung: nur Absuche und Kennzahlen. Hundeführer:in und Leger:in
--     selbst sehen die Linie weiterhin (beide kennen sie).
--   * Berührt die Fährte die Heimzone der Leger:in, markiert ihre App sie vor der
--     Übergabe; markierte Fährten sind nie als Auswertung teilbar. Der Grund wird
--     niemandem genannt.
--   * Mitteilung an die Leger:in, wenn ihre Fährte in einer Auswertung geteilt wird
--     (einzeln abschaltbar, ohne Ort).
--
-- Datenwirkung: additiv. Drei neue Spalten mit Standardwert, eine erweiterte
-- Prüfregel am Mitteilungs-Ausgang. Nichts wird gelöscht oder umgeschrieben;
-- gespeicherte Linien bleiben, werden aber nur noch mit Zustimmung ausgeliefert.

set check_function_bodies = off;

-- 1) Neue Spalten
alter table public.training_private_members add column if not exists share_laid_line boolean;
alter table public.training_private_tracks add column if not exists no_evaluation boolean not null default false;
alter table public.group_notify_settings add column if not exists evaluation_shared boolean not null default true;
alter table public.group_notify_outbox drop constraint if exists group_notify_outbox_kind_check;
alter table public.group_notify_outbox add constraint group_notify_outbox_kind_check
  check (kind in ('join_request','track_ready','track_searched','training_started','evaluation_shared'));

-- 2) Verlassen setzt auch die Zustimmung zurück (wird beim nächsten Mal neu gefragt)
create or replace function public.training_private_member_left()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
 if new.left_at is not null and old.left_at is null then new.is_trainer := false; new.share_laid_line := null; end if;
 return new;
end $function$;

-- 3) Zustimmung der Leger:in: nur als aktives Mitglied und nur bei ausdrücklichem Ja
create or replace function public.training_private_laid_consent(g uuid, layer uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
 select coalesce((select m.share_laid_line from public.training_private_members m where m.group_id=g and m.user_id=layer and m.left_at is null),false)
$function$;

-- 4) Auswertung ausliefern: gelegte Linie nur für Hundeführer:in, Leger:in oder mit Zustimmung.
--    Ohne Zustimmung fehlt das Feld «laid» ganz (ältere Apps zeigen dann eine Fehlermeldung statt einer leeren Karte).
create or replace function public.training_private_evaluation_json(e public.training_private_evaluations, u uuid, full_package boolean)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
 select jsonb_build_object('trackId',e.track_id,'groupId',e.group_id,'sessionId',e.session_id,
  'handlerUserId',e.handler_id,'handlerName',e.handler_name,'layerUserId',e.layer_id,'layerName',e.layer_name,'dogName',e.dog_name,
  'metrics',e.package->'metrics','mine',e.handler_id=u,'updatedAtMs',public.training_private_ms(e.updated_at),
  'laidShared',(u in (e.handler_id,e.layer_id) or public.training_private_laid_consent(e.group_id,e.layer_id)))
  || case when full_package then jsonb_build_object('search',e.package->'search') else '{}'::jsonb end
  || case when full_package and (u in (e.handler_id,e.layer_id) or public.training_private_laid_consent(e.group_id,e.layer_id))
     then jsonb_build_object('laid',e.package->'laid') else '{}'::jsonb end
$function$;

-- 5) Stand für die Hundeführerin: zusätzlich blocked und laidShared
create or replace function public.training_private_evaluation_state(t uuid, g uuid, u uuid, layer uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
 select jsonb_build_object('trackId',t,'groupId',g,
  'shareOutside',coalesce((select share_outside from public.training_private_groups where id=g),false),
  'blocked',coalesce((select no_evaluation from public.training_private_tracks where id=t),false),
  'laidShared',public.training_private_laid_consent(g,layer),
  'shared',exists(select 1 from public.training_private_evaluations where track_id=t),
  'group',coalesce((select shared_to_group from public.training_private_evaluations where track_id=t),false),
  'recipientUserIds',coalesce((select jsonb_agg(recipient_id order by recipient_id) from public.training_private_evaluation_grants where track_id=t),'[]'),
  'candidates',coalesce((select jsonb_agg(jsonb_build_object('userId',m.user_id,'displayName',m.display_name,
     'isTrainer',(m.user_id<>gr.owner_id and m.is_trainer),'isLayer',m.user_id=layer) order by (m.user_id=layer) desc,(m.is_trainer) desc,m.display_name,m.user_id)
   from public.training_private_members m join public.training_private_groups gr on gr.id=m.group_id
   where m.group_id=g and m.left_at is null and m.user_id<>u),'[]'))
$function$;

-- 6) Endpunkt: zusätzlich block, consent_get, consent_set; Teilen markierter Fährten abgelehnt; Mitteilung an die Leger:in
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
   if tv.status<>'searched' or tv.no_evaluation then raise exception using errcode='P0001',message='GROUP_CONFLICT'; end if;
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
    -- Leger:in erfährt, dass ihre Fährte in einer Auswertung geteilt wurde. Darf das Teilen nie verhindern.
    begin perform public.group_notify_enqueue(tv.layer_id,u,'evaluation_shared',hname,left(dname,60),null,jsonb_build_object('groupId',g));
    exception when others then null; end;
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
 when 'block' then -- Leger:in: Fährte berührt ihre Heimzone, nie als Auswertung teilbar. Nur setzen, nie zurücknehmen.
  perform public.training_private_request(p_request,array['trackId']); t:=public.training_private_uuid(p_request,'trackId');
  update public.training_private_tracks set no_evaluation=true where id=t and layer_id=u;
  if not found then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  body:=jsonb_build_object('trackId',t,'blocked',true);
 when 'consent_get' then
  perform public.training_private_request(p_request,array['groupId']); g:=public.training_private_uuid(p_request,'groupId');
  if not public.training_private_member(g,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  body:=jsonb_build_object('groupId',g,'laidLine',(select share_laid_line from public.training_private_members where group_id=g and user_id=u and left_at is null));
 when 'consent_set' then
  perform public.training_private_request(p_request,array['groupId','value']); g:=public.training_private_uuid(p_request,'groupId');
  if jsonb_typeof(p_request->'value')<>'boolean' then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
  if not public.training_private_member(g,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  update public.training_private_members set share_laid_line=(p_request->>'value')::boolean where group_id=g and user_id=u and left_at is null;
  body:=jsonb_build_object('groupId',g,'laidLine',(p_request->>'value')::boolean);
 else raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';
 end case;
 return jsonb_build_object('version',1,'serverNowMs',public.training_private_ms(clock_timestamp()))||body;
end $function$;

-- 7) Mitteilungen: neue Art «Auswertung geteilt»
create or replace function public.group_notify_text(loc text, kind text, a text, b text, c text)
 returns jsonb
 language sql
 immutable
 set search_path to ''
as $function$
 select case coalesce(loc,'de-CH')
  when 'gsw-CH' then case kind
   when 'join_request' then jsonb_build_object('title','Biitrittsaafrog','body',a||' wött «'||b||'» biiträte.')
   when 'track_ready' then jsonb_build_object('title','Fährte für '||a||' liit','body','Vo '||b||c||'. D’Liegeziit lauft.')
   when 'track_searched' then jsonb_build_object('title','Abgsuecht','body',a||' het dini Fährte für '||b||' abgsuecht.')
   when 'evaluation_shared' then jsonb_build_object('title','Uswärtig teilt','body',a||' het d’Uswärtig zu dinere Fährte für '||b||' teilt.')
   else jsonb_build_object('title','Gruppetraining gstartet','body','«'||a||'» i '||b||'.') end
  when 'fr-CH' then case kind
   when 'join_request' then jsonb_build_object('title','Demande d’adhésion','body',a||' souhaite rejoindre « '||b||' ».')
   when 'track_ready' then jsonb_build_object('title','Piste pour '||a||' posée','body','Par '||b||c||'. Le temps de repos court.')
   when 'track_searched' then jsonb_build_object('title','Recherchée','body',a||' a recherché ta piste pour '||b||'.')
   when 'evaluation_shared' then jsonb_build_object('title','Évaluation partagée','body',a||' a partagé l’évaluation de ta piste pour '||b||'.')
   else jsonb_build_object('title','Entraînement en groupe lancé','body','« '||a||' » dans '||b||'.') end
  when 'it-CH' then case kind
   when 'join_request' then jsonb_build_object('title','Richiesta di adesione','body',a||' vuole unirsi a «'||b||'».')
   when 'track_ready' then jsonb_build_object('title','Pista per '||a||' posata','body','Da '||b||c||'. Il tempo di riposo scorre.')
   when 'track_searched' then jsonb_build_object('title','Cercata','body',a||' ha cercato la tua pista per '||b||'.')
   when 'evaluation_shared' then jsonb_build_object('title','Valutazione condivisa','body',a||' ha condiviso la valutazione della tua pista per '||b||'.')
   else jsonb_build_object('title','Allenamento di gruppo avviato','body','«'||a||'» in '||b||'.') end
  else case kind
   when 'join_request' then jsonb_build_object('title','Beitrittsanfrage','body',a||' möchte «'||b||'» beitreten.')
   when 'track_ready' then jsonb_build_object('title','Fährte für '||a||' liegt','body','Von '||b||c||'. Die Liegezeit läuft.')
   when 'track_searched' then jsonb_build_object('title','Abgesucht','body',a||' hat deine Fährte für '||b||' abgesucht.')
   when 'evaluation_shared' then jsonb_build_object('title','Auswertung geteilt','body',a||' hat die Auswertung zu deiner Fährte für '||b||' geteilt.')
   else jsonb_build_object('title','Gruppentraining gestartet','body','«'||a||'» in '||b||'.') end
 end
$function$;

create or replace function public.group_notify_enqueue(recipient uuid, actor uuid, kind text, a text, b text, c text, payload jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare st public.group_notify_settings; loc text; txt jsonb;
begin
 if recipient is null or recipient = actor then return; end if;
 if actor is not null and public.contact_is_blocked(recipient, actor) then return; end if;
 select * into st from public.group_notify_settings where user_id=recipient;
 if not coalesce(case kind when 'join_request' then st.join_requests when 'track_ready' then st.track_ready
   when 'track_searched' then st.track_searched
   when 'evaluation_shared' then st.evaluation_shared else st.training_started end,
   kind <> 'training_started') then return; end if;
 if not exists(select 1 from public.profiles p where p.id=recipient and p.push_token is not null) then return; end if;
 select locale into loc from public.profiles where id=recipient;
 txt:=public.group_notify_text(loc,kind,coalesce(a,'—'),coalesce(b,'—'),coalesce(c,''));
 insert into public.group_notify_outbox(user_id,kind,title,body,data)
  values(recipient,kind,left(txt->>'title',120),left(txt->>'body',240),jsonb_build_object('type','group')||payload);
end $function$;

create or replace function public.training_group_notify_v1(p_action text, p_request jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare u uuid:=auth.uid(); st public.group_notify_settings; k text;
begin
 if u is null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
 if p_action='set' then
  if jsonb_typeof(p_request) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_request) x
     where x not in ('joinRequests','trackReady','trackSearched','trainingStarted','evaluationShared'))
     or exists(select 1 from jsonb_each(p_request) e where jsonb_typeof(e.value)<>'boolean') then
   raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
  insert into public.group_notify_settings(user_id) values(u) on conflict (user_id) do nothing;
  update public.group_notify_settings set
   join_requests=coalesce((p_request->>'joinRequests')::boolean,join_requests),
   track_ready=coalesce((p_request->>'trackReady')::boolean,track_ready),
   track_searched=coalesce((p_request->>'trackSearched')::boolean,track_searched),
   training_started=coalesce((p_request->>'trainingStarted')::boolean,training_started),
   evaluation_shared=coalesce((p_request->>'evaluationShared')::boolean,evaluation_shared),
   updated_at=clock_timestamp() where user_id=u;
 elsif p_action<>'get' or p_request is distinct from '{}'::jsonb then
  raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';
 end if;
 select * into st from public.group_notify_settings where user_id=u;
 return jsonb_build_object('version',1,'serverNowMs',public.training_private_ms(clock_timestamp()),'settings',jsonb_build_object(
  'joinRequests',coalesce(st.join_requests,true),'trackReady',coalesce(st.track_ready,true),
  'trackSearched',coalesce(st.track_searched,true),'trainingStarted',coalesce(st.training_started,false),
  'evaluationShared',coalesce(st.evaluation_shared,true)));
end $function$;

-- 8) Rechte
revoke all on function public.training_private_laid_consent(uuid, uuid) from public, anon, authenticated;
grant execute on function public.training_private_laid_consent(uuid, uuid) to service_role;

reset check_function_bodies;
