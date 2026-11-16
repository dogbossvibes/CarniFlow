-- Gruppentraining Stufe 3: kantige Fläche, Mitteilungen.
--
-- Entscheidungen 16.11.2026:
--   * Die Fläche fremder Fährten ist kantig statt rund: ein nach Norden
--     ausgerichtetes Rechteck um den Verlauf, 25 m Rand, auf ein Raster von
--     0.0005° (rund 55 m) gerundet. Keine Linie, keine Winkel, keine Gegenstände.
--     Mittelpunkt/Radius bleiben für ältere App-Versionen erhalten.
--   * Mitteilungen: Beitrittsanfrage, «Fährte für dich liegt» und «Deine Fährte
--     wurde abgesucht» sind an, «Gruppentraining gestartet» ist aus; jede Art
--     einzeln abschaltbar. Texte mit Anzeigename, Gruppe und Hundename, nie Orte.
--   * Versand aus der Datenbank (Ausgang + Job jede Minute) über dieselbe
--     http-Erweiterung wie das Monitoring (Schema anyvo_monitor_http) an den
--     Expo-Push-Dienst; dafür ist keine eigene Edge Function nötig. Ohne
--     http-Erweiterung oder pg_cron bleibt der Ausgang liegen und wird nach
--     7 Tagen gelöscht.
--
-- Datenwirkung: additiv (zwei neue Tabellen, Trigger auf den Gruppentabellen).
-- Bestehende Flächen bleiben unverändert; neue Fährten bekommen die kantige Fläche.

set check_function_bodies = off;

-- 1) Kantige Fläche
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
  select a1, a2, o1, o2, (a1+a2)/2 lat, (o1+o2)/2 lng,
   sqrt(power((a2-a1)*111320/2,2) + power((o2-o1)*111320*cos(radians(((a1+a2)/2)::double precision))/2,2)) half,
   0.0005::numeric g, (0.0005/greatest(cos(radians(((a1+a2)/2)::double precision)),0.2))::numeric gl,
   (25/111320.0)::numeric pa, (25/(111320.0*greatest(cos(radians(((a1+a2)/2)::double precision)),0.2)))::numeric po
  from b
 ), r as (
  select lat, lng, half,
   round(floor((a1-pa)/g)*g,6) s, round(ceil((a2+pa)/g)*g,6) n,
   round(floor((o1-po)/gl)*gl,6) w, round(ceil((o2+po)/gl)*gl,6) e
  from c
 )
 select jsonb_build_object('centerLat',round(lat,4),'centerLng',round(lng,4),
   'radiusM',greatest(50,(ceil((half+25)/25)*25)::integer),
   'polygon',jsonb_build_array(
     jsonb_build_object('lat',s,'lng',w),jsonb_build_object('lat',s,'lng',e),
     jsonb_build_object('lat',n,'lng',e),jsonb_build_object('lat',n,'lng',w)))
 from r
$function$;

-- 2) Mitteilungen: Einstellungen und Ausgang
create table if not exists public.group_notify_settings (
  user_id uuid not null,
  join_requests boolean not null default true,
  track_ready boolean not null default true,
  track_searched boolean not null default true,
  training_started boolean not null default false,
  updated_at timestamp with time zone not null default clock_timestamp(),
  constraint group_notify_settings_pkey primary key (user_id),
  constraint group_notify_settings_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);
create table if not exists public.group_notify_outbox (
  id bigint generated always as identity,
  user_id uuid not null,
  kind text not null,
  title text not null,
  body text not null,
  data jsonb not null,
  created_at timestamp with time zone not null default clock_timestamp(),
  sent_at timestamp with time zone,
  attempts integer not null default 0,
  constraint group_notify_outbox_pkey primary key (id),
  constraint group_notify_outbox_kind_check check (kind in ('join_request','track_ready','track_searched','training_started')),
  constraint group_notify_outbox_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);
create index if not exists group_notify_outbox_due on public.group_notify_outbox using btree (created_at) where (sent_at is null);
alter table public.group_notify_settings enable row level security;
alter table public.group_notify_outbox enable row level security;
revoke all on table public.group_notify_settings, public.group_notify_outbox from public, anon, authenticated;
grant all on table public.group_notify_settings, public.group_notify_outbox to service_role;

