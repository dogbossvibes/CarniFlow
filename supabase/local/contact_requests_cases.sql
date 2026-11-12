-- LOCAL ONLY: local Docker/Unix socket. All fixtures roll back.
-- Verifies 20261111220000_contact_requests.sql and
-- 20261111230000_person_search_professionals_only.sql.
\set ON_ERROR_STOP on
begin;
do $$ begin if inet_server_addr() is not null then raise exception 'Local Unix socket required'; end if; end $$;
create temporary table qa_assertions(label text);
grant all on qa_assertions to authenticated, anon;
create temporary table qa_vars(k text primary key, v text);
grant all on qa_vars to authenticated;
create function pg_temp.ok(label text, condition boolean) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'CONTACT FAIL: %',label; end if;
 insert into qa_assertions values(label);
end $$;
create function pg_temp.denied(label text, command text) returns void language plpgsql as $$
declare blocked boolean := false;
begin
 begin execute command; exception when insufficient_privilege then blocked:=true; end;
 perform pg_temp.ok(label,blocked);
end $$;
create function pg_temp.as_user(p uuid) returns void language sql as $$
 select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claims', json_build_object('sub',p,'role','authenticated')::text, true);
$$;

-- ANNA (Halterin), BEA, CARL, DORA (Privatpersonen), TRAINER (Fachprofil), SPAM.
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
select u, 'authenticated','authenticated', 'cr-'||n||'@local.test', now(),'{}','{}',now(),now(),false,false
from (values
 ('a1111111-1111-1111-1111-111111111111'::uuid,'anna'),('b2222222-2222-2222-2222-222222222222','bea'),
 ('c3333333-3333-3333-3333-333333333333','carl'),('d4444444-4444-4444-4444-444444444444','dora'),
 ('e5555555-5555-5555-5555-555555555555','trainer'),('f6666666-6666-6666-6666-666666666666','spam')) t(u,n);
insert into public.profiles(id,full_name,username,role) values
 ('a1111111-1111-1111-1111-111111111111','Anna Test','cranna','user'),
 ('b2222222-2222-2222-2222-222222222222','Bea Test','crbea','user'),
 ('c3333333-3333-3333-3333-333333333333','Carl Test','crcarl','user'),
 ('d4444444-4444-4444-4444-444444444444','Dora Test','crdora','user'),
 ('e5555555-5555-5555-5555-555555555555','Praxis Test','crpraxis','trainer'),
 ('f6666666-6666-6666-6666-666666666666','Spam Test','crspam','user');
-- 25 weitere Ziele für das Tageslimit.
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
select ('00000000-0000-0000-0000-0000000001'||lpad(i::text,2,'0'))::uuid,'authenticated','authenticated','cr-t'||i||'@local.test',now(),'{}','{}',now(),now(),false,false from generate_series(1,25) i;
insert into public.profiles(id,full_name,username,role)
select ('00000000-0000-0000-0000-0000000001'||lpad(i::text,2,'0'))::uuid,'Ziel '||i,'crziel'||i,'user' from generate_series(1,25) i;

insert into public.dogs(id,owner_id,name) values ('ad000000-0000-0000-0000-000000000001','a1111111-1111-1111-1111-111111111111','Contact Dog');
insert into public.dog_documents(owner_id,dog_id,kind,title) values
 ('a1111111-1111-1111-1111-111111111111','ad000000-0000-0000-0000-000000000001','stammbaum','Stammbaum'),
 ('a1111111-1111-1111-1111-111111111111','ad000000-0000-0000-0000-000000000001','impfpass','Impfpass');
-- Bestehende Trainer-Verbindung: Verhalten bei Dokumenten bleibt wie bisher.
insert into public.connections(id,owner_user_id,connected_user_id,status,created_by,connection_type) values
 ('ac000000-0000-0000-0000-000000000001','a1111111-1111-1111-1111-111111111111','e5555555-5555-5555-5555-555555555555','accepted','owner','trainer_client');

select pg_temp.ok('anon cannot call contact functions',
 not has_function_privilege('anon','public.contact_request_send(text,text)','execute')
 and not has_function_privilege('anon','public.contact_code_create(text)','execute'));
