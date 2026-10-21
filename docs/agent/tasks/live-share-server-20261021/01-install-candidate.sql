-- REVIEW ONLY. Does not activate Live Share. Existing helpers/authority are reused.
begin;
set local lock_timeout='3s';
do $core_pin$ declare e record;begin
 for e in select * from (values ('training_private_dog_epoch','101778517beb94928bc3d4f409c3d0d226441313cb8faab4b6e75f3f181d7ea5',true),('training_private_dog_changed','aea24c0e73c5ff19eabb802444407dc68094f4a57a804ba36c67c9ec78d3ec54',true),('training_private_ms','4ea7cecb3ef37c3290b490a51711ab813f5fcce259cec3c7e17b92407dee27f3',false),('training_private_request','f2fdb985ea9ee3031036482f725655a1bbe37fcf0004f82f1b9f80a37368baff',false),('training_private_uuid','7812b2016087c6afc999cebdd1110422df36ef4ef24d1b4ee12d5fda62c8b529',false),('training_private_text','d4cc7b39b4f7297aa38138b06901c7a84edcabcadf48f7a440fe52844b92421e',false),('training_private_number','ac9057490e8c3baeeb9b19a36c2f4928532a36d2b143b0f4c4f9aa4ced7b18fe',false),('training_private_member','f5e05159de48959559c7c52b6dfc19b3eceb626fcb9e408c9a6dae7b16e465b8',true),('training_private_connected','a9f11c85156bbb012ce38e39019c3befa3596a96188e596ba95ce627ca9aedf3',true),('training_private_participant','43460ef10d34e0e447048889ab0afb332bee34371060dd73488934781bcb1454',true),('training_private_lock_group','ecd8027298d68011d3be4e5f510e73d9d055a8db2360c11fe1b44cb3eb523667',true),('training_private_lock_session','878d83abd46cf253aec6897c9ead6c6ded97e18a1ed4436f8da39f64cfa27e14',true),('training_private_invalidate','bcee274831db2f9d6b852df58a68772f3feee2be135e30c5f25fccbc69c08458',true),('training_private_group_json','803e9783a9f39b2022f736fdf24a2108b47b4afd81bdaf4076f91083a60b1a23',true),('training_private_invitation_json','65b4fb69e9117bde70fc90df31be6194ec643c0873e1bea86347db84a68d3397',true),('training_private_session_json','b036acae05e3811d1210b2ee61db61518d1c8cf9ae8963e64cffab55564fc2ae',true),('training_group_v1','0f3caaa20ed2b15f1b21d670ea7163b197272bbdf90d61095881cfd283260688',true),('training_group_session_v1','f1d3971b7a9f1d153c1bfd7b166947ef704435e823103ab7a53d15e19afd9f43',true),('training_private_live_active','aabf2ca5fcdd6b85064d90dee06d8208d76f074abd36e5f4761aea848c7ee0c3',true),('training_group_live_v1','416173b81ce74a4ac3c99903033e89ade5f4e5a5a6bea0ee93e163f2ebf48d98',true),('training_live_maintenance','bb40cc619f44c953dbeba03ee5536e9f74abc24f22cef827a7297a88871badf0',true),('training_live_maintenance_health','ab19a366395d42c35cb9754fdc2689be29028b1de3554b19f8069ad4c39bc830',true)) x(name,h,d) loop
  if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname=e.name)<>1 or not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname=e.name and encode(sha256(convert_to(prosrc,'UTF8')),'hex')=e.h and prosecdef=e.d and pg_get_userbyid(proowner)='postgres' and 'search_path=""'=any(proconfig)) then raise exception 'STOP core dependency drift %',e.name;end if;
 end loop;
end $core_pin$;