-- Text je Sprache (profiles.locale; ohne Angabe Deutsch).
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
   else jsonb_build_object('title','Gruppetraining gstartet','body','«'||a||'» i '||b||'.') end
  when 'fr-CH' then case kind
   when 'join_request' then jsonb_build_object('title','Demande d’adhésion','body',a||' souhaite rejoindre « '||b||' ».')
   when 'track_ready' then jsonb_build_object('title','Piste pour '||a||' posée','body','Par '||b||c||'. Le temps de repos court.')
   when 'track_searched' then jsonb_build_object('title','Recherchée','body',a||' a recherché ta piste pour '||b||'.')
   else jsonb_build_object('title','Entraînement en groupe lancé','body','« '||a||' » dans '||b||'.') end
  when 'it-CH' then case kind
   when 'join_request' then jsonb_build_object('title','Richiesta di adesione','body',a||' vuole unirsi a «'||b||'».')
   when 'track_ready' then jsonb_build_object('title','Pista per '||a||' posata','body','Da '||b||c||'. Il tempo di riposo scorre.')
   when 'track_searched' then jsonb_build_object('title','Cercata','body',a||' ha cercato la tua pista per '||b||'.')
   else jsonb_build_object('title','Allenamento di gruppo avviato','body','«'||a||'» in '||b||'.') end
  else case kind
   when 'join_request' then jsonb_build_object('title','Beitrittsanfrage','body',a||' möchte «'||b||'» beitreten.')
   when 'track_ready' then jsonb_build_object('title','Fährte für '||a||' liegt','body','Von '||b||c||'. Die Liegezeit läuft.')
   when 'track_searched' then jsonb_build_object('title','Abgesucht','body',a||' hat deine Fährte für '||b||' abgesucht.')
   else jsonb_build_object('title','Gruppentraining gestartet','body','«'||a||'» in '||b||'.') end
 end
$function$;

-- Eine Mitteilung einreihen, wenn die Person sie will und niemand den anderen blockiert.
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
   when 'track_searched' then st.track_searched else st.training_started end,
   kind <> 'training_started') then return; end if;
 if not exists(select 1 from public.profiles p where p.id=recipient and p.push_token is not null) then return; end if;
 select locale into loc from public.profiles where id=recipient;
 txt:=public.group_notify_text(loc,kind,coalesce(a,'—'),coalesce(b,'—'),coalesce(c,''));
 insert into public.group_notify_outbox(user_id,kind,title,body,data)
  values(recipient,kind,left(txt->>'title',120),left(txt->>'body',240),jsonb_build_object('type','group')||payload);
end $function$;

-- 3) Auslöser
create or replace function public.group_notify_join_request()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare g public.training_private_groups; m record;
begin
 select * into g from public.training_private_groups where id=new.group_id;
 for m in select user_id from public.training_private_members where group_id=new.group_id and left_at is null and (user_id=g.owner_id or role='organizer') loop
  perform public.group_notify_enqueue(m.user_id,new.user_id,'join_request',new.display_name,g.title,null,jsonb_build_object('groupId',g.id));
 end loop;
 return null;
-- Eine Mitteilung darf nie eine Gruppenaktion verhindern.
exception when others then return null;
end $function$;

create or replace function public.group_notify_track_status()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v public.training_private_sessions; dog text; layer text; handler text;
begin
 if new.status is not distinct from old.status or new.status not in ('lying','searched') then return null; end if;
 select * into v from public.training_private_sessions where id=new.session_id;
 select d.name into dog from public.dogs d where d.id=new.dog_id;
 select display_name into layer from public.training_private_members where group_id=v.group_id and user_id=new.layer_id;
 select display_name into handler from public.training_private_members where group_id=v.group_id and user_id=new.handler_id;
 if new.status='lying' then
  perform public.group_notify_enqueue(new.handler_id,new.layer_id,'track_ready',dog,layer,case when new.blind then ' · blind' else '' end,
   jsonb_build_object('groupId',v.group_id,'sessionId',v.id,'trackId',new.id));
 else
  perform public.group_notify_enqueue(new.layer_id,new.handler_id,'track_searched',handler,dog,null,
   jsonb_build_object('groupId',v.group_id,'sessionId',v.id,'trackId',new.id));
 end if;
 return null;
-- Eine Mitteilung darf nie eine Gruppenaktion verhindern.
exception when others then return null;
end $function$;

create or replace function public.group_notify_training_started()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare g public.training_private_groups; m record;
begin
 select * into g from public.training_private_groups where id=new.group_id;
 for m in select user_id from public.training_private_members where group_id=new.group_id and left_at is null loop
  perform public.group_notify_enqueue(m.user_id,new.owner_id,'training_started',new.title,g.title,null,
   jsonb_build_object('groupId',g.id,'sessionId',new.id));
 end loop;
 return null;
-- Eine Mitteilung darf nie eine Gruppenaktion verhindern.
exception when others then return null;
end $function$;

create or replace trigger group_notify_join_request after insert on public.training_private_join_requests
  for each row execute function public.group_notify_join_request();
create or replace trigger group_notify_track_status after update of status on public.training_private_tracks
  for each row execute function public.group_notify_track_status();
create or replace trigger group_notify_training_started after insert on public.training_private_sessions
  for each row execute function public.group_notify_training_started();

-- 4) Versand: jede Minute höchstens 100 Mitteilungen an den Expo-Push-Dienst.
create or replace function public.group_notify_send()
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
 set lock_timeout to '1s'
