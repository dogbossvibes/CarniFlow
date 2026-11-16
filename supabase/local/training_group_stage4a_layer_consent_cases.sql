-- LOCAL ONLY: local Docker/Unix socket. All fixtures roll back.
-- Verifies 20261116230000_training_group_stage4a_layer_consent.sql on top of all earlier group stages.
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
select u,'authenticated','authenticated','t5-'||n||'@local.test',now(),'{}','{}',now(),now(),false,false
from (values ('a1111111-1111-4111-8111-111111111111'::uuid,'owner'),('b2222222-2222-4222-8222-222222222222','handler'),
 ('c3333333-3333-4333-8333-333333333333','trainer'),('d4444444-4444-4444-8444-444444444444','outsider')) t(u,n);
insert into public.dogs(id,owner_id,name) values
 ('a0000000-0000-4000-8000-00000000000a','a1111111-1111-4111-8111-111111111111','Ayla'),
 ('b0000000-0000-4000-8000-0000000000b1','b2222222-2222-4222-8222-222222222222','Luna');
insert into public.profiles(id,full_name,username,role,push_token,locale) values
 ('a1111111-1111-4111-8111-111111111111','Leger','t5layer','user','ExponentPushToken[layer]','de-CH')
 on conflict (id) do update set push_token=excluded.push_token, locale=excluded.locale;
create temporary view qa_outbox as select user_id, kind, title, body, data from public.group_notify_outbox;
grant select on qa_outbox to authenticated;
create function pg_temp.n(a text, r jsonb) returns jsonb language sql as $$ select public.training_group_notify_v1(a, r) $$;
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

-- ── Zustimmung: nicht gefragt = nein ───────────────────────────────────────
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.ok('consent starts undecided', pg_temp.e('consent_get','{"groupId":"10000000-0000-4000-8000-000000000001"}')->'laidLine' = 'null'::jsonb);
select pg_temp.s('open','{"groupId":"10000000-0000-4000-8000-000000000001","sessionId":"30000000-0000-4000-8000-000000000001","title":"Waldrand","ttlSeconds":7200,"dogId":"a0000000-0000-4000-8000-00000000000a"}');
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.s('join','{"sessionId":"30000000-0000-4000-8000-000000000001","dogId":"b0000000-0000-4000-8000-0000000000b1","participationId":"40000000-0000-4000-8000-0000000000b1"}');
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.t('assign','{"sessionId":"30000000-0000-4000-8000-000000000001","trackId":"50000000-0000-4000-8000-000000000001","handlerParticipationId":"40000000-0000-4000-8000-0000000000b1","blind":false}');
select pg_temp.t('submit', jsonb_build_object('trackId','50000000-0000-4000-8000-000000000001','package','{"version":1,"startedAtMs":1763000000000,"finishedAtMs":1763000600000,"distanceM":175,"durationSeconds":600,"points":[{"lat":47.37,"lng":8.54,"t":1763000000000,"accuracy":3,"altitude":null,"speed":null,"heading":null,"breakBefore":false,"measuredDistanceM":null},{"lat":47.371,"lng":8.5415,"t":1763000600000,"accuracy":3,"altitude":null,"speed":null,"heading":null,"breakBefore":false,"measuredDistanceM":null}],"markers":[],"segments":[],"manualAngleGeometry":null}'::jsonb));
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.t('search_start','{"trackId":"50000000-0000-4000-8000-000000000001"}');
select pg_temp.t('searched','{"trackId":"50000000-0000-4000-8000-000000000001"}');
select pg_temp.ok('handler sees: laid line not released, not blocked',
 (select not (x->>'laidShared')::boolean and not (x->>'blocked')::boolean from (select pg_temp.e('get','{"trackId":"50000000-0000-4000-8000-000000000001"}') x) q));
select pg_temp.share('[]',true,true);
select pg_temp.ok('layer is told that her track was shared (dog name, no place)',
 (select count(*)=1 and min(title)='Auswertung geteilt' and min(body)='Bea hat die Auswertung zu deiner Fährte für Luna geteilt.'
   and min(data->>'groupId')='10000000-0000-4000-8000-000000000001' and not bool_or(data ? 'trackId')
  from qa_outbox where user_id='a1111111-1111-4111-8111-111111111111' and kind='evaluation_shared'));
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.ok('without consent: third member gets search and metrics, no laid line',
 (select not (x ? 'laid') and jsonb_array_length(x->'search')=2 and (x->'metrics'->>'articlesFound')::int=2 and not (x->>'laidShared')::boolean
  from (select pg_temp.e('fetch','{"trackId":"50000000-0000-4000-8000-000000000001"}')->'evaluation' x) q));
select pg_temp.ok('list says the line is not released',
 not (pg_temp.e('list','{"groupId":"10000000-0000-4000-8000-000000000001"}')->'evaluations'->0->>'laidShared')::boolean);
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.ok('handler still sees the laid line',
 jsonb_array_length(pg_temp.e('fetch','{"trackId":"50000000-0000-4000-8000-000000000001"}')->'evaluation'->'laid')=2);
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.ok('layer sees her own line',
 jsonb_array_length(pg_temp.e('fetch','{"trackId":"50000000-0000-4000-8000-000000000001"}')->'evaluation'->'laid')=2);

