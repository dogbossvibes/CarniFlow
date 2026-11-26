-- LOCAL ONLY: local Docker/Unix socket. All fixtures roll back.
-- Verifies 20261126120000_training_group_plans.sql on top of baseline, stage1, 2a, 2b, 3, 4a, own_track.
-- Spec 04 Vereinsmodus, PR A: Rechte und Sichtbarkeit von Trainingsplänen.
\set ON_ERROR_STOP on
begin;
do $$ begin if inet_server_addr() is not null then raise exception 'Local Unix socket required'; end if; end $$;
create temporary table qa_assertions(label text);
grant all on qa_assertions to authenticated, anon;
create function pg_temp.ok(label text, condition boolean) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'PLAN FAIL: %',label; end if;
 insert into qa_assertions values(label);
end $$;
create function pg_temp.fails(label text, expected text, command text) returns void language plpgsql as $$
declare got text := null;
begin
 begin execute command; exception when others then got := sqlerrm; end;
 if got is distinct from expected then raise exception 'PLAN FAIL: % (expected %, got %)', label, expected, coalesce(got,'success'); end if;
 insert into qa_assertions values(label);
end $$;
create function pg_temp.as_user(p uuid) returns void language sql as $$
 select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claims', json_build_object('sub',p,'role','authenticated')::text, true);
$$;
create function pg_temp.g(a text, r jsonb) returns jsonb language sql as $$ select public.training_group_v1(a, r) $$;
create function pg_temp.j(a text, r jsonb) returns jsonb language sql as $$ select public.training_group_join_v1(a, r) $$;
create function pg_temp.p(a text, r jsonb) returns jsonb language sql as $$ select public.training_group_plan_v1(a, r) $$;
create or replace function public.subscription_verified_initiator_v1() returns boolean language sql stable as $$ select true $$;
grant execute on function public.subscription_verified_initiator_v1() to authenticated;

-- Statische Rechte
select pg_temp.ok('RLS an, keine Tabellenrechte für die App',
 (select bool_and(relrowsecurity) from pg_class where relname in ('training_private_plans','training_private_plan_entries'))
 and not has_table_privilege('authenticated','public.training_private_plans','SELECT')
 and not has_table_privilege('anon','public.training_private_plan_entries','SELECT'));
select pg_temp.ok('nur die Schnittstelle ist aufrufbar',
 has_function_privilege('authenticated','public.training_group_plan_v1(text,jsonb)','EXECUTE')
 and not has_function_privilege('anon','public.training_group_plan_v1(text,jsonb)','EXECUTE')
 and not has_function_privilege('authenticated','public.training_private_plan_json(uuid,boolean)','EXECUTE'));

-- Personen: Anna (Inhaberin), Bea (Mitglied), Carl (Mitglied, verlässt später), Dora (nicht in der Gruppe)
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
select u,'authenticated','authenticated','plan-'||n||'@local.test',now(),'{}','{}',now(),now(),false,false
from (values ('a1111111-1111-4111-8111-111111111111'::uuid,'anna'),('b2222222-2222-4222-8222-222222222222','bea'),
 ('c3333333-3333-4333-8333-333333333333','carl'),('d4444444-4444-4444-8444-444444444444','dora')) t(u,n);
insert into public.dogs(id,owner_id,name,breed) values
 ('a0000000-0000-4000-8000-00000000000a','a1111111-1111-4111-8111-111111111111','Ayla','Malinois'),
 ('b0000000-0000-4000-8000-0000000000b1','b2222222-2222-4222-8222-222222222222','Luna','DSH'),
 ('c0000000-0000-4000-8000-0000000000c1','c3333333-3333-4333-8333-333333333333','Rex',null);

set local role authenticated;
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.g('create','{"groupId":"10000000-0000-4000-8000-000000000001","title":"Verein","displayName":"Anna"}');
create temporary table qa_code as select pg_temp.j('code_create','{"groupId":"10000000-0000-4000-8000-000000000001"}')->>'code' c;
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.j('request', jsonb_build_object('code',(select c from qa_code),'requestId','20000000-0000-4000-8000-000000000002','displayName','Bea'));
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.j('request', jsonb_build_object('code',(select c from qa_code),'requestId','20000000-0000-4000-8000-000000000003','displayName','Carl'));
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.j('approve','{"groupId":"10000000-0000-4000-8000-000000000001","requestId":"20000000-0000-4000-8000-000000000002"}');
select pg_temp.j('approve','{"groupId":"10000000-0000-4000-8000-000000000001","requestId":"20000000-0000-4000-8000-000000000003"}');

