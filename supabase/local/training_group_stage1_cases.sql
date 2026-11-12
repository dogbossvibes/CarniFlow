-- LOCAL ONLY: local Docker/Unix socket. All fixtures roll back.
-- Verifies 20261112140000_training_group_stage1.sql on top of
-- 20261112120000_training_group_server_baseline.sql and 20261111220000_contact_requests.sql.
-- public.subscription_verified_initiator_v1() exists only in Production; here it is a
-- rolled-back stub controlled by the setting qa.active.
\set ON_ERROR_STOP on
begin;
do $$ begin if inet_server_addr() is not null then raise exception 'Local Unix socket required'; end if; end $$;
create temporary table qa_assertions(label text);
grant all on qa_assertions to authenticated, anon;
create temporary table qa_vars(k text primary key, v text);
grant all on qa_vars to authenticated;
create function pg_temp.ok(label text, condition boolean) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'GROUP FAIL: %',label; end if;
 insert into qa_assertions values(label);
end $$;
-- Expects the RPC to fail with the given message (GROUP_* code).
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
create function pg_temp.j(a text, r jsonb) returns jsonb language sql as $$ select public.training_group_join_v1(a, r) $$;
create function pg_temp.g(a text, r jsonb) returns jsonb language sql as $$ select public.training_group_v1(a, r) $$;
create function pg_temp.s(a text, r jsonb) returns jsonb language sql as $$ select public.training_group_session_v1(a, r) $$;

create or replace function public.subscription_verified_initiator_v1() returns boolean language sql stable as $$
 select coalesce(current_setting('qa.active', true), 'off') = 'on' $$;
grant execute on function public.subscription_verified_initiator_v1() to authenticated;

-- OWNER (ACTIVE), ORGA, MEMBER, NEW (Anfragende), BLOCKED, LATE.
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
select u,'authenticated','authenticated','tg-'||n||'@local.test',now(),'{}','{}',now(),now(),false,false
from (values
 ('a1111111-1111-4111-8111-111111111111'::uuid,'owner'),('b2222222-2222-4222-8222-222222222222','orga'),
 ('c3333333-3333-4333-8333-333333333333','member'),('d4444444-4444-4444-8444-444444444444','new'),
 ('e5555555-5555-4555-8555-555555555555','blocked'),('f6666666-6666-4666-8666-666666666666','late')) t(u,n);
insert into public.dogs(id,owner_id,name) values
 ('a0000000-0000-4000-8000-00000000000a','a1111111-1111-4111-8111-111111111111','Owner Dog'),
 ('b0000000-0000-4000-8000-00000000000b','b2222222-2222-4222-8222-222222222222','Orga Dog'),
 ('c0000000-0000-4000-8000-00000000000c','c3333333-3333-4333-8333-333333333333','Member Dog');
insert into public.contact_blocks(blocker_id,blocked_id) values
 ('a1111111-1111-4111-8111-111111111111','e5555555-5555-4555-8555-555555555555');

set local role authenticated;

-- ── Abo-Regel: Gruppe erstellen ─────────────────────────────────────────────
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select set_config('qa.active','off',true);
select pg_temp.fails('create without ACTIVE is refused','TRACKING_ACTIVE_REQUIRED',
 $q$select pg_temp.g('create','{"groupId":"10000000-0000-4000-8000-000000000001","title":"Fährtengruppe","displayName":"Owner"}')$q$);
select set_config('qa.active','on',true);
select pg_temp.ok('create with ACTIVE works',
 pg_temp.g('create','{"groupId":"10000000-0000-4000-8000-000000000001","title":"Fährtengruppe","displayName":"Owner"}')->'group'->>'title' = 'Fährtengruppe');
select set_config('qa.active','off',true);
select pg_temp.ok('repeating the same create request stays idempotent without ACTIVE',
 pg_temp.g('create','{"groupId":"10000000-0000-4000-8000-000000000001","title":"Fährtengruppe","displayName":"Owner"}')->'group'->>'groupId' = '10000000-0000-4000-8000-000000000001');

-- ── Code erzeugen ───────────────────────────────────────────────────────────
insert into qa_vars values ('code1', pg_temp.j('code_create','{"groupId":"10000000-0000-4000-8000-000000000001"}')->>'code');
select pg_temp.ok('code is 12 characters', length((select v from qa_vars where k='code1')) = 12);
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.fails('outsider cannot create a code','GROUP_UNAVAILABLE',
 $q$select pg_temp.j('code_create','{"groupId":"10000000-0000-4000-8000-000000000001"}')$q$);

