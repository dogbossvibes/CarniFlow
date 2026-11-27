-- LOCAL ONLY: local Docker/Unix socket. All fixtures roll back.
-- Verifies 20261127120000_training_group_plan_notify.sql on top of stage3 and 20261126120000_training_group_plans.sql.
-- Spec 04 Vereinsmodus, PR D: Mitteilungen zu Trainingstagen.
\set ON_ERROR_STOP on
begin;
do $$ begin if inet_server_addr() is not null then raise exception 'Local Unix socket required'; end if; end $$;
create temporary table qa_assertions(label text);
grant all on qa_assertions to authenticated, anon;
create function pg_temp.ok(label text, condition boolean) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'NOTIFY FAIL: %',label; end if;
 insert into qa_assertions values(label);
end $$;
create function pg_temp.as_user(p uuid) returns void language sql as $$
 select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claims', json_build_object('sub',p,'role','authenticated')::text, true);
$$;
create function pg_temp.g(a text, r jsonb) returns jsonb language sql as $$ select public.training_group_v1(a, r) $$;
create function pg_temp.j(a text, r jsonb) returns jsonb language sql as $$ select public.training_group_join_v1(a, r) $$;
create function pg_temp.s(a text, r jsonb) returns jsonb language sql as $$ select public.training_group_session_v1(a, r) $$;
create function pg_temp.p(a text, r jsonb) returns jsonb language sql as $$ select public.training_group_plan_v1(a, r) $$;
create function pg_temp.n(a text, r jsonb) returns jsonb language sql as $$ select public.training_group_notify_v1(a, r) $$;
create or replace function public.subscription_verified_initiator_v1() returns boolean language sql stable as $$ select true $$;
grant execute on function public.subscription_verified_initiator_v1() to authenticated;
create temporary view qa_outbox as select o.user_id, o.kind, o.title, o.body, o.data from public.group_notify_outbox o
 where o.user_id in ('a1111111-1111-4111-8111-111111111111','b2222222-2222-4222-8222-222222222222','c3333333-3333-4333-8333-333333333333');
grant select on qa_outbox to authenticated;
create function pg_temp.count_kind(u uuid, k text) returns bigint language sql as $$ select count(*) from qa_outbox where user_id=u and kind=k $$;

select pg_temp.ok('neue Arten erlaubt',
 (select pg_get_constraintdef(oid) from pg_constraint where conname='group_notify_outbox_kind_check') like '%plan_lay_turn%');
select pg_temp.ok('Schalter plans vorhanden, Standard an',
 exists(select 1 from information_schema.columns where table_name='group_notify_settings' and column_name='plans' and column_default='true'));

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
select u,'authenticated','authenticated','pn-'||n||'@local.test',now(),'{}','{}',now(),now(),false,false
from (values ('a1111111-1111-4111-8111-111111111111'::uuid,'anna'),('b2222222-2222-4222-8222-222222222222','bea'),
 ('c3333333-3333-4333-8333-333333333333','carl')) t(u,n);
insert into public.profiles(id,full_name,username,role,push_token,locale) values
 ('a1111111-1111-4111-8111-111111111111','Anna','pnanna','user','ExponentPushToken[anna]','de-CH'),
 ('b2222222-2222-4222-8222-222222222222','Bea','pnbea','user','ExponentPushToken[bea]','fr-CH'),
 ('c3333333-3333-4333-8333-333333333333','Carl','pncarl','user','ExponentPushToken[carl]','de-CH')
 on conflict (id) do update set push_token=excluded.push_token, locale=excluded.locale;
insert into public.dogs(id,owner_id,name) values
 ('a0000000-0000-4000-8000-00000000000a','a1111111-1111-4111-8111-111111111111','Ayla'),
 ('b0000000-0000-4000-8000-0000000000b1','b2222222-2222-4222-8222-222222222222','Luna'),
 ('c0000000-0000-4000-8000-0000000000c1','c3333333-3333-4333-8333-333333333333','Rex');

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

-- Einstellungen: «plans» les- und setzbar
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.ok('Einstellung plans standardmässig an', (pg_temp.n('get','{}')->'settings'->>'plans')::boolean);

-- Entwurf: noch keine Mitteilung
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.p('create','{"groupId":"10000000-0000-4000-8000-000000000001","planId":"70000000-0000-4000-8000-000000000001","title":"Fährtentag","startsAtMs":1800000000000,"meetingPoint":"Geheimer Parkplatz"}');
select pg_temp.p('set_entry','{"planId":"70000000-0000-4000-8000-000000000001","entryId":"80000000-0000-4000-8000-000000000001","position":1,"handlerUserId":"b2222222-2222-4222-8222-222222222222","layerUserId":"a1111111-1111-4111-8111-111111111111","trackKind":"igp1","blind":false}');
select pg_temp.p('set_entry','{"planId":"70000000-0000-4000-8000-000000000001","entryId":"80000000-0000-4000-8000-000000000002","position":2,"handlerUserId":"a1111111-1111-4111-8111-111111111111","layerUserId":"c3333333-3333-4333-8333-333333333333","trackKind":"igp1","blind":false}');
reset role;
select pg_temp.ok('Entwurf: keine Mitteilung', not exists(select 1 from qa_outbox where kind like 'plan_%'));

