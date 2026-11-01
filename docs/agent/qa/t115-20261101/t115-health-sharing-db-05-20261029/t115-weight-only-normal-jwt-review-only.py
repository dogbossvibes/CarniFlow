#!/usr/bin/env python3
"""T115 fixed R4 weight-only QA. Inert without --execute-approved.

Network scope: normal A/B auth and exact synthetic dog/row/grant REST paths.
Never prints credentials, tokens, row values or server response bodies.
"""
import argparse
import datetime as dt
import http.client
import json
from pathlib import Path
import runpy
import sys
import time
from zoneinfo import ZoneInfo

BASE = Path(__file__).parent
core = runpy.run_path(str(BASE / 't115-auth-preflight.py'))
key_source = runpy.run_path(str(BASE.parent / 't142-calendar-delete-db-05-20261030' / 't142-normal-jwt-delete-review-only.py'))
Stop = core['Stop']
OWNER = core['USERS'][0][2]
RECIPIENT = core['USERS'][1][2]
DOG = core['QA_DOG']
ROW = '3a990f90-8c01-4470-881f-c74e4bb7b8d4'
PROBE = '06530b60-8c46-490d-acd7-ea394f983864'
GRANT1 = '960ca869-a158-418b-8670-dc36093c1a11'
GRANT2 = '538d7e81-7159-4d75-840f-4eeebd3153d9'
NOTE = 'T115 synthetic weight-only QA'
ATTACK_NOTE = 'T115 unauthorized B update attempt'
DATE = '2026-11-01'
ROW_PATH = '/rest/v1/dog_health_entries?id=eq.' + ROW + '&select=id,owner_id,dog_id,entry_date,weight_kg,note,load_level,is_rest_day,is_intense,created_at'
PROBE_PATH = '/rest/v1/dog_health_entries?id=eq.' + PROBE + '&select=id'
ROW_WRITE = '/rest/v1/dog_health_entries?id=eq.' + ROW
GRANTS = '/rest/v1/dog_health_access_grants'
GRANT_PATH = {g: GRANTS + '?id=eq.' + g + '&select=id,dog_id,owner_id,connection_id,grantee_user_id,starts_at,expires_at,revoked_at,can_view_weight,can_view_health_summary,can_view_vaccinations,can_view_parasite_treatments,can_view_medications,can_view_diagnoses,can_view_allergies,can_view_vet_visits,can_view_vet_reports,can_view_lab_results,can_view_health_documents,can_view_emergency_info,can_edit_health,can_add_vet_notes' for g in (GRANT1, GRANT2)}
GRANT_WRITE = {g: GRANTS + '?id=eq.' + g for g in (GRANT1, GRANT2)}
CONNECTION = '/rest/v1/connections?owner_user_id=eq.' + OWNER + '&connected_user_id=eq.' + RECIPIENT + '&status=eq.accepted&select=id,owner_user_id,connected_user_id,status'
DOG_PATH = '/rest/v1/dogs?id=eq.' + DOG + '&select=id,owner_id'
ALL_HEALTH_PATH = '/rest/v1/dog_health_entries?dog_id=eq.' + DOG + '&select=id'
GRANT_LIST = GRANTS + '?dog_id=eq.' + DOG + '&grantee_user_id=eq.' + RECIPIENT + '&select=id,starts_at,expires_at,revoked_at'
RPC = '/rest/v1/rpc/list_shared_dog_weights?p_dog_id=' + DOG
EXPECTED_RPC_KEYS = {'id', 'dog_id', 'entry_date', 'weight_kg', 'created_at'}
PERMISSIONS = ('can_view_health_summary', 'can_view_weight', 'can_view_vaccinations',
               'can_view_parasite_treatments', 'can_view_medications', 'can_view_diagnoses',
               'can_view_allergies', 'can_view_vet_visits', 'can_view_vet_reports',
               'can_view_lab_results', 'can_view_health_documents', 'can_view_emergency_info',
               'can_edit_health', 'can_add_vet_notes')

