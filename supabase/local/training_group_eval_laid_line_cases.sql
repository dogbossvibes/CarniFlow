-- LOCAL ONLY: local Docker/Unix socket. All fixtures roll back.
-- Verifies 20261116233000_training_group_eval_laid_line.sql (#146, Variante B) on top of stage4a, baseline, stage1, 2a, 2b, 3 and contacts.
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

-- ── Fährte A legt für B, B sucht ab ────────────────────────────────────────
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.s('open','{"groupId":"10000000-0000-4000-8000-000000000001","sessionId":"30000000-0000-4000-8000-000000000001","title":"Waldrand","ttlSeconds":7200,"dogId":"a0000000-0000-4000-8000-00000000000a"}');
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.s('join','{"sessionId":"30000000-0000-4000-8000-000000000001","dogId":"b0000000-0000-4000-8000-0000000000b1","participationId":"40000000-0000-4000-8000-0000000000b1"}');
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.t('assign','{"sessionId":"30000000-0000-4000-8000-000000000001","trackId":"50000000-0000-4000-8000-000000000001","handlerParticipationId":"40000000-0000-4000-8000-0000000000b1","blind":false}');
select pg_temp.t('submit', jsonb_build_object('trackId','50000000-0000-4000-8000-000000000001','package','{"version":1,"startedAtMs":1763000000000,"finishedAtMs":1763000600000,"distanceM":175,"durationSeconds":600,"points":[{"lat":47.37,"lng":8.54,"t":1763000000000,"accuracy":3,"altitude":null,"speed":null,"heading":null,"breakBefore":false,"measuredDistanceM":null},{"lat":47.371,"lng":8.5415,"t":1763000600000,"accuracy":3,"altitude":null,"speed":null,"heading":null,"breakBefore":false,"measuredDistanceM":null}],"markers":[],"segments":[],"manualAngleGeometry":null}'::jsonb));
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.t('search_start','{"trackId":"50000000-0000-4000-8000-000000000001"}');
select pg_temp.t('searched','{"trackId":"50000000-0000-4000-8000-000000000001"}');

create function pg_temp.share_pkg(pkg jsonb) returns jsonb language sql as $$
 select pg_temp.e('share', jsonb_build_object('trackId','50000000-0000-4000-8000-000000000001','recipientUserIds','["c3333333-3333-4333-8333-333333333333"]'::jsonb,'group',false,'evaluation',pkg)) $$;
create function pg_temp.fetched() returns jsonb language sql as $$
 select pg_temp.e('fetch','{"trackId":"50000000-0000-4000-8000-000000000001"}')->'evaluation' $$;

-- ── Fremd gelegt (A legt, B sucht ab): Stand ───────────────────────────────
select pg_temp.ok('state tells the handler that the laid line is not shared',
 (pg_temp.e('get','{"trackId":"50000000-0000-4000-8000-000000000001"}')->>'laidLineShared')::boolean = false);

-- ── Ältere App sendet die gelegte Linie mit: Server verwirft sie ───────────
select pg_temp.ok('old client: share with laid line is accepted', (pg_temp.share('["c3333333-3333-4333-8333-333333333333"]',false,true)->>'shared')::boolean);
reset role;
select pg_temp.ok('old client: laid line is not stored, search and metrics are',
 (select jsonb_array_length(package->'laid')=0 and jsonb_array_length(package->'search')=2 and (package->'metrics'->>'articlesFound')::int=2
  from public.training_private_evaluations where track_id='50000000-0000-4000-8000-000000000001'));
set local role authenticated;
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.ok('recipient gets search and metrics without the laid line',
 (select jsonb_array_length(x->'laid')=0 and jsonb_array_length(x->'search')=2 and (x->'metrics'->>'distanceM')::int=175
   and x->>'layerUserId'='a1111111-1111-4111-8111-111111111111' and x->>'handlerUserId'='b2222222-2222-4222-8222-222222222222' from (select pg_temp.fetched() x) q));
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.ok('handler herself also gets no laid line back from the server',
 jsonb_array_length(pg_temp.fetched()->'laid')=0);

-- ── Ältere App sendet beim Ändern erneut ein Paket ─────────────────────────
select pg_temp.share('["c3333333-3333-4333-8333-333333333333"]',true,true);
reset role;
select pg_temp.ok('old client: update with a package does not store the laid line either',
 (select jsonb_array_length(package->'laid')=0 and shared_to_group from public.training_private_evaluations where track_id='50000000-0000-4000-8000-000000000001'));

-- ── Bestandszeile von vor der Migration: Linie liegt noch im Paket ─────────
update public.training_private_evaluations set package=(select v from qa_ev) where track_id='50000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.ok('existing row: stored laid line is no longer delivered',
 (select jsonb_array_length(x->'laid')=0 and jsonb_array_length(x->'search')=2 from (select pg_temp.fetched() x) q));
