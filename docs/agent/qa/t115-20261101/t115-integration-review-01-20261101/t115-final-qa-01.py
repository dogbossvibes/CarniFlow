#!/usr/bin/env python3
"""One-shot T115 QA entry point. Inert without explicit approval and fresh receipts.

Credentials and signed URLs stay in RAM. Only fixed synthetic objects are in scope.
This launcher never installs SQL, publishes OTA, starts builds or modifies accounts.
"""
import argparse
import base64
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import sys
from zoneinfo import ZoneInfo

BASE = Path(__file__).resolve().parent
MANIFEST = BASE / 'QA-SOURCE-MANIFEST-01.json'
MANIFEST_SHA256 = 'cb2970bc85c1d47277d0ec8e854e3d9aa397499d0e55884303c165edf54c69a0'
AUTHOR = BASE.parent / 't115-health-sharing-db-05-20261029'
STAGE_B = AUTHOR / 't115-stage-b-postflight-review-only.py'
SECTIONS = BASE / 't115-sections-coordinator-01.py'
PUBLIC_ENV = Path('<LOCAL_PRIVATE_TMP>/anyvo-t115-production-env-20261101.private.json')
PROJECT = 'axkkhyqrjrtbkumaulta'
MIGRATION_SHA256 = 'eb5f4e7575df83b18a6a70916dee6e65874bf699d385213e0cc672848c593d40'
DATE = '2026-11-01'
OWNER = '68910959-e849-4860-b408-ebc234fec611'
RECIPIENT = '0327d914-99e4-4e6e-b89e-3b642586a3b8'
ATTEMPT = BASE / 'T115-FINAL-QA-ONE-SHOT-ATTEMPT-20261101.json'

class Stop(Exception):
    pass

def now():
    return dt.datetime.now(dt.timezone.utc)

