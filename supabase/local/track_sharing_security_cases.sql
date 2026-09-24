-- LOCAL ONLY: local Docker Unix socket. All fixtures roll back.
\set ON_ERROR_STOP on
begin;
do $$ begin if inet_server_addr() is not null then raise exception 'Local Unix socket required'; end if; end $$;
create temporary table qa_assertions(label text);
grant all on qa_assertions to authenticated;
create function pg_temp.ok(label text, condition boolean) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'TRACK RLS FAIL: %',label; end if;
 insert into qa_assertions values(label);
end $$;
create function pg_temp.rows(label text, command text, expected integer) returns void language plpgsql as $$
declare n integer;
begin execute command; get diagnostics n = row_count; perform pg_temp.ok(label,n=expected); end $$;
create function pg_temp.denied(label text, command text) returns void language plpgsql as $$
declare blocked boolean := false;
begin
 begin execute command; exception when insufficient_privilege then blocked:=true; end;
 perform pg_temp.ok(label,blocked);
end $$;
create function pg_temp.track_access(label text, track uuid, expected integer) returns void language plpgsql as $$
declare tbl text; n integer;
begin
 select count(*) into n from public.training_sessions where id=track;
 perform pg_temp.ok(label||': session',n=expected);
 foreach tbl in array array['track_points','track_markers','track_runs','track_engine_sessions'] loop
  execute format('select count(*) from public.%I where session_id=$1',tbl) into n using track;
  perform pg_temp.ok(label||': '||tbl,n=expected * case tbl when 'track_points' then 2 when 'track_markers' then 3 else 1 end);
 end loop;
 select count(*) into n from public.training_sessions where id=track and track_data->'run'->'analytics'->>'trackScore'='82';
 perform pg_temp.ok(label||': persisted analytics',n=expected);
 select count(*) into n from public.shared_track_display(track);
 perform pg_temp.ok(label||': display names',n=expected);
end $$;

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values('11111111-1111-1111-1111-111111111111','authenticated','authenticated','track-owner@local.test',now(),'{}','{}',now(),now(),false,false);
insert into public.profiles(id,full_name) values('11111111-1111-1111-1111-111111111111','Synthetic owner') on conflict(id) do update set full_name=excluded.full_name;

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values('22222222-2222-2222-2222-222222222222','authenticated','authenticated','track-other@local.test',now(),'{}','{}',now(),now(),false,false);
insert into public.profiles(id,full_name) values('22222222-2222-2222-2222-222222222222','Synthetic other') on conflict(id) do update set full_name=excluded.full_name;

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values('33333333-3333-3333-3333-333333333333','authenticated','authenticated','track-trainer@local.test',now(),'{}','{}',now(),now(),false,false);
insert into public.profiles(id,full_name) values('33333333-3333-3333-3333-333333333333','Synthetic trainer') on conflict(id) do update set full_name=excluded.full_name;

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values('44444444-4444-4444-4444-444444444444','authenticated','authenticated','track-stranger@local.test',now(),'{}','{}',now(),now(),false,false);
insert into public.profiles(id,full_name) values('44444444-4444-4444-4444-444444444444','Synthetic stranger') on conflict(id) do update set full_name=excluded.full_name;
insert into public.dogs(id,owner_id,name) values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','Synthetic dog');
insert into public.connections(id,owner_user_id,connected_user_id,status,created_by,connection_type) values('c1111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','accepted','owner','trainer_client');

insert into public.training_sessions(id,owner_id,dog_id,type,status,title,session_date,category,training_type,duration_seconds,distance_meters,weather_condition,notes,gps_quality_average,track_data)
values('a1111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','track','completed','Synthetic track',current_date,'IGP','privat',120,240,'sunny','Synthetic note',3,
'{"run":{"analytics":{"trackScore":82,"analysisConfidenceBand":"good","deviation":{"meanM":1,"medianM":1,"p95M":2,"maxM":3},"pace":{"avgMps":2},"reacquisition":{"completedCount":1},"corners":[],"objects":[]}}}');
insert into public.track_points(session_id,latitude,longitude) values('a1111111-1111-1111-1111-111111111111',47.1,8.5);
insert into public.track_markers(session_id,marker_type,latitude,longitude,angle_kind) values('a1111111-1111-1111-1111-111111111111','winkel',47.1,8.5,'spitz_links');
insert into public.track_runs(session_id,run_points) values('a1111111-1111-1111-1111-111111111111','[{"lat":47.1,"lng":8.5,"t":1},{"lat":47.2,"lng":8.6,"t":2}]');
insert into public.track_engine_sessions(session_id,engine,platform,average_accuracy,gps_stats) values('a1111111-1111-1111-1111-111111111111','native_precision','ios',3,'{"quality":"good"}');

