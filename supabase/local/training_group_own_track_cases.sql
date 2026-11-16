-- LOCAL ONLY: local Docker/Unix socket. All fixtures roll back.
-- Verifies 20261116230000_training_group_own_track.sql on top of baseline, stage1, 2a, 2b, 3, 4a and contacts.
-- Issue #150: eigene Fährte im Gruppentraining (Leger:in = Hundeführer:in).
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
create function pg_temp.fails(label text, expected text, command text) returns void language plpgsql as $$
declare got text := null;
begin
 begin execute command; exception when others then got := sqlerrm; end;
 if got is distinct from expected then raise exception 'GROUP FAIL: % (expected %, got %)', label, expected, coalesce(got,'success'); end if;
 insert into qa_assertions values(label);
end $$;
create function pg_temp.as_user(p uuid) returns void language sql as $$
 select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claims', json_build_object('sub',p,'role','authenticated')::text, true);
$$;
create function pg_temp.g(a text, r jsonb) returns jsonb language sql as $$ select public.training_group_v1(a, r) $$;
create function pg_temp.j(a text, r jsonb) returns jsonb language sql as $$ select public.training_group_join_v1(a, r) $$;
create function pg_temp.s(a text, r jsonb) returns jsonb language sql as $$ select public.training_group_session_v1(a, r) $$;
create function pg_temp.t(a text, r jsonb) returns jsonb language sql as $$ select public.training_group_tracks_v1(a, r) $$;
create function pg_temp.e(a text, r jsonb) returns jsonb language sql as $$ select public.training_group_eval_v1(a, r) $$;
create or replace function public.subscription_verified_initiator_v1() returns boolean language sql stable as $$ select true $$;
grant execute on function public.subscription_verified_initiator_v1() to authenticated;
create temporary view qa_outbox as select user_id, kind, title, body, data from public.group_notify_outbox;
grant select on qa_outbox to authenticated;
create temporary view qa_tracks as select id, layer_id, handler_id, status, blind, package is not null has_package from public.training_private_tracks;
grant select on qa_tracks to authenticated;

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
select u,'authenticated','authenticated','own-'||n||'@local.test',now(),'{}','{}',now(),now(),false,false
from (values ('a1111111-1111-4111-8111-111111111111'::uuid,'sandra'),('b2222222-2222-4222-8222-222222222222','bea'),
 ('c3333333-3333-4333-8333-333333333333','carl')) t(u,n);
insert into public.profiles(id,full_name,username,role,push_token,locale) values
 ('a1111111-1111-4111-8111-111111111111','Sandra','ownsandra','user','ExponentPushToken[sandra]','de-CH'),
 ('b2222222-2222-4222-8222-222222222222','Bea','ownbea','user','ExponentPushToken[bea]','de-CH'),
 ('c3333333-3333-4333-8333-333333333333','Carl','owncarl','user','ExponentPushToken[carl]','de-CH')
 on conflict (id) do update set push_token=excluded.push_token, locale=excluded.locale;
insert into public.dogs(id,owner_id,name) values
 ('a0000000-0000-4000-8000-00000000000a','a1111111-1111-4111-8111-111111111111','Ayla'),
 ('a0000000-0000-4000-8000-0000000000a2','a1111111-1111-4111-8111-111111111111','Zora'),
 ('b0000000-0000-4000-8000-0000000000b1','b2222222-2222-4222-8222-222222222222','Luna');
create temporary table qa_pkg(v jsonb); grant all on qa_pkg to authenticated;
insert into qa_pkg values ('{"version":1,"startedAtMs":1763000000000,"finishedAtMs":1763000600000,"distanceM":175,"durationSeconds":600,"points":[{"lat":47.37,"lng":8.54,"t":1763000000000,"accuracy":3,"altitude":null,"speed":null,"heading":null,"breakBefore":false,"measuredDistanceM":null},{"lat":47.371,"lng":8.5415,"t":1763000300000,"accuracy":3,"altitude":null,"speed":null,"heading":null,"breakBefore":false,"measuredDistanceM":null},{"lat":47.3712,"lng":8.5418,"t":1763000600000,"accuracy":3,"altitude":null,"speed":null,"heading":null,"breakBefore":false,"measuredDistanceM":null}],"markers":[],"segments":[],"manualAngleGeometry":null}');
create temporary table qa_ev(v jsonb); grant all on qa_ev to authenticated;
insert into qa_ev values ('{"version":1,"laid":[{"lat":47.37,"lng":8.54},{"lat":47.371,"lng":8.5415}],"search":[{"lat":47.3701,"lng":8.5401},{"lat":47.3709,"lng":8.5414}],"metrics":{"distanceM":175,"durationS":600,"articlesFound":2,"articlesTotal":3,"deviationAvgM":4.5,"breaks":0}}');