ALLOWED = {('A', 'GET', ROW_PATH), ('B', 'GET', ROW_PATH), ('A', 'GET', PROBE_PATH), ('B', 'GET', PROBE_PATH),
           ('A', 'GET', CONNECTION), ('A', 'GET', DOG_PATH),
           ('A', 'GET', ALL_HEALTH_PATH), ('A', 'GET', GRANT_LIST),
           ('B', 'GET', RPC), ('anon', 'GET', RPC),
           ('A', 'POST', '/rest/v1/dog_health_entries'),
           ('B', 'POST', '/rest/v1/dog_health_entries'),
           ('A', 'PATCH', ROW_WRITE), ('B', 'PATCH', ROW_WRITE),
           ('A', 'DELETE', ROW_WRITE), ('B', 'DELETE', ROW_WRITE),
           ('A', 'POST', GRANTS)}
for _grant in (GRANT1, GRANT2):
    ALLOWED.add(('A', 'GET', GRANT_PATH[_grant]))
    ALLOWED.add(('A', 'PATCH', GRANT_WRITE[_grant]))

_deadline = None
_cleanup_mode = False


def iso(when):
    return when.astimezone(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def utcnow():
    return dt.datetime.now(dt.timezone.utc)


def exact_body(label, method, path, body):
    """Fail closed before transmission if a write escapes fixed IDs/fields."""
    if method == 'GET':
        return body is None
    if path == ROW_WRITE and method == 'DELETE':
        return body is None
    if not isinstance(body, dict):
        return False
    if path == '/rest/v1/dog_health_entries' and label == 'A':
        return body == {'id': ROW, 'dog_id': DOG, 'owner_id': OWNER,
                        'entry_date': DATE, 'weight_kg': 21.40, 'note': NOTE}
    if path == '/rest/v1/dog_health_entries' and label == 'B':
        return body == {'id': PROBE, 'dog_id': DOG, 'owner_id': RECIPIENT,
                        'entry_date': DATE, 'weight_kg': 99.00, 'note': ATTACK_NOTE}
    if path == ROW_WRITE and method == 'PATCH':
        return body == {'note': NOTE + ' owner updated'} if label == 'A' else body == {'note': ATTACK_NOTE}
    if path == GRANTS and label == 'A':
        try:
            start = core['parse_server_time'](body['starts_at'])
            end = core['parse_server_time'](body['expires_at'])
        except (KeyError, TypeError, ValueError):
            return False
        now = utcnow()
        return (body.get('id') in (GRANT1, GRANT2) and
                set(body) == {'id', 'dog_id', 'owner_id', 'connection_id', 'grantee_user_id',
                              'role_preset', 'starts_at', 'expires_at', *PERMISSIONS} and
                body['dog_id'] == DOG and body['owner_id'] == OWNER and
                body['grantee_user_id'] == RECIPIENT and body['role_preset'] == 'custom' and
                dt.timedelta(0) < end - start <= dt.timedelta(minutes=5) and
                end <= now + dt.timedelta(minutes=5) and
                all(body[p] is (p == 'can_view_weight') for p in PERMISSIONS))
    if path in GRANT_WRITE.values() and label == 'A' and method == 'PATCH':
        if set(body) not in ({'starts_at'}, {'revoked_at'}) or not all(isinstance(x, str) for x in body.values()):
            return False
        if 'starts_at' in body and path != GRANT_WRITE[GRANT1]:
            return False
        try:
            when = core['parse_server_time'](next(iter(body.values())))
        except ValueError:
            return False
        return abs((when - utcnow()).total_seconds()) <= 60
    return False


def api(key, tokens, label, method, path, body=None):
    if _deadline is not None and not _cleanup_mode and time.monotonic() >= _deadline:
        raise Stop('TOTAL_15_MINUTE_DEADLINE')
    if (label, method, path) not in ALLOWED or not exact_body(label, method, path, body):
        raise Stop('REQUEST_OUT_OF_SCOPE')
    token = tokens.get(label)
    if label != 'anon' and not token:
        raise Stop('MISSING_NORMAL_JWT')
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
        raise Stop('ROW_READ_FAILED')
    return data


def expect_one(status, data, expected_id, failure):
    if status not in (200, 201) or not isinstance(data, list) or len(data) != 1 or not isinstance(data[0], dict) or data[0].get('id') != expected_id:
        raise Stop(failure)
    return data[0]


def owner_row(key, tokens):
    found = rows(key, tokens, 'A', ROW_PATH)
    if len(found) > 1 or (found and (found[0].get('id') != ROW or found[0].get('dog_id') != DOG or found[0].get('owner_id') != OWNER)):
        raise Stop('OWNER_ROW_SCOPE_MISMATCH')
    return found


def shared(key, tokens, expected_count):
    found = rows(key, tokens, 'B', RPC)
    if len(found) != expected_count:
        raise Stop('SHARED_WEIGHT_COUNT_MISMATCH')
    for row in found:
        if (not isinstance(row, dict) or set(row) != EXPECTED_RPC_KEYS or row['id'] != ROW or
                row['dog_id'] != DOG or row['entry_date'] != DATE or
                not isinstance(row['weight_kg'], (int, float)) or isinstance(row['weight_kg'], bool) or
                abs(row['weight_kg'] - 21.40) > 0.0001 or
                not isinstance(row['created_at'], str)):
            raise Stop('SHARED_WEIGHT_SHAPE_MISMATCH')


def grant_row(key, tokens, grant_id, connection_id=None, expected_start=None, latest_expiry=None):
    found = rows(key, tokens, 'A', GRANT_PATH[grant_id])
    if len(found) != 1 or not isinstance(found[0], dict):
        raise Stop('GRANT_READBACK_MISMATCH')
    grant = found[0]
    if (grant.get('id') != grant_id or grant.get('dog_id') != DOG or
            grant.get('owner_id') != OWNER or grant.get('grantee_user_id') != RECIPIENT or
            any(grant.get(p) is not (p == 'can_view_weight') for p in PERMISSIONS)):
        raise Stop('GRANT_SCOPE_MISMATCH')
    try:
        start = core['parse_server_time'](grant['starts_at'])
        expiry = core['parse_server_time'](grant['expires_at'])
    except (KeyError, TypeError, ValueError):
        raise Stop('GRANT_TIME_INVALID') from None
    if not dt.timedelta(0) < expiry - start <= dt.timedelta(minutes=5):
        raise Stop('GRANT_WINDOW_EXCEEDED')
    if connection_id is not None and grant.get('connection_id') != connection_id:
        raise Stop('GRANT_CONNECTION_MISMATCH')
    if expected_start is not None and start != expected_start:
        raise Stop('GRANT_START_MISMATCH')
    if latest_expiry is not None and expiry > latest_expiry:
        raise Stop('GRANT_EXPIRY_EXTENDED')
    return grant


def no_b_write(key, tokens, method, path, body, code):
    status, data = api(key, tokens, 'B', method, path, body)
    if status in (401, 403):
        return
    if status in (200, 201, 204) and data in (None, []):
        return
    raise Stop(code)


def revoke(key, tokens, grant_id):
    grant_row(key, tokens, grant_id)
    revoke_scoped(key, tokens, grant_id)


def revoke_scoped(key, tokens, grant_id):
    """Emergency cleanup may revoke a widened grant, but never another scope."""
    found = rows(key, tokens, 'A', GRANT_PATH[grant_id])
    if len(found) != 1 or not isinstance(found[0], dict):
        raise Stop('GRANT_CLEANUP_SCOPE_UNCERTAIN')
    grant = found[0]
    if (grant.get('id') != grant_id or grant.get('dog_id') != DOG or
            grant.get('owner_id') != OWNER or grant.get('grantee_user_id') != RECIPIENT):
        raise Stop('GRANT_CLEANUP_SCOPE_UNCERTAIN')
    if grant['revoked_at'] is not None:
        return
    status, data = api(key, tokens, 'A', 'PATCH', GRANT_WRITE[grant_id], {'revoked_at': iso(utcnow())})
    updated = expect_one(status, data, grant_id, 'GRANT_REVOKE_FAILED')
    if updated.get('revoked_at') is None:
        raise Stop('GRANT_REVOKE_NOT_PERSISTED')
    checked = rows(key, tokens, 'A', GRANT_PATH[grant_id])
    if len(checked) != 1 or not isinstance(checked[0], dict) or checked[0].get('revoked_at') is None:
        raise Stop('GRANT_REVOKE_NOT_PERSISTED')


def login(key, label, email, uid):
    password = core['hidden']('R4-Konto ' + label + ' Passwort (verdeckt): ')
    try:
        status, session = core['request'](key, None, 'POST', '/auth/v1/token?grant_type=password', {'email': email, 'password': password})
    finally:
        password = None
    if status != 200 or not isinstance(session, dict) or not isinstance(session.get('access_token'), str):
        raise Stop('NORMAL_LOGIN_' + label + '_REJECTED')
    token = session['access_token']
    status, user = core['request'](key, token, 'GET', '/auth/v1/user')
    if status != 200 or not isinstance(user, dict) or user.get('id') != uid or user.get('email') != email or not user.get('email_confirmed_at'):
        raise Stop('IDENTITY_' + label + '_MISMATCH')
    return token


def run(key=None, tokens=None):
    global _deadline, _cleanup_mode
    if utcnow().astimezone(ZoneInfo('Europe/Zurich')).date().isoformat() != DATE:
        raise Stop('QA_DATE_EXPIRED_REFRESH_PLAN')
    if key is None:
        key = key_source['verified_public_key']()
    if not core['public_key_ok'](key):
        raise Stop('PUBLIC_KEY_REQUIRED')
    if tokens is None:
        tokens = {label: login(key, label, email, uid) for label, email, uid in core['USERS']}
    deadline = time.monotonic() + 15 * 60
    _deadline = deadline
    _cleanup_mode = False
    attempted = set()
    expiry1 = None
    failure = None
    try:
        if owner_row(key, tokens) or rows(key, tokens, 'B', PROBE_PATH) or rows(key, tokens, 'A', PROBE_PATH):
            raise Stop('FIXED_ROW_ID_COLLISION')
        for grant_id in (GRANT1, GRANT2):
            if rows(key, tokens, 'A', GRANT_PATH[grant_id]):
                raise Stop('FIXED_GRANT_ID_COLLISION')
        connections = rows(key, tokens, 'A', CONNECTION)
        if len(connections) != 1 or connections[0].get('owner_user_id') != OWNER or connections[0].get('connected_user_id') != RECIPIENT:
            raise Stop('CONNECTION_DRIFT')
        connection_id = connections[0].get('id')
        if not isinstance(connection_id, str):
            raise Stop('CONNECTION_ID_INVALID')
        dogs = rows(key, tokens, 'A', DOG_PATH)
        if len(dogs) != 1 or dogs[0].get('id') != DOG or dogs[0].get('owner_id') != OWNER:
            raise Stop('DOG_OWNER_DRIFT')
        if rows(key, tokens, 'A', ALL_HEALTH_PATH):
            raise Stop('SYNTHETIC_DOG_HEALTH_NOT_EMPTY')
        for grant in rows(key, tokens, 'A', GRANT_LIST):
            if not isinstance(grant, dict) or set(grant) != {'id', 'starts_at', 'expires_at', 'revoked_at'}:
                raise Stop('HISTORICAL_GRANT_SHAPE_INVALID')
            try:
                start = core['parse_server_time'](grant['starts_at'])
                end = core['parse_server_time'](grant['expires_at']) if grant['expires_at'] else None
            except (TypeError, ValueError):
                raise Stop('HISTORICAL_GRANT_TIME_INVALID') from None
            if grant['revoked_at'] is None and start <= utcnow() and (end is None or end > utcnow()):
                raise Stop('ACTIVE_GRANT_PREEXISTS')
        shared(key, tokens, 0)
        if rows(key, tokens, 'B', ROW_PATH):
            raise Stop('NO_GRANT_DIRECT_ROW_VISIBLE')
        status, data = api(key, tokens, 'anon', 'GET', RPC)
        if status not in (401, 403, 404):
            raise Stop('ANON_RPC_NOT_DENIED')
        status, data = api(key, tokens, 'A', 'POST', '/rest/v1/dog_health_entries',
                           {'id': ROW, 'dog_id': DOG, 'owner_id': OWNER,
                            'entry_date': DATE, 'weight_kg': 21.40, 'note': NOTE})
        expect_one(status, data, ROW, 'OWNER_INSERT_FAILED')
        before = owner_row(key, tokens)
        if len(before) != 1 or before[0].get('note') != NOTE:
            raise Stop('OWNER_INSERT_NOT_PERSISTED')
        status, data = api(key, tokens, 'A', 'PATCH', ROW_WRITE, {'note': NOTE + ' owner updated'})
        expect_one(status, data, ROW, 'OWNER_UPDATE_FAILED')
        baseline = owner_row(key, tokens)
        if len(baseline) != 1 or baseline[0].get('note') != NOTE + ' owner updated':
            raise Stop('OWNER_UPDATE_NOT_PERSISTED')
        shared(key, tokens, 0)
        if rows(key, tokens, 'B', ROW_PATH):
            raise Stop('NO_GRANT_DIRECT_ROW_VISIBLE')

        def make_grant(grant_id, start, expiry):
            if time.monotonic() >= deadline:
                raise Stop('TOTAL_15_MINUTE_DEADLINE')
            body = {'id': grant_id, 'dog_id': DOG, 'owner_id': OWNER,
                    'connection_id': connection_id, 'grantee_user_id': RECIPIENT,
                    'role_preset': 'custom', 'starts_at': iso(start), 'expires_at': iso(expiry),
                    **{p: p == 'can_view_weight' for p in PERMISSIONS}}
            attempted.add(grant_id)
            status, result = api(key, tokens, 'A', 'POST', GRANTS, body)
            expect_one(status, result, grant_id, 'GRANT_CREATE_FAILED')
            grant_row(key, tokens, grant_id, connection_id,
                      core['parse_server_time'](body['starts_at']),
                      core['parse_server_time'](body['expires_at']))

        now = utcnow()
        expiry1 = core['parse_server_time'](iso(now + dt.timedelta(seconds=240)))
        make_grant(GRANT1, now + dt.timedelta(seconds=90), now + dt.timedelta(seconds=240))
        if utcnow() >= core['parse_server_time'](iso(now + dt.timedelta(seconds=90))):
            raise Stop('FUTURE_WINDOW_ELAPSED')
        shared(key, tokens, 0)
        status, result = api(key, tokens, 'A', 'PATCH', GRANT_WRITE[GRANT1],
                             {'starts_at': iso(utcnow() - dt.timedelta(seconds=5))})
        expect_one(status, result, GRANT1, 'GRANT_ACTIVATION_FAILED')
        active_grant = grant_row(key, tokens, GRANT1, connection_id, latest_expiry=expiry1)
        if active_grant['revoked_at'] is not None:
            raise Stop('GRANT_UNEXPECTED_REVOCATION')
        if core['parse_server_time'](active_grant['starts_at']) > utcnow():
            raise Stop('GRANT_ACTIVATION_NOT_PERSISTED')
        shared(key, tokens, 1)
        no_b_write(key, tokens, 'POST', '/rest/v1/dog_health_entries',
                   {'id': PROBE, 'dog_id': DOG, 'owner_id': RECIPIENT,
                    'entry_date': DATE, 'weight_kg': 99.00, 'note': ATTACK_NOTE},
                   'UNAUTHORIZED_INSERT_SUCCEEDED_PROBE_RETAINED')
        if rows(key, tokens, 'B', PROBE_PATH) or rows(key, tokens, 'A', PROBE_PATH):
            raise Stop('UNAUTHORIZED_INSERT_PROBE_VISIBLE_RETAINED')
        no_b_write(key, tokens, 'PATCH', ROW_WRITE, {'note': ATTACK_NOTE},
                   'UNAUTHORIZED_UPDATE_SUCCEEDED')
        if owner_row(key, tokens) != baseline:
            raise Stop('UNAUTHORIZED_UPDATE_CHANGED_OWNER_ROW')
        no_b_write(key, tokens, 'DELETE', ROW_WRITE, None,
                   'UNAUTHORIZED_DELETE_SUCCEEDED')
        if owner_row(key, tokens) != baseline:
            raise Stop('UNAUTHORIZED_DELETE_CHANGED_OWNER_ROW')
        revoke(key, tokens, GRANT1)
        shared(key, tokens, 0)
        if rows(key, tokens, 'B', ROW_PATH):
            raise Stop('REVOKED_DIRECT_ROW_VISIBLE')
        now = utcnow()
        make_grant(GRANT2, now - dt.timedelta(seconds=5), now + dt.timedelta(seconds=45))
        shared(key, tokens, 1)
        while utcnow() <= now + dt.timedelta(seconds=47):
            if time.monotonic() >= deadline:
                raise Stop('TOTAL_15_MINUTE_DEADLINE')
            time.sleep(1)
        shared(key, tokens, 0)
        if rows(key, tokens, 'B', ROW_PATH):
            raise Stop('EXPIRED_DIRECT_ROW_VISIBLE')
        if owner_row(key, tokens) != baseline:
            raise Stop('OWNER_ROW_CHANGED')
        status, result = api(key, tokens, 'A', 'DELETE', ROW_WRITE)
        expect_one(status, result, ROW, 'OWNER_DELETE_FAILED')
        if owner_row(key, tokens):
            raise Stop('OWNER_DELETE_NOT_PERSISTED')
        if time.monotonic() >= deadline:
            raise Stop('TOTAL_15_MINUTE_DEADLINE')
        return 'PASS_T115_R4_WEIGHT_ONLY_NORMAL_JWT'
    except BaseException as exc:
        failure = exc
        raise
    finally:
        _cleanup_mode = True
        cleanup_failed = False
        for grant_id in attempted:
            try:
                found = rows(key, tokens, 'A', GRANT_PATH[grant_id])
                if found:
                    revoke_scoped(key, tokens, grant_id)
            except BaseException:
                cleanup_failed = True
        _cleanup_mode = False
        _deadline = None
        if cleanup_failed:
            raise Stop('GRANT_REVOKE_UNCERTAIN') from failure


if __name__ == '__main__':
    args = argparse.ArgumentParser()
    args.add_argument('--execute-approved', action='store_true')
    opts = args.parse_args()
    if not opts.execute_approved:
        print('STOP_EXPLICIT_APPROVAL_REQUIRED', file=sys.stderr)
        sys.exit(2)
    try:
        print(run())
    except Stop as exc:
        print('STOP_' + str(exc), file=sys.stderr)
        sys.exit(2)
    except (KeyboardInterrupt, EOFError):
        print('STOP_LOCAL_INPUT_CANCELLED', file=sys.stderr)
        sys.exit(2)
    except Exception:
        print('STOP_UNEXPECTED_WEIGHT_QA_ERROR', file=sys.stderr)
        sys.exit(2)