-- ── Beitritt per Code: Vorschau, Anfrage, Bestätigung ───────────────────────
select pg_temp.as_user('d4444444-4444-4444-8444-444444444444');
select pg_temp.ok('preview shows only title, inviter name and status',
 (select (p->'preview') = jsonb_build_object('groupTitle','Fährtengruppe','inviterName','Owner','status','none')
  from (select pg_temp.j('preview', jsonb_build_object('code', lower((select v from qa_vars where k='code1')))) p) x));
select pg_temp.ok('invalid code is a result, not an error',
 (pg_temp.j('preview','{"code":"ABCDEFABCDEF"}')->>'invalidCode')::boolean);
select pg_temp.ok('code input with separators is normalised',
 pg_temp.j('preview', jsonb_build_object('code', substr((select v from qa_vars where k='code1'),1,4)||'-'||substr((select v from qa_vars where k='code1'),5))) ? 'preview');
select pg_temp.ok('request is pending',
 pg_temp.j('request', jsonb_build_object('code',(select v from qa_vars where k='code1'),'requestId','20000000-0000-4000-8000-000000000001','displayName','Neu'))->'request'->>'status' = 'pending');
select pg_temp.ok('same request repeated returns the same request',
 pg_temp.j('request', jsonb_build_object('code',(select v from qa_vars where k='code1'),'requestId','20000000-0000-4000-8000-000000000001','displayName','Neu'))->'request'->>'requestId' = '20000000-0000-4000-8000-000000000001');
select pg_temp.fails('second request for the same group is a conflict','GROUP_CONFLICT',
 format($q$select pg_temp.j('request', '{"code":"%s","requestId":"20000000-0000-4000-8000-000000000099","displayName":"Neu"}')$q$, (select v from qa_vars where k='code1')));
select pg_temp.ok('requester sees own pending request', jsonb_array_length(pg_temp.j('mine','{}')->'requests') = 1);
select pg_temp.ok('requester sees nothing of the group before approval',
 jsonb_array_length(pg_temp.g('list','{}')->'groups') = 0);
select pg_temp.fails('requester cannot list pending requests','GROUP_UNAVAILABLE',
 $q$select pg_temp.j('pending','{"groupId":"10000000-0000-4000-8000-000000000001"}')$q$);
select pg_temp.fails('requester cannot approve themselves','GROUP_UNAVAILABLE',
 $q$select pg_temp.j('approve','{"groupId":"10000000-0000-4000-8000-000000000001","requestId":"20000000-0000-4000-8000-000000000001"}')$q$);

select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.ok('owner sees the pending request',
 (pg_temp.j('pending','{"groupId":"10000000-0000-4000-8000-000000000001"}')->'requests'->0->>'displayName') = 'Neu');
select pg_temp.ok('owner approves',
 (pg_temp.j('approve','{"groupId":"10000000-0000-4000-8000-000000000001","requestId":"20000000-0000-4000-8000-000000000001"}')->>'approved')::boolean);
select pg_temp.ok('approve is idempotent',
 (pg_temp.j('approve','{"groupId":"10000000-0000-4000-8000-000000000001","requestId":"20000000-0000-4000-8000-000000000001"}')->>'approved')::boolean);
select pg_temp.fails('decline after approve is a conflict','GROUP_CONFLICT',
 $q$select pg_temp.j('decline','{"groupId":"10000000-0000-4000-8000-000000000001","requestId":"20000000-0000-4000-8000-000000000001"}')$q$);
select pg_temp.as_user('d4444444-4444-4444-8444-444444444444');
select pg_temp.ok('approved person is a member with membershipId = requestId',
 (select m->>'membershipId' from jsonb_array_elements(pg_temp.g('list','{}')->'groups'->0->'members') m where m->>'userId'='d4444444-4444-4444-8444-444444444444') = '20000000-0000-4000-8000-000000000001');
select pg_temp.ok('approved member can leave with that membershipId',
 (pg_temp.g('leave','{"groupId":"10000000-0000-4000-8000-000000000001","membershipId":"20000000-0000-4000-8000-000000000001"}')->>'left')::boolean);

-- ── Blockierung ─────────────────────────────────────────────────────────────
select pg_temp.as_user('e5555555-5555-4555-8555-555555555555');
select pg_temp.ok('person blocked by the owner gets invalidCode',
 (pg_temp.j('preview', jsonb_build_object('code',(select v from qa_vars where k='code1')))->>'invalidCode')::boolean);

