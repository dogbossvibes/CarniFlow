import datetime as dt
import json
from pathlib import Path
import runpy
import tempfile
import unittest
from unittest.mock import patch

s=runpy.run_path(str(Path(__file__).with_name('t115-sections-storage-diagnostics-01.py')))

class CoordinatorGuards(unittest.TestCase):
    def test_storage_rls_400_requires_exact_denial_body(self):
        denied={'statusCode':'403','error':'Unauthorized',
                'message':'new row violates row-level security policy for table "objects"'}
        self.assertTrue(s['storage_write_denied'](400,denied))
        self.assertTrue(s['storage_write_denied'](400,{**denied,'statusCode':403}))
        self.assertTrue(s['storage_write_denied'](400,{**denied,'code':'AccessDenied'}))
        for body in ({'statusCode':'400','error':'Bad Request','message':'invalid'},
                     {**denied,'message':'other'}, {**denied,'code':'Unknown'},
                     {**denied,'extra':True}, None):
            with self.subTest(body=body):
                self.assertFalse(s['storage_write_denied'](400,body))

    def test_storage_cleanup_waits_for_cached_bytes_after_single_delete(self):
        png=s['PNG_PATH'].read_bytes(); calls=[]
        replies=iter([(200,png),(200,png),(404,b'')])
        def api(*args,**kwargs):
            calls.append(args[3]); return next(replies) if args[3]=='GET' else (200,{})
        ticks=iter(range(100))
        fake_time=type('T',(),{'monotonic':staticmethod(ticks.__next__),
                               'sleep':staticmethod(lambda _:None)})
        with patch.dict(s['cleanup_storage'].__globals__,
                        {'fixed_row':lambda *a:None,'api':api,'time':fake_time}):
            s['cleanup_storage']('key',{'A':'jwt'})
        self.assertEqual(calls,['GET','DELETE','GET','GET'])
        calls=[]; replies=iter([(200,png),(200,png),(404,b'')])
        def lost_response(*args,**kwargs):
            calls.append(args[3])
            if args[3]=='DELETE': raise TimeoutError('lost delete response')
            return next(replies)
        ticks=iter(range(100))
        fake_time=type('T',(),{'monotonic':staticmethod(ticks.__next__),
                               'sleep':staticmethod(lambda _:None)})
        with patch.dict(s['cleanup_storage'].__globals__,
                        {'fixed_row':lambda *a:None,'api':lost_response,'time':fake_time}):
            s['cleanup_storage']('key',{'A':'jwt'})
        self.assertEqual(calls,['GET','DELETE','GET','GET'])

    def exercise(self, failure=None, deadline=None):
        ns=s['run'].__globals__
        clock=dt.datetime(2026,11,2,13,0,tzinfo=dt.timezone.utc)
        state={'rows':{},'probes':{},'grant':None,'storage':False,'writes':0,'revokes':0,'deletes':0,'ticks':0}
        png=s['PNG_PATH'].read_bytes()
        receipt={'code':'PASS_T115_STAGE_B_NORMAL_JWT_OWNER_RECIPIENT_ISOLATION',
                 'runner_sha256':'75e79c0453814a54be7e37e2af193bc1ed498d1fe8747e0bce46d74f55b4566f',
                 'phase':'complete','cleanup':{'grant':'revoked_or_absent','row':'deleted_or_absent'},
                 'row_id':'7a01474c-6508-41ae-921f-cb20b4b63db5',
                 'grant_id':'24dcf4f1-4a9a-42e3-96b8-164db69d2773',
                 'finished_at_utc':'2026-11-02T12:59:00Z'}
        def tick():
            state['ticks']+=1
            return state['ticks']
        def api(_,__,who,method,path,body=None,binary=False):
            state.setdefault('effective_deadline',ns['DEADLINE'])
            if method=='GET':
                if path==s['CONNECTION']:
                    return 200,[{'id':'connection','owner_user_id':s['A'],'connected_user_id':s['B'],'status':'accepted'}]
                if path==s['GRANT_LIST']: return 200,[]
                if path==s['GRANT_READ']: return 200,[state['grant']] if state['grant'] else []
                if path==s['AUTH_STORAGE']: return (200,png) if state['storage'] else (404,b'')
                for table,probe_path in s['PROBE_READ'].items():
                    if path==probe_path: return 200,[state['probes'][table]] if table in state['probes'] else []
                raise AssertionError(('unexpected GET',path))
            state['writes']+=1
            if who=='A' and method=='POST' and path==s['STORAGE']:
                state['storage']=True
                if failure=='storage_insert': raise TimeoutError('synthetic lost response')
                if failure=='storage_collision': return 409,{'message':'exists'}
                return 200,{'Key':s['PATH']}
            if who=='A' and method=='DELETE' and path==s['STORAGE']:
                if failure in ('storage_cleanup','storage_cleanup_primary'):raise TimeoutError('private body must not be logged')
                state['storage']=False;state['deletes']+=1;return 200,{}
            if who=='A' and method=='POST' and path==s['GRANTS']:
                state['grant']={**body,'revoked_at':None}
                if failure=='broader_grant': state['grant']['can_view_emergency_info']=True
                if failure=='grant_insert': raise TimeoutError('synthetic lost response')
                return 201,[{'id':s['GRANT']}]
            if who=='A' and method=='PATCH' and path==s['GRANT_WRITE']:
                state['revokes']+=1
                if failure=='revoke': raise TimeoutError('synthetic revoke failure')
                state['grant']['revoked_at']=body['revoked_at'];return 200,[state['grant']]
            for table,items in s['ROWS'].items():
                if who=='A' and method=='POST' and path=='/rest/v1/'+table:
                    if failure=='post_http_403':return 403,{'code':'42501','message':'PRIVATE_DO_NOT_LOG'}
                    state['rows'][(table,body['id'])]=body
                    if failure=='row_insert' and state['writes']==1: raise TimeoutError('synthetic lost response')
                    return 201,[{'id':body['id']}]
                if who=='A' and method=='DELETE' and path.startswith('/rest/v1/'+table+'?id=eq.'):
                    item_id=path.split('eq.',1)[1]
                    state['rows'].pop((table,item_id),None)
                    if s['PROBES'].get(table)==item_id: state['probes'].pop(table,None)
                    state['deletes']+=1
                    if failure=='row_cleanup': raise TimeoutError('synthetic delete response lost')
                    return 200,[]
            if who=='B':
                if failure=='storage_cleanup_primary' and method=='DELETE' and path==s['STORAGE']:return 200,{}
                if failure in ('probe_insert','probe_hidden_insert') and method=='POST':
                    table=path.removeprefix('/rest/v1/')
                    state['probes'][table]=body
                    return (200,[]) if failure=='probe_hidden_insert' else (201,[body])
                return 403,{}
            raise AssertionError(('unexpected write',who,method,path))
        def exact_row(_,__,___,table,item_id,count):
            item=state['rows'].get((table,item_id))
            if (1 if item else 0)!=count: raise s['Stop']('MOCK_ROW_COUNT')
            return [item] if item else []
        def rows(_,__,___,path):
            if path==s['r']['DOG_OWNER_A']: return [{'id':s['DOG'],'owner_id':s['A']}]
            if path==s['r']['DOG_OWNER_B']: return []
            for (table,item_id),target in s['r']['EXACT'].items():
                if path==target:
                    item=state['rows'].get((table,item_id));return [item] if item else []
            raise AssertionError(('unexpected row read',path))
        def readback(phase,*_):
            if phase=='active' and failure=='active': raise s['Stop']('MOCK_ACTIVE_FAIL')
            if phase=='active' and not state['grant']: raise s['Stop']('MOCK_GRANT_MISSING')
            return 'PASS_MOCK'
        fake_r={**s['r'],'rows':rows,'exact_row':exact_row,'run':readback,
                'request':lambda *_:(200,{'signedURL':'/object/sign/dog-documents/'+s['PATH']+'?token=x'}),
                'signed_png':lambda *_:(500 if failure=='ttl_500' else 302 if failure=='ttl_302' else 403,'expired')}
        with tempfile.TemporaryDirectory() as folder:
            receipt_path=Path(folder)/'receipt.json';receipt_path.write_text(json.dumps(receipt))
            storage_path=Path(folder)/'storage.json';storage_path.write_text(json.dumps({
                'project_ref':'axkkhyqrjrtbkumaulta','bucket_id':'dog-documents','path':s['PATH'],
                'exact_object_count':0,'checked_at_utc':'2026-11-02T12:59:00Z',
                'status':'READ_ONLY_ABSENT_AT_CHECK_TIME_NOT_EXECUTION_APPROVAL'}))
            with patch.dict(s['core'],{'public_key_ok':lambda _:True}),patch.dict(ns,{
                'api':api,'r':fake_r,'now':lambda:clock,'time':type('T',(),{'monotonic':staticmethod(tick),'sleep':staticmethod(lambda _:None)})}):
                try: result=s['run'](receipt_path,storage_path,key='public-test',tokens={'A':'jwt-a','B':'jwt-b'},deadline=deadline);error=None
                except BaseException as exc: result=None;error=exc
                state['safe_failure_metadata']=ns.get('FIRST_INSERT_FAILURE')
                state['primary_failure']=ns.get('PRIMARY_FAILURE')
        return state,result,error

    def test_mocked_success_and_failure_cleanup(self):
        state,result,error=self.exercise()
        self.assertIsNone(error);self.assertEqual(result,'PASS_T115_SECTIONS_NORMAL_JWT_AND_STORAGE')
        self.assertFalse(state['rows']);self.assertFalse(state['probes']);self.assertFalse(state['storage'])
        self.assertIsNotNone(state['grant']['revoked_at'])
        for failure in ['row_insert','storage_insert','storage_collision','grant_insert','broader_grant','active','probe_insert','probe_hidden_insert','revoke','row_cleanup','ttl_500','ttl_302']:
            with self.subTest(failure=failure):
                state,_,error=self.exercise(failure)
                if failure!='row_cleanup': self.assertIsNotNone(error)
                if failure=='storage_insert':
                    self.assertIn(('dog_documents','c0217c36-9587-4282-86cb-c02816f4f169'),state['rows'])
                    self.assertTrue(state['storage'])
                    self.assertIn('UNCERTAIN',str(error))
                else:
                    self.assertFalse(state['rows']);self.assertFalse(state['probes'])
                    self.assertEqual(state['storage'],failure=='storage_collision')
                if failure!='revoke' and state['grant']:
                    self.assertIsNotNone(state['grant']['revoked_at'])

    def test_inert_cli_and_request_allowlist(self):
        with self.assertRaises(s['Stop']):
            s['api']('key',{'A':'jwt-a','B':'jwt-b'},'B','DELETE','/rest/v1/dogs?id=eq.'+s['DOG'])
        with self.assertRaises(s['Stop']):
            s['api']('key',{'A':'jwt-a','B':'jwt-b'},'A','POST',s['GRANTS'],{'id':s['GRANT'],'can_view_emergency_info':True})
        with self.assertRaises(s['Stop']):
            s['api']('key',{'A':'jwt-a','B':'jwt-b'},'A','POST',s['STORAGE'],b'not png')

    def test_grant_expansion_blocked_before_network(self):
        ns=s['api'].__globals__
        now=dt.datetime.now(dt.timezone.utc)
        body={'id':s['GRANT'],'owner_id':s['A'],'dog_id':s['DOG'],
              'connection_id':'connection','grantee_user_id':s['B'],'role_preset':'custom',
              'starts_at':s['iso'](now-dt.timedelta(seconds=5)),
              'expires_at':s['iso'](now+dt.timedelta(minutes=4)),
              **{p:p in s['PERMS'] for p in s['ALL_FLAGS']}}
        with patch.dict(ns,{'CONNECTION_ID':'connection'}),patch.object(ns['http'].client,'HTTPSConnection',side_effect=AssertionError('network')):
            with self.assertRaisesRegex(AssertionError,'network'):
                s['api']('key',{'A':'jwt-a'},'A','POST',s['GRANTS'],body)
            for changed in [{**body,'can_view_health_summary':True},
                            {**body,'can_edit_health':True},
                            {**body,'expires_at':s['iso'](now+dt.timedelta(minutes=6))},
                            {**body,'grantee_user_id':s['A']}]:
                with self.subTest(changed=changed),self.assertRaises(s['Stop']):
                    s['api']('key',{'A':'jwt-a'},'A','POST',s['GRANTS'],changed)
            with self.assertRaises(s['Stop']):
                s['api']('key',{'A':'jwt-a'},'A','POST',s['GRANTS'],{**body,'connection_id':'other'})

    def test_preflight_receipt_guard_before_credentials(self):
        with tempfile.TemporaryDirectory() as folder:
            receipt=Path(folder)/'receipt.json'
            receipt.write_text(json.dumps({'code':'PASS_T115_STAGE_B_NORMAL_JWT_OWNER_RECIPIENT_ISOLATION',
                                           'runner_sha256':'wrong'}))
            with self.assertRaises(s['Stop']) as cm:
                s['run'](receipt,receipt)
            self.assertIn('STAGE_B_PASS_RECEIPT_REQUIRED',str(cm.exception))

    def test_probe_cleanup_exact_scope(self):
        table='dog_health_vaccinations'; item_id=s['PROBES'][table]
        expected={**next(iter(s['ROWS'][table].values())),'id':item_id}
        state={'row':expected,'delete':0}
        def fake_api(*args,**kwargs):
            method=args[3]
            if method=='GET': return 200,[state['row']] if state['row'] else []
            state['delete']+=1;state['row']=None;return 200,[expected]
        with patch.dict(s['cleanup_probe'].__globals__,{'api':fake_api}):
            s['cleanup_probe']('key',{'A':'jwt'},table,item_id)
            self.assertEqual(state['delete'],1)
            state['row']={**expected,'owner_id':'foreign'}
            with self.assertRaises(s['Stop']): s['cleanup_probe']('key',{'A':'jwt'},table,item_id)
            self.assertEqual(state['delete'],1)

    def test_grant_readback_rejects_widened_permission(self):
        now=dt.datetime.now(dt.timezone.utc)
        grant={'id':s['GRANT'],'owner_id':s['A'],'dog_id':s['DOG'],
               'grantee_user_id':s['B'],'connection_id':'connection','role_preset':'custom',
               'revoked_at':None,'starts_at':s['iso'](now-dt.timedelta(seconds=5)),
               'expires_at':s['iso'](now+dt.timedelta(minutes=4)),
               **{p:p in s['PERMS'] for p in s['ALL_FLAGS']}}
        with patch.dict(s['verify_active_grant'].__globals__,{'api':lambda *_:(200,[grant])}):
            s['verify_active_grant']('key',{'A':'jwt'},'connection',now+dt.timedelta(minutes=5))
            grant['can_view_emergency_info']=True
            with self.assertRaises(s['Stop']):
                s['verify_active_grant']('key',{'A':'jwt'},'connection',now+dt.timedelta(minutes=5))

    def test_stale_stage_b_receipt_before_key(self):
        clock=dt.datetime(2026,11,2,13,0,tzinfo=dt.timezone.utc)
        receipt={'code':'PASS_T115_STAGE_B_NORMAL_JWT_OWNER_RECIPIENT_ISOLATION',
                 'runner_sha256':'75e79c0453814a54be7e37e2af193bc1ed498d1fe8747e0bce46d74f55b4566f',
                 'phase':'complete','cleanup':{'grant':'revoked_or_absent','row':'deleted_or_absent'},
                 'row_id':'7a01474c-6508-41ae-921f-cb20b4b63db5',
                 'grant_id':'24dcf4f1-4a9a-42e3-96b8-164db69d2773',
                 'finished_at_utc':'2026-11-02T11:00:00Z'}
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'receipt.json';path.write_text(json.dumps(receipt))
            with patch.dict(s['run'].__globals__,{'now':lambda:clock}):
                with self.assertRaises(s['Stop']) as cm: s['run'](path,path)
            self.assertIn('STAGE_B_RECEIPT_STALE',str(cm.exception))

