#!/usr/bin/env python3
"""T115 Stage B post-policy normal-JWT QA; inert without --execute-approved."""
import argparse
import datetime as dt
import hashlib
import http.client
import json
import os
from pathlib import Path
import runpy
import sys
import time
from zoneinfo import ZoneInfo

BASE = Path(__file__).parent
AUTHOR = BASE.parent / 't115-health-sharing-db-05-20261029'
core = runpy.run_path(str(AUTHOR / 't115-auth-preflight.py'))
qa = runpy.run_path(str(AUTHOR / 't115-weight-only-normal-jwt-review-only.py'))
key_source = runpy.run_path(str(BASE.parent / 't142-calendar-delete-db-05-20261030' / 't142-normal-jwt-delete-review-only.py'))
Stop = core['Stop']
OWNER = core['USERS'][0][2]
RECIPIENT = core['USERS'][1][2]
DOG = core['QA_DOG']
ROW = '4b9f52c0-6d1d-46d7-91a7-29d978fc8d9d'
GRANT = '15d25b20-49a7-4c3b-8706-039b37ca3c5d'
DATE = '2026-11-02'
NOTE = 'T115 Stage B post-policy synthetic QA only'
PERMISSIONS = qa['PERMISSIONS']
TABLE = '/rest/v1/dog_health_entries'
ROW_READ = TABLE + '?id=eq.' + ROW + '&select=id,owner_id,dog_id,entry_date,weight_kg,note,load_level,is_rest_day,is_intense,created_at'
ROW_WRITE = TABLE + '?id=eq.' + ROW
DOG_ROWS = TABLE + '?dog_id=eq.' + DOG + '&select=id'
DOG_OWNER_A = '/rest/v1/dogs?id=eq.' + DOG + '&owner_id=eq.' + OWNER + '&select=id,owner_id'
DOG_OWNER_B = '/rest/v1/dogs?id=eq.' + DOG + '&owner_id=eq.' + RECIPIENT + '&select=id,owner_id'
CONNECTION = '/rest/v1/connections?owner_user_id=eq.' + OWNER + '&connected_user_id=eq.' + RECIPIENT + '&status=eq.accepted&select=id,owner_user_id,connected_user_id,status'
GRANTS = '/rest/v1/dog_health_access_grants'
GRANT_READ = GRANTS + '?id=eq.' + GRANT + '&select=id,dog_id,owner_id,connection_id,grantee_user_id,starts_at,expires_at,revoked_at,' + ','.join(PERMISSIONS)
GRANT_WRITE = GRANTS + '?id=eq.' + GRANT
GRANT_LIST = GRANTS + '?dog_id=eq.' + DOG + '&grantee_user_id=eq.' + RECIPIENT + '&select=id,starts_at,expires_at,revoked_at,can_view_weight'
RPC = '/rest/v1/rpc/list_shared_dog_weights?p_dog_id=' + DOG
RPC_FIELDS = {'id', 'dog_id', 'entry_date', 'weight_kg', 'created_at'}
INBOX = '/rest/v1/rpc/list_received_health_dogs?p_dog_id=' + DOG
INBOX_FIELDS = {'grant_id', 'dog_id', 'dog_name', 'owner_display_name', 'starts_at', 'expires_at', 'permissions'}
ALLOWED = {
    ('A', 'GET', ROW_READ), ('B', 'GET', ROW_READ),
    ('A', 'GET', DOG_ROWS), ('A', 'GET', DOG_OWNER_A), ('B', 'GET', DOG_OWNER_B), ('A', 'GET', CONNECTION),
    ('A', 'GET', GRANT_READ), ('A', 'GET', GRANT_LIST),
    ('B', 'GET', RPC), ('anon', 'GET', RPC), ('B', 'GET', INBOX),
    ('A', 'POST', TABLE), ('A', 'PATCH', ROW_WRITE), ('A', 'DELETE', ROW_WRITE),
    ('A', 'POST', GRANTS), ('A', 'PATCH', GRANT_WRITE),
}
_deadline = None
_cleanup_mode = False
_phase = 'not_started'
_cleanup = {'grant': 'not_attempted', 'row': 'not_attempted'}


def now():
    return dt.datetime.now(dt.timezone.utc)