select pg_temp.ok('internal helpers are not callable by app roles',
 not has_function_privilege('authenticated','public.contact_connect_pair(uuid,uuid)','execute')
 and not has_function_privilege('authenticated','public.contact_is_blocked(uuid,uuid)','execute'));

set local role authenticated;

-- ── Code: Anna zeigt ihren Code, Bea fragt an ──────────────────────────
select pg_temp.as_user('a1111111-1111-1111-1111-111111111111');
insert into qa_vars select 'code', code from public.contact_code_create('qr');
select pg_temp.ok('code has 12 characters', (select length(v) from qa_vars where k='code') = 12);
select pg_temp.denied('codes table is not readable', $$select count(*) from public.contact_codes$$);

select pg_temp.as_user('b2222222-2222-2222-2222-222222222222');
select pg_temp.ok('wrong code is rejected', public.contact_request_send('code','NOPE00000000') = 'invalid_code');
select pg_temp.ok('request via code is sent', public.contact_request_send('code',(select lower(v) from qa_vars where k='code')) = 'sent');
select pg_temp.ok('sending twice stays one request', public.contact_request_send('code',(select v from qa_vars where k='code')) = 'sent'
 and (select count(*) from public.contact_requests) = 1);
select pg_temp.denied('requests cannot be inserted directly',
 $$insert into public.contact_requests(from_user_id,to_user_id,via,status) values ('b2222222-2222-2222-2222-222222222222','c3333333-3333-3333-3333-333333333333','code','accepted')$$);
select pg_temp.denied('requests cannot be updated directly', $$update public.contact_requests set status='accepted'$$);
select pg_temp.ok('no connection before acceptance', (select count(*) from public.connections) = 0);
select pg_temp.ok('no documents before acceptance', (select count(*) from public.dog_documents) = 0);
select pg_temp.ok('sender cannot answer own request',
 public.contact_request_respond((select id from public.contact_requests limit 1),'accept') = 'not_found');

-- ── Anna nimmt an: zwei Richtungen, nichts freigegeben ─────────────────
select pg_temp.as_user('a1111111-1111-1111-1111-111111111111');
select pg_temp.ok('incoming request shows only the name',
 (select count(*) from public.contact_requests_list() where direction='incoming' and other_name='Bea Test' and via='code') = 1);
select pg_temp.ok('accept', public.contact_request_respond((select id from public.contact_requests_list() where direction='incoming'),'accept') = 'accepted');
select pg_temp.ok('two contact connections exist',
 (select count(*) from public.connections where connection_type='contact' and status='accepted') = 2);
select pg_temp.ok('all permissions start switched off',
 (select bool_or(view_trainings or view_statistics or view_videos or view_dogs or view_appointments or view_health or view_private_notes or view_documents)
  from public.connection_permissions p join public.connections c on c.id=p.connection_id where c.connection_type='contact') = false);

select pg_temp.as_user('b2222222-2222-2222-2222-222222222222');
select pg_temp.ok('contact sees no documents without a grant', (select count(*) from public.dog_documents) = 0);
select pg_temp.ok('contact sees no dogs without a grant', (select count(*) from public.dogs) = 0);
update public.connection_permissions set view_documents = true
 where connection_id = (select id from public.connections where owner_user_id='a1111111-1111-1111-1111-111111111111' and connection_type='contact');
select pg_temp.ok('contact cannot switch on her own access', (select count(*) from public.dog_documents) = 0);
select pg_temp.ok('second request to a contact is refused', public.contact_request_send('username','cranna') = 'already_connected');

select pg_temp.as_user('a1111111-1111-1111-1111-111111111111');
update public.connection_permissions set view_documents = true
 where connection_id = (select id from public.connections where owner_user_id='a1111111-1111-1111-1111-111111111111' and connected_user_id='b2222222-2222-2222-2222-222222222222' and connection_type='contact');