if __name__=='__main__': unittest.main()

class ActualTimestampRegression(unittest.TestCase):
 def setUp(self):
  self.s=runpy.run_path(str(Path(__file__).with_name('t115-sections-storage-diagnostics-01.py')))
  self.table='dog_vet_appointments';self.item='7da2a0ae-e593-4f3c-aee1-cc064f184ce4'
  self.actual={**self.s['ROWS'][self.table][self.item],'appointment_at':'2026-11-02T15:00:00+00:00'}
 def test_normalized_timestamp_readback_and_cleanup_delete_only_fixed_row(self):
  s=self.s;data=[self.actual];calls=[]
  def rows(*args):return data.copy()
  def api(*args):calls.append((args[2],args[3],args[4]));data.clear();return 200,[]
  with patch.dict(s['r']['exact_row'].__globals__,{'rows':rows}),patch.dict(s['r'],{'rows':rows}),patch.dict(s['cleanup_row'].__globals__,{'api':api}):
   self.assertEqual(s['fixed_row']('k',{'A':'jwt'},self.table,self.item),[self.actual])
   s['cleanup_row']('k',{'A':'jwt'},self.table,self.item)
  self.assertEqual(calls,[('A','DELETE','/rest/v1/dog_vet_appointments?id=eq.'+self.item)])
 def test_changed_identity_time_or_content_never_deletes(self):
  for field,value in [('id','foreign'),('owner_id','foreign'),('dog_id','foreign'),('reason','changed'),('status','scheduled'),('appointment_at','2026-11-02T15:00:01+00:00'),('appointment_at','2026-11-02T15:00:00')]:
   s=self.s;calls=[];row={**self.actual,field:value}
   with patch.dict(s['r'],{'rows':lambda *a:[row]}),patch.dict(s['cleanup_row'].__globals__,{'api':lambda *a:calls.append(a)}):
    with self.assertRaises(Exception):s['cleanup_row']('k',{'A':'jwt'},self.table,self.item)
   self.assertFalse(calls)