set local statement_timeout='20s';
do $guard$ declare item record; begin
 if current_user<>'postgres' then raise exception 'STOP postgres required'; end if;
 for item in select * from (values
 ('public.training_group_live_v1(text,jsonb)','416173b81ce74a4ac3c99903033e89ade5f4e5a5a6bea0ee93e163f2ebf48d98'),
 ('public.tracking_private_active_initiator()','39aee1d0bb68dd8cf6ff0be50e76f338944b0fe02567fa98e632c488e9245859'),
 ('public.subscription_verified_initiator_v1()','45c2060f300b09ce5f40dcfc0f8d3eb581fefc35589398f1151e83e7a2349609')
 ) e(sig,h) loop
  if not exists(select 1 from pg_proc where oid=to_regprocedure(item.sig) and encode(sha256(convert_to(prosrc,'UTF8')),'hex')=item.h and prosecdef and pg_get_userbyid(proowner)='postgres' and 'search_path=""'=any(proconfig)) then raise exception 'STOP function drift %',item.sig;end if;
 end loop;
 if to_regprocedure('public.track_sharing_access_v1()') is not null then raise exception 'STOP access RPC already exists';end if;
 if has_function_privilege('authenticated','public.training_group_live_v1(text,jsonb)','EXECUTE') or has_function_privilege('anon','public.training_group_live_v1(text,jsonb)','EXECUTE') then raise exception 'STOP live unexpectedly enabled';end if;
 if has_function_privilege('authenticated','public.tracking_private_active_initiator()','EXECUTE') or has_function_privilege('anon','public.tracking_private_active_initiator()','EXECUTE') then raise exception 'STOP private helper exposed';end if;
 if (select count(*)=4 and bool_and(relrowsecurity) from pg_class where oid in('public.subscription_authority'::regclass,'public.user_entitlements'::regclass,'public.training_live_grants'::regclass,'public.training_live_last_positions'::regclass)) is distinct from true then raise exception 'STOP RLS mismatch';end if;
 if exists(select 1 from pg_policies where schemaname='public' and tablename in('subscription_authority','user_entitlements') and permissive='PERMISSIVE' and cmd in('ALL','INSERT','UPDATE','DELETE') and exists(select 1 from unnest(roles) r where r='public' or (r<>'public' and (pg_has_role('authenticated',r,'member') or pg_has_role('anon',r,'member'))))) then raise exception 'STOP client writable authority';end if;
 if not exists(select 1 from pg_trigger t join pg_proc f on f.oid=t.tgfoid where t.tgrelid='public.profiles'::regclass and t.tgname='trg_protect_internal_tester' and t.tgenabled in('O','A') and t.tgtype=23 and encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')='2e2d458badf064f211ddd023cf1c33de6d1b1e2b95c0cf7d0da5c32377d318de') then raise exception 'STOP tester guard drift';end if;
end $guard$;
create function public.track_sharing_access_v1() returns jsonb
language sql volatile security definer set search_path='' as $$
 select jsonb_build_object('version',1,'canInitiate',public.tracking_private_active_initiator())
$$;
revoke all on function public.track_sharing_access_v1() from public,anon,authenticated,service_role;
grant execute on function public.track_sharing_access_v1() to authenticated;
create or replace function public.training_group_live_v1(p_action text,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare u uuid:=auth.uid();g uuid;s uuid;sh uuid;d uuid;r uuid;ep uuid;ttl integer;seq integer;lat numeric;lng numeric;acc numeric;obs_ms numeric;obs timestamptz;at_time timestamptz;recips jsonb:='{}';normal jsonb;arr jsonb;item jsonb;body jsonb;l public.training_live_grants;
begin
 if p_action in('start','publish') and not public.tracking_private_active_initiator() then raise exception using errcode='42501',message='TRACKING_ACTIVE_REQUIRED';end if;
 case p_action
 when 'start' then perform public.training_private_request(p_request,array['sessionId','shareId','dogId','recipientUserIds','ttlSeconds']);
 when 'publish' then perform public.training_private_request(p_request,array['sessionId','shareId','sequence','latitude','longitude','accuracyM','observedAtServerMs']);
 when 'revoke' then perform public.training_private_request(p_request,array['sessionId','shareId']);
 when 'snapshot' then perform public.training_private_request(p_request,array['sessionId']);
 else raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';
 end case;
 s:=public.training_private_uuid(p_request,'sessionId');g:=public.training_private_lock_session(s);
 if p_action in('start','publish') and not exists(select 1 from public.training_live_maintenance_state where singleton and last_success_at>clock_timestamp()-interval '3 minutes' and due_remaining_lower_bound=0) then
  raise exception using errcode='P0001',message='GROUP_MAINTENANCE_UNAVAILABLE';
 end if;
 if p_action='snapshot' then
  if not public.training_private_participant(s,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
  at_time:=clock_timestamp();
  select coalesce(jsonb_agg(jsonb_build_object('shareId',v.id,'userId',v.owner_id,'sessionId',v.session_id,'dogId',v.dog_id,'latitude',p.latitude,'longitude',p.longitude,'accuracyM',p.accuracy_m,'sequence',p.sequence,'observedAtMs',public.training_private_ms(p.observed_at),'receivedAtMs',public.training_private_ms(p.received_at),'expiresAtMs',public.training_private_ms(v.expires_at)) order by v.id),'[]') into arr from public.training_live_grants v join public.training_live_last_positions p on p.share_id=v.id where v.session_id=s and v.recipients ? u::text and public.training_private_live_active(v) and p.observed_at>=at_time-interval '10 seconds' and p.observed_at<=at_time+interval '2 seconds';
  return jsonb_build_object('version',1,'serverNowMs',public.training_private_ms(clock_timestamp()),'leaseMs',5000,'positions',arr);
 end if;
 sh:=public.training_private_uuid(p_request,'shareId');
 -- Global per-share lock binds absent-row tombstones across all sessions.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('training-live-share:'||sh::text,0));
 select * into l from public.training_live_grants where id=sh for update;
 if found and (l.owner_id<>u or l.session_id<>s) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
 if p_action='revoke' then
  -- Keep historical participant proof; regular logout does not revoke a still-valid JWT.
  if not exists(select 1 from public.training_private_participants where session_id=s and user_id=u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
  if l.id is null then
   if (select count(*) from public.training_live_grants where session_id=s and owner_id=u)>=512 then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
   insert into public.training_live_grants(id,session_id,owner_id,revoked_at) values(sh,s,u,clock_timestamp());
  else update public.training_live_grants set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=sh;end if;
  delete from public.training_live_last_positions where share_id=sh;
  body:=jsonb_build_object('shareId',sh,'revoked',true);
 elsif p_action='start' then
  if not public.training_private_participant(s,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
  d:=public.training_private_uuid(p_request,'dogId');ttl:=public.training_private_number(p_request,'ttlSeconds',60,7200,true);
  select epoch into ep from public.training_private_participants where session_id=s and user_id=u and dog_id=d and left_at is null;
  if ep is null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
  perform 1 from public.dogs where id=d and owner_id=u for share;if not found then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
  arr:=p_request->'recipientUserIds';
  if jsonb_typeof(arr) is distinct from 'array' then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';end if;
  if jsonb_array_length(arr)<1 or jsonb_array_length(arr)>49 then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';end if;
  for item in select value from jsonb_array_elements(arr) loop
   r:=public.training_private_uuid(jsonb_build_object('id',item),'id');
   if r=u or recips ? r::text then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';end if;
   if not public.training_private_participant(s,r) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
   recips:=recips||jsonb_build_object(r::text,(select epoch::text from public.training_private_participants where session_id=s and user_id=r and left_at is null));
  end loop;
  normal:=(p_request-'recipientUserIds')||jsonb_build_object('recipientUserIds',(select jsonb_agg(key order by key) from jsonb_each(recips)));
  if l.id is not null then
   if l.revoked_at is not null then raise exception using errcode='P0001',message='GROUP_REVOKED';end if;
   if l.request<>normal then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
   if not public.training_private_live_active(l) then raise exception using errcode='P0001',message='GROUP_EXPIRED';end if;
  else
   if (select count(*) from public.training_live_grants where session_id=s and owner_id=u)>=512 or exists(select 1 from public.training_live_grants v where v.session_id=s and v.owner_id=u and public.training_private_live_active(v)) then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
   at_time:=clock_timestamp();
   insert into public.training_live_grants(id,session_id,owner_id,dog_id,sender_epoch,recipients,request,started_at,expires_at) values(sh,s,u,d,ep,recips,normal,at_time,least(at_time+make_interval(secs=>ttl),(select expires_at from public.training_private_sessions where id=s))) returning * into l;
  end if;
  body:=jsonb_build_object('shareId',sh,'userId',u,'sessionId',s,'dogId',l.dog_id,'expiresAtMs',public.training_private_ms(l.expires_at),'recipientUserIds',normal->'recipientUserIds');
 else
  if l.id is null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
  if l.revoked_at is not null then raise exception using errcode='P0001',message='GROUP_REVOKED';end if;
  if not public.training_private_live_active(l) then raise exception using errcode='P0001',message='GROUP_EXPIRED';end if;
  seq:=public.training_private_number(p_request,'sequence',1,2147483647,true);lat:=public.training_private_number(p_request,'latitude',-90,90,false);lng:=public.training_private_number(p_request,'longitude',-180,180,false);acc:=public.training_private_number(p_request,'accuracyM',0,10000,false);obs_ms:=public.training_private_number(p_request,'observedAtServerMs',0,8640000000000000,true);obs:=to_timestamp((obs_ms/1000)::double precision);
  if seq<=l.last_sequence then
   if seq<>l.last_sequence or l.last_payload_hash is distinct from sha256(convert_to(p_request::text,'UTF8')) then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
   -- Idempotent delivery ACK never refreshes stale position/receive time.
   body:=jsonb_build_object('shareId',sh,'sequence',seq,'accepted',false,'expiresAtMs',public.training_private_ms(l.expires_at));
  else
   at_time:=clock_timestamp();
   if obs_ms<public.training_private_ms(l.started_at) or obs<at_time-interval '10 seconds' or obs>at_time+interval '2 seconds' then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';end if;
   if l.last_sequence>0 and (at_time-l.last_received_at<interval '5 seconds' or obs<l.last_observed_at) then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
   update public.training_live_grants set last_sequence=seq,last_payload_hash=sha256(convert_to(p_request::text,'UTF8')),last_observed_at=obs,last_received_at=at_time where id=sh;
   insert into public.training_live_last_positions(share_id,sequence,latitude,longitude,accuracy_m,observed_at,received_at,purge_after,request) values(sh,seq,lat,lng,acc,obs,at_time,least(at_time+interval '60 seconds',l.expires_at,(select expires_at from public.training_private_sessions where id=s)),p_request) on conflict(share_id) do update set sequence=excluded.sequence,latitude=excluded.latitude,longitude=excluded.longitude,accuracy_m=excluded.accuracy_m,observed_at=excluded.observed_at,received_at=excluded.received_at,purge_after=excluded.purge_after,request=excluded.request;
   body:=jsonb_build_object('shareId',sh,'sequence',seq,'accepted',true,'expiresAtMs',public.training_private_ms(l.expires_at));
  end if;
 end if;
 return jsonb_build_object('version',1,'serverNowMs',public.training_private_ms(clock_timestamp()))||body;
end $$;
commit;
