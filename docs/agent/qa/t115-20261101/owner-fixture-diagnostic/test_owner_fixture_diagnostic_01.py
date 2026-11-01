import copy,json,runpy,subprocess,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
s=runpy.run_path(str(Path(__file__).with_name('t115-owner-fixture-diagnostic-01.py')))
class DiagnosticSafety(unittest.TestCase):
 def exercise(self,failure=None):
  common=runpy.run_path(str(s['COMMON']));sec=runpy.run_path(str(common['SECTIONS']));rows={};calls=[];post_count=0
  expected=sec['ROWS'];r=sec['r'];first=next((table,i)for table,items in expected.items()for i in items)
  if failure=='collision':rows[first]=copy.deepcopy(expected[first[0]][first[1]])
  def read(_,__,who,path):
   self.assertEqual(who,'A')
   if path==r['DOG_OWNER_A']:return [{'id':sec['DOG'],'owner_id':common['OWNER']}]
   key=next(k for k,v in r['EXACT'].items()if v==path)
   return [copy.deepcopy(rows[key])]if key in rows else[]
  def api(_,__,who,method,path,body):
   nonlocal post_count
   self.assertEqual(who,'A');self.assertEqual(method,'POST');self.assertIn(path,{'/rest/v1/'+t for t in expected})
   table=path.rsplit('/',1)[1];key=(table,body['id']);calls.append(('POST',key));post_count+=1
   if failure=='http':return 400,{'code':'23514','message':'FAKE_SECRET_RESPONSE_BODY','details':'PRIVATE_INPUT'}
   if failure=='unsafe_error_code':return 400,{'code':'SECRET_USER_VALUE_DO_NOT_COPY','message':'PRIVATE_INPUT'}
   rows[key]=copy.deepcopy(body)
   if failure=='lost_response':raise TimeoutError('PRIVATE_INPUT')
   if failure=='bad_representation':return 201,[]
   return 201,[copy.deepcopy(body)]
  def fixed(*a):
   if failure=='readback':raise s['Stop']('EXACT_ROW_CONTENT_MISMATCH')
  def cleanup(_,__,table,item):
   calls.append(('DELETE',(table,item)))
   if failure=='cleanup':raise RuntimeError('PRIVATE_INPUT')
   rows.pop((table,item),None)
  sec['r']['rows']=read;sec['api']=api;sec['fixed_row']=fixed;sec['cleanup_row']=cleanup
  state={'requests':[],'full_t115_acceptance':False,'grant_operations':0,'storage_operations':0}
  result=s['diagnostic'](common,'test-key',{'A':'RAM_TOKEN_NEVER_LOG'},sec,state)
  self.assertNotIn('PRIVATE_INPUT',json.dumps(result));self.assertNotIn('FAKE_SECRET_RESPONSE_BODY',json.dumps(result));self.assertNotIn('RAM_TOKEN',json.dumps(result))
  return result,rows,calls,post_count
 def test_success_is_not_full_acceptance_all_exact_rows_deleted(self):
  d,rows,calls,n=self.exercise();self.assertEqual(n,10);self.assertEqual(d['code'],'PASS_OWNER_FIXTURE_INSERT_DIAGNOSTIC_NOT_FULL_T115_QA');self.assertFalse(d['full_t115_acceptance']);self.assertFalse(rows);self.assertEqual(len([c for c in calls if c[0]=='DELETE']),10)
 def test_first_http_failure_records_only_safe_metadata_and_stops(self):
  d,rows,calls,n=self.exercise('http');self.assertEqual(n,1);self.assertFalse(rows);self.assertEqual(d['failed_insert']['safe_database_error_code'],'23514');self.assertEqual(d['failed_insert']['http_status'],400)
 def test_unrecognized_response_code_not_copied(self):
  d,_,_,_=self.exercise('unsafe_error_code');self.assertIsNone(d['failed_insert']['safe_database_error_code']);self.assertNotIn('SECRET_USER_VALUE',json.dumps(d))
 def test_lost_insert_response_still_cleans_only_attempted_row(self):
  d,rows,calls,n=self.exercise('lost_response');self.assertEqual(n,1);self.assertFalse(rows);self.assertTrue(d['code'].startswith('STOP_'));self.assertEqual(len([c for c in calls if c[0]=='DELETE']),1)
 def test_unexpected_representation_stops_and_cleans(self):
  d,rows,_,n=self.exercise('bad_representation');self.assertEqual(n,1);self.assertFalse(rows);self.assertFalse(d['failed_insert']['representation_is_single_expected_id'])
 def test_readback_failure_cleans_without_further_post(self):
  d,rows,_,n=self.exercise('readback');self.assertEqual(n,1);self.assertFalse(rows);self.assertEqual(d['code'],'STOP_EXACT_ROW_CONTENT_MISMATCH')
 def test_preexisting_row_never_mutated(self):
  d,rows,calls,n=self.exercise('collision');self.assertEqual(n,0);self.assertTrue(rows);self.assertFalse(calls);self.assertEqual(d['code'],'STOP_FIXED_ID_COLLISION_NO_MUTATION')
 def test_cleanup_failure_preserves_uncertainty_not_pass(self):
  d,rows,_,_=self.exercise('cleanup');self.assertTrue(rows);self.assertEqual(d['cleanup'],'UNCERTAIN');self.assertEqual(d['code'],'STOP_DIAGNOSTIC_CLEANUP_UNCERTAIN')
 def test_no_execute_flag_is_inert(self):
  r=subprocess.run([sys.executable,str(Path(__file__).with_name('t115-owner-fixture-diagnostic-01.py'))],capture_output=True,text=True);self.assertEqual(r.returncode,2);self.assertIn('STOP_EXPLICIT_APPROVED_DIAGNOSTIC_START_REQUIRED',r.stdout)
 def test_private_attempt_is_exclusive(self):
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp)/'attempt.json';s['private_result'](p,{'safe':True});self.assertEqual(p.stat().st_mode&0o777,0o600)
   with self.assertRaises(FileExistsError):s['private_result'](p,{'safe':True})
 def test_unexpected_error_details_are_redacted(self):
  self.assertEqual(s['safe_error'](RuntimeError('bearer secret.value')),'UNEXPECTED_DIAGNOSTIC_ERROR')

