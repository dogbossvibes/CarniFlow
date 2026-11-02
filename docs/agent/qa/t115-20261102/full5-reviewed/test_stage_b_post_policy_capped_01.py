import datetime as dt
from pathlib import Path
import runpy
import unittest
from unittest.mock import patch

s = runpy.run_path(str(Path(__file__).with_name('t115-stage-b-post-policy-capped-01.py')))


class StageBGuards(unittest.TestCase):
    def exercise_flow(self, fail_at=None, fail_cleanup=None, collision=False):
        ns = s['run'].__globals__
        state = {'row': collision, 'grant': False, 'revoke_calls': 0, 'delete_calls': 0,
                 'insert_calls': 0, 'grant_calls': 0}
        clock = dt.datetime(2026, 11, 2, 13, 0, tzinfo=dt.timezone.utc)
        def owner_row(*_):
            return [{'id': s['ROW'], 'owner_id': s['OWNER'], 'dog_id': s['DOG'],
                     'note': s['NOTE'] if not state['grant'] else s['NOTE'] + ' owner updated'}] if state['row'] else []
        def rows(_, __, ___, path):
            if path == s['GRANT_READ']:
                return [{'id': s['GRANT']}] if state['grant'] else []
            if path == s['DOG_OWNER_A']:
                return [{'id': s['DOG'], 'owner_id': s['OWNER']}]
            if path == s['DOG_OWNER_B']:
                return []
            if path == s['CONNECTION']:
                return [{'id': 'connection', 'owner_user_id': s['OWNER'], 'connected_user_id': s['RECIPIENT'], 'status': 'accepted'}]
            return []
        def api(_, __, ___, method, path, body=None):
            if method == 'POST' and path == s['TABLE']:
                state['insert_calls'] += 1
                state['row'] = True
                if fail_at == 'row_insert': raise TimeoutError('synthetic lost response')
                return 201, [{'id': s['ROW']}]
            if method == 'POST' and path == s['GRANTS']:
                state['grant_calls'] += 1
                state['grant'] = True
                if fail_at == 'grant_insert': raise TimeoutError('synthetic lost response')
                return 201, [{'id': s['GRANT']}]
            if method == 'PATCH' and path == s['ROW_WRITE']:
                return 200, [{'id': s['ROW']}]
            return 403, None
        def recipient_rpc(*args):
            if fail_at == 'active_check' and args[-1] == 1:
                raise s['Stop']('SYNTHETIC_ACTIVE_FAIL')
        def revoke(*_):
            state['revoke_calls'] += 1
            if fail_cleanup == 'grant': raise TimeoutError('synthetic revoke fail')
            state['grant'] = False
        def delete(*_):
            state['delete_calls'] += 1
            if fail_cleanup == 'row': raise TimeoutError('synthetic row fail')
            state['row'] = False
        grant = {'id': s['GRANT'], 'dog_id': s['DOG'], 'owner_id': s['OWNER'],
                 'grantee_user_id': s['RECIPIENT'], 'connection_id': 'connection',
                 'revoked_at': None, 'starts_at': s['iso'](clock - dt.timedelta(seconds=5)),
                 'expires_at': s['iso'](clock + dt.timedelta(seconds=120)),
                 **{p: p == 'can_view_weight' for p in s['PERMISSIONS']}}
        patches = {'now': lambda: clock, 'owner_row': owner_row, 'rows': rows, 'api': api,
                   'recipient_rpc': recipient_rpc, 'recipient_inbox': lambda *_: None,
                   'recipient_direct_empty': lambda *_: None, 'grant_read': lambda *_: grant,
                   'revoke_exact': revoke, 'delete_exact_synthetic_row': delete}
        with patch.dict(s['core'], {'public_key_ok': lambda _: True}), patch.dict(ns, patches):
            try:
                result = s['run'](key='public-test', tokens={'A': 'jwt-a', 'B': 'jwt-b'})
                error = None
            except BaseException as exc:
                result, error = None, exc
        return state, result, error

    def test_complete_mocked_flow_and_cleanup(self):
        state, result, error = self.exercise_flow()
        self.assertIsNone(error)
        self.assertEqual(result, 'PASS_T115_STAGE_B_NORMAL_JWT_OWNER_RECIPIENT_ISOLATION')
        self.assertEqual((state['insert_calls'], state['grant_calls']), (1, 1))
        self.assertFalse(state['row'])
        self.assertFalse(state['grant'])

    def test_failure_injection_keeps_cleanup_independent(self):
        for phase, expected_grant in [('row_insert', 0), ('grant_insert', 1), ('active_check', 1)]:
            with self.subTest(phase=phase):
                state, _, error = self.exercise_flow(fail_at=phase)
                self.assertIsNotNone(error)
                self.assertEqual(state['grant_calls'], expected_grant)
                self.assertFalse(state['row'])
                self.assertFalse(state['grant'])
        for failed_cleanup in ['grant', 'row']:
            with self.subTest(cleanup=failed_cleanup):
                state, _, error = self.exercise_flow(fail_at='active_check', fail_cleanup=failed_cleanup)
                self.assertIsNotNone(error)
                self.assertEqual(state['revoke_calls'], 1)
                self.assertEqual(state['delete_calls'], 1)
                self.assertIn('UNCERTAIN', str(error))
        state, _, error = self.exercise_flow(collision=True)
        self.assertIn('FIXED_ID_COLLISION', str(error))
        self.assertEqual((state['insert_calls'], state['grant_calls'], state['delete_calls']), (0, 0, 0))

    def test_exact_request_allowlist(self):
        self.assertNotIn(('B', 'POST', s['RPC']), s['ALLOWED'])
        self.assertIn(('B', 'GET', s['INBOX']), s['ALLOWED'])
        self.assertFalse(s['exact_body']('B', 'POST', s['RPC'], {}))
        self.assertFalse(s['exact_body']('A', 'DELETE', s['ROW_WRITE'], {'anything': True}))

    def test_grant_scope_and_expiry(self):
        now = dt.datetime.now(dt.timezone.utc)
        body = {'id': s['GRANT'], 'owner_id': s['OWNER'], 'dog_id': s['DOG'],
                'connection_id': '6b3b3bb7-0b44-4e44-b644-c75468ab0bb0',
                'grantee_user_id': s['RECIPIENT'], 'role_preset': 'custom',
                'starts_at': s['iso'](now - dt.timedelta(seconds=5)),
                'expires_at': s['iso'](now + dt.timedelta(minutes=2)),
                **{p: p == 'can_view_weight' for p in s['PERMISSIONS']}}
        self.assertTrue(s['exact_body']('A', 'POST', s['GRANTS'], body))
        self.assertFalse(s['exact_body']('A', 'POST', s['GRANTS'], {**body, 'can_view_health_summary': True}))
        self.assertFalse(s['exact_body']('A', 'POST', s['GRANTS'], {**body, 'expires_at': s['iso'](now + dt.timedelta(minutes=6))}))
        self.assertFalse(s['exact_body']('A', 'POST', s['GRANTS'], {**body, 'grantee_user_id': s['OWNER']}))

    def test_inbox_exact_dto(self):
        now = dt.datetime.now(dt.timezone.utc)
        row = {'grant_id': s['GRANT'], 'dog_id': s['DOG'], 'dog_name': 'QA Dog',
               'owner_display_name': None, 'starts_at': s['iso'](now - dt.timedelta(seconds=5)),
               'expires_at': s['iso'](now + dt.timedelta(minutes=2)),
               'permissions': ['can_view_weight']}
        with patch.dict(s['recipient_inbox'].__globals__, {'rows': lambda *_: [row]}):
            s['recipient_inbox']('public-key', {'B': 'jwt'}, 1)
            with self.assertRaises(s['Stop']):
                s['recipient_inbox'].__globals__['rows'] = lambda *_: [{**row, 'permissions': ['can_view_weight', 'can_view_health_summary']}]
                s['recipient_inbox']('public-key', {'B': 'jwt'}, 1)

    def test_synthetic_row_cleanup_scope_and_readback(self):
        row = {'id': s['ROW'], 'owner_id': s['OWNER'], 'dog_id': s['DOG'],
               'entry_date': s['DATE'], 'weight_kg': 21.4, 'note': s['NOTE'],
               'load_level': None, 'is_rest_day': False, 'is_intense': False}
        state = {'row': row, 'deletes': 0}
        def owner_row(*_):
            return [state['row']] if state['row'] else []
        def api(*_):
            state['deletes'] += 1
            state['row'] = None
            return 200, [row]
        with patch.dict(s['delete_exact_synthetic_row'].__globals__, {'owner_row': owner_row, 'api': api}):
            s['delete_exact_synthetic_row']('key', {'A': 'jwt'})
            self.assertEqual(state['deletes'], 1)
            state['row'] = {**row, 'note': 'someone else'}
            with self.assertRaises(s['Stop']):
                s['delete_exact_synthetic_row']('key', {'A': 'jwt'})
            self.assertEqual(state['deletes'], 1)
            state['row'] = {**row, 'note': s['NOTE']}
            def uncertain_api(*_):
                raise TimeoutError('lost response')
            s['delete_exact_synthetic_row'].__globals__['api'] = uncertain_api
            with self.assertRaises(s['Stop']):
                s['delete_exact_synthetic_row']('key', {'A': 'jwt'})


