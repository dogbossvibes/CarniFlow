-- LOCAL ONLY: local Docker/Unix socket. All fixtures roll back.
-- Verifies 20261113090000_training_group_stage2a.sql plus 20261116100000_training_group_stage2b.sql
-- (Paket im Format TrackTransferReference) on top of the baseline,
-- 20261112140000_training_group_stage1.sql and 20261111220000_contact_requests.sql.
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
create function pg_temp.ok_live(r jsonb) returns boolean language sql as $$ select (r->>'version')::int = 1 $$;
create function pg_temp.t(a text, r jsonb) returns jsonb language sql as $$ select public.training_group_tracks_v1(a, r) $$;
create or replace function public.subscription_verified_initiator_v1() returns boolean language sql stable as $$
 select coalesce(current_setting('qa.active', true), 'off') = 'on' $$;
grant execute on function public.subscription_verified_initiator_v1() to authenticated;

-- LAYER (Inhaberin, ACTIVE), HANDLER (zwei Hunde, ohne Abo), THIRD (ein Hund), OUT (nicht in der Gruppe).
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
select u,'authenticated','authenticated','t2-'||n||'@local.test',now(),'{}','{}',now(),now(),false,false
from (values ('a1111111-1111-4111-8111-111111111111'::uuid,'layer'),('b2222222-2222-4222-8222-222222222222','handler'),
 ('c3333333-3333-4333-8333-333333333333','third'),('d4444444-4444-4444-8444-444444444444','out')) t(u,n);
insert into public.dogs(id,owner_id,name) values
 ('a0000000-0000-4000-8000-00000000000a','a1111111-1111-4111-8111-111111111111','Ayla'),
 ('b0000000-0000-4000-8000-0000000000b1','b2222222-2222-4222-8222-222222222222','Luna'),
 ('b0000000-0000-4000-8000-0000000000b2','b2222222-2222-4222-8222-222222222222','Kira'),
 ('c0000000-0000-4000-8000-00000000000c','c3333333-3333-4333-8333-333333333333','Rex');
create temporary table qa_pkg(v jsonb); grant all on qa_pkg to authenticated;
insert into qa_pkg values ('{"version":1,"startedAtMs":1763000000000,"finishedAtMs":1763000600000,"distanceM":175,"durationSeconds":600,"points":[{"lat":47.37,"lng":8.54,"t":1763000000000,"accuracy":3,"altitude":null,"speed":null,"heading":null,"breakBefore":false,"measuredDistanceM":null},{"lat":47.371,"lng":8.5415,"t":1763000300000,"accuracy":3,"altitude":null,"speed":null,"heading":null,"breakBefore":false,"measuredDistanceM":null},{"lat":47.3712,"lng":8.5418,"t":1763000600000,"accuracy":3,"altitude":null,"speed":null,"heading":null,"breakBefore":false,"measuredDistanceM":null}],"markers":[],"segments":[],"manualAngleGeometry":null}');

set local role authenticated;
select set_config('qa.active','on',true);
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.g('create','{"groupId":"10000000-0000-4000-8000-000000000001","title":"Fährten","displayName":"Leger"}');
create temporary table qa_code as select pg_temp.j('code_create','{"groupId":"10000000-0000-4000-8000-000000000001"}')->>'code' c;
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.j('request', jsonb_build_object('code',(select c from qa_code),'requestId','20000000-0000-4000-8000-000000000002','displayName','Führerin'));
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.j('request', jsonb_build_object('code',(select c from qa_code),'requestId','20000000-0000-4000-8000-000000000003','displayName','Dritte'));
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.j('approve','{"groupId":"10000000-0000-4000-8000-000000000001","requestId":"20000000-0000-4000-8000-000000000002"}');
select pg_temp.j('approve','{"groupId":"10000000-0000-4000-8000-000000000001","requestId":"20000000-0000-4000-8000-000000000003"}');

-- ── Bis Mitternacht: bis 24 Stunden ─────────────────────────────────────────
select pg_temp.ok('group training can last up to 24 hours',
 pg_temp.s('open','{"groupId":"10000000-0000-4000-8000-000000000001","sessionId":"30000000-0000-4000-8000-000000000001","title":"Samstag","ttlSeconds":50000,"dogId":"a0000000-0000-4000-8000-00000000000a"}')->'session'->>'status' = 'active');
select pg_temp.fails('more than 24 hours is refused','GROUP_INVALID_REQUEST',
 $q$select pg_temp.s('open','{"groupId":"10000000-0000-4000-8000-000000000001","sessionId":"30000000-0000-4000-8000-000000000009","title":"X","ttlSeconds":90000,"dogId":"a0000000-0000-4000-8000-00000000000a"}')$q$);