class SafeInsertFailureMetadata(unittest.TestCase):
 exercise=CoordinatorGuards.exercise
 def test_failed_fixture_status_is_bounded_and_body_is_not_logged(self):
  state,code,error=self.exercise('post_http_403')
  self.assertIsNotNone(error)
  metadata=state['safe_failure_metadata']
  self.assertEqual(metadata['http_status'],403);self.assertEqual(metadata['safe_database_error_code'],'42501')
  self.assertNotIn('PRIVATE_DO_NOT_LOG',json.dumps(metadata));self.assertFalse(state['rows'])

class SectionsOverallDeadline(unittest.TestCase):
 exercise=CoordinatorGuards.exercise
 def test_shared_deadline_shortens_sections_without_extending_its_phase_limit(self):
  state,_,err=self.exercise(deadline=123);self.assertIsNone(err);self.assertEqual(state['effective_deadline'],123)
  state,_,err=self.exercise(deadline=2000);self.assertIsNone(err);self.assertEqual(state['effective_deadline'],901)
 def test_expired_shared_deadline_stops_before_any_network_write(self):
  state=runpy.run_path(str(Path(__file__).with_name('t115-sections-storage-diagnostics-01.py')));ns=state['api'].__globals__
  table=next(iter(state['ROWS']));body=next(iter(state['ROWS'][table].values()))
  with patch.dict(ns,{'DEADLINE':90,'CLEANUP_MODE':False}),patch.object(ns['time'],'monotonic',return_value=100),patch('http.client.HTTPSConnection')as network:
   with self.assertRaisesRegex(state['Stop'],'TOTAL_15_MINUTE_DEADLINE'):state['api']('fake',{'A':'fake'},'A','POST','/rest/v1/'+table,body)
   network.assert_not_called()


