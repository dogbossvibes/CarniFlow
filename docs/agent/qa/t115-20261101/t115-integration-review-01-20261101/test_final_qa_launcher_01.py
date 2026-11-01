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

s=runpy.run_path(str(Path(__file__).with_name('t115-final-qa-01.py')))
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
                      'acquire_once':lambda:original_acquire(base/'attempt.json'),'public_key':lambda:'FAKE_PUBLIC_KEY'}
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

if __name__=='__main__':unittest.main()
