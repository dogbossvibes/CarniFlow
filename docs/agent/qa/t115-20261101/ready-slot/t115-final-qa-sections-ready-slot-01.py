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
import time
from zoneinfo import ZoneInfo

BASE = Path(__file__).resolve().parent
MANIFEST = BASE / 'QA-SOURCE-MANIFEST-TIME-AWARE-01.json'
MANIFEST_SHA256 = '03ed4f8d08c896f4011cad571530f91e0960a476286c4a10d649b82f451a2dc9'
AUTHOR = BASE.parent / 't115-health-sharing-db-05-20261029'
STAGE_B = AUTHOR / 't115-stage-b-postflight-review-only.py'
SECTIONS = BASE / 't115-sections-coordinator-time-aware-01.py'
PUBLIC_ENV = Path('${PRIVATE_TMP}/anyvo-t115-production-env-20261101.private.json')
PROJECT = 'axkkhyqrjrtbkumaulta'
MIGRATION_SHA256 = 'eb5f4e7575df83b18a6a70916dee6e65874bf699d385213e0cc672848c593d40'
DATE = '2026-11-01'
OWNER = '68910959-e849-4860-b408-ebc234fec611'
RECIPIENT = '0327d914-99e4-4e6e-b89e-3b642586a3b8'
ATTEMPT = BASE / 'T115-FINAL-QA-ONE-SHOT-SECTIONS-READY-SLOT-20261101.json'
PRIOR_RESULT = BASE / 'T115-FINAL-QA-RESULT-20261101T194010440550Z.json'
TIMEOUT_RESULT = BASE / 'T115-FINAL-QA-RESULT-20261101T200027504213Z.json'
RESIDUAL_RECEIPT = AUTHOR / 'T115-SECTIONS-POSTSTOP-EXACT-READBACK-20261101.json'
STAGE_B_PASS = AUTHOR / 'T115-STAGE-B-POSTFLIGHT-RESULT-20261101T193955217441Z.json'
STAGE_B_PASS_SHA256 = '2e7830203e4af675db4d5da97dd2f45691ac71fe09661bc17a80682944f25f4f'
PRIOR_RESULT_SHA256 = '0d28da967949d2910595b61c269091646088c68ab19c116c09ae6e447926afb1'
PRIOR_SECTIONS = AUTHOR / 'T115-SECTIONS-QA-RESULT-20261101T194010438027Z.json'
PRIOR_SECTIONS_SHA256 = 'b891b483f459f6e1f882d0cb6b77f7f16041712189dfcfa30441de8299c30618'

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

def validate_stage_b_pass():
    if hashlib.sha256(STAGE_B_PASS.read_bytes()).hexdigest() != STAGE_B_PASS_SHA256:
        raise Stop('ORIGINAL_STAGE_B_PASS_DRIFT')
    d = json.loads(STAGE_B_PASS.read_text())
    if (d.get('code') != 'PASS_T115_STAGE_B_NORMAL_JWT_OWNER_RECIPIENT_ISOLATION'
            or d.get('phase') != 'complete'
            or d.get('cleanup') != {'grant': 'revoked_or_absent', 'row': 'deleted_or_absent'}
            or d.get('runner_sha256') != 'd82f68fa9a07dd9d2566e5993600dd922758fc8707631db017047961723ccfe6'
            or d.get('row_id') != 'd9ac9336-ad56-4cd5-9eca-a5e375cbeb5d'
            or d.get('grant_id') != '9e984c75-db12-4105-ac31-c566240fb73a'):
        raise Stop('ORIGINAL_STAGE_B_PASS_REQUIRED')
    fresh(d.get('finished_at_utc'), 60 * 60)