-- Planen nur wer plant
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.fails('Mitglied darf keinen Plan anlegen','GROUP_UNAVAILABLE',
 $$select pg_temp.p('create','{"groupId":"10000000-0000-4000-8000-000000000001","planId":"70000000-0000-4000-8000-000000000009","title":"X","startsAtMs":1800000000000}')$$);
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.p('create','{"groupId":"10000000-0000-4000-8000-000000000001","planId":"70000000-0000-4000-8000-000000000001","title":"Fährtentag","startsAtMs":1800000000000,"meetingPoint":"Parkplatz Wald","meetingLat":47.37,"meetingLng":8.54}');
select pg_temp.ok('gleiche Anfrage erneut = derselbe Plan',
 (select pg_temp.p('create','{"groupId":"10000000-0000-4000-8000-000000000001","planId":"70000000-0000-4000-8000-000000000001","title":"Fährtentag","startsAtMs":1800000000000,"meetingPoint":"Parkplatz Wald","meetingLat":47.37,"meetingLng":8.54}')->'plan'->>'planId') = '70000000-0000-4000-8000-000000000001');
select pg_temp.fails('andere Anfrage mit gleicher ID = Konflikt','GROUP_CONFLICT',
 $$select pg_temp.p('create','{"groupId":"10000000-0000-4000-8000-000000000001","planId":"70000000-0000-4000-8000-000000000001","title":"Anders","startsAtMs":1800000000000}')$$);
select pg_temp.p('set_entry','{"planId":"70000000-0000-4000-8000-000000000001","entryId":"80000000-0000-4000-8000-000000000001","position":1,"handlerUserId":"b2222222-2222-4222-8222-222222222222","layerUserId":"a1111111-1111-4111-8111-111111111111","plannedLyingMinutes":60,"trackKind":"igp1","blind":false}');
select pg_temp.p('set_entry','{"planId":"70000000-0000-4000-8000-000000000001","entryId":"80000000-0000-4000-8000-000000000002","position":2,"handlerUserId":"c3333333-3333-4333-8333-333333333333","layerUserId":"b2222222-2222-4222-8222-222222222222","trackKind":"mantrail","blind":true}');
select pg_temp.fails('Nicht-Mitglied kann nicht eingetragen werden','GROUP_UNAVAILABLE',
 $$select pg_temp.p('set_entry','{"planId":"70000000-0000-4000-8000-000000000001","entryId":"80000000-0000-4000-8000-000000000003","position":3,"handlerUserId":"d4444444-4444-4444-8444-444444444444","trackKind":"free","blind":false}')$$);
select pg_temp.fails('eigene Fährte nie blind','GROUP_INVALID_REQUEST',
 $$select pg_temp.p('set_entry','{"planId":"70000000-0000-4000-8000-000000000001","entryId":"80000000-0000-4000-8000-000000000004","position":3,"handlerUserId":"a1111111-1111-4111-8111-111111111111","layerUserId":"a1111111-1111-4111-8111-111111111111","trackKind":"free","blind":true}')$$);

-- Entwurf: Mitglieder sehen ihn nicht
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.ok('Entwurf nicht in der Liste eines Mitglieds',
 jsonb_array_length(pg_temp.p('list','{"groupId":"10000000-0000-4000-8000-000000000001"}')->'plans') = 0);
select pg_temp.fails('Entwurf nicht abrufbar','GROUP_UNAVAILABLE', $$select pg_temp.p('get','{"planId":"70000000-0000-4000-8000-000000000001"}')$$);
select pg_temp.fails('Zusage zu einem Entwurf nicht möglich','GROUP_CONFLICT',
 $$select pg_temp.p('respond','{"planId":"70000000-0000-4000-8000-000000000001","entryId":"80000000-0000-4000-8000-000000000001","response":"yes"}')$$);
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.p('publish','{"planId":"70000000-0000-4000-8000-000000000001"}');

