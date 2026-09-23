-- ANYVO LOCAL / CI TEST ONLY
-- DO NOT APPLY TO PRODUCTION
--
-- Run after baseline + repository migrations + Health migrations:
-- psql ... -v ON_ERROR_STOP=1 -f supabase/local/health_sharing_rls_test.sql
-- All identities and fixtures are disposable and rolled back at the end.

\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.assert_count(label text, actual bigint, expected bigint)
returns void language plpgsql as $$
begin
  if actual <> expected then
    raise exception 'RLS FAIL %: expected %, got %', label, expected, actual;
  end if;
end;
$$;

create or replace function pg_temp.assert_non_owner_writes_denied()
returns void language plpgsql as $$
declare
  statement text;
  denied boolean;
  affected integer;
begin
  foreach statement in array array[
    'insert into public.dog_health_entries(owner_id,dog_id,entry_date,weight_kg) values (auth.uid(),''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'',current_date,99)',
    'insert into public.dog_health_vaccinations(owner_id,dog_id,vaccine_type,administered_on) values (auth.uid(),''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'',''attack'',current_date)',
    'insert into public.dog_health_medications(owner_id,dog_id,name,starts_on) values (auth.uid(),''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'',''attack'',current_date)',
    'insert into public.dog_health_conditions(owner_id,dog_id,kind,name) values (auth.uid(),''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'',''diagnosis'',''attack'')',
    'insert into public.dog_deworming_entries(owner_id,dog_id,treatment_date,product) values (auth.uid(),''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'',current_date,''attack'')',
    'insert into public.dog_vet_appointments(owner_id,dog_id,appointment_at,reason) values (auth.uid(),''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'',now(),''attack'')',
    'insert into public.dog_documents(owner_id,dog_id,kind,title) values (auth.uid(),''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'',''sonstiges'',''attack'')'
  ] loop
    denied := false;
    begin execute statement; exception when others then denied := true; end;
    if not denied then raise exception 'RLS FAIL non-owner INSERT: %', statement; end if;
  end loop;

  foreach statement in array array[
    'update public.dog_health_entries set note=''attack'' where dog_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''',
    'update public.dog_health_vaccinations set note=''attack'' where dog_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''',
    'update public.dog_health_medications set note=''attack'' where dog_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''',
    'update public.dog_health_conditions set note=''attack'' where dog_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''',
    'update public.dog_deworming_entries set note=''attack'' where dog_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''',
    'update public.dog_vet_appointments set note=''attack'' where dog_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''',
    'update public.dog_documents set title=''attack'' where dog_id=''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'''
  ] loop
    execute statement;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'RLS FAIL non-owner UPDATE: %', statement; end if;
  end loop;
end;
$$;

insert into auth.users (id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values
('11111111-1111-1111-1111-111111111111','authenticated','authenticated','owner-a@local.test',now(),'{}','{}',now(),now(),false,false),
('22222222-2222-2222-2222-222222222222','authenticated','authenticated','owner-b@local.test',now(),'{}','{}',now(),now(),false,false),
('33333333-3333-3333-3333-333333333333','authenticated','authenticated','trainer-a@local.test',now(),'{}','{}',now(),now(),false,false),
('44444444-4444-4444-4444-444444444444','authenticated','authenticated','vet-a@local.test',now(),'{}','{}',now(),now(),false,false),
('55555555-5555-5555-5555-555555555555','authenticated','authenticated','family-a@local.test',now(),'{}','{}',now(),now(),false,false),
('66666666-6666-6666-6666-666666666666','authenticated','authenticated','unrelated-a@local.test',now(),'{}','{}',now(),now(),false,false);

insert into public.dogs (id,owner_id,name) values
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','Dog A'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','Dog B');

insert into public.connections (id,owner_user_id,connected_user_id,status,created_by,connection_type,connection_name) values
('c1111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','accepted','owner','trainer_client','Trainer A'),
('c2222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','44444444-4444-4444-4444-444444444444','accepted','owner','trainer_client','Vet A'),
('c3333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555555','accepted','owner','trainer_client','Family A');
insert into public.connection_permissions (connection_id,view_health) values
('c1111111-1111-1111-1111-111111111111',true),('c2222222-2222-2222-2222-222222222222',true),('c3333333-3333-3333-3333-333333333333',true);