def validate_prior_scoped_stop():
    timeout_path = TIMEOUT_RESULT
    if hashlib.sha256(timeout_path.read_bytes()).hexdigest() != '22bd8a6f180c534316227f5b713eee8ca536cb42f8a97a376fe899a421132a92':
        raise Stop('PREVIOUS_WAIT_ONLY_TIMEOUT_EVIDENCE_DRIFT')
    timeout = json.loads(timeout_path.read_text())
    if (timeout.get('code') != 'STOP_POST_LOGIN_READINESS_WAIT_EXPIRED_NO_QA_STARTED'
            or timeout.get('phase') != 'waiting_for_fresh_metadata_after_login'
            or timeout.get('component_receipts') != {}
            or timeout.get('launcher_sha256') != 'ecfc841d6237fd5c2b800635c6cb4384a6db0afa9967457663bdc469ec4c489f'
            or timeout.get('manifest_sha256') != MANIFEST_SHA256):
        raise Stop('PREVIOUS_WAIT_ONLY_NO_DATA_STOP_REQUIRED')
    if (hashlib.sha256(PRIOR_RESULT.read_bytes()).hexdigest() != PRIOR_RESULT_SHA256
            or hashlib.sha256(PRIOR_SECTIONS.read_bytes()).hexdigest() != PRIOR_SECTIONS_SHA256):
        raise Stop('PRIOR_STOP_EVIDENCE_DRIFT')
    prior = json.loads(PRIOR_RESULT.read_text())
    sections = json.loads(PRIOR_SECTIONS.read_text())
    if (prior.get('code') != 'STOP_CLEANUP_UNCERTAIN_ROW'
            or prior.get('phase') != 'sections_docs_storage'
            or prior.get('launcher_sha256') != '03f7c0b53acec420defd2113bd4a3d204ec19b74d0d834c794fd284259aa68cc'
            or prior.get('manifest_sha256') != 'cb2970bc85c1d47277d0ec8e854e3d9aa397499d0e55884303c165edf54c69a0'
            or prior.get('component_receipts') != {'stage_b': str(STAGE_B_PASS), 'sections': str(PRIOR_SECTIONS)}
            or sections.get('code') != 'STOP_CLEANUP_UNCERTAIN_ROW'
            or sections.get('phase') != 'fixture_insert'
            or sections.get('cleanup') != {'grant': 'not_attempted', 'probes': 'not_attempted', 'rows': 'uncertain', 'storage': 'not_attempted'}):
        raise Stop('PRIOR_SCOPED_STOP_REQUIRED_NO_AUTOMATIC_RETRY')
    validate_stage_b_pass()

def validate_residual_after_login(ready_at):
    d = json.loads(RESIDUAL_RECEIPT.read_text())
    expected_counts = {'stage_b_weight_fixture': 0, 'vaccination_fixture': 0,
        'deworming_fixture': 0, 'medication_fixture': 0, 'condition_fixtures': 0,
        'vet_fixture': 1, 'document_fixtures': 0, 'new_grants': 1,
        'active_new_grants': 0, 'png_object': 0, 'fixed_negative_probe_rows': 0}
    counts = d.get('counts')
    expected_vet = {'id': 'b702b7cb-5857-425e-b9ad-50123f9880d5', 'owner_id': OWNER,
        'dog_id': 'b4991851-e569-51fc-a0af-4e0172f2bc63', 'reason': 'T115 synthetic QA only',
        'status': 'completed', 'appointment_at_equals_fixture_timestamptz': True,
        'fixture_input_time': '2026-11-01T15:00:00Z'}
    vet = d.get('remaining_vet_fixture')
    grants = d.get('grants')
    if (d.get('status') != 'READ_ONLY_FIXED_SYNTHETIC_SCOPE_ONE_ROW_REMAINS_NO_CLEANUP_PERFORMED'
            or d.get('project_ref') != PROJECT or type(counts) is not dict
            or set(counts) != set(expected_counts)
            or any(type(counts[k]) is not int or counts[k] != v for k, v in expected_counts.items())
            or type(vet) is not dict
            or any(type(vet.get(k)) is not type(v) or vet.get(k) != v for k,v in expected_vet.items())
            or type(grants) is not dict
            or grants.get('stage_b_grant_id') != '9e984c75-db12-4105-ac31-c566240fb73a'
            or grants.get('stage_b_active_now') is not False
            or not grants.get('stage_b_revoked_at_sql_text')
            or grants.get('sections_grant_id') != '9a6ef3f7-adf1-4835-99a8-b0cc7be85368'
            or grants.get('sections_grant_present') is not False):
        raise Stop('EXACT_ONE_RESIDUAL_FIXTURE_AND_UNUSED_SECTIONS_GRANT_REQUIRED')
    fresh(d.get('checked_at_utc'), 60 * 60)
    return parse_time(d['checked_at_utc']) >= ready_at

