#!/usr/bin/env python3
"""T142 single synthetic event owner/nonowner DELETE acceptance. Review only.

Creates and removes exactly one new fixed QA event with normal A/B JWTs.
No account/customer records are changed. Requires separately approved execution.
"""
import argparse
import http.client
import json
import os
from pathlib import Path
import runpy
import stat
import sys

core = runpy.run_path(str(Path(__file__).parents[1] / 't115-health-sharing-db-05-20261029' / 't115-auth-preflight.py'))
Stop = core['Stop']
EVENT = 'c235f134-283f-4614-ae45-56bd8f392ea8'
OWNER = core['USERS'][0][2]
BASE = '/rest/v1/calendar_events'
EXACT = BASE + '?id=eq.' + EVENT + '&select=id,owner_id,created_by,title'
DELETE_EXACT = BASE + '?id=eq.' + EVENT
TITLE = 'T142 synthetic delete QA only'
PUBLIC_KEY_FILE = Path('<LOCAL_PRIVATE_TMP>/anyvo-map-production-env-correct.private')


def verified_public_key():
    info = PUBLIC_KEY_FILE.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
        raise Stop('PUBLIC_KEY_FILE_NOT_PRIVATE')
    fields = dict(line.split('=', 1) for line in PUBLIC_KEY_FILE.read_text().splitlines() if '=' in line)
    key = fields.get('EXPO_PUBLIC_SUPABASE_ANON_KEY', '')
    if (fields.get('EXPO_PUBLIC_BACKEND_ENV') != 'production'
            or fields.get('EXPO_PUBLIC_SUPABASE_URL') != 'https://' + core['HOST']
            or not core['public_key_ok'](key)):
        raise Stop('PUBLIC_KEY_FILE_TARGET_MISMATCH')
    return key


def request_exact(key, token, method, path, body=None):
    if (method, path) not in {('GET', EXACT), ('POST', BASE), ('DELETE', DELETE_EXACT)}:
        raise Stop('REQUEST_OUT_OF_SCOPE')
    headers = {'apikey': key, 'Authorization': 'Bearer ' + token,
               'Content-Type': 'application/json', 'Prefer': 'return=representation'}
    conn = http.client.HTTPSConnection(core['HOST'], timeout=20, context=core['tls_context']())
    try:
        conn.request(method, path, body=json.dumps(body, separators=(',', ':')) if body is not None else None, headers=headers)
        response = conn.getresponse()
        raw = response.read(65537)
        if len(raw) > 65536:
            raise Stop('RESPONSE_TOO_LARGE')
        try:
            return response.status, json.loads(raw) if raw else None
        except ValueError:
            raise Stop('INVALID_RESPONSE_JSON') from None
    finally:
        conn.close()


def login(key, label, email, uid):
    password = core['hidden'](f'R4-Konto {label} Passwort (verdeckt): ')
    try:
        status, data = core['request'](key, None, 'POST', '/auth/v1/token?grant_type=password',
                                       {'email': email, 'password': password})
    finally:
        password = None
    if status != 200 or not isinstance(data, dict) or not isinstance(data.get('access_token'), str):
        raise Stop('LOGIN_' + label + '_REJECTED')
    token = data['access_token']
    status, user = core['request'](key, token, 'GET', '/auth/v1/user')
    if status != 200 or not isinstance(user, dict) or user.get('id') != uid or user.get('email') != email:
        raise Stop('IDENTITY_' + label + '_MISMATCH')
    return token


def owner_rows(key, token):
    status, rows = request_exact(key, token, 'GET', EXACT)
    if status != 200 or not isinstance(rows, list):
        raise Stop('OWNER_READ_FAILED')
    if any(not isinstance(r, dict) or r.get('id') != EVENT for r in rows):
        raise Stop('OWNER_ROW_ID_MISMATCH')
    return rows


def run(key=None, tokens=None):
    if key is None:
        key = core['hidden']('Oeffentlicher Supabase Publishable-/Anon-Key (verdeckt): ').strip()
    if not core['public_key_ok'](key):
        raise Stop('PUBLIC_KEY_REQUIRED')
    if tokens is None:
        tokens = {label: login(key, label, email, uid) for label, email, uid in core['USERS']}
    if owner_rows(key, tokens['A']):
        raise Stop('QA_EVENT_ID_COLLISION')
    payload = {'id': EVENT, 'owner_id': OWNER, 'created_by': OWNER,
               'title': TITLE, 'type': 'training', 'status': 'confirmed',
               'start_at': '2026-11-02T12:00:00Z'}
    status, created = request_exact(key, tokens['A'], 'POST', BASE, payload)
    if status not in (200, 201) or not isinstance(created, list) or len(created) != 1:
        raise Stop('OWNER_INSERT_FAILED')
    if created[0].get('id') != EVENT or created[0].get('owner_id') != OWNER or created[0].get('created_by') != OWNER:
        raise Stop('OWNER_INSERT_SHAPE_MISMATCH')
    if len(owner_rows(key, tokens['A'])) != 1:
        raise Stop('OWNER_INSERT_NOT_VISIBLE')

    status, denied = request_exact(key, tokens['B'], 'DELETE', DELETE_EXACT)
    if not (status in (401, 403) or (status in (200, 204) and denied in (None, []))):
        raise Stop('NONOWNER_DELETE_NOT_DENIED')
    if len(owner_rows(key, tokens['A'])) != 1:
        raise Stop('NONOWNER_DELETE_CHANGED_EVENT')

    status, deleted = request_exact(key, tokens['A'], 'DELETE', DELETE_EXACT)
    if status not in (200, 204) or not isinstance(deleted, list) or len(deleted) != 1:
        raise Stop('OWNER_DELETE_FAILED')
    if deleted[0].get('id') != EVENT or deleted[0].get('owner_id') != OWNER:
        raise Stop('OWNER_DELETE_SHAPE_MISMATCH')
    if owner_rows(key, tokens['A']):
        raise Stop('OWNER_DELETE_NOT_PERSISTED')
    return 'PASS_T142_NORMAL_JWT_OWNER_NONOWNER_DELETE'


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--execute-approved', action='store_true')
    parser.add_argument('--use-verified-public-key', action='store_true')
    args = parser.parse_args()
    if not args.execute_approved:
        print('STOP_EXPLICIT_APPROVAL_REQUIRED', file=sys.stderr)
        sys.exit(2)
    try:
        print(run(verified_public_key() if args.use_verified_public_key else None))
    except Stop as exc:
        print('STOP_' + str(exc), file=sys.stderr)
        sys.exit(2)
    except Exception:
        print('STOP_UNEXPECTED_CALENDAR_QA_ERROR', file=sys.stderr)
        sys.exit(2)
