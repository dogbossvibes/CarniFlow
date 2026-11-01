import copy, datetime as dt, json, runpy, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
s=runpy.run_path(str(Path(__file__).with_name('t115-final-qa-sections-safari-free-01.py')))
CLOCK=dt.datetime(2026,11,1,19,45,tzinfo=dt.timezone.utc)
class Continuation(unittest.TestCase):
 def test_sources_and_original_stage_pass_are_bound(self):
  with patch.dict(s['validate_stage_b_pass'].__globals__,{'now':lambda:CLOCK}):
   self.assertEqual(len(s['verify_sources']()['sources']),13);s['validate_prior_scoped_stop']()
 def test_stage_b_pass_expires(self):
  with patch.dict(s['validate_stage_b_pass'].__globals__,{'now':lambda:CLOCK+dt.timedelta(hours=2)}):
   with self.assertRaises(s['Stop']):s['validate_stage_b_pass']()
 def test_residual_receipt_has_exact_counts_and_bound_identity(self):
  original=json.loads(s['RESIDUAL_RECEIPT'].read_text())
  for field in original['counts']:
   d=copy.deepcopy(original);d['counts'][field]+=1
   self.assert_bad_receipt(d)
  for field in ['id','owner_id','dog_id','reason','status','fixture_input_time','appointment_at_equals_fixture_timestamptz']:
   d=copy.deepcopy(original);d['remaining_vet_fixture'][field]='wrong';self.assert_bad_receipt(d)
 def assert_bad_receipt(self,d):
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp)/'receipt.json';p.write_text(json.dumps(d))
   with patch.dict(s['validate_residual_after_login'].__globals__,{'RESIDUAL_RECEIPT':p,'now':lambda:CLOCK}):
    with self.assertRaises(s['Stop']):s['validate_residual_after_login'](CLOCK-dt.timedelta(minutes=10))
 def test_used_or_active_sections_grant_stops(self):
  original=json.loads(s['RESIDUAL_RECEIPT'].read_text())
  for field,value in [('sections_grant_present',True),('stage_b_active_now',True),('stage_b_revoked_at_sql_text',None)]:
   d=copy.deepcopy(original);d['grants'][field]=value;self.assert_bad_receipt(d)
 def test_boolean_count_stops(self):
  d=json.loads(s['RESIDUAL_RECEIPT'].read_text());d['counts']['vet_fixture']=True;self.assert_bad_receipt(d)
 def test_old_residual_cannot_satisfy_postauth_barrier(self):
  d=json.loads(s['RESIDUAL_RECEIPT'].read_text());d['checked_at_utc']=(CLOCK-dt.timedelta(seconds=10)).isoformat()
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp)/'receipt.json';p.write_text(json.dumps(d))
   with patch.dict(s['validate_residual_after_login'].__globals__,{'RESIDUAL_RECEIPT':p,'now':lambda:CLOCK}):self.assertFalse(s['validate_residual_after_login'](CLOCK))
 def exercise(self,fail=None):
  events=[];ns=s['complete'].__globals__
  with tempfile.TemporaryDirectory()as tmp:
   tmp=Path(tmp)
   def login(key,label,email,uid):events.append('login'+label);return 'RAM-only-test-token'
   stage={'core':{'USERS':[('A','test-a',s['OWNER']),('B','test-b',s['RECIPIENT'])]},'qa':{'login':login},'run':lambda **kw:self.fail('StageB must never rerun')}
   def fixed(*a):
    events.append('verify-only-fixed-vet')
    if fail=='identity':raise s['Stop']('EXACT_ROW_CONTENT_MISMATCH')
   def cleanup(*a):events.append('delete-only-fixed-vet')
   def rows(*a):return [{}]if fail=='cleanup'else[]
   def run(*a,**kw):
    events.append('sections')
    if fail=='sections':raise s['Stop']('SECTION_TEST_FAILURE')
    return 'PASS_T115_SECTIONS_NORMAL_JWT_AND_STORAGE'
   def safe(code):
    p=tmp/'section.json';p.write_text(json.dumps({'phase':'complete','cleanup':{'grant':'revoked_or_absent','storage':'deleted_or_absent','rows':'deleted_or_absent','probes':'absent_or_deleted'}}));return p
   sections={'fixed_row':fixed,'cleanup_row':cleanup,'r':{'rows':rows,'EXACT':{('dog_vet_appointments','b702b7cb-5857-425e-b9ad-50123f9880d5'):'exact-fixed-route'}},'DOG':'b4991851-e569-51fc-a0af-4e0172f2bc63','run':run,'safe_result':safe}
   def wait(*a):
    events.append('fresh-postauth-proofs')
    if fail=='metadata':raise s['Stop']('POLICY_METADATA_MISMATCH')
   def load(path):
    return stage if Path(path)==s['STAGE_B'] else sections if Path(path)==s['SECTIONS'] else self.fail('Unexpected dynamic source')
   bindings={'now':lambda:CLOCK,'public_key':lambda:'test-key','acquire_once':lambda:events.append('one-shot'),'private_json':lambda p,d:p.write_text(json.dumps(d)),'BASE':tmp,'wait_for_post_login_receipts':wait,'validate_receipts':lambda *a:None,'validate_residual_after_login':lambda *a:True}
   b=s['BASE']
   with patch.dict(ns,bindings),patch.object(ns['runpy'],'run_path',side_effect=load):
    code,result=s['complete'](b/'T115-STAGE-B-INSTALL-POSTFLIGHT-20261101.json',b/'T115-SECTIONS-STORAGE-PATH-READONLY-20261101.json')
    state=json.loads(result.read_text())
   return code,state,events
 def test_success_does_not_repeat_stage_b_and_orders_all_gates(self):
  code,state,events=self.exercise();self.assertEqual(code,'PASS_T115_COMPLETE_NORMAL_JWT_BACKEND_QA')
  self.assertEqual(events,['one-shot','loginA','loginB','fresh-postauth-proofs','verify-only-fixed-vet','delete-only-fixed-vet','sections'])
  self.assertEqual(Path(state['component_receipts']['stage_b']),s['STAGE_B_PASS']);self.assertIn('residual_cleanup',state['component_receipts'])
 def test_bad_metadata_prevents_all_mutations(self):
  code,_,events=self.exercise('metadata');self.assertTrue(code.startswith('STOP_'));self.assertNotIn('delete-only-fixed-vet',events);self.assertNotIn('sections',events)
 def test_wrong_fixture_identity_prevents_delete_and_sections(self):
  code,_,events=self.exercise('identity');self.assertTrue(code.startswith('STOP_'));self.assertNotIn('delete-only-fixed-vet',events);self.assertNotIn('sections',events)
 def test_uncertain_cleanup_prevents_sections(self):
  code,_,events=self.exercise('cleanup');self.assertEqual(code,'STOP_EXACT_RESIDUAL_VET_CLEANUP_NOT_CONFIRMED');self.assertNotIn('sections',events)
 def test_sections_failure_never_becomes_full_pass(self):
  code,state,_=self.exercise('sections');self.assertEqual(code,'STOP_SECTION_TEST_FAILURE');self.assertNotEqual(state['phase'],'complete')

