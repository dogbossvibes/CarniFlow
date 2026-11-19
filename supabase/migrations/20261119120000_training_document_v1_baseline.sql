-- Trainingsdokumentation v1: Struktur aus Production nachgezogen (Stand 2026-11-19).
-- Production hat diese Objekte bereits (dort ohne versionierte Migration angelegt);
-- Staging fehlten sie, deshalb scheiterte «Training dokumentieren» auf Staging.
-- Nur Struktur, keine Daten. Idempotent: auf Production ohne Wirkung auf Daten,
-- Funktionen werden mit identischer Definition ersetzt.
-- Auf Staging am 2026-11-19 von Hand eingespielt und gegen Production verglichen
-- (Tabellen, Spalten, Constraints, Indizes, Regeln, Trigger, Funktionen, Rechte identisch).

begin;

create table if not exists public.training_exercise_identities (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  discipline_key text not null,
  display_name text not null,
  revision bigint not null default 1,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint training_exercise_identities_display_name_check
    check (length(btrim(display_name)) >= 1 and length(btrim(display_name)) <= 200)
);

create table if not exists public.training_document_epochs (
  unit_id uuid primary key,
  epoch uuid not null default gen_random_uuid(),
  deleted boolean not null default false
);

create table if not exists public.training_document_receipts (
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  operation text not null,
  payload_hash text not null,
  response jsonb not null,
  primary key (owner_id, request_id)
);

create table if not exists public.training_focus_items (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  dog_id uuid not null references public.dogs(id) on delete cascade,
  discipline_key text not null,
  exercise_identity_id uuid references public.training_exercise_identities(id),
  source_unit_id uuid references public.training_units(id) on delete set null,
  source_unit_snapshot_id uuid not null,
  source_date_snapshot date not null,
  exercise_name_snapshot text,
  source_text_snapshot text not null,
  source_observation_snapshot text not null,
  text text not null,
  status text not null default 'open',
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_focus_items_status_check check (status = any (array['open'::text, 'practice'::text, 'done'::text])),
  constraint training_focus_items_text_check check (length(btrim(text)) >= 1 and length(btrim(text)) <= 4000)
);
create index if not exists training_focus_owner_dog_idx
  on public.training_focus_items (owner_id, dog_id, discipline_key, id);

-- Zugriff nur über die SECURITY-DEFINER-Funktionen unten (wie Production: RLS an, keine Policies, keine Rechte).
alter table public.training_exercise_identities enable row level security;
alter table public.training_document_epochs enable row level security;
alter table public.training_document_receipts enable row level security;
alter table public.training_focus_items enable row level security;
revoke all on public.training_exercise_identities, public.training_document_epochs,
  public.training_document_receipts, public.training_focus_items
  from public, anon, authenticated, service_role;

-- Additive Spalten an training_exercises; bestehende Zeilen bleiben unverändert (NULL).
alter table public.training_exercises
  add column if not exists exercise_identity_id uuid,
  add column if not exists discipline_key text,
  add column if not exists rating_scale text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'training_exercises_exercise_identity_id_fkey'
                 and conrelid = 'public.training_exercises'::regclass) then
    alter table public.training_exercises add constraint training_exercises_exercise_identity_id_fkey
      foreign key (exercise_identity_id) references public.training_exercise_identities(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'training_exercises_rating_scale_check'
                 and conrelid = 'public.training_exercises'::regclass) then
    alter table public.training_exercises add constraint training_exercises_rating_scale_check
      check (rating_scale is null or (rating_scale = 'lernstufe'::text and rating = any (array[1, 2, 4, 5])));
  end if;
end $$;
create index if not exists training_exercises_identity_idx
  on public.training_exercises (exercise_identity_id) where exercise_identity_id is not null;

