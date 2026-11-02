#!/usr/bin/env python3
"""T115 Full6 QA candidate. Inert without exact new approval and fresh receipts.

Credentials and signed URLs stay in RAM. Only fixed synthetic objects are in scope.
This launcher never installs SQL, publishes OTA, starts builds or modifies accounts.
"""
import argparse
import base64
import csv
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
from urllib.parse import urlparse

BASE = Path(__file__).resolve().parent
SOURCE_BASE = Path('${PROJECT_ROOT}/outputs/t115-full6-qa-05-20261102')
MANIFEST = SOURCE_BASE / 'QA-SOURCE-MANIFEST-FULL6-05.json'
MANIFEST_SHA256 = '805f141dd3da909f73952d64241165c076a4132b9e99dd40ec2fd18fc1d6d733'
AUTHOR = BASE.parent / 't115-health-sharing-db-05-20261029'
STAGE_B = SOURCE_BASE / 't115-stage-b-post-policy-capped-01.py'
SECTIONS = SOURCE_BASE / 't115-sections-storage-diagnostics-01.py'
PUBLIC_ENV = Path('/private/tmp/anyvo-t115-production-env-20261101.private.json')
PROJECT = 'axkkhyqrjrtbkumaulta'
MIGRATION_SHA256 = 'eb5f4e7575df83b18a6a70916dee6e65874bf699d385213e0cc672848c593d40'
DATE = '2026-11-02'
OWNER = '68910959-e849-4860-b408-ebc234fec611'
RECIPIENT = '0327d914-99e4-4e6e-b89e-3b642586a3b8'
ATTEMPT = BASE / 'T115-FINAL-QA-ONE-SHOT-FULL6-R2-20261102.json'
DOC_POLICY_RECEIPT = BASE / 'T115-DOCUMENT-OWNER-SELECT-POSTFLIGHT-20261102.json'
FRESH_QA_APPROVAL = BASE / 'T115-FULL6-QA-HUMAN-APPROVAL-20261102.json'
FRESH_SCOPE_SHA256 = '305e9118bdbe67f661cdbb678f09feb72ec45ad4ff5354910f1b2685db5ab3d0'

LIVE_SNAPSHOT_RECEIPT = BASE / 'T115-FULL6-R2-QA-SNAPSHOT-20261102.json'
HISTORICAL_INSTALL_SHA256 = '94656ce18d73672a3659bbf37926b0122d506b86ed985bb5c762900fc3e501f3'
REVIEWED_LIVE_METADATA_SHA256 = '9d0162e2ef3b3111bc13cb4be8598e5a0c95cf272daaa1fc56ccb2759e29ef58'

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

def require_fresh_qa_approval():
    a = json.loads(FRESH_QA_APPROVAL.read_text())
    if (a.get('status') != 'DIRECT_HUMAN_EXACT_FRESH_POST_POLICY_QA_APPROVED'
            or a.get('scope_sha256') != FRESH_SCOPE_SHA256
            or a.get('manifest_sha256') != MANIFEST_SHA256
            or a.get('launcher_sha256') != hashlib.sha256(Path(__file__).read_bytes()).hexdigest()):
        raise Stop('EXACT_FRESH_QA_HUMAN_APPROVAL_REQUIRED')

def validate_document_policy_receipt():
    # Deprecated standalone receipt format; complete() uses the full live CSV gate.
    d = json.loads(DOC_POLICY_RECEIPT.read_text())
    expected = {
        'status':'PASS_DOCUMENT_OWNER_SELECT_METADATA_POSTFLIGHT_NOT_FUNCTIONAL_QA',
        'project_ref':PROJECT,
        'migration_sha256':'f0d1ee015746c17201e80ae86c8ee6b053cad75e8e44d3fc4341d95d9f9c5d45',
        'select_policy_name':'dog_documents_select',
        'select_policy_qual':'(((owner_id = auth.uid()) AND health_dog_owner_matches(dog_id, owner_id)) OR can_view_dog_document(id))',
        'select_policy_roles':['public'], 'select_all_policy_count':1,
        'rls_enabled':True, 'rls_forced':False,
        'table_acl_unchanged':True, 'other_policies_unchanged':True,
        'helpers_unchanged':True,
        'document_view_helper_body_md5':'caf0b0f5a099bd5ef356f36333b37f7b',
        'owner_match_helper_body_md5':'608febdba1b74dc18708cd45fae80ec8',
    }
    if any(type(d.get(k)) is not type(v) or d.get(k) != v for k,v in expected.items()):
        raise Stop('DOCUMENT_OWNER_SELECT_ACTUAL_POSTFLIGHT_REQUIRED')
    fresh(d.get('checked_at_utc'),15*60)