class StrictErrorRedaction(unittest.TestCase):
 def test_uppercase_exception_payload_is_not_a_safe_guard_code(self):
  self.assertEqual(globals()['s']['safe_error'](TimeoutError('PRIVATE_INPUT')),'NETWORK_REQUEST_FAILED_OR_TIMEOUT')
  self.assertEqual(globals()['s']['safe_error'](RuntimeError('PRIVATE_INPUT')),'UNEXPECTED_DIAGNOSTIC_ERROR')
  self.assertEqual(globals()['s']['safe_error'](globals()['s']['Stop']('PRIVATE_INPUT')),'UNEXPECTED_DIAGNOSTIC_ERROR')

class SourceAndMetadataGuards(unittest.TestCase):
 def test_common_source_drift_stops_before_loading_or_login(self):
  with patch.dict(s['load_verified'].__globals__,{'COMMON_SHA':'0'*64}):
   with self.assertRaisesRegex(s['Stop'],'COMMON_SOURCE_DRIFT'):s['load_verified']()
 def test_independent_metadata_receipt_hash_drift_stops(self):
  with patch.dict(s['load_verified'].__globals__,{'POST_SHA':'0'*64}):
   with self.assertRaisesRegex(s['Stop'],'INDEPENDENT_CLEAN_STATE_REQUIRED'):s['load_verified']()
 def test_actual_prior_stop_hash_drift_stops(self):
  with patch.dict(s['load_verified'].__globals__,{'PRIOR_SHA':'0'*64}):
   with self.assertRaisesRegex(s['Stop'],'ACTUAL_OWNER_INSERT_STOP_REQUIRED'):s['load_verified']()
