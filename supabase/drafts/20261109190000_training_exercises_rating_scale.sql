-- Trainingsdoku neu, Etappe 1 (T-184, GitHub #31)
-- Additive Markierung, ob training_exercises.rating eine Lernstufe (1/2/4/5)
-- oder eine alte Sternebewertung (1–5) ist.
--
--   rating_scale IS NULL       → alte Sternebewertung (alle bestehenden Zeilen und
--                                alle Zeilen älterer App-Versionen, z. B. Build 57)
--   rating_scale = 'lernstufe' → Lernstufe aus dem neuen Erfassen-Screen
--
-- Keine Änderung bestehender Daten, kein Default, keine Umrechnung.
--
-- RPC training_document_v1 (Ausgangsstand: training_document_v1.production-2026-11-09.sql),
-- genau zwei Änderungen:
--   1. 'rating_scale' in der erlaubten Feldliste je Übung (td_request lehnt unbekannte
--      Felder ab – ohne diese Migration scheitert das Speichern einer Lernstufe).
--   2. update setzt rating_scale=ex.rating_scale. Weil ex aus der bestehenden Zeile
--      plus Request befüllt wird, behält eine Zeile ihr rating_scale, wenn eine ältere
--      App es nicht mitsendet (Build 57 löscht die Markierung also nicht).
--   insert übernimmt rating_scale automatisch über (ex).*.
--
-- Hinweis: td_snapshot(u) bestimmt Laden ('get') und Token. Enthält es die Übungs-
-- zeilen vollständig (z. B. to_jsonb(e)), kommt rating_scale automatisch mit, und alle
-- Dokument-Token ändern sich einmalig nach der Migration (offene Bearbeitungen
-- erhalten dann einmal CONFLICT und laden neu). Vor Ausführung prüfen:
--   select pg_get_functiondef(p.oid) from pg_proc p where p.proname in ('td_snapshot','td_request');
--
-- STATUS: NUR VORBEREITET – NICHT AUSFÜHREN. Liegt in supabase/drafts/, damit
-- automatische Migrationsläufe die Datei nicht anfassen. Ausführung ausschliesslich
-- nach ausdrücklicher Nutzerfreigabe über den MASTER, VOR der OTA, zuerst auf Staging.
-- Der Abbruchblock unten wird erst nach der td_snapshot-Prüfung entfernt.

do $$
begin
  raise exception 'T-184: td_snapshot noch nicht geprüft und keine Ausführungsfreigabe. Nicht ausführen.';
end
$$;

begin;

alter table public.training_exercises
  add column if not exists rating_scale text null;

alter table public.training_exercises
  drop constraint if exists training_exercises_rating_scale_check;
alter table public.training_exercises
  add constraint training_exercises_rating_scale_check
  check (rating_scale is null or (rating_scale = 'lernstufe' and rating in (1, 2, 4, 5)));

comment on column public.training_exercises.rating_scale is
  'NULL = alte Sternebewertung 1-5; ''lernstufe'' = Lernstufe 1/2/4/5 (Trainingsdoku neu, T-184).';

CREATE OR REPLACE FUNCTION public.training_document_v1(p_action text, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
 SET "TimeZone" TO 'UTC'
AS $function$
declare o uuid:=auth.uid(); u uuid; req uuid; d uuid; prior public.training_units; nextrow public.training_units;
 snap jsonb; token text; rec public.training_document_receipts; item jsonb; ex public.training_exercises;
 result jsonb; is_new boolean; allowed boolean; ids uuid[]:='{}'; patch jsonb;
begin
 if o is null then raise exception 'UNAUTHENTICATED';end if;
 if p_request->>'expectedOwnerId' is distinct from o::text then raise exception 'CONTEXT_CHANGED';end if;
 perform public.td_request(p_request,array['expectedOwnerId','requestId','unitId','expectedToken','unit','exercises','focusChanges','identityChanges']);
 if p_action not in ('get','save') or p_action is null then raise exception 'INVALID_ACTION';end if;
 u:=(p_request->>'unitId')::uuid;if u is null then raise exception 'INVALID_REQUEST';end if;
 -- Same lock as the unchanged quota implementation, before locking any unit.
 perform pg_advisory_xact_lock(hashtext(o::text||':training'));
 select * into prior from public.training_units where id=u for update;
 is_new:=prior.id is null;
 if not is_new and prior.owner_id<>o then raise exception 'NOT_FOUND';end if;
 if not is_new then
  perform 1 from public.dogs where id=prior.dog_id and owner_id=o for share;
  if not found then raise exception 'NOT_FOUND';end if;
 end if;
 if p_action='get' then
  if is_new then raise exception 'NOT_FOUND';end if;
  perform 1 from public.dogs where id=prior.dog_id and owner_id=o for share;
  if not found then raise exception 'NOT_FOUND';end if;
  snap:=public.td_snapshot(u);
  return jsonb_build_object('version',1,'unitId',u,'token',md5(snap::text),'document',snap-'epoch');
 end if;
 req:=(p_request->>'requestId')::uuid;
 if req is null or not(p_request?'expectedToken') then raise exception 'INVALID_REQUEST';end if;
 patch:=p_request->'unit';
 perform public.td_request(patch,array['dog_id','session_date','started_at','ended_at','duration_sec','rating','notes','status','score','photos','videos','audio_files','motivation','konzentration','praezision','ausdauer','trieblage','impulskontrolle','shared_with_trainer']);
 d:=coalesce((patch->>'dog_id')::uuid,prior.dog_id);
 perform 1 from public.dogs where id=d and owner_id=o for share;
 if not found then raise exception 'NOT_FOUND';end if;
 select * into rec from public.training_document_receipts where owner_id=o and request_id=req;
 if found then
  if rec.operation<>'document.save' or rec.payload_hash<>public.td_payload(p_request) then raise exception 'REQUEST_ID_REUSED';end if;
  if is_new or exists(select 1 from public.training_document_epochs where unit_id=u and deleted) then raise exception 'NOT_FOUND';end if;
  -- Do not claim a stale historical receipt is the latest document.
  return rec.response||jsonb_build_object('duplicate',true,'currentToken',md5(public.td_snapshot(u)::text));
 end if;
 if exists(select 1 from public.training_document_epochs where unit_id=u and deleted) then raise exception 'NOT_FOUND';end if;
 if is_new then
  if p_request->>'expectedToken' is not null then raise exception 'CONFLICT';end if;
  nextrow:=jsonb_populate_record(null::public.training_units,jsonb_build_object('id',u,'owner_id',o,'dog_id',d,'session_date',current_date,'status','completed','created_at',now(),'photos','[]'::jsonb,'videos','[]'::jsonb,'audio_files','[]'::jsonb,'shared_with_trainer',false)||patch);
 else
  if p_request->>'expectedToken' is distinct from md5(public.td_snapshot(u)::text) then raise exception 'CONFLICT';end if;
  nextrow:=jsonb_populate_record(prior,patch);
  if prior.status='completed' and nextrow.status is distinct from 'completed' then raise exception 'INVALID_STATUS_TRANSITION';end if;
 end if;
 if nextrow.status is distinct from 'completed' or nextrow.duration_sec<0 or nextrow.session_date is null then raise exception 'INVALID_REQUEST';end if;
 if p_request?'identityChanges' then
  if jsonb_typeof(p_request->'identityChanges') is distinct from 'array' or jsonb_array_length(p_request->'identityChanges')>200 then raise exception 'INVALID_REQUEST';end if;
  for item in select value from jsonb_array_elements(p_request->'identityChanges') loop
   perform public.td_request(item,array['request']);
   perform public.training_exercise_identity_v1('save',item->'request');
  end loop;
 end if;
 if jsonb_typeof(p_request->'exercises') is distinct from 'array' or jsonb_array_length(p_request->'exercises')>200 then raise exception 'INVALID_REQUEST';end if;
 for item in select value from jsonb_array_elements(p_request->'exercises') loop
  perform public.td_request(item,array['id','discipline','discipline_key','exercise_identity_id','exercise_name','rating','rating_scale','notes','duration_sec','seq_index']);
  ex:=jsonb_populate_record(null::public.training_exercises,item);
  if ex.id is null or ex.id=any(ids) or ex.seq_index is null or ex.seq_index<0 or length(btrim(ex.discipline)) not between 1 and 200 or ex.discipline is null or length(btrim(ex.exercise_name)) not between 1 and 200 or ex.exercise_name is null or ex.duration_sec<0 then raise exception 'INVALID_EXERCISE';end if;
  if exists(select 1 from public.training_exercises where id=ex.id and unit_id<>u) then raise exception 'INVALID_EXERCISE';end if;
  if ex.discipline_key is not null and not exists(select 1 from public.training_exercises historical where historical.id=ex.id and historical.unit_id=u and historical.discipline_key=ex.discipline_key) then perform public.td_discipline(ex.discipline_key,o);end if;
  if ex.exercise_identity_id is not null and not exists(select 1 from public.training_exercise_identities where id=ex.exercise_identity_id and owner_id=o and discipline_key=ex.discipline_key) then raise exception 'INVALID_IDENTITY';end if;
  ids:=array_append(ids,ex.id);
 end loop;
 if is_new or prior.status='active' then
  select success into allowed from public.claim_newbie_quota('training',u::text);
  if allowed is distinct from true then raise exception 'QUOTA_EXCEEDED';end if;
 end if;
 if is_new then
  insert into public.training_units select (nextrow).*;
 else
  update public.training_units set dog_id=nextrow.dog_id,session_date=nextrow.session_date,started_at=nextrow.started_at,ended_at=nextrow.ended_at,duration_sec=nextrow.duration_sec,rating=nextrow.rating,notes=nextrow.notes,status=nextrow.status,score=nextrow.score,photos=nextrow.photos,videos=nextrow.videos,audio_files=nextrow.audio_files,motivation=nextrow.motivation,konzentration=nextrow.konzentration,praezision=nextrow.praezision,ausdauer=nextrow.ausdauer,trieblage=nextrow.trieblage,impulskontrolle=nextrow.impulskontrolle,shared_with_trainer=nextrow.shared_with_trainer where id=u;
 end if;
 -- Matching occurrences retain created_at and omitted additive/legacy fields.
 for item in select value from jsonb_array_elements(p_request->'exercises') loop
  select * into ex from public.training_exercises where id=(item->>'id')::uuid and unit_id=u;
  if not found then ex:=jsonb_populate_record(null::public.training_exercises,jsonb_build_object('unit_id',u,'created_at',now())||item);
   insert into public.training_exercises select (ex).*;
  else ex:=jsonb_populate_record(ex,item);
   update public.training_exercises set discipline=ex.discipline,exercise_name=ex.exercise_name,rating=ex.rating,rating_scale=ex.rating_scale,notes=ex.notes,duration_sec=ex.duration_sec,seq_index=ex.seq_index,exercise_identity_id=ex.exercise_identity_id,discipline_key=ex.discipline_key where id=ex.id;
  end if;
 end loop;
 delete from public.training_exercises where unit_id=u and not(id=any(ids));
 if p_request?'focusChanges' then
  if jsonb_typeof(p_request->'focusChanges') is distinct from 'array' or jsonb_array_length(p_request->'focusChanges')>50 then raise exception 'INVALID_REQUEST';end if;
  for item in select value from jsonb_array_elements(p_request->'focusChanges') loop
   perform public.td_request(item,array['action','request']);
   if item->>'action' is null or item->>'action' not in ('create','update') then raise exception 'INVALID_ACTION';end if;
   if item->>'action'='create' and item->'request'->>'sourceUnitId' is distinct from u::text then raise exception 'INVALID_SOURCE';end if;
   perform public.training_focus_v1(item->>'action',item->'request');
  end loop;
 end if;
 snap:=public.td_snapshot(u);
 result:=jsonb_build_object('version',1,'unitId',u,'token',md5(snap::text),'currentToken',md5(snap::text),'duplicate',false,'exerciseIds',to_jsonb(ids));
 insert into public.training_document_receipts values(o,req,'document.save',public.td_payload(p_request),result);
 return result;
end$function$;

commit;
