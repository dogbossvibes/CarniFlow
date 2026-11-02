#!/usr/bin/env python3
"""T115 exact R4 Health section readback, inert without --execute-approved.

No mutation endpoints. Uses only normal JWTs for fixed R4 A/B and fixed synthetic
row IDs/path. The signed URL is kept in memory and never printed or persisted.
"""
import argparse
import datetime as dt
import hashlib
import http.client
import json
from pathlib import Path
import runpy
import sys
import time
from urllib.parse import quote, urlparse

BASE = Path('${PROJECT_ROOT}/outputs/t115-health-sharing-db-05-20261029')
fixture_identity = runpy.run_path('${PROJECT_ROOT}/outputs/t115-integration-review-01-20261102/t115-fixture-identity-01.py')
core = runpy.run_path(str(BASE / 't115-auth-preflight.py'))
qa = runpy.run_path(str(BASE / 't115-expanded-readback-review-only.py'))
Stop = core['Stop']
OWNER = core['USERS'][0][2]
RECIPIENT = core['USERS'][1][2]
DOG = core['QA_DOG']
GRANT = 'ce59ad68-02d0-4543-89fc-56bebb11e7e5'
MANIFEST = Path(__file__).parent / 'T115-HEALTH-SECTIONS-FIXTURES-REVIEW-20261102.json'
MANIFEST_SHA256 = 'f9c8f8e8bfe80c3ab3d419fb8228ee8ff0f9d0e6e2cb21331d7f585e2024e468'
manifest_bytes = MANIFEST.read_bytes()
if hashlib.sha256(manifest_bytes).hexdigest() != MANIFEST_SHA256:
    raise Stop('FIXTURE_MANIFEST_DRIFT')
FIX = json.loads(manifest_bytes)
ROWS = {table: {item['id']: item for item in items} for table, items in FIX['fixtures'].items()}
PATH = FIX['png_path']
PNG_HASH = FIX['png_sha256']
if (FIX['production_project'] != core['HOST'].split('.')[0]
        or FIX['png_size_bytes'] != 68
        or PNG_HASH != '2aa4fa20701cdd6d8d56046069001186b5267e3ee7d0ef618ad2f4a683723e11'):
    raise Stop('FIXTURE_SCOPE_DRIFT')
DOC = '4cf382c6-b315-4dfb-b175-eb6b3ebcfa52'
PERMS = frozenset(('can_view_vaccinations','can_view_parasite_treatments',
 'can_view_medications','can_view_diagnoses','can_view_allergies',
 'can_view_vet_visits','can_view_health_documents','can_view_lab_results',
 'can_view_vet_reports'))
INBOX = '/rest/v1/rpc/list_received_health_dogs?p_dog_id=' + DOG
DOG_OWNER_A = '/rest/v1/dogs?id=eq.' + DOG + '&owner_id=eq.' + OWNER + '&select=id,owner_id'
DOG_OWNER_B = '/rest/v1/dogs?id=eq.' + DOG + '&owner_id=eq.' + RECIPIENT + '&select=id,owner_id'
STORAGE = '/storage/v1/object/authenticated/dog-documents/' + quote(PATH, safe='/')
SIGN = '/storage/v1/object/sign/dog-documents/' + quote(PATH, safe='/')
EXACT = {(table, item_id): f'/rest/v1/{table}?id=eq.{item_id}&select=*'
         for table, items in ROWS.items() for item_id in items}
ALLOWED = {('A', 'GET', DOG_OWNER_A), ('B', 'GET', DOG_OWNER_B),
           ('B', 'GET', INBOX), ('anon', 'GET', INBOX),
           ('A', 'GET', STORAGE), ('B', 'GET', STORAGE), ('anon', 'GET', STORAGE),
           ('A', 'POST', SIGN), ('B', 'POST', SIGN)}
for path in EXACT.values():
    ALLOWED.update({('A', 'GET', path), ('B', 'GET', path), ('anon', 'GET', path)})
