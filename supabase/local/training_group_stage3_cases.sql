-- LOCAL ONLY: local Docker/Unix socket. All fixtures roll back.
-- Verifies 20261116170000_training_group_stage3.sql on top of baseline, stage1, 2a, 2b and contacts.
\set ON_ERROR_STOP on
begin;
do $$ begin if inet_server_addr() is not null then raise exception 'Local Unix socket required'; end if; end $$;
create temporary table qa_assertions(label text);
grant all on qa_assertions to authenticated, anon;
create function pg_temp.ok(label text, condition boolean) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'GROUP FAIL: %',label; end if;
 insert into qa_assertions values(label);
end $$;
create function pg_temp.as_user(p uuid) returns void language sql as $$
 select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claims', json_build_object('sub',p,'role','authenticated')::text, true);
$$;
create function pg_temp.g(a text, r jsonb) returns jsonb language sql as $$ select public.training_group_v1(a, r) $$;
create function pg_temp.j(a text, r jsonb) returns jsonb language sql as $$ select public.training_group_join_v1(a, r) $$;
create function pg_temp.s(a text, r jsonb) returns jsonb language sql as $$ select public.training_group_session_v1(a, r) $$;
create function pg_temp.t(a text, r jsonb) returns jsonb language sql as $$ select public.training_group_tracks_v1(a, r) $$;
create function pg_temp.n(a text, r jsonb) returns jsonb language sql as $$ select public.training_group_notify_v1(a, r) $$;
create or replace function public.subscription_verified_initiator_v1() returns boolean language sql stable as $$ select true $$;
grant execute on function public.subscription_verified_initiator_v1() to authenticated;
create temporary view qa_outbox as select user_id, kind, title, body, data from public.group_notify_outbox;
grant select on qa_outbox to authenticated;

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
select u,'authenticated','authenticated','t3-'||n||'@local.test',now(),'{}','{}',now(),now(),false,false
from (values ('a1111111-1111-4111-8111-111111111111'::uuid,'layer'),('b2222222-2222-4222-8222-222222222222','handler'),
 ('c3333333-3333-4333-8333-333333333333','third'),('d4444444-4444-4444-8444-444444444444','notoken')) t(u,n);
insert into public.profiles(id,full_name,username,role,push_token,locale) values
 ('a1111111-1111-4111-8111-111111111111','Leger','t3layer','user','ExponentPushToken[layer]','de-CH'),
 ('b2222222-2222-4222-8222-222222222222','Führerin','t3handler','user','ExponentPushToken[handler]','gsw-CH'),
 ('c3333333-3333-4333-8333-333333333333','Dritte','t3third','user','ExponentPushToken[third]','fr-CH'),
 ('d4444444-4444-4444-8444-444444444444','Ohne','t3none','user',null,'de-CH')
 on conflict (id) do update set push_token=excluded.push_token, locale=excluded.locale;
insert into public.dogs(id,owner_id,name) values
 ('a0000000-0000-4000-8000-00000000000a','a1111111-1111-4111-8111-111111111111','Ayla'),
 ('b0000000-0000-4000-8000-0000000000b1','b2222222-2222-4222-8222-222222222222','Luna'),
 ('c0000000-0000-4000-8000-00000000000c','c3333333-3333-4333-8333-333333333333','Rex');

set local role authenticated;
-- ── Beitrittsanfrage ────────────────────────────────────────────────────────
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.g('create','{"groupId":"10000000-0000-4000-8000-000000000001","title":"Samstag","displayName":"Sandra"}');
create temporary table qa_code as select pg_temp.j('code_create','{"groupId":"10000000-0000-4000-8000-000000000001"}')->>'code' c;
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.j('request', jsonb_build_object('code',(select c from qa_code),'requestId','20000000-0000-4000-8000-000000000002','displayName','Bea'));
select pg_temp.ok('join request notifies the owner (German)',
 (select count(*)=1 and min(title)='Beitrittsanfrage' and min(body)='Bea möchte «Samstag» beitreten.' and min(data->>'type')='group'
  and min(data->>'groupId')='10000000-0000-4000-8000-000000000001'
  from qa_outbox where user_id='a1111111-1111-4111-8111-111111111111' and kind='join_request'));