class StorageFailureRegression(unittest.TestCase):
    exercise=CoordinatorGuards.exercise
    def test_storage_cleanup_failure_keeps_exact_metadata(self):
        state,_,error=self.exercise('storage_cleanup')
        self.assertIn('UNCERTAIN',str(error))
        self.assertTrue(state['storage'])
        self.assertEqual(set(state['rows']),{('dog_documents',s['DOC'] if 'DOC' in s else s['r']['DOC'])})
        self.assertIsNotNone(state['grant']['revoked_at'])
    def test_untrusted_failure_text_is_redacted(self):
        self.assertEqual(s['bounded_primary'](RuntimeError('SECRET')), 'UNEXPECTED_LOCAL_TEST_ERROR')
        self.assertEqual(s['bounded_primary'](s['Stop']('SECRET')), 'UNEXPECTED_LOCAL_TEST_ERROR')
        self.assertEqual(s['bounded_primary'](s['Stop']('RECIPIENT_STORAGE_DELETE_NOT_DENIED')), 'RECIPIENT_STORAGE_DELETE_NOT_DENIED')


class PrimaryFailureRegression(unittest.TestCase):
    exercise=CoordinatorGuards.exercise
    def test_primary_negative_failure_survives_cleanup_failure(self):
        state,_,error=self.exercise('storage_cleanup_primary')
        self.assertIn('UNCERTAIN',str(error))
        self.assertEqual(state['primary_failure'],'RECIPIENT_STORAGE_DELETE_NOT_DENIED')
        self.assertTrue(state['rows']);self.assertTrue(state['storage'])


