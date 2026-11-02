#!/usr/bin/env python3
"""Local, one-shot password change for one named synthetic R4 test account.

Inert by default. The human enters the admin key and new password on a TTY;
neither is printed, placed in arguments, or written to disk.
"""
import argparse
import base64
import datetime as dt
import getpass
import hashlib
import hmac
import http.client
import json
import os
from pathlib import Path
import re
import runpy
import sys
import warnings
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parent
PROJECT = 'axkkhyqrjrtbkumaulta'
HOST = PROJECT + '.supabase.co'
UID = '68910959-e849-4860-b408-ebc234fec611'
EMAIL = 'anyvo-r4-20261018-owner-a@qa.anyvo.invalid'
ADMIN_PATH = '/auth/v1/admin/users/' + UID
TOKEN_PATH = '/auth/v1/token?grant_type=password'
USER_PATH = '/auth/v1/user'
NONCE = HERE / 'T115-R4-A-ADMIN-PASSWORD-ONE-SHOT-20261102.json'
RESULT = HERE / 'T115-R4-A-ADMIN-PASSWORD-RESULT-20261102.json'
CORE_FILE = HERE / 't115-auth-preflight.py'
KEY_FILE = HERE.parent / 't142-calendar-delete-db-05-20261030' / 't142-normal-jwt-delete-review-only.py'
CORE_SHA = '5a4c4265fa8f712b18abbe8e71f5b978f08ed9b433187049116df57e9ab4090e'
KEY_SHA = '90f9d27792d7dccd4b2adfed7c82cf1b1bc8306958df27218e701c01dcc94d01'
CORE = runpy.run_path(str(CORE_FILE))
KEY = runpy.run_path(str(KEY_FILE))
SAFE_CODES = frozenset({
    'SOURCE_DRIFT', 'DATE_MISMATCH', 'REVIEWED_SOURCE_SHA_REQUIRED',
    'PUBLIC_KEY_UNAVAILABLE', 'ADMIN_KEY_INVALID_FORMAT', 'ADMIN_READ_REJECTED',
    'ADMIN_ACCOUNT_IDENTITY_MISMATCH', 'PASSWORD_MISMATCH', 'PASSWORD_WEAK',
    'ONE_SHOT_ALREADY_USED', 'RESULT_ALREADY_EXISTS', 'UPDATE_REJECTED_OR_UNCERTAIN',
    'UPDATE_IDENTITY_MISMATCH', 'LOGIN_AFTER_UPDATE_FAILED',
    'LOGIN_IDENTITY_MISMATCH', 'RESPONSE_TOO_LARGE', 'RESPONSE_NOT_JSON',
    'NETWORK_OR_TLS_ERROR', 'LOCAL_TTY_REQUIRED',
})


class Stop(Exception):
    pass


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def hidden(prompt):
    if not sys.stdin.isatty() or not sys.stderr.isatty():
        raise Stop('LOCAL_TTY_REQUIRED')
    with warnings.catch_warnings():
        warnings.simplefilter('error', getpass.GetPassWarning)
        return getpass.getpass(prompt)


def sources():
    if dt.datetime.now(ZoneInfo('Europe/Zurich')).date().isoformat() != '2026-11-02':
        raise Stop('DATE_MISMATCH')
    if sha(CORE_FILE) != CORE_SHA or sha(KEY_FILE) != KEY_SHA:
        raise Stop('SOURCE_DRIFT')
    if CORE['HOST'] != HOST or CORE['USERS'][0] != ('A', EMAIL, UID):
        raise Stop('SOURCE_DRIFT')


def admin_key_format(key):
    if key.startswith('sb_secret_') and 20 <= len(key) <= 2048:
        return True
    try:
        parts = key.split('.')
        if len(parts) != 3 or len(key) > 2048:
            return False
        claims = json.loads(base64.urlsafe_b64decode(parts[1] + '==='))
        return claims.get('role') == 'service_role' and claims.get('ref') == PROJECT
    except (ValueError, TypeError, IndexError):
        return False