select pg_temp.as_user('b2222222-2222-2222-2222-222222222222');
select pg_temp.ok('owner grant makes non-health documents visible', (select count(*) from public.dog_documents where kind='stammbaum') = 1);
select pg_temp.ok('health documents still need a health grant', (select count(*) from public.dog_documents where kind='impfpass') = 0);
select pg_temp.ok('health grant check accepts the contact connection',
 public.health_grant_connection_valid((select id from public.connections where owner_user_id='a1111111-1111-1111-1111-111111111111' and connected_user_id='b2222222-2222-2222-2222-222222222222' and connection_type='contact'),
  'a1111111-1111-1111-1111-111111111111','b2222222-2222-2222-2222-222222222222'));

-- ── Bestehende Trainer-Verbindung unverändert ──────────────────────────
select pg_temp.as_user('e5555555-5555-5555-5555-555555555555');
select pg_temp.ok('existing trainer connection still sees documents', (select count(*) from public.dog_documents) = 1);

-- ── Benutzername, stilles Ablehnen, Wartezeit ──────────────────────────
select pg_temp.as_user('c3333333-3333-3333-3333-333333333333');
select pg_temp.ok('partial username finds nobody', public.contact_request_send('username','crAn') = 'not_found');
select pg_temp.ok('exact username, any case, with @', public.contact_request_send('username','@CRANNA') = 'sent');
select pg_temp.ok('own username is refused', public.contact_request_send('username','crcarl') = 'self');
select pg_temp.as_user('a1111111-1111-1111-1111-111111111111');
select pg_temp.ok('decline', public.contact_request_respond((select id from public.contact_requests_list() where direction='incoming' and other_username='crcarl'),'decline') = 'declined');
select pg_temp.as_user('c3333333-3333-3333-3333-333333333333');
select pg_temp.ok('sender still sees the request as pending',
 (select status from public.contact_requests_list() where direction='outgoing') = 'pending');
select pg_temp.ok('sender cannot read the real status from the table', (select count(*) from public.contact_requests) = 0);
select pg_temp.ok('re-sending after a decline creates nothing', public.contact_request_send('username','cranna') = 'sent'
 and (select count(*) from public.contact_requests_list() where direction='outgoing') = 1);
select pg_temp.as_user('a1111111-1111-1111-1111-111111111111');
select pg_temp.ok('declined sender does not reappear', (select count(*) from public.contact_requests_list() where direction='incoming') = 0);

-- ── Benutzername abschalten ────────────────────────────────────────────
update public.profiles set contact_requests_by_username = false where id = 'a1111111-1111-1111-1111-111111111111';
select pg_temp.as_user('d4444444-4444-4444-4444-444444444444');
select pg_temp.ok('username requests can be switched off', public.contact_request_send('username','cranna') = 'not_found');
select pg_temp.as_user('a1111111-1111-1111-1111-111111111111');
update public.profiles set contact_requests_by_username = true where id = 'a1111111-1111-1111-1111-111111111111';

-- ── Blockieren ─────────────────────────────────────────────────────────
select public.contact_block('b2222222-2222-2222-2222-222222222222');
select pg_temp.ok('block list shows the name', (select count(*) from public.contact_blocks_list() where name='Bea Test') = 1);
select pg_temp.ok('blocking disables both directions',
 (select count(*) from public.connections where connection_type='contact' and status='blocked') = 2);
select pg_temp.ok('blocker cannot request the blocked person', public.contact_request_send('username','crbea') = 'blocked_by_you');
select pg_temp.as_user('b2222222-2222-2222-2222-222222222222');
select pg_temp.ok('blocked contact loses document access', (select count(*) from public.dog_documents) = 0);
select pg_temp.ok('blocked person cannot see who blocked her', (select count(*) from public.contact_blocks) = 0);
select pg_temp.ok('request from a blocked person is silently dropped', public.contact_request_send('username','cranna') = 'sent');
select pg_temp.denied('blocked person cannot reactivate the connection',
 $$update public.connections set status='accepted' where connection_type='contact'$$);
select pg_temp.as_user('a1111111-1111-1111-1111-111111111111');
select pg_temp.ok('nothing arrives from the blocked person', (select count(*) from public.contact_requests_list() where direction='incoming') = 0);