CREATE OR REPLACE FUNCTION public.td_payload(r jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$ select encode(sha256(convert_to(r::text,'UTF8')),'hex') $function$;

CREATE OR REPLACE FUNCTION public.td_request(r jsonb, keys text[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if r is null or jsonb_typeof(r)<>'object' or octet_length(r::text)>524288 or exists(select 1 from jsonb_object_keys(r) k where not(k=any(keys))) then raise exception 'INVALID_REQUEST';end if;
end$function$;

CREATE OR REPLACE FUNCTION public.td_discipline(k text, o uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if k is null then raise exception 'INVALID_DISCIPLINE';end if;
 if k like 'custom:%' then
  if not exists(select 1 from public.custom_categories where id=substring(k from 8)::uuid and owner_id=o) then raise exception 'INVALID_DISCIPLINE';end if;
 elsif k !~ '^system:[a-z][a-z0-9_-]{0,79}$' then raise exception 'INVALID_DISCIPLINE';end if;
end$function$;

CREATE OR REPLACE FUNCTION public.td_snapshot(u uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $function$
 select jsonb_build_object('unit',to_jsonb(t),'exercises',coalesce((select jsonb_agg(to_jsonb(e) order by e.seq_index,e.id) from public.training_exercises e where e.unit_id=t.id),'[]'::jsonb),'epoch',(select epoch from public.training_document_epochs where unit_id=t.id)) from public.training_units t where t.id=u
$function$;

CREATE OR REPLACE FUNCTION public.td_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid; v uuid; own uuid; ident public.training_exercise_identities;
begin
 if tg_table_name='training_exercises' then
  if tg_op='UPDATE' then
   for u in select distinct x from unnest(array[old.unit_id,new.unit_id]) x order by x loop
    perform 1 from public.training_units where id=u for update;
   end loop;
  else
   u:=case when tg_op='DELETE' then old.unit_id else new.unit_id end;
   perform 1 from public.training_units where id=u for update;
  end if;
  if tg_op<>'DELETE' and new.exercise_identity_id is not null then
   select owner_id into own from public.training_units where id=new.unit_id;
   select * into ident from public.training_exercise_identities where id=new.exercise_identity_id;
   if ident.id is null or ident.owner_id is distinct from own or new.discipline_key is distinct from ident.discipline_key then raise exception 'INVALID_IDENTITY';end if;
  end if;
  if tg_op<>'INSERT' then
   insert into public.training_document_epochs(unit_id) values(old.unit_id) on conflict(unit_id) do update set epoch=gen_random_uuid();
  end if;
  if tg_op<>'DELETE' then
   insert into public.training_document_epochs(unit_id) values(new.unit_id) on conflict(unit_id) do update set epoch=gen_random_uuid();
  end if;
 else
  u:=case when tg_op='DELETE' then old.id else new.id end;
  insert into public.training_document_epochs(unit_id,deleted) values(u,tg_op='DELETE') on conflict(unit_id) do update set epoch=gen_random_uuid(),deleted=public.training_document_epochs.deleted or excluded.deleted;
 end if;
 if tg_op='DELETE' then return old;else return new;end if;
end$function$;

CREATE OR REPLACE FUNCTION public.training_exercise_identity_v1(p_action text, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
 SET "TimeZone" TO 'UTC'
AS $function$
declare o uuid:=auth.uid(); i uuid; req uuid; oldrow public.training_exercise_identities; r public.training_document_receipts; result jsonb;
begin
 if o is null then raise exception 'UNAUTHENTICATED';end if;
 if p_request->>'expectedOwnerId' is distinct from o::text then raise exception 'CONTEXT_CHANGED';end if;
 perform public.td_request(p_request,array['expectedOwnerId','id','requestId','disciplineKey','displayName','expectedRevision','archived','afterId']);
 perform pg_advisory_xact_lock(hashtext(o::text||':training'));
 if p_action='list' then
  if p_request->>'disciplineKey' is null then raise exception 'INVALID_DISCIPLINE';end if;
  return (select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from (select * from public.training_exercise_identities where owner_id=o and discipline_key=p_request->>'disciplineKey' and (p_request->>'afterId' is null or id>(p_request->>'afterId')::uuid) order by id limit 100) t);
 end if;
 if p_action is distinct from 'save' then raise exception 'INVALID_ACTION';end if;
 i:=(p_request->>'id')::uuid;req:=(p_request->>'requestId')::uuid;
 if i is null or req is null or not(p_request?'expectedRevision') then raise exception 'INVALID_REQUEST';end if;
 select * into oldrow from public.training_exercise_identities where id=i for update;
 if oldrow.id is not null and oldrow.owner_id<>o then raise exception 'NOT_FOUND';end if;
 select * into r from public.training_document_receipts where owner_id=o and request_id=req;
 if found then
  if r.operation<>'identity.save' or r.payload_hash<>public.td_payload(p_request) then raise exception 'REQUEST_ID_REUSED';end if;
  return jsonb_build_object('identity',to_jsonb(oldrow),'duplicate',true);
 end if;
 if oldrow.id is null then
  if p_request->>'expectedRevision' is not null then raise exception 'CONFLICT';end if;
  perform public.td_discipline(p_request->>'disciplineKey',o);
  insert into public.training_exercise_identities(id,owner_id,discipline_key,display_name,archived_at) values(i,o,p_request->>'disciplineKey',p_request->>'displayName',case when (p_request->>'archived')::boolean then now() else null end);
 else
  if (p_request->>'expectedRevision')::bigint is distinct from oldrow.revision then raise exception 'CONFLICT';end if;
  if p_request?'disciplineKey' and p_request->>'disciplineKey' is distinct from oldrow.discipline_key then raise exception 'INVALID_DISCIPLINE';end if;
  update public.training_exercise_identities set display_name=case when p_request?'displayName' then p_request->>'displayName' else display_name end,archived_at=case when p_request?'archived' then case when (p_request->>'archived')::boolean then now() else null end else archived_at end,revision=revision+1 where id=i;
 end if;
 select jsonb_build_object('identity',to_jsonb(t),'duplicate',false) into result from public.training_exercise_identities t where id=i;
 insert into public.training_document_receipts values(o,req,'identity.save',public.td_payload(p_request),jsonb_build_object('identityId',i));return result;
end$function$;

CREATE OR REPLACE FUNCTION public.training_focus_v1(p_action text, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
 SET "TimeZone" TO 'UTC'
AS $function$
declare o uuid:=auth.uid(); i uuid; req uuid; source public.training_units; f public.training_focus_items; ex public.training_exercises; r public.training_document_receipts; result jsonb; d uuid;
begin
 if o is null then raise exception 'UNAUTHENTICATED';end if;
 if p_request->>'expectedOwnerId' is distinct from o::text then raise exception 'CONTEXT_CHANGED';end if;
 perform public.td_request(p_request,array['expectedOwnerId','id','requestId','dogId','disciplineKey','sourceUnitId','sourceExerciseId','text','status','expectedRevision','afterId']);
 perform pg_advisory_xact_lock(hashtext(o::text||':training'));
 if p_action='list' then
  d:=(p_request->>'dogId')::uuid;
  if d is not null then
   perform 1 from public.dogs where id=d and owner_id=o for share;if not found then raise exception 'NOT_FOUND';end if;
  end if;
  return (select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from (select * from public.training_focus_items focus_row where owner_id=o and (d is null or dog_id=d) and exists(select 1 from public.dogs owned_dog where owned_dog.id=focus_row.dog_id and owned_dog.owner_id=o) and (p_request->>'disciplineKey' is null or discipline_key=p_request->>'disciplineKey') and (p_request->>'afterId' is null or id>(p_request->>'afterId')::uuid) order by id limit 100) t);
 end if;
 if p_action is null or p_action not in ('create','update') then raise exception 'INVALID_ACTION';end if;
 i:=(p_request->>'id')::uuid;req:=(p_request->>'requestId')::uuid;if i is null or req is null then raise exception 'INVALID_REQUEST';end if;
 select * into f from public.training_focus_items where id=i for update;
 if f.id is not null and f.owner_id<>o then raise exception 'NOT_FOUND';end if;
 if f.id is not null then d:=f.dog_id;
 else
  select * into source from public.training_units where id=(p_request->>'sourceUnitId')::uuid and owner_id=o for share;
  if source.id is null then raise exception 'NOT_FOUND';end if;d:=source.dog_id;
 end if;
 perform 1 from public.dogs where id=d and owner_id=o for share;if not found then raise exception 'NOT_FOUND';end if;
 select * into r from public.training_document_receipts where owner_id=o and request_id=req;
 if found then
  if r.operation<>'focus.'||p_action or r.payload_hash<>public.td_payload(p_request) then raise exception 'REQUEST_ID_REUSED';end if;
  if f.id is null then raise exception 'NOT_FOUND';end if;
  return jsonb_build_object('focus',to_jsonb(f),'duplicate',true);
 end if;
 if p_action='create' then
  if f.id is not null then raise exception 'CONFLICT';end if;
  perform public.td_discipline(p_request->>'disciplineKey',o);
  if p_request->>'sourceExerciseId' is not null then
   select * into ex from public.training_exercises where id=(p_request->>'sourceExerciseId')::uuid and unit_id=source.id and discipline_key=p_request->>'disciplineKey';
   if ex.id is null then raise exception 'INVALID_SOURCE';end if;
  elsif not exists(select 1 from public.training_exercises where unit_id=source.id and discipline_key=p_request->>'disciplineKey') then raise exception 'INVALID_SOURCE';end if;
  insert into public.training_focus_items(id,owner_id,dog_id,discipline_key,exercise_identity_id,source_unit_id,source_unit_snapshot_id,source_date_snapshot,exercise_name_snapshot,source_text_snapshot,source_observation_snapshot,text)
  values(i,o,d,p_request->>'disciplineKey',ex.exercise_identity_id,source.id,source.id,source.session_date,ex.exercise_name,p_request->>'text',coalesce(ex.notes,source.notes,''),p_request->>'text');
 else
  if f.id is null then raise exception 'NOT_FOUND';end if;
  if (p_request->>'expectedRevision')::bigint is distinct from f.revision then raise exception 'CONFLICT';end if;
  if p_request ?| array['sourceUnitId','sourceExerciseId','dogId','disciplineKey'] then raise exception 'IMMUTABLE_SOURCE';end if;
  update public.training_focus_items set text=case when p_request?'text' then p_request->>'text' else text end,status=case when p_request?'status' then p_request->>'status' else status end,revision=revision+1,updated_at=now() where id=i;
 end if;
 select jsonb_build_object('focus',to_jsonb(t),'duplicate',false) into result from public.training_focus_items t where id=i;
 insert into public.training_document_receipts values(o,req,'focus.'||p_action,public.td_payload(p_request),jsonb_build_object('focusId',i));return result;
end$function$;

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

revoke all on function public.td_payload(jsonb), public.td_request(jsonb, text[]),
  public.td_discipline(text, uuid), public.td_snapshot(uuid), public.td_changed(),
  public.training_exercise_identity_v1(text, jsonb), public.training_focus_v1(text, jsonb),
  public.training_document_v1(text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.training_exercise_identity_v1(text, jsonb),
  public.training_focus_v1(text, jsonb), public.training_document_v1(text, jsonb)
  to authenticated;

-- Trigger nur anlegen, wenn sie fehlen (auf Production vorhanden: dort keine Änderung, keine Sperre).
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'td_exercise_changed'
                 and tgrelid = 'public.training_exercises'::regclass) then
    create trigger td_exercise_changed before insert or delete or update on public.training_exercises
      for each row execute function public.td_changed();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'td_unit_changed'
                 and tgrelid = 'public.training_units'::regclass) then
    create trigger td_unit_changed after insert or delete or update on public.training_units
      for each row execute function public.td_changed();
  end if;
end $$;

commit;
