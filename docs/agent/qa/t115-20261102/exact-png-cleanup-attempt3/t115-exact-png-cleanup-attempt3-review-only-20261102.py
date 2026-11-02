#!/usr/bin/env python3
"""Inert, two-stage cleanup of one T115 synthetic PNG; Owner A normal JWT only.

No action without --execute-approved. Stage remove keeps the synthetic document
metadata until an independent SQL postflight confirms the Storage row is gone.
"""
import argparse
import csv
import datetime as dt
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import runpy
import sys
import time
from urllib.parse import quote
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parent
FIXTURE = HERE.parent / 't115-integration-review-01-20261102' / 'T115-HEALTH-SECTIONS-FIXTURES-REVIEW-20261102.json'
FIXTURE_SHA = 'f9c8f8e8bfe80c3ab3d419fb8228ee8ff0f9d0e6e2cb21331d7f585e2024e468'
CORE = runpy.run_path(str(HERE / 't115-auth-preflight.py'))
QA = runpy.run_path(str(HERE / 't115-expanded-readback-review-only.py'))
KEY = runpy.run_path(str(HERE.parent / 't142-calendar-delete-db-05-20261030' / 't142-normal-jwt-delete-review-only.py'))
Stop = CORE['Stop']
HOST = 'axkkhyqrjrtbkumaulta.supabase.co'
BUCKET = 'dog-documents'
DOC_ID = '4cf382c6-b315-4dfb-b175-eb6b3ebcfa52'
OWNER_ID = '68910959-e849-4860-b408-ebc234fec611'
DOG_ID = 'b4991851-e569-51fc-a0af-4e0172f2bc63'
PATH = f'{OWNER_ID}/{DOG_ID}/t115-health-{DOC_ID}.png'
PNG_SHA = '2aa4fa20701cdd6d8d56046069001186b5267e3ee7d0ef618ad2f4a683723e11'
DOC_BASE = '/rest/v1/dog_documents'
DOC_READ = f'{DOC_BASE}?id=eq.{DOC_ID}&select=*'
DOC_DELETE = f'{DOC_BASE}?id=eq.{DOC_ID}'
DOG_READ = f'/rest/v1/dogs?id=eq.{DOG_ID}&owner_id=eq.{OWNER_ID}&select=id,owner_id'
FILE_READ = '/storage/v1/object/authenticated/dog-documents/' + quote(PATH, safe='/')
FILE_REMOVE = '/storage/v1/object/dog-documents'
MAX_SECONDS = 300
PREFLIGHT_SQL = HERE / 'T115-EXACT-PNG-CLEANUP-PREFLIGHT-READONLY-20261102.sql'
PREFLIGHT_SQL_SHA = '16f1adedd2bed48191466f73b15a8d00afde11e3f207c9ca26e3257e0b20fe40'
ZERO_SQL = HERE / 'T115-EXACT-PNG-STORAGE-ZERO-READONLY-20261102.sql'
ZERO_SQL_SHA = 'a22e9d5b66132e1e4e839c3b6de3ef5b009a5fa037b0b52985b63162af6a4de2'
NONCE = HERE / 'T115-EXACT-PNG-CLEANUP-ONE-SHOT-ATTEMPT3-20261102.json'
AUTH_DIAGNOSTIC = HERE / 'T115-EXACT-PNG-CLEANUP-AUTH-ATTEMPT3-20261102.json'
HASH_RECEIPT = HERE / 'T115-EXACT-STORAGE-PNG-HASH-READONLY-20261102.json'
HASH_RECEIPT_SHA = '7edcfc3daf259597695e5cbbc413586752ab0ef1213d668c88725a2ae4bc7dc3'
SOURCE_MANIFEST = HERE.parent / 't115-integration-review-01-20261102' / 'QA-SOURCE-MANIFEST-POST-POLICY-01.json'
SOURCE_MANIFEST_SHA = '60331deb4a4a55135a38cfb8b08b1f770931fb8b7b9516e2cdbeb98b5780d59f'
DEPENDENCIES = (
    (HERE / 't115-auth-preflight.py', '5a4c4265fa8f712b18abbe8e71f5b978f08ed9b433187049116df57e9ab4090e'),
    (HERE / 't115-expanded-readback-review-only.py', 'fbf9f315e931d1c98d8675f324b6c4dd3ff33df40bfe22fe9a8c162a57c86857'),
    (HERE.parent / 't142-calendar-delete-db-05-20261030' / 't142-normal-jwt-delete-review-only.py', '90f9d27792d7dccd4b2adfed7c82cf1b1bc8306958df27218e701c01dcc94d01'),
)
SAFE_STOP_CODES = frozenset({
    'FIXTURE_MANIFEST_DRIFT', 'FIXTURE_SCOPE_DRIFT', 'FIXTURE_DOC_DRIFT',
    'REQUEST_OUT_OF_SCOPE', 'DOC_INSERT_OUT_OF_SCOPE', 'STORAGE_REMOVE_OUT_OF_SCOPE',
    'REQUEST_BODY_OUT_OF_SCOPE', 'RESPONSE_TOO_LARGE', 'RESPONSE_NOT_JSON',
    'DOC_READ_UNCERTAIN', 'DOC_SCOPE_DRIFT', 'DOG_OWNER_SCOPE_DRIFT',
    'EXACT_PNG_HASH_MISMATCH', 'FILE_DELETE_NOT_CONFIRMED',
    'SYNTHETIC_DOC_RESTORE_FAILED', 'SYNTHETIC_DOC_RESTORE_READBACK_FAILED',
    'EXACT_STORAGE_REMOVE_RESPONSE_UNCERTAIN', 'SYNTHETIC_DOC_NOT_PRESERVED',
    'INDEPENDENT_ZERO_SQL_DRIFT', 'INDEPENDENT_STORAGE_ZERO_RECEIPT_INVALID',
    'INDEPENDENT_STORAGE_ZERO_RECEIPT_REQUIRED', 'SYNTHETIC_DOC_MISSING_OR_CHANGED',
    'EXACT_DOC_DELETE_RESPONSE_UNCERTAIN', 'SYNTHETIC_DOC_DELETE_NOT_CONFIRMED',
    'TIMESTAMP_TIMEZONE_REQUIRED', 'CSV_EVIDENCE_INVALID', 'PREFLIGHT_SQL_DRIFT',
    'EXACT_PNG_HASH_RECEIPT_DRIFT', 'FRESH_EXACT_PREFLIGHT_REQUIRED',
    'REVIEWED_SOURCE_SHA_REQUIRED', 'FRESH_EXACT_PREFLIGHT_AND_NEW_ZERO_PATH_REQUIRED',
    'ONE_SHOT_ALREADY_USED', 'OWNER_ACCOUNT_DRIFT', 'CLEANUP_FIVE_MINUTE_LIMIT',
    'INDEPENDENT_ZERO_POSTFLIGHT_TIMEOUT_DOC_PRESERVED', 'QA_DATE_MISMATCH',
    'DEPENDENCY_SOURCE_DRIFT', 'NORMAL_LOGIN_A_REJECTED', 'IDENTITY_A_MISMATCH',
    'PUBLIC_KEY_FILE_NOT_PRIVATE', 'PUBLIC_KEY_FILE_TARGET_MISMATCH',
    'AUTH_LOGIN_UNCERTAIN',
})


