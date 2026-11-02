"""Offline-only launcher gate/credential-count/cleanup tests; no real network."""
import datetime as dt
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

s=runpy.run_path(str(Path(__file__).with_name('t115-final-qa-full5-05.py')))
ns=s['complete'].__globals__
CLOCK=dt.datetime(2026,11,2,14,0,tzinfo=dt.timezone.utc)

def receipts(folder):
    install={'code':'PASS_T115_STAGE_B_METADATA_POSTFLIGHT','project_ref':s['PROJECT'],
      'migration_sha256':s['MIGRATION_SHA256'],'read_policy_name':'dog_health_entries_select',
      'read_policy_roles':['authenticated'],
      'read_policy_predicate':'((owner_id = auth.uid()) AND health_dog_owner_matches(dog_id, owner_id))',
      'select_all_policy_count':1,'rls_enabled':True,'owner_dog_mismatch_count':0,
      'write_policies_md5':'e9298bd962428f4c583cf211032ae210','table_acl_unchanged':True,
      'triggers_and_foreign_keys_unchanged':True,'weight_rpc_body_md5':'cd8bd0c10610a5878a8e6b829fc16ff9',
      'owner_match_helper_body_md5':'608febdba1b74dc18708cd45fae80ec8',
      'weight_rpc_auth_execute':True,'weight_rpc_anon_execute':False,'weight_rpc_public_execute':False,
      'health_rows_before':26,'health_rows_after':26,'checked_at_utc':'2026-11-02T13:59:00Z'}
    storage={'project_ref':s['PROJECT'],'bucket_id':'dog-documents',
      'path':s['OWNER']+'/b4991851-e569-51fc-a0af-4e0172f2bc63/t115-health-88ff7ee8-ecd4-414f-bbe5-2847e60a9770.png',
      'exact_object_count':0,'status':'READ_ONLY_ABSENT_AT_CHECK_TIME_NOT_EXECUTION_APPROVAL',
      'checked_at_utc':'2026-11-02T13:59:00Z'}
    a,b=Path(folder)/'install.json',Path(folder)/'storage.json'
    a.write_text(json.dumps(install));b.write_text(json.dumps(storage))
    doc={'status':'PASS_DOCUMENT_OWNER_SELECT_METADATA_POSTFLIGHT_NOT_FUNCTIONAL_QA',
      'project_ref':s['PROJECT'],'migration_sha256':'f0d1ee015746c17201e80ae86c8ee6b053cad75e8e44d3fc4341d95d9f9c5d45',
      'select_policy_name':'dog_documents_select',
      'select_policy_qual':'(((owner_id = auth.uid()) AND health_dog_owner_matches(dog_id, owner_id)) OR can_view_dog_document(id))',
      'select_policy_roles':['public'],'select_all_policy_count':1,'rls_enabled':True,'rls_forced':False,
      'table_acl_unchanged':True,'other_policies_unchanged':True,'helpers_unchanged':True,
      'document_view_helper_body_md5':'caf0b0f5a099bd5ef356f36333b37f7b',
      'owner_match_helper_body_md5':'608febdba1b74dc18708cd45fae80ec8','checked_at_utc':'2026-11-02T13:59:00Z'}
    p=Path(folder)/'document-policy.json';p.write_text(json.dumps(doc));ns['DOC_POLICY_RECEIPT']=p
    ns['HISTORICAL_INSTALL_SHA256']=hashlib.sha256(a.read_bytes()).hexdigest()
    # Entirely synthetic metadata; no attachment, production receipt or live data.
    row={'checked_at_utc':'2026-11-02 13:59:00','database_name':'postgres',
         'all_document_policies':'[{"synthetic_owner_policy":true}]'}
    row.update({'exact_owner_dog_count': '1', 'recipient_owns_exact_dog_count': '0', 'exact_accepted_connection_count': '1', 'prior_qa_grants_active_count': '0', 'exact_scope_active_grants_count': '0', 'dog_health_vaccinations_new_id_collision_count': '0', 'dog_deworming_entries_new_id_collision_count': '0', 'dog_health_medications_new_id_collision_count': '0', 'dog_health_conditions_new_id_collision_count': '0', 'dog_vet_appointments_new_id_collision_count': '0', 'dog_documents_new_id_collision_count': '0', 'stage_b_row_new_id_collision_count': '0', 'new_grant_id_collision_count': '0', 'prior_qa_fixture_or_file_remaining_count': '0', 'prior_full2_fixture_or_file_remaining_count': '0', 'prior_full3_fixture_or_file_remaining_count': '0', 'prior_full4_fixture_or_file_remaining_count': '0'})
    fields=list(row)
    normalized={k:json.loads(v) if k=='all_document_policies' else v for k,v in row.items() if k!='checked_at_utc' and k not in ('exact_owner_dog_count', 'recipient_owns_exact_dog_count', 'exact_accepted_connection_count', 'prior_qa_grants_active_count', 'exact_scope_active_grants_count', 'dog_health_vaccinations_new_id_collision_count', 'dog_deworming_entries_new_id_collision_count', 'dog_health_medications_new_id_collision_count', 'dog_health_conditions_new_id_collision_count', 'dog_vet_appointments_new_id_collision_count', 'dog_documents_new_id_collision_count', 'stage_b_row_new_id_collision_count', 'new_grant_id_collision_count', 'prior_qa_fixture_or_file_remaining_count', 'prior_full2_fixture_or_file_remaining_count', 'prior_full3_fixture_or_file_remaining_count', 'prior_full4_fixture_or_file_remaining_count')}
    ns['REVIEWED_LIVE_METADATA_SHA256']=hashlib.sha256(json.dumps(normalized,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    csvpath=Path(folder)/'live.csv'
    with csvpath.open('w') as handle:
        writer=csv.DictWriter(handle,fieldnames=fields);writer.writeheader();writer.writerow(row)
    live={'status':'PASS_T115_FRESH_READONLY_METADATA_AND_STORAGE_SNAPSHOT',
          'project_ref':s['PROJECT'],'project_ref_provenance':'USER_CONFIRMED_ANYVO_PRODUCTION_SQL_EDITOR_NOT_CSV_FIELD',
          'sql_sha256':'16d87caac927ebbfc86a0599927441b73483686884e862c33ea3897220182c5f','plan_sha256':'7d8696aa6c44e91fcd94708cf9c0640b9ecfcb4b05e73e35b55e1d4f0fe3f94c','fixture_sha256':'6b30a1ee100cadae0e6b7c607a3544f26b0adf2f721cf57d9fa1ae9af0a96c1a',
          'source_csv_path':str(csvpath),'source_csv_sha256':hashlib.sha256(csvpath.read_bytes()).hexdigest(),
          'checked_at_utc':row['checked_at_utc']}
    livepath=Path(folder)/'live-review.json';livepath.write_text(json.dumps(live));ns['LIVE_SNAPSHOT_RECEIPT']=livepath
    return a,b

class LauncherSafety(unittest.TestCase):
    def test_inert_without_explicit_approval(self):
        p=subprocess.run([sys.executable,s['__file__']],capture_output=True,text=True)
        self.assertEqual(p.returncode,2)
        self.assertEqual(p.stderr.strip(),'STOP_EXPLICIT_APPROVAL_AND_FRESH_RECEIPTS_REQUIRED')

    def test_private_exclusive_attempt_prevents_second_launch(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'attempt.json';s['acquire_once'](p);before=p.read_bytes()
            self.assertEqual(p.stat().st_mode & 0o777,0o600)
            with self.assertRaisesRegex(s['Stop'],'PREVIOUS_ATTEMPT_EXISTS_REVIEW_REQUIRED'):
                s['acquire_once'](p)
            self.assertEqual(p.read_bytes(),before)

    def test_manifest_drift_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'manifest.json';p.write_text('{}')
            with patch.dict(ns,{'MANIFEST':p}):
                with self.assertRaisesRegex(s['Stop'],'QA_MANIFEST_DRIFT'):s['verify_sources']()

    def test_current_manifest_binds_all_ten_sources(self):
        d=s['verify_sources']();self.assertEqual(len(d['sources']),13)

    def test_policy_metadata_must_be_exact(self):
        with tempfile.TemporaryDirectory() as folder,patch.dict(ns,{'now':lambda:CLOCK}):
            a,b=receipts(folder);s['validate_receipts'](a,b)
            data=json.loads(a.read_text());data['read_policy_roles']=['public'];a.write_text(json.dumps(data))
            with self.assertRaisesRegex(s['Stop'],'STAGE_B_INSTALLED_METADATA_POSTFLIGHT_REQUIRED'):
                s['validate_receipts'](a,b)

    def test_storage_collision_and_staleness_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder,patch.dict(ns,{'now':lambda:CLOCK}):
            a,b=receipts(folder);data=json.loads(b.read_text());data['exact_object_count']=1;b.write_text(json.dumps(data))
            with self.assertRaisesRegex(s['Stop'],'FRESH_EXACT_STORAGE_ABSENCE_REQUIRED'):s['validate_receipts'](a,b)
            a,b=receipts(folder);data=json.loads(b.read_text());data['checked_at_utc']='2026-11-02T13:40:00Z';b.write_text(json.dumps(data))
            with self.assertRaisesRegex(s['Stop'],'FRESH_READONLY_RECEIPT_REQUIRED'):s['validate_receipts'](a,b)

    def test_boolean_is_not_an_aggregate_count(self):
        with tempfile.TemporaryDirectory() as folder,patch.dict(ns,{'now':lambda:CLOCK}):
            a,b=receipts(folder);data=json.loads(b.read_text());data['exact_object_count']=False;b.write_text(json.dumps(data))
            with self.assertRaises(s['Stop']):s['validate_receipts'](a,b)
            a,b=receipts(folder);data=json.loads(a.read_text());data['select_all_policy_count']=True;a.write_text(json.dumps(data))
            with self.assertRaises(s['Stop']):s['validate_receipts'](a,b)

    def exercise(self,fail_stage=False,uncertain_cleanup=False,expire_total=False,expire_during_login=False):
        with tempfile.TemporaryDirectory() as folder:
            base=Path(folder);a,b=receipts(folder);calls={'login':[],'stage':0,'sections':0}
            def login(key,label,email,uid):
                calls['login'].append(label)
                if expire_during_login and label == 'B': mono[0] = 901.0
                return 'FAKE_TOKEN_'+label
            mono=[0.0]
            def stage_run(key,tokens,deadline=None):
                self.assertEqual(deadline,900.0);self.shared_deadline=deadline
                if expire_total:mono[0]=901.0
                calls['stage']+=1
                self.assertEqual(tokens,{'A':'FAKE_TOKEN_A','B':'FAKE_TOKEN_B'})
                if fail_stage:raise s['Stop']('STAGE_B_FUNCTIONAL_PASS_REQUIRED')
                return 'PASS_T115_STAGE_B_NORMAL_JWT_OWNER_RECIPIENT_ISOLATION'
            def stage_write(code):
                p=base/'stage.json';p.write_text(json.dumps({'code':code}));return p
            def sections_run(stage_path,storage_path,key,tokens,deadline=None):
                self.assertEqual(deadline,self.shared_deadline)
                calls['sections']+=1;self.assertEqual(storage_path,b)
                self.assertEqual(tokens,{'A':'FAKE_TOKEN_A','B':'FAKE_TOKEN_B'})
                return 'PASS_T115_SECTIONS_NORMAL_JWT_AND_STORAGE'
            def sections_write(code):
                cleanup={'grant':'revoked_or_absent','storage':'deleted_or_absent','rows':'deleted_or_absent','probes':'absent_or_deleted'}
                if uncertain_cleanup:cleanup['storage']='uncertain'
                p=base/'sections.json';p.write_text(json.dumps({'code':code,'phase':'complete','cleanup':cleanup}));return p
            stage={'core':{'USERS':[('A','synthetic-a',s['OWNER']),('B','synthetic-b',s['RECIPIENT'])]},
                   'qa':{'login':login},'run':stage_run,'write_safe_result':stage_write}
            sections={'run':sections_run,'safe_result':sections_write}
            original_acquire=s['acquire_once']
            bindings={'now':lambda:CLOCK,'BASE':base,'verify_sources':lambda:None,
                      'acquire_once':lambda:original_acquire(base/'attempt.json'),'public_key':lambda:'FAKE_PUBLIC_KEY','require_fresh_qa_approval':lambda:None,'time':type('Clock',(),{'monotonic':staticmethod(lambda:mono[0])})}
            with patch.dict(ns,bindings),patch.object(s['runpy'],'run_path',side_effect=lambda path:stage if Path(path)==s['STAGE_B'] else sections):
                code,result=s['complete'](a,b)
            record=json.loads(result.read_text());self.assertEqual(result.stat().st_mode & 0o777,0o600)
            self.assertNotIn('FAKE_TOKEN',result.read_text());self.assertNotIn('FAKE_PUBLIC_KEY',result.read_text())
            return calls,code,record

    def test_one_login_pair_runs_both_phases(self):
        calls,code,record=self.exercise()
        self.assertEqual(calls,{'login':['A','B'],'stage':1,'sections':1})
        self.assertEqual(code,'PASS_T115_COMPLETE_NORMAL_JWT_BACKEND_QA')
        self.assertEqual(record['phase'],'complete')

    def test_stage_failure_blocks_sections(self):
        calls,code,record=self.exercise(fail_stage=True)
        self.assertEqual(calls['sections'],0);self.assertEqual(code,'STOP_STAGE_B_FUNCTIONAL_PASS_REQUIRED')

    def test_uncertain_cleanup_never_becomes_full_pass(self):
        calls,code,record=self.exercise(uncertain_cleanup=True)
        self.assertEqual(code,'STOP_FULL_SECTIONS_PASS_AND_CLEANUP_REQUIRED')

    def test_error_codes_do_not_print_response_or_credentials(self):
        self.assertEqual(s['safe_code'](Exception('FAKE_SECRET_RESPONSE')),'STOP_UNEXPECTED_LOCAL_QA_ERROR')
        self.assertEqual(s['safe_code'](KeyboardInterrupt()),'STOP_LOCAL_INPUT_CANCELLED')
        self.assertEqual(s['safe_code'](s['Stop']('CLEANUP_UNCERTAIN_storage')),'STOP_CLEANUP_UNCERTAIN_STORAGE')

if __name__=='__main__':unittest.main()

class PostPolicyGates(unittest.TestCase):
 def test_missing_or_wrong_exact_fresh_approval_is_blocked(self):
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp)/'approval.json'
   with patch.dict(ns,{'FRESH_QA_APPROVAL':p}):
    with self.assertRaises(FileNotFoundError):s['require_fresh_qa_approval']()
    p.write_text(json.dumps({'status':'DIRECT_HUMAN_EXACT_FRESH_POST_POLICY_QA_APPROVED','scope_sha256':'wrong','manifest_sha256':s['MANIFEST_SHA256']}))
    with self.assertRaises(s['Stop']):s['require_fresh_qa_approval']()
 def test_document_policy_drift_closes_before_qa(self):
  with tempfile.TemporaryDirectory()as tmp,patch.dict(ns,{'now':lambda:CLOCK}):
   a,b=receipts(tmp);rp=ns['LIVE_SNAPSHOT_RECEIPT'];r=json.loads(rp.read_text());cp=Path(r['source_csv_path'])
   with cp.open() as handle:reader=csv.DictReader(handle);fields=reader.fieldnames;row=next(reader)
   row['all_document_policies']='[]'
   with cp.open('w') as handle:writer=csv.DictWriter(handle,fieldnames=fields);writer.writeheader();writer.writerow(row)
   r['source_csv_sha256']=hashlib.sha256(cp.read_bytes()).hexdigest();rp.write_text(json.dumps(r))
   with self.assertRaisesRegex(s['Stop'],'STAGE_B_INSTALLED_METADATA_POSTFLIGHT_REQUIRED'):s['validate_receipts'](a,b)
 def test_uppercase_exception_payload_is_never_a_diagnostic_code(self):
  self.assertEqual(s['safe_code'](RuntimeError('PRIVATE_INPUT')),'STOP_UNEXPECTED_LOCAL_QA_ERROR')
  self.assertEqual(s['safe_code'](s['Stop']('PRIVATE_INPUT')),'STOP_UNEXPECTED_LOCAL_QA_ERROR')

class LauncherHashApprovalBinding(unittest.TestCase):
 def test_approval_requires_exact_independently_recorded_launcher_hash(self):
  import hashlib
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp)/'approval.json';a={'status':'DIRECT_HUMAN_EXACT_FRESH_POST_POLICY_QA_APPROVED','scope_sha256':globals()['s']['FRESH_SCOPE_SHA256'],'manifest_sha256':globals()['s']['MANIFEST_SHA256'],'launcher_sha256':hashlib.sha256(Path(globals()['s']['__file__']).read_bytes()).hexdigest()};p.write_text(json.dumps(a))
   with patch.dict(ns,{'FRESH_QA_APPROVAL':p}):
    globals()['s']['require_fresh_qa_approval']()
    a['launcher_sha256']='0'*64;p.write_text(json.dumps(a))
    with self.assertRaises(globals()['s']['Stop']):globals()['s']['require_fresh_qa_approval']()
 def test_changed_launcher_bytes_do_not_match_frozen_approval(self):
  import hashlib
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp)/'approval.json';a={'status':'DIRECT_HUMAN_EXACT_FRESH_POST_POLICY_QA_APPROVED','scope_sha256':globals()['s']['FRESH_SCOPE_SHA256'],'manifest_sha256':globals()['s']['MANIFEST_SHA256'],'launcher_sha256':hashlib.sha256(Path(globals()['s']['__file__']).read_bytes()).hexdigest()};p.write_text(json.dumps(a));changed=Path(tmp)/'changed.py';changed.write_text('changed-source')
   with patch.dict(ns,{'FRESH_QA_APPROVAL':p,'__file__':str(changed)}):
    with self.assertRaises(globals()['s']['Stop']):globals()['s']['require_fresh_qa_approval']()

