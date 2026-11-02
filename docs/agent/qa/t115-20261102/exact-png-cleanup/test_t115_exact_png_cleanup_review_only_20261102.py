import hashlib
import datetime as dt
import json
from pathlib import Path
import runpy
import tempfile
import unittest
from unittest.mock import patch

P = Path(__file__).with_name('t115-exact-png-cleanup-review-only-20261102.py')
M = runpy.run_path(str(P))
fixture = M['fixture']()
png = P.with_name('t115-health-synthetic-1x1.png').read_bytes()


class Fake:
    def __init__(self, *, doc=False, file=True, delete_result=None):
        self.doc = doc
        self.file = file
        self.calls = []
        self.delete_result = delete_result

    def __call__(self, method, path, body=None, binary=False):
        self.calls.append((method, path, body))
        if (method, path) == ('GET', M['DOG_READ']):
            return 200, [{'id': M['DOG_ID'], 'owner_id': M['OWNER_ID']}]
        if (method, path) == ('GET', M['DOC_READ']):
            return 200, [fixture] if self.doc else []
        if (method, path) == ('POST', M['DOC_BASE']):
            assert not self.doc and body == fixture
            self.doc = True
            return 201, [fixture]
        if (method, path) == ('GET', M['FILE_READ']):
            return (200, png) if self.file else (404, b'')
        if (method, path) == ('DELETE', M['FILE_REMOVE']):
            assert body == {'prefixes': [M['PATH']]}
            if self.delete_result is not None:
                return self.delete_result
            self.file = False
            return 200, [{'name': M['PATH']}]
        if (method, path) == ('DELETE', M['DOC_DELETE']):
            assert self.doc
            self.doc = False
            return 200, [fixture]
        raise AssertionError((method, path))


