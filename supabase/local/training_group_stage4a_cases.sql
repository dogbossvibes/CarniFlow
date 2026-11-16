-- LOCAL ONLY: local Docker/Unix socket. All fixtures roll back.
-- Verifies 20261116210000_training_group_stage4a.sql on top of baseline, stage1, 2a, 2b, 3 and contacts.
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

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
select u,'authenticated','authenticated','t4-'||n||'@local.test',now(),'{}','{}',now(),now(),false,false
from (values ('a1111111-1111-4111-8111-111111111111'::uuid,'owner'),('b2222222-2222-4222-8222-222222222222','handler'),
 ('c3333333-3333-4333-8333-333333333333','trainer'),('d4444444-4444-4444-8444-444444444444','outsider')) t(u,n);
insert into public.dogs(id,owner_id,name) values
 ('a0000000-0000-4000-8000-00000000000a','a1111111-1111-4111-8111-111111111111','Ayla'),
 ('b0000000-0000-4000-8000-0000000000b1','b2222222-2222-4222-8222-222222222222','Luna');
create temporary table qa_ev(v jsonb); grant all on qa_ev to authenticated;
insert into qa_ev values ('{"version":1,"laid":[{"lat":47.37,"lng":8.54},{"lat":47.371,"lng":8.5415}],"search":[{"lat":47.3701,"lng":8.5401},{"lat":47.3709,"lng":8.5414,"breakBefore":true}],"metrics":{"distanceM":175,"durationS":600,"articlesFound":2,"articlesTotal":3,"deviationAvgM":4.5,"breaks":1}}');
create function pg_temp.share(r text, grp boolean, ev boolean) returns jsonb language sql as $$
 select pg_temp.e('share', jsonb_build_object('trackId','50000000-0000-4000-8000-000000000001','recipientUserIds',r::jsonb,'group',grp,
  'evaluation',case when ev then (select v from qa_ev) else 'null'::jsonb end)) $$;

set local role authenticated;
-- ── Gruppe mit drei Mitgliedern ─────────────────────────────────────────────
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.g('create','{"groupId":"10000000-0000-4000-8000-000000000001","title":"Samstag","displayName":"Sandra"}');
create temporary table qa_code as select pg_temp.j('code_create','{"groupId":"10000000-0000-4000-8000-000000000001"}')->>'code' c;
grant all on qa_code to authenticated;
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.j('request', jsonb_build_object('code',(select c from qa_code),'requestId','20000000-0000-4000-8000-000000000002','displayName','Bea'));
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.j('request', jsonb_build_object('code',(select c from qa_code),'requestId','20000000-0000-4000-8000-000000000003','displayName','Carla'));
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.j('approve','{"groupId":"10000000-0000-4000-8000-000000000001","requestId":"20000000-0000-4000-8000-000000000002"}');
select pg_temp.j('approve','{"groupId":"10000000-0000-4000-8000-000000000001","requestId":"20000000-0000-4000-8000-000000000003"}');

-- ── Gruppeneinstellungen ────────────────────────────────────────────────────
select pg_temp.ok('share outside is off by default, old fields stay',
 (select (x->>'shareOutside')::boolean = false and x->'members'->0 ? 'isOrganizer' and x->'members'->0 ? 'role'
  from (select pg_temp.g('list','{}')->'groups'->0 x) q));
select pg_temp.ok('owner makes Carla trainer',
 (select (m->>'isTrainer')::boolean from jsonb_array_elements(pg_temp.e('set_trainer','{"groupId":"10000000-0000-4000-8000-000000000001","memberUserId":"c3333333-3333-4333-8333-333333333333","membershipId":"20000000-0000-4000-8000-000000000003","trainer":true}')->'group'->'members') m
  where m->>'userId'='c3333333-3333-4333-8333-333333333333'));
select pg_temp.fails('owner cannot make herself trainer','GROUP_UNAVAILABLE',
 $q$select pg_temp.e('set_trainer','{"groupId":"10000000-0000-4000-8000-000000000001","memberUserId":"a1111111-1111-4111-8111-111111111111","membershipId":"10000000-0000-4000-8000-000000000001","trainer":true}')$q$);
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.fails('member cannot assign trainer','GROUP_UNAVAILABLE',
 $q$select pg_temp.e('set_trainer','{"groupId":"10000000-0000-4000-8000-000000000001","memberUserId":"c3333333-3333-4333-8333-333333333333","membershipId":"20000000-0000-4000-8000-000000000003","trainer":false}')$q$);
select pg_temp.fails('member cannot change share outside','GROUP_UNAVAILABLE',
 $q$select pg_temp.e('set_share_outside','{"groupId":"10000000-0000-4000-8000-000000000001","value":true}')$q$);

