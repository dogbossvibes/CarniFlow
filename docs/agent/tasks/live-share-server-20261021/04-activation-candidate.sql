-- REVIEW ONLY. Apply only after reviewed normal-JWT bounded live acceptance passes.
-- This is the ONLY general activation. No schema/data cleanup or existing rights rewrite.
begin;
set local statement_timeout='10s';set local lock_timeout='3s';
do $core_pin$ declare e record;begin
 for e in select * from (values ('training_private_dog_epoch','101778517beb94928bc3d4f409c3d0d226441313cb8faab4b6e75f3f181d7ea5',true),('training_private_dog_changed','aea24c0e73c5ff19eabb802444407dc68094f4a57a804ba36c67c9ec78d3ec54',true),('training_private_ms','4ea7cecb3ef37c3290b490a51711ab813f5fcce259cec3c7e17b92407dee27f3',false),('training_private_request','f2fdb985ea9ee3031036482f725655a1bbe37fcf0004f82f1b9f80a37368baff',false),('training_private_uuid','7812b2016087c6afc999cebdd1110422df36ef4ef24d1b4ee12d5fda62c8b529',false),('training_private_text','d4cc7b39b4f7297aa38138b06901c7a84edcabcadf48f7a440fe52844b92421e',false),('training_private_number','ac9057490e8c3baeeb9b19a36c2f4928532a36d2b143b0f4c4f9aa4ced7b18fe',false),('training_private_member','f5e05159de48959559c7c52b6dfc19b3eceb626fcb9e408c9a6dae7b16e465b8',true),('training_private_connected','a9f11c85156bbb012ce38e39019c3befa3596a96188e596ba95ce627ca9aedf3',true),('training_private_participant','43460ef10d34e0e447048889ab0afb332bee34371060dd73488934781bcb1454',true),('training_private_lock_group','ecd8027298d68011d3be4e5f510e73d9d055a8db2360c11fe1b44cb3eb523667',true),('training_private_lock_session','878d83abd46cf253aec6897c9ead6c6ded97e18a1ed4436f8da39f64cfa27e14',true),('training_private_invalidate','bcee274831db2f9d6b852df58a68772f3feee2be135e30c5f25fccbc69c08458',true),('training_private_group_json','803e9783a9f39b2022f736fdf24a2108b47b4afd81bdaf4076f91083a60b1a23',true),('training_private_invitation_json','65b4fb69e9117bde70fc90df31be6194ec643c0873e1bea86347db84a68d3397',true),('training_private_session_json','b036acae05e3811d1210b2ee61db61518d1c8cf9ae8963e64cffab55564fc2ae',true),('training_group_v1','0f3caaa20ed2b15f1b21d670ea7163b197272bbdf90d61095881cfd283260688',true),('training_group_session_v1','f1d3971b7a9f1d153c1bfd7b166947ef704435e823103ab7a53d15e19afd9f43',true),('training_private_live_active','aabf2ca5fcdd6b85064d90dee06d8208d76f074abd36e5f4761aea848c7ee0c3',true),('training_group_live_v1','ed5fd1c34fb176848342d22b6c346309220bb9ceb2ab3efc5fddc6e9ca73fc0b',true),('training_live_maintenance','bb40cc619f44c953dbeba03ee5536e9f74abc24f22cef827a7297a88871badf0',true),('training_live_maintenance_health','ab19a366395d42c35cb9754fdc2689be29028b1de3554b19f8069ad4c39bc830',true)) x(name,h,d) loop
  if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname=e.name)<>1 or not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname=e.name and encode(sha256(convert_to(prosrc,'UTF8')),'hex')=e.h and prosecdef=e.d and pg_get_userbyid(proowner)='postgres' and 'search_path=""'=any(proconfig)) then raise exception 'STOP core dependency drift %',e.name;end if;
 end loop;
end $core_pin$;

