"""Offline-only launcher gate/credential-count/cleanup tests; no real network."""
import datetime as dt
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

s=runpy.run_path(str(Path(__file__).with_name('t115-final-qa-resume-01.py')))
ns=s['complete'].__globals__
CLOCK=dt.datetime(2026,11,1,14,0,tzinfo=dt.timezone.utc)

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
      'health_rows_before':26,'health_rows_after':26,'checked_at_utc':'2026-11-01T13:59:00Z'}
    storage={'project_ref':s['PROJECT'],'bucket_id':'dog-documents',
      'path':s['OWNER']+'/b4991851-e569-51fc-a0af-4e0172f2bc63/t115-health-6eff5243-26c7-488e-90ed-fb4bb62632d2.png',
      'exact_object_count':0,'status':'READ_ONLY_ABSENT_AT_CHECK_TIME_NOT_EXECUTION_APPROVAL',
      'checked_at_utc':'2026-11-01T13:59:00Z'}
    a,b=Path(folder)/'install.json',Path(folder)/'storage.json'
    a.write_text(json.dumps(install));b.write_text(json.dumps(storage));return a,b

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
        d=s['verify_sources']();self.assertEqual(len(d['sources']),10)

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
            a,b=receipts(folder);data=json.loads(b.read_text());data['checked_at_utc']='2026-11-01T13:40:00Z';b.write_text(json.dumps(data))
            with self.assertRaisesRegex(s['Stop'],'FRESH_READONLY_RECEIPT_REQUIRED'):s['validate_receipts'](a,b)

    def test_boolean_is_not_an_aggregate_count(self):
        with tempfile.TemporaryDirectory() as folder,patch.dict(ns,{'now':lambda:CLOCK}):
            a,b=receipts(folder);data=json.loads(b.read_text());data['exact_object_count']=False;b.write_text(json.dumps(data))
            with self.assertRaises(s['Stop']):s['validate_receipts'](a,b)
            a,b=receipts(folder);data=json.loads(a.read_text());data['select_all_policy_count']=True;a.write_text(json.dumps(data))
            with self.assertRaises(s['Stop']):s['validate_receipts'](a,b)

    def exercise(self,fail_stage=False,uncertain_cleanup=False):
        with tempfile.TemporaryDirectory() as folder:
            base=Path(folder);a,b=receipts(folder);calls={'login':[],'stage':0,'sections':0}
            def login(key,label,email,uid):
                calls['login'].append(label);return 'FAKE_TOKEN_'+label
            def stage_run(key,tokens):
                calls['stage']+=1
                self.assertEqual(tokens,{'A':'FAKE_TOKEN_A','B':'FAKE_TOKEN_B'})
                if fail_stage:raise s['Stop']('SYNTHETIC_STAGE_B_FAILURE')
                return 'PASS_T115_STAGE_B_NORMAL_JWT_OWNER_RECIPIENT_ISOLATION'
            def stage_write(code):
                p=base/'stage.json';p.write_text(json.dumps({'code':code}));return p
            def sections_run(stage_path,storage_path,key,tokens):
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
                      'acquire_once':lambda:original_acquire(base/'attempt.json'),'public_key':lambda:'FAKE_PUBLIC_KEY',
                      'validate_prior_no_write_stop':lambda:None,
                      'validate_fixed_unused_ids_after_login':lambda *_:True,
                      'wait_for_post_login_receipts':lambda x,y:s['validate_receipts'](x,y)}
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
        self.assertEqual(calls['sections'],0);self.assertEqual(code,'STOP_SYNTHETIC_STAGE_B_FAILURE')

    def test_uncertain_cleanup_never_becomes_full_pass(self):
        calls,code,record=self.exercise(uncertain_cleanup=True)
        self.assertEqual(code,'STOP_FULL_SECTIONS_PASS_AND_CLEANUP_REQUIRED')

    def test_error_codes_do_not_print_response_or_credentials(self):
        self.assertEqual(s['safe_code'](Exception('FAKE_SECRET_RESPONSE')),'STOP_UNEXPECTED_LOCAL_QA_ERROR')
        self.assertEqual(s['safe_code'](KeyboardInterrupt()),'STOP_LOCAL_INPUT_CANCELLED')
        self.assertEqual(s['safe_code'](s['Stop']('CLEANUP_UNCERTAIN_storage')),'STOP_CLEANUP_UNCERTAIN_STORAGE')

def zero_count(path,clock=CLOCK):
    names=['health_rows','document_rows','grant_rows','negative_probe_rows','storage_objects','active_new_grants']
    data={'code':'PASS_T115_FIXED_UNUSED_IDS_ABSENT_AFTER_NO_WRITE_STOP','project_ref':s['PROJECT'],
          'scope_packet_sha256':'e9188495dd2dca10c560c72e43c9e7628e4271921fc847e3471caf232aa27d83',
          'checked_at_utc':s['utc'](clock),'counts':{k:0 for k in names}}
    path.write_text(json.dumps(data));return data