insert into public.dog_health_entries (id,owner_id,dog_id,entry_date,weight_kg) values ('10000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','2026-09-20',24.5);
insert into public.dog_health_vaccinations (id,owner_id,dog_id,vaccine_type,administered_on,next_due_on) values ('20000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','rabies','2026-09-01','2027-09-01');
insert into public.dog_deworming_entries (id,owner_id,dog_id,treatment_date,product,next_due_date,treatment_type) values ('30000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','2026-09-02','Product P','2026-12-02','deworming');
insert into public.dog_health_medications (id,owner_id,dog_id,name,starts_on,is_active) values ('40000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Medication M','2026-09-01',true);
insert into public.dog_health_conditions (id,owner_id,dog_id,kind,name,status) values
('50000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','diagnosis','Diagnosis D','active'),
('60000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','allergy','Allergy A','active'),
('70000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','intolerance','Intolerance I','active');
insert into public.dog_vet_appointments (id,owner_id,dog_id,appointment_at,reason,status) values ('80000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','2026-10-01T10:00:00Z','Check','scheduled');
insert into public.dog_documents (id,owner_id,dog_id,kind,title,file_url,category,subtype) values ('90000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','gesundheit','Lab fixture','11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/90000000-0000-0000-0000-000000000001.pdf','health','lab');
insert into storage.objects (id,bucket_id,name,owner,owner_id,metadata) values ('91000000-0000-0000-0000-000000000001','dog-documents','11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/90000000-0000-0000-0000-000000000001.pdf','11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111','{}');

