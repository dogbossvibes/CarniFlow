#!/usr/bin/env python3
"""Review-only T115 exact-fixture JWT readback. No DB/Storage object writes.

Run only after explicit approval and the matching QA fixtures/grant are live.
Prompts locally for the public key and A/B passwords; prints only PASS/STOP.
"""
import argparse
import hashlib
import http.client
import json
from pathlib import Path
import runpy
import sys
from urllib.parse import quote, urlparse

core = runpy.run_path(str(Path(__file__).with_name('t115-auth-preflight.py')))
HOST = core['HOST']
USERS = core['USERS']
DOG = core['QA_DOG']
Stop = core['Stop']
WEIGHT = '3a990f90-8c01-4470-881f-c74e4bb7b8d4'
DOC = '69a8c81a-c166-4177-b6c8-74d29b3c8c02'
WEIGHT_INSERT_ATTEMPT = '06530b60-8c46-490d-acd7-ea394f983864'
DOC_INSERT_ATTEMPT = '3e17fcdd-7dd9-47e2-b9d9-99cd27405f8d'
PATH = f'{USERS[0][2]}/{DOG}/t115-qa-{DOC}.png'
PERMS = {'can_view_health_summary', 'can_view_weight', 'can_view_health_documents'}
PNG_SHA256 = '6b1048f8a6d40bac0b2954c18fefa40c4ea7a96120fc2e54b7317c0e43c2bbec'
WEIGHT_COLUMNS = {'id', 'dog_id', 'entry_date', 'weight_kg', 'created_at'}
WEIGHT_RPC = '/rest/v1/rpc/list_shared_dog_weights?p_dog_id=' + DOG