-- Veröffentlichen → alle ausser der Person selbst; nie der Treffpunkt
set local role authenticated;
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.p('publish','{"planId":"70000000-0000-4000-8000-000000000001"}');
reset role;
select pg_temp.ok('veröffentlicht: Bea und Carl, nicht Anna',
 pg_temp.count_kind('b2222222-2222-4222-8222-222222222222','plan_published')=1 and pg_temp.count_kind('c3333333-3333-4333-8333-333333333333','plan_published')=1
 and pg_temp.count_kind('a1111111-1111-4111-8111-111111111111','plan_published')=0);
select pg_temp.ok('Text in der Sprache der Person, mit Plan-ID, ohne Treffpunkt',
 (select title from qa_outbox where user_id='b2222222-2222-4222-8222-222222222222' and kind='plan_published') = 'Nouvelle journée d’entraînement'
 and (select data->>'planId' from qa_outbox where user_id='b2222222-2222-4222-8222-222222222222' and kind='plan_published') = '70000000-0000-4000-8000-000000000001'
 and not exists(select 1 from qa_outbox where body like '%Parkplatz%' or title like '%Parkplatz%'));

-- Carl schaltet Trainingstage aus → keine Mitteilungen mehr an Carl
set local role authenticated;
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.n('set','{"plans":false}');
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.p('update','{"planId":"70000000-0000-4000-8000-000000000001","title":"Fährtentag neu","startsAtMs":1800003600000}');
reset role;
select pg_temp.ok('geändert: Bea (Startliste) bekommt es, Carl ausgeschaltet, Anna nie an sich selbst',
 pg_temp.count_kind('b2222222-2222-4222-8222-222222222222','plan_changed')=1 and pg_temp.count_kind('c3333333-3333-4333-8333-333333333333','plan_changed')=0
 and pg_temp.count_kind('a1111111-1111-4111-8111-111111111111','plan_changed')=0);

-- Nur Reihenfolge geändert: keine Mitteilung
set local role authenticated;
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.p('reorder','{"planId":"70000000-0000-4000-8000-000000000001","entryIds":["80000000-0000-4000-8000-000000000002","80000000-0000-4000-8000-000000000001"]}');
select pg_temp.p('reorder','{"planId":"70000000-0000-4000-8000-000000000001","entryIds":["80000000-0000-4000-8000-000000000001","80000000-0000-4000-8000-000000000002"]}');
reset role;
select pg_temp.ok('Reihenfolge allein: keine weitere Mitteilung', pg_temp.count_kind('b2222222-2222-4222-8222-222222222222','plan_changed')=1);

-- Tag starten → Leger:in der ersten offenen Zeile (Anna legt für Bea = Anna selbst handelt → keine an sich selbst)
update public.group_notify_settings set plans=true where user_id='c3333333-3333-4333-8333-333333333333';
set local role authenticated;
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.p('respond','{"planId":"70000000-0000-4000-8000-000000000001","entryId":"80000000-0000-4000-8000-000000000001","response":"yes","dogId":"b0000000-0000-4000-8000-0000000000b1"}');
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.s('open','{"groupId":"10000000-0000-4000-8000-000000000001","sessionId":"30000000-0000-4000-8000-000000000001","title":"Fährtentag","ttlSeconds":7200,"dogId":"a0000000-0000-4000-8000-00000000000a"}');
select pg_temp.p('link_session','{"planId":"70000000-0000-4000-8000-000000000001","sessionId":"30000000-0000-4000-8000-000000000001"}');
reset role;
select pg_temp.ok('Start: erste Leger:in ist die startende Person selbst → keine Mitteilung',
 pg_temp.count_kind('a1111111-1111-4111-8111-111111111111','plan_lay_turn')=0);

-- Fährte der ersten Zeile liegt → Carl (Leger:in Zeile 2) ist dran
insert into public.training_private_tracks(id,session_id,layer_id,handler_id,handler_participation,dog_id,blind,status,request)
 values ('50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','a1111111-1111-4111-8111-111111111111',
  'b2222222-2222-4222-8222-222222222222','30000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-0000000000b1',false,'laying','{}');
update public.training_private_plan_entries set track_id='50000000-0000-4000-8000-000000000001' where id='80000000-0000-4000-8000-000000000001';
update public.training_private_tracks set status='lying', package='{}'::jsonb, laid_at=clock_timestamp(), area='{}'::jsonb where id='50000000-0000-4000-8000-000000000001';
select pg_temp.ok('Fährte liegt: Carl ist dran mit Legen, Text nennt Hundeführer:in, nicht den Ort',
 pg_temp.count_kind('c3333333-3333-4333-8333-333333333333','plan_lay_turn')=1
 and (select body from qa_outbox where user_id='c3333333-3333-4333-8333-333333333333' and kind='plan_lay_turn') like '%Anna%');

-- Absagen → alle in der Startliste (Bea, Carl)
set local role authenticated;
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.p('cancel','{"planId":"70000000-0000-4000-8000-000000000001"}');
reset role;
select pg_temp.ok('abgesagt: Bea und Carl', pg_temp.count_kind('b2222222-2222-4222-8222-222222222222','plan_changed')=2
 and pg_temp.count_kind('c3333333-3333-4333-8333-333333333333','plan_changed')=1);

-- Eine Mitteilung verhindert nie eine Planänderung: Ausgang gesperrt → Plan trotzdem geändert
select pg_temp.ok('Auslöser sind security definer und fangen Fehler ab',
 (select bool_and(prosecdef) from pg_proc where proname in ('group_notify_plan_status','group_notify_plan_entry','group_notify_plan_track_lying')));

select count(*) as passed_assertions from qa_assertions;
rollback;
