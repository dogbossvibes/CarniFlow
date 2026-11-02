#!/usr/bin/env python3
"""Offline safety tests. Never contacts Supabase or asks for a real key."""
import base64
import contextlib
import hashlib
import io
import json
import os
import http.client
from pathlib import Path
import runpy
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).with_name('t115-r4-b-admin-password-update-review-only-20261102.py')
M = runpy.run_path(str(SOURCE))
G = M['run'].__globals__


class PasswordUpdateSafetyTest(unittest.TestCase):
    USER = {'id': M['UID'], 'email': M['EMAIL'],
            'email_confirmed_at': '2026-10-18T00:00:00Z',
            'app_metadata': {'provider': 'email', 'providers': ['email']}}
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.nonce, self.result = root / 'nonce.json', root / 'result.json'
        self.paths = patch.dict(G, {'NONCE': self.nonce, 'RESULT': self.result})
        self.paths.start()

    def tearDown(self):
        self.paths.stop()
        self.temp.cleanup()

    def test_inert_default(self):
        with contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(M['main']([]), 2)
        self.assertIn('STOP_REVIEW_ONLY_NO_EXECUTION', output.getvalue())
        self.assertFalse(self.nonce.exists())

    def test_pinned_sources_and_identity(self):
        M['sources']()
        self.assertEqual(M['UID'], M['CORE']['USERS'][1][2])
        self.assertEqual(M['EMAIL'], M['CORE']['USERS'][1][1])

    def test_admin_key_format_accepts_only_secret_or_correct_role_and_project(self):
        def jwt(role, ref):
            payload = base64.urlsafe_b64encode(json.dumps({'role': role, 'ref': ref}).encode()).decode().rstrip('=')
            return 'eyJhbGciOiJIUzI1NiJ9.' + payload + '.signature'
        self.assertTrue(M['admin_key_format']('sb_secret_' + 'x' * 25))
        self.assertTrue(M['admin_key_format'](jwt('service_role', M['PROJECT'])))
        self.assertFalse(M['admin_key_format'](jwt('anon', M['PROJECT'])))
        self.assertFalse(M['admin_key_format'](jwt('service_role', 'other-project')))
        self.assertFalse(M['admin_key_format']('sb_publishable_' + 'x' * 25))

    def test_admin_account_mismatch_blocks_update(self):
        base = self.USER
        M['check_admin_user'](base)
        for altered in [dict(base, id='wrong'), dict(base, email='wrong'),
                        dict(base, email_confirmed_at=None), dict(base, is_sso_user=True),
                        dict(base, deleted_at='2026-11-02T00:00:00Z'),
                        dict(base, banned_until='9999-01-01T00:00:00Z'),
                        dict(base, app_metadata={'provider': 'google', 'providers': ['google']})]:
            with self.subTest(altered=altered):
                with self.assertRaises(M['Stop']):
                    M['check_admin_user'](altered)

    def test_request_rejects_other_accounts_or_fields_before_network(self):
        with self.assertRaises(M['Stop']):
            M['request']('PUT', '/auth/v1/admin/users/other', 'secret', {'password': 'example'})
        with self.assertRaises(M['Stop']):
            M['request']('PUT', M['ADMIN_PATH'], 'secret', {'password': 'example', 'role': 'admin'})
        with self.assertRaises(M['Stop']):
            M['request']('POST', M['TOKEN_PATH'], 'secret', {'email': 'other', 'password': 'example'})

    def test_password_mismatch_stops_before_nonce_or_put(self):
        answers = iter(['sb_secret_' + 'x' * 25, 'first-password-123', 'second-password-123'])
        calls = []
        user = self.USER
        with patch.dict(G, {'sources': lambda: None,
                            'KEY': {'verified_public_key': lambda: 'public'},
                            'CORE': {'public_key_ok': lambda _: True},
                            'hidden': lambda _: next(answers),
                            'request': lambda *a, **k: (calls.append((a, k)) or (200, user))}):
            with self.assertRaises(M['Stop']) as caught:
                M['run'](hashlib.sha256(SOURCE.read_bytes()).hexdigest())
        self.assertEqual(str(caught.exception), 'PASSWORD_MISMATCH')
        self.assertEqual([x[0][0] for x in calls], ['GET'])
        self.assertFalse(self.nonce.exists())

    def test_success_changes_only_password_once_and_writes_no_secret(self):
        secret = 'sb_secret_' + 's' * 25
        password = 'neues-Pässwort-123!'
        answers = iter([secret, password, password])
        calls = []
        user = self.USER
        def fake_request(*args, **kwargs):
            calls.append((args, kwargs))
            method, path = args[:2]
            if (method, path) == ('GET', M['ADMIN_PATH']):
                return 200, user
            if (method, path) == ('PUT', M['ADMIN_PATH']):
                self.assertEqual(args[3], {'password': password})
                self.assertTrue(self.nonce.exists())
                return 200, user
            if (method, path) == ('POST', M['TOKEN_PATH']):
                return 200, {'access_token': 'synthetic-token'}
            if (method, path) == ('GET', M['USER_PATH']):
                return 200, {'id': M['UID'], 'email': M['EMAIL']}
            self.fail('unexpected request')
        with patch.dict(G, {'sources': lambda: None,
                            'KEY': {'verified_public_key': lambda: 'public'},
                            'CORE': {'public_key_ok': lambda _: True},
                            'hidden': lambda _: next(answers),
                            'request': fake_request}), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(M['run'](hashlib.sha256(SOURCE.read_bytes()).hexdigest()), 0)
        self.assertEqual([(a[0], a[1]) for a, _ in calls],
                         [('GET', M['ADMIN_PATH']), ('GET', M['ADMIN_PATH']),
                          ('PUT', M['ADMIN_PATH']),
                          ('POST', M['TOKEN_PATH']), ('GET', M['USER_PATH'])])
        self.assertTrue(self.result.exists())
        for path in [self.nonce, self.result]:
            content = path.read_text()
            self.assertNotIn(secret, content)
            self.assertNotIn(password, content)
            self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)

    def test_admin_read_rejection_stops_before_password_prompt(self):
        answers = iter(['sb_secret_' + 's' * 25])
        with patch.dict(G, {'sources': lambda: None,
                            'KEY': {'verified_public_key': lambda: 'public'},
                            'CORE': {'public_key_ok': lambda _: True},
                            'hidden': lambda _: next(answers),
                            'request': lambda *_a, **_k: (401, None)}):
            with self.assertRaises(M['Stop']) as caught:
                M['run'](hashlib.sha256(SOURCE.read_bytes()).hexdigest())
        self.assertEqual(str(caught.exception), 'ADMIN_READ_REJECTED')
        self.assertFalse(self.nonce.exists())

    def test_one_shot_nonce_blocks_restart(self):
        self.nonce.write_text('{}')
        with self.assertRaises(M['Stop']) as caught:
            M['run'](hashlib.sha256(SOURCE.read_bytes()).hexdigest())
        self.assertEqual(str(caught.exception), 'ONE_SHOT_ALREADY_USED')

    def test_foreign_key_helper_stop_is_bounded_before_prompt(self):
        class ForeignStop(Exception):
            pass
        def unavailable():
            raise ForeignStop('do not echo this')
        with patch.dict(G, {'sources': lambda: None,
                            'KEY': {'Stop': ForeignStop,
                                    'verified_public_key': unavailable},
                            'hidden': lambda _: self.fail('no prompt allowed')}):
            with self.assertRaises(M['Stop']) as caught:
                M['run'](hashlib.sha256(SOURCE.read_bytes()).hexdigest())
        self.assertEqual(str(caught.exception), 'PUBLIC_KEY_UNAVAILABLE')
        self.assertFalse(self.nonce.exists())

    def test_wire_headers_keep_admin_key_out_of_normal_login(self):
        observed = []
        class Response:
            status = 200
            def read(self, _n):
                return b'{}'
        class Connection:
            def __init__(self, *_a, **_k):
                pass
            def request(self, method, path, body=None, headers=None):
                observed.append((method, path, body, headers))
            def getresponse(self):
                return Response()
            def close(self):
                pass
        secret = 'sb_secret_' + 'x' * 25
        with patch.object(http.client, 'HTTPSConnection', Connection):
            M['request']('GET', M['ADMIN_PATH'], secret)
            M['request']('PUT', M['ADMIN_PATH'], secret, {'password': 'synthetic-password'})
            M['request']('POST', M['TOKEN_PATH'], secret,
                         {'email': M['EMAIL'], 'password': 'synthetic-password'},
                         public_key='sb_publishable_public')
            M['request']('GET', M['USER_PATH'], secret,
                         user_token='synthetic-user-token', public_key='sb_publishable_public')
        self.assertEqual(len(observed), 4)
        for method, path, _body, headers in observed[:2]:
            self.assertEqual(path, M['ADMIN_PATH'])
            self.assertEqual(headers['apikey'], secret)
            self.assertNotIn('Authorization', headers)
        for _method, _path, _body, headers in observed[2:]:
            self.assertEqual(headers['apikey'], 'sb_publishable_public')
            self.assertNotIn(secret, json.dumps(headers))
        self.assertEqual(observed[1][2], '{"password":"synthetic-password"}')
        self.assertNotIn('Authorization', observed[2][3])
        self.assertEqual(observed[3][3]['Authorization'], 'Bearer synthetic-user-token')

    def test_legacy_service_role_uses_bearer_only_on_admin_request(self):
        headers_seen = []
        class Response:
            status = 200
            def read(self, _n):
                return b'{}'
        class Connection:
            def __init__(self, *_a, **_k):
                pass
            def request(self, _method, _path, body=None, headers=None):
                headers_seen.append(headers)
            def getresponse(self):
                return Response()
            def close(self):
                pass
        with patch.object(http.client, 'HTTPSConnection', Connection):
            M['request']('GET', M['ADMIN_PATH'], 'synthetic-service-role')
        self.assertEqual(headers_seen[0]['Authorization'], 'Bearer synthetic-service-role')
        self.assertEqual(headers_seen[0]['apikey'], 'synthetic-service-role')


if __name__ == '__main__':
    unittest.main()