class PreviousWaitOnlyEvidence(unittest.TestCase):
 def test_modified_previous_timeout_blocks_before_credentials(self):
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp)/'stop.json';p.write_text('{}')
   with patch.dict(s['validate_prior_scoped_stop'].__globals__,{'TIMEOUT_RESULT':p}):
    with self.assertRaisesRegex(s['Stop'],'PREVIOUS_WAIT_ONLY_TIMEOUT_EVIDENCE_DRIFT'):s['validate_prior_scoped_stop']()
 def test_missing_previous_timeout_is_not_retry_permission(self):
  with tempfile.TemporaryDirectory()as tmp:
   with patch.dict(s['validate_prior_scoped_stop'].__globals__,{'TIMEOUT_RESULT':Path(tmp)/'absent.json'}):
    with self.assertRaises(FileNotFoundError):s['validate_prior_scoped_stop']()

class LatestWaitEvidence(unittest.TestCase):
 def test_latest_timeout_hash_drift_stops(self):
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp)/'stop.json';p.write_text('{}')
   with patch.dict(s['validate_prior_scoped_stop'].__globals__,{'RECENT_TIMEOUT_RESULT':p}):
    with self.assertRaisesRegex(s['Stop'],'RECENT_WAIT_ONLY_TIMEOUT_EVIDENCE_DRIFT'):s['validate_prior_scoped_stop']()
 def test_latest_timeout_absence_stops(self):
  with tempfile.TemporaryDirectory()as tmp:
   with patch.dict(s['validate_prior_scoped_stop'].__globals__,{'RECENT_TIMEOUT_RESULT':Path(tmp)/'absent.json'}):
    with self.assertRaises(FileNotFoundError):s['validate_prior_scoped_stop']()
