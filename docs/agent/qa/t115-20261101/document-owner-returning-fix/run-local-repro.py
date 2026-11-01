from pathlib import Path
import subprocess,time,json,hashlib,datetime,uuid
BASE=Path(__file__).resolve().parent
name='anyvo-t115-doc-rls-01-'+uuid.uuid4().hex[:8]
results={}
def docker(*args,**kwargs):return subprocess.run(['docker',*args],capture_output=True,text=True,**kwargs)
def sql(text,actor=None,role='authenticated'):
 prefix=''if actor is None else f"set role {role}; set request.jwt.claim.sub='{actor}';\n"
 return docker('exec','-i',name,'psql','-U','postgres','-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate',input=prefix+text)
def check(label,text,actor=None,denied=False,expected=None,role='authenticated'):
 r=sql(text,actor,role)
 if denied:
  ok=r.returncode!=0 and '42501' in r.stderr
 else:ok=r.returncode==0 and (expected is None or r.stdout.strip()==expected)
 results[label]={'pass':ok,'returncode':r.returncode,'output':r.stdout.strip(),'sqlstate42501':'42501'in r.stderr}
 assert ok,label+' '+r.stderr
A='00000000-0000-0000-0000-000000000001';B='00000000-0000-0000-0000-000000000002';C='00000000-0000-0000-0000-000000000003';D='10000000-0000-0000-0000-000000000001';E='10000000-0000-0000-0000-000000000002'
insert=lambda i,owner=A,dog=D,ret=True:f"insert into public.dog_documents(id,owner_id,dog_id,kind,category,subtype) values('{i}','{owner}','{dog}','gesundheit','health','other')"+(' returning id;'if ret else';')
try:
 r=docker('run','--rm','-d','--network','none','--name',name,'-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine');assert r.returncode==0,'LOCAL_CONTAINER_START_FAILED'
 for _ in range(40):
  if docker('exec',name,'sh','-c','test "$(cat /proc/1/comm)" = postgres && pg_isready -U postgres').returncode==0:break
  time.sleep(.25)
 else:raise RuntimeError('LOCAL_DATABASE_NOT_READY')
 check('setup', (BASE/'setup.sql').read_text())
 signatures={'health_dog_owner_matches':'uuid,uuid','health_grant_connection_valid':'uuid,uuid,uuid','can_view_dog_health':'uuid,text','can_view_legacy_dog_document':'uuid','can_view_dog_document':'uuid'}
 check('function_execution_scopes','\n'.join(f'revoke all on function public.{f}({sig}) from public; grant execute on function public.{f}({sig}) to authenticated;'for f,sig in signatures.items()))
 r=sql("select has_function_privilege('public','public.can_view_dog_document(uuid)','execute');")
 results['public_pseudorole_inquiry']={'returncode':r.returncode,'sqlstate':r.stderr.strip(),'output':r.stdout.strip()}
 check('existing_policy_owner_insert_returning_reproduces_42501',insert('20000000-0000-0000-0000-000000000001'),A,denied=True)
 check('same_owner_insert_without_returning_succeeds',insert('20000000-0000-0000-0000-000000000002',ret=False),A)
 check('stored_row_visible_after_separate_statement',"select count(*) from dog_documents;",A,expected='1')
 # Seed only synthetic local documents and a scoped read grant. No production data.
 seed=f"insert into dogs values('{E}','{B}');insert into connections values('30000000-0000-0000-0000-000000000001','{A}','{B}','accepted');"
 docs=[('20000000-0000-0000-0000-000000000010',A,D,'gesundheit','health','lab'),('20000000-0000-0000-0000-000000000011',A,D,'tierarzt','health','vet_report'),('20000000-0000-0000-0000-000000000012',A,D,'stammbaum','breeding','pedigree'),('20000000-0000-0000-0000-000000000013',B,E,'gesundheit','health','other'),('20000000-0000-0000-0000-000000000014',A,E,'gesundheit','health','other')]
 for i,owner,dog,kind,cat,sub in docs:seed+=f"insert into dog_documents(id,owner_id,dog_id,kind,category,subtype)values('{i}','{owner}','{dog}','{kind}','{cat}','{sub}');"
 seed+=f"insert into dog_health_access_grants(id,dog_id,owner_id,connection_id,grantee_user_id,starts_at,expires_at,can_view_health_documents)values('40000000-0000-0000-0000-000000000001','{D}','{A}','30000000-0000-0000-0000-000000000001','{B}',now()-interval '1 minute',now()+interval '5 minutes',true);"
 check('seed_local_read_scopes',seed)
 visibility="select coalesce(string_agg(id::text,','order by id),'') from dog_documents;"
 before={a:sql(visibility,a).stdout.strip()for a in [A,B,C]}
 migration=(BASE/'20261101210000_dog_documents_owner_returning_select.sql').read_text()
 def guard_reject(label, prefix='', candidate=None):
  r=sql('begin;'+prefix+(candidate or migration))
  ok=r.returncode!=0 and 'P0001' in r.stderr
  results[label]={'pass':ok,'returncode':r.returncode,'guardRejected':True,'safeError':r.stderr.strip()}
  assert ok,label+' '+r.stderr
  baseline=sql("select pg_get_expr(polqual,polrelid)from pg_policy where polrelid='public.dog_documents'::regclass and polname='dog_documents_select';")
  assert baseline.returncode==0 and baseline.stdout.strip()=='can_view_dog_document(id)',label+' failed rollback'
 guard_reject('reject_baseline_select_predicate_drift', 'alter policy dog_documents_select on dog_documents using(true);')
 guard_reject('reject_select_roles_drift', 'alter policy dog_documents_select on dog_documents to authenticated;')
 guard_reject('reject_unexpected_select_policy', 'create policy unexpected_select on dog_documents for select using(true);')
 guard_reject('reject_unexpected_all_policy', 'create policy unexpected_all on dog_documents for all using(true) with check(true);')
 guard_reject('reject_insert_policy_drift', 'alter policy dog_documents_insert on dog_documents with check(true);')
 guard_reject('reject_disabled_rls', 'alter table dog_documents disable row level security;')
 guard_reject('reject_forced_rls_drift', 'alter table dog_documents force row level security;')
 guard_reject('reject_function_volatility_drift', 'alter function public.can_view_dog_document(uuid) volatile;')
 guard_reject('reject_helper_security_invoker_drift', 'alter function public.can_view_dog_document(uuid) security invoker;')
 guard_reject('reject_helper_body_drift', "create or replace function public.can_view_dog_document(p_document_id uuid)returns boolean language sql security definer stable set search_path=pg_catalog,public as $$select false$$;")
 guard_reject('reject_public_helper_execute_drift', 'grant execute on function public.can_view_dog_document(uuid) to public;')
 guard_reject('reject_custom_role_owner_helper_execute_drift', 'create role qa_extra;grant execute on function public.health_dog_owner_matches(uuid,uuid) to qa_extra;')
 guard_reject('reject_authenticated_insert_privilege_loss', 'revoke insert on dog_documents from authenticated;')
 guard_reject('reject_unexpected_document_trigger', "create function public.qa_trigger()returns trigger language plpgsql as $$begin return new;end$$;create trigger qa_custom before insert on dog_documents for each row execute function public.qa_trigger();")
 guard_reject('postcondition_failure_rolls_back_policy',candidate=migration.replace("desired text := '(((owner_id", "desired text := 'wrong(((owner_id"))
 before_count=sql('select count(*)from dog_documents;').stdout.strip()
 check('exact_guarded_owner_fast_path_migration', migration)
 after_count=sql('select count(*)from dog_documents;').stdout.strip()
 results['migration_preserves_all_local_stored_rows']={'pass':before_count==after_count,'before':before_count,'after':after_count};assert before_count==after_count
 r=sql(migration);results['no_unreviewed_replay']={'pass':r.returncode!=0 and 'P0001'in r.stderr};assert results['no_unreviewed_replay']['pass']
 after={a:sql(visibility,a).stdout.strip()for a in [A,B,C]}
 results['all_seeded_owner_recipient_outsider_visibility_unchanged']={'pass':before==after,'actors':3,'seededRows':6};assert before==after
 check('owner_insert_returning_succeeds_after_policy_fix',insert('20000000-0000-0000-0000-000000000020'),A,expected='20000000-0000-0000-0000-000000000020')
 check('recipient_cannot_insert_owner_row',insert('20000000-0000-0000-0000-000000000021'),B,denied=True)
 check('recipient_cannot_insert_own_row_for_other_owners_dog',insert('20000000-0000-0000-0000-000000000022',B,D),B,denied=True)
 check('recipient_can_insert_only_own_dog_document',insert('20000000-0000-0000-0000-000000000023',B,E),B,expected='20000000-0000-0000-0000-000000000023')
 check('outsider_cannot_insert_owner_row',insert('20000000-0000-0000-0000-000000000024'),C,denied=True)
 check('anonymous_cannot_insert',insert('20000000-0000-0000-0000-000000000025'),C,denied=True,role='anon')
 check('anonymous_cannot_select','select count(*) from dog_documents;',C,denied=True,role='anon')
 check('recipient_cannot_update_owner_document',"with x as(update dog_documents set title='forbidden'where id='20000000-0000-0000-0000-000000000020'returning id)select count(*)from x;",B,expected='0')
 check('recipient_cannot_delete_owner_document',"with x as(delete from dog_documents where id='20000000-0000-0000-0000-000000000020'returning id)select count(*)from x;",B,expected='0')
 check('scoped_recipient_reads_only_general_health_document',"select count(*) from dog_documents where id='20000000-0000-0000-0000-000000000020';",B,expected='1')
 check('scoped_recipient_cannot_read_lab_or_vet_report',"select count(*)from dog_documents where id in('20000000-0000-0000-0000-000000000010','20000000-0000-0000-0000-000000000011');",B,expected='0')
 check('legacy_nonhealth_connection_read_retained',"select count(*)from dog_documents where id='20000000-0000-0000-0000-000000000012';",B,expected='1')
 check('revoke_only_local_synthetic_grant',"update dog_health_access_grants set revoked_at=now()where id='40000000-0000-0000-0000-000000000001';")
 check('revoked_recipient_cannot_read_health_document',"select count(*)from dog_documents where id='20000000-0000-0000-0000-000000000020';",B,expected='0')
 check('legacy_nonhealth_read_retained_after_health_revocation',"select count(*)from dog_documents where id='20000000-0000-0000-0000-000000000012';",B,expected='1')
 out={'status':'PASS_LOCAL_POSTGRES17_OWNER_RETURNING_RLS_REPRO_AND_SCOPED_POLICY_REGRESSIONS','checkedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'productionActions':False,'productionCauseStillNeedsLiveCatalogMatch':True,'databaseImage':'postgres:17-alpine','network':'none','publishedPorts':False,'hostVolumes':False,'realCustomerData':False,'results':results,'setupSHA256':hashlib.sha256((BASE/'setup.sql').read_bytes()).hexdigest()}
 result_path=BASE/('LOCAL-POSTGRES-REPRO-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.json');result_path.write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({'status':out['status'],'checks':len(results),'resultFile':str(result_path),'publicRoleInquiry':results['public_pseudorole_inquiry']}))
finally:
 docker('rm','-f',name)