select pg_temp.ok('constraint layer <> handler is gone',
 not exists(select 1 from pg_constraint where conname='training_private_tracks_people_check'));

set local role authenticated;
-- ── Gruppe mit drei Mitgliedern, Training mit Sandra (2 Hunde) und Bea; Carl nur Mitglied ──
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.g('create','{"groupId":"10000000-0000-4000-8000-000000000001","title":"Samstag","displayName":"Sandra"}');
create temporary table qa_code as select pg_temp.j('code_create','{"groupId":"10000000-0000-4000-8000-000000000001"}')->>'code' c;
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.j('request', jsonb_build_object('code',(select c from qa_code),'requestId','20000000-0000-4000-8000-000000000002','displayName','Bea'));
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.j('request', jsonb_build_object('code',(select c from qa_code),'requestId','20000000-0000-4000-8000-000000000003','displayName','Carl'));
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.j('approve','{"groupId":"10000000-0000-4000-8000-000000000001","requestId":"20000000-0000-4000-8000-000000000002"}');
select pg_temp.j('approve','{"groupId":"10000000-0000-4000-8000-000000000001","requestId":"20000000-0000-4000-8000-000000000003"}');
select pg_temp.s('open','{"groupId":"10000000-0000-4000-8000-000000000001","sessionId":"30000000-0000-4000-8000-000000000001","title":"Waldrand","ttlSeconds":7200,"dogId":"a0000000-0000-4000-8000-00000000000a"}');
select pg_temp.s('join','{"sessionId":"30000000-0000-4000-8000-000000000001","dogId":"a0000000-0000-4000-8000-0000000000a2","participationId":"40000000-0000-4000-8000-0000000000a2"}');
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.s('join','{"sessionId":"30000000-0000-4000-8000-000000000001","dogId":"b0000000-0000-4000-8000-0000000000b1","participationId":"40000000-0000-4000-8000-0000000000b1"}');

-- ── Bisheriger Fall «für andere» unverändert ────────────────────────────────
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.ok('for others: assign with blind still works',
 (pg_temp.t('assign','{"sessionId":"30000000-0000-4000-8000-000000000001","trackId":"50000000-0000-4000-8000-000000000001","handlerParticipationId":"40000000-0000-4000-8000-0000000000b1","blind":true}')->'track'->>'handlerUserId')='b2222222-2222-4222-8222-222222222222');
select pg_temp.t('submit', jsonb_build_object('trackId','50000000-0000-4000-8000-000000000001','package',(select v from qa_pkg)));
select pg_temp.ok('for others: handler is still notified',
 (select count(*)=1 from qa_outbox where user_id='b2222222-2222-4222-8222-222222222222' and kind='track_ready'));
select pg_temp.ok('for others: set_blind still works',
 (pg_temp.t('set_blind','{"trackId":"50000000-0000-4000-8000-000000000001","blind":false}')->'track'->>'blind')::boolean = false);

-- ── Eigene Fährte ───────────────────────────────────────────────────────────
select pg_temp.fails('own track can never be blind','GROUP_INVALID_REQUEST',
 $q$select pg_temp.t('assign','{"sessionId":"30000000-0000-4000-8000-000000000001","trackId":"50000000-0000-4000-8000-000000000009","handlerParticipationId":"40000000-0000-4000-8000-0000000000a2","blind":true}')$q$);
