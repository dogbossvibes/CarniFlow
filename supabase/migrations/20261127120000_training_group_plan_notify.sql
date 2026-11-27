-- ============================================================================
-- 20261127120000_training_group_plan_notify.sql
-- Vereinsmodus (Spec docs/specs/phase2/04-vereinsmodus.md, PR D): Mitteilungen
-- «Neuer Trainingstag», «Trainingstag geändert», «Du bist dran mit Legen» über den
-- bestehenden Gruppen-Versand (Stufe 3: Ausgang group_notify_outbox, Job jede Minute).
--
-- Rein additiv:
--   * group_notify_outbox.kind erlaubt zusätzlich plan_published, plan_changed, plan_lay_turn.
--   * group_notify_settings.plans (Standard an) – ein Schalter für alle drei.
--   * group_notify_text, group_notify_enqueue, training_group_notify_v1: Grundlage ist die
--     Fassung aus 20261116170000_training_group_stage3.sql (auf Staging am 2026-11-27 lesend
--     verglichen: identisch). Ergänzt sind nur die drei neuen Arten bzw. der Schalter «plans».
--     Ältere Apps lesen nur bekannte Einstellungen und ignorieren «plans».
--   * Auslöser auf training_private_plans, training_private_plan_entries und
--     training_private_tracks. Wie alle Gruppen-Mitteilungen: nie an sich selbst, nie bei
--     Blockierung, nur mit Push-Token, Texte ohne Orte (der Treffpunkt steht nie in der
--     Mitteilung), und eine Mitteilung verhindert nie eine Planänderung.
--
-- Wann:
--   * plan_published: Plan wird veröffentlicht → alle Mitglieder der Gruppe.
--   * plan_changed: veröffentlichter/laufender Plan – Titel/Zeit geändert oder abgesagt →
--     alle, die in der Startliste stehen; neu eingetragene Person → diese Person.
--   * plan_lay_turn: Tag gestartet → Leger:in der ersten offenen Zeile; Fährte einer Zeile
--     liegt → Leger:in der nächsten offenen Zeile (nach Position).
--
-- Datenwirkung: keine Zeile wird geändert oder gelöscht; neue Spalte mit Standardwert.
-- Anwendung: zuerst Staging; Production NUR mit ausdrücklicher Freigabe.
-- ============================================================================

set check_function_bodies = off;

do $c$
declare r record;
begin
  for r in select c.conname from pg_constraint c where c.conrelid='public.group_notify_outbox'::regclass and c.contype='c'
             and pg_get_constraintdef(c.oid) ilike '%kind%' loop
    execute format('alter table public.group_notify_outbox drop constraint %I', r.conname);
  end loop;
end $c$;
alter table public.group_notify_outbox add constraint group_notify_outbox_kind_check
  check (kind in ('join_request','track_ready','track_searched','training_started','plan_published','plan_changed','plan_lay_turn'));
