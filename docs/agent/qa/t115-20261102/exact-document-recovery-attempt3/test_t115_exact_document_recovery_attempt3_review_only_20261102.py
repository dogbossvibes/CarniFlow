#!/usr/bin/env python3
"""Offline safety tests for the inert T115 metadata-only recovery."""
import contextlib
import csv
import datetime as dt
import hashlib
import io
import json
from pathlib import Path
import runpy
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

SOURCE = Path(__file__).with_name('t115-exact-document-recovery-attempt3-review-only-20261102.py')
M = runpy.run_path(str(SOURCE))
G = M['request'].__globals__


class FakeResponse:
    status = 204

    def read(self, _max):
        return b''


class FakeConnection:
    latest = None

    def __init__(self, *args, **kwargs):
        self.calls = []
        FakeConnection.latest = self

    def request(self, *args, **kwargs):
        self.calls.append((args, kwargs))

    def getresponse(self):
        return FakeResponse()

    def close(self):
        pass


class RecoverySafetyTest(unittest.TestCase):
    def receipt(self, count_doc='1', count_file='0', age=0):
        now = dt.datetime.now(dt.timezone.utc) - dt.timedelta(seconds=age)
        checked = now.strftime('%Y-%m-%d %H:%M:%S.%f')
        raw = ('checked_at_utc,exact_document_row_count,exact_document_identity_ok,exact_storage_object_count\n'
               f'{checked},{count_doc},true,{count_file}\n').encode()
        root = Path(self.temp.name)
        csv_path = root / 'result.csv'
        csv_path.write_bytes(raw)
        payload = {
            'result': 'PASS_EXACT_SYNTHETIC_DOCUMENT_RECOVERY_PREFLIGHT',
            'project': M['PROJECT'], 'bucket': M['BUCKET'],
            'path': M['FILE_PATH'], 'document_id': M['DOC_ID'],
            'checked_at_utc': checked.replace(' ', 'T') + 'Z',
            'csv_path': str(csv_path),
            'csv_sha256': hashlib.sha256(raw).hexdigest(),
            'query_sha256': M['SQL_SHA'],
            'source_sql_editor_url': f'https://supabase.com/dashboard/project/{M["PROJECT"]}/sql/test',
        }
        json_path = root / 'receipt.json'
        json_path.write_text(json.dumps(payload))
        return json_path

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.paths = patch.dict(G, {'PREFLIGHT_RECEIPT': root / 'receipt.json',
                                    'PREFLIGHT_CSV': root / 'result.csv'})
        self.paths.start()

    def tearDown(self):
        self.paths.stop()
        self.temp.cleanup()

    def test_inert_default(self):
        with contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(M['main']([]), 2)
        self.assertIn('STOP_REVIEW_ONLY_NO_EXECUTION', output.getvalue())

    def test_pinned_sources_and_fixture(self):
        M['sources_and_date']()
        self.assertEqual(M['fixture']()['id'], M['DOC_ID'])
        self.assertEqual(M['fixture']()['file_url'], M['FILE_PATH'])

    def test_fresh_exact_doc_one_file_zero(self):
        receipt = self.receipt()
        self.assertEqual(M['preflight'](receipt), hashlib.sha256(
            receipt.read_bytes()).hexdigest())

    def test_rejects_wrong_exact_counts(self):
        for docs, files in [('0', '0'), ('1', '1'), ('2', '0')]:
            with self.subTest(docs=docs, files=files):
                with self.assertRaises(M['Stop']):
                    M['preflight'](self.receipt(docs, files))

    def test_rejects_expired_receipt(self):
        with self.assertRaises(M['Stop']):
            M['preflight'](self.receipt(age=301))

    def test_rejects_identity_mismatch(self):
        path = self.receipt()
        data = json.loads(path.read_text())
        csv_path = Path(data['csv_path'])
        raw = csv_path.read_bytes().replace(b',true,', b',false,')
        csv_path.write_bytes(raw)
        data['csv_sha256'] = hashlib.sha256(raw).hexdigest()
        path.write_text(json.dumps(data))
        with self.assertRaises(M['Stop']):
            M['preflight'](path)

    def test_rejects_changed_fixture_row(self):
        original = M['fixture']()
        changed = dict(original, title='other document')
        with patch.dict(G, {'request': lambda *_: (200, [changed])}):
            with self.assertRaises(M['Stop']):
                M['exact_document']('key', 'token')

    def test_request_allowlist_excludes_storage_and_insert(self):
        for method, path in [('DELETE', '/storage/v1/object/dog-documents'),
                             ('POST', '/rest/v1/dog_documents'),
                             ('DELETE', '/rest/v1/dog_documents')]:
            with self.subTest(method=method, path=path):
                with self.assertRaises(M['Stop']):
                    M['request']('key', 'token', method, path)

    def test_exact_delete_has_no_body_or_json_header(self):
        with patch.dict(G, {'http': type('H', (), {'client': type('C', (), {
                'HTTPSConnection': FakeConnection})})}):
            status, data = M['request']('key', 'token', 'DELETE', M['DOC_DELETE'])
        self.assertEqual((status, data), (204, None))
        args, kwargs = FakeConnection.latest.calls[0]
        self.assertEqual(args, ('DELETE', M['DOC_DELETE']))
        self.assertNotIn('body', kwargs)
        self.assertNotIn('Content-Type', kwargs['headers'])

    def test_preexisting_result_stops_before_login_and_nonce(self):
        result = Path(self.temp.name) / 'old-result.json'
        result.write_text('{}')
        nonce = Path(self.temp.name) / 'nonce.json'
        sha = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
        fake_tty = SimpleNamespace(isatty=lambda: True)
        with patch.dict(G, {'RESULT': result, 'NONCE': nonce,
                            'sources_and_date': lambda: None,
                            'fixture': lambda: {}, 'preflight': lambda _p: 'abc',
                            'owner_login': lambda _k: self.fail('login must not run')}), \
                patch('sys.stdin', fake_tty), patch('sys.stderr', fake_tty), \
                contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(M['main'](['--execute-approved', '--preflight', 'x',
                                        '--expected-sha256', sha]), 2)
        self.assertIn('STOP_RESULT_ALREADY_EXISTS', output.getvalue())
        self.assertFalse(nonce.exists())

    def test_deadline_blocks_all_network_requests(self):
        with patch.dict(G, {'DEADLINE': 0}):
            with self.assertRaises(M['Stop']):
                M['request']('key', 'token', 'GET', M['DOC_READ'])


if __name__ == '__main__':
    unittest.main()