class Overall15MinuteGuard(unittest.TestCase):
 exercise=LauncherSafety.exercise
 def test_total_expiry_after_stage_b_blocks_sections(self):
  calls,code,record=self.exercise(expire_total=True)
  self.assertEqual(code,'STOP_TOTAL_15_MINUTE_DEADLINE');self.assertEqual(calls['sections'],0)
  self.assertEqual(record['overall_test_limit_minutes'],15)


class LoginDeadlineSafety(unittest.TestCase):
    exercise=LauncherSafety.exercise
    def test_login_wait_counts_against_total_and_blocks_mutation(self):
        calls,code,record=self.exercise(expire_during_login=True)
        self.assertEqual(calls,{'login':['A','B'],'stage':0,'sections':0})
        self.assertEqual(code,'STOP_TOTAL_15_MINUTE_DEADLINE')


class SeparateSnapshotSafety(unittest.TestCase):
    def test_old_install_with_fresh_live_passes_without_mutation(self):
        with tempfile.TemporaryDirectory() as folder,patch.dict(ns,{'now':lambda:CLOCK}):
            a,b=receipts(folder);old=json.loads(a.read_text());old['checked_at_utc']='2026-10-30T00:00:00Z';a.write_text(json.dumps(old))
            ns['HISTORICAL_INSTALL_SHA256']=hashlib.sha256(a.read_bytes()).hexdigest();before=a.read_bytes()
            s['validate_receipts'](a,b);self.assertEqual(a.read_bytes(),before)

    def test_live_missing_stale_future_hash_and_metadata_drift_stop(self):
        for mode in ('missing','stale','future','hash','metadata','timestamp','project','provenance'):
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as folder,patch.dict(ns,{'now':lambda:CLOCK}):
                receipts(folder);rp=ns['LIVE_SNAPSHOT_RECEIPT'];r=json.loads(rp.read_text());cp=Path(r['source_csv_path'])
                if mode=='missing':rp.unlink()
                elif mode=='hash':cp.write_text(cp.read_text()+'x')
                elif mode in ('project','provenance'):
                    r['project_ref' if mode=='project' else 'project_ref_provenance']='wrong';rp.write_text(json.dumps(r))
                else:
                    with cp.open() as handle:reader=csv.DictReader(handle);fields=reader.fieldnames;row=next(reader)
                    if mode=='metadata':row['database_name']='other_project'
                    elif mode=='timestamp':r['checked_at_utc']='2026-11-02 13:58:00'
                    else:row['checked_at_utc']='2026-11-02 13:40:00' if mode=='stale' else '2026-11-02 14:01:00';r['checked_at_utc']=row['checked_at_utc']
                    with cp.open('w') as handle:writer=csv.DictWriter(handle,fieldnames=fields);writer.writeheader();writer.writerow(row)
                    r['source_csv_sha256']=hashlib.sha256(cp.read_bytes()).hexdigest();rp.write_text(json.dumps(r))
                with self.assertRaises((s['Stop'],FileNotFoundError)):s['validate_live_snapshot']()