def wait_for_post_login_receipts(install_path, storage_path):
    # Credentials remain solely in the caller's RAM. No Health/Storage API runs here.
    ready_at = now()
    signal = BASE / ('T115-AUTH-READY-REQUEST-' + ready_at.strftime('%Y%m%dT%H%M%S%fZ') + '.json')
    private_json(signal, {'code': 'WAITING_FOR_FRESH_RECEIPTS_AFTER_LOGIN_NO_QA_STARTED',
                         'ready_at_utc': utc(ready_at),
                         'launcher_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                         'manifest_sha256': MANIFEST_SHA256,
                         'verified_test_account_ids': [OWNER, RECIPIENT],
                         'requires_exact_residual_scope_after_login': True})
    print('Anmeldung erfolgreich. Keine weiteren Passwoerter eingeben.', flush=True)
    print('Warte auf die jetzt frisch gelesenen Servernachweise. Das Fenster offen lassen.', flush=True)
    deadline = time.monotonic() + 10 * 60
    while time.monotonic() < deadline:
        verify_sources()
        try:
            validate_receipts(install_path, storage_path)
            installed = json.loads(Path(install_path).read_text())
            storage = json.loads(Path(storage_path).read_text())
            if (validate_residual_after_login(ready_at)
                    and parse_time(installed['checked_at_utc']) >= ready_at
                    and parse_time(storage['checked_at_utc']) >= ready_at):
                return
        except Stop as error:
            if str(error) != 'FRESH_READONLY_RECEIPT_REQUIRED':
                raise
        except FileNotFoundError:
            # Only the three fixed receipt reads above may wait; source checks are outside this try.
            pass
        time.sleep(2)
    raise Stop('POST_LOGIN_READINESS_WAIT_EXPIRED_NO_QA_STARTED')

def complete(install_path, storage_path):
    require_date()
    verify_sources()
    validate_prior_scoped_stop()
    validate_residual_after_login(now() - dt.timedelta(hours=1))
    # A stale timestamp may defer testing; it never permits a data request.
    try:
        validate_receipts(install_path, storage_path)
    except Stop as error:
        if str(error) != 'FRESH_READONLY_RECEIPT_REQUIRED':
            raise
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
        # Freshness remains mandatory before either mutation phase, after interactive input.
        state['phase'] = 'waiting_for_fresh_metadata_after_login'
        wait_for_post_login_receipts(install_path, storage_path)
        validate_stage_b_pass()
        stage_path = STAGE_B_PASS
        state['component_receipts']['stage_b'] = str(stage_path)
        state['phase'] = 'exact_residual_vet_cleanup'
        table, item_id = 'dog_vet_appointments', 'b702b7cb-5857-425e-b9ad-50123f9880d5'
        sections['fixed_row'](key, tokens, table, item_id)
        sections['cleanup_row'](key, tokens, table, item_id)
        if sections['r']['rows'](key, tokens, 'A', sections['r']['EXACT'][(table,item_id)]):
            raise Stop('EXACT_RESIDUAL_VET_CLEANUP_NOT_CONFIRMED')
        cleanup_path = BASE / ('T115-VET-EXACT-CLEANUP-NORMAL-JWT-' + now().strftime('%Y%m%dT%H%M%S%fZ') + '.json')
        private_json(cleanup_path, {'code': 'PASS_EXACT_SYNTHETIC_VET_CLEANUP_NORMAL_JWT',
            'id': item_id, 'owner_id': OWNER, 'dog_id': sections['DOG'],
            'all_fixture_fields_verified': True, 'only_timestamp_representation_normalized': True,
            'absent_after_owner_delete': True, 'checked_at_utc': utc(now()),
            'manifest_sha256': MANIFEST_SHA256})
        state['component_receipts']['residual_cleanup'] = str(cleanup_path)
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