select pg_temp.ok('requester gets nothing', not exists(select 1 from qa_outbox where user_id='b2222222-2222-4222-8222-222222222222'));
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.ok('settings default: three on, training start off',
 pg_temp.n('get','{}')->'settings' = '{"joinRequests":true,"trackReady":true,"trackSearched":true,"trainingStarted":false}'::jsonb);
select pg_temp.ok('owner switches join requests off',
 (pg_temp.n('set','{"joinRequests":false}')->'settings'->>'joinRequests')::boolean = false);
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.j('request', jsonb_build_object('code',(select c from qa_code),'requestId','20000000-0000-4000-8000-000000000003','displayName','Carl'));
select pg_temp.ok('switched off: no new join request notification',
 (select count(*) from qa_outbox where user_id='a1111111-1111-4111-8111-111111111111' and kind='join_request') = 1);
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.n('set','{"joinRequests":true}');
select pg_temp.j('approve','{"groupId":"10000000-0000-4000-8000-000000000001","requestId":"20000000-0000-4000-8000-000000000002"}');
select pg_temp.j('approve','{"groupId":"10000000-0000-4000-8000-000000000001","requestId":"20000000-0000-4000-8000-000000000003"}');

-- ── Gruppentraining gestartet: nur wer es eingeschaltet hat ────────────────
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.n('set','{"trainingStarted":true}');
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.s('open','{"groupId":"10000000-0000-4000-8000-000000000001","sessionId":"30000000-0000-4000-8000-000000000001","title":"Waldrand","ttlSeconds":7200,"dogId":"a0000000-0000-4000-8000-00000000000a"}');
select pg_temp.ok('training start only to members who opted in (French)',
 (select count(*)=1 and min(user_id::text)='c3333333-3333-4333-8333-333333333333' and min(title)='Entraînement en groupe lancé'
  from qa_outbox where kind='training_started'));

-- ── Fährte liegt / abgesucht ────────────────────────────────────────────────
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.s('join','{"sessionId":"30000000-0000-4000-8000-000000000001","dogId":"b0000000-0000-4000-8000-0000000000b1","participationId":"40000000-0000-4000-8000-0000000000b1"}');
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.t('assign','{"sessionId":"30000000-0000-4000-8000-000000000001","trackId":"50000000-0000-4000-8000-000000000001","handlerParticipationId":"40000000-0000-4000-8000-0000000000b1","blind":true}');
select pg_temp.ok('nothing while laying', not exists(select 1 from qa_outbox where kind='track_ready'));
create temporary table qa_pkg(v jsonb); grant all on qa_pkg to authenticated;
insert into qa_pkg values ('{"version":1,"startedAtMs":1763000000000,"finishedAtMs":1763000600000,"distanceM":175,"durationSeconds":600,"points":[{"lat":47.37,"lng":8.54,"t":1763000000000,"accuracy":3,"altitude":null,"speed":null,"heading":null,"breakBefore":false,"measuredDistanceM":null},{"lat":47.371,"lng":8.5415,"t":1763000300000,"accuracy":3,"altitude":null,"speed":null,"heading":null,"breakBefore":false,"measuredDistanceM":null},{"lat":47.3712,"lng":8.5418,"t":1763000600000,"accuracy":3,"altitude":null,"speed":null,"heading":null,"breakBefore":false,"measuredDistanceM":null}],"markers":[],"segments":[],"manualAngleGeometry":null}');
create temporary table qa_area as select pg_temp.t('submit', jsonb_build_object('trackId','50000000-0000-4000-8000-000000000001','package',(select v from qa_pkg)))->'track'->'area' a;
select pg_temp.ok('track ready notifies the handler (Swiss German, blind, dog name)',
 (select count(*)=1 and min(title)='Fährte für Luna liit' and min(body)='Vo Sandra · blind. D’Liegeziit lauft.'
  and min(data->>'trackId')='50000000-0000-4000-8000-000000000001'
  from qa_outbox where user_id='b2222222-2222-4222-8222-222222222222' and kind='track_ready'));
select pg_temp.ok('no location in any notification',
 not exists(select 1 from qa_outbox where body ~ '[0-9]+\.[0-9]{3}' or data ? 'lat' or data ? 'centerLat'));