class HistoricalHashSafety(unittest.TestCase):
    def test_historical_evidence_hash_drift_rejected(self):
        with tempfile.TemporaryDirectory() as folder,patch.dict(ns,{'now':lambda:CLOCK}):
            a,b=receipts(folder);a.write_text(a.read_text()+' ')
            with self.assertRaisesRegex(s['Stop'],'STAGE_B_INSTALLED_METADATA_POSTFLIGHT_REQUIRED'):s['validate_receipts'](a,b)


class TodayCollisionSafety(unittest.TestCase):
    def test_one_collision_or_missing_count_blocks(self):
        for mode in ('collision','missing'):
            with tempfile.TemporaryDirectory() as folder,patch.dict(ns,{'now':lambda:CLOCK}):
                receipts(folder);rp=ns['LIVE_SNAPSHOT_RECEIPT'];r=json.loads(rp.read_text());cp=Path(r['source_csv_path'])
                with cp.open() as handle:reader=csv.DictReader(handle);fields=reader.fieldnames;row=next(reader)
                if mode=='collision':row['new_grant_id_collision_count']='1'
                else:fields.remove('new_grant_id_collision_count');row.pop('new_grant_id_collision_count')
                with cp.open('w') as handle:writer=csv.DictWriter(handle,fieldnames=fields);writer.writeheader();writer.writerow(row)
                r['source_csv_sha256']=hashlib.sha256(cp.read_bytes()).hexdigest();rp.write_text(json.dumps(r))
                with self.assertRaisesRegex(s['Stop'],'FIXED_ID_COLLISION'):s['validate_live_snapshot']()


