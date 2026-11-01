#!/usr/bin/env python3
"""T115 local identity preflight. No application-data reads or writes."""
import base64
import datetime as dt
import getpass
import http.client
import json
import os
import pathlib
import re
import ssl
import stat
import sys
import warnings
from urllib.parse import quote

HOST = 'axkkhyqrjrtbkumaulta.supabase.co'
USERS = (
    ('A', 'anyvo-r4-20261018-owner-a@qa.anyvo.invalid', '68910959-e849-4860-b408-ebc234fec611'),
    ('B', 'anyvo-r4-20261018-recipient-b@qa.anyvo.invalid', '0327d914-99e4-4e6e-b89e-3b642586a3b8'),
)
QA_DOG = 'b4991851-e569-51fc-a0af-4e0172f2bc63'
OLD_A_DOG = '1237cf1b-68d6-5f0a-a184-d64061cb7389'
OWN_B_DOG = 'f9421044-55cd-54a9-9de0-1187754d5c91'
RPC = '/rest/v1/rpc/list_received_health_dogs'
READ_PERMISSIONS = frozenset({
    'can_view_health_summary', 'can_view_weight', 'can_view_vaccinations',
    'can_view_parasite_treatments', 'can_view_medications', 'can_view_diagnoses',
    'can_view_allergies', 'can_view_vet_visits', 'can_view_vet_reports',
    'can_view_lab_results', 'can_view_health_documents', 'can_view_emergency_info',
})


class Stop(Exception):
    pass


class OpenGate(Exception):
    pass


def parse_server_time(value):
    # macOS /usr/bin/python3 3.9 accepts only 3 or 6 fractional digits in
    # fromisoformat. PostgreSQL may emit any precision from 1 to 6 digits.
    match = re.fullmatch(r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)', value)
    if not match:
        raise ValueError('invalid server timestamp')
    offset = match.group(3)
    if offset == 'Z':
        offset = '+00:00'
    elif len(offset) == 3:
        offset += ':00'
    elif len(offset) == 5:
        offset = offset[:3] + ':' + offset[3:]
    fraction = '.' + match.group(2).ljust(6, '0') if match.group(2) else ''
    return dt.datetime.fromisoformat(match.group(1) + fraction + offset)


def hidden(prompt):
    if not sys.stdin.isatty() or not sys.stderr.isatty():
        raise Stop('LOCAL_TTY_REQUIRED')
    with warnings.catch_warnings():
        warnings.simplefilter('error', getpass.GetPassWarning)
        return getpass.getpass(prompt)


def public_key_ok(key):
    if key.startswith('sb_publishable_'):
        return True
    try:
        claims = json.loads(base64.urlsafe_b64decode(key.split('.')[1] + '==='))
        return claims.get('role') == 'anon' and claims.get('ref') == HOST.split('.')[0]
    except (ValueError, IndexError, TypeError):
        return False


def tls_context():
    context = ssl.create_default_context()
    paths = ssl.get_default_verify_paths()
    if sys.platform == 'darwin' and not paths.cafile and not paths.capath and not os.environ.get('SSL_CERT_FILE') and not os.environ.get('SSL_CERT_DIR'):
        certificate = pathlib.Path('/etc/ssl/cert.pem')
        info = certificate.stat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise Stop('UNTRUSTED_SYSTEM_CA')
        context.load_verify_locations(cafile=str(certificate))
    if context.verify_mode != ssl.CERT_REQUIRED or not context.check_hostname:
        raise Stop('TLS_VERIFICATION_REQUIRED')
    return context