def iso(value):
    return value.astimezone(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def exact_body(label, method, path, body):
    if method == 'GET' or (method == 'DELETE' and path == ROW_WRITE):
        return body is None
    if not isinstance(body, dict):
        return False
    if (label, method, path) == ('A', 'POST', TABLE):
        return body == {'id': ROW, 'owner_id': OWNER, 'dog_id': DOG,
                        'entry_date': DATE, 'weight_kg': 21.40, 'note': NOTE}
    if (label, method, path) == ('A', 'PATCH', ROW_WRITE):
        return body == {'note': NOTE + ' owner updated'}
    if (label, method, path) == ('A', 'POST', GRANTS):
        try:
            start = core['parse_server_time'](body['starts_at'])
            expiry = core['parse_server_time'](body['expires_at'])
        except (KeyError, ValueError, TypeError):
            return False
        return (set(body) == {'id', 'owner_id', 'dog_id', 'connection_id',
                              'grantee_user_id', 'role_preset', 'starts_at',
                              'expires_at', *PERMISSIONS}
                and body['id'] == GRANT and body['owner_id'] == OWNER
                and body['dog_id'] == DOG and body['grantee_user_id'] == RECIPIENT
                and body['role_preset'] == 'custom'
                and dt.timedelta(0) < expiry - start <= dt.timedelta(minutes=5)
                and expiry <= now() + dt.timedelta(minutes=5)
                and all(body[p] is (p == 'can_view_weight') for p in PERMISSIONS))
    if (label, method, path) == ('A', 'PATCH', GRANT_WRITE):
        if set(body) != {'revoked_at'} or not isinstance(body['revoked_at'], str):
            return False
        try:
            stamp = core['parse_server_time'](body['revoked_at'])
        except ValueError:
            return False
        return abs((stamp - now()).total_seconds()) <= 60
    return False


def api(key, tokens, label, method, path, body=None):
    if _deadline is not None and not _cleanup_mode and time.monotonic() >= _deadline:
        raise Stop('TOTAL_10_MINUTE_DEADLINE')
    if (label, method, path) not in ALLOWED or not exact_body(label, method, path, body):
        raise Stop('REQUEST_OUT_OF_SCOPE')
    token = tokens.get(label)
    if label != 'anon' and not token:
        raise Stop('NORMAL_JWT_REQUIRED')
    headers = {'apikey': key, 'Content-Type': 'application/json', 'Prefer': 'return=representation'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    conn = http.client.HTTPSConnection(core['HOST'], timeout=20, context=core['tls_context']())
    try:
        conn.request(method, path, body=json.dumps(body, separators=(',', ':')) if body is not None else None, headers=headers)
        response = conn.getresponse()
        raw = response.read(65537)
        if len(raw) > 65536:
            raise Stop('RESPONSE_TOO_LARGE')
        try:
            data = json.loads(raw) if raw else None
        except ValueError:
            raise Stop('INVALID_RESPONSE_JSON') from None
        return response.status, data
    finally:
        conn.close()


def rows(key, tokens, label, path):
    status, data = api(key, tokens, label, 'GET', path)
    if status != 200 or not isinstance(data, list):
        raise Stop('READ_FAILED')
    return data


def one(status, data, item_id, code):
    if status not in (200, 201) or not isinstance(data, list) or len(data) != 1 or not isinstance(data[0], dict) or data[0].get('id') != item_id:
        raise Stop(code)
    return data[0]


def owner_row(key, tokens):
    found = rows(key, tokens, 'A', ROW_READ)
    if len(found) > 1 or (found and (found[0].get('id') != ROW or found[0].get('dog_id') != DOG or found[0].get('owner_id') != OWNER)):
        raise Stop('OWNER_ROW_SCOPE_MISMATCH')
    return found


def recipient_direct_empty(key, tokens):
    if rows(key, tokens, 'B', ROW_READ):
        raise Stop('RECIPIENT_DIRECT_TABLE_VISIBLE')


def recipient_rpc(key, tokens, expected):
    found = rows(key, tokens, 'B', RPC)
    if len(found) != expected:
        raise Stop('RECIPIENT_RPC_COUNT_MISMATCH')
    for item in found:
        if (not isinstance(item, dict) or set(item) != RPC_FIELDS or item['id'] != ROW
                or item['dog_id'] != DOG or item['entry_date'] != DATE
                or not isinstance(item['weight_kg'], (int, float)) or isinstance(item['weight_kg'], bool)
                or abs(item['weight_kg'] - 21.40) > 0.0001
                or not isinstance(item['created_at'], str)):
            raise Stop('RECIPIENT_RPC_SHAPE_MISMATCH')


def recipient_inbox(key, tokens, expected):
    found = rows(key, tokens, 'B', INBOX)
    if len(found) != expected:
        raise Stop('RECIPIENT_INBOX_COUNT_MISMATCH')
    for item in found:
        if (not isinstance(item, dict) or set(item) != INBOX_FIELDS
                or item['grant_id'] != GRANT or item['dog_id'] != DOG
                or not isinstance(item['dog_name'], str) or not item['dog_name']
                or item['owner_display_name'] is not None and not isinstance(item['owner_display_name'], str)
                or not isinstance(item['starts_at'], str)
                or item['expires_at'] is not None and not isinstance(item['expires_at'], str)
                or item['permissions'] != ['can_view_weight']):
            raise Stop('RECIPIENT_INBOX_SHAPE_MISMATCH')
        try:
            start = core['parse_server_time'](item['starts_at'])
            expiry = core['parse_server_time'](item['expires_at'])
        except (ValueError, TypeError):
            raise Stop('RECIPIENT_INBOX_TIME_INVALID') from None
        if start > now() or expiry <= now():
            raise Stop('RECIPIENT_INBOX_NOT_ACTIVE')


def grant_read(key, tokens):
    found = rows(key, tokens, 'A', GRANT_READ)
    if len(found) != 1 or not isinstance(found[0], dict):
        raise Stop('GRANT_READBACK_MISMATCH')
    return found[0]


def revoke_exact(key, tokens):
    found = rows(key, tokens, 'A', GRANT_READ)
    if not found:
        return
    if len(found) != 1 or not isinstance(found[0], dict):
        raise Stop('GRANT_CLEANUP_SCOPE_UNCERTAIN')
    grant = found[0]
    if grant.get('id') != GRANT or grant.get('dog_id') != DOG or grant.get('owner_id') != OWNER or grant.get('grantee_user_id') != RECIPIENT:
        raise Stop('GRANT_CLEANUP_SCOPE_UNCERTAIN')
    if grant.get('revoked_at') is not None:
        return
    status, data = api(key, tokens, 'A', 'PATCH', GRANT_WRITE, {'revoked_at': iso(now())})
    updated = one(status, data, GRANT, 'REVOKE_FAILED')
    if updated.get('revoked_at') is None or grant_read(key, tokens).get('revoked_at') is None:
        raise Stop('REVOKE_NOT_PERSISTED')


def delete_exact_synthetic_row(key, tokens):
    found = owner_row(key, tokens)
    if not found:
        return
    row = found[0]
    if (len(found) != 1 or row.get('entry_date') != DATE
            or row.get('note') not in (NOTE, NOTE + ' owner updated')
            or not isinstance(row.get('weight_kg'), (int, float))
            or isinstance(row.get('weight_kg'), bool)
            or abs(row['weight_kg'] - 21.40) > 0.0001
            or row.get('load_level') is not None or row.get('is_rest_day') is not False
            or row.get('is_intense') is not False):
        raise Stop('ROW_CLEANUP_SCOPE_UNCERTAIN')
    try:
        api(key, tokens, 'A', 'DELETE', ROW_WRITE)
    except BaseException:
        if owner_row(key, tokens):
            raise Stop('ROW_DELETE_UNCERTAIN') from None
    if owner_row(key, tokens):
        raise Stop('ROW_DELETE_NOT_PERSISTED')


def run(key=None, tokens=None, deadline=None):
    global _deadline, _cleanup_mode, _phase, _cleanup
    _phase = 'date_guard'
    _cleanup = {'grant': 'not_attempted', 'row': 'not_attempted'}
    if now().astimezone(ZoneInfo('Europe/Zurich')).date().isoformat() != DATE:
        raise Stop('QA_DATE_EXPIRED_REFRESH_PLAN')
    if key is None:
        key = key_source['verified_public_key']()
    if not core['public_key_ok'](key):
        raise Stop('PUBLIC_KEY_REQUIRED')
    if tokens is None:
        tokens = {label: qa['login'](key, label, email, uid) for label, email, uid in core['USERS']}
    _deadline = min(time.monotonic() + 10 * 60, deadline) if deadline is not None else time.monotonic() + 10 * 60
    _cleanup_mode = False
    attempted_row = False
    attempted_grant = False
    failure = None
    try:
        _phase = 'preflight'
        if owner_row(key, tokens) or rows(key, tokens, 'A', GRANT_READ):
            raise Stop('FIXED_ID_COLLISION')
        dogs = rows(key, tokens, 'A', DOG_OWNER_A)
        if len(dogs) != 1 or dogs[0].get('id') != DOG or dogs[0].get('owner_id') != OWNER:
            raise Stop('DOG_OWNER_DRIFT')
        if rows(key, tokens, 'B', DOG_OWNER_B):
            raise Stop('RECIPIENT_OWNER_PROBE_NOT_EMPTY')
        connections = rows(key, tokens, 'A', CONNECTION)
        if len(connections) != 1 or connections[0].get('owner_user_id') != OWNER or connections[0].get('connected_user_id') != RECIPIENT or connections[0].get('status') != 'accepted':
            raise Stop('CONNECTION_DRIFT')
        connection_id = connections[0].get('id')
        if not isinstance(connection_id, str):
            raise Stop('CONNECTION_ID_INVALID')
        if rows(key, tokens, 'A', DOG_ROWS):
            raise Stop('SYNTHETIC_DOG_HEALTH_NOT_EMPTY')
        for grant in rows(key, tokens, 'A', GRANT_LIST):
            if not isinstance(grant, dict) or set(grant) != {'id', 'starts_at', 'expires_at', 'revoked_at', 'can_view_weight'}:
                raise Stop('GRANT_LIST_SHAPE_INVALID')
            try:
                starts = core['parse_server_time'](grant['starts_at'])
                expires = core['parse_server_time'](grant['expires_at']) if grant['expires_at'] else None
            except (ValueError, TypeError):
                raise Stop('GRANT_LIST_TIME_INVALID') from None
            if grant['can_view_weight'] and grant['revoked_at'] is None and starts <= now() and (expires is None or expires > now()):
                raise Stop('ACTIVE_WEIGHT_GRANT_PREEXISTS')
        recipient_rpc(key, tokens, 0)
        recipient_inbox(key, tokens, 0)
        recipient_direct_empty(key, tokens)
        status, _ = api(key, tokens, 'anon', 'GET', RPC)
        if status not in (401, 403, 404):
            raise Stop('ANON_RPC_NOT_DENIED')
        attempted_row = True
        _phase = 'row_insert'
        status, data = api(key, tokens, 'A', 'POST', TABLE,
                           {'id': ROW, 'owner_id': OWNER, 'dog_id': DOG,
                            'entry_date': DATE, 'weight_kg': 21.40, 'note': NOTE})
        one(status, data, ROW, 'OWNER_INSERT_FAILED')
        before = owner_row(key, tokens)
        if len(before) != 1 or before[0].get('note') != NOTE:
            raise Stop('OWNER_INSERT_NOT_PERSISTED')
        recipient_direct_empty(key, tokens)
        stamp = now()
        body = {'id': GRANT, 'owner_id': OWNER, 'dog_id': DOG,
                'connection_id': connection_id, 'grantee_user_id': RECIPIENT,
                'role_preset': 'custom', 'starts_at': iso(stamp-dt.timedelta(seconds=5)),
                'expires_at': iso(stamp+dt.timedelta(seconds=120)),
                **{p: p == 'can_view_weight' for p in PERMISSIONS}}
        attempted_grant = True
        _phase = 'grant_insert'
        status, data = api(key, tokens, 'A', 'POST', GRANTS, body)
        one(status, data, GRANT, 'GRANT_INSERT_FAILED')
        grant = grant_read(key, tokens)
        try:
            start = core['parse_server_time'](grant['starts_at'])
            expiry = core['parse_server_time'](grant['expires_at'])
        except (KeyError, ValueError, TypeError):
            raise Stop('GRANT_TIME_INVALID') from None
        if (grant.get('id') != GRANT or grant.get('dog_id') != DOG or grant.get('owner_id') != OWNER
                or grant.get('grantee_user_id') != RECIPIENT or grant.get('connection_id') != connection_id
                or grant.get('revoked_at') is not None
                or any(grant.get(p) is not (p == 'can_view_weight') for p in PERMISSIONS)
                or not dt.timedelta(0) < expiry-start <= dt.timedelta(minutes=5)
                or expiry > core['parse_server_time'](body['expires_at'])
                or start > now() or expiry <= now()):
            raise Stop('GRANT_SCOPE_OR_TIME_MISMATCH')
        recipient_rpc(key, tokens, 1)
        _phase = 'active_checks'
        recipient_inbox(key, tokens, 1)
        recipient_direct_empty(key, tokens)
        status, data = api(key, tokens, 'A', 'PATCH', ROW_WRITE, {'note': NOTE + ' owner updated'})
        one(status, data, ROW, 'OWNER_UPDATE_FAILED')
        after = owner_row(key, tokens)
        if len(after) != 1 or after[0].get('note') != NOTE + ' owner updated':
            raise Stop('OWNER_UPDATE_NOT_PERSISTED')
        recipient_direct_empty(key, tokens)
        revoke_exact(key, tokens)
        _phase = 'revoked_checks'
        recipient_rpc(key, tokens, 0)
        recipient_inbox(key, tokens, 0)
        recipient_direct_empty(key, tokens)
        delete_exact_synthetic_row(key, tokens)
        _phase = 'complete'
        return 'PASS_T115_STAGE_B_NORMAL_JWT_OWNER_RECIPIENT_ISOLATION'
    except BaseException as exc:
        failure = exc
        raise
    finally:
        _cleanup_mode = True
        grant_cleanup_failed = False
        row_cleanup_failed = False
        if attempted_grant:
            try:
                revoke_exact(key, tokens)
                _cleanup['grant'] = 'revoked_or_absent'
            except BaseException:
                grant_cleanup_failed = True
                _cleanup['grant'] = 'uncertain'
        if attempted_row:
            try:
                delete_exact_synthetic_row(key, tokens)
                _cleanup['row'] = 'deleted_or_absent'
            except BaseException:
                row_cleanup_failed = True
                _cleanup['row'] = 'uncertain'
        _cleanup_mode = False
        _deadline = None
        if grant_cleanup_failed or row_cleanup_failed:
            code = ('GRANT_AND_ROW_CLEANUP_UNCERTAIN' if grant_cleanup_failed and row_cleanup_failed else
                    'GRANT_REVOKE_UNCERTAIN' if grant_cleanup_failed else 'ROW_CLEANUP_UNCERTAIN')
            raise Stop(code) from failure


def write_safe_result(code):
    """Write only fixed IDs and status; never persist credentials or API responses."""
    source = Path(__file__)
    report = {'code': code, 'phase': _phase, 'cleanup': _cleanup,
              'row_id': ROW, 'grant_id': GRANT,
              'runner_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
              'finished_at_utc': iso(now())}
    target = BASE / ('T115-STAGE-B-POST-POLICY-RESULT-' + now().strftime('%Y%m%dT%H%M%S%fZ') + '.json')
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    fd = os.open(target, flags, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as out:
        json.dump(report, out, sort_keys=True, separators=(',', ':'))
        out.write('\n')
        out.flush()
        os.fsync(out.fileno())
    return target


if __name__ == '__main__':
    args = argparse.ArgumentParser()
    args.add_argument('--execute-approved', action='store_true')
    opts = args.parse_args()
    if not opts.execute_approved:
        print('STOP_EXPLICIT_APPROVAL_REQUIRED', file=sys.stderr)
        sys.exit(2)
    try:
        result = run()
        write_safe_result(result)
        print(result)
    except Stop as exc:
        code = 'STOP_' + str(exc)
        write_safe_result(code)
        print(code, file=sys.stderr)
        sys.exit(2)
    except (KeyboardInterrupt, EOFError):
        write_safe_result('STOP_LOCAL_INPUT_CANCELLED')
        print('STOP_LOCAL_INPUT_CANCELLED', file=sys.stderr)
        sys.exit(2)
    except Exception:
        write_safe_result('STOP_UNEXPECTED_STAGE_B_QA_ERROR')
        print('STOP_UNEXPECTED_STAGE_B_QA_ERROR', file=sys.stderr)
        sys.exit(2)