def validate_live_snapshot():
    # The timestamp comes from the exported SELECT, never from receipt creation.
    receipt = json.loads(LIVE_SNAPSHOT_RECEIPT.read_text())
    if (receipt.get('status') != 'PASS_T115_FRESH_READONLY_METADATA_AND_STORAGE_SNAPSHOT'
            or receipt.get('project_ref') != PROJECT
):
        raise Stop('FRESH_READONLY_RECEIPT_REQUIRED')
    provenance = receipt.get('project_ref_provenance')
    if provenance == 'AGENT_OBSERVED_ANYVO_PRODUCTION_SQL_EDITOR_URL_NOT_CSV_FIELD':
        evidence = receipt.get('project_ref_evidence')
        parsed = urlparse(evidence) if isinstance(evidence, str) else None
        if (parsed is None or parsed.scheme != 'https' or parsed.netloc != 'supabase.com'
                or not (parsed.path == '/dashboard/project/' + PROJECT + '/sql'
                        or parsed.path.startswith('/dashboard/project/' + PROJECT + '/sql/'))
                or receipt.get('source') != 'Agent-observed read-only Supabase SQL Editor CSV through CUA'):
            raise Stop('FRESH_READONLY_RECEIPT_REQUIRED')
    elif provenance != 'USER_CONFIRMED_ANYVO_PRODUCTION_SQL_EDITOR_NOT_CSV_FIELD':
        raise Stop('FRESH_READONLY_RECEIPT_REQUIRED')
    expected_bindings = {'sql_sha256': '3c56850ba5575b91be1968e4e0d1301e5e832d6300cb5e7f8b30aaf8040bf8b3', 'plan_sha256': '305e9118bdbe67f661cdbb678f09feb72ec45ad4ff5354910f1b2685db5ab3d0', 'fixture_sha256': 'c064acb75c94e79075b2d9dc7f407430cff24946aa0a48f4ef94f543910b5386'}
    if any(receipt.get(key) != value for key, value in expected_bindings.items()):
        raise Stop('QA_COMPONENT_SOURCE_DRIFT')
    raw = Path(receipt['source_csv_path']).read_bytes()
    if hashlib.sha256(raw).hexdigest() != receipt.get('source_csv_sha256'):
        raise Stop('QA_COMPONENT_SOURCE_DRIFT')
    rows = list(csv.DictReader(raw.decode('utf-8-sig').splitlines()))
    if len(rows) != 1:
        raise Stop('FRESH_READONLY_RECEIPT_REQUIRED')
    row = rows[0]
    checked = row.pop('checked_at_utc')
    if checked != receipt.get('checked_at_utc'):
        raise Stop('RECEIPT_TIME_INVALID')
    normalized = {}
    for key, value in row.items():
        try:
            normalized[key] = json.loads(value)
        except json.JSONDecodeError:
            normalized[key] = value
    expected_counts = {'exact_owner_dog_count': 1, 'recipient_owns_exact_dog_count': 0, 'exact_accepted_connection_count': 1, 'prior_qa_grants_active_count': 0, 'exact_scope_active_grants_count': 0, 'dog_health_vaccinations_new_id_collision_count': 0, 'dog_deworming_entries_new_id_collision_count': 0, 'dog_health_medications_new_id_collision_count': 0, 'dog_health_conditions_new_id_collision_count': 0, 'dog_vet_appointments_new_id_collision_count': 0, 'dog_documents_new_id_collision_count': 0, 'stage_b_row_new_id_collision_count': 0, 'new_grant_id_collision_count': 0, 'prior_qa_fixture_or_file_remaining_count': 0, 'prior_full2_fixture_or_file_remaining_count': 0, 'prior_full3_fixture_or_file_remaining_count': 0, 'prior_full4_fixture_or_file_remaining_count': 0, 'prior_full5_fixture_or_file_remaining_count': 0}
    for key, value in expected_counts.items():
        actual = normalized.pop(key, None)
        if type(actual) is not int or actual != value:
            raise Stop('FIXED_ID_COLLISION')
    digest = hashlib.sha256(json.dumps(normalized, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    # Exact entire reviewed metadata, including ALL storage policies and duplicates.
    # database_name alone is not project evidence; provenance remains user export.
    if digest != REVIEWED_LIVE_METADATA_SHA256:
        raise Stop('STAGE_B_INSTALLED_METADATA_POSTFLIGHT_REQUIRED')
    # SQL explicitly used AT TIME ZONE UTC, yielding a timezone-less CSV field.
    parsed = dt.datetime.fromisoformat(checked)
    if parsed.tzinfo is not None:
        raise Stop('RECEIPT_TIME_INVALID')
    fresh(parsed.replace(tzinfo=dt.timezone.utc).isoformat(), 10 * 60)


def validate_receipts(install_path, storage_path):
    validate_live_snapshot()
    require_date()
    if hashlib.sha256(Path(install_path).read_bytes()).hexdigest() != HISTORICAL_INSTALL_SHA256:
        raise Stop('STAGE_B_INSTALLED_METADATA_POSTFLIGHT_REQUIRED')
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
    # Historical installation evidence is immutable; freshness is checked above on live CSV.
    storage = json.loads(Path(storage_path).read_text())
    path = OWNER + '/b4991851-e569-51fc-a0af-4e0172f2bc63/t115-health-7820b9c9-ef27-4f2b-98f0-91f4bc8be063.png'
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
              'launcher_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'fresh_scope_sha256': FRESH_SCOPE_SHA256}
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

SAFE_GUARD_CODES = frozenset(['ACTIVE_GRANT_ID_MISMATCH', 'ACTIVE_GRANT_PREEXISTS', 'ACTIVE_GRANT_READBACK_FAILED', 'ACTIVE_GRANT_SCOPE_MISMATCH', 'ACTIVE_GRANT_TIME_INVALID', 'ACTIVE_GRANT_TIME_MISMATCH', 'ACTIVE_INBOX_MISMATCH', 'ACTIVE_INBOX_TIME_INVALID', 'ACTIVE_INBOX_TIME_MISMATCH', 'ACTIVE_READBACK_MISMATCH', 'ACTIVE_SIGNING_FAILED', 'ACTIVE_WEIGHT_FIXTURE_MISSING', 'ACTIVE_WEIGHT_GRANT_PREEXISTS', 'ANON_EXACT_ROW_VISIBLE_OR_ERROR', 'ANON_INBOX_NOT_DENIED', 'ANON_ROW_VISIBLE_OR_ERROR', 'ANON_RPC_NOT_DENIED', 'ANON_UNSIGNED_PNG_VISIBLE', 'ANON_UNSIGNED_STORAGE_VISIBLE', 'ANON_WEIGHT_RPC_NOT_DENIED', 'CONNECTION_DRIFT', 'CONNECTION_ID_INVALID', 'DOCUMENT_OWNER_SELECT_ACTUAL_POSTFLIGHT_REQUIRED', 'DOG_OWNER_DRIFT', 'EXACT_FRESH_QA_HUMAN_APPROVAL_REQUIRED', 'EXACT_ROW_CONTENT_MISMATCH', 'EXACT_ROW_COUNT_MISMATCH', 'EXACT_ROW_HTTP_ERROR', 'EXACT_ROW_ID_MISMATCH', 'EXACT_ROW_OUT_OF_SCOPE', 'EXACT_ROW_SCOPE_MISMATCH', 'EXPIRED_DIRECT_ROW_VISIBLE', 'FIXED_GRANT_ID_COLLISION', 'FIXED_ID_COLLISION', 'FIXED_PROBE_ID_COLLISION_OR_ERROR', 'FIXED_ROW_ID_COLLISION', 'FIXED_STORAGE_PATH_COLLISION', 'FIXED_STORAGE_PATH_COLLISION_OR_ERROR', 'FIXED_TEST_ACCOUNT_SCOPE_DRIFT', 'FIXTURE_CHANGED_AFTER_DENIAL', 'FIXTURE_MANIFEST_DRIFT', 'FIXTURE_SCOPE_DRIFT', 'FRESH_EXACT_STORAGE_ABSENCE_REQUIRED', 'FRESH_READONLY_RECEIPT_REQUIRED', 'FULL_SECTIONS_PASS_AND_CLEANUP_REQUIRED', 'FUTURE_WINDOW_ELAPSED', 'GRANT_ACTIVATION_NOT_PERSISTED', 'GRANT_CLEANUP_READ_FAILED', 'GRANT_CLEANUP_SCOPE_UNCERTAIN', 'GRANT_CONNECTION_MISMATCH', 'GRANT_EXPIRY_EXTENDED', 'GRANT_INSERT_FAILED', 'GRANT_LIST_READ_FAILED', 'GRANT_LIST_SHAPE_INVALID', 'GRANT_LIST_TIME_INVALID', 'GRANT_READBACK_MISMATCH', 'GRANT_REVOKE_NOT_PERSISTED', 'GRANT_REVOKE_UNCERTAIN', 'GRANT_SCOPE_MISMATCH', 'GRANT_SCOPE_OR_TIME_MISMATCH', 'GRANT_START_MISMATCH', 'GRANT_TIME_INVALID', 'GRANT_UNEXPECTED_REVOCATION', 'GRANT_WINDOW_EXCEEDED', 'HISTORICAL_GRANT_SHAPE_INVALID', 'HISTORICAL_GRANT_TIME_INVALID', 'INACTIVE_INBOX_VISIBLE', 'INACTIVE_NEW_SIGNED_URL_ALLOWED', 'INACTIVE_READBACK_VISIBLE', 'INVALID_AUTH_RESPONSE', 'INVALID_RESPONSE_JSON', 'INVALID_RPC_CONTRACT', 'LOCAL_TTY_REQUIRED', 'MISSING_NORMAL_JWT', 'MUTATION_REQUEST_OUT_OF_SCOPE', 'MUTATION_RESPONSE_NOT_JSON', 'MUTATION_RESPONSE_TOO_LARGE', 'NARROW_WEIGHT_RPC_HTTP_ERROR', 'NARROW_WEIGHT_RPC_MISSING', 'NARROW_WEIGHT_RPC_SHAPE_ERROR', 'NONOWNER_DELETE_CHANGED_EVENT', 'NONOWNER_DELETE_NOT_DENIED', 'NORMAL_JWT_REQUIRED', 'NO_GRANT_DIRECT_ROW_VISIBLE', 'OLD_SIGNED_URL_DENIAL_INCONCLUSIVE', 'OWNER_DELETE_FAILED', 'OWNER_DELETE_NOT_PERSISTED', 'OWNER_DELETE_SHAPE_MISMATCH', 'OWNER_DOCUMENT_MISMATCH', 'OWNER_DOG_PROBE_MISMATCH', 'OWNER_FIXTURE_INSERT_FAILED', 'OWNER_FIXTURE_MISSING', 'OWNER_INSERT_FAILED', 'OWNER_INSERT_NOT_PERSISTED', 'OWNER_INSERT_NOT_VISIBLE', 'OWNER_INSERT_SHAPE_MISMATCH', 'OWNER_ONLY_DOG_PROBE_MISMATCH', 'OWNER_PNG_MISMATCH', 'OWNER_PNG_READBACK_FAILED', 'OWNER_PNG_UPLOAD_UNCERTAIN', 'OWNER_READ_FAILED', 'OWNER_RECEIVED_OWN_DOG', 'OWNER_ROW_CHANGED', 'OWNER_ROW_ID_MISMATCH', 'OWNER_ROW_SCOPE_MISMATCH', 'OWNER_UPDATE_NOT_PERSISTED', 'OWNER_WEIGHT_MISMATCH', 'PNG_HASH_DRIFT', 'PREVIOUS_ATTEMPT_EXISTS_REVIEW_REQUIRED', 'PRE_REVOKE_SIGN_FAILED', 'PROBE_CLEANUP_READ_FAILED', 'PROBE_CLEANUP_SCOPE_UNCERTAIN', 'PROBE_DELETE_NOT_PERSISTED', 'PUBLIC_CONFIGURATION_FILE_NOT_PRIVATE', 'PUBLIC_CONFIGURATION_PROJECT_MISMATCH', 'PUBLIC_KEY_FILE_NOT_PRIVATE', 'PUBLIC_KEY_FILE_TARGET_MISMATCH', 'PUBLIC_KEY_REQUIRED', 'PUBLIC_KEY_ROLE_OR_PROJECT_MISMATCH', 'QA_COMPONENT_SOURCE_DRIFT', 'QA_DATE_EXPIRED_REFRESH_PLAN', 'QA_DATE_EXPIRED_REFRESH_REVIEW_REQUIRED', 'QA_EVENT_ID_COLLISION', 'QA_MANIFEST_DRIFT', 'QA_MANIFEST_SCOPE_MISMATCH', 'READBACK_REQUEST_OUT_OF_SCOPE', 'READ_FAILED', 'RECEIPT_TIME_INVALID', 'RECIPIENT_AUTH_PNG_MISMATCH', 'RECIPIENT_BASE_HEALTH_ROW_VISIBLE', 'RECIPIENT_DELETE_NOT_DENIED', 'RECIPIENT_DIRECT_TABLE_VISIBLE', 'RECIPIENT_INBOX_COUNT_MISMATCH', 'RECIPIENT_INBOX_NOT_ACTIVE', 'RECIPIENT_INBOX_SHAPE_MISMATCH', 'RECIPIENT_INBOX_TIME_INVALID', 'RECIPIENT_INSERT_NOT_DENIED', 'RECIPIENT_INSERT_PROBE_PERSISTED_OR_UNCERTAIN', 'RECIPIENT_OWNER_PROBE_NOT_EMPTY', 'RECIPIENT_RPC_COUNT_MISMATCH', 'RECIPIENT_RPC_SHAPE_MISMATCH', 'RECIPIENT_SEES_OWN_DOG_AS_SHARED', 'RECIPIENT_SIGNED_PNG_MISMATCH', 'RECIPIENT_STORAGE_DELETE_NOT_DENIED', 'RECIPIENT_STORAGE_UPDATE_NOT_DENIED_OR_INCONCLUSIVE', 'RECIPIENT_UPDATE_NOT_DENIED', 'REQUEST_OUT_OF_SCOPE', 'RESPONSE_TOO_LARGE', 'REVOKED_DIRECT_ROW_VISIBLE', 'REVOKE_NOT_PERSISTED', 'ROW_CLEANUP_SCOPE_UNCERTAIN', 'ROW_DELETE_NOT_PERSISTED', 'ROW_DELETE_UNCERTAIN', 'ROW_READ_FAILED', 'RPC_HTTP_ERROR', 'SHARED_WEIGHT_COUNT_MISMATCH', 'SHARED_WEIGHT_SHAPE_MISMATCH', 'SIGNED_PNG_READBACK_MISMATCH', 'SIGNED_PNG_RESPONSE_TOO_LARGE', 'SIGNED_PNG_TOO_LARGE', 'SIGNED_URL_HOST_MISMATCH', 'SIGNED_URL_INVALID', 'SIGNED_URL_PATH_MISMATCH', 'STAGE_B_FUNCTIONAL_PASS_REQUIRED', 'STAGE_B_INSTALLED_METADATA_POSTFLIGHT_REQUIRED', 'STAGE_B_PASS_RECEIPT_REQUIRED', 'STAGE_B_RECEIPT_STALE', 'STAGE_B_RECEIPT_TIME_INVALID', 'STAGE_B_ROW_COUNT_DRIFT_REVIEW_REQUIRED', 'STORAGE_CLEANUP_SCOPE_UNCERTAIN', 'STORAGE_DELETE_NOT_PERSISTED', 'STORAGE_DELETE_UNCERTAIN', 'STORAGE_PATH_PREFLIGHT_REQUIRED', 'STORAGE_PATH_PREFLIGHT_STALE', 'STORAGE_PATH_PREFLIGHT_TIME_INVALID', 'SYNTHETIC_DOG_HEALTH_NOT_EMPTY', 'TLS_VERIFICATION_REQUIRED', 'TOTAL_10_MINUTE_DEADLINE', 'TOTAL_15_MINUTE_DEADLINE', 'UNAUTHORIZED_DELETE_CHANGED_OWNER_ROW', 'UNAUTHORIZED_INSERT_PROBE_VISIBLE_RETAINED', 'UNAUTHORIZED_UPDATE_CHANGED_OWNER_ROW', 'UNTRUSTED_SYSTEM_CA'])

SAFE_GUARD_CODES = SAFE_GUARD_CODES | frozenset({'TOTAL_15_MINUTE_DEADLINE',
    'NORMAL_LOGIN_A_REJECTED', 'NORMAL_LOGIN_B_REJECTED',
    'IDENTITY_A_MISMATCH', 'IDENTITY_B_MISMATCH'})

def safe_code(error):
    if isinstance(error,KeyboardInterrupt): return 'STOP_LOCAL_INPUT_CANCELLED'
    if isinstance(error,(TimeoutError,ConnectionError)): return 'STOP_NETWORK_REQUEST_FAILED_OR_TIMEOUT'
    value = error.args[0] if error.args else None
    if type(error).__name__ == 'Stop' and type(value) is str:
        if re.fullmatch(r'CLEANUP_UNCERTAIN_(?:grant|row|rows|storage|probe|probes)(?:,(?:grant|row|rows|storage|probe|probes))*',value):
            return 'STOP_' + value.upper()
        if value in SAFE_GUARD_CODES:
            return 'STOP_' + value
    return 'STOP_UNEXPECTED_LOCAL_QA_ERROR'

def complete(install_path, storage_path):
    require_date()
    verify_sources()
    require_fresh_qa_approval()
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
        overall_deadline = time.monotonic() + 15 * 60
        tokens = {}
        for label, email, uid in users:
            state['phase'] = 'login_' + label
            if time.monotonic() >= overall_deadline:
                raise Stop('TOTAL_15_MINUTE_DEADLINE')
            tokens[label] = stage['qa']['login'](key, label, email, uid)
            if time.monotonic() >= overall_deadline:
                raise Stop('TOTAL_15_MINUTE_DEADLINE')
        state['overall_test_limit_minutes'] = 15
        # Keep original numeric freshness limits; no browser action or post-login-only timestamp barrier.
        state['phase'] = 'post_login_freshness_guard'
        private_json(BASE / ('T115-POST-POLICY-QA-AUTH-READY-' + now().strftime('%Y%m%dT%H%M%S%fZ') + '.json'),
            {'code':'NORMAL_TEST_ACCOUNTS_AUTHENTICATED_NO_DATA_PHASE_YET',
             'ready_at_utc':utc(now()),'launcher_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
             'manifest_sha256':MANIFEST_SHA256,'verified_test_account_ids':[OWNER,RECIPIENT]})
        verify_sources()
        require_fresh_qa_approval()
        validate_receipts(install_path, storage_path)
        if time.monotonic() >= overall_deadline: raise Stop('TOTAL_15_MINUTE_DEADLINE')
        state['phase'] = 'stage_b'
        try:
            code = stage['run'](key=key, tokens=tokens, deadline=overall_deadline)
        except BaseException as error:
            state['component_receipts']['stage_b'] = str(stage['write_safe_result'](safe_code(error)))
            raise
        stage_path = stage['write_safe_result'](code)
        state['component_receipts']['stage_b'] = str(stage_path)
        if code != 'PASS_T115_STAGE_B_NORMAL_JWT_OWNER_RECIPIENT_ISOLATION':
            raise Stop('STAGE_B_FUNCTIONAL_PASS_REQUIRED')
        verify_sources()
        require_fresh_qa_approval()
        validate_receipts(install_path, storage_path)
        if time.monotonic() >= overall_deadline: raise Stop('TOTAL_15_MINUTE_DEADLINE')
        state['phase'] = 'sections_docs_storage'
        try:
            code = sections['run'](stage_path, storage_path, key=key, tokens=tokens, deadline=overall_deadline)
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
    result_path = BASE / ('T115-FINAL-QA-RESULT-FULL6-R2-' + now().strftime('%Y%m%dT%H%M%S%fZ') + '.json')
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
