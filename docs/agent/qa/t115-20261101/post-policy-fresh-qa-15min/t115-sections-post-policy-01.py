#!/usr/bin/env python3
"""T115 synthetic R4 Health/Docs/Storage QA. INERT until exact approval + Stage-B PASS.

Only fixed existing A/B accounts, one fixed dog, 10 fixture rows, one PNG and one
<=5-minute read grant. All requests use normal JWT. Never logs secrets/URLs/bodies.
"""
import argparse
import datetime as dt
import hashlib
import http.client
import json
import os
from pathlib import Path
import runpy
import re
import sys
import time
from urllib.parse import quote
from zoneinfo import ZoneInfo

BASE=Path('${PROJECT_ROOT}/outputs/t115-health-sharing-db-05-20261029')
r=runpy.run_path('${PROJECT_ROOT}/outputs/t115-integration-review-01-20261101/t115-sections-readback-time-aware-01.py')
fixture_identity = r['fixture_identity']
core=r['core']; qa=r['qa']; Stop=core['Stop']
key_source=runpy.run_path(str(BASE.parent/'t142-calendar-delete-db-05-20261030'/'t142-normal-jwt-delete-review-only.py'))
A=r['OWNER']; B=r['RECIPIENT']; DOG=r['DOG']; GRANT=r['GRANT']
FIX=r['FIX']; ROWS=r['ROWS']; PNG_PATH=BASE/'t115-health-synthetic-1x1.png'
PATH=r['PATH']; PNG_HASH=r['PNG_HASH']; PERMS=r['PERMS']
CONNECTION=f'/rest/v1/connections?owner_user_id=eq.{A}&connected_user_id=eq.{B}&status=eq.accepted&select=id,owner_user_id,connected_user_id,status'
GRANTS='/rest/v1/dog_health_access_grants'
GRANT_READ=GRANTS+f'?id=eq.{GRANT}&select=*'
GRANT_WRITE=GRANTS+f'?id=eq.{GRANT}'
GRANT_LIST=GRANTS+f'?dog_id=eq.{DOG}&grantee_user_id=eq.{B}&select=id,starts_at,expires_at,revoked_at'
STORAGE='/storage/v1/object/dog-documents/'+quote(PATH,safe='/')
AUTH_STORAGE=r['STORAGE']
PROBES={'dog_health_vaccinations':'a42cdf8d-ee27-422b-8fb7-310945b8e682',
'dog_deworming_entries':'1c8b6ee9-a67f-4f2a-b89b-574aa28b9b55',
'dog_health_medications':'35f584ca-e396-4e3a-b414-e71a4b1f95f4',
'dog_health_conditions':'d6bc3e73-f711-472f-8447-75f3546d2ad6',
'dog_vet_appointments':'4e4177e3-5c20-4088-a629-61fd42d036af',
'dog_documents':'3b5ff949-f7c4-408f-8a9a-f25138703425'}
ALL_FLAGS=tuple(sorted(core['READ_PERMISSIONS']))+('can_edit_health','can_add_vet_notes')
PROBE_READ={table:f'/rest/v1/{table}?id=eq.{item_id}&select=*' for table,item_id in PROBES.items()}
PROBE_DELETE={table:f'/rest/v1/{table}?id=eq.{item_id}' for table,item_id in PROBES.items()}
TABLES=tuple(ROWS)
IDS={(table,item_id) for table,items in ROWS.items() for item_id in items}
ATTEMPTED_ROWS=set(); ATTEMPTED_PROBES=set(); ATTEMPTED_GRANT=False; ATTEMPTED_STORAGE=False
STORAGE_CREATION='none'
FIRST_INSERT_FAILURE=None
PHASE='not_started'; CLEANUP={'grant':'not_attempted','storage':'not_attempted','rows':'not_attempted','probes':'not_attempted'}
DEADLINE=None; CLEANUP_MODE=False
CONNECTION_ID=None


def now(): return dt.datetime.now(dt.timezone.utc)
def iso(value): return value.isoformat(timespec='seconds').replace('+00:00','Z')