select set_config('qa.active','off',true);

-- ── Mehrere Hunde ───────────────────────────────────────────────────────────
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.s('join','{"sessionId":"30000000-0000-4000-8000-000000000001","dogId":"b0000000-0000-4000-8000-0000000000b1","participationId":"40000000-0000-4000-8000-0000000000b1"}');
select pg_temp.ok('second own dog can join without ACTIVE',
 (select count(*) from jsonb_array_elements(pg_temp.s('join','{"sessionId":"30000000-0000-4000-8000-000000000001","dogId":"b0000000-0000-4000-8000-0000000000b2","participationId":"40000000-0000-4000-8000-0000000000b2"}')->'session'->'participants') p
  where p->>'userId'='b2222222-2222-4222-8222-222222222222') = 2);
select pg_temp.fails('same dog twice is a conflict','GROUP_CONFLICT',
 $q$select pg_temp.s('join','{"sessionId":"30000000-0000-4000-8000-000000000001","dogId":"b0000000-0000-4000-8000-0000000000b1","participationId":"40000000-0000-4000-8000-0000000000b9"}')$q$);
select pg_temp.fails('someone else''s dog is refused','GROUP_UNAVAILABLE',
 $q$select pg_temp.s('join','{"sessionId":"30000000-0000-4000-8000-000000000001","dogId":"c0000000-0000-4000-8000-00000000000c","participationId":"40000000-0000-4000-8000-0000000000b8"}')$q$);
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.s('join','{"sessionId":"30000000-0000-4000-8000-000000000001","dogId":"c0000000-0000-4000-8000-00000000000c","participationId":"40000000-0000-4000-8000-00000000000c"}');

-- ── Standort teilen ohne ACTIVE, Empfängerin mit zwei Hunden ─────────────────
reset role;
insert into public.training_live_maintenance_state(singleton,last_success_at,last_deleted,total_deleted,duration_ms,due_remaining_lower_bound)
 values(true,clock_timestamp(),0,0,0,0) on conflict (singleton) do update set last_success_at=excluded.last_success_at,due_remaining_lower_bound=0;
set local role authenticated;
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.ok('participant without ACTIVE starts location sharing to a person with two dogs',
 pg_temp.ok_live(public.training_group_live_v1('start','{"sessionId":"30000000-0000-4000-8000-000000000001","shareId":"60000000-0000-4000-8000-000000000001","dogId":"c0000000-0000-4000-8000-00000000000c","recipientUserIds":["b2222222-2222-4222-8222-222222222222"],"ttlSeconds":600}')));

-- ── Fährte zuteilen ─────────────────────────────────────────────────────────
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.ok('layer assigns a blind track to Luna',
 (select x->>'status'='laying' and (x->>'blind')::boolean and x->>'dogId'='b0000000-0000-4000-8000-0000000000b1' and x->'area'='null'::jsonb
  from (select pg_temp.t('assign','{"sessionId":"30000000-0000-4000-8000-000000000001","trackId":"50000000-0000-4000-8000-000000000001","handlerParticipationId":"40000000-0000-4000-8000-0000000000b1","blind":true}')->'track' x) q));
select pg_temp.ok('assign is idempotent',
 pg_temp.t('assign','{"sessionId":"30000000-0000-4000-8000-000000000001","trackId":"50000000-0000-4000-8000-000000000001","handlerParticipationId":"40000000-0000-4000-8000-0000000000b1","blind":true}')->'track'->>'trackId' = '50000000-0000-4000-8000-000000000001');
-- Issue #150 (20261116230000_training_group_own_track.sql): die eigene Fährte ist erlaubt, aber nie «blind».
-- Die erlaubten Fälle stehen in training_group_own_track_cases.sql.
select pg_temp.fails('layer cannot assign a blind track to own dog','GROUP_INVALID_REQUEST',
 $q$select pg_temp.t('assign','{"sessionId":"30000000-0000-4000-8000-000000000001","trackId":"50000000-0000-4000-8000-000000000002","handlerParticipationId":"30000000-0000-4000-8000-000000000001","blind":true}')$q$);
select pg_temp.as_user('d4444444-4444-4444-8444-444444444444');
select pg_temp.fails('outsider cannot list tracks','GROUP_UNAVAILABLE',
 $q$select pg_temp.t('list','{"sessionId":"30000000-0000-4000-8000-000000000001"}')$q$);
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.fails('handler cannot change blind','GROUP_UNAVAILABLE',
 $q$select pg_temp.t('set_blind','{"trackId":"50000000-0000-4000-8000-000000000001","blind":false}')$q$);