-- Nicht-Mitglied sieht nichts
select pg_temp.as_user('d4444444-4444-4444-8444-444444444444');
select pg_temp.fails('Nicht-Mitglied: keine Liste','GROUP_UNAVAILABLE', $$select pg_temp.p('list','{"groupId":"10000000-0000-4000-8000-000000000001"}')$$);
select pg_temp.fails('Nicht-Mitglied: kein Plan','GROUP_UNAVAILABLE', $$select pg_temp.p('get','{"planId":"70000000-0000-4000-8000-000000000001"}')$$);

-- Mitglied: eigene Zeile, eigener Hund – nie fremd
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.fails('Mitglied kann Plan nicht ändern','GROUP_UNAVAILABLE',
 $$select pg_temp.p('update','{"planId":"70000000-0000-4000-8000-000000000001","title":"Meins","startsAtMs":1800000000000}')$$);
select pg_temp.fails('fremden Hund setzen geht nicht','GROUP_UNAVAILABLE',
 $$select pg_temp.p('respond','{"planId":"70000000-0000-4000-8000-000000000001","entryId":"80000000-0000-4000-8000-000000000001","response":"yes","dogId":"c0000000-0000-4000-8000-0000000000c1"}')$$);
select pg_temp.fails('fremde Zeile zusagen geht nicht','GROUP_UNAVAILABLE',
 $$select pg_temp.p('respond','{"planId":"70000000-0000-4000-8000-000000000001","entryId":"80000000-0000-4000-8000-000000000002","response":"yes"}')$$);
select pg_temp.ok('ohne Zusage kein Hundename im Plan',
 (select pg_temp.p('get','{"planId":"70000000-0000-4000-8000-000000000001"}')->'plan'->'entries'->0->'dog') = 'null'::jsonb);
select pg_temp.p('respond','{"planId":"70000000-0000-4000-8000-000000000001","entryId":"80000000-0000-4000-8000-000000000001","response":"yes","dogId":"b0000000-0000-4000-8000-0000000000b1"}');
select pg_temp.p('layer_respond','{"planId":"70000000-0000-4000-8000-000000000001","entryId":"80000000-0000-4000-8000-000000000002","response":"yes"}');
select pg_temp.fails('als Leger:in nur die eigene Leger-Zeile','GROUP_UNAVAILABLE',
 $$select pg_temp.p('layer_respond','{"planId":"70000000-0000-4000-8000-000000000001","entryId":"80000000-0000-4000-8000-000000000001","response":"yes"}')$$);

-- Organisator sieht Hund erst nach Zusage des Besitzers – und nur Name/Rasse
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.ok('Hund nach Zusage sichtbar, nur Name und Rasse',
 (select pg_temp.p('get','{"planId":"70000000-0000-4000-8000-000000000001"}')->'plan'->'entries'->0->'dog')
  = jsonb_build_object('dogId','b0000000-0000-4000-8000-0000000000b1','name','Luna','breed','DSH'));
select pg_temp.ok('Carl ohne Zusage: kein Hund',
 (select pg_temp.p('get','{"planId":"70000000-0000-4000-8000-000000000001"}')->'plan'->'entries'->1->'dog') = 'null'::jsonb);
-- Wechsel der Person setzt Zusage und Hund zurück
select pg_temp.p('set_entry','{"planId":"70000000-0000-4000-8000-000000000001","entryId":"80000000-0000-4000-8000-000000000001","position":1,"handlerUserId":"c3333333-3333-4333-8333-333333333333","trackKind":"igp1","blind":false}');
select pg_temp.ok('andere Person: Zusage offen, Hund weg',
 (select e->>'handlerResponse' = 'open' and e->'dog' = 'null'::jsonb from (select pg_temp.p('get','{"planId":"70000000-0000-4000-8000-000000000001"}')->'plan'->'entries'->0 e) x));
reset role;
select pg_temp.ok('in der Tabelle ist auch die Hunde-ID weg',
 (select dog_id is null and dog_epoch is null from public.training_private_plan_entries where id='80000000-0000-4000-8000-000000000001'));
