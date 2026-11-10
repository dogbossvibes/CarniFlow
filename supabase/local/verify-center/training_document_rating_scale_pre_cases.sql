-- ============================================================================
-- ANYVO LOCAL VERIFY-CENTER ONLY — DO NOT APPLY TO STAGING OR PRODUCTION.
-- Suite training-doku-rating-scale, Phase PRE (vor der Migration).
-- Läuft in EINER Transaktion zusammen mit Migration, POST und ROLLBACK;
-- der Runner beendet sie immer mit ROLLBACK. Nur synthetische Testdaten.
--
-- Altes Verhalten: Production-Definition von training_document_v1 (vor T-184),
-- so wie Build 57 sie benutzt (performedExercises() sendet nie rating_scale).
-- ============================================================================
do $$ begin if inet_server_addr() is not null then raise exception 'Local Unix socket required'; end if; end $$;

create temporary table qa_assertions(phase text, label text);
create temporary table qa_info(phase text, label text, detail text);
create temporary table qa_state(k text primary key, v jsonb);
grant all on qa_assertions, qa_info, qa_state to authenticated;

create function pg_temp.ok(label text, condition boolean) returns void language plpgsql as $$
begin
  if condition is distinct from true then
    raise exception 'RATING_SCALE FAIL [%]: %', current_setting('qa.phase'), label;
  end if;
  insert into qa_assertions values (current_setting('qa.phase'), label);
end $$;
create function pg_temp.info(label text, detail text) returns void language sql as $$
  insert into qa_info values (current_setting('qa.phase'), label, detail);
$$;
create function pg_temp.put(k text, v jsonb) returns void language sql as $$
  insert into qa_state values (k, v) on conflict (k) do update set v = excluded.v;
$$;
create function pg_temp.got(k text) returns jsonb language sql as $$ select v from qa_state where qa_state.k = got.k $$;