def request(method, path, key, body=None, user_token=None, public_key=None):
    allowed = {('GET', ADMIN_PATH), ('PUT', ADMIN_PATH),
               ('POST', TOKEN_PATH), ('GET', USER_PATH)}
    if (method, path) not in allowed:
        raise Stop('SOURCE_DRIFT')
    if method == 'PUT' and (not isinstance(body, dict) or set(body) != {'password'}):
        raise Stop('SOURCE_DRIFT')
    if method == 'POST' and (not isinstance(body, dict) or set(body) != {'email', 'password'}
                             or body['email'] != EMAIL):
        raise Stop('SOURCE_DRIFT')
    if method == 'GET' and body is not None:
        raise Stop('SOURCE_DRIFT')
    if method in ('GET', 'PUT') and path == ADMIN_PATH:
        headers = {'apikey': key}
        # Opaque sb_secret keys belong in apikey; the gateway translates them.
        if not key.startswith('sb_secret_'):
            headers['Authorization'] = 'Bearer ' + key
    else:
        if not public_key:
            raise Stop('PUBLIC_KEY_UNAVAILABLE')
        headers = {'apikey': public_key}
        if user_token:
            headers['Authorization'] = 'Bearer ' + user_token
        elif not public_key.startswith('sb_publishable_'):
            headers['Authorization'] = 'Bearer ' + public_key
    if body is not None:
        headers['Content-Type'] = 'application/json'
    try:
        tls = CORE['tls_context']()
    except CORE['Stop']:
        raise Stop('NETWORK_OR_TLS_ERROR') from None
    conn = http.client.HTTPSConnection(HOST, timeout=20, context=tls)
    try:
        conn.request(method, path,
                     body=json.dumps(body, separators=(',', ':')) if body is not None else None,
                     headers=headers)
        response = conn.getresponse()
        raw = response.read(65537)
        if len(raw) > 65536:
            raise Stop('RESPONSE_TOO_LARGE')
        try:
            return response.status, json.loads(raw) if raw else None
        except ValueError:
            raise Stop('RESPONSE_NOT_JSON') from None
    except (OSError, http.client.HTTPException):
        raise Stop('NETWORK_OR_TLS_ERROR') from None
    finally:
        conn.close()


def check_admin_user(user):
    if (not isinstance(user, dict) or user.get('id') != UID or user.get('email') != EMAIL
            or user.get('email_confirmed_at') is None or user.get('is_sso_user') is True
            or user.get('deleted_at') is not None):
        raise Stop('ADMIN_ACCOUNT_IDENTITY_MISMATCH')
    banned_until = user.get('banned_until')
    if banned_until:
        try:
            ban_time = dt.datetime.fromisoformat(banned_until.replace('Z', '+00:00'))
            if ban_time.tzinfo is None or ban_time > dt.datetime.now(dt.timezone.utc):
                raise Stop('ADMIN_ACCOUNT_IDENTITY_MISMATCH')
        except (ValueError, TypeError):
            raise Stop('ADMIN_ACCOUNT_IDENTITY_MISMATCH') from None
    metadata = user.get('app_metadata')
    if not isinstance(metadata, dict) or metadata.get('provider') != 'email' \
            or metadata.get('providers') != ['email']:
        raise Stop('ADMIN_ACCOUNT_IDENTITY_MISMATCH')


def create_private_json(path, payload):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as out:
        json.dump(payload, out, sort_keys=True, separators=(',', ':'))
        out.write('\n')
        out.flush()
        os.fsync(out.fileno())