if __name__ == '__main__':
    unittest.main()

class SharedDeadlineTests(unittest.TestCase):
 def cap_at_preflight(self, deadline):
  state=runpy.run_path(str(Path(__file__).with_name('t115-stage-b-post-policy-capped-01.py')));ns=state['run'].__globals__;seen=[]
  def only_probe(*args,**kwargs):
   seen.append(ns['_deadline']);raise state['Stop']('TEST_STOP_BEFORE_ANY_MUTATION')
  with patch.dict(state['core'],{'public_key_ok':lambda _:True}),patch.dict(ns,{'api':only_probe}),patch.object(ns['time'],'monotonic',return_value=100):
   with self.assertRaisesRegex(state['Stop'],'TEST_STOP_BEFORE_ANY_MUTATION'):state['run'](key='fake',tokens={'A':'fake','B':'fake'},deadline=deadline)
  return seen[0]
 def test_shared_deadline_shortens_phase(self):self.assertEqual(self.cap_at_preflight(120),120)
 def test_shared_deadline_never_extends_phase_beyond_ten_minutes(self):self.assertEqual(self.cap_at_preflight(2000),700)
 def test_expired_shared_deadline_stops_before_network_or_mutation(self):
  state=runpy.run_path(str(Path(__file__).with_name('t115-stage-b-post-policy-capped-01.py')));ns=state['run'].__globals__
  with patch.dict(state['core'],{'public_key_ok':lambda _:True}),patch.object(ns['time'],'monotonic',return_value=100),patch('http.client.HTTPSConnection')as network:
   with self.assertRaisesRegex(state['Stop'],'TOTAL_15_MINUTE_DEADLINE'):state['run'](key='fake',tokens={'A':'fake','B':'fake'},deadline=90)
   network.assert_not_called()