select pg_temp.fails('nothing to fetch while laying','GROUP_UNAVAILABLE',
 $q$select pg_temp.t('fetch','{"trackId":"50000000-0000-4000-8000-000000000001"}')$q$);

-- ── Speichern: Fläche und Liegezeit ─────────────────────────────────────────
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.fails('invalid package is refused','GROUP_INVALID_REQUEST',
 $q$select pg_temp.t('submit','{"trackId":"50000000-0000-4000-8000-000000000001","package":{"version":1,"points":[],"markers":[],"distanceM":null,"date":null}}')$q$);
select pg_temp.fails('old exchange format is refused','GROUP_INVALID_REQUEST',
 $q$select pg_temp.t('submit','{"trackId":"50000000-0000-4000-8000-000000000001","package":{"version":1,"points":[{"lat":1,"lng":1,"breakBefore":false},{"lat":1.1,"lng":1,"breakBefore":false}],"markers":[],"distanceM":null,"date":null}}')$q$);
select pg_temp.ok('submit starts lying time and builds a coarse area',
 (select x->>'status'='lying' and (x->>'laidAtMs') is not null and (x->'area'->>'radiusM')::int >= 50 and (x->'area'->>'radiusM')::int % 25 = 0
  and x->'area'->>'centerLat' = '47.3706'
  from (select pg_temp.t('submit', jsonb_build_object('trackId','50000000-0000-4000-8000-000000000001','package',(select v from qa_pkg)))->'track' x) q));
select pg_temp.ok('submit is idempotent with the same package',
 pg_temp.t('submit', jsonb_build_object('trackId','50000000-0000-4000-8000-000000000001','package',(select v from qa_pkg)))->'track'->>'status' = 'lying');
select pg_temp.fails('a different package after submit is a conflict','GROUP_CONFLICT',
 $q$select pg_temp.t('submit', jsonb_build_object('trackId','50000000-0000-4000-8000-000000000001','package',jsonb_set((select v from qa_pkg),'{distanceM}','999')))$q$);

-- ── Sichtbarkeit ────────────────────────────────────────────────────────────
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.ok('third person sees status and area only',
 (select x->'area' is not null and x->'distanceM'='null'::jsonb and not (x ? 'package')
  from (select pg_temp.t('list','{"sessionId":"30000000-0000-4000-8000-000000000001"}')->'tracks'->0 x) q));
select pg_temp.ok('list never contains the exact course',
 position('breakBefore' in pg_temp.t('list','{"sessionId":"30000000-0000-4000-8000-000000000001"}')::text) = 0);
select pg_temp.fails('third person cannot fetch the exact course','GROUP_UNAVAILABLE',
 $q$select pg_temp.t('fetch','{"trackId":"50000000-0000-4000-8000-000000000001"}')$q$);
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.ok('handler fetches the exact course and sees distance',
 (select jsonb_array_length(f->'package'->'points')=3 and (f->'track'->>'distanceM')::numeric=175 from (select pg_temp.t('fetch','{"trackId":"50000000-0000-4000-8000-000000000001"}') f) q));
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.ok('layer can still fetch',
 pg_temp.t('fetch','{"trackId":"50000000-0000-4000-8000-000000000001"}') ? 'package');
select pg_temp.ok('layer switches blind off before search',
 (pg_temp.t('set_blind','{"trackId":"50000000-0000-4000-8000-000000000001","blind":false}')->'track'->>'blind')::boolean = false);
select pg_temp.t('set_blind','{"trackId":"50000000-0000-4000-8000-000000000001","blind":true}');

-- ── Absuche ─────────────────────────────────────────────────────────────────
select pg_temp.fails('layer cannot start the search','GROUP_UNAVAILABLE',
 $q$select pg_temp.t('search_start','{"trackId":"50000000-0000-4000-8000-000000000001"}')$q$);
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.fails('cannot finish before starting','GROUP_CONFLICT',
 $q$select pg_temp.t('searched','{"trackId":"50000000-0000-4000-8000-000000000001"}')$q$);
select pg_temp.ok('handler starts the search; lying time stops',
 (select x->>'status'='searching' and (x->>'searchStartedAtMs') is not null from (select pg_temp.t('search_start','{"trackId":"50000000-0000-4000-8000-000000000001"}')->'track' x) q));