as $function$
declare batch jsonb; ids bigint[]; response record; sent integer:=0;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('anyvo-group-notify-v1',0)) then return jsonb_build_object('skipped',true); end if;
 delete from public.group_notify_outbox where created_at<clock_timestamp()-interval '7 days' or (sent_at is null and attempts>=10);
 select array_agg(o.id), jsonb_agg(jsonb_build_object('to',p.push_token,'title',o.title,'body',o.body,'sound','default','data',o.data))
  into ids, batch
  from (select * from public.group_notify_outbox where sent_at is null order by created_at limit 100 for update skip locked) o
  join public.profiles p on p.id=o.user_id and p.push_token is not null;
 -- Ohne Token (abgemeldet): nicht weiter versuchen.
 update public.group_notify_outbox o set sent_at=clock_timestamp() where o.sent_at is null
  and not exists(select 1 from public.profiles p where p.id=o.user_id and p.push_token is not null);
 if ids is null then return jsonb_build_object('sent',0); end if;
 update public.group_notify_outbox set attempts=attempts+1 where id=any(ids);
 if to_regprocedure('anyvo_monitor_http.http_post(character varying,character varying,character varying)') is null then
  return jsonb_build_object('sent',0,'transport','missing');
 end if;
 begin
  perform anyvo_monitor_http.http_reset_curlopt();
  if not (anyvo_monitor_http.http_set_curlopt('CURLOPT_TIMEOUT_MS','8000')
   and anyvo_monitor_http.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS','3000')
   and anyvo_monitor_http.http_set_curlopt('CURLOPT_SSL_VERIFYPEER','1')
   and anyvo_monitor_http.http_set_curlopt('CURLOPT_SSL_VERIFYHOST','2')) then
   return jsonb_build_object('sent',0,'transport','configuration_failed');
  end if;
  select status into response from anyvo_monitor_http.http_post('https://exp.host/--/api/v2/push/send'::varchar, batch::text::varchar, 'application/json'::varchar);
 exception when others then
  -- Fehlertexte können Push-Tokens enthalten: nie speichern oder weitergeben.
  return jsonb_build_object('sent',0,'transport','delivery_failed');
 end;
 if response.status=200 then
  update public.group_notify_outbox set sent_at=clock_timestamp() where id=any(ids);
  sent:=array_length(ids,1);
 end if;
 return jsonb_build_object('sent',sent,'httpStatus',response.status);
end $function$;

-- 5) Einstellungen für die App
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
     where x not in ('joinRequests','trackReady','trackSearched','trainingStarted'))
     or exists(select 1 from jsonb_each(p_request) e where jsonb_typeof(e.value)<>'boolean') then
   raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
  insert into public.group_notify_settings(user_id) values(u) on conflict (user_id) do nothing;
  update public.group_notify_settings set
   join_requests=coalesce((p_request->>'joinRequests')::boolean,join_requests),
   track_ready=coalesce((p_request->>'trackReady')::boolean,track_ready),
   track_searched=coalesce((p_request->>'trackSearched')::boolean,track_searched),
   training_started=coalesce((p_request->>'trainingStarted')::boolean,training_started),
   updated_at=clock_timestamp() where user_id=u;
 elsif p_action<>'get' or p_request is distinct from '{}'::jsonb then
  raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';
 end if;
 select * into st from public.group_notify_settings where user_id=u;
 return jsonb_build_object('version',1,'serverNowMs',public.training_private_ms(clock_timestamp()),'settings',jsonb_build_object(
  'joinRequests',coalesce(st.join_requests,true),'trackReady',coalesce(st.track_ready,true),
  'trackSearched',coalesce(st.track_searched,true),'trainingStarted',coalesce(st.training_started,false)));
end $function$;

-- 6) Rechte
revoke all on function public.group_notify_text(text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.group_notify_enqueue(uuid,uuid,text,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.group_notify_join_request() from public, anon, authenticated;
revoke all on function public.group_notify_track_status() from public, anon, authenticated;
revoke all on function public.group_notify_training_started() from public, anon, authenticated;
revoke all on function public.group_notify_send() from public, anon, authenticated;
grant execute on function public.group_notify_send() to service_role;
revoke all on function public.training_group_notify_v1(text, jsonb) from public, anon, authenticated;
grant execute on function public.training_group_notify_v1(text, jsonb) to authenticated;

-- 7) Versandjob (nur mit pg_cron; bestehender Job bleibt unverändert)
do $cron$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron fehlt: Versandjob für Gruppen-Mitteilungen nicht angelegt';
    return;
  end if;
  if not exists (select 1 from cron.job where jobname = 'anyvo-group-notify-v1') then
    perform cron.schedule('anyvo-group-notify-v1', '* * * * *',
      $job$set statement_timeout='20s'; select public.group_notify_send();$job$);
  end if;
end
$cron$;

reset check_function_bodies;