def api(key,tokens,who,method,path,body=None,binary=False):
    if DEADLINE is not None and not CLEANUP_MODE and time.monotonic()>=DEADLINE: raise Stop('TOTAL_10_MINUTE_DEADLINE')
    allowed=False
    if who=='A' and method=='GET' and path in (CONNECTION,GRANT_READ,GRANT_LIST,AUTH_STORAGE): allowed=True
    if who=='A' and method=='POST' and path==GRANTS and isinstance(body,dict):
        try:
            start=core['parse_server_time'](body['starts_at']); expiry=core['parse_server_time'](body['expires_at'])
            allowed=(set(body)=={'id','owner_id','dog_id','connection_id','grantee_user_id','role_preset','starts_at','expires_at',*ALL_FLAGS}
                and body['id']==GRANT and body['owner_id']==A and body['dog_id']==DOG
                and body['grantee_user_id']==B and body['role_preset']=='custom'
                and CONNECTION_ID is not None and body['connection_id']==CONNECTION_ID
                and dt.timedelta(0)<expiry-start<=dt.timedelta(minutes=5)
                and expiry<=now()+dt.timedelta(minutes=5)
                and all(body[p] is (p in PERMS) for p in ALL_FLAGS))
        except (KeyError,TypeError,ValueError): allowed=False
    if who=='A' and method=='PATCH' and path==GRANT_WRITE and isinstance(body,dict) and set(body)=={'revoked_at'}:
        try: allowed=abs((core['parse_server_time'](body['revoked_at'])-now()).total_seconds())<=60
        except (ValueError,TypeError): allowed=False
    if who=='A' and method=='POST' and path==STORAGE: allowed=isinstance(body,bytes) and len(body)==68 and hashlib.sha256(body).hexdigest()==PNG_HASH
    if who=='A' and method=='DELETE' and path==STORAGE: allowed=body is None
    for table,item_id in IDS:
        if who=='A' and method=='POST' and path=='/rest/v1/'+table:
            allowed=body in ROWS[table].values()
        if who=='A' and method=='DELETE' and path==f'/rest/v1/{table}?id=eq.{item_id}': allowed=body is None
    for table,probe_id in PROBES.items():
        if who=='A' and method=='GET' and path==PROBE_READ[table]: allowed=body is None
        if who=='A' and method=='DELETE' and path==PROBE_DELETE[table]: allowed=body is None
        if who=='B' and method=='POST' and path=='/rest/v1/'+table:
            allowed=body=={**next(iter(ROWS[table].values())),'id':probe_id}
    if who=='B' and method=='PATCH' and path=='/rest/v1/dog_health_vaccinations?id=eq.5e71739b-0f9a-4587-8b06-0c0f927f429d': allowed=body=={'note':'T115 denied synthetic QA attempt'}
    if who=='B' and method=='DELETE' and path=='/rest/v1/dog_documents?id=eq.3dfa43bc-4c38-454e-a190-f4851cf1da2b': allowed=body is None
    if who=='B' and method=='DELETE' and path==STORAGE: allowed=body is None
    if who=='B' and method=='PUT' and path==STORAGE: allowed=isinstance(body,bytes) and len(body)==68 and hashlib.sha256(body).hexdigest()==PNG_HASH
    if not allowed or (who not in ('A','B')) or not tokens.get(who): raise Stop('MUTATION_REQUEST_OUT_OF_SCOPE')
    headers={'apikey':key,'Authorization':'Bearer '+tokens[who],
             'Content-Type':'image/png' if method in ('POST','PUT') and path==STORAGE else 'application/json',
             'Prefer':'return=representation'}
    if method=='POST' and path==STORAGE: headers['x-upsert']='false'
    wire=body if isinstance(body,bytes) else json.dumps(body,separators=(',',':')) if body is not None else None
    conn=http.client.HTTPSConnection(core['HOST'],timeout=20,context=core['tls_context']())
    try:
        conn.request(method,path,body=wire,headers=headers)
        res=conn.getresponse(); raw=res.read(65537)
        if len(raw)>65536: raise Stop('MUTATION_RESPONSE_TOO_LARGE')
        if binary: return res.status,raw
        try: data=json.loads(raw) if raw else None
        except ValueError: raise Stop('MUTATION_RESPONSE_NOT_JSON') from None
        return res.status,data
    finally: conn.close()