class ProvenanceSafety(unittest.TestCase):
    def test_agent_requires_exact_project_url_and_source(self):
        for url,source,allowed in (
            ('https://supabase.com/dashboard/project/'+s['PROJECT']+'/sql/new','Agent-observed read-only Supabase SQL Editor CSV through CUA',True),
            ('https://supabase.com/dashboard/project/wrong/sql','Agent-observed read-only Supabase SQL Editor CSV through CUA',False),
            ('https://supabase.com.attacker.test/dashboard/project/'+s['PROJECT']+'/sql','Agent-observed read-only Supabase SQL Editor CSV through CUA',False),
            ('https://supabase.com/dashboard/project/'+s['PROJECT']+'/sql','user',False)):
            with tempfile.TemporaryDirectory() as folder,patch.dict(ns,{'now':lambda:CLOCK}):
                receipts(folder);rp=ns['LIVE_SNAPSHOT_RECEIPT'];r=json.loads(rp.read_text());r.update(project_ref_provenance='AGENT_OBSERVED_ANYVO_PRODUCTION_SQL_EDITOR_URL_NOT_CSV_FIELD',project_ref_evidence=url,source=source);rp.write_text(json.dumps(r))
                if allowed:s['validate_live_snapshot']()
                else:
                    with self.assertRaises(s['Stop']):s['validate_live_snapshot']()

    def test_wrong_plan_sql_or_fixture_binding_blocks(self):
        for key in ('sql_sha256','plan_sha256','fixture_sha256'):
            with tempfile.TemporaryDirectory() as folder,patch.dict(ns,{'now':lambda:CLOCK}):
                receipts(folder);rp=ns['LIVE_SNAPSHOT_RECEIPT'];r=json.loads(rp.read_text());r[key]='wrong';rp.write_text(json.dumps(r))
                with self.assertRaisesRegex(s['Stop'],'QA_COMPONENT_SOURCE_DRIFT'):s['validate_live_snapshot']()