-- ── Entblockieren stellt nichts automatisch wieder her ─────────────────
select public.contact_unblock('b2222222-2222-2222-2222-222222222222');
select pg_temp.ok('unblock does not restore the contact',
 (select count(*) from public.connections where connection_type='contact' and status='accepted') = 0);
select pg_temp.as_user('b2222222-2222-2222-2222-222222222222');
select pg_temp.ok('new request after unblock', public.contact_request_send('username','cranna') = 'sent');
select pg_temp.as_user('a1111111-1111-1111-1111-111111111111');
select pg_temp.ok('accept again', public.contact_request_respond((select id from public.contact_requests_list() where direction='incoming'),'accept') = 'accepted');
select pg_temp.as_user('b2222222-2222-2222-2222-222222222222');
select pg_temp.ok('earlier grants are reset after re-connecting', (select count(*) from public.dog_documents) = 0);

-- ── Kontakt entfernen (ohne Blockieren) ────────────────────────────────
select pg_temp.as_user('a1111111-1111-1111-1111-111111111111');
select public.contact_remove('b2222222-2222-2222-2222-222222222222');
select pg_temp.ok('remove ends both directions',
 (select count(*) from public.connections where connection_type='contact' and status='accepted') = 0);
select pg_temp.ok('remove does not block', (select count(*) from public.contact_blocks) = 0);
select pg_temp.as_user('b2222222-2222-2222-2222-222222222222');
select pg_temp.denied('removed contact cannot reactivate the connection',
 $$update public.connections set status='accepted' where connection_type='contact'$$);

-- ── Fachprofil und Suche ───────────────────────────────────────────────
select pg_temp.as_user('d4444444-4444-4444-4444-444444444444');
select pg_temp.ok('request to a professional profile', public.contact_request_send('professional','e5555555-5555-5555-5555-555555555555') = 'sent');
select pg_temp.ok('private person is no professional profile', public.contact_request_send('professional','c3333333-3333-3333-3333-333333333333') = 'not_found');
select pg_temp.ok('malformed id is handled', public.contact_request_send('professional','x') = 'not_found');
select pg_temp.ok('search finds professional profiles', (select count(*) from public.search_anyvo_people('Praxis')) = 1);
select pg_temp.ok('search no longer finds private persons', (select count(*) from public.search_anyvo_people('Test')) = 1);
select pg_temp.as_user('e5555555-5555-5555-5555-555555555555');
select pg_temp.ok('block from the request', public.contact_request_respond((select id from public.contact_requests_list() where direction='incoming'),'block') = 'blocked');
select pg_temp.as_user('d4444444-4444-4444-4444-444444444444');
select pg_temp.ok('blocked user no longer finds the profile', (select count(*) from public.search_anyvo_people('Praxis')) = 0);

-- ── Tageslimit ─────────────────────────────────────────────────────────
select pg_temp.as_user('f6666666-6666-6666-6666-666666666666');
select pg_temp.ok('20 requests per day are possible',
 (select count(*) from generate_series(1,20) i where public.contact_request_send('username','crziel'||i) = 'sent') = 20);
select pg_temp.ok('the 21st is refused', public.contact_request_send('username','crziel21') = 'rate_limited');

-- ── Code-Ablauf und Widerruf ───────────────────────────────────────────
select pg_temp.as_user('a1111111-1111-1111-1111-111111111111');
select public.contact_code_revoke('qr');
select pg_temp.as_user('d4444444-4444-4444-4444-444444444444');
select pg_temp.ok('revoked code no longer works', public.contact_request_send('code',(select v from qa_vars where k='code')) = 'invalid_code');
select pg_temp.as_user('a1111111-1111-1111-1111-111111111111');
insert into qa_vars select 'link', code from public.contact_code_create('link');
reset role;
update public.contact_codes set expires_at = now() - interval '1 minute' where kind = 'link';
set local role authenticated;
select pg_temp.as_user('d4444444-4444-4444-4444-444444444444');
select pg_temp.ok('expired code no longer works', public.contact_request_send('code',(select v from qa_vars where k='link')) = 'invalid_code');

reset role;
select count(*) as passed_assertions from qa_assertions;
rollback;