def fixed_row(key,tokens,table,item_id):
    return r['exact_row'](key,tokens,'A',table,item_id,1)

def cleanup_row(key,tokens,table,item_id):
    found=r['rows'](key,tokens,'A',r['EXACT'][(table,item_id)])
    if not found: return
    if len(found)!=1 or not isinstance(found[0],dict): raise Stop('ROW_CLEANUP_SCOPE_UNCERTAIN')
    expected=ROWS[table][item_id]
    allowed_note_variant=(table=='dog_health_vaccinations' and item_id=='5e71739b-0f9a-4587-8b06-0c0f927f429d'
        and found[0].get('note')=='T115 denied synthetic QA attempt')
    compared = dict(found[0])
    if allowed_note_variant:
        compared['note'] = expected['note']
    if not fixture_identity['matches'](table, expected, compared):
        raise Stop('ROW_CLEANUP_SCOPE_UNCERTAIN')
    try: api(key,tokens,'A','DELETE',f'/rest/v1/{table}?id=eq.{item_id}')
    except BaseException:
        if r['rows'](key,tokens,'A',r['EXACT'][(table,item_id)]): raise Stop('ROW_DELETE_UNCERTAIN') from None
    if r['rows'](key,tokens,'A',r['EXACT'][(table,item_id)]): raise Stop('ROW_DELETE_NOT_PERSISTED')

def cleanup_probe(key,tokens,table,item_id):
    status,found=api(key,tokens,'A','GET',PROBE_READ[table])
    if status!=200 or not isinstance(found,list): raise Stop('PROBE_CLEANUP_READ_FAILED')
    if not found: return
    expected={**next(iter(ROWS[table].values())),'id':item_id}
    if len(found)!=1 or not fixture_identity['matches'](table, expected, found[0]):
        raise Stop('PROBE_CLEANUP_SCOPE_UNCERTAIN')
    api(key,tokens,'A','DELETE',PROBE_DELETE[table])
    status,after=api(key,tokens,'A','GET',PROBE_READ[table])
    if status!=200 or after: raise Stop('PROBE_DELETE_NOT_PERSISTED')

def cleanup_grant(key,tokens):
    status,found=api(key,tokens,'A','GET',GRANT_READ)
    if status!=200 or not isinstance(found,list): raise Stop('GRANT_CLEANUP_READ_FAILED')
    if not found: return
    if len(found)!=1 or not isinstance(found[0],dict): raise Stop('GRANT_CLEANUP_SCOPE_UNCERTAIN')
    g=found[0]
    # This new fixed ID was absent before the attempt. Revoke even if the server
    # unexpectedly widened flags, duration or connection; those are FAIL cases.
    if (g.get('id')!=GRANT or g.get('owner_id')!=A or g.get('grantee_user_id')!=B or g.get('dog_id')!=DOG):
        raise Stop('GRANT_CLEANUP_SCOPE_UNCERTAIN')
    if g.get('revoked_at') is not None: return
    api(key,tokens,'A','PATCH',GRANT_WRITE,{'revoked_at':iso(now())})
    status,after=api(key,tokens,'A','GET',GRANT_READ)
    if status!=200 or len(after)!=1 or after[0].get('revoked_at') is None: raise Stop('GRANT_REVOKE_UNCERTAIN')

def verify_active_grant(key,tokens,connection_id,latest_expiry):
    status,found=api(key,tokens,'A','GET',GRANT_READ)
    if status!=200 or not isinstance(found,list) or len(found)!=1 or not isinstance(found[0],dict):
        raise Stop('ACTIVE_GRANT_READBACK_FAILED')
    g=found[0]
    if (g.get('id')!=GRANT or g.get('owner_id')!=A or g.get('dog_id')!=DOG
        or g.get('grantee_user_id')!=B or g.get('connection_id')!=connection_id
        or g.get('role_preset')!='custom' or g.get('revoked_at') is not None
        or any(g.get(p) is not (p in PERMS) for p in ALL_FLAGS)):
        raise Stop('ACTIVE_GRANT_SCOPE_MISMATCH')
    try:
        start=core['parse_server_time'](g['starts_at']); expiry=core['parse_server_time'](g['expires_at'])
    except (KeyError,ValueError,TypeError): raise Stop('ACTIVE_GRANT_TIME_INVALID') from None
    if (not dt.timedelta(0)<expiry-start<=dt.timedelta(minutes=5)
        or start>now() or expiry<=now() or expiry>latest_expiry):
        raise Stop('ACTIVE_GRANT_TIME_MISMATCH')