-- ── Rollen ──────────────────────────────────────────────────────────────────
-- ORGA und MEMBER kommen über Code + Bestätigung dazu.
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.j('request', jsonb_build_object('code',(select v from qa_vars where k='code1'),'requestId','20000000-0000-4000-8000-000000000002','displayName','Orga'));
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.j('request', jsonb_build_object('code',(select v from qa_vars where k='code1'),'requestId','20000000-0000-4000-8000-000000000003','displayName','Mitglied'));
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.j('approve','{"groupId":"10000000-0000-4000-8000-000000000001","requestId":"20000000-0000-4000-8000-000000000002"}');
select pg_temp.j('approve','{"groupId":"10000000-0000-4000-8000-000000000001","requestId":"20000000-0000-4000-8000-000000000003"}');

select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.fails('member cannot appoint organizers','GROUP_UNAVAILABLE',
 $q$select pg_temp.j('set_role','{"groupId":"10000000-0000-4000-8000-000000000001","memberUserId":"b2222222-2222-4222-8222-222222222222","membershipId":"20000000-0000-4000-8000-000000000002","role":"organizer"}')$q$);
select pg_temp.fails('member cannot create a code','GROUP_UNAVAILABLE',
 $q$select pg_temp.j('code_create','{"groupId":"10000000-0000-4000-8000-000000000001"}')$q$);
select set_config('qa.active','on',true);
select pg_temp.fails('member with ACTIVE cannot start a group training','GROUP_UNAVAILABLE',
 $q$select pg_temp.s('open','{"groupId":"10000000-0000-4000-8000-000000000001","sessionId":"30000000-0000-4000-8000-000000000001","title":"Samstag","ttlSeconds":3600,"dogId":"c0000000-0000-4000-8000-00000000000c"}')$q$);
select set_config('qa.active','off',true);

select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.ok('owner appoints an organizer',
 pg_temp.j('set_role','{"groupId":"10000000-0000-4000-8000-000000000001","memberUserId":"b2222222-2222-4222-8222-222222222222","membershipId":"20000000-0000-4000-8000-000000000002","role":"organizer"}')->>'role' = 'organizer');
select pg_temp.ok('list keeps role owner/member and adds isOrganizer',
 (select bool_and(m->>'role' in ('owner','member')) and bool_or((m->>'isOrganizer')::boolean and m->>'userId'='b2222222-2222-4222-8222-222222222222')
  from jsonb_array_elements(pg_temp.g('list','{}')->'groups'->0->'members') m));

select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.fails('organizer cannot appoint organizers','GROUP_UNAVAILABLE',
 $q$select pg_temp.j('set_role','{"groupId":"10000000-0000-4000-8000-000000000001","memberUserId":"c3333333-3333-4333-8333-333333333333","membershipId":"20000000-0000-4000-8000-000000000003","role":"organizer"}')$q$);
select pg_temp.ok('organizer creates a code', length(pg_temp.j('code_create','{"groupId":"10000000-0000-4000-8000-000000000001"}')->>'code') = 12);
select pg_temp.fails('organizer without ACTIVE cannot start a group training','TRACKING_ACTIVE_REQUIRED',
 $q$select pg_temp.s('open','{"groupId":"10000000-0000-4000-8000-000000000001","sessionId":"30000000-0000-4000-8000-000000000001","title":"Samstag","ttlSeconds":3600,"dogId":"b0000000-0000-4000-8000-00000000000b"}')$q$);
select set_config('qa.active','on',true);
select pg_temp.ok('organizer with ACTIVE starts a group training',
 pg_temp.s('open','{"groupId":"10000000-0000-4000-8000-000000000001","sessionId":"30000000-0000-4000-8000-000000000001","title":"Samstag","ttlSeconds":3600,"dogId":"b0000000-0000-4000-8000-00000000000b"}')->'session'->>'title' = 'Samstag');
select set_config('qa.active','off',true);

-- Mitglied tritt ohne Abo bei.
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.ok('member joins the group training without ACTIVE',
 jsonb_array_length(pg_temp.s('join','{"sessionId":"30000000-0000-4000-8000-000000000001","dogId":"c0000000-0000-4000-8000-00000000000c","participationId":"40000000-0000-4000-8000-000000000001"}')->'session'->'participants') = 2);
select pg_temp.fails('member cannot end the group training','GROUP_UNAVAILABLE',
 $q$select pg_temp.s('end','{"sessionId":"30000000-0000-4000-8000-000000000001"}')$q$);