-- ── Zustimmung erteilen und zurücknehmen: wirkt sofort, auch für Geteiltes ──
select pg_temp.ok('layer consents', (pg_temp.e('consent_set','{"groupId":"10000000-0000-4000-8000-000000000001","value":true}')->>'laidLine')::boolean);
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.ok('with consent the already shared evaluation shows the line',
 jsonb_array_length(pg_temp.e('fetch','{"trackId":"50000000-0000-4000-8000-000000000001"}')->'evaluation'->'laid')=2);
select pg_temp.fails('nobody can set consent for a group they are not in','GROUP_UNAVAILABLE',
 $q$select set_config('request.jwt.claim.sub','d4444444-4444-4444-8444-444444444444',true), set_config('request.jwt.claims','{"sub":"d4444444-4444-4444-8444-444444444444","role":"authenticated"}',true), pg_temp.e('consent_set','{"groupId":"10000000-0000-4000-8000-000000000001","value":true}')$q$);
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.ok('consent is per person: third member is still undecided', pg_temp.e('consent_get','{"groupId":"10000000-0000-4000-8000-000000000001"}')->'laidLine' = 'null'::jsonb);
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.e('consent_set','{"groupId":"10000000-0000-4000-8000-000000000001","value":false}');
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.ok('withdrawn consent hides the line at once',
 not (pg_temp.e('fetch','{"trackId":"50000000-0000-4000-8000-000000000001"}')->'evaluation' ? 'laid'));
reset role;
select pg_temp.ok('stored package is untouched', (select jsonb_array_length(package->'laid')=2 from public.training_private_evaluations));
set local role authenticated;

-- ── Heimzone der Leger:in: nie teilbar ─────────────────────────────────────
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.t('assign','{"sessionId":"30000000-0000-4000-8000-000000000001","trackId":"50000000-0000-4000-8000-000000000002","handlerParticipationId":"40000000-0000-4000-8000-0000000000b1","blind":false}');
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.fails('handler cannot block','GROUP_UNAVAILABLE', $q$select pg_temp.e('block','{"trackId":"50000000-0000-4000-8000-000000000002"}')$q$);
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.ok('layer marks the track before handover', (pg_temp.e('block','{"trackId":"50000000-0000-4000-8000-000000000002"}')->>'blocked')::boolean);
select pg_temp.t('submit', jsonb_build_object('trackId','50000000-0000-4000-8000-000000000002','package','{"version":1,"startedAtMs":1763000000000,"finishedAtMs":1763000600000,"distanceM":175,"durationSeconds":600,"points":[{"lat":47.37,"lng":8.54,"t":1763000000000,"accuracy":3,"altitude":null,"speed":null,"heading":null,"breakBefore":false,"measuredDistanceM":null},{"lat":47.371,"lng":8.5415,"t":1763000600000,"accuracy":3,"altitude":null,"speed":null,"heading":null,"breakBefore":false,"measuredDistanceM":null}],"markers":[],"segments":[],"manualAngleGeometry":null}'::jsonb));
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.t('search_start','{"trackId":"50000000-0000-4000-8000-000000000002"}');
select pg_temp.t('searched','{"trackId":"50000000-0000-4000-8000-000000000002"}');
select pg_temp.ok('handler sees blocked', (pg_temp.e('get','{"trackId":"50000000-0000-4000-8000-000000000002"}')->>'blocked')::boolean);
select pg_temp.fails('marked track cannot be shared','GROUP_CONFLICT',
 $q$select pg_temp.e('share', jsonb_build_object('trackId','50000000-0000-4000-8000-000000000002','recipientUserIds','[]'::jsonb,'group',true,'evaluation',(select v from qa_ev)))$q$);

-- ── Mitteilung abschaltbar; Verlassen setzt die Zustimmung zurück ──────────
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.ok('new notification setting is on by default and can be switched off',
 (pg_temp.n('get','{}')->'settings'->>'evaluationShared')::boolean
 and not (pg_temp.n('set','{"evaluationShared":false}')->'settings'->>'evaluationShared')::boolean);
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.e('consent_set','{"groupId":"10000000-0000-4000-8000-000000000001","value":true}');
select pg_temp.g('leave','{"groupId":"10000000-0000-4000-8000-000000000001","membershipId":"20000000-0000-4000-8000-000000000003"}');
reset role;
select pg_temp.ok('leaving resets the consent',
 (select share_laid_line is null from public.training_private_members where user_id='c3333333-3333-4333-8333-333333333333'));
select pg_temp.ok('consent helper closed to app roles',
 not has_function_privilege('authenticated','public.training_private_laid_consent(uuid,uuid)','execute'));

select count(*) || ' group layer-consent assertions passed' from qa_assertions;
rollback;
