-- ============================================================================
-- ANYVO LOCAL TEST ONLY — dogs.track_overlay_color_key (Multi-Dog overlay colors)
-- DO NOT APPLY TO PRODUCTION.
--
-- Run (local Docker Unix socket, migration applied INSIDE the same transaction,
-- everything rolls back):
--   (echo '\set ON_ERROR_STOP on'; echo 'begin;';
--    cat supabase/migrations/20261005120000_dogs_track_overlay_color_key.sql;
--    cat supabase/local/dogs_track_overlay_color_cases.sql) |
--   docker exec -i supabase_db_anyvo-digital-health-record psql -U postgres -d postgres
-- Expected: DOGS_TRACK_COLOR|PASS|assertions=14, then ROLLBACK.
-- ============================================================================
do $$ begin if inet_server_addr() is not null then raise exception 'Local Unix socket required'; end if; end $$;
create temporary table qa_assertions(label text);
grant all on qa_assertions to authenticated;
create function pg_temp.ok(label text, condition boolean) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'DOGS TRACK COLOR FAIL: %',label; end if;
 insert into qa_assertions values(label);
end $$;
create function pg_temp.rows(label text, command text, expected integer) returns void language plpgsql as $$
declare n integer;
begin execute command; get diagnostics n = row_count; perform pg_temp.ok(label,n=expected); end $$;
create function pg_temp.check_violation(label text, command text) returns void language plpgsql as $$
declare blocked boolean := false;
begin
 begin execute command; exception when check_violation then blocked:=true; end;
 perform pg_temp.ok(label,blocked);
end $$;

-- Schema: nullable, no default; existing dogs unchanged (no backfill).
select pg_temp.ok('column nullable, no default', exists(
  select 1 from information_schema.columns where table_schema='public' and table_name='dogs'
   and column_name='track_overlay_color_key' and is_nullable='YES' and column_default is null));
select pg_temp.ok('existing dogs untouched (all NULL)', not exists(select 1 from public.dogs where track_overlay_color_key is not null));

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values('d1111111-1111-1111-1111-111111111111','authenticated','authenticated','color-owner@local.test',now(),'{}','{}',now(),now(),false,false),
      ('d2222222-2222-2222-2222-222222222222','authenticated','authenticated','color-other@local.test',now(),'{}','{}',now(),now(),false,false);
insert into public.dogs(id,owner_id,name) values
  ('da111111-1111-1111-1111-111111111111','d1111111-1111-1111-1111-111111111111','Malu'),
  ('db222222-2222-2222-2222-222222222222','d2222222-2222-2222-2222-222222222222','Fremd');

-- Owner A
set local role authenticated;
set local request.jwt.claim.sub='d1111111-1111-1111-1111-111111111111';
select pg_temp.rows('owner sets own dog violet', $$update public.dogs set track_overlay_color_key='violet' where id='da111111-1111-1111-1111-111111111111'$$, 1);
select pg_temp.ok('owner reads violet', (select track_overlay_color_key from public.dogs where id='da111111-1111-1111-1111-111111111111')='violet');
select pg_temp.rows('owner resets to automatic (NULL)', $$update public.dogs set track_overlay_color_key=null where id='da111111-1111-1111-1111-111111111111'$$, 1);
select pg_temp.check_violation('unknown key rejected', $$update public.dogs set track_overlay_color_key='red' where id='da111111-1111-1111-1111-111111111111'$$);
select pg_temp.check_violation('hex value rejected', $$update public.dogs set track_overlay_color_key='#FF9838' where id='da111111-1111-1111-1111-111111111111'$$);
select pg_temp.rows('owner cannot change foreign dog color', $$update public.dogs set track_overlay_color_key='pink' where id='db222222-2222-2222-2222-222222222222'$$, 0);
select pg_temp.ok('foreign dog not readable (no color leak)', not exists(select 1 from public.dogs where id='db222222-2222-2222-2222-222222222222'));
select pg_temp.rows('owner inserts own dog with key', $$insert into public.dogs(owner_id,name,track_overlay_color_key) values('d1111111-1111-1111-1111-111111111111','Skadi','orange')$$, 1);
select pg_temp.check_violation('insert with invalid key rejected', $$insert into public.dogs(owner_id,name,track_overlay_color_key) values('d1111111-1111-1111-1111-111111111111','X','mint')$$);
reset role;

-- Other user B
set local role authenticated;
set local request.jwt.claim.sub='d2222222-2222-2222-2222-222222222222';
select pg_temp.rows('other user cannot change A dog color', $$update public.dogs set track_overlay_color_key='blue' where id='da111111-1111-1111-1111-111111111111'$$, 0);
select pg_temp.ok('other user cannot read A dog', not exists(select 1 from public.dogs where id='da111111-1111-1111-1111-111111111111'));
reset role;
select pg_temp.ok('A dog color unchanged by B (NULL)', (select track_overlay_color_key from public.dogs where id='da111111-1111-1111-1111-111111111111') is null);

select 'DOGS_TRACK_COLOR|PASS|assertions=' || count(*) from qa_assertions;
rollback;