def cleanup_storage(key,tokens):
    fixed_row(key,tokens,'dog_documents','6eff5243-26c7-488e-90ed-fb4bb62632d2')
    status,content=api(key,tokens,'A','GET',AUTH_STORAGE,binary=True)
    if status in (400,404): return
    if status!=200 or len(content)!=68 or hashlib.sha256(content).hexdigest()!=PNG_HASH:
        raise Stop('STORAGE_CLEANUP_SCOPE_UNCERTAIN')
    try: api(key,tokens,'A','DELETE',STORAGE)
    except BaseException:
        status,_=api(key,tokens,'A','GET',AUTH_STORAGE,binary=True)
        if status not in (400,404): raise Stop('STORAGE_DELETE_UNCERTAIN') from None
    status,_=api(key,tokens,'A','GET',AUTH_STORAGE,binary=True)
    if status not in (400,404): raise Stop('STORAGE_DELETE_NOT_PERSISTED')


def safe_result(code):
    report={'code':code,'phase':PHASE,'cleanup':CLEANUP,'grant_id':GRANT,
            'runner_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'finished_at_utc':iso(now()), 'first_insert_failure':FIRST_INSERT_FAILURE}
    path=BASE/('T115-SECTIONS-QA-RESULT-'+now().strftime('%Y%m%dT%H%M%S%fZ')+'.json')
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as out: json.dump(report,out,sort_keys=True,separators=(',',':'));out.write('\n');out.flush();os.fsync(out.fileno())
    return path


def run(stage_b_receipt,storage_preflight_receipt,key=None,tokens=None,deadline=None):
    global PHASE,DEADLINE,CLEANUP_MODE,ATTEMPTED_GRANT,ATTEMPTED_STORAGE,CONNECTION_ID,STORAGE_CREATION,FIRST_INSERT_FAILURE
    FIRST_INSERT_FAILURE=None
    PHASE='receipt_guard'
    ATTEMPTED_ROWS.clear(); ATTEMPTED_PROBES.clear()
    ATTEMPTED_GRANT=False; ATTEMPTED_STORAGE=False; STORAGE_CREATION='none'
    DEADLINE=None; CLEANUP_MODE=False; CONNECTION_ID=None
    r['request'].__globals__['READ_DEADLINE']=None
    r['request'].__globals__['READ_CLEANUP_MODE']=False
    CLEANUP.update({'grant':'not_attempted','storage':'not_attempted','rows':'not_attempted','probes':'not_attempted'})
    if now().astimezone(ZoneInfo('Europe/Zurich')).date().isoformat()!='2026-11-01':
        raise Stop('QA_DATE_EXPIRED_REFRESH_PLAN')
    receipt=json.loads(Path(stage_b_receipt).read_text())
    if (receipt.get('code')!='PASS_T115_STAGE_B_NORMAL_JWT_OWNER_RECIPIENT_ISOLATION'
        or receipt.get('runner_sha256')!='eea5b68ead59b0be226c75344b93035d924caa6324d2e48c86601a274cc13033'
        or receipt.get('phase')!='complete'
        or receipt.get('cleanup')!={'grant':'revoked_or_absent','row':'deleted_or_absent'}
        or receipt.get('row_id')!='f7f84cac-4f40-4774-8190-578525c8ad1d'
        or receipt.get('grant_id')!='33a9ee49-9eaa-41ac-87cd-b74629cec4db'):
        raise Stop('STAGE_B_PASS_RECEIPT_REQUIRED')
    try: finished=core['parse_server_time'](receipt['finished_at_utc'])
    except (KeyError,ValueError,TypeError): raise Stop('STAGE_B_RECEIPT_TIME_INVALID') from None
    age=now()-finished
    if age<dt.timedelta(0) or age>dt.timedelta(hours=1): raise Stop('STAGE_B_RECEIPT_STALE')
    storage_receipt=json.loads(Path(storage_preflight_receipt).read_text())
    if (storage_receipt.get('project_ref')!=core['HOST'].split('.')[0]
        or storage_receipt.get('bucket_id')!='dog-documents'
        or storage_receipt.get('path')!=PATH
        or storage_receipt.get('exact_object_count')!=0
        or storage_receipt.get('status')!='READ_ONLY_ABSENT_AT_CHECK_TIME_NOT_EXECUTION_APPROVAL'):
        raise Stop('STORAGE_PATH_PREFLIGHT_REQUIRED')
    try: storage_checked=core['parse_server_time'](storage_receipt['checked_at_utc'])
    except (KeyError,ValueError,TypeError): raise Stop('STORAGE_PATH_PREFLIGHT_TIME_INVALID') from None
    storage_age=now()-storage_checked
    if storage_age<dt.timedelta(0) or storage_age>dt.timedelta(minutes=10):
        raise Stop('STORAGE_PATH_PREFLIGHT_STALE')
    if key is None: key=key_source['verified_public_key']()
    if not core['public_key_ok'](key): raise Stop('PUBLIC_KEY_REQUIRED')
    if tokens is None: tokens={label:qa['login'](key,label,email,uid) for label,email,uid in core['USERS']}
    png=PNG_PATH.read_bytes()
    if len(png)!=68 or hashlib.sha256(png).hexdigest()!=PNG_HASH: raise Stop('PNG_HASH_DRIFT')
    DEADLINE=min(time.monotonic()+10*60,deadline) if deadline is not None else time.monotonic()+10*60
    r['request'].__globals__['READ_DEADLINE']=DEADLINE
    r['request'].__globals__['READ_CLEANUP_MODE']=False
    PHASE='preflight'
    if r['rows'](key,tokens,'A',r['DOG_OWNER_A'])!=[{'id':DOG,'owner_id':A}]:
        raise Stop('OWNER_DOG_PROBE_MISMATCH')
    if r['rows'](key,tokens,'B',r['DOG_OWNER_B']):
        raise Stop('RECIPIENT_OWNER_PROBE_NOT_EMPTY')
    grant_status,grants=api(key,tokens,'A','GET',GRANT_READ)
    if grant_status!=200 or grants: raise Stop('FIXED_GRANT_ID_COLLISION')
    status,connections=api(key,tokens,'A','GET',CONNECTION)
    if status!=200 or not isinstance(connections,list) or len(connections)!=1 or connections[0].get('owner_user_id')!=A or connections[0].get('connected_user_id')!=B or connections[0].get('status')!='accepted':
        raise Stop('CONNECTION_DRIFT')
    connection_id=connections[0].get('id')
    if not isinstance(connection_id,str): raise Stop('CONNECTION_ID_INVALID')
    CONNECTION_ID=connection_id
    status,old=api(key,tokens,'A','GET',GRANT_LIST)
    if status!=200 or not isinstance(old,list): raise Stop('GRANT_LIST_READ_FAILED')
    for g in old:
        start=core['parse_server_time'](g['starts_at']); end=core['parse_server_time'](g['expires_at']) if g['expires_at'] else None
        if g['revoked_at'] is None and start<=now() and (end is None or end>now()): raise Stop('ACTIVE_GRANT_PREEXISTS')
    for table,item_id in IDS:
        if r['rows'](key,tokens,'A',r['EXACT'][(table,item_id)]): raise Stop('FIXED_ROW_ID_COLLISION')
    for table,path in PROBE_READ.items():
        status,found=api(key,tokens,'A','GET',path)
        if status!=200 or not isinstance(found,list) or found: raise Stop('FIXED_PROBE_ID_COLLISION_OR_ERROR')
    status,_=api(key,tokens,'A','GET',AUTH_STORAGE,binary=True)
    if status not in (400,404): raise Stop('FIXED_STORAGE_PATH_COLLISION_OR_ERROR')
    try:
        PHASE='fixture_insert'
        for table,items in ROWS.items():
            for item_id,body in items.items():
                ATTEMPTED_ROWS.add((table,item_id))
                status,data=api(key,tokens,'A','POST','/rest/v1/'+table,body)
                if status not in (200,201) or not isinstance(data,list) or len(data)!=1 or not isinstance(data[0],dict) or data[0].get('id')!=item_id:
                    raw_code = data.get('code') if isinstance(data,dict) else None
                    safe_db_code = raw_code if type(raw_code) is str and re.fullmatch(r'(?:[0-9A-Z]{5}|PGRST[0-9]{3})',raw_code) else None
                    FIRST_INSERT_FAILURE={'table':table,'fixture_id':item_id,'http_status':status,'safe_database_error_code':safe_db_code}
                    raise Stop('OWNER_FIXTURE_INSERT_FAILED')
                fixed_row(key,tokens,table,item_id)
        PHASE='storage_upload'
        try:
            status,uploaded=api(key,tokens,'A','POST',STORAGE,png)
        except BaseException:
            STORAGE_CREATION='ambiguous'
            raise
        if status==409:
            STORAGE_CREATION='collision'
            raise Stop('FIXED_STORAGE_PATH_COLLISION')
        if status not in (200,201) or not isinstance(uploaded,dict) or uploaded.get('Key') not in (PATH,'dog-documents/'+PATH):
            STORAGE_CREATION='none' if status in (401,403) else 'ambiguous'
            raise Stop('OWNER_PNG_UPLOAD_UNCERTAIN')
        STORAGE_CREATION='created'; ATTEMPTED_STORAGE=True
        status,content=api(key,tokens,'A','GET',AUTH_STORAGE,binary=True)
        if status!=200 or hashlib.sha256(content).hexdigest()!=PNG_HASH: raise Stop('OWNER_PNG_READBACK_FAILED')
        r['run']('inactive',key,tokens)
        PHASE='grant_insert'
        stamp=now(); body={'id':GRANT,'owner_id':A,'dog_id':DOG,'connection_id':connection_id,'grantee_user_id':B,
                           'role_preset':'custom','starts_at':iso(stamp-dt.timedelta(seconds=5)),
                           'expires_at':iso(stamp+dt.timedelta(seconds=270)),
                           **{p:p in PERMS for p in ALL_FLAGS}}
        ATTEMPTED_GRANT=True
        status,data=api(key,tokens,'A','POST',GRANTS,body)
        if status not in (200,201) or not isinstance(data,list) or len(data)!=1 or data[0].get('id')!=GRANT: raise Stop('GRANT_INSERT_FAILED')
        verify_active_grant(key,tokens,connection_id,core['parse_server_time'](body['expires_at']))
        r['run']('active',key,tokens)
        PHASE='negative_writes'
        for table,probe_id in PROBES.items():
            source=next(iter(ROWS[table].values()))
            ATTEMPTED_PROBES.add((table,probe_id))
            status,data=api(key,tokens,'B','POST','/rest/v1/'+table,{**source,'id':probe_id})
            if status not in (401,403) and not (status in (200,204) and data in (None,[])):
                raise Stop('RECIPIENT_INSERT_NOT_DENIED')
            probe_status,probe_rows=api(key,tokens,'A','GET',PROBE_READ[table])
            if probe_status!=200 or not isinstance(probe_rows,list) or probe_rows:
                raise Stop('RECIPIENT_INSERT_PROBE_PERSISTED_OR_UNCERTAIN')
            for item_id in ROWS[table]: fixed_row(key,tokens,table,item_id)
        status,data=api(key,tokens,'B','PATCH','/rest/v1/dog_health_vaccinations?id=eq.5e71739b-0f9a-4587-8b06-0c0f927f429d',{'note':'T115 denied synthetic QA attempt'})
        if status not in (401,403) and not (status in (200,204) and data in (None,[])): raise Stop('RECIPIENT_UPDATE_NOT_DENIED')
        status,data=api(key,tokens,'B','DELETE','/rest/v1/dog_documents?id=eq.3dfa43bc-4c38-454e-a190-f4851cf1da2b')
        if status not in (401,403) and not (status in (200,204) and data in (None,[])): raise Stop('RECIPIENT_DELETE_NOT_DENIED')
        status,_=api(key,tokens,'B','DELETE',STORAGE)
        if status not in (400,401,403,404): raise Stop('RECIPIENT_STORAGE_DELETE_NOT_DENIED')
        status,_=api(key,tokens,'B','PUT',STORAGE,png)
        if status not in (401,403): raise Stop('RECIPIENT_STORAGE_UPDATE_NOT_DENIED_OR_INCONCLUSIVE')
        for table,item_id in IDS: fixed_row(key,tokens,table,item_id)
        status,content=api(key,tokens,'A','GET',AUTH_STORAGE,binary=True)
        if status!=200 or hashlib.sha256(content).hexdigest()!=PNG_HASH: raise Stop('FIXTURE_CHANGED_AFTER_DENIAL')
        PHASE='revoke'
        sign_status,signed=r['request'](key,tokens,'B','POST',r['SIGN'],{'expiresIn':60})
        if sign_status!=200: raise Stop('PRE_REVOKE_SIGN_FAILED')
        signed_at=time.monotonic()
        cleanup_grant(key,tokens)
        r['run']('inactive',key,tokens)
        PHASE='signed_url_expiry'
        while time.monotonic()-signed_at<67:
            if time.monotonic()>=DEADLINE: raise Stop('TOTAL_10_MINUTE_DEADLINE')
            time.sleep(1)
        old_status,_=r['signed_png'](signed)
        if old_status not in (400,401,403,404): raise Stop('OLD_SIGNED_URL_DENIAL_INCONCLUSIVE')
        PHASE='complete'
        return 'PASS_T115_SECTIONS_NORMAL_JWT_AND_STORAGE'
    finally:
        CLEANUP_MODE=True; failures=[]
        r['request'].__globals__['READ_CLEANUP_MODE']=True
        if ATTEMPTED_GRANT:
            try: cleanup_grant(key,tokens); CLEANUP['grant']='revoked_or_absent'
            except BaseException: CLEANUP['grant']='uncertain';failures.append('grant')
        if STORAGE_CREATION=='ambiguous':
            CLEANUP['storage']='uncertain';failures.append('storage')
        elif STORAGE_CREATION=='collision':
            CLEANUP['storage']='preexisting_preserved'
        elif ATTEMPTED_STORAGE:
            try: cleanup_storage(key,tokens); CLEANUP['storage']='deleted_or_absent'
            except BaseException: CLEANUP['storage']='uncertain';failures.append('storage')
        for table,item_id in sorted(ATTEMPTED_PROBES):
            try: cleanup_probe(key,tokens,table,item_id)
            except BaseException: failures.append('probe')
        CLEANUP['probes']='uncertain' if 'probe' in failures else 'absent_or_deleted' if ATTEMPTED_PROBES else 'not_attempted'
        for table,item_id in sorted(ATTEMPTED_ROWS,reverse=True):
            if STORAGE_CREATION=='ambiguous' and table=='dog_documents' and item_id=='6eff5243-26c7-488e-90ed-fb4bb62632d2':
                failures.append('row');continue
            try: cleanup_row(key,tokens,table,item_id)
            except BaseException: failures.append('row')
        CLEANUP['rows']='uncertain' if 'row' in failures else 'deleted_or_absent' if ATTEMPTED_ROWS else 'not_attempted'
        CLEANUP_MODE=False;DEADLINE=None
        r['request'].__globals__['READ_CLEANUP_MODE']=False
        r['request'].__globals__['READ_DEADLINE']=None
        if failures: raise Stop('CLEANUP_UNCERTAIN_'+','.join(sorted(set(failures))))


if __name__=='__main__':
    print('STOP_USE_REVIEWED_ONE_SHOT_LAUNCHER',file=sys.stderr)
    sys.exit(2)