select pg_temp.ok('existing row: list stays without lines',
 (select not (x->0 ? 'laid') and not (x->0 ? 'search') and (x->0->'metrics'->>'breaks')::int=1
  from (select pg_temp.e('list','{"groupId":"10000000-0000-4000-8000-000000000001"}')->'evaluations' x) q));
reset role;
select pg_temp.ok('existing row: nothing was deleted or rewritten by reading',
 (select jsonb_array_length(package->'laid')=2 from public.training_private_evaluations where track_id='50000000-0000-4000-8000-000000000001'));
set local role authenticated;

-- ── Neue App: sendet bei fremd gelegter Fährte keine gelegte Linie ─────────
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.share('[]',false,false);
select pg_temp.ok('new client: empty laid line is accepted',
 (pg_temp.share_pkg((select jsonb_set(v,'{laid}','[]') from qa_ev))->>'shared')::boolean);
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.ok('new client: recipient gets search and metrics',
 (select jsonb_array_length(x->'laid')=0 and jsonb_array_length(x->'search')=2 from (select pg_temp.fetched() x) q));
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.share('[]',false,false);
select pg_temp.fails('a laid line with a single point stays invalid','GROUP_INVALID_REQUEST',
 $q$select pg_temp.share_pkg((select jsonb_set(v,'{laid}','[{"lat":47.37,"lng":8.54}]') from qa_ev))$q$);
select pg_temp.fails('laid must still be a list','GROUP_INVALID_REQUEST',
 $q$select pg_temp.share_pkg((select jsonb_set(v,'{laid}','null') from qa_ev))$q$);
select pg_temp.fails('the search is still required','GROUP_INVALID_REQUEST',
 $q$select pg_temp.share_pkg((select jsonb_set(v,'{search}','[]') from qa_ev))$q$);
select pg_temp.fails('extra fields are still rejected','GROUP_INVALID_REQUEST',
 $q$select pg_temp.share_pkg((select v||'{"notes":"x"}' from qa_ev))$q$);

-- ── Selbst gelegt (Leger:in = Hundeführer:in, wie bei #150): Linie bleibt ──
-- Die Zuweisung an sich selbst erlaubt erst #150 (PR #151 hebt auch die Tabellenregel auf). Hier wird die
-- Regel nur in dieser Transaktion aufgehoben (wird zurückgerollt) und die Fährte direkt so gesetzt.
reset role;
alter table public.training_private_tracks drop constraint if exists training_private_tracks_people_check;
update public.training_private_tracks set layer_id=handler_id where id='50000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.ok('own track: state says the laid line is shared',
 (pg_temp.e('get','{"trackId":"50000000-0000-4000-8000-000000000001"}')->>'laidLineShared')::boolean);
select pg_temp.ok('own track: share with laid line', (pg_temp.share('["c3333333-3333-4333-8333-333333333333"]',false,true)->>'shared')::boolean);
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.ok('own track: recipient gets both lines',
 (select jsonb_array_length(x->'laid')=2 and jsonb_array_length(x->'search')=2 and x->>'layerUserId'=x->>'handlerUserId' from (select pg_temp.fetched() x) q));
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.ok('own track: an empty laid line is allowed too',
 (pg_temp.share_pkg((select jsonb_set(v,'{laid}','[]') from qa_ev))->>'shared')::boolean);
-- Fährte nach 7 Tagen gelöscht: Stand kommt aus der Auswertung
reset role;
delete from public.training_private_tracks where id='50000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.ok('own track purged: state still says the laid line is shared',
 (pg_temp.e('get','{"trackId":"50000000-0000-4000-8000-000000000001"}')->>'laidLineShared')::boolean);

-- ── Rechte unverändert ─────────────────────────────────────────────────────
reset role;
select pg_temp.ok('RPC for authenticated only',
 has_function_privilege('authenticated','public.training_group_eval_v1(text,jsonb)','execute')
 and not has_function_privilege('anon','public.training_group_eval_v1(text,jsonb)','execute'));
select pg_temp.ok('helpers closed to app roles',
 not has_function_privilege('authenticated','public.training_private_evaluation_package(jsonb)','execute')
 and not has_function_privilege('authenticated','public.training_private_evaluation_state(uuid,uuid,uuid,uuid)','execute')
 and not has_function_privilege('authenticated','public.training_private_evaluation_json(public.training_private_evaluations,uuid,boolean)','execute'));

select count(*) || ' group evaluation laid-line assertions passed' from qa_assertions;
select 'GROUP_EVAL_LAID_LINE|PASS|assertions=' || count(*) from qa_assertions;
rollback;
