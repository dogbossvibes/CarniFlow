const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {PGlite}=require('./runtime/node_modules/@electric-sql/pglite');
const root=path.resolve(__dirname,'../..'),base=path.join(root,'anyvo-group-live-share-db/docs/agent/tasks/subscription-authority');
const db=new PGlite(),checks=[];
const c={query:async(sql,params)=>params?db.query(sql,params):(await db.exec(sql)).at(-1)??{rows:[]}};
const uuid=n=>`33333333-3333-4000-8000-${String(n).padStart(12,'0')}`;
const A=uuid(1),B=uuid(2),C=uuid(3),AD=uuid(11),BD=uuid(12);let serial=300;
const fresh=()=>uuid(serial++);
async function check(name,fn){await fn();checks.push(name);console.log('PASS',name);}
async function as(u,sql,args,role='authenticated'){await c.query('begin');try{await c.query('set local role '+role);await c.query("select set_config('request.jwt.claim.sub',$1,true)",[u||'']);const x=await c.query(sql,args);await c.query('commit');return x.rows[0]?.x;}catch(e){await c.query('rollback');throw e;}}
const call=(u,kind,action,request)=>as(u,`select public.training_group${kind}_v1($1,$2) x`,[action,request]);
const deny=(promise,message)=>assert.rejects(promise,e=>e.message===message);
(async()=>{try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 const src=fs.readFileSync(path.join(base,'10-integrated-tests.cjs'),'utf8');
 let fixture=src.slice(src.indexOf(' await c.query(`create schema auth;'),src.indexOf(" await check('stage1 and real sharing gates"));
 fixture=fixture.replace('grant execute on function training_group_live_v1(text,jsonb) to authenticated;','');
 await new Function('c','fs','path','__dirname','check','A','B','C','AD','BD','CD','SOURCE','AB',`return (async()=>{${fixture}})();`)(c,fs,path,base,check,...[1,2,3,11,12,13,20,30].map(uuid));
 await c.query(fs.readFileSync(path.join(base,'01-stage-server.sql'),'utf8'));
 await c.query(`create function public.tracking_private_active_initiator() returns boolean language sql volatile security definer set search_path='' as $$
 select public.subscription_verified_initiator_v1()
$$;revoke all on function tracking_private_active_initiator() from public,anon,authenticated,service_role;`);
 const candidate=fs.readFileSync(path.join(__dirname,'01-install-candidate.sql'),'utf8');
 const before=(await c.query("select proname,prosrc,proacl::text from pg_proc where pronamespace='public'::regnamespace")).rows;
 await check('authority RLS disabled aborts entire installer',async()=>{await c.query('alter table subscription_authority disable row level security');await assert.rejects(c.query(candidate),/RLS mismatch/);await c.query('rollback');assert.equal((await c.query("select to_regprocedure('track_sharing_access_v1()') x")).rows[0].x,null);await c.query('alter table subscription_authority enable row level security');});
 await check('exact guarded candidate installs against existing private helper',()=>c.query(candidate));
 await check('only live body and new access RPC change; old ACL and authority unchanged',async()=>{const after=(await c.query("select proname,prosrc,proacl::text from pg_proc where pronamespace='public'::regnamespace")).rows;const prev=new Map(before.map(x=>[x.proname,x]));assert.deepEqual(after.filter(x=>!prev.has(x.proname)).map(x=>x.proname),['track_sharing_access_v1']);for(const row of after){if(!prev.has(row.proname))continue;const old=prev.get(row.proname);assert.equal(row.proacl,old.proacl,row.proname);if(row.proname!=='training_group_live_v1')assert.equal(row.prosrc,old.prosrc,row.proname);}});
 await check('install does not activate live and private helper stays inaccessible',async()=>{for(const sig of ['training_group_live_v1(text,jsonb)','tracking_private_active_initiator()'])for(const role of ['authenticated','anon'])assert.equal((await c.query('select has_function_privilege($1,$2,\'EXECUTE\') x',[role,sig])).rows[0].x,false);});
 await check('normal account has no initiator capability and anon access denied',async()=>{assert.deepEqual(await as(B,'select track_sharing_access_v1() x'),{version:1,canInitiate:false});await assert.rejects(as(null,'select track_sharing_access_v1() x',undefined,'anon'),e=>e.code==='42501');});
 // Synthetic test-only API activation, not a production migration or cron proof.
 await c.query('grant execute on function training_group_live_v1(text,jsonb) to authenticated');
 await c.query('select training_live_maintenance(1000)');
 await check('unpaid sender start and publish fail before request details',async()=>{for(const action of ['start','publish'])await deny(call(B,'_live',action,{}),'TRACKING_ACTIVE_REQUIRED');});
 await check('forged legacy subscription and capability mirrors cannot enable sending',async()=>{await c.query("insert into user_capabilities(user_id,pro_member,trainer_module) values($1,true,true)",[B]);await c.query("insert into subscriptions(user_id,plan,status,expires_at) values($1,'trainer','active',clock_timestamp()+interval '1 day')",[B]);assert.equal((await as(B,'select track_sharing_access_v1() x')).canInitiate,false);});
 await check('protected ACTIVE Founder Trainer snapshots authorize only before expiry',async()=>{for(const plan of ['active','founder_active','trainer']){await c.query("insert into subscription_authority(user_id,snapshot) values($1,jsonb_build_object('plan',$2::text,'expiresAt',clock_timestamp()+interval '1 hour')) on conflict(user_id) do update set snapshot=excluded.snapshot",[C,plan]);assert.equal((await as(C,'select track_sharing_access_v1() x')).canInitiate,true);await c.query("update subscription_authority set snapshot=jsonb_set(snapshot,'{expiresAt}',to_jsonb(clock_timestamp()-interval '1 second')) where user_id=$1",[C]);assert.equal((await as(C,'select track_sharing_access_v1() x')).canInitiate,false);await deny(call(C,'_live','publish',{}),'TRACKING_ACTIVE_REQUIRED');}});
 await check('time-limited active_lifetime row is not silently treated as lifetime',async()=>{await c.query("insert into user_entitlements(user_id,entitlement,expires_at) values($1,'active_lifetime',clock_timestamp()+interval '1 day')",[B]);assert.equal((await as(B,'select track_sharing_access_v1() x')).canInitiate,false);});
 await c.query("insert into user_entitlements(user_id,entitlement) values($1,'active_lifetime')",[A]);
 const G=fresh(),S=fresh(),I=fresh(),P=fresh(),SH=fresh();
 await call(A,'','create',{groupId:G,title:'SYNTHETIC live test',displayName:'A'});
 await call(A,'','invite',{groupId:G,invitationId:I,recipientUserId:B,ttlSeconds:3600});
 await check('invitation alone does not reveal group or position details',()=>deny(call(B,'_live','snapshot',{sessionId:S}),'GROUP_UNAVAILABLE'));
 await call(B,'','accept',{invitationId:I,displayName:'B'});
 await call(A,'_session','open',{groupId:G,sessionId:S,title:'Synthetic session',ttlSeconds:7200,dogId:AD});
 await check('accepted group member must also join this session',()=>deny(call(B,'_live','snapshot',{sessionId:S}),'GROUP_UNAVAILABLE'));
 await call(B,'_session','join',{sessionId:S,participationId:P,dogId:BD});
 const start={sessionId:S,shareId:SH,dogId:AD,recipientUserIds:[B],ttlSeconds:60};
 await check('start rejects foreign dog and outsiders as recipients',async()=>{await deny(call(A,'_live','start',{...start,dogId:BD}),'GROUP_UNAVAILABLE');await deny(call(A,'_live','start',{...start,recipientUserIds:[C]}),'GROUP_UNAVAILABLE');});
 let started;
 await check('lifetime owner starts bounded share; exact retry cannot extend TTL',async()=>{started=await call(A,'_live','start',start);const replay=await call(A,'_live','start',start);assert.equal(started.expiresAtMs,replay.expiresAtMs);});
 const point=async(seq=1)=>({sessionId:S,shareId:SH,sequence:seq,latitude:0,longitude:0,accuracyM:3,observedAtServerMs:(await c.query('select training_private_ms(clock_timestamp()) x')).rows[0].x});
 let pos=await point();
 await check('authorized position visible only to selected recipient; exact publish retry idempotent',async()=>{assert.equal((await call(A,'_live','publish',pos)).accepted,true);assert.equal((await call(A,'_live','publish',pos)).accepted,false);assert.equal((await call(B,'_live','snapshot',{sessionId:S})).positions.length,1);assert.equal((await call(A,'_live','snapshot',{sessionId:S})).positions.length,0);await deny(call(C,'_live','snapshot',{sessionId:S}),'GROUP_UNAVAILABLE');});
 await check('entitlement revocation immediately stops publish while revoke remains allowed',async()=>{await c.query('update user_entitlements set revoked_at=clock_timestamp() where user_id=$1',[A]);assert.equal((await as(A,'select track_sharing_access_v1() x')).canInitiate,false);await deny(call(A,'_live','publish',await point(2)),'TRACKING_ACTIVE_REQUIRED');await call(A,'_live','revoke',{sessionId:S,shareId:SH});assert.equal((await call(B,'_live','snapshot',{sessionId:S})).positions.length,0);});
 await check('revoked share cannot be resurrected after entitlement restoration',async()=>{await c.query('update user_entitlements set revoked_at=null where user_id=$1',[A]);await deny(call(A,'_live','start',start),'GROUP_REVOKED');});
 const SH2=fresh();await call(A,'_live','start',{...start,shareId:SH2});
 const point2={...await point(),shareId:SH2};await call(A,'_live','publish',point2);
 await check('recipient leave invalidates share and old position without relying on app',async()=>{await call(B,'_session','leave',{sessionId:S,participationId:P});await deny(call(B,'_live','snapshot',{sessionId:S}),'GROUP_UNAVAILABLE');await deny(call(A,'_live','publish',{...point2,sequence:2}),'GROUP_REVOKED');});
 await call(B,'_session','join',{sessionId:S,participationId:fresh(),dogId:BD});
 await check('recipient rejoin cannot revive old consent epoch',async()=>{assert.equal((await call(B,'_live','snapshot',{sessionId:S})).positions.length,0);await deny(call(A,'_live','start',{...start,shareId:SH2}),'GROUP_REVOKED');});
 const SH3=fresh();await call(A,'_live','start',{...start,shareId:SH3});const point3={...await point(),shareId:SH3};await call(A,'_live','publish',point3);
 await check('stale coordinate hidden before cleanup; scheduled worker removes payload and keeps replay watermark',async()=>{await c.query("update training_live_last_positions set observed_at=clock_timestamp()-interval '11 seconds',purge_after=clock_timestamp()-interval '1 second' where share_id=$1",[SH3]);assert.equal((await call(B,'_live','snapshot',{sessionId:S})).positions.length,0);assert.equal((await c.query('select training_live_maintenance(1000) x')).rows[0].x.deleted,1);assert.equal((await c.query('select last_sequence from training_live_grants where id=$1',[SH3])).rows[0].last_sequence,1);assert.equal((await call(A,'_live','publish',point3)).accepted,false);});
 await check('expired share never returns positions or accepts publish',async()=>{await c.query("update training_live_grants set started_at=clock_timestamp()-interval '61 seconds',expires_at=clock_timestamp()-interval '1 second' where id=$1",[SH3]);assert.equal((await call(B,'_live','snapshot',{sessionId:S})).positions.length,0);await deny(call(A,'_live','publish',{...point3,sequence:2}),'GROUP_EXPIRED');});
 await check('unhealthy maintenance blocks start and publish but not revoke',async()=>{await c.query("update training_live_maintenance_state set last_success_at=clock_timestamp()-interval '181 seconds'");await deny(call(A,'_live','start',{...start,shareId:fresh()}),'GROUP_MAINTENANCE_UNAVAILABLE');await deny(call(A,'_live','publish',point3),'GROUP_MAINTENANCE_UNAVAILABLE');assert.equal((await call(A,'_live','revoke',{sessionId:S,shareId:SH3})).revoked,true);await c.query('select training_live_maintenance(1000)');});
 await check('rerun fails closed on source drift',async()=>{await assert.rejects(c.query(candidate),/drift/);await c.query('rollback');});
 const plan=JSON.parse(fs.readFileSync(path.join(__dirname,'06-qa-plan.json'),'utf8')),Q=plan.ids,QA=plan.accounts.A.id,QB=plan.accounts.B.id,QC=plan.accounts.C.id;
 await c.query('revoke execute on function training_group_live_v1(text,jsonb) from authenticated');
 for(const u of [QA,QB,QC])await c.query('insert into auth.users(id,email_confirmed_at) values($1,now())',[u]);
 for(const [u,d] of [[QA,Q.dogA],[QB,plan.accounts.B.dogId]])await c.query("insert into dogs(id,owner_id,name,track_overlay_color_key) values($1,$2,'SYNTHETIC QA','orange')",[d,u]);
 await c.query("insert into user_entitlements(user_id,entitlement) values($1,'active_lifetime')",[QA]);
 await c.query("insert into connections values($1,$2,$3,'accepted')",[Q.connection,QA,QB]);
 const qaCandidate=fs.readFileSync(path.join(__dirname,'07-bounded-qa-candidate.sql'),'utf8');
 for(const [label,fault] of [
 ['group body privileges changed',"alter function training_group_v1(text,jsonb) security invoker"],
 ['access RPC exposed to anon',"grant execute on function track_sharing_access_v1() to anon"],
 ['private authority helper exposed',"grant execute on function tracking_private_active_initiator() to authenticated"],
 ['authority RLS disabled',"alter table subscription_authority disable row level security"],
 ['position table SELECT exposed',"grant select on training_live_last_positions to authenticated"],
 ['group client grant removed',"revoke execute on function training_group_v1(text,jsonb) from authenticated"],
 ['live RPC exposed to anon',"grant execute on function training_group_live_v1(text,jsonb) to anon"]]){
  await check('QA installer rejects '+label,async()=>{await c.query('begin');await c.query(fault);await assert.rejects(c.query(qaCandidate),/STOP/);await c.query('rollback');assert.equal((await c.query("select to_regclass('public.training_live_qa_window_20261021') x")).rows[0].x,null);});
 }
 await check('exact QA gateway installs without general activation or private-table exposure',async()=>{await c.query(fs.readFileSync(path.join(__dirname,'07-bounded-qa-candidate.sql'),'utf8'));assert.equal((await c.query("select has_function_privilege('authenticated','training_group_live_v1(text,jsonb)','EXECUTE') x")).rows[0].x,false);await assert.rejects(as(QA,'select * from training_live_qa_window_20261021'),e=>e.code==='42501');});
 const qa=(u,api,action,request)=>as(u,'select training_live_qa_20261021($1,$2,$3) x',[api,action,request]);
 await check('QA gateway rejects unnamed actors and unrelated group/session/share IDs',async()=>{await deny(qa(A,'group','get',{groupId:Q.group}),'QA_ACCESS_DENIED');await deny(qa(QA,'group','get',{groupId:fresh()}),'QA_SCOPE_DENIED');await deny(qa(QA,'session','get',{sessionId:fresh()}),'QA_SCOPE_DENIED');await deny(qa(QA,'live','revoke',{sessionId:Q.session,shareId:fresh()}),'QA_SCOPE_DENIED');});
 await qa(QA,'group','create',{groupId:Q.group,title:'SYNTHETIC QA',displayName:'A'});
 await qa(QA,'group','invite',{groupId:Q.group,invitationId:Q.invitation,recipientUserId:QB,ttlSeconds:900});
 await qa(QB,'group','accept',{invitationId:Q.invitation,displayName:'B'});
 await qa(QA,'session','open',{groupId:Q.group,sessionId:Q.session,title:'SYNTHETIC QA',ttlSeconds:900,dogId:Q.dogA});
 await qa(QB,'session','join',{sessionId:Q.session,participationId:Q.participationB,dogId:plan.accounts.B.dogId});
 const qstart={sessionId:Q.session,shareId:Q.shareRevoke,dogId:Q.dogA,recipientUserIds:[QB],ttlSeconds:60};
 await check('QA gateway retains ordinary ACTIVE enforcement and outsider privacy',async()=>{await deny(qa(QB,'live','start',qstart),'TRACKING_ACTIVE_REQUIRED');await deny(qa(QC,'live','snapshot',{sessionId:Q.session}),'GROUP_UNAVAILABLE');});
 await qa(QA,'live','start',qstart);
 await check('QA gateway limits publish to synthetic zero coordinates',async()=>{const point={sessionId:Q.session,shareId:Q.shareRevoke,sequence:1,latitude:0,longitude:0,accuracyM:3,observedAtServerMs:(await c.query('select training_private_ms(clock_timestamp()) x')).rows[0].x};await deny(qa(QA,'live','publish',{...point,latitude:1}),'QA_SCOPE_DENIED');await qa(QA,'live','publish',point);assert.equal((await qa(QB,'live','snapshot',{sessionId:Q.session})).positions.length,1);});
 await check('QA window expires without a client change and closure retains evidence',async()=>{await c.query("update training_live_qa_window_20261021 set expires_at=clock_timestamp()-interval '1 second'");await deny(qa(QA,'live','snapshot',{sessionId:Q.session}),'QA_ACCESS_DENIED');await c.query(fs.readFileSync(path.join(__dirname,'08-close-qa-candidate.sql'),'utf8'));assert.equal((await c.query('select count(*)::int n from training_live_qa_window_20261021')).rows[0].n,1);await assert.rejects(qa(QA,'live','snapshot',{sessionId:Q.session}),e=>e.code==='42501');});
 const activation=fs.readFileSync(path.join(__dirname,'04-activation-candidate.sql'),'utf8');
 for(const [label,fault] of [
 ['authority RLS disabled',"alter table subscription_authority disable row level security"],
 ['private helper exposed',"grant execute on function tracking_private_active_initiator() to authenticated"],
 ['access RPC exposed',"grant execute on function track_sharing_access_v1() to anon"],
 ['position table direct read',"grant select on training_live_last_positions to authenticated"],
 ['QA window reopened',"update training_live_qa_window_20261021 set expires_at=clock_timestamp()+interval '1 minute'"]]){
  await check('general activation rejects '+label,async()=>{await c.query('begin');await c.query(fault);await assert.rejects(c.query(activation),/STOP/);await c.query('rollback');assert.equal((await c.query("select has_function_privilege('authenticated','training_group_live_v1(text,jsonb)','EXECUTE') x")).rows[0].x,false);});
 }
 const result={status:'PASS_LOCAL_LIVE_SHARE_INTEGRATION_NOT_HTTP',checkedAt:new Date().toISOString(),candidateSha256:crypto.createHash('sha256').update(candidate).digest('hex'),passed:checks.length,checks,limitations:['Synthetic PostgreSQL roles/auth.uid, not real JWT or PostgREST','Maintenance invoked locally, not pg_cron or external alarm delivery','Paid provider expiry events not generated; protected authority SQL reused','No production mutations, account writes, new rights or client release']};
 fs.writeFileSync(path.join(__dirname,'03-integration-result.json'),JSON.stringify(result,null,2)+'\n');
 }finally{await db.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
