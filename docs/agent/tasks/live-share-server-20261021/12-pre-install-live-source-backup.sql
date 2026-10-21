-- READ-ONLY SOURCE BACKUP: equals fresh production prosrc fingerprint.
-- Reference only; no automatic execution. Disable live before any reviewed restoration.
create or replace function public.training_group_live_v1(p_action text,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare u uuid:=auth.uid();g uuid;s uuid;sh uuid;d uuid;r uuid;ep uuid;ttl integer;seq integer;lat numeric;lng numeric;acc numeric;obs_ms numeric;obs timestamptz;at_time timestamptz;recips jsonb:='{}';normal jsonb;arr jsonb;item jsonb;body jsonb;l public.training_live_grants;
begin
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