alter table public.group_notify_settings add column if not exists plans boolean not null default true;

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
   when 'plan_published' then jsonb_build_object('title','Neue Trainingstag','body','«'||a||'» am '||b||'. Säg zue und wähl din Hund.')
   when 'plan_changed' then jsonb_build_object('title','Trainingstag gänderet','body','«'||a||'» ('||b||') isch gänderet worde.')
   when 'plan_lay_turn' then jsonb_build_object('title','Du bisch dra mit Lege','body','Fährte für '||a||' lege («'||b||'»).')
   else jsonb_build_object('title','Gruppetraining gstartet','body','«'||a||'» i '||b||'.') end
  when 'fr-CH' then case kind
   when 'join_request' then jsonb_build_object('title','Demande d’adhésion','body',a||' souhaite rejoindre « '||b||' ».')
   when 'track_ready' then jsonb_build_object('title','Piste pour '||a||' posée','body','Par '||b||c||'. Le temps de repos court.')
   when 'track_searched' then jsonb_build_object('title','Recherchée','body',a||' a recherché ta piste pour '||b||'.')
   when 'plan_published' then jsonb_build_object('title','Nouvelle journée d’entraînement','body','« '||a||' » le '||b||'. Inscris-toi et choisis ton chien.')
   when 'plan_changed' then jsonb_build_object('title','Journée modifiée','body','« '||a||' » ('||b||') a été modifiée.')
   when 'plan_lay_turn' then jsonb_build_object('title','À toi de poser','body','Pose la piste pour '||a||' (« '||b||' »).')
   else jsonb_build_object('title','Entraînement en groupe lancé','body','« '||a||' » dans '||b||'.') end
  when 'it-CH' then case kind
   when 'join_request' then jsonb_build_object('title','Richiesta di adesione','body',a||' vuole unirsi a «'||b||'».')
   when 'track_ready' then jsonb_build_object('title','Pista per '||a||' posata','body','Da '||b||c||'. Il tempo di riposo scorre.')
   when 'track_searched' then jsonb_build_object('title','Cercata','body',a||' ha cercato la tua pista per '||b||'.')
   when 'plan_published' then jsonb_build_object('title','Nuova giornata di allenamento','body','«'||a||'» il '||b||'. Conferma e scegli il tuo cane.')
   when 'plan_changed' then jsonb_build_object('title','Giornata modificata','body','«'||a||'» ('||b||') è stata modificata.')
   when 'plan_lay_turn' then jsonb_build_object('title','Tocca a te posare','body','Posa la traccia per '||a||' («'||b||'»).')
   else jsonb_build_object('title','Allenamento di gruppo avviato','body','«'||a||'» in '||b||'.') end
  else case kind
   when 'join_request' then jsonb_build_object('title','Beitrittsanfrage','body',a||' möchte «'||b||'» beitreten.')
   when 'track_ready' then jsonb_build_object('title','Fährte für '||a||' liegt','body','Von '||b||c||'. Die Liegezeit läuft.')
   when 'track_searched' then jsonb_build_object('title','Abgesucht','body',a||' hat deine Fährte für '||b||' abgesucht.')
   when 'plan_published' then jsonb_build_object('title','Neuer Trainingstag','body','«'||a||'» am '||b||'. Sag zu und wähle deinen Hund.')
   when 'plan_changed' then jsonb_build_object('title','Trainingstag geändert','body','«'||a||'» ('||b||') wurde geändert.')
   when 'plan_lay_turn' then jsonb_build_object('title','Du bist dran mit Legen','body','Fährte für '||a||' legen («'||b||'»).')
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
   when 'plan_published' then st.plans when 'plan_changed' then st.plans when 'plan_lay_turn' then st.plans
   else st.training_started end,
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
     where x not in ('joinRequests','trackReady','trackSearched','trainingStarted','plans'))
     or exists(select 1 from jsonb_each(p_request) e where jsonb_typeof(e.value)<>'boolean') then
   raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
  insert into public.group_notify_settings(user_id) values(u) on conflict (user_id) do nothing;
  update public.group_notify_settings set
   join_requests=coalesce((p_request->>'joinRequests')::boolean,join_requests),
   track_ready=coalesce((p_request->>'trackReady')::boolean,track_ready),
   track_searched=coalesce((p_request->>'trackSearched')::boolean,track_searched),
   training_started=coalesce((p_request->>'trainingStarted')::boolean,training_started),
   plans=coalesce((p_request->>'plans')::boolean,plans),
   updated_at=clock_timestamp() where user_id=u;
 elsif p_action<>'get' or p_request is distinct from '{}'::jsonb then
  raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';
 end if;
 select * into st from public.group_notify_settings where user_id=u;
 return jsonb_build_object('version',1,'serverNowMs',public.training_private_ms(clock_timestamp()),'settings',jsonb_build_object(
  'joinRequests',coalesce(st.join_requests,true),'trackReady',coalesce(st.track_ready,true),
  'trackSearched',coalesce(st.track_searched,true),'trainingStarted',coalesce(st.training_started,false),
  'plans',coalesce(st.plans,true)));
end $function$;