select pg_temp.ok('search_start is idempotent',
 pg_temp.t('search_start','{"trackId":"50000000-0000-4000-8000-000000000001"}')->'track'->>'status'='searching');
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.fails('blind cannot change after search started','GROUP_CONFLICT',
 $q$select pg_temp.t('set_blind','{"trackId":"50000000-0000-4000-8000-000000000001","blind":false}')$q$);
select pg_temp.fails('cannot cancel after search started','GROUP_CONFLICT',
 $q$select pg_temp.t('cancel','{"trackId":"50000000-0000-4000-8000-000000000001"}')$q$);
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.ok('handler marks searched',
 pg_temp.t('searched','{"trackId":"50000000-0000-4000-8000-000000000001"}')->'track'->>'status'='searched');

-- ── Abbrechen und Abmelden ──────────────────────────────────────────────────
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.t('assign','{"sessionId":"30000000-0000-4000-8000-000000000001","trackId":"50000000-0000-4000-8000-000000000003","handlerParticipationId":"40000000-0000-4000-8000-0000000000b2","blind":false}');
select pg_temp.t('assign','{"sessionId":"30000000-0000-4000-8000-000000000001","trackId":"50000000-0000-4000-8000-000000000004","handlerParticipationId":"40000000-0000-4000-8000-00000000000c","blind":false}');
select pg_temp.ok('layer cancels an open track',
 pg_temp.t('cancel','{"trackId":"50000000-0000-4000-8000-000000000004"}')->'track'->>'status'='revoked');
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.ok('leaving with one dog keeps the other dog in',
 (pg_temp.s('leave','{"sessionId":"30000000-0000-4000-8000-000000000001","participationId":"40000000-0000-4000-8000-0000000000b2"}')->>'left')::boolean
 and (select count(*) from jsonb_array_elements(pg_temp.s('get','{"sessionId":"30000000-0000-4000-8000-000000000001"}')->'session'->'participants') p where p->>'userId'='b2222222-2222-4222-8222-222222222222') = 1);
select pg_temp.ok('open track for the dog that left is revoked',
 (select x->>'status' from jsonb_array_elements(pg_temp.t('list','{"sessionId":"30000000-0000-4000-8000-000000000001"}')->'tracks') x where x->>'trackId'='50000000-0000-4000-8000-000000000003')='revoked');
select pg_temp.ok('searched track stays fetchable for the handler',
 pg_temp.t('fetch','{"trackId":"50000000-0000-4000-8000-000000000001"}') ? 'package');

-- ── Löschen nach 7 Tagen ────────────────────────────────────────────────────
reset role;
select pg_temp.ok('purge keeps tracks of a recent session', public.training_private_tracks_purge() = 0);
update public.training_private_sessions set expires_at=clock_timestamp()-interval '8 days' where id='30000000-0000-4000-8000-000000000001';
select pg_temp.ok('purge deletes tracks 7 days after the end', public.training_private_tracks_purge() = 3);
select pg_temp.ok('no track of that session is left', not exists(select 1 from public.training_private_tracks));

-- ── Abo-Regel und Rechte ────────────────────────────────────────────────────
select pg_temp.ok('location sharing no longer requires ACTIVE',
 position('tracking_private_active_initiator' in pg_get_functiondef('public.training_group_live_v1(text,jsonb)'::regprocedure)) = 0);
select pg_temp.ok('group distraction tasks no longer require ACTIVE',
 position('gd_active' in pg_get_functiondef('public.training_group_distraction_v1(text,jsonb)'::regprocedure)) = 0);
select pg_temp.ok('creating a group and starting a group training still require ACTIVE',
 position('gd_active' in pg_get_functiondef('public.training_group_v1(text,jsonb)'::regprocedure)) > 0
 and position('gd_active' in pg_get_functiondef('public.training_group_session_v1(text,jsonb)'::regprocedure)) > 0);
select pg_temp.ok('tracks RPC callable by authenticated only',
 has_function_privilege('authenticated','public.training_group_tracks_v1(text,jsonb)','execute')
 and not has_function_privilege('anon','public.training_group_tracks_v1(text,jsonb)','execute'));
select pg_temp.ok('helpers and table closed to app roles',
 not has_function_privilege('authenticated','public.training_private_tracks_purge()','execute')
 and not has_function_privilege('authenticated','public.training_private_track_json(uuid,uuid)','execute')
 and not has_table_privilege('authenticated','public.training_private_tracks','select'));

select count(*) || ' group stage-2b assertions passed' from qa_assertions;
rollback;
