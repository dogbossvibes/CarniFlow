#!/usr/bin/env python3
"""One deliberate normal-JWT owner fixture diagnostic. No grant or Storage writes.

Not full T115 acceptance and never a release gate. Credentials remain RAM-only.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import sys
import time

BASE = Path(__file__).resolve().parent
COMMON = BASE / 't115-final-qa-sections-safari-free-01.py'
COMMON_SHA = '22f97bed1e8dc94e644e723f8fff458a05c7d8330dab09e344dee3f4f53e6606'
PRIOR = BASE / 'T115-FINAL-QA-RESULT-20261101T202450715369Z.json'
POST = BASE.parent / 't115-health-sharing-db-05-20261029/T115-POSTSTOP-BOUNDED-READONLY-RESULT-20261101T203238Z.json'
ATTEMPT = BASE / 'T115-OWNER-FIXTURE-DIAGNOSTIC-ONE-SHOT-20261101.json'
EXPECTED_COUNTS = {'vet_fixture', 'exact_png_object', 'deworming_fixture', 'document_fixtures',
                  'condition_fixtures', 'medication_fixture', 'vaccination_fixture',
                  'stage_b_weight_fixture', 'fixed_negative_probe_rows'}
PRIOR_SHA = 'e1b1c43b003245c411ca7fc53366fd945463f93aaeb293e43b33bea12c35cb89'
POST_SHA = '59ffd508ee72a53fe0a8baf2fcc6d2adf123afc53e49d80f21e526fb54d2eea0'
SAFE_CODES = re.compile(r'(?:[0-9A-Z]{5}|PGRST[0-9]{3})')

class Stop(Exception):
    pass

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def now():
    return dt.datetime.now(dt.timezone.utc)

def load_verified():
    if sha(COMMON) != COMMON_SHA:
        raise Stop('COMMON_SOURCE_DRIFT')
    common = runpy.run_path(str(COMMON))
    common['require_date']()
    common['verify_sources']()
    prior = json.loads(PRIOR.read_text())
    if (sha(PRIOR) != PRIOR_SHA or prior.get('code') != 'STOP_OWNER_FIXTURE_INSERT_FAILED'
            or prior.get('launcher_sha256') != COMMON_SHA
            or prior.get('manifest_sha256') != common['MANIFEST_SHA256']
            or prior.get('phase') != 'sections_docs_storage'):
        raise Stop('ACTUAL_OWNER_INSERT_STOP_REQUIRED')
    post = json.loads(POST.read_text())
    counts = post.get('exact_test_counts')
    if (sha(POST) != POST_SHA or post.get('project_ref') != common['PROJECT']
            or post.get('document_rls_enabled') is not True
            or type(counts) is not dict or set(counts) != EXPECTED_COUNTS
            or any(type(v) is not int or v != 0 for v in counts.values())
            or post.get('exact_test_grants') != [{'id': '9e984c75-db12-4105-ac31-c566240fb73a',
                    'active_now': False, 'revoked_at': '2026-11-01T19:39:52+00:00'}]):
        raise Stop('INDEPENDENT_CLEAN_STATE_REQUIRED')
    common['fresh'](post['checked_at_utc'], 15 * 60)
    return common

def private_result(path, data):
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(data, f, sort_keys=True, separators=(',', ':'))
        f.write('\n'); f.flush(); os.fsync(f.fileno())

SAFE_STOP_CODES = frozenset({
    'COMMON_SOURCE_DRIFT', 'ACTUAL_OWNER_INSERT_STOP_REQUIRED', 'INDEPENDENT_CLEAN_STATE_REQUIRED',
    'OWNER_DOG_PROBE_MISMATCH', 'FIXED_ID_COLLISION_NO_MUTATION',
    'OWNER_FIXTURE_INSERT_DIAGNOSED_NOT_FULL_QA', 'FIXED_OWNER_ACCOUNT_REQUIRED',
    'EXACT_ROW_CONTENT_MISMATCH', 'EXACT_ROW_COUNT_MISMATCH', 'EXACT_ROW_SCOPE_MISMATCH',
    'ROW_READ_FAILED', 'MUTATION_REQUEST_OUT_OF_SCOPE', 'MUTATION_RESPONSE_TOO_LARGE',
    'MUTATION_RESPONSE_NOT_JSON', 'TOTAL_10_MINUTE_DEADLINE',
    'QA_DATE_EXPIRED_REFRESH_REVIEW_REQUIRED', 'QA_MANIFEST_DRIFT',
    'QA_MANIFEST_SCOPE_MISMATCH', 'QA_COMPONENT_SOURCE_DRIFT', 'FRESH_READONLY_RECEIPT_REQUIRED',
})

def safe_error(error):
    if isinstance(error, KeyboardInterrupt):
        return 'LOCAL_INPUT_CANCELLED'
    if isinstance(error, (TimeoutError, ConnectionError)):
        return 'NETWORK_REQUEST_FAILED_OR_TIMEOUT'
    value = error.args[0] if error.args else None
    return value if type(error).__name__ == 'Stop' and type(value) is str and value in SAFE_STOP_CODES else 'UNEXPECTED_DIAGNOSTIC_ERROR'

def diagnostic(common, key, tokens, sections, state):
    """No login, Storage operation or grant operation is possible in this function."""
    read = sections['r']; attempted = []
    api = sections['api']
    api_ns = api.__globals__
    read_ns = read['request'].__globals__
    deadline = time.monotonic() + 10 * 60
    api_ns.update(DEADLINE=deadline, CLEANUP_MODE=False)
    read_ns.update(READ_DEADLINE=deadline, READ_CLEANUP_MODE=False)
    try:
        state['phase'] = 'owner_and_absence_preflight'
        if read['rows'](key, tokens, 'A', read['DOG_OWNER_A']) != [{'id': sections['DOG'], 'owner_id': common['OWNER']}]:
            raise Stop('OWNER_DOG_PROBE_MISMATCH')
        for table, items in sections['ROWS'].items():
            for item_id in items:
                if read['rows'](key, tokens, 'A', read['EXACT'][(table, item_id)]):
                    raise Stop('FIXED_ID_COLLISION_NO_MUTATION')
        state['phase'] = 'owner_fixture_diagnostic'
        for table, items in sections['ROWS'].items():
            for item_id, body in items.items():
                attempted.append((table, item_id))
                status, data = api(key, tokens, 'A', 'POST', '/rest/v1/' + table, body)
                error_code = data.get('code') if isinstance(data, dict) else None
                safe_code = error_code if type(error_code) is str and SAFE_CODES.fullmatch(error_code) else None
                entry = {'table': table, 'fixture_id': item_id, 'http_status': status,
                         'safe_database_error_code': safe_code,
                         'representation_is_single_expected_id': isinstance(data, list) and len(data) == 1 and isinstance(data[0], dict) and data[0].get('id') == item_id}
                state['requests'].append(entry)
                if status not in (200, 201) or not entry['representation_is_single_expected_id']:
                    state['failed_insert'] = entry
                    raise Stop('OWNER_FIXTURE_INSERT_DIAGNOSED_NOT_FULL_QA')
                sections['fixed_row'](key, tokens, table, item_id)
        state['code'] = 'PASS_OWNER_FIXTURE_INSERT_DIAGNOSTIC_NOT_FULL_T115_QA'
    except BaseException as error:
        state['code'] = 'STOP_' + safe_error(error)
    finally:
        api_ns['CLEANUP_MODE'] = True; read_ns['READ_CLEANUP_MODE'] = True
        failures = []
        for table, item_id in reversed(attempted):
            try:
                sections['cleanup_row'](key, tokens, table, item_id)
            except BaseException:
                failures.append({'table': table, 'fixture_id': item_id})
        # Verify all fixed fixture IDs, including ones not reached, without touching them.
        if attempted:
            for table, items in sections['ROWS'].items():
                for item_id in items:
                    try:
                        if read['rows'](key, tokens, 'A', read['EXACT'][(table, item_id)]):
                            failures.append({'table': table, 'fixture_id': item_id})
                    except BaseException:
                        failures.append({'table': table, 'fixture_id': item_id})
        state['cleanup'] = 'UNCERTAIN' if failures else 'ALL_FIXED_FIXTURES_ABSENT_TO_OWNER_NORMAL_JWT' if attempted else 'NO_MUTATION_ATTEMPTED'
        if failures:
            state['cleanup_uncertain_fixed_ids'] = failures
            state['code'] = 'STOP_DIAGNOSTIC_CLEANUP_UNCERTAIN'
        api_ns.update(DEADLINE=None, CLEANUP_MODE=False)
        read_ns.update(READ_DEADLINE=None, READ_CLEANUP_MODE=False)
    return state

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--execute-approved', action='store_true')
    args = parser.parse_args()
    if not args.execute_approved:
        print('STOP_EXPLICIT_APPROVED_DIAGNOSTIC_START_REQUIRED'); return 2
    try:
        common = load_verified()
        state = {'phase': 'login', 'code': None, 'requests': [], 'full_t115_acceptance': False,
                 'grant_operations': 0, 'storage_operations': 0, 'source_sha256': sha(Path(__file__)),
                 'manifest_sha256': common['MANIFEST_SHA256']}
        private_result(ATTEMPT, {'started_at_utc': common['utc'](now()), 'source_sha256': state['source_sha256'],
                                'one_shot_no_automatic_retry': True})
        try:
            stage = runpy.run_path(str(common['STAGE_B']))
            sections = runpy.run_path(str(common['SECTIONS']))
            label, email, uid = stage['core']['USERS'][0]
            if (label, uid) != ('A', common['OWNER']): raise Stop('FIXED_OWNER_ACCOUNT_REQUIRED')
            key = common['public_key']()
            print('Nur Testkonto A anmelden. Kein B-Passwort und kein Schluessel erforderlich.', flush=True)
            tokens = {'A': stage['qa']['login'](key, label, email, uid)}
            common['require_date'](); common['verify_sources']()
            diagnostic(common, key, tokens, sections, state)
        except BaseException as error:
            state['code'] = 'STOP_' + safe_error(error)
        state['finished_at_utc'] = common['utc'](now())
        result = BASE / ('T115-OWNER-FIXTURE-DIAGNOSTIC-RESULT-' + now().strftime('%Y%m%dT%H%M%S%fZ') + '.json')
        private_result(result, state)
        print(state['code']); print('Ergebnisdatei: ' + str(result))
        return 0 if state['code'].startswith('PASS_') else 2
    except BaseException as error:
        print('STOP_' + safe_error(error)); return 2

if __name__ == '__main__':
    sys.exit(main())
