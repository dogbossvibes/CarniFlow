#!/usr/bin/env python3
"""One-shot, Owner-A-only recovery of one orphaned synthetic T115 document row.

Inert without --execute-approved. Never writes to Storage or changes grants.
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
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parent
HOST = 'axkkhyqrjrtbkumaulta.supabase.co'
PROJECT = HOST.split('.')[0]
BUCKET = 'dog-documents'
DOC_ID = '8f1ba3f3-1fa4-48f3-99b7-ccb7b1250824'
OWNER_ID = '68910959-e849-4860-b408-ebc234fec611'
DOG_ID = 'b4991851-e569-51fc-a0af-4e0172f2bc63'
FILE_PATH = f'{OWNER_ID}/{DOG_ID}/t115-health-{DOC_ID}.png'
DOC_FIELDS = 'id,owner_id,dog_id,kind,title,category,subtype,file_url'
DOC_READ = f'/rest/v1/dog_documents?id=eq.{DOC_ID}&select={DOC_FIELDS}'
DOC_DELETE = f'/rest/v1/dog_documents?id=eq.{DOC_ID}'
DOG_READ = f'/rest/v1/dogs?id=eq.{DOG_ID}&owner_id=eq.{OWNER_ID}&select=id,owner_id'
SQL = HERE / 'T115-FULL3-ORPHAN-RECOVERY-PREFLIGHT-READONLY-20261102.sql'
SQL_SHA = 'be5bbcb2ef49db6247e2ebf1c19eb6ca36d84e3d78002e8652d9ba97cc95f2a4'
PREFLIGHT_RECEIPT = HERE / 'T115-FULL3-ORPHAN-RECOVERY-PREFLIGHT-20261102.json'
PREFLIGHT_CSV = HERE / 'T115-FULL3-ORPHAN-RECOVERY-PREFLIGHT-20261102.csv'
FIXTURE = HERE.parent / 't115-full3-qa-05-20261102' / 'T115-HEALTH-SECTIONS-FIXTURES-FULL3-20261102.json'
FIXTURE_SHA = 'a80afdacf830c4814163ee88dd3cde05eed28d0ae38e0cc6639eaf0eb4c07466'
MANIFEST = HERE.parent / 't115-full3-qa-05-20261102' / 'QA-SOURCE-MANIFEST-FULL3-05.json'
MANIFEST_SHA = '523bf98201ab03cb0add31cc61f7d0fb87bf4dd9f07a349012c1b5d9cff9f66f'
CORE_FILE = HERE.parent / 't115-health-sharing-db-05-20261029' / 't115-auth-preflight.py'
QA_FILE = HERE.parent / 't115-health-sharing-db-05-20261029' / 't115-expanded-readback-review-only.py'
KEY_FILE = HERE.parent / 't142-calendar-delete-db-05-20261030' / 't142-normal-jwt-delete-review-only.py'
DEPENDENCIES = (
    (CORE_FILE, '5a4c4265fa8f712b18abbe8e71f5b978f08ed9b433187049116df57e9ab4090e'),
    (QA_FILE, 'fbf9f315e931d1c98d8675f324b6c4dd3ff33df40bfe22fe9a8c162a57c86857'),
    (KEY_FILE, '90f9d27792d7dccd4b2adfed7c82cf1b1bc8306958df27218e701c01dcc94d01'),
    (MANIFEST, MANIFEST_SHA),
)
CORE = runpy.run_path(str(CORE_FILE))
QA = runpy.run_path(str(QA_FILE))
KEY = runpy.run_path(str(KEY_FILE))
Stop = CORE['Stop']
NONCE = HERE / 'T115-FULL3-ORPHAN-RECOVERY-ONE-SHOT-20261102.json'
RESULT = HERE / 'T115-FULL3-ORPHAN-RECOVERY-RESULT-20261102.json'
MAX_AGE_SECONDS = 300
DEADLINE = None
SAFE_CODES = frozenset({
    'QA_DATE_MISMATCH', 'DEPENDENCY_SOURCE_DRIFT', 'SQL_SOURCE_DRIFT',
    'FIXTURE_MANIFEST_DRIFT', 'FIXTURE_SCOPE_DRIFT', 'FIXTURE_DOC_DRIFT',
    'REVIEWED_SOURCE_SHA_REQUIRED', 'FRESH_EXACT_PREFLIGHT_REQUIRED',
    'CSV_EVIDENCE_INVALID', 'ONE_SHOT_ALREADY_USED', 'OWNER_ACCOUNT_DRIFT',
    'NORMAL_LOGIN_A_REJECTED', 'AUTH_LOGIN_UNCERTAIN', 'DOC_READ_UNCERTAIN',
    'DOC_SCOPE_DRIFT', 'DOG_OWNER_SCOPE_DRIFT', 'DELETE_RESPONSE_UNCERTAIN',
    'DELETE_NOT_CONFIRMED', 'REQUEST_OUT_OF_SCOPE', 'RESPONSE_TOO_LARGE',
    'RESPONSE_NOT_JSON', 'TIMESTAMP_TIMEZONE_REQUIRED', 'RESULT_ALREADY_EXISTS',
    'RECOVERY_FIVE_MINUTE_LIMIT',
})


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def utc(value):
    value = value.replace(' ', 'T')
    if not value.endswith('Z') and '+' not in value[10:]:
        raise Stop('TIMESTAMP_TIMEZONE_REQUIRED')
    parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise Stop('TIMESTAMP_TIMEZONE_REQUIRED')
    return parsed.astimezone(dt.timezone.utc)


def sources_and_date():
    if dt.datetime.now(ZoneInfo('Europe/Zurich')).date().isoformat() != '2026-11-02':
        raise Stop('QA_DATE_MISMATCH')
    for file, sha in DEPENDENCIES:
        if digest(file) != sha:
            raise Stop('DEPENDENCY_SOURCE_DRIFT')
    if digest(SQL) != SQL_SHA:
        raise Stop('SQL_SOURCE_DRIFT')


def fixture():
    if digest(FIXTURE) != FIXTURE_SHA:
        raise Stop('FIXTURE_MANIFEST_DRIFT')
    data = json.loads(FIXTURE.read_text())
    if data.get('production_project') != PROJECT or data.get('png_path') != FILE_PATH:
        raise Stop('FIXTURE_SCOPE_DRIFT')
    rows = [row for row in data['fixtures']['dog_documents'] if row.get('id') == DOC_ID]
    if (len(rows) != 1 or rows[0].get('owner_id') != OWNER_ID
            or rows[0].get('dog_id') != DOG_ID or rows[0].get('file_url') != FILE_PATH):
        raise Stop('FIXTURE_DOC_DRIFT')
    return rows[0]


def preflight(path):
    if Path(path).resolve() != PREFLIGHT_RECEIPT.resolve():
        raise Stop('FRESH_EXACT_PREFLIGHT_REQUIRED')
    data = json.loads(Path(path).read_text())
    if Path(data['csv_path']).resolve() != PREFLIGHT_CSV.resolve():
        raise Stop('CSV_EVIDENCE_INVALID')
    raw = Path(data['csv_path']).read_bytes()
    rows = list(csv.DictReader(raw.decode('utf-8-sig').splitlines()))
    if len(rows) != 1 or hashlib.sha256(raw).hexdigest() != data.get('csv_sha256'):
        raise Stop('CSV_EVIDENCE_INVALID')
    row = rows[0]
    checked = utc(data['checked_at_utc'])
    raw_checked = utc(row['checked_at_utc'] + 'Z')
    age = (dt.datetime.now(dt.timezone.utc) - checked).total_seconds()
    if (data.get('result') != 'PASS_EXACT_SYNTHETIC_DOCUMENT_RECOVERY_PREFLIGHT'
            or data.get('project') != PROJECT or data.get('bucket') != BUCKET
            or data.get('path') != FILE_PATH or data.get('document_id') != DOC_ID
            or data.get('query_sha256') != SQL_SHA
            or not str(data.get('source_sql_editor_url', '')).startswith(
                f'https://supabase.com/dashboard/project/{PROJECT}/sql/')
            or checked != raw_checked or not 0 <= age <= MAX_AGE_SECONDS
            or row.get('exact_document_row_count') != '1'
            or row.get('exact_document_identity_ok') != 'true'
            or row.get('exact_storage_object_count') != '0'):
        raise Stop('FRESH_EXACT_PREFLIGHT_REQUIRED')
    return digest(path)


def request(key, token, method, path):
    if DEADLINE is not None and time.monotonic() > DEADLINE:
        raise Stop('RECOVERY_FIVE_MINUTE_LIMIT')
    if not key or not token or (method, path) not in {
            ('GET', DOC_READ), ('GET', DOG_READ), ('DELETE', DOC_DELETE)}:
        raise Stop('REQUEST_OUT_OF_SCOPE')
    conn = http.client.HTTPSConnection(HOST, timeout=20, context=CORE['tls_context']())
    try:
        headers = {'apikey': key, 'Authorization': 'Bearer ' + token,
                   'Prefer': 'return=representation'}
        conn.request(method, path, headers=headers)  # DELETE has no body or JSON content type.
        response = conn.getresponse()
        raw = response.read(65537)
        if len(raw) > 65536:
            raise Stop('RESPONSE_TOO_LARGE')
        try:
            return response.status, json.loads(raw) if raw else None
        except ValueError:
            raise Stop('RESPONSE_NOT_JSON') from None
    finally:
        conn.close()


def exact_document(key, token):
    status, rows = request(key, token, 'GET', DOC_READ)
    if status != 200 or not isinstance(rows, list) or len(rows) > 1:
        raise Stop('DOC_READ_UNCERTAIN')
    if rows and rows[0] != fixture():
        raise Stop('DOC_SCOPE_DRIFT')
    return rows


def check_owner_dog(key, token):
    status, rows = request(key, token, 'GET', DOG_READ)
    if status != 200 or rows != [{'id': DOG_ID, 'owner_id': OWNER_ID}]:
        raise Stop('DOG_OWNER_SCOPE_DRIFT')


def owner_login(key):
    label, email, uid = CORE['USERS'][0]
    if label != 'A' or uid != OWNER_ID:
        raise Stop('OWNER_ACCOUNT_DRIFT')
    print(f'Testkonto A: {email}', file=sys.stderr, flush=True)
    try:
        return QA['login'](key, label, email, uid)
    except QA['Stop'] as exc:
        if str(exc) == 'NORMAL_LOGIN_A_REJECTED':
            raise Stop('NORMAL_LOGIN_A_REJECTED') from None
        raise Stop('AUTH_LOGIN_UNCERTAIN') from None


def save_result(payload):
    if RESULT.exists():
        raise Stop('RESULT_ALREADY_EXISTS')
    fd = os.open(RESULT, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as out:
        json.dump(payload, out, sort_keys=True, separators=(',', ':'))
        out.write('\n')
        out.flush()
        os.fsync(out.fileno())


def main(argv=None):
    global DEADLINE
    parser = argparse.ArgumentParser()
    parser.add_argument('--execute-approved', action='store_true')
    parser.add_argument('--preflight')
    parser.add_argument('--expected-sha256')
    args = parser.parse_args(argv)
    if not args.execute_approved:
        print('STOP_REVIEW_ONLY_NO_EXECUTION')
        return 2
    if not sys.stdin.isatty() or not sys.stderr.isatty():
        print('STOP_LOCAL_TTY_REQUIRED')
        return 2
    try:
        sources_and_date()
        fixture()
        if not args.preflight or not re.fullmatch('[0-9a-f]{64}', args.expected_sha256 or '') \
                or args.expected_sha256 != digest(__file__):
            raise Stop('REVIEWED_SOURCE_SHA_REQUIRED')
        preflight_sha = preflight(args.preflight)
        if RESULT.exists():
            raise Stop('RESULT_ALREADY_EXISTS')
        nonce = {'script_sha256': digest(__file__), 'preflight_receipt_sha256': preflight_sha,
                 'created_at_utc': dt.datetime.now(dt.timezone.utc).isoformat()}
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
        token = owner_login(key)
        sources_and_date()
        preflight(args.preflight)
        DEADLINE = time.monotonic() + MAX_AGE_SECONDS
        check_owner_dog(key, token)
        if len(exact_document(key, token)) != 1:
            raise Stop('DOC_READ_UNCERTAIN')
        status, result = request(key, token, 'DELETE', DOC_DELETE)
        if status not in (200, 204) or status == 200 and (
                not isinstance(result, list) or len(result) != 1
                or not isinstance(result[0], dict)
                or any(result[0].get(k) != v for k, v in fixture().items())):
            raise Stop('DELETE_RESPONSE_UNCERTAIN')
        if exact_document(key, token):
            raise Stop('DELETE_NOT_CONFIRMED')
        save_result({'result': 'PASS_EXACT_SYNTHETIC_DOCUMENT_RECOVERY',
                     'project': PROJECT, 'bucket': BUCKET, 'path': FILE_PATH,
                     'document_id': DOC_ID, 'script_sha256': digest(__file__),
                     'preflight_receipt_sha256': preflight_sha,
                     'finished_at_utc': dt.datetime.now(dt.timezone.utc).isoformat()})
        print('PASS_EXACT_SYNTHETIC_DOCUMENT_RECOVERY')
        return 0
    except (Stop, OSError, ValueError, KeyError, TypeError) as exc:
        code = str(exc) if isinstance(exc, Stop) and str(exc) in SAFE_CODES else 'RECOVERY_UNCERTAIN'
        print('STOP_' + code)
        return 2
    finally:
        DEADLINE = None


if __name__ == '__main__':
    raise SystemExit(main())