create temporary table qa_own as select pg_temp.t('assign','{"sessionId":"30000000-0000-4000-8000-000000000001","trackId":"50000000-0000-4000-8000-000000000002","handlerParticipationId":"40000000-0000-4000-8000-0000000000a2","blind":false}')->'track' v;
select pg_temp.ok('own track: layer = handler, chosen own dog, laying',
 (select v->>'layerUserId'=v->>'handlerUserId' and v->>'layerUserId'='a1111111-1111-4111-8111-111111111111'
   and v->>'dogId'='a0000000-0000-4000-8000-0000000000a2' and v->>'status'='laying' and (v->>'blind')::boolean=false from qa_own));
select pg_temp.ok('own track: same request again returns the same track',
 (pg_temp.t('assign','{"sessionId":"30000000-0000-4000-8000-000000000001","trackId":"50000000-0000-4000-8000-000000000002","handlerParticipationId":"40000000-0000-4000-8000-0000000000a2","blind":false}')->'track'->>'trackId')='50000000-0000-4000-8000-000000000002');
select pg_temp.fails('own track: blind cannot be switched on later','GROUP_INVALID_REQUEST',
 $q$select pg_temp.t('set_blind','{"trackId":"50000000-0000-4000-8000-000000000002","blind":true}')$q$);
create temporary table qa_laid as select pg_temp.t('submit', jsonb_build_object('trackId','50000000-0000-4000-8000-000000000002','package',(select v from qa_pkg)))->'track' v;
select pg_temp.ok('own track: lying with rectangular area and distance for myself',
 (select v->>'status'='lying' and jsonb_array_length(v->'area'->'polygon')=4 and (v->>'distanceM')::numeric=175 from qa_laid));
select pg_temp.ok('own track: no notification to myself',
 not exists(select 1 from qa_outbox where user_id='a1111111-1111-4111-8111-111111111111' and kind in ('track_ready','track_searched')));
select pg_temp.ok('own track: nobody else is notified either',
 (select count(*)=1 from qa_outbox where kind='track_ready'));
select pg_temp.ok('own track: I can fetch my exact course',
 pg_temp.t('fetch','{"trackId":"50000000-0000-4000-8000-000000000002"}')->'package' = (select v from qa_pkg));

-- ── Liste: neue App mit includeOwn, ältere App ohne ─────────────────────────
select pg_temp.ok('new app (includeOwn) sees both tracks',
 jsonb_array_length(pg_temp.t('list','{"sessionId":"30000000-0000-4000-8000-000000000001","includeOwn":true}')->'tracks')=2);
select pg_temp.ok('older app (no includeOwn) gets only tracks with layer <> handler',
 (select count(*)=1 and bool_and(x->>'layerUserId'<>x->>'handlerUserId')
  from jsonb_array_elements(pg_temp.t('list','{"sessionId":"30000000-0000-4000-8000-000000000001"}')->'tracks') x));
select pg_temp.fails('includeOwn must be true','GROUP_INVALID_REQUEST',
 $q$select pg_temp.t('list','{"sessionId":"30000000-0000-4000-8000-000000000001","includeOwn":false}')$q$);
select pg_temp.fails('unknown list keys are still rejected','GROUP_INVALID_REQUEST',
 $q$select pg_temp.t('list','{"sessionId":"30000000-0000-4000-8000-000000000001","x":true}')$q$);

-- ── Die Gruppe sieht nur die Fläche ─────────────────────────────────────────
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
create temporary table qa_bea as select x from jsonb_array_elements(pg_temp.t('list','{"sessionId":"30000000-0000-4000-8000-000000000001","includeOwn":true}')->'tracks') x
 where x->>'trackId'='50000000-0000-4000-8000-000000000002';
select pg_temp.ok('others see status and area of an own track, no distance',
 (select count(*)=1 and min(x->>'status')='lying' and bool_and(x->'area' ? 'polygon') and bool_and(x->'distanceM'='null'::jsonb) from qa_bea));
select pg_temp.ok('area carries no course, markers or points',
 (select bool_and((select array_agg(k order by k) from jsonb_object_keys(x->'area') k)=array['centerLat','centerLng','polygon','radiusM']) from qa_bea));
select pg_temp.fails('others cannot fetch the exact course of an own track','GROUP_UNAVAILABLE',
 $q$select pg_temp.t('fetch','{"trackId":"50000000-0000-4000-8000-000000000002"}')$q$);