insert into public.dog_health_access_grants (id,dog_id,owner_id,connection_id,grantee_user_id,role_preset,can_view_health_summary,can_view_weight,can_view_vaccinations,can_view_parasite_treatments,can_view_medications,can_view_diagnoses,can_view_allergies,can_view_vet_visits,can_view_vet_reports,can_view_lab_results,can_view_health_documents,can_view_emergency_info)
values
('a1000000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','c1111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','trainer',true,true,false,false,false,false,false,false,false,false,false,false),
('a2000000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','c2222222-2222-2222-2222-222222222222','44444444-4444-4444-4444-444444444444','vet',true,true,true,true,true,true,true,true,true,true,true,true),
('a3000000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','c3333333-3333-3333-3333-333333333333','55555555-5555-5555-5555-555555555555','family',true,true,false,true,true,false,true,false,false,false,false,true);

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pg_temp.assert_count('owner weight', (select count(*) from public.dog_health_entries where dog_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1);
select pg_temp.assert_count('owner vaccination', (select count(*) from public.dog_health_vaccinations where dog_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1);
select pg_temp.assert_count('owner document', (select count(*) from public.dog_documents where dog_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1);
insert into public.dog_health_vaccinations(owner_id,dog_id,vaccine_type,administered_on) values (auth.uid(),'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','owner-test',current_date) returning id;
update public.dog_health_vaccinations set vaccine_name='updated' where vaccine_type='owner-test';
delete from public.dog_health_vaccinations where vaccine_type='owner-test';

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
select pg_temp.assert_count('unrelated weight', (select count(*) from public.dog_health_entries where dog_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0);
select pg_temp.assert_count('unrelated document', (select count(*) from public.dog_documents where dog_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0);
select pg_temp.assert_count('unrelated storage', (select count(*) from storage.objects where name like '11111111-%'), 0);
select pg_temp.assert_count('owner-b dog-a', (select count(*) from public.dog_health_entries where dog_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.dog_health_access_grants set revoked_at=now() where id='a1000000-0000-0000-0000-000000000001';
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select pg_temp.assert_count('connection-only weight', (select count(*) from public.dog_health_entries where dog_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0);
select pg_temp.assert_count('connection-only document', (select count(*) from public.dog_documents where dog_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.dog_health_access_grants set revoked_at=null where id='a1000000-0000-0000-0000-000000000001';
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select pg_temp.assert_count('trainer weight', (select count(*) from public.dog_health_entries where dog_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1);
select pg_temp.assert_count('trainer vaccine', (select count(*) from public.dog_health_vaccinations where dog_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0);
select pg_temp.assert_count('trainer document', (select count(*) from public.dog_documents where dog_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0);
select pg_temp.assert_count('trainer storage', (select count(*) from storage.objects where name like '11111111-%'), 0);
select pg_temp.assert_non_owner_writes_denied();

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select pg_temp.assert_count('vet all health rows', (select count(*) from public.dog_health_conditions where dog_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 3);
select pg_temp.assert_count('vet document', (select count(*) from public.dog_documents where dog_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1);
select pg_temp.assert_count('vet storage', (select count(*) from storage.objects where name like '11111111-%'), 1);
select pg_temp.assert_non_owner_writes_denied();

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
select pg_temp.assert_count('family weight', (select count(*) from public.dog_health_entries where dog_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1);
select pg_temp.assert_count('family parasites', (select count(*) from public.dog_deworming_entries where dog_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1);
select pg_temp.assert_count('family medication', (select count(*) from public.dog_health_medications where dog_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1);
select pg_temp.assert_count('family allergy', (select count(*) from public.dog_health_conditions where dog_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and kind in ('allergy','intolerance')), 2);
select pg_temp.assert_count('family diagnosis', (select count(*) from public.dog_health_conditions where dog_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and kind='diagnosis'), 0);
select pg_temp.assert_count('family documents', (select count(*) from public.dog_documents where dog_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0);
select pg_temp.assert_non_owner_writes_denied();

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.dog_health_access_grants set starts_at=now()+interval '1 day' where id='a1000000-0000-0000-0000-000000000001';
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select pg_temp.assert_count('future grant', (select count(*) from public.dog_health_entries where dog_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0);
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.dog_health_access_grants set starts_at=now()-interval '1 day',expires_at=now()-interval '1 minute' where id='a1000000-0000-0000-0000-000000000001';
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select pg_temp.assert_count('expired grant', (select count(*) from public.dog_health_entries where dog_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0);
select pg_temp.assert_count('expired storage', (select count(*) from storage.objects where name like '11111111-%'), 0);

-- Custom narrow grant: vaccination only, then add documents without
-- reconnecting. Permission columns remain authoritative; role_preset alone
-- never grants access.
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.dog_health_access_grants (
  id,dog_id,owner_id,grantee_user_id,role_preset,
  can_view_vaccinations,can_view_health_documents
) values (
  'a4000000-0000-0000-0000-000000000001',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  '66666666-6666-6666-6666-666666666666',
  'custom',true,false
);
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
select pg_temp.assert_count('custom vaccination', (select count(*) from public.dog_health_vaccinations where dog_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1);
select pg_temp.assert_count('custom medication denied', (select count(*) from public.dog_health_medications where dog_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0);
select pg_temp.assert_count('custom document denied', (select count(*) from public.dog_documents where dog_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0);
select pg_temp.assert_count('custom storage denied', (select count(*) from storage.objects where name like '11111111-%'), 0);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.dog_health_access_grants
set can_view_health_documents=true,
    can_view_lab_results=true
where id='a4000000-0000-0000-0000-000000000001';
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
select pg_temp.assert_count('custom document after grant update', (select count(*) from public.dog_documents where dog_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1);
select pg_temp.assert_count('custom storage after grant update', (select count(*) from storage.objects where name like '11111111-%'), 1);

-- Grant-management attacks: only the owner may create, modify, or revoke.
do $$ begin
  begin
    insert into public.dog_health_access_grants (dog_id,owner_id,grantee_user_id,role_preset)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','66666666-6666-6666-6666-666666666666','custom');
    raise exception 'RLS FAIL non-owner grant INSERT';
  exception when others then null;
  end;
end $$;
update public.dog_health_access_grants
set can_edit_health=true
where id='a4000000-0000-0000-0000-000000000001';
select pg_temp.assert_count('non-owner grant UPDATE', (select count(*) from public.dog_health_access_grants where id='a4000000-0000-0000-0000-000000000001' and can_edit_health), 0);
delete from public.dog_health_access_grants where id='a4000000-0000-0000-0000-000000000001';
select pg_temp.assert_count('non-owner grant DELETE', (select count(*) from public.dog_health_access_grants where id='a4000000-0000-0000-0000-000000000001'), 1);

-- Cross-owner owner_id/dog_id combinations must fail server-side.
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare
  statement text;
begin
  foreach statement in array array[
    'insert into public.dog_health_entries(owner_id,dog_id,entry_date,weight_kg) values (auth.uid,''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'',current_date,99)',
    'insert into public.dog_health_vaccinations(owner_id,dog_id,vaccine_type,administered_on) values (auth.uid,''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'',''cross-owner'',current_date)',
    'insert into public.dog_health_medications(owner_id,dog_id,name,starts_on) values (auth.uid,''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'',''cross-owner'',current_date)',
    'insert into public.dog_health_conditions(owner_id,dog_id,kind,name) values (auth.uid,''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'',''diagnosis'',''cross-owner'')',
    'insert into public.dog_deworming_entries(owner_id,dog_id,treatment_date,product) values (auth.uid,''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'',current_date,''cross-owner'')',
    'insert into public.dog_vet_appointments(owner_id,dog_id,appointment_at,reason) values (auth.uid,''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'',now(),''cross-owner'')',
    'insert into public.dog_documents(owner_id,dog_id,kind,title) values (auth.uid,''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'',''sonstiges'',''cross-owner'')'
  ] loop
    begin
      execute statement;
      raise exception 'RLS FAIL cross-owner INSERT: %', statement;
    exception when others then
      if sqlerrm like 'RLS FAIL%' then raise; end if;
    end;
  end loop;
end $$;

-- The same path helper used by storage.objects must agree with row-level
-- authorization, including legacy kind/category mapping.
select pg_temp.assert_count('owner signed-path authorization',
  (select count(*) from (select public.can_read_dog_document_path('11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/90000000-0000-0000-0000-000000000001.pdf') as allowed) q where q.allowed), 1);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select pg_temp.assert_count('trainer signed-path authorization',
  (select count(*) from (select public.can_read_dog_document_path('11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/90000000-0000-0000-0000-000000000001.pdf') as allowed) q where q.allowed), 0);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select pg_temp.assert_count('vet signed-path authorization',
  (select count(*) from (select public.can_read_dog_document_path('11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/90000000-0000-0000-0000-000000000001.pdf') as allowed) q where q.allowed), 1);

do $$ begin raise notice 'HEALTH_SHARING_RLS|PASS'; end $$;
rollback;