do $gate$ declare e record; j bigint; begin
 if current_user<>'postgres' then raise exception 'STOP postgres required';end if;
 if (select count(*)=4 and bool_and(relrowsecurity) from pg_class where oid in('public.subscription_authority'::regclass,'public.user_entitlements'::regclass,'public.training_live_grants'::regclass,'public.training_live_last_positions'::regclass)) is distinct from true then raise exception 'STOP RLS mismatch';end if;
 if exists(select 1 from pg_policies where schemaname='public' and tablename in('subscription_authority','user_entitlements') and permissive='PERMISSIVE' and cmd in('ALL','INSERT','UPDATE','DELETE') and exists(select 1 from unnest(roles) r where r='public' or (r<>'public' and (pg_has_role('authenticated',r,'member') or pg_has_role('anon',r,'member'))))) then raise exception 'STOP client writable authority';end if;
 if has_function_privilege('authenticated','public.tracking_private_active_initiator()','EXECUTE') or has_function_privilege('anon','public.tracking_private_active_initiator()','EXECUTE') then raise exception 'STOP private helper exposed';end if;
 if not has_function_privilege('authenticated','public.track_sharing_access_v1()','EXECUTE') or has_function_privilege('anon','public.track_sharing_access_v1()','EXECUTE') or has_function_privilege('service_role','public.track_sharing_access_v1()','EXECUTE') then raise exception 'STOP access RPC ACL drift';end if;
 if exists(select 1 from pg_class where oid in('public.training_live_grants'::regclass,'public.training_live_last_positions'::regclass) and (has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') or has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'))) then raise exception 'STOP live table exposed';end if;
 if not exists(select 1 from pg_trigger t join pg_proc f on f.oid=t.tgfoid where t.tgrelid='public.profiles'::regclass and t.tgname='trg_protect_internal_tester' and t.tgenabled in('O','A') and t.tgtype=23 and encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')='2e2d458badf064f211ddd023cf1c33de6d1b1e2b95c0cf7d0da5c32377d318de') then raise exception 'STOP tester guard drift';end if;

 for e in select * from (values
 ('public.training_group_live_v1(text,jsonb)','ed5fd1c34fb176848342d22b6c346309220bb9ceb2ab3efc5fddc6e9ca73fc0b'),
 ('public.track_sharing_access_v1()','f5996fbd9831f8ac5eddbddc475c3225a981f1b00a8cd14594ecdb88dfed41dc'),
 ('public.tracking_private_active_initiator()','39aee1d0bb68dd8cf6ff0be50e76f338944b0fe02567fa98e632c488e9245859'),
 ('public.subscription_verified_initiator_v1()','45c2060f300b09ce5f40dcfc0f8d3eb581fefc35589398f1151e83e7a2349609'),
 ('public.training_private_participant(uuid,uuid)','43460ef10d34e0e447048889ab0afb332bee34371060dd73488934781bcb1454'),
 ('public.training_private_live_active(public.training_live_grants)','aabf2ca5fcdd6b85064d90dee06d8208d76f074abd36e5f4761aea848c7ee0c3'),
 ('public.training_live_maintenance(integer)','bb40cc619f44c953dbeba03ee5536e9f74abc24f22cef827a7297a88871badf0'),
 ('public.training_live_maintenance_health()','ab19a366395d42c35cb9754fdc2689be29028b1de3554b19f8069ad4c39bc830')
 ) x(sig,h) loop
  if not exists(select 1 from pg_proc where oid=to_regprocedure(e.sig) and encode(sha256(convert_to(prosrc,'UTF8')),'hex')=e.h and prosecdef and pg_get_userbyid(proowner)='postgres' and 'search_path=""'=any(proconfig)) then raise exception 'STOP function drift %',e.sig;end if;
 end loop;
 if has_function_privilege('authenticated','public.training_group_live_v1(text,jsonb)','EXECUTE') or has_function_privilege('anon','public.training_group_live_v1(text,jsonb)','EXECUTE') then raise exception 'STOP already enabled or exposed';end if;
 if to_regclass('public.training_live_qa_window_20261021') is not null then
  if exists(select 1 from public.training_live_qa_window_20261021 where expires_at>clock_timestamp()) or has_function_privilege('authenticated','public.training_live_qa_20261021(text,text,jsonb)','EXECUTE') then raise exception 'STOP QA must be closed';end if;
 end if;
 select jobid into j from cron.job where jobname='anyvo-training-live-maintenance-v1' and active and schedule='* * * * *' and database=current_database() and username='postgres' and encode(sha256(convert_to(command,'UTF8')),'hex')='7eb6c63433749830332e3db92eeef4937d30eab715b6125a12a55a8ee56b8f95';
 if j is null then raise exception 'STOP exact maintenance job missing';end if;
 if (select count(*) from (select status,end_time from cron.job_run_details where jobid=j order by runid desc limit 2) r where status='succeeded' and end_time>clock_timestamp()-interval '3 minutes')<>2 then raise exception 'STOP recent real scheduler ticks required';end if;
 if (public.training_live_maintenance_health()->>'healthy')::boolean is distinct from true or exists(select 1 from public.training_live_last_positions where purge_after<=clock_timestamp()) then raise exception 'STOP maintenance unhealthy';end if;
 if not exists(select 1 from cron.job where jobname='anyvo-backend-monitor-v1' and active and encode(sha256(convert_to(command,'UTF8')),'hex')='2c9cef4ec6b7cb617ee84154accf327bc1fa1b68ecb15f3bbc0764d4454c9f9a') then raise exception 'STOP protected monitor job mismatch';end if;
end $gate$;
grant execute on function public.training_group_live_v1(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