-- Leger:in der nächsten offenen Zeile (nach Position) benachrichtigen.
create or replace function public.group_notify_plan_next_layer(p uuid, after_position integer, actor uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v public.training_private_plans; e public.training_private_plan_entries; handler text;
begin
 select * into v from public.training_private_plans where id=p;
 if not found or v.status<>'started' then return; end if;
 select * into e from public.training_private_plan_entries
  where plan_id=p and removed_at is null and track_id is null and layer_id is not null and handler_response<>'no' and position>after_position
  order by position, id limit 1;
 if not found or not public.training_private_member(v.group_id, e.layer_id) then return; end if;
 select display_name into handler from public.training_private_members where group_id=v.group_id and user_id=e.handler_id and left_at is null;
 perform public.group_notify_enqueue(e.layer_id, actor, 'plan_lay_turn', handler, v.title, null,
  jsonb_build_object('groupId', v.group_id, 'planId', v.id));
end $function$;

create or replace function public.group_notify_plan_status()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare m record; day text; actor uuid := auth.uid();
begin
 day := to_char(new.starts_at at time zone 'Europe/Zurich', 'DD.MM. HH24:MI');
 if new.status='published' and old.status='draft' then
  for m in select user_id from public.training_private_members where group_id=new.group_id and left_at is null loop
   perform public.group_notify_enqueue(m.user_id, actor, 'plan_published', new.title, day, null,
    jsonb_build_object('groupId', new.group_id, 'planId', new.id));
  end loop;
 elsif old.status in ('published','started') and (new.status='cancelled' or new.title<>old.title or new.starts_at<>old.starts_at) then
  for m in select distinct x.u from (
      select handler_id u from public.training_private_plan_entries where plan_id=new.id and removed_at is null
      union select layer_id from public.training_private_plan_entries where plan_id=new.id and removed_at is null and layer_id is not null) x
      join public.training_private_members tm on tm.group_id=new.group_id and tm.user_id=x.u and tm.left_at is null loop
   perform public.group_notify_enqueue(m.u, actor, 'plan_changed', new.title, day, null,
    jsonb_build_object('groupId', new.group_id, 'planId', new.id));
  end loop;
 end if;
 if new.status='started' and old.status='published' then
  perform public.group_notify_plan_next_layer(new.id, 0, actor);
 end if;
 return null;
-- Eine Mitteilung darf nie eine Planänderung verhindern.
exception when others then return null;
end $function$;

create or replace function public.group_notify_plan_entry()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v public.training_private_plans; day text; actor uuid := auth.uid(); x uuid;
begin
 select * into v from public.training_private_plans where id=new.plan_id;
 if not found or v.status not in ('published','started') or new.removed_at is not null then return null; end if;
 day := to_char(v.starts_at at time zone 'Europe/Zurich', 'DD.MM. HH24:MI');
 foreach x in array array_remove(array[
     case when tg_op='INSERT' or new.handler_id is distinct from old.handler_id then new.handler_id end,
     case when new.layer_id is not null and (tg_op='INSERT' or new.layer_id is distinct from old.layer_id) then new.layer_id end]::uuid[], null) loop
  perform public.group_notify_enqueue(x, actor, 'plan_changed', v.title, day, null,
   jsonb_build_object('groupId', v.group_id, 'planId', v.id));
 end loop;
 return null;
exception when others then return null;
end $function$;

-- Fährte einer Planzeile liegt → die nächste Leger:in ist dran.
create or replace function public.group_notify_plan_track_lying()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare e public.training_private_plan_entries;
begin
 if new.status is not distinct from old.status or new.status<>'lying' then return null; end if;
 for e in select * from public.training_private_plan_entries where track_id=new.id and removed_at is null loop
  perform public.group_notify_plan_next_layer(e.plan_id, e.position, new.layer_id);
 end loop;
 return null;
exception when others then return null;
end $function$;

create or replace trigger group_notify_plan_status after update of status, title, starts_at on public.training_private_plans
  for each row execute function public.group_notify_plan_status();
create or replace trigger group_notify_plan_entry after insert or update of handler_id, layer_id on public.training_private_plan_entries
  for each row execute function public.group_notify_plan_entry();
create or replace trigger group_notify_plan_track_lying after update of status on public.training_private_tracks
  for each row execute function public.group_notify_plan_track_lying();

reset check_function_bodies;

-- Rechte: alles intern; die Einstellungen bleiben nur für angemeldete Personen.
revoke all on function public.group_notify_text(text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.group_notify_enqueue(uuid,uuid,text,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.group_notify_plan_next_layer(uuid,integer,uuid) from public, anon, authenticated;
revoke all on function public.group_notify_plan_status() from public, anon, authenticated;
revoke all on function public.group_notify_plan_entry() from public, anon, authenticated;
revoke all on function public.group_notify_plan_track_lying() from public, anon, authenticated;
revoke all on function public.training_group_notify_v1(text, jsonb) from public, anon, authenticated;
grant execute on function public.training_group_notify_v1(text, jsonb) to authenticated;