create function pg_temp.as_user(sub uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', sub::text, true);
end $$;
create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- RPC-Aufrufe
create function pg_temp.rpc(action text, req jsonb) returns jsonb language plpgsql as $$
begin return public.training_document_v1(action, req); end $$;
create function pg_temp.token(owner uuid, unit uuid) returns text language plpgsql as $$
begin
  return pg_temp.rpc('get', jsonb_build_object('expectedOwnerId', owner, 'unitId', unit))->>'token';
end $$;
create function pg_temp.doc(owner uuid, unit uuid) returns jsonb language plpgsql as $$
begin
  return pg_temp.rpc('get', jsonb_build_object('expectedOwnerId', owner, 'unitId', unit))->'document';
end $$;
create function pg_temp.save_req(owner uuid, unit uuid, token text, unit_patch jsonb, exercises jsonb, request_id uuid default gen_random_uuid())
returns jsonb language sql as $$
  select jsonb_build_object('expectedOwnerId', owner, 'requestId', request_id, 'unitId', unit,
    'expectedToken', to_jsonb(token), 'unit', unit_patch, 'exercises', exercises);
$$;
-- Erwartet einen Fehler (SQLSTATE oder Meldung). Effekte des fehlgeschlagenen
-- Aufrufs werden durch den impliziten Savepoint vollständig zurückgerollt.
create function pg_temp.fails(label text, action text, req jsonb, expected text) returns text language plpgsql as $$
declare got_state text; got_msg text;
begin
  begin
    perform public.training_document_v1(action, req);
  exception when others then
    got_state := sqlstate; got_msg := sqlerrm;
  end;
  perform pg_temp.ok(label || ' (erwartet ' || expected || ', erhalten ' || coalesce(got_state || ' ' || got_msg, 'kein Fehler') || ')',
    got_state is not null and (got_state = expected or got_msg = expected));
  return got_state;
end $$;
create function pg_temp.sql_fails(label text, command text, expected text) returns void language plpgsql as $$
declare got_state text;
begin
  begin execute command; exception when others then got_state := sqlstate; end;
  perform pg_temp.ok(label || ' (erwartet ' || expected || ', erhalten ' || coalesce(got_state, 'kein Fehler') || ')', got_state = expected);
end $$;
create function pg_temp.rows(label text, command text, expected integer) returns void language plpgsql as $$
declare n integer;
begin execute command; get diagnostics n = row_count; perform pg_temp.ok(label, n = expected); end $$;

-- Prüfsumme aller bestehenden Kundendatenfelder (ohne die neue Spalte).
create function pg_temp.legacy_checksum() returns text language sql as $$
  select md5(coalesce(string_agg(concat_ws('|', e.id, e.unit_id, e.discipline, e.exercise_name, e.rating, e.notes,
           e.duration_sec, e.seq_index, e.created_at, e.discipline_key, e.exercise_identity_id), E'\n' order by e.id), '')
         || coalesce((select string_agg(to_jsonb(u)::text, E'\n' order by u.id) from public.training_units u), ''))
  from public.training_exercises e;
$$;


-- Synthetische Identitäten (rollen am Ende zurück)
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values ('a1000000-0000-4000-8000-000000000001','authenticated','authenticated','rs-owner@verify.local',now(),'{}','{}',now(),now(),false,false),
       ('b2000000-0000-4000-8000-000000000002','authenticated','authenticated','rs-other@verify.local',now(),'{}','{}',now(),now(),false,false);
insert into public.user_capabilities(user_id, pro_member) values
  ('a1000000-0000-4000-8000-000000000001', true), ('b2000000-0000-4000-8000-000000000002', true);
insert into public.dogs(id, owner_id, name) values
  ('da000000-0000-4000-8000-0000000000a1', 'a1000000-0000-4000-8000-000000000001', 'Testhund A'),
  ('db000000-0000-4000-8000-0000000000b2', 'b2000000-0000-4000-8000-000000000002', 'Testhund B');

set local qa.phase = 'pre';
select pg_temp.ok('Ausgangsfunktion kennt rating_scale noch nicht',
  pg_get_functiondef('public.training_document_v1(text,jsonb)'::regprocedure) !~ 'rating_scale');
select pg_temp.ok('Spalte rating_scale existiert vor der Migration nicht', not exists(
  select 1 from information_schema.columns where table_schema='public' and table_name='training_exercises' and column_name='rating_scale'));

-- Alte App (Build 57) legt ein Training mit Sternebewertungen über die RPC an.
select pg_temp.as_user('a1000000-0000-4000-8000-000000000001');
select pg_temp.put('u1_save', pg_temp.rpc('save', pg_temp.save_req(
  'a1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-0000000000e1', null,
  jsonb_build_object('dog_id','da000000-0000-4000-8000-0000000000a1','session_date','2026-11-01','status','completed','duration_sec',600,'rating',4),
  jsonb_build_array(
    jsonb_build_object('id','11000000-0000-4000-8000-000000000001','discipline','Fährte','exercise_name','Abgang','rating',3,'notes',null,'duration_sec',120,'seq_index',0),
    jsonb_build_object('id','11000000-0000-4000-8000-000000000002','discipline','Unterordnung','exercise_name','Fuss','rating',5,'notes','alt','duration_sec',null,'seq_index',1),
    jsonb_build_object('id','11000000-0000-4000-8000-000000000003','discipline','Unterordnung','exercise_name','Platz','rating',null,'notes',null,'duration_sec',null,'seq_index',2)))));
select pg_temp.ok('alte App speichert Sternebewertungen (1/3/5/leer)', (pg_temp.got('u1_save')->>'duplicate') = 'false'
  and jsonb_array_length(pg_temp.got('u1_save')->'exerciseIds') = 3);

-- Älteres direktes Tabellenformat (RLS, ohne RPC) mit allen Sternen 1–5.
insert into public.training_units(id, owner_id, dog_id, session_date, status, rating)
  values ('e2000000-0000-4000-8000-0000000000e2', 'a1000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-0000000000a1', '2026-10-01', 'completed', 2);
insert into public.training_exercises(id, unit_id, discipline, exercise_name, rating, seq_index)
  select ('12000000-0000-4000-8000-00000000000' || r)::uuid, 'e2000000-0000-4000-8000-0000000000e2', 'Obedience', 'Übung ' || r, r, r
  from generate_series(1, 5) r;
select pg_temp.ok('Altformat (Direktzugriff) Sterne 1–5 lesbar', (select count(*) from public.training_exercises where unit_id='e2000000-0000-4000-8000-0000000000e2') = 5);

-- Ohne Migration: Lernstufe kann nicht gespeichert werden (lauter Fehler, kein stiller Verlust).
select pg_temp.put('t0', to_jsonb(pg_temp.token('a1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-0000000000e1')));
select pg_temp.fails('alte Funktion lehnt rating_scale ab', 'save', pg_temp.save_req(
  'a1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-0000000000e1', pg_temp.got('t0')#>>'{}',
  '{}'::jsonb,
  jsonb_build_array(jsonb_build_object('id','11000000-0000-4000-8000-000000000001','discipline','Fährte','exercise_name','Abgang','rating',4,'rating_scale','lernstufe','notes',null,'duration_sec',120,'seq_index',0))),
  'INVALID_REQUEST');
select pg_temp.ok('Token nach abgelehntem Speichern unverändert',
  pg_temp.token('a1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-0000000000e1') = pg_temp.got('t0')#>>'{}');

select pg_temp.as_admin();
select pg_temp.put('checksum_pre', to_jsonb(pg_temp.legacy_checksum()));
select pg_temp.put('rows_pre', to_jsonb((select count(*) from public.training_exercises)));

select 'RATING_SCALE_PRE|PASS|assertions=' || count(*) from qa_assertions where phase = 'pre';
reset role;