-- ── Fährte A legt für B, B sucht ab ────────────────────────────────────────
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.s('open','{"groupId":"10000000-0000-4000-8000-000000000001","sessionId":"30000000-0000-4000-8000-000000000001","title":"Waldrand","ttlSeconds":7200,"dogId":"a0000000-0000-4000-8000-00000000000a"}');
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.s('join','{"sessionId":"30000000-0000-4000-8000-000000000001","dogId":"b0000000-0000-4000-8000-0000000000b1","participationId":"40000000-0000-4000-8000-0000000000b1"}');
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.t('assign','{"sessionId":"30000000-0000-4000-8000-000000000001","trackId":"50000000-0000-4000-8000-000000000001","handlerParticipationId":"40000000-0000-4000-8000-0000000000b1","blind":false}');
select pg_temp.t('submit', jsonb_build_object('trackId','50000000-0000-4000-8000-000000000001','package','{"version":1,"startedAtMs":1763000000000,"finishedAtMs":1763000600000,"distanceM":175,"durationSeconds":600,"points":[{"lat":47.37,"lng":8.54,"t":1763000000000,"accuracy":3,"altitude":null,"speed":null,"heading":null,"breakBefore":false,"measuredDistanceM":null},{"lat":47.371,"lng":8.5415,"t":1763000600000,"accuracy":3,"altitude":null,"speed":null,"heading":null,"breakBefore":false,"measuredDistanceM":null}],"markers":[],"segments":[],"manualAngleGeometry":null}'::jsonb));
select pg_temp.fails('layer cannot read the share state','GROUP_UNAVAILABLE',
 $q$select pg_temp.e('get','{"trackId":"50000000-0000-4000-8000-000000000001"}')$q$);
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.fails('no sharing before the search is done','GROUP_CONFLICT', $q$select pg_temp.share('["c3333333-3333-4333-8333-333333333333"]',false,true)$q$);
select pg_temp.t('search_start','{"trackId":"50000000-0000-4000-8000-000000000001"}');
select pg_temp.t('searched','{"trackId":"50000000-0000-4000-8000-000000000001"}');

-- ── Stand vor dem Teilen ───────────────────────────────────────────────────
create temporary table qa_state as select pg_temp.e('get','{"trackId":"50000000-0000-4000-8000-000000000001"}') v;
grant all on qa_state to authenticated;
select pg_temp.ok('nothing shared by default', (select (v->>'shared')::boolean=false and (v->>'group')::boolean=false and v->'recipientUserIds'='[]'::jsonb from qa_state));
select pg_temp.ok('layer listed first, trainer marked, handler not listed',
 (select v->'candidates'->0->>'userId'='a1111111-1111-4111-8111-111111111111' and (v->'candidates'->0->>'isLayer')::boolean
   and (v->'candidates'->1->>'isTrainer')::boolean and jsonb_array_length(v->'candidates')=2 from qa_state));
select pg_temp.ok('handler sees the group setting (off)', (select (v->>'shareOutside')::boolean=false from qa_state));

-- ── Teilen mit der Trainerin ───────────────────────────────────────────────
select pg_temp.fails('extra fields such as notes are rejected','GROUP_INVALID_REQUEST',
 $q$select pg_temp.e('share', jsonb_build_object('trackId','50000000-0000-4000-8000-000000000001','recipientUserIds','["c3333333-3333-4333-8333-333333333333"]'::jsonb,'group',false,'evaluation',(select v||'{"notes":"x"}' from qa_ev)))$q$);
select pg_temp.fails('outsiders cannot receive','GROUP_UNAVAILABLE', $q$select pg_temp.share('["d4444444-4444-4444-8444-444444444444"]',false,true)$q$);
select pg_temp.fails('handler cannot share with herself','GROUP_UNAVAILABLE', $q$select pg_temp.share('["b2222222-2222-4222-8222-222222222222"]',false,true)$q$);
select pg_temp.fails('first share needs the evaluation','GROUP_INVALID_REQUEST', $q$select pg_temp.share('["c3333333-3333-4333-8333-333333333333"]',false,false)$q$);
select pg_temp.ok('shared with the trainer only',
 (select (x->>'shared')::boolean and x->'recipientUserIds'='["c3333333-3333-4333-8333-333333333333"]'::jsonb
  from (select pg_temp.share('["c3333333-3333-4333-8333-333333333333"]',false,true) x) q));
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.ok('trainer lists it with names and metrics',
 (select jsonb_array_length(x)=1 and x->0->>'handlerName'='Bea' and x->0->>'dogName'='Luna' and x->0->>'layerName'='Sandra'
   and (x->0->'metrics'->>'articlesFound')::int=2 and not (x->0 ? 'search')
  from (select pg_temp.e('list','{"groupId":"10000000-0000-4000-8000-000000000001"}')->'evaluations' x) q));