-- Organisator:in darf einfache Mitglieder entfernen, aber keine Organisator:innen.
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.fails('organizer cannot remove the owner','GROUP_CONFLICT',
 $q$select pg_temp.g('remove_member','{"groupId":"10000000-0000-4000-8000-000000000001","memberUserId":"a1111111-1111-4111-8111-111111111111","membershipId":"10000000-0000-4000-8000-000000000001"}')$q$);
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.ok('owner ends the organizer''s group training',
 (pg_temp.s('end','{"sessionId":"30000000-0000-4000-8000-000000000001"}')->>'ended')::boolean);
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.ok('organizer removes a plain member',
 (pg_temp.g('remove_member','{"groupId":"10000000-0000-4000-8000-000000000001","memberUserId":"c3333333-3333-4333-8333-333333333333","membershipId":"20000000-0000-4000-8000-000000000003"}')->>'removed')::boolean);

-- Rolle endet mit dem Austritt; Wiedereintritt beginnt als Mitglied.
select pg_temp.ok('organizer leaves',
 (pg_temp.g('leave','{"groupId":"10000000-0000-4000-8000-000000000001","membershipId":"20000000-0000-4000-8000-000000000002"}')->>'left')::boolean);
reset role;
select pg_temp.ok('role is reset on leave',
 (select role from public.training_private_members where user_id='b2222222-2222-4222-8222-222222222222') = 'member');
set local role authenticated;

-- ── Ablehnen, Zurückziehen, Code widerrufen ─────────────────────────────────
select pg_temp.as_user('f6666666-6666-4666-8666-666666666666');
select pg_temp.j('request', jsonb_build_object('code',(select v from qa_vars where k='code1'),'requestId','20000000-0000-4000-8000-000000000006','displayName','Spät'));
select pg_temp.ok('requester cancels',
 (pg_temp.j('cancel','{"requestId":"20000000-0000-4000-8000-000000000006"}')->>'cancelled')::boolean);
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.fails('approving a cancelled request is refused','GROUP_REVOKED',
 $q$select pg_temp.j('approve','{"groupId":"10000000-0000-4000-8000-000000000001","requestId":"20000000-0000-4000-8000-000000000006"}')$q$);
select pg_temp.ok('owner revokes codes', (pg_temp.j('code_revoke','{"groupId":"10000000-0000-4000-8000-000000000001"}')->>'revoked')::boolean);
select pg_temp.as_user('f6666666-6666-4666-8666-666666666666');
select pg_temp.ok('revoked code is invalid',
 (pg_temp.j('preview', jsonb_build_object('code',(select v from qa_vars where k='code1')))->>'invalidCode')::boolean);

-- ── Ratenbegrenzung ─────────────────────────────────────────────────────────
select count(pg_temp.j('preview','{"code":"000000000000"}')) from generate_series(1,18);
select pg_temp.fails('21st code attempt within an hour is limited','GROUP_LIMIT',
 $q$select pg_temp.j('preview','{"code":"000000000000"}')$q$);

-- ── Nutzungsgrenze ──────────────────────────────────────────────────────────
reset role;
select pg_temp.ok('code respects max uses',
 (select bool_and(uses <= max_uses) from public.training_private_join_codes));

-- ── Rechte ──────────────────────────────────────────────────────────────────
select pg_temp.ok('anon cannot call the join RPC',
 not has_function_privilege('anon','public.training_group_join_v1(text,jsonb)','execute'));
select pg_temp.ok('authenticated can call the join RPC',
 has_function_privilege('authenticated','public.training_group_join_v1(text,jsonb)','execute'));
select pg_temp.ok('internal helpers are not callable by app roles',
 not has_function_privilege('authenticated','public.training_private_manager(uuid,uuid)','execute')
 and not has_function_privilege('authenticated','public.training_private_join_request_json(uuid)','execute'));
select pg_temp.ok('new tables are closed to app roles',
 not has_table_privilege('authenticated','public.training_private_join_codes','select')
 and not has_table_privilege('authenticated','public.training_private_join_requests','select')
 and not has_table_privilege('authenticated','public.training_private_code_attempts','select'));
select pg_temp.ok('existing grants on group RPCs are unchanged',
 has_function_privilege('authenticated','public.training_group_v1(text,jsonb)','execute')
 and has_function_privilege('authenticated','public.training_group_session_v1(text,jsonb)','execute')
 and not has_function_privilege('anon','public.training_group_v1(text,jsonb)','execute'));

select count(*) || ' group stage-1 assertions passed' from qa_assertions;
rollback;