def api(key, token, method, path, body=None, binary=False):
    allowed = (
        any(path.startswith('/rest/v1/dog_health_entries?id=eq.' + fixture_id + '&')
            for fixture_id in (WEIGHT, WEIGHT_INSERT_ATTEMPT))
        or any(path.startswith('/rest/v1/dog_documents?id=eq.' + fixture_id + '&')
               for fixture_id in (DOC, DOC_INSERT_ATTEMPT))
        or path == WEIGHT_RPC
        or path == '/storage/v1/object/sign/dog-documents/' + quote(PATH, safe='/')
        or path == '/storage/v1/object/authenticated/dog-documents/' + quote(PATH, safe='/')
    )
    if not allowed or method not in ('GET', 'POST'):
        raise Stop('REQUEST_OUT_OF_SCOPE')
    if method == 'POST' and not path.startswith('/storage/v1/object/sign/'):
        raise Stop('REQUEST_OUT_OF_SCOPE')
    headers = {'apikey': key, 'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    conn = http.client.HTTPSConnection(HOST, timeout=20, context=core['tls_context']())
    try:
        conn.request(method, path, body=json.dumps(body) if body is not None else None, headers=headers)
        response = conn.getresponse()
        raw = response.read(65537)
        if len(raw) > 65536:
            raise Stop('RESPONSE_TOO_LARGE')
        if binary:
            return response.status, raw
        try:
            return response.status, json.loads(raw) if raw else None
        except ValueError:
            raise Stop('INVALID_RESPONSE_JSON') from None
    finally:
        conn.close()


def allowed_exact_row(table, fixture_id):
    return (table, fixture_id) in {
        ('dog_health_entries', WEIGHT), ('dog_health_entries', WEIGHT_INSERT_ATTEMPT),
        ('dog_documents', DOC), ('dog_documents', DOC_INSERT_ATTEMPT),
    }


def exact_rows(key, token, table, fixture_id):
    if not allowed_exact_row(table, fixture_id):
        raise Stop('EXACT_ROW_OUT_OF_SCOPE')
    cols = 'id,owner_id,dog_id,weight_kg,note' if table == 'dog_health_entries' else 'id,owner_id,dog_id,kind,category,subtype,title,file_url,note'
    path = f'/rest/v1/{table}?id=eq.{fixture_id}&select={quote(cols, safe=",")}'
    status, rows = api(key, token, 'GET', path)
    if status != 200 or not isinstance(rows, list):
        raise Stop('EXACT_ROW_HTTP_ERROR')
    if any(not isinstance(r, dict) or r.get('id') != fixture_id or r.get('dog_id') != DOG for r in rows):
        raise Stop('EXACT_ROW_ID_MISMATCH')
    return rows


def anon_row_denied(key, table, fixture_id):
    cols = 'id'
    path = f'/rest/v1/{table}?id=eq.{fixture_id}&select={cols}'
    status, rows = api(key, None, 'GET', path)
    return status in (401, 403, 404) or (status == 200 and rows == [])


def sign(key, token):
    return api(key, token, 'POST', '/storage/v1/object/sign/dog-documents/' + quote(PATH, safe='/'), {'expiresIn': 60})


def shared_weights(key, token):
    status, rows = api(key, token, 'GET', WEIGHT_RPC)
    if status == 404:
        raise Stop('NARROW_WEIGHT_RPC_MISSING')
    if status != 200 or not isinstance(rows, list):
        raise Stop('NARROW_WEIGHT_RPC_HTTP_ERROR')
    if any(not isinstance(r, dict) or set(r) != WEIGHT_COLUMNS
           or r.get('dog_id') != DOG or r.get('weight_kg') is None for r in rows):
        raise Stop('NARROW_WEIGHT_RPC_SHAPE_ERROR')
    return rows


def signed_png_status(signed):
    raw_url = signed.get('signedURL') or signed.get('signedUrl')
    parsed = urlparse(raw_url)
    if parsed.scheme and (parsed.scheme != 'https' or parsed.hostname != HOST):
        raise Stop('SIGNED_URL_HOST_MISMATCH')
    route = '/storage/v1' + parsed.path if parsed.path.startswith('/object/sign/') else parsed.path
    path = route + ('?' + parsed.query if parsed.query else '')
    if not path.startswith('/storage/v1/object/sign/dog-documents/' + quote(PATH, safe='/') + '?'):
        raise Stop('SIGNED_URL_PATH_MISMATCH')
    conn = http.client.HTTPSConnection(HOST, timeout=20, context=core['tls_context']())
    try:
        conn.request('GET', path)
        response = conn.getresponse()
        body = response.read(65537)
        if len(body) > 65536:
            raise Stop('SIGNED_PNG_RESPONSE_TOO_LARGE')
        return response.status, hashlib.sha256(body).hexdigest()
    finally:
        conn.close()


def check_signed_png(signed):
    status, digest = signed_png_status(signed)
    if status != 200 or digest != PNG_SHA256:
        raise Stop('SIGNED_PNG_READBACK_MISMATCH')


def login(key, label, email, uid):
    password = core['hidden'](f'R4-Konto {label} Passwort (verdeckt): ')
    try:
        status, data = core['request'](key, None, 'POST', '/auth/v1/token?grant_type=password', {'email': email, 'password': password})
    finally:
        password = None
    if status != 200 or not isinstance(data, dict) or not isinstance(data.get('access_token'), str):
        raise Stop('NORMAL_LOGIN_' + label + '_REJECTED')
    token = data['access_token']
    status, user = core['request'](key, token, 'GET', '/auth/v1/user')
    if status != 200 or not isinstance(user, dict) or user.get('id') != uid or user.get('email') != email:
        raise Stop('IDENTITY_' + label + '_MISMATCH')
    return token


def run(phase, key=None, tokens=None, expected_grant_id=None):
    if key is None:
        key = core['hidden']('Oeffentlicher Supabase Publishable-/Anon-Key (verdeckt): ').strip()
    if not core['public_key_ok'](key):
        raise Stop('PUBLIC_KEY_REQUIRED')
    if tokens is None:
        tokens = {label: login(key, label, email, uid) for label, email, uid in USERS}
    owner_weight = exact_rows(key, tokens['A'], 'dog_health_entries', WEIGHT)
    owner_doc = exact_rows(key, tokens['A'], 'dog_documents', DOC)
    if len(owner_weight) != 1 or len(owner_doc) != 1:
        raise Stop('OWNER_FIXTURE_MISSING')
    if owner_weight[0]['owner_id'] != USERS[0][2] or float(owner_weight[0]['weight_kg']) != 21.40:
        raise Stop('OWNER_WEIGHT_MISMATCH')
    if owner_doc[0]['owner_id'] != USERS[0][2] or owner_doc[0]['file_url'] != PATH:
        raise Stop('OWNER_DOCUMENT_MISMATCH')

    anon_rpc_status, _ = core['request'](key, None, 'GET', core['RPC'] + '?p_dog_id=' + DOG)
    if anon_rpc_status not in (401, 403, 404):
        raise Stop('ANON_RPC_NOT_DENIED')
    anon_weight_status, _ = api(key, None, 'GET', WEIGHT_RPC)
    if anon_weight_status not in (401, 403, 404):
        raise Stop('ANON_WEIGHT_RPC_NOT_DENIED')
    for table, fixture_id in (('dog_health_entries', WEIGHT), ('dog_documents', DOC)):
        if not anon_row_denied(key, table, fixture_id):
            raise Stop('ANON_EXACT_ROW_VISIBLE_OR_ERROR')
    status, _ = api(key, None, 'GET', '/storage/v1/object/authenticated/dog-documents/' + quote(PATH, safe='/'), binary=True)
    if status not in (400, 401, 403, 404):
        raise Stop('ANON_UNSIGNED_STORAGE_VISIBLE')

    shared = core['received'](key, tokens['B'], DOG, 'RECIPIENT_QA_DOG')
    b_direct_weight = exact_rows(key, tokens['B'], 'dog_health_entries', WEIGHT)
    if b_direct_weight:
        raise Stop('RECIPIENT_BASE_HEALTH_ROW_VISIBLE')
    b_weight = shared_weights(key, tokens['B'])
    b_doc = exact_rows(key, tokens['B'], 'dog_documents', DOC)
    sign_status, signed = sign(key, tokens['B'])
    if phase == 'active':
        if len(shared) != 1 or set(shared[0]['permissions']) != PERMS or len(b_weight) != 1 or len(b_doc) != 1:
            raise Stop('ACTIVE_READBACK_MISMATCH')
        if b_weight[0]['id'] != WEIGHT:
            raise Stop('ACTIVE_WEIGHT_FIXTURE_MISSING')
        if expected_grant_id is not None and shared[0]['grant_id'] != expected_grant_id:
            raise Stop('ACTIVE_GRANT_ID_MISMATCH')
        if sign_status != 200 or not isinstance(signed, dict) or not (signed.get('signedURL') or signed.get('signedUrl')):
            raise Stop('ACTIVE_SIGNING_FAILED')
        # The signed URL is intentionally neither printed nor persisted.
        check_signed_png(signed)
    else:
        if shared or b_weight or b_doc:
            raise Stop('INACTIVE_READBACK_VISIBLE')
        if sign_status not in (400, 401, 403, 404):
            raise Stop('INACTIVE_NEW_SIGNED_URL_ALLOWED')
    return 'PASS_T115_EXPANDED_' + phase.upper() + '_READBACK'


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('phase', choices=('active', 'inactive'))
    args = parser.parse_args()
    try:
        print(run(args.phase))
    except Stop as exc:
        print('STOP_' + str(exc), file=sys.stderr)
        sys.exit(2)
    except Exception:
        print('STOP_UNEXPECTED_READBACK_ERROR', file=sys.stderr)
        sys.exit(2)