set local role authenticated;
select pg_temp.p('set_entry','{"planId":"70000000-0000-4000-8000-000000000001","entryId":"80000000-0000-4000-8000-000000000001","position":1,"handlerUserId":"b2222222-2222-4222-8222-222222222222","trackKind":"igp1","blind":false}');
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.p('respond','{"planId":"70000000-0000-4000-8000-000000000001","entryId":"80000000-0000-4000-8000-000000000001","response":"yes","dogId":"b0000000-0000-4000-8000-0000000000b1"}');

-- Carl sagt mit Rex zu und verlässt die Gruppe → Name und Hund verschwinden, Plan bleibt
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.p('respond','{"planId":"70000000-0000-4000-8000-000000000001","entryId":"80000000-0000-4000-8000-000000000002","response":"yes","dogId":"c0000000-0000-4000-8000-0000000000c1"}');
select pg_temp.g('leave','{"groupId":"10000000-0000-4000-8000-000000000001"}');
select pg_temp.fails('ehemaliges Mitglied sieht nichts mehr','GROUP_UNAVAILABLE', $$select pg_temp.p('get','{"planId":"70000000-0000-4000-8000-000000000001"}')$$);
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.ok('ehemaliges Mitglied: kein Name, kein Hund; Zeile bleibt',
 (select e->'handlerName' = 'null'::jsonb and e->'dog' = 'null'::jsonb from (select pg_temp.p('get','{"planId":"70000000-0000-4000-8000-000000000001"}')->'plan'->'entries'->1 e) x));

-- Reihenfolge, Entfernen, Absagen, Grenzen
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.p('reorder','{"planId":"70000000-0000-4000-8000-000000000001","entryIds":["80000000-0000-4000-8000-000000000002","80000000-0000-4000-8000-000000000001"]}');
select pg_temp.ok('neue Reihenfolge',
 (select pg_temp.p('get','{"planId":"70000000-0000-4000-8000-000000000001"}')->'plan'->'entries'->0->>'entryId') = '80000000-0000-4000-8000-000000000002');
select pg_temp.fails('Reihenfolge muss genau alle Zeilen enthalten','GROUP_CONFLICT',
 $$select pg_temp.p('reorder','{"planId":"70000000-0000-4000-8000-000000000001","entryIds":["80000000-0000-4000-8000-000000000002"]}')$$);
select pg_temp.p('remove_entry','{"planId":"70000000-0000-4000-8000-000000000001","entryId":"80000000-0000-4000-8000-000000000002"}');
reset role;
select pg_temp.ok('Entfernen löscht nicht', exists(select 1 from public.training_private_plan_entries where id='80000000-0000-4000-8000-000000000002' and removed_at is not null));
set local role authenticated;
select pg_temp.fails('unbekannte Schlüssel werden abgelehnt','GROUP_INVALID_REQUEST',
 $$select pg_temp.p('publish','{"planId":"70000000-0000-4000-8000-000000000001","x":1}')$$);
select pg_temp.p('cancel','{"planId":"70000000-0000-4000-8000-000000000001"}');
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.fails('abgesagter Plan: keine Zusage mehr','GROUP_CONFLICT',
 $$select pg_temp.p('respond','{"planId":"70000000-0000-4000-8000-000000000001","entryId":"80000000-0000-4000-8000-000000000001","response":"no"}')$$);
select pg_temp.ok('abgesagter Plan bleibt im Verlauf sichtbar',
 (select pg_temp.p('list','{"groupId":"10000000-0000-4000-8000-000000000001"}')->'plans'->0->>'status') = 'cancelled');

-- Konto der Hundeführerin gelöscht → eigene Zeile weg, Plan der anderen bleibt
reset role;
delete from auth.users where id='b2222222-2222-4222-8222-222222222222';
select pg_temp.ok('Konto gelöscht: eigene Zeile entfernt, Plan bleibt',
 exists(select 1 from public.training_private_plans where id='70000000-0000-4000-8000-000000000001')
 and not exists(select 1 from public.training_private_plan_entries where handler_id='b2222222-2222-4222-8222-222222222222'));

select count(*) as passed_assertions from qa_assertions;
rollback;