def utc(value):
    return value.astimezone(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')

def parse_time(value):
    if not isinstance(value, str):
        raise Stop('RECEIPT_TIME_INVALID')
    parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise Stop('RECEIPT_TIME_INVALID')
    return parsed

def require_date():
    if now().astimezone(ZoneInfo('Europe/Zurich')).date().isoformat() != DATE:
        raise Stop('QA_DATE_EXPIRED_REFRESH_REVIEW_REQUIRED')

def verify_sources():
    raw = MANIFEST.read_bytes()
    if hashlib.sha256(raw).hexdigest() != MANIFEST_SHA256:
        raise Stop('QA_MANIFEST_DRIFT')
    manifest = json.loads(raw)
    if manifest.get('productionProject') != PROJECT or manifest.get('qaDateZurich') != DATE:
        raise Stop('QA_MANIFEST_SCOPE_MISMATCH')
    for entry in manifest['sources']:
        if hashlib.sha256(Path(entry['path']).read_bytes()).hexdigest() != entry['sha256']:
            raise Stop('QA_COMPONENT_SOURCE_DRIFT')
    return manifest

def fresh(value, seconds):
    age = (now() - parse_time(value)).total_seconds()
    if not 0 <= age <= seconds:
        raise Stop('FRESH_READONLY_RECEIPT_REQUIRED')

def validate_receipts(install_path, storage_path):
    require_date()
    installed = json.loads(Path(install_path).read_text())
    expected = {
        'code': 'PASS_T115_STAGE_B_METADATA_POSTFLIGHT',
        'project_ref': PROJECT,
        'migration_sha256': MIGRATION_SHA256,
        'read_policy_name': 'dog_health_entries_select',
        'read_policy_roles': ['authenticated'],
        'read_policy_predicate': '((owner_id = auth.uid()) AND health_dog_owner_matches(dog_id, owner_id))',
        'select_all_policy_count': 1,
        'rls_enabled': True,
        'owner_dog_mismatch_count': 0,
        'write_policies_md5': 'e9298bd962428f4c583cf211032ae210',
        'table_acl_unchanged': True,
        'triggers_and_foreign_keys_unchanged': True,
        'weight_rpc_body_md5': 'cd8bd0c10610a5878a8e6b829fc16ff9',
        'owner_match_helper_body_md5': '608febdba1b74dc18708cd45fae80ec8',
        'weight_rpc_auth_execute': True,
        'weight_rpc_anon_execute': False,
        'weight_rpc_public_execute': False,
    }
    if any(type(installed.get(k)) is not type(v) or installed.get(k) != v for k, v in expected.items()):
        raise Stop('STAGE_B_INSTALLED_METADATA_POSTFLIGHT_REQUIRED')
    before, after = installed.get('health_rows_before'), installed.get('health_rows_after')
    if not isinstance(before, int) or isinstance(before, bool) or before < 0 or type(after) is not int or after != before:
        raise Stop('STAGE_B_ROW_COUNT_DRIFT_REVIEW_REQUIRED')
    fresh(installed.get('checked_at_utc'), 15 * 60)
    storage = json.loads(Path(storage_path).read_text())
    path = OWNER + '/b4991851-e569-51fc-a0af-4e0172f2bc63/t115-health-6eff5243-26c7-488e-90ed-fb4bb62632d2.png'
    if (storage.get('project_ref') != PROJECT or storage.get('bucket_id') != 'dog-documents'
            or storage.get('path') != path or type(storage.get('exact_object_count')) is not int or storage.get('exact_object_count') != 0
            or storage.get('status') != 'READ_ONLY_ABSENT_AT_CHECK_TIME_NOT_EXECUTION_APPROVAL'):
        raise Stop('FRESH_EXACT_STORAGE_ABSENCE_REQUIRED')
    fresh(storage.get('checked_at_utc'), 10 * 60)

def private_json(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as handle:
        json.dump(data, handle, sort_keys=True, separators=(',', ':'))
        handle.write('\n')
        handle.flush()
        os.fsync(handle.fileno())

def acquire_once(path=ATTEMPT):
    record = {'status': 'ONE_SHOT_STARTED_NO_AUTOMATIC_RETRY',
              'started_at_utc': utc(now()), 'manifest_sha256': MANIFEST_SHA256,
              'launcher_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    try:
        private_json(path, record)
    except FileExistsError:
        raise Stop('PREVIOUS_ATTEMPT_EXISTS_REVIEW_REQUIRED') from None

def public_key():
    if PUBLIC_ENV.stat().st_mode & 0o777 != 0o600:
        raise Stop('PUBLIC_CONFIGURATION_FILE_NOT_PRIVATE')
    env = json.loads(PUBLIC_ENV.read_text())
    if (env.get('EXPO_PUBLIC_BACKEND_ENV') != 'production'
            or env.get('EXPO_PUBLIC_SUPABASE_URL', '').rstrip('/') != 'https://' + PROJECT + '.supabase.co'):
        raise Stop('PUBLIC_CONFIGURATION_PROJECT_MISMATCH')
    key = env.get('EXPO_PUBLIC_SUPABASE_ANON_KEY', '')
    if key.startswith('eyJ'):
        payload = json.loads(base64.urlsafe_b64decode(key.split('.')[1] + '==='))
        if payload.get('role') != 'anon' or payload.get('ref') != PROJECT:
            raise Stop('PUBLIC_KEY_ROLE_OR_PROJECT_MISMATCH')
    elif not key.startswith('sb_publishable_'):
        raise Stop('PUBLIC_KEY_REQUIRED')
    return key

def safe_code(error):
    if isinstance(error, (KeyboardInterrupt, EOFError)):
        return 'STOP_LOCAL_INPUT_CANCELLED'
    if type(error).__name__ == 'Stop' and error.args and re.fullmatch(r'[A-Z0-9_,]+', str(error.args[0])):
        code = str(error.args[0])
        return code if code.startswith('STOP_') else 'STOP_' + code
    if type(error).__name__ == 'Stop' and error.args and re.fullmatch(r'CLEANUP_UNCERTAIN_(?:grant|storage|row|probe)(?:,(?:grant|storage|row|probe))*', str(error.args[0])):
        return 'STOP_' + str(error.args[0]).upper()
    return 'STOP_UNEXPECTED_LOCAL_QA_ERROR'

def complete(install_path, storage_path):
    require_date()
    verify_sources()
    validate_receipts(install_path, storage_path)
    acquire_once()
    state = {'phase': 'login', 'code': None, 'component_receipts': {}}
    try:
        stage = runpy.run_path(str(STAGE_B))
        sections = runpy.run_path(str(SECTIONS))
        key = public_key()
        users = stage['core']['USERS']
        if [(item[0], item[2]) for item in users] != [('A', OWNER), ('B', RECIPIENT)]:
            raise Stop('FIXED_TEST_ACCOUNT_SCOPE_DRIFT')
        tokens = {label: stage['qa']['login'](key, label, email, uid) for label, email, uid in users}
        # Recheck freshness after interactive input; no mutation on an expired plan.
        verify_sources()
        validate_receipts(install_path, storage_path)
        state['phase'] = 'stage_b'
        try:
            code = stage['run'](key=key, tokens=tokens)
        except BaseException as error:
            state['component_receipts']['stage_b'] = str(stage['write_safe_result'](safe_code(error)))
            raise
        stage_path = stage['write_safe_result'](code)
        state['component_receipts']['stage_b'] = str(stage_path)
        if code != 'PASS_T115_STAGE_B_NORMAL_JWT_OWNER_RECIPIENT_ISOLATION':
            raise Stop('STAGE_B_FUNCTIONAL_PASS_REQUIRED')
        state['phase'] = 'sections_docs_storage'
        try:
            code = sections['run'](stage_path, storage_path, key=key, tokens=tokens)
        except BaseException as error:
            state['component_receipts']['sections'] = str(sections['safe_result'](safe_code(error)))
            raise
        sections_path = sections['safe_result'](code)
        state['component_receipts']['sections'] = str(sections_path)
        data = json.loads(Path(sections_path).read_text())
        if (code != 'PASS_T115_SECTIONS_NORMAL_JWT_AND_STORAGE'
                or data.get('phase') != 'complete'
                or data.get('cleanup') != {'grant': 'revoked_or_absent', 'storage': 'deleted_or_absent',
                                           'rows': 'deleted_or_absent', 'probes': 'absent_or_deleted'}):
            raise Stop('FULL_SECTIONS_PASS_AND_CLEANUP_REQUIRED')
        state['phase'] = 'complete'
        state['code'] = 'PASS_T115_COMPLETE_NORMAL_JWT_BACKEND_QA'
    except BaseException as error:
        state['code'] = safe_code(error)
    state.update({'finished_at_utc': utc(now()), 'manifest_sha256': MANIFEST_SHA256,
                  'launcher_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()})
    result_path = BASE / ('T115-FINAL-QA-RESULT-' + now().strftime('%Y%m%dT%H%M%S%fZ') + '.json')
    private_json(result_path, state)
    return state['code'], result_path

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--execute-approved', action='store_true')
    parser.add_argument('--stage-b-install-receipt', type=Path)
    parser.add_argument('--storage-preflight-receipt', type=Path)
    args = parser.parse_args()
    if not args.execute_approved or args.stage_b_install_receipt is None or args.storage_preflight_receipt is None:
        print('STOP_EXPLICIT_APPROVAL_AND_FRESH_RECEIPTS_REQUIRED', file=sys.stderr)
        return 2
    try:
        code, result = complete(args.stage_b_install_receipt, args.storage_preflight_receipt)
        print(code)
        print('Ergebnisdatei: ' + str(result))
        return 0 if code == 'PASS_T115_COMPLETE_NORMAL_JWT_BACKEND_QA' else 2
    except BaseException as error:
        print(safe_code(error), file=sys.stderr)
        return 2

if __name__ == '__main__':
    sys.exit(main())