select pg_temp.fails('others cannot start the search of an own track','GROUP_UNAVAILABLE',
 $q$select pg_temp.t('search_start','{"trackId":"50000000-0000-4000-8000-000000000002"}')$q$);
select pg_temp.fails('others cannot cancel an own track','GROUP_UNAVAILABLE',
 $q$select pg_temp.t('cancel','{"trackId":"50000000-0000-4000-8000-000000000002"}')$q$);
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.ok('group member outside the training sees the list like before',
 jsonb_array_length(pg_temp.t('list','{"sessionId":"30000000-0000-4000-8000-000000000001","includeOwn":true}')->'tracks')=2);
select pg_temp.fails('member outside the training cannot lay an own track','GROUP_UNAVAILABLE',
 $q$select pg_temp.t('assign','{"sessionId":"30000000-0000-4000-8000-000000000001","trackId":"50000000-0000-4000-8000-000000000008","handlerParticipationId":"40000000-0000-4000-8000-0000000000b1","blind":false}')$q$);

-- ── Für andere legen, während die eigene Fährte liegt (Server erlaubt es) ───
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.ok('laying for others stays possible while my own track lies',
 (pg_temp.t('assign','{"sessionId":"30000000-0000-4000-8000-000000000001","trackId":"50000000-0000-4000-8000-000000000003","handlerParticipationId":"40000000-0000-4000-8000-0000000000b1","blind":false}')->'track'->>'status')='laying');
select pg_temp.t('cancel','{"trackId":"50000000-0000-4000-8000-000000000003"}');

-- ── Absuche der eigenen Fährte, Auswertung teilen ───────────────────────────
select pg_temp.ok('own track: I start my own search',
 (pg_temp.t('search_start','{"trackId":"50000000-0000-4000-8000-000000000002"}')->'track'->>'status')='searching');
select pg_temp.ok('own track: I finish my own search',
 (pg_temp.t('searched','{"trackId":"50000000-0000-4000-8000-000000000002"}')->'track'->>'status')='searched');
select pg_temp.ok('own track: still no notification to myself after the search',
 not exists(select 1 from qa_outbox where user_id='a1111111-1111-4111-8111-111111111111' and kind in ('track_ready','track_searched')));
select pg_temp.ok('own track: evaluation can be shared, I am not my own recipient candidate',
 (select (v->>'shared')::boolean and not exists(select 1 from jsonb_array_elements(v->'candidates') c where c->>'userId'='a1111111-1111-4111-8111-111111111111' or (c->>'isLayer')::boolean)
  from (select pg_temp.e('share', jsonb_build_object('trackId','50000000-0000-4000-8000-000000000002','recipientUserIds','["b2222222-2222-4222-8222-222222222222"]'::jsonb,'group',false,'evaluation',(select v from qa_ev))) v) q));
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.ok('shared evaluation of an own track is readable for the recipient',
 (pg_temp.e('fetch','{"trackId":"50000000-0000-4000-8000-000000000002"}')->'evaluation'->>'handlerUserId')='a1111111-1111-4111-8111-111111111111');

-- ── Hund abmelden beendet die offene eigene Fährte dieses Hundes ────────────
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.t('assign','{"sessionId":"30000000-0000-4000-8000-000000000001","trackId":"50000000-0000-4000-8000-000000000004","handlerParticipationId":"40000000-0000-4000-8000-0000000000a2","blind":false}');
select pg_temp.s('leave','{"sessionId":"30000000-0000-4000-8000-000000000001","participationId":"40000000-0000-4000-8000-0000000000a2"}');
select pg_temp.ok('removing the dog revokes its open own track, searched one stays',
 (select status from qa_tracks where id='50000000-0000-4000-8000-000000000004')='revoked'
 and (select status from qa_tracks where id='50000000-0000-4000-8000-000000000002')='searched');

select pg_temp.ok('tracks RPC still for authenticated only',
 has_function_privilege('authenticated','public.training_group_tracks_v1(text,jsonb)','execute')
 and not has_function_privilege('anon','public.training_group_tracks_v1(text,jsonb)','execute'));

select count(*) || ' group own-track assertions passed' from qa_assertions;
rollback;