READ_DEADLINE = None
READ_CLEANUP_MODE = False


def request(key, tokens, who, method, path, body=None, binary=False):
    if READ_DEADLINE is not None and not READ_CLEANUP_MODE and time.monotonic() >= READ_DEADLINE:
        raise Stop('TOTAL_10_MINUTE_DEADLINE')
    if (who, method, path) not in ALLOWED or (method == 'POST' and body != {'expiresIn': 60}) or (method == 'GET' and body is not None):
        raise Stop('READBACK_REQUEST_OUT_OF_SCOPE')
    token = tokens.get(who)
    if who != 'anon' and not token:
        raise Stop('NORMAL_JWT_REQUIRED')
    headers = {'apikey': key, 'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    conn = http.client.HTTPSConnection(core['HOST'], timeout=20, context=core['tls_context']())
    try:
        conn.request(method, path, body=json.dumps(body,separators=(',',':')) if body is not None else None, headers=headers)
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


def rows(key,tokens,who,path):
    status,data=request(key,tokens,who,'GET',path)
    if status != 200 or not isinstance(data,list):
        raise Stop('ROW_READ_FAILED')
    return data


def exact_row(key,tokens,who,table,item_id,expected):
    found=rows(key,tokens,who,EXACT[(table,item_id)])
    if len(found) != expected:
        raise Stop('EXACT_ROW_COUNT_MISMATCH')
    for row in found:
        if not isinstance(row,dict) or row.get('id') != item_id or row.get('dog_id') != DOG or row.get('owner_id') != OWNER:
            raise Stop('EXACT_ROW_SCOPE_MISMATCH')
        fixture=ROWS[table][item_id]
        if not fixture_identity['matches'](table, fixture, row):
            raise Stop('EXACT_ROW_CONTENT_MISMATCH')
    return found


def signed_png(signed):
    if READ_DEADLINE is not None and not READ_CLEANUP_MODE and time.monotonic() >= READ_DEADLINE:
        raise Stop('TOTAL_10_MINUTE_DEADLINE')
    if not isinstance(signed,dict):
        raise Stop('SIGNED_URL_INVALID')
    raw=signed.get('signedURL') or signed.get('signedUrl')
    if not isinstance(raw,str):
        raise Stop('SIGNED_URL_INVALID')
    parsed=urlparse(raw)
    if parsed.scheme and (parsed.scheme != 'https' or parsed.hostname != core['HOST']):
        raise Stop('SIGNED_URL_HOST_MISMATCH')
    route='/storage/v1'+parsed.path if parsed.path.startswith('/object/sign/') else parsed.path
    path=route+('?' + parsed.query if parsed.query else '')
    if not path.startswith(SIGN+'?') or not parsed.query:
        raise Stop('SIGNED_URL_PATH_MISMATCH')
    conn=http.client.HTTPSConnection(core['HOST'],timeout=20,context=core['tls_context']())
    try:
        conn.request('GET',path)
        response=conn.getresponse()
        content=response.read(65537)
        if len(content)>65536:
            raise Stop('SIGNED_PNG_TOO_LARGE')
        return response.status,hashlib.sha256(content).hexdigest()
    finally:
        conn.close()


def validate_active_inbox(inbox, now=None):
    if len(inbox)!=1 or not isinstance(inbox[0],dict):
        raise Stop('ACTIVE_INBOX_MISMATCH')
    item=inbox[0]
    if (set(item)!={'grant_id','dog_id','dog_name','owner_display_name','starts_at','expires_at','permissions'}
            or item['grant_id']!=GRANT or item['dog_id']!=DOG
            or not isinstance(item['dog_name'],str) or not item['dog_name']
            or item['owner_display_name'] is not None and not isinstance(item['owner_display_name'],str)
            or not isinstance(item['permissions'],list) or len(item['permissions'])!=len(PERMS)
            or set(item['permissions'])!=PERMS):
        raise Stop('ACTIVE_INBOX_MISMATCH')
    try:
        start=core['parse_server_time'](item['starts_at'])
        expiry=core['parse_server_time'](item['expires_at'])
    except (ValueError,TypeError):
        raise Stop('ACTIVE_INBOX_TIME_INVALID') from None
    now=now or dt.datetime.now(dt.timezone.utc)
    if start>now or expiry<=now or expiry-start>dt.timedelta(minutes=5):
        raise Stop('ACTIVE_INBOX_TIME_MISMATCH')


def run(phase,key=None,tokens=None):
    if key is None:
        key=core['hidden']('Oeffentlicher Supabase Publishable-/Anon-Key (verdeckt): ').strip()
    if not core['public_key_ok'](key):
        raise Stop('PUBLIC_KEY_REQUIRED')
    if tokens is None:
        tokens={label:qa['login'](key,label,email,uid) for label,email,uid in core['USERS']}
    owner=rows(key,tokens,'A',DOG_OWNER_A)
    recipient_owner=rows(key,tokens,'B',DOG_OWNER_B)
    if owner != [{'id':DOG,'owner_id':OWNER}] or recipient_owner:
        raise Stop('OWNER_ONLY_DOG_PROBE_MISMATCH')
    for table,items in ROWS.items():
        for item_id in items:
            exact_row(key,tokens,'A',table,item_id,1)
            exact_row(key,tokens,'B',table,item_id,1 if phase=='active' else 0)
            status,data=request(key,tokens,'anon','GET',EXACT[(table,item_id)])
            if not (status in (401,403,404) or (status==200 and data==[])):
                raise Stop('ANON_ROW_VISIBLE_OR_ERROR')
    inbox=rows(key,tokens,'B',INBOX)
    if phase=='active':
        validate_active_inbox(inbox)
    elif inbox:
        raise Stop('INACTIVE_INBOX_VISIBLE')
    anon_status,_=request(key,tokens,'anon','GET',INBOX)
    if anon_status not in (401,403,404):
        raise Stop('ANON_INBOX_NOT_DENIED')
    status,content=request(key,tokens,'A','GET',STORAGE,binary=True)
    if status!=200 or len(content)!=FIX['png_size_bytes'] or hashlib.sha256(content).hexdigest()!=PNG_HASH:
        raise Stop('OWNER_PNG_MISMATCH')
    anon_status,_=request(key,tokens,'anon','GET',STORAGE,binary=True)
    if anon_status not in (400,401,403,404):
        raise Stop('ANON_UNSIGNED_PNG_VISIBLE')
    sign_status,signed=request(key,tokens,'B','POST',SIGN,{'expiresIn':60})
    if phase=='active':
        if sign_status!=200 or signed_png(signed)!=(200,PNG_HASH):
            raise Stop('RECIPIENT_SIGNED_PNG_MISMATCH')
        unsigned_status,content=request(key,tokens,'B','GET',STORAGE,binary=True)
        if unsigned_status!=200 or hashlib.sha256(content).hexdigest()!=PNG_HASH:
            raise Stop('RECIPIENT_AUTH_PNG_MISMATCH')
    elif sign_status not in (400,401,403,404):
        raise Stop('INACTIVE_NEW_SIGNED_URL_ALLOWED')
    return 'PASS_T115_SECTIONS_'+phase.upper()+'_NORMAL_JWT'


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('phase',choices=('active','inactive'))
    parser.add_argument('--execute-approved',action='store_true')
    args=parser.parse_args()
    if not args.execute_approved:
        print('STOP_EXPLICIT_APPROVAL_REQUIRED',file=sys.stderr)
        sys.exit(2)
    try:
        print(run(args.phase))
    except Stop as exc:
        print('STOP_'+str(exc),file=sys.stderr)
        sys.exit(2)
    except Exception:
        print('STOP_UNEXPECTED_SECTIONS_READBACK_ERROR',file=sys.stderr)
        sys.exit(2)