select pg_temp.ok('trainer fetches both lines',
 (select jsonb_array_length(x->'laid')=2 and jsonb_array_length(x->'search')=2 and not (x->>'mine')::boolean
  from (select pg_temp.e('fetch','{"trackId":"50000000-0000-4000-8000-000000000001"}')->'evaluation' x) q));
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.ok('layer sees nothing without release',
 jsonb_array_length(pg_temp.e('list','{"groupId":"10000000-0000-4000-8000-000000000001"}')->'evaluations')=0);
select pg_temp.fails('layer cannot fetch without release','GROUP_UNAVAILABLE',
 $q$select pg_temp.e('fetch','{"trackId":"50000000-0000-4000-8000-000000000001"}')$q$);
select pg_temp.as_user('d4444444-4444-4444-8444-444444444444');
select pg_temp.fails('outsider cannot list','GROUP_UNAVAILABLE',
 $q$select pg_temp.e('list','{"groupId":"10000000-0000-4000-8000-000000000001"}')$q$);

-- ── Ganze Gruppe, später ohne neues Paket ──────────────────────────────────
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.ok('switch to whole group keeps the package', (pg_temp.share('[]',true,false)->>'group')::boolean);
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.ok('whole group: layer now sees it',
 jsonb_array_length(pg_temp.e('list','{"groupId":"10000000-0000-4000-8000-000000000001"}')->'evaluations')=1);
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.ok('trainer lost her single release but sees it via the group',
 jsonb_array_length(pg_temp.e('list','{"groupId":"10000000-0000-4000-8000-000000000001"}')->'evaluations')=1);

-- ── Verlassen ───────────────────────────────────────────────────────────────
select pg_temp.g('leave','{"groupId":"10000000-0000-4000-8000-000000000001","membershipId":"20000000-0000-4000-8000-000000000003"}');
select pg_temp.fails('who left the group loses access','GROUP_UNAVAILABLE',
 $q$select pg_temp.e('fetch','{"trackId":"50000000-0000-4000-8000-000000000001"}')$q$);
reset role;
select pg_temp.ok('leaving also ends the trainer role',
 not (select is_trainer from public.training_private_members where user_id='c3333333-3333-4333-8333-333333333333'));
set local role authenticated;

-- ── Widerruf ────────────────────────────────────────────────────────────────
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.ok('revoking everything deletes the evaluation', (pg_temp.share('[]',false,false)->>'shared')::boolean = false);
reset role;
select pg_temp.ok('nothing stored after revoke', not exists(select 1 from public.training_private_evaluations));
set local role authenticated;
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.share('[]',true,true);

-- ── Gruppeneinstellung ─────────────────────────────────────────────────────
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.ok('owner allows sharing outside',
 (pg_temp.e('set_share_outside','{"groupId":"10000000-0000-4000-8000-000000000001","value":true}')->'group'->>'shareOutside')::boolean);
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.ok('handler sees the new setting',
 (pg_temp.e('get','{"trackId":"50000000-0000-4000-8000-000000000001"}')->>'shareOutside')::boolean);

-- ── Löschen nach 30 Tagen, nicht vorher ────────────────────────────────────
reset role;
select public.training_private_tracks_purge();
select pg_temp.ok('fresh evaluation survives the purge', exists(select 1 from public.training_private_evaluations));
update public.training_private_evaluations set updated_at=clock_timestamp()-interval '31 days';
select public.training_private_tracks_purge();
select pg_temp.ok('old evaluation and its releases are purged',
 not exists(select 1 from public.training_private_evaluations) and not exists(select 1 from public.training_private_evaluation_grants));

-- ── Rechte ──────────────────────────────────────────────────────────────────
select pg_temp.ok('RPC for authenticated only',
 has_function_privilege('authenticated','public.training_group_eval_v1(text,jsonb)','execute')
 and not has_function_privilege('anon','public.training_group_eval_v1(text,jsonb)','execute'));
select pg_temp.ok('tables closed to app roles',
 not has_table_privilege('authenticated','public.training_private_evaluations','select')
 and not has_table_privilege('authenticated','public.training_private_evaluation_grants','select'));
select pg_temp.ok('helpers closed to app roles',
 not has_function_privilege('authenticated','public.training_private_evaluation_visible(uuid,uuid)','execute')
 and not has_function_privilege('authenticated','public.training_private_evaluation_package(jsonb)','execute'));

select count(*) || ' group stage-4a assertions passed' from qa_assertions;
rollback;