class PostLoginReadiness(unittest.TestCase):
    def test_prior_stop_must_prove_no_components_started(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'prior.json';p.write_text(json.dumps({'code':'STOP_FRESH_READONLY_RECEIPT_REQUIRED','phase':'stage_b','component_receipts':{'stage_b':'some'}}))
            with patch.dict(ns,{'PRIOR_RESULT':p}):
                with self.assertRaisesRegex(s['Stop'],'PRIOR_NO_WRITE_STOP_REQUIRED'):
                    s['validate_prior_no_write_stop']()

    def test_zero_count_rejects_used_id_boolean_or_wrong_scope(self):
        with tempfile.TemporaryDirectory() as folder,patch.dict(ns,{'now':lambda:CLOCK}):
            p=Path(folder)/'counts.json';data=zero_count(p)
            with patch.dict(ns,{'NO_WRITE_COUNT':p}):
                self.assertTrue(s['validate_fixed_unused_ids_after_login'](CLOCK))
                for value in [1,False]:
                    bad={**data,'counts':{**data['counts'],'grant_rows':value}};p.write_text(json.dumps(bad))
                    with self.assertRaisesRegex(s['Stop'],'UNUSED_FIXED_IDS_ZERO_COUNT_REQUIRED'):
                        s['validate_fixed_unused_ids_after_login'](CLOCK)
                p.write_text(json.dumps({**data,'project_ref':'other'}))
                with self.assertRaises(s['Stop']):s['validate_fixed_unused_ids_after_login'](CLOCK)

    def test_old_count_does_not_satisfy_after_login_barrier(self):
        with tempfile.TemporaryDirectory() as folder,patch.dict(ns,{'now':lambda:CLOCK}):
            p=Path(folder)/'counts.json';zero_count(p,CLOCK-dt.timedelta(seconds=1))
            with patch.dict(ns,{'NO_WRITE_COUNT':p}):
                self.assertFalse(s['validate_fixed_unused_ids_after_login'](CLOCK))

    def test_wait_uses_new_post_auth_proofs_without_relogin_or_data_calls(self):
        with tempfile.TemporaryDirectory() as folder:
            base=Path(folder);a,b=receipts(folder);count=base/'count.json';zero_count(count,CLOCK-dt.timedelta(seconds=1));clock=[CLOCK];ticks=[0]
            def advance(_):
                ticks[0]+=2;clock[0]=CLOCK+dt.timedelta(seconds=ticks[0])
                for p in [a,b]:
                    data=json.loads(p.read_text());data['checked_at_utc']=s['utc'](clock[0]);p.write_text(json.dumps(data))
                zero_count(count,clock[0])
            with patch.dict(ns,{'BASE':base,'NO_WRITE_COUNT':count,'now':lambda:clock[0],'verify_sources':lambda:None}),patch.object(s['time'],'monotonic',side_effect=lambda:ticks[0]),patch.object(s['time'],'sleep',side_effect=advance):
                s['wait_for_post_login_receipts'](a,b)
            signals=list(base.glob('T115-AUTH-READY-REQUEST-*.json'));self.assertEqual(len(signals),1)
            self.assertEqual(signals[0].stat().st_mode & 0o777,0o600)
            data=json.loads(signals[0].read_text());self.assertEqual(data['verified_test_account_ids'],[s['OWNER'],s['RECIPIENT']])
            self.assertEqual(set(data),{'code','ready_at_utc','launcher_sha256','manifest_sha256','verified_test_account_ids','requires_unused_id_count_after_login'})
            self.assertEqual(ticks[0],2)

    def test_wait_timeout_never_starts_qa(self):
        with tempfile.TemporaryDirectory() as folder:
            base=Path(folder)
            with patch.dict(ns,{'BASE':base,'now':lambda:CLOCK,'verify_sources':lambda:None,'validate_receipts':lambda *_:(_ for _ in ()).throw(s['Stop']('FRESH_READONLY_RECEIPT_REQUIRED'))}),patch.object(s['time'],'monotonic',side_effect=[0,0,601]),patch.object(s['time'],'sleep',return_value=None):
                with self.assertRaisesRegex(s['Stop'],'POST_LOGIN_READINESS_WAIT_EXPIRED_NO_QA_STARTED'):
                    s['wait_for_post_login_receipts'](base/'a',base/'b')

    def test_contract_error_is_not_treated_as_staleness(self):
        with tempfile.TemporaryDirectory() as folder:
            base=Path(folder)
            with patch.dict(ns,{'BASE':base,'now':lambda:CLOCK,'verify_sources':lambda:None,'validate_receipts':lambda *_:(_ for _ in ()).throw(s['Stop']('STAGE_B_INSTALLED_METADATA_POSTFLIGHT_REQUIRED'))}),patch.object(s['time'],'sleep',side_effect=AssertionError('must not wait')):
                with self.assertRaisesRegex(s['Stop'],'STAGE_B_INSTALLED_METADATA_POSTFLIGHT_REQUIRED'):
                    s['wait_for_post_login_receipts'](base/'a',base/'b')

    def test_source_drift_is_not_treated_as_staleness(self):
        with tempfile.TemporaryDirectory() as folder:
            base=Path(folder)
            with patch.dict(ns,{'BASE':base,'now':lambda:CLOCK,'verify_sources':lambda:(_ for _ in ()).throw(s['Stop']('QA_COMPONENT_SOURCE_DRIFT'))}),patch.object(s['time'],'sleep',side_effect=AssertionError('must not wait')):
                with self.assertRaisesRegex(s['Stop'],'QA_COMPONENT_SOURCE_DRIFT'):
                    s['wait_for_post_login_receipts'](base/'a',base/'b')

if __name__=='__main__':unittest.main()