class StorageWireHeaders(unittest.TestCase):
    def test_bodyless_delete_omits_json_content_type(self):
        captured={}
        class Response:
            status=200
            def read(self,_):return b'{}'
        class Connection:
            def __init__(self,*a,**k):pass
            def request(self,method,path,body=None,headers=None):captured.update(method=method,path=path,body=body,headers=headers)
            def getresponse(self):return Response()
            def close(self):pass
        with patch.object(s['http'].client,'HTTPSConnection',Connection):
            s['api']('testkey',{'A':'testjwt'},'A','DELETE',s['STORAGE'])
        self.assertIsNone(captured['body']);self.assertNotIn('Content-Type',captured['headers'])
        self.assertEqual(captured['headers']['Authorization'],'Bearer testjwt')

    def test_png_update_retains_content_type_and_exact_bytes(self):
        captured={}
        class Response:
            status=403
            def read(self,_):return b'{}'
        class Connection:
            def __init__(self,*a,**k):pass
            def request(self,method,path,body=None,headers=None):captured.update(body=body,headers=headers)
            def getresponse(self):return Response()
            def close(self):pass
        png=s['PNG_PATH'].read_bytes()
        with patch.object(s['http'].client,'HTTPSConnection',Connection):s['api']('testkey',{'B':'testjwt'},'B','PUT',s['STORAGE'],png)
        self.assertEqual(captured['body'],png);self.assertEqual(captured['headers']['Content-Type'],'image/png')