def run(expected_sha):
    sources()
    if not re.fullmatch(r'[0-9a-f]{64}', expected_sha or '') or expected_sha != sha(__file__):
        raise Stop('REVIEWED_SOURCE_SHA_REQUIRED')
    if NONCE.exists():
        raise Stop('ONE_SHOT_ALREADY_USED')
    if RESULT.exists():
        raise Stop('RESULT_ALREADY_EXISTS')
    try:
        public_key = KEY['verified_public_key']()
    except (KEY['Stop'], OSError, ValueError):
        raise Stop('PUBLIC_KEY_UNAVAILABLE') from None
    if not CORE['public_key_ok'](public_key):
        raise Stop('PUBLIC_KEY_UNAVAILABLE')
    print(f'Projekt {PROJECT}; nur Testkonto A: {EMAIL}', flush=True)
    admin_key = hidden('Supabase Secret-/Service-Role-Key (verdeckt): ').strip()
    if not admin_key_format(admin_key):
        raise Stop('ADMIN_KEY_INVALID_FORMAT')
    status, user = request('GET', ADMIN_PATH, admin_key)
    if status != 200:
        raise Stop('ADMIN_READ_REJECTED')
    check_admin_user(user)
    password = hidden('Neues Passwort fuer Testkonto A (verdeckt): ')
    confirmation = hidden('Neues Passwort wiederholen (verdeckt): ')
    if not hmac.compare_digest(password.encode('utf-8'), confirmation.encode('utf-8')):
        raise Stop('PASSWORD_MISMATCH')
    confirmation = None
    if not 14 <= len(password) <= 128 or any(ord(c) < 32 or ord(c) == 127 for c in password):
        raise Stop('PASSWORD_WEAK')
    sources()
    status, user = request('GET', ADMIN_PATH, admin_key)
    if status != 200:
        raise Stop('ADMIN_READ_REJECTED')
    check_admin_user(user)
    create_private_json(NONCE, {'project': PROJECT, 'user_id': UID,
                                'source_sha256': sha(__file__),
                                'created_at_utc': dt.datetime.now(dt.timezone.utc).isoformat()})
    try:
        status, updated = request('PUT', ADMIN_PATH, admin_key, {'password': password})
        if status != 200:
            raise Stop('UPDATE_REJECTED_OR_UNCERTAIN')
        if not isinstance(updated, dict) or updated.get('id') != UID or updated.get('email') != EMAIL:
            raise Stop('UPDATE_IDENTITY_MISMATCH')
        status, login = request('POST', TOKEN_PATH, admin_key,
                                {'email': EMAIL, 'password': password}, public_key=public_key)
        if status != 200 or not isinstance(login, dict) or not isinstance(login.get('access_token'), str):
            raise Stop('LOGIN_AFTER_UPDATE_FAILED')
        token = login['access_token']
        status, identity = request('GET', USER_PATH, admin_key,
                                   user_token=token, public_key=public_key)
        if status != 200 or not isinstance(identity, dict) or identity.get('id') != UID or identity.get('email') != EMAIL:
            raise Stop('LOGIN_IDENTITY_MISMATCH')
        create_private_json(RESULT, {'result': 'PASS_R4_A_PASSWORD_UPDATED_AND_LOGIN_VERIFIED',
                                     'project': PROJECT, 'user_id': UID, 'email': EMAIL,
                                     'source_sha256': sha(__file__),
                                     'finished_at_utc': dt.datetime.now(dt.timezone.utc).isoformat()})
        print('PASS_R4_A_PASSWORD_UPDATED_AND_LOGIN_VERIFIED')
        return 0
    finally:
        password = None
        admin_key = None


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--execute-user-approved', action='store_true')
    parser.add_argument('--expected-sha256')
    args = parser.parse_args(argv)
    if not args.execute_user_approved:
        print('STOP_REVIEW_ONLY_NO_EXECUTION')
        return 2
    if not sys.stdin.isatty() or not sys.stderr.isatty():
        print('STOP_LOCAL_TTY_REQUIRED')
        return 2
    try:
        return run(args.expected_sha256)
    except (Stop, OSError, ValueError, KeyError, TypeError, EOFError,
            getpass.GetPassWarning) as exc:
        code = str(exc) if isinstance(exc, Stop) and str(exc) in SAFE_CODES else 'UPDATE_UNCERTAIN'
        print('STOP_' + code)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