-- ── Kantige Fläche ──────────────────────────────────────────────────────────
select pg_temp.ok('area is a rectangle with 4 corners',
 (select jsonb_array_length(a->'polygon')=4 from qa_area));
select pg_temp.ok('rectangle is north-aligned',
 (select (a->'polygon'->0->>'lat')=(a->'polygon'->1->>'lat') and (a->'polygon'->1->>'lng')=(a->'polygon'->2->>'lng')
   and (a->'polygon'->2->>'lat')=(a->'polygon'->3->>'lat') and (a->'polygon'->0->>'lng')=(a->'polygon'->3->>'lng') from qa_area));
select pg_temp.ok('rectangle contains the whole course with margin',
 (select (a->'polygon'->0->>'lat')::numeric < 47.37 - 0.0002 and (a->'polygon'->2->>'lat')::numeric > 47.3712 + 0.0002
   and (a->'polygon'->0->>'lng')::numeric < 8.54 - 0.0003 and (a->'polygon'->2->>'lng')::numeric > 8.5418 + 0.0003 from qa_area));
select pg_temp.ok('rectangle snaps to a 0.0005 degree grid in latitude',
 (select mod((a->'polygon'->0->>'lat')::numeric*10000, 5)=0 and mod((a->'polygon'->2->>'lat')::numeric*10000, 5)=0 from qa_area));
select pg_temp.ok('old fields stay for older apps', (select a ? 'centerLat' and a ? 'radiusM' from qa_area));

select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.t('search_start','{"trackId":"50000000-0000-4000-8000-000000000001"}');
select pg_temp.t('searched','{"trackId":"50000000-0000-4000-8000-000000000001"}');
select pg_temp.ok('searched notifies the layer (German)',
 (select count(*)=1 and min(title)='Abgesucht' and min(body)='Bea hat deine Fährte für Luna abgesucht.'
  from qa_outbox where user_id='a1111111-1111-4111-8111-111111111111' and kind='track_searched'));

-- ── Blockierung ─────────────────────────────────────────────────────────────
reset role;
insert into public.contact_blocks(blocker_id,blocked_id) values ('a1111111-1111-4111-8111-111111111111','c3333333-3333-4333-8333-333333333333');
select public.group_notify_enqueue('a1111111-1111-4111-8111-111111111111','c3333333-3333-4333-8333-333333333333','join_request','Carl','Samstag',null,'{}');
select pg_temp.ok('blocked people cause no notifications',
 (select count(*) from public.group_notify_outbox where user_id='a1111111-1111-4111-8111-111111111111' and kind='join_request') = 1);
select public.group_notify_enqueue('d4444444-4444-4444-8444-444444444444',null,'join_request','X','Y',null,'{}');
select pg_temp.ok('no push token: nothing queued', not exists(select 1 from public.group_notify_outbox where user_id='d4444444-4444-4444-8444-444444444444'));

-- ── Versand ohne http-Erweiterung ───────────────────────────────────────────
select pg_temp.ok('sender reports missing transport without failing', public.group_notify_send()->>'transport' = 'missing');
select pg_temp.ok('attempt counted, still pending', not exists(select 1 from public.group_notify_outbox where sent_at is not null)
 and not exists(select 1 from public.group_notify_outbox where attempts<>1));

-- ── Rechte ──────────────────────────────────────────────────────────────────
select pg_temp.ok('settings RPC for authenticated only',
 has_function_privilege('authenticated','public.training_group_notify_v1(text,jsonb)','execute')
 and not has_function_privilege('anon','public.training_group_notify_v1(text,jsonb)','execute'));
select pg_temp.ok('sender and enqueue closed to app roles',
 not has_function_privilege('authenticated','public.group_notify_send()','execute')
 and not has_function_privilege('authenticated','public.group_notify_enqueue(uuid,uuid,text,text,text,text,jsonb)','execute'));
select pg_temp.ok('outbox and settings tables closed to app roles',
 not has_table_privilege('authenticated','public.group_notify_outbox','select')
 and not has_table_privilege('authenticated','public.group_notify_settings','select'));

select count(*) || ' group stage-3 assertions passed' from qa_assertions;
rollback;