insert into public.training_sessions(id,owner_id,dog_id,type,status,title,session_date,category,training_type,duration_seconds,distance_meters,weather_condition,notes,gps_quality_average,track_data)
values('a2222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','track','completed','Synthetic track',current_date,'IGP','privat',120,240,'sunny','Synthetic note',3,
'{"run":{"analytics":{"trackScore":82,"analysisConfidenceBand":"good","deviation":{"meanM":1,"medianM":1,"p95M":2,"maxM":3},"pace":{"avgMps":2},"reacquisition":{"completedCount":1},"corners":[],"objects":[]}}}');
insert into public.track_points(session_id,latitude,longitude) values('a2222222-2222-2222-2222-222222222222',47.1,8.5);
insert into public.track_markers(session_id,marker_type,latitude,longitude,angle_kind) values('a2222222-2222-2222-2222-222222222222','winkel',47.1,8.5,'spitz_links');
insert into public.track_runs(session_id,run_points) values('a2222222-2222-2222-2222-222222222222','[{"lat":47.1,"lng":8.5,"t":1},{"lat":47.2,"lng":8.6,"t":2}]');
insert into public.track_engine_sessions(session_id,engine,platform,average_accuracy,gps_stats) values('a2222222-2222-2222-2222-222222222222','native_precision','ios',3,'{"quality":"good"}');
-- Additional canonical marker types and a second lay point provide real
-- start/end, normal/sharp corner and object fixtures for every access check.
insert into public.track_points(session_id,latitude,longitude)
select id,47.2,8.6 from public.training_sessions where owner_id='11111111-1111-1111-1111-111111111111';
insert into public.track_markers(session_id,marker_type,latitude,longitude,angle_kind)
select id,'winkel',47.15,8.55,'rechts' from public.training_sessions where owner_id='11111111-1111-1111-1111-111111111111';
insert into public.track_markers(session_id,marker_type,latitude,longitude,material)
select id,'gegenstand',47.16,8.56,'holz' from public.training_sessions where owner_id='11111111-1111-1111-1111-111111111111';
set local role authenticated;
set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select pg_temp.track_access('owner TRACK_1','a1111111-1111-1111-1111-111111111111',1);
select pg_temp.track_access('owner TRACK_2','a2222222-2222-2222-2222-222222222222',1);
select pg_temp.denied('unconnected share',$q$insert into public.track_shares(track_id,owner_user_id,trainer_user_id) values('a1111111-1111-1111-1111-111111111111',auth.uid(),'44444444-4444-4444-4444-444444444444')$q$);
insert into public.track_shares(id,track_id,owner_user_id,trainer_user_id) values('e1111111-1111-1111-1111-111111111111','a1111111-1111-1111-1111-111111111111',auth.uid(),'33333333-3333-3333-3333-333333333333');
insert into public.track_feedback(id,track_share_id,author_user_id,body) values('f1111111-1111-1111-1111-111111111111','e1111111-1111-1111-1111-111111111111',auth.uid(),'Owner reply');
set local role authenticated;
set local request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
select pg_temp.track_access('trainer shared','a1111111-1111-1111-1111-111111111111',1);
select pg_temp.track_access('trainer unshared','a2222222-2222-2222-2222-222222222222',0);
select pg_temp.ok('only names returned',(select dog_name='Synthetic dog' and owner_name='Synthetic owner' from public.shared_track_display('a1111111-1111-1111-1111-111111111111')));
select pg_temp.ok('dog rows not broadened',(select count(*)=0 from public.dogs where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));
select pg_temp.ok('owner profile not broadened',(select count(*)=0 from public.profiles where id='11111111-1111-1111-1111-111111111111'));
select pg_temp.ok('UI persisted fields',(select duration_seconds=120 and distance_meters=240 and weather_condition='sunny' and notes='Synthetic note' and gps_quality_average=3 from public.training_sessions where id='a1111111-1111-1111-1111-111111111111'));
select pg_temp.rows('no session edits',$q$update public.training_sessions set notes='attack' where id='a1111111-1111-1111-1111-111111111111'$q$,0);
select pg_temp.rows('no owner share revoke',$q$update public.track_shares set revoked_at=now() where id='e1111111-1111-1111-1111-111111111111'$q$,0);
select pg_temp.rows('no owner share delete',$q$delete from public.track_shares where id='e1111111-1111-1111-1111-111111111111'$q$,0);
select pg_temp.rows('no track_points update',$q$update public.track_points set session_id=session_id where session_id='a1111111-1111-1111-1111-111111111111'$q$,0);
select pg_temp.rows('no track_points delete',$q$delete from public.track_points where session_id='a1111111-1111-1111-1111-111111111111'$q$,0);
select pg_temp.rows('no track_markers update',$q$update public.track_markers set session_id=session_id where session_id='a1111111-1111-1111-1111-111111111111'$q$,0);
select pg_temp.rows('no track_markers delete',$q$delete from public.track_markers where session_id='a1111111-1111-1111-1111-111111111111'$q$,0);
select pg_temp.rows('no track_runs update',$q$update public.track_runs set session_id=session_id where session_id='a1111111-1111-1111-1111-111111111111'$q$,0);
select pg_temp.rows('no track_runs delete',$q$delete from public.track_runs where session_id='a1111111-1111-1111-1111-111111111111'$q$,0);
select pg_temp.rows('no track_engine_sessions update',$q$update public.track_engine_sessions set session_id=session_id where session_id='a1111111-1111-1111-1111-111111111111'$q$,0);
select pg_temp.rows('no track_engine_sessions delete',$q$delete from public.track_engine_sessions where session_id='a1111111-1111-1111-1111-111111111111'$q$,0);
select pg_temp.denied('no point insert',$q$insert into public.track_points(session_id,latitude,longitude) values('a1111111-1111-1111-1111-111111111111',47,8)$q$);
select pg_temp.rows('no owner reply edit',$q$update public.track_feedback set body='attack' where id='f1111111-1111-1111-1111-111111111111'$q$,0);
select pg_temp.rows('no owner reply delete',$q$delete from public.track_feedback where id='f1111111-1111-1111-1111-111111111111'$q$,0);
insert into public.track_feedback(id,track_share_id,author_user_id,body,reaction) values('f3333333-3333-3333-3333-333333333333','e1111111-1111-1111-1111-111111111111',auth.uid(),'Trainer comment','👍');
select pg_temp.rows('own feedback reaction ✅',$q$update public.track_feedback set body='Edited',reaction='✅' where id='f3333333-3333-3333-3333-333333333333'$q$,1);
select pg_temp.rows('own feedback reaction 👀',$q$update public.track_feedback set body='Edited',reaction='👀' where id='f3333333-3333-3333-3333-333333333333'$q$,1);
select pg_temp.rows('own feedback reaction 💡',$q$update public.track_feedback set body='Edited',reaction='💡' where id='f3333333-3333-3333-3333-333333333333'$q$,1);
select pg_temp.ok('feedback persisted',(select body='Edited' and reaction='💡' from public.track_feedback where id='f3333333-3333-3333-3333-333333333333'));
select pg_temp.denied('spoof author',$q$insert into public.track_feedback(track_share_id,author_user_id,body) values('e1111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111','attack')$q$);
select pg_temp.rows('own delete',$q$delete from public.track_feedback where id='f3333333-3333-3333-3333-333333333333'$q$,1);
insert into public.track_feedback(id,track_share_id,author_user_id,body) values('f3333333-3333-3333-3333-333333333333','e1111111-1111-1111-1111-111111111111',auth.uid(),'Retained feedback');
set local role authenticated;
set local request.jwt.claim.sub='44444444-4444-4444-4444-444444444444';
select pg_temp.track_access('stranger blocked','a1111111-1111-1111-1111-111111111111',0);
select pg_temp.track_access('stranger unshared','a2222222-2222-2222-2222-222222222222',0);
select pg_temp.ok('stranger feedback hidden',(select count(*)=0 from public.track_feedback where track_share_id='e1111111-1111-1111-1111-111111111111'));
select pg_temp.denied('stranger feedback insert',$q$insert into public.track_feedback(track_share_id,author_user_id,body) values('e1111111-1111-1111-1111-111111111111',auth.uid(),'Synthetic feedback')$q$);
select pg_temp.denied('stranger share foreign track',$q$insert into public.track_shares(track_id,owner_user_id,trainer_user_id) values('a1111111-1111-1111-1111-111111111111',auth.uid(),'33333333-3333-3333-3333-333333333333')$q$);
set local role authenticated;
set local request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
select pg_temp.track_access('other blocked','a1111111-1111-1111-1111-111111111111',0);
select pg_temp.track_access('other unshared','a2222222-2222-2222-2222-222222222222',0);
select pg_temp.ok('other feedback hidden',(select count(*)=0 from public.track_feedback where track_share_id='e1111111-1111-1111-1111-111111111111'));
select pg_temp.denied('other feedback insert',$q$insert into public.track_feedback(track_share_id,author_user_id,body) values('e1111111-1111-1111-1111-111111111111',auth.uid(),'Synthetic feedback')$q$);
select pg_temp.denied('other share foreign track',$q$insert into public.track_shares(track_id,owner_user_id,trainer_user_id) values('a1111111-1111-1111-1111-111111111111',auth.uid(),'33333333-3333-3333-3333-333333333333')$q$);
select pg_temp.ok('helper caller bound',not public.can_view_shared_track('a1111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333'));
set local role authenticated;
set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select pg_temp.ok('owner reads feedback',(select count(*)=2 from public.track_feedback where track_share_id='e1111111-1111-1111-1111-111111111111'));
select pg_temp.rows('owner reply edit',$q$update public.track_feedback set body='Updated reply' where id='f1111111-1111-1111-1111-111111111111'$q$,1);
select pg_temp.rows('owner cannot edit trainer',$q$update public.track_feedback set body='attack' where id='f3333333-3333-3333-3333-333333333333'$q$,0);
select pg_temp.rows('owner cannot delete trainer',$q$delete from public.track_feedback where id='f3333333-3333-3333-3333-333333333333'$q$,0);
select pg_temp.denied('share identity immutable',$q$update public.track_shares set track_id='a2222222-2222-2222-2222-222222222222' where id='e1111111-1111-1111-1111-111111111111'$q$);
update public.connections set status='blocked' where id='c1111111-1111-1111-1111-111111111111';
set local role authenticated;
set local request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
select pg_temp.track_access('connection ended','a1111111-1111-1111-1111-111111111111',0);
select pg_temp.ok('connection ended feedback hidden',(select count(*)=0 from public.track_feedback where track_share_id='e1111111-1111-1111-1111-111111111111'));
select pg_temp.denied('connection ended feedback insert',$q$insert into public.track_feedback(track_share_id,author_user_id,body) values('e1111111-1111-1111-1111-111111111111',auth.uid(),'Synthetic feedback')$q$);
set local role authenticated;
set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select pg_temp.rows('revoke after connection ended',$q$update public.track_shares set revoked_at=now() where id='e1111111-1111-1111-1111-111111111111'$q$,1);
update public.connections set status='accepted' where id='c1111111-1111-1111-1111-111111111111';
set local role authenticated;
set local request.jwt.claim.sub='33333333-3333-3333-3333-333333333333';
select pg_temp.track_access('revoked','a1111111-1111-1111-1111-111111111111',0);
select pg_temp.ok('revoked feedback hidden',(select count(*)=0 from public.track_feedback where track_share_id='e1111111-1111-1111-1111-111111111111'));
select pg_temp.denied('revoked feedback insert',$q$insert into public.track_feedback(track_share_id,author_user_id,body) values('e1111111-1111-1111-1111-111111111111',auth.uid(),'Synthetic feedback')$q$);
select pg_temp.rows('revoked edit blocked',$q$update public.track_feedback set body='attack' where id='f3333333-3333-3333-3333-333333333333'$q$,0);
select pg_temp.rows('revoked delete blocked',$q$delete from public.track_feedback where id='f3333333-3333-3333-3333-333333333333'$q$,0);
set local role authenticated;
set local request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select pg_temp.track_access('owner after revoke','a1111111-1111-1111-1111-111111111111',1);
select pg_temp.ok('owner historical feedback',(select count(*)=2 from public.track_feedback where track_share_id='e1111111-1111-1111-1111-111111111111'));
select pg_temp.denied('no revoked resurrection',$q$update public.track_shares set revoked_at=null where id='e1111111-1111-1111-1111-111111111111'$q$);
select 'TRACK_SHARING_RLS|PASS|assertions='||count(*) from qa_assertions;
rollback;