def owner_login(key, label, email, uid):
    """One existing QA login request, with bounded secret-free failure evidence."""
    if label != 'A' or uid != OWNER_ID:
        raise Stop('OWNER_ACCOUNT_DRIFT')
    print(f'Testkonto A: {email}', file=sys.stderr, flush=True)
    login = QA['login']
    qa_core = login.__globals__['core']
    original_request = qa_core['request']
    diagnostic = {'http_status': None, 'error_code': 'NONE'}

    def observed_request(*args, **kwargs):
        status, data = original_request(*args, **kwargs)
        if len(args) >= 4 and args[2:4] == ('POST', '/auth/v1/token?grant_type=password'):
            diagnostic['http_status'] = status if type(status) is int and 100 <= status <= 599 else None
            code = data.get('error_code') if isinstance(data, dict) else None
            diagnostic['error_code'] = code if code in {'invalid_credentials', 'email_not_confirmed', 'user_banned', 'unexpected_failure'} else 'OTHER'
        return status, data

    qa_core['request'] = observed_request
    try:
        return login(key, label, email, uid)
    except QA['Stop'] as exc:
        code = str(exc)
        payload = {'result': 'STOP_NORMAL_LOGIN_A_REJECTED' if code == 'NORMAL_LOGIN_A_REJECTED' else 'STOP_AUTH_LOGIN_UNCERTAIN',
                   'http_status': diagnostic['http_status'], 'error_code': diagnostic['error_code'],
                   'project': HOST.split('.')[0], 'stage': 'owner_login',
                   'checked_at_utc': dt.datetime.now(dt.timezone.utc).isoformat()}
        fd = os.open(AUTH_DIAGNOSTIC, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as out:
            json.dump(payload, out, sort_keys=True, separators=(',', ':'))
            out.write('\n')
            out.flush()
            os.fsync(out.fileno())
        raise Stop('NORMAL_LOGIN_A_REJECTED' if code == 'NORMAL_LOGIN_A_REJECTED' else 'AUTH_LOGIN_UNCERTAIN') from None
    finally:
        qa_core['request'] = original_request


def require_date_and_sources():
    if dt.datetime.now(ZoneInfo('Europe/Zurich')).date().isoformat() != '2026-11-02':
        raise Stop('QA_DATE_MISMATCH')
    for path, expected in (*DEPENDENCIES, (SOURCE_MANIFEST, SOURCE_MANIFEST_SHA)):
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise Stop('DEPENDENCY_SOURCE_DRIFT')


def utc(value):
    parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise Stop('TIMESTAMP_TIMEZONE_REQUIRED')
    return parsed.astimezone(dt.timezone.utc)


def csv_row(data):
    raw = Path(data['csv_path']).read_bytes()
    rows = list(csv.DictReader(raw.decode('utf-8-sig').splitlines()))
    if hashlib.sha256(raw).hexdigest() != data.get('csv_sha256') or len(rows) != 1:
        raise Stop('CSV_EVIDENCE_INVALID')
    return rows[0]


def validate_preflight(path):
    data = json.loads(Path(path).read_text())
    if hashlib.sha256(PREFLIGHT_SQL.read_bytes()).hexdigest() != PREFLIGHT_SQL_SHA:
        raise Stop('PREFLIGHT_SQL_DRIFT')
    if hashlib.sha256(HASH_RECEIPT.read_bytes()).hexdigest() != HASH_RECEIPT_SHA:
        raise Stop('EXACT_PNG_HASH_RECEIPT_DRIFT')
    hash_proof = json.loads(HASH_RECEIPT.read_text())
    row = csv_row(data)
    checked = utc(data['checked_at_utc'])
    raw_checked = utc(row['checked_at_utc'].replace(' ', 'T') + 'Z')
    age = (dt.datetime.now(dt.timezone.utc) - checked).total_seconds()
    if (data.get('result') != 'PASS_EXACT_SYNTHETIC_PNG_CLEANUP_PREFLIGHT'
            or data.get('project') != HOST.split('.')[0] or data.get('bucket') != BUCKET
            or data.get('path') != PATH or data.get('png_sha256') != PNG_SHA
            or hash_proof.get('path') != PATH or hash_proof.get('size_bytes') != 68
            or hash_proof.get('sha256') != PNG_SHA
            or data.get('query_sha256') != PREFLIGHT_SQL_SHA
            or not str(data.get('source_sql_editor_url', '')).startswith('https://supabase.com/dashboard/project/axkkhyqrjrtbkumaulta/sql/')
            or checked != raw_checked or not 0 <= age <= MAX_SECONDS
            or row.get('exact_document_row_count') != '0'
            or row.get('exact_storage_object_count') != '1'
            or row.get('exact_size_bytes') != '68'
            or row.get('exact_mimetype') != 'image/png'):
        raise Stop('FRESH_EXACT_PREFLIGHT_REQUIRED')
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def fixture():
    raw = FIXTURE.read_bytes()
    if hashlib.sha256(raw).hexdigest() != FIXTURE_SHA:
        raise Stop('FIXTURE_MANIFEST_DRIFT')
    data = json.loads(raw)
    if (data.get('production_project') != HOST.split('.')[0]
            or data.get('png_path') != PATH or data.get('png_sha256') != PNG_SHA
            or data.get('png_size_bytes') != 68):
        raise Stop('FIXTURE_SCOPE_DRIFT')
    rows = [x for x in data['fixtures']['dog_documents'] if x.get('id') == DOC_ID]
    if len(rows) != 1 or rows[0].get('owner_id') != OWNER_ID or rows[0].get('dog_id') != DOG_ID or rows[0].get('file_url') != PATH:
        raise Stop('FIXTURE_DOC_DRIFT')
    return rows[0]


def request(key, token, method, path, body=None, binary=False):
    allowed = {('GET', DOC_READ), ('GET', DOG_READ), ('POST', DOC_BASE),
               ('DELETE', DOC_DELETE), ('GET', FILE_READ), ('DELETE', FILE_REMOVE)}
    if (method, path) not in allowed or not token:
        raise Stop('REQUEST_OUT_OF_SCOPE')
    if method == 'POST' and body != fixture():
        raise Stop('DOC_INSERT_OUT_OF_SCOPE')
    if method == 'DELETE' and path == FILE_REMOVE and body != {'prefixes': [PATH]}:
        raise Stop('STORAGE_REMOVE_OUT_OF_SCOPE')
    if method in ('GET',) and body is not None or method == 'DELETE' and path == DOC_DELETE and body is not None:
        raise Stop('REQUEST_BODY_OUT_OF_SCOPE')
    headers = {'apikey': key, 'Authorization': 'Bearer ' + token,
               'Prefer': 'return=representation'}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    wire = json.dumps(body, separators=(',', ':')) if body is not None else None
    conn = http.client.HTTPSConnection(HOST, timeout=20, context=CORE['tls_context']())
    try:
        conn.request(method, path, body=wire, headers=headers)
        res = conn.getresponse()
        raw = res.read(65537)
        if len(raw) > 65536:
            raise Stop('RESPONSE_TOO_LARGE')
        if binary:
            return res.status, raw
        try:
            return res.status, json.loads(raw) if raw else None
        except ValueError:
            raise Stop('RESPONSE_NOT_JSON') from None
    finally:
        conn.close()


def exact_doc(req):
    status, data = req('GET', DOC_READ)
    if status != 200 or not isinstance(data, list) or len(data) > 1:
        raise Stop('DOC_READ_UNCERTAIN')
    if data and any(data[0].get(k) != v for k, v in fixture().items()):
        raise Stop('DOC_SCOPE_DRIFT')
    return data


def check_owner_dog(req):
    status, data = req('GET', DOG_READ)
    if status != 200 or not isinstance(data, list) or len(data) != 1 or data[0] != {'id': DOG_ID, 'owner_id': OWNER_ID}:
        raise Stop('DOG_OWNER_SCOPE_DRIFT')


def check_png(req):
    status, raw = req('GET', FILE_READ, binary=True)
    if status != 200 or len(raw) != 68 or hashlib.sha256(raw).hexdigest() != PNG_SHA:
        raise Stop('EXACT_PNG_HASH_MISMATCH')


def file_absent(req):
    status, raw = req('GET', FILE_READ, binary=True)
    if status not in (400, 404) or len(raw) > 4096:
        raise Stop('FILE_DELETE_NOT_CONFIRMED')


def remove_stage(req):
    check_owner_dog(req)
    rows = exact_doc(req)
    if not rows:
        status, data = req('POST', DOC_BASE, fixture())
        if status not in (200, 201) or not isinstance(data, list) or len(data) != 1:
            raise Stop('SYNTHETIC_DOC_RESTORE_FAILED')
        if len(exact_doc(req)) != 1:
            raise Stop('SYNTHETIC_DOC_RESTORE_READBACK_FAILED')
    check_png(req)
    status, data = req('DELETE', FILE_REMOVE, {'prefixes': [PATH]})
    if status != 200 or not isinstance(data, list) or len(data) != 1 or data[0].get('name') != PATH:
        raise Stop('EXACT_STORAGE_REMOVE_RESPONSE_UNCERTAIN')
    file_absent(req)
    if len(exact_doc(req)) != 1:
        raise Stop('SYNTHETIC_DOC_NOT_PRESERVED')
    return 'FILE_REMOVE_HTTP_VERIFIED_PENDING_INDEPENDENT_DB_POSTFLIGHT'


def validate_zero_receipt(path, remove_receipt):
    data = json.loads(Path(path).read_text())
    prior = json.loads(Path(remove_receipt).read_text())
    if hashlib.sha256(ZERO_SQL.read_bytes()).hexdigest() != ZERO_SQL_SHA:
        raise Stop('INDEPENDENT_ZERO_SQL_DRIFT')
    try:
        parsed = csv_row(data)
        checked = utc(data['checked_at_utc'])
        finished = utc(prior['finished_at_utc'])
        raw_checked = utc(parsed['checked_at_utc'].replace(' ', 'T') + 'Z')
    except (KeyError, ValueError, OSError, UnicodeError) as exc:
        raise Stop('INDEPENDENT_STORAGE_ZERO_RECEIPT_INVALID') from exc
    if (prior.get('result') != 'FILE_REMOVE_HTTP_VERIFIED_PENDING_INDEPENDENT_DB_POSTFLIGHT'
            or prior.get('project') != HOST.split('.')[0] or prior.get('bucket') != BUCKET
            or prior.get('path') != PATH or prior.get('doc_id') != DOC_ID
            or prior.get('script_sha256') != hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
            or data.get('remove_receipt_sha256') != hashlib.sha256(Path(remove_receipt).read_bytes()).hexdigest()
            or data.get('result') != 'PASS_EXACT_STORAGE_ZERO_INDEPENDENT_SQL'
            or data.get('project') != HOST.split('.')[0]
            or data.get('bucket') != BUCKET or data.get('path') != PATH
            or type(data.get('exact_storage_object_count')) is not int
            or data['exact_storage_object_count'] != 0
            or not 0 < (checked - finished).total_seconds() <= MAX_SECONDS
            or checked != raw_checked
            or not 0 <= (dt.datetime.now(dt.timezone.utc) - checked).total_seconds() <= MAX_SECONDS
            or data.get('query_sha256') != ZERO_SQL_SHA
            or not str(data.get('source_sql_editor_url', '')).startswith('https://supabase.com/dashboard/project/axkkhyqrjrtbkumaulta/sql/')
            or parsed.get('exact_storage_object_count') != '0'):
        raise Stop('INDEPENDENT_STORAGE_ZERO_RECEIPT_REQUIRED')


def metadata_stage(req, zero_receipt, remove_receipt):
    validate_zero_receipt(zero_receipt, remove_receipt)
    rows = exact_doc(req)
    if len(rows) != 1:
        raise Stop('SYNTHETIC_DOC_MISSING_OR_CHANGED')
    file_absent(req)
    status, data = req('DELETE', DOC_DELETE)
    if status not in (200, 204) or status == 200 and (not isinstance(data, list) or len(data) != 1 or data[0].get('id') != DOC_ID):
        raise Stop('EXACT_DOC_DELETE_RESPONSE_UNCERTAIN')
    if exact_doc(req):
        raise Stop('SYNTHETIC_DOC_DELETE_NOT_CONFIRMED')
    return 'PASS_EXACT_SYNTHETIC_PNG_AND_DOC_CLEANUP'


def save_result(result, stage):
    payload = {'result': result, 'stage': stage, 'project': HOST.split('.')[0],
               'bucket': BUCKET, 'path': PATH, 'doc_id': DOC_ID,
               'script_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
               'finished_at_utc': dt.datetime.now(dt.timezone.utc).isoformat()}
    path = HERE / ('T115-EXACT-PNG-CLEANUP-' + stage.upper() + '-' + dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.json')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as out:
        json.dump(payload, out, sort_keys=True, separators=(',', ':'))
        out.write('\n')
        out.flush()
        os.fsync(out.fileno())
    return path


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--execute-approved', action='store_true')
    parser.add_argument('--stage', choices=('full',))
    parser.add_argument('--zero-receipt')
    parser.add_argument('--preflight')
    parser.add_argument('--expected-sha256')
    args = parser.parse_args(argv)
    if not args.execute_approved or not args.stage:
        print('STOP_REVIEW_ONLY_NO_EXECUTION')
        return 2
    if not sys.stdin.isatty() or not sys.stderr.isatty():
        print('STOP_LOCAL_TTY_REQUIRED')
        return 2
    try:
        fixture()
        require_date_and_sources()
        actual_sha = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
        if args.expected_sha256 != actual_sha or not re.fullmatch(r'[0-9a-f]{64}', actual_sha):
            raise Stop('REVIEWED_SOURCE_SHA_REQUIRED')
        if not args.preflight or not args.zero_receipt or Path(args.zero_receipt).exists():
            raise Stop('FRESH_EXACT_PREFLIGHT_AND_NEW_ZERO_PATH_REQUIRED')
        preflight_sha = validate_preflight(args.preflight)
        nonce = {'script_sha256': actual_sha, 'preflight_receipt_sha256': preflight_sha,
                 'stage': args.stage, 'created_at_utc': dt.datetime.now(dt.timezone.utc).isoformat()}
        try:
            fd = os.open(NONCE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            raise Stop('ONE_SHOT_ALREADY_USED') from None
        with os.fdopen(fd, 'w') as out:
            json.dump(nonce, out, sort_keys=True, separators=(',', ':'))
            out.write('\n')
            out.flush()
            os.fsync(out.fileno())
        key = KEY['verified_public_key']()
        label, email, uid = CORE['USERS'][0]
        if label != 'A' or uid != OWNER_ID:
            raise Stop('OWNER_ACCOUNT_DRIFT')
        token = owner_login(key, label, email, uid)
        require_date_and_sources()
        validate_preflight(args.preflight)
        start = time.monotonic()
        def req(method, path, body=None, binary=False):
            if time.monotonic() - start > MAX_SECONDS:
                raise Stop('CLEANUP_FIVE_MINUTE_LIMIT')
            return request(key, token, method, path, body, binary)
        removed = remove_stage(req)
        remove_receipt = save_result(removed, 'remove')
        print(removed, flush=True)
        print('WAIT_INDEPENDENT_EXACT_STORAGE_ZERO_POSTFLIGHT', flush=True)
        while not Path(args.zero_receipt).exists():
            if time.monotonic() - start > MAX_SECONDS:
                raise Stop('INDEPENDENT_ZERO_POSTFLIGHT_TIMEOUT_DOC_PRESERVED')
            time.sleep(2)
        result = metadata_stage(req, args.zero_receipt, remove_receipt)
        save_result(result, args.stage)
        print(result)
        return 0
    except (Stop, OSError, ValueError, KeyError, TypeError) as exc:
        code = str(exc) if isinstance(exc, Stop) and str(exc) in SAFE_STOP_CODES else 'CLEANUP_UNCERTAIN'
        print('STOP_' + code if not code.startswith('STOP_') else code)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