def request(key, token, method, path, body=None):
    auth_path = (method, path) in (('POST', '/auth/v1/token?grant_type=password'), ('GET', '/auth/v1/user'))
    rpc_path = method == 'GET' and path.startswith(RPC + '?p_dog_id=') and path[len(RPC + '?p_dog_id='):] in (QA_DOG, OLD_A_DOG, OWN_B_DOG)
    if not (auth_path or rpc_path):
        raise Stop('REQUEST_OUT_OF_SCOPE')
    headers = {'apikey': key, 'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    conn = http.client.HTTPSConnection(HOST, timeout=20, context=tls_context())
    try:
        conn.request(method, path, body=json.dumps(body, separators=(',', ':')) if body else None, headers=headers)
        response = conn.getresponse()
        raw = response.read(65537)
        if len(raw) > 65536:
            raise Stop('RESPONSE_TOO_LARGE')
        try:
            data = json.loads(raw) if raw else None
        except ValueError:
            raise Stop('INVALID_AUTH_RESPONSE') from None
        return response.status, data
    finally:
        conn.close()


def received(key, token, dog_id, phase='DIRECT'):
    status, data = request(key, token, 'GET', RPC + '?p_dog_id=' + quote(dog_id, safe=''))
    if status == 404:
        raise OpenGate('RPC_NOT_INSTALLED_OR_NOT_EXPOSED')
    if status != 200 or not isinstance(data, list):
        raise Stop('RPC_HTTP_ERROR')
    for row in data:
        if (not isinstance(row, dict) or set(row) != {'grant_id', 'dog_id', 'dog_name', 'owner_display_name', 'starts_at', 'expires_at', 'permissions'}
                or row.get('dog_id') != dog_id
                or not isinstance(row.get('grant_id'), str)
                or not isinstance(row.get('dog_name'), str) or not row['dog_name']
                or not (row.get('owner_display_name') is None or isinstance(row.get('owner_display_name'), str))
                or not isinstance(row.get('starts_at'), str)
                or not (row.get('expires_at') is None or isinstance(row.get('expires_at'), str))
                or not isinstance(row.get('permissions'), list)
                or not row['permissions']
                or not all(isinstance(p, str) and p in READ_PERMISSIONS for p in row['permissions'])):
            raise Stop('INVALID_RPC_CONTRACT')
        try:
            start = parse_server_time(row['starts_at'])
            end = parse_server_time(row['expires_at']) if row['expires_at'] else None
        except ValueError:
            raise Stop(f'INVALID_GRANT_TIMESTAMP_{phase}') from None
        if start.tzinfo is None or (end and end.tzinfo is None):
            raise Stop(f'GRANT_TIMESTAMP_TZ_MISSING_{phase}')
        now = dt.datetime.now(dt.timezone.utc)
        if start > now:
            delta = max(0, int((start - now).total_seconds()))
            raise Stop(f'INACTIVE_GRANT_FUTURE_START_{phase}_DELTA_{delta}S')
        if end and end <= now:
            delta = max(0, int((now - end).total_seconds()))
            raise Stop(f'INACTIVE_GRANT_EXPIRED_{phase}_DELTA_{delta}S')
    return data


def main():
    key = hidden('Oeffentlicher Supabase Publishable-/Anon-Key (verdeckt): ').strip()
    if not public_key_ok(key):
        raise Stop('PUBLIC_KEY_REQUIRED')
    tokens = {}
    for label, email, expected_uid in USERS:
        password = hidden(f'R4-Konto {label} Passwort (verdeckt): ')
        try:
            status, session = request(key, None, 'POST', '/auth/v1/token?grant_type=password', {'email': email, 'password': password})
        finally:
            password = None
        if status != 200 or not isinstance(session, dict) or not isinstance(session.get('access_token'), str):
            raise Stop(f'NORMAL_LOGIN_{label}_REJECTED')
        token = session['access_token']
        status, user = request(key, token, 'GET', '/auth/v1/user')
        if status != 200 or not isinstance(user, dict) or user.get('id') != expected_uid or user.get('email') != email or not user.get('email_confirmed_at'):
            raise Stop(f'IDENTITY_{label}_MISMATCH')
        tokens[label] = token
        token = None
    own = received(key, tokens['A'], QA_DOG, 'OWNER_QA_DOG')
    if own:
        raise Stop('OWNER_RECEIVED_OWN_DOG')
    positive = received(key, tokens['B'], QA_DOG, 'RECIPIENT_QA_DOG')
    # The authenticated positive call proves that the RPC exists; anonymous
    # access must now fail rather than return even an empty successful result.
    anon_status, _ = request(key, None, 'GET', RPC + '?p_dog_id=' + QA_DOG)
    if anon_status not in (401, 403, 404):
        raise Stop('ANON_RPC_NOT_DENIED')
    if received(key, tokens['B'], OWN_B_DOG, 'RECIPIENT_OWN_DOG'):
        raise Stop('RECIPIENT_SEES_OWN_DOG_AS_SHARED')
    if received(key, tokens['B'], OLD_A_DOG, 'RECIPIENT_OTHER_DOG'):
        raise OpenGate('OTHER_QA_DOG_ALREADY_GRANTED')
    if not positive:
        raise OpenGate('NO_POSITIVE_QA_GRANT')
    return 'PASS_T115_R4_A_B_RPC_READ_ONLY'


if __name__ == '__main__':
    try:
        print(main())
    except OpenGate as exc:
        print(f'OPEN_{exc}', file=sys.stderr)
        sys.exit(3)
    except Stop as exc:
        print(f'STOP_{exc}', file=sys.stderr)
        sys.exit(2)
    except (KeyboardInterrupt, EOFError, getpass.GetPassWarning):
        print('STOP_LOCAL_INPUT_CANCELLED', file=sys.stderr)
        sys.exit(2)
    except (OSError, ssl.SSLError, http.client.HTTPException):
        print('STOP_NETWORK_OR_TLS_UNCERTAIN', file=sys.stderr)
        sys.exit(2)
    except Exception:
        print('STOP_UNEXPECTED_AUTH_PREFLIGHT_ERROR', file=sys.stderr)
        sys.exit(2)