class CleanupTests(unittest.TestCase):
    def test_fixture_and_bytes_bound(self):
        self.assertEqual(len(png), 68)
        self.assertEqual(hashlib.sha256(png).hexdigest(), M['PNG_SHA'])
        self.assertEqual(fixture['file_url'], M['PATH'])

    def test_no_flag_is_inert(self):
        self.assertEqual(M['main']([]), 2)

    def test_request_omits_json_content_type_without_body(self):
        class Conn:
            def __init__(self, *args, **kwargs): self.sent = []
            def request(self, method, path, body=None, headers=None): self.sent.append((method, path, body, headers))
            def getresponse(self):
                class Res:
                    status = 200
                    def read(self, limit): return b'[]'
                return Res()
            def close(self): pass
        conn = Conn()
        with patch.object(M['http'].client, 'HTTPSConnection', return_value=conn):
            M['request']('public-key', 'owner-jwt', 'DELETE', M['DOC_DELETE'])
            self.assertNotIn('Content-Type', conn.sent[0][3])
            M['request']('public-key', 'owner-jwt', 'DELETE', M['FILE_REMOVE'], {'prefixes': [M['PATH']]})
            self.assertEqual(conn.sent[1][3]['Content-Type'], 'application/json')

    def test_fresh_preflight_binds_actual_csv(self):
        with tempfile.TemporaryDirectory() as td:
            receipt, csv_path = Path(td) / 'preflight.json', Path(td) / 'preflight.csv'
            checked = dt.datetime.now(dt.timezone.utc).replace(microsecond=123456) - dt.timedelta(seconds=10)
            csv_path.write_text('checked_at_utc,exact_document_row_count,exact_storage_object_count,exact_size_bytes,exact_mimetype\n' + checked.strftime('%Y-%m-%d %H:%M:%S.%f') + ',0,1,68,image/png\n')
            data = {'result': 'PASS_EXACT_SYNTHETIC_PNG_CLEANUP_PREFLIGHT', 'project': M['HOST'].split('.')[0], 'bucket': M['BUCKET'], 'path': M['PATH'], 'png_sha256': M['PNG_SHA'], 'query_sha256': M['PREFLIGHT_SQL_SHA'], 'source_sql_editor_url': 'https://supabase.com/dashboard/project/axkkhyqrjrtbkumaulta/sql/test', 'csv_path': str(csv_path), 'csv_sha256': hashlib.sha256(csv_path.read_bytes()).hexdigest(), 'checked_at_utc': checked.isoformat()}
            receipt.write_text(json.dumps(data))
            self.assertEqual(M['validate_preflight'](receipt), hashlib.sha256(receipt.read_bytes()).hexdigest())
            data['checked_at_utc'] = (checked - dt.timedelta(minutes=10)).isoformat()
            receipt.write_text(json.dumps(data))
            with self.assertRaises(M['Stop']): M['validate_preflight'](receipt)

    def test_remove_only_exact_file_preserves_doc(self):
        fake = Fake()
        self.assertEqual(M['remove_stage'](fake), 'FILE_REMOVE_HTTP_VERIFIED_PENDING_INDEPENDENT_DB_POSTFLIGHT')
        self.assertTrue(fake.doc)
        self.assertFalse(fake.file)
        self.assertEqual([x for x in fake.calls if x[0] == 'DELETE'], [('DELETE', M['FILE_REMOVE'], {'prefixes': [M['PATH']]})])

    def test_bad_remove_response_keeps_doc(self):
        fake = Fake(delete_result=(200, [{'name': 'another-file.png'}]))
        with self.assertRaises(M['Stop']):
            M['remove_stage'](fake)
        self.assertTrue(fake.doc)

    def test_changed_png_blocks_remove(self):
        fake = Fake()
        original = fake.__call__
        def changed(method, path, body=None, binary=False):
            if (method, path) == ('GET', M['FILE_READ']):
                return 200, b'x' * 68
            return original(method, path, body, binary)
        with self.assertRaises(M['Stop']):
            M['remove_stage'](changed)
        self.assertFalse(any(method == 'DELETE' for method, _, _ in fake.calls))

    def test_metadata_requires_independent_zero_receipt(self):
        with tempfile.TemporaryDirectory() as td:
            a, b, c = Path(td) / 'remove.json', Path(td) / 'zero.json', Path(td) / 'zero.csv'
            checked = dt.datetime.now(dt.timezone.utc).replace(microsecond=0) - dt.timedelta(seconds=10)
            finished = checked - dt.timedelta(seconds=20)
            a.write_text(json.dumps({'result': 'FILE_REMOVE_HTTP_VERIFIED_PENDING_INDEPENDENT_DB_POSTFLIGHT', 'project': M['HOST'].split('.')[0], 'bucket': M['BUCKET'], 'path': M['PATH'], 'doc_id': M['DOC_ID'], 'script_sha256': hashlib.sha256(P.read_bytes()).hexdigest(), 'finished_at_utc': finished.isoformat()}))
            c.write_text('checked_at_utc,exact_storage_object_count\n' + checked.strftime('%Y-%m-%d %H:%M:%S') + ',0\n')
            row = {'result': 'PASS_EXACT_STORAGE_ZERO_INDEPENDENT_SQL', 'project': M['HOST'].split('.')[0], 'bucket': M['BUCKET'], 'path': M['PATH'], 'exact_storage_object_count': 1, 'checked_at_utc': checked.isoformat(), 'checked_at_utc_raw': checked.strftime('%Y-%m-%d %H:%M:%S'), 'csv_path': str(c), 'csv_sha256': hashlib.sha256(c.read_bytes()).hexdigest(), 'query_sha256': M['ZERO_SQL_SHA'], 'source_sql_editor_url': 'https://supabase.com/dashboard/project/axkkhyqrjrtbkumaulta/sql/test'}
            row['remove_receipt_sha256'] = hashlib.sha256(a.read_bytes()).hexdigest()
            b.write_text(json.dumps(row))
            with self.assertRaises(M['Stop']):
                M['metadata_stage'](Fake(doc=True, file=False), b, a)
            row['exact_storage_object_count'] = False
            b.write_text(json.dumps(row))
            with self.assertRaises(M['Stop']):
                M['metadata_stage'](Fake(doc=True, file=False), b, a)
            data = json.loads(b.read_text()); data['exact_storage_object_count'] = 0; b.write_text(json.dumps(data))
            fake = Fake(doc=True, file=False)
            self.assertEqual(M['metadata_stage'](fake, b, a), 'PASS_EXACT_SYNTHETIC_PNG_AND_DOC_CLEANUP')
            self.assertFalse(fake.doc)

    def test_tampered_zero_csv_blocks_metadata_delete(self):
        with tempfile.TemporaryDirectory() as td:
            a, b, c = [Path(td) / x for x in ('remove.json', 'zero.json', 'zero.csv')]
            checked = dt.datetime.now(dt.timezone.utc).replace(microsecond=0) - dt.timedelta(seconds=10)
            a.write_text(json.dumps({'result': 'FILE_REMOVE_HTTP_VERIFIED_PENDING_INDEPENDENT_DB_POSTFLIGHT', 'project': M['HOST'].split('.')[0], 'bucket': M['BUCKET'], 'path': M['PATH'], 'doc_id': M['DOC_ID'], 'script_sha256': hashlib.sha256(P.read_bytes()).hexdigest(), 'finished_at_utc': (checked - dt.timedelta(seconds=20)).isoformat()}))
            c.write_text('checked_at_utc,exact_storage_object_count\n' + checked.strftime('%Y-%m-%d %H:%M:%S') + ',1\n')
            b.write_text(json.dumps({'result': 'PASS_EXACT_STORAGE_ZERO_INDEPENDENT_SQL', 'project': M['HOST'].split('.')[0], 'bucket': M['BUCKET'], 'path': M['PATH'], 'exact_storage_object_count': 0, 'checked_at_utc': checked.isoformat(), 'csv_path': str(c), 'csv_sha256': hashlib.sha256(c.read_bytes()).hexdigest(), 'query_sha256': M['ZERO_SQL_SHA'], 'source_sql_editor_url': 'https://supabase.com/dashboard/project/axkkhyqrjrtbkumaulta/sql/test', 'remove_receipt_sha256': hashlib.sha256(a.read_bytes()).hexdigest()}))
            fake = Fake(doc=True, file=False)
            with self.assertRaises(M['Stop']):
                M['metadata_stage'](fake, b, a)
            self.assertTrue(fake.doc)

    def test_dependency_source_drift_blocks(self):
        fn = M['require_date_and_sources']
        globals_ = fn.__globals__
        original = globals_['DEPENDENCIES']
        try:
            globals_['DEPENDENCIES'] = ((P, '0' * 64),)
            with self.assertRaises(M['Stop']): fn()
        finally:
            globals_['DEPENDENCIES'] = original

    def test_untrusted_stop_text_not_whitelisted(self):
        self.assertNotIn('SECRET', M['SAFE_STOP_CODES'])


if __name__ == '__main__':
    unittest.main()
