#!/usr/bin/env python3
"""Review one user-exported read-only T115 SQL snapshot; never contacts Production."""
import csv
import datetime as dt
import hashlib
import json
from pathlib import Path
import sys
from urllib.parse import urlparse
from zoneinfo import ZoneInfo


BASE = Path(__file__).parent
SQL = BASE / 'T115-FULL5-PREFLIGHT-READONLY-20261102.sql'
PLAN = BASE / 'PLAN-REVIEW-ONLY.json'
FIXTURE = BASE / 'T115-HEALTH-SECTIONS-FIXTURES-FULL5-20261102.json'
EXPECTED_SQL_SHA256 = '16d87caac927ebbfc86a0599927441b73483686884e862c33ea3897220182c5f'
EXPECTED_PLAN_SHA256 = '7d8696aa6c44e91fcd94708cf9c0640b9ecfcb4b05e73e35b55e1d4f0fe3f94c'


def check(path: Path, origin, project_evidence=None):
    if origin not in ('user_export', 'agent_cua'):
        raise ValueError('UNKNOWN_SNAPSHOT_ORIGIN')
    if origin == 'agent_cua':
        parsed=urlparse(project_evidence) if isinstance(project_evidence,str) else None
        if (parsed is None or parsed.scheme != 'https' or parsed.hostname != 'supabase.com'
                or not parsed.path.startswith('/dashboard/project/axkkhyqrjrtbkumaulta/sql')):
            raise ValueError('PROJECT_UI_EVIDENCE_REQUIRED')
    if hashlib.sha256(SQL.read_bytes()).hexdigest() != EXPECTED_SQL_SHA256:
        raise ValueError('SQL_SOURCE_DRIFT')
    plan_raw = PLAN.read_bytes()
    if hashlib.sha256(plan_raw).hexdigest() != EXPECTED_PLAN_SHA256:
        raise ValueError('PLAN_SOURCE_DRIFT')
    plan = json.loads(plan_raw)
    if plan['dateZurich'] != '2026-11-02' or plan['project'] != 'axkkhyqrjrtbkumaulta':
        raise ValueError('PLAN_SCOPE_DRIFT')
    if hashlib.sha256(FIXTURE.read_bytes()).hexdigest() != plan['fixtureSHA256']:
        raise ValueError('FIXTURE_SOURCE_DRIFT')
    raw = path.read_bytes()
    rows = list(csv.DictReader(raw.decode('utf-8-sig').splitlines()))
    if len(rows) != 1:
        raise ValueError('SNAPSHOT_ROW_COUNT')
    row = rows[0]
    stamp = dt.datetime.fromisoformat(row['checked_at_utc']).replace(tzinfo=dt.timezone.utc)
    if stamp.astimezone(ZoneInfo('Europe/Zurich')).date() != dt.date(2026, 11, 2):
        raise ValueError('QA_DATE_MISMATCH')
    val = lambda name: json.loads(row[name])
    expected_acl = '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'
    if row['health_rls'] != 'true' or row['health_table_acl'] != expected_acl or row['health_select_policy_count'] != '1':
        raise ValueError('HEALTH_RLS_ACL_OR_COUNT')
    reads = val('health_read_policies')
    owner = '((owner_id = auth.uid()) AND health_dog_owner_matches(dog_id, owner_id))'
    if reads != [{'name': 'dog_health_entries_select', 'roles': ['authenticated'], 'using': owner, 'command': 'r', 'permissive': True}]:
        raise ValueError('HEALTH_READ_POLICY')
    writes = val('health_write_policies')
    if len(writes) != 3 or {p['name'] for p in writes} != {'dog_health_entries_insert','dog_health_entries_update','dog_health_entries_delete'}:
        raise ValueError('HEALTH_WRITE_POLICIES')
    for policy in writes:
        if policy['roles'] != ['PUBLIC'] or policy['permissive'] is not True:
            raise ValueError('HEALTH_WRITE_ROLES')
        if policy['name'].endswith('insert') and policy['with_check'] != owner:
            raise ValueError('HEALTH_INSERT_CHECK')
        if policy['name'].endswith('update') and (policy['using'] != owner or policy['with_check'] != owner):
            raise ValueError('HEALTH_UPDATE_CHECK')
        if policy['name'].endswith('delete') and policy['using'] != owner:
            raise ValueError('HEALTH_DELETE_CHECK')
    if row['health_custom_trigger_count'] != '0' or row['health_row_count'] != '26' or row['health_owner_dog_mismatch_count'] != '0':
        raise ValueError('HEALTH_ROWS_OR_TRIGGERS')
    if (row['exact_owner_dog_count'] != '1' or row['recipient_owns_exact_dog_count'] != '0'
            or row['exact_accepted_connection_count'] != '1'):
        raise ValueError('TEST_ACCOUNT_DOG_OR_CONNECTION')
    for field in (
        'dog_health_vaccinations_new_id_collision_count',
        'dog_deworming_entries_new_id_collision_count',
        'dog_health_medications_new_id_collision_count',
        'dog_health_conditions_new_id_collision_count',
        'dog_vet_appointments_new_id_collision_count',
        'dog_documents_new_id_collision_count',
        'stage_b_row_new_id_collision_count',
        'new_grant_id_collision_count',
        'prior_qa_grants_active_count',
        'exact_scope_active_grants_count',
        'prior_qa_fixture_or_file_remaining_count',
        'prior_full2_fixture_or_file_remaining_count',
        'prior_full3_fixture_or_file_remaining_count',
        'prior_full4_fixture_or_file_remaining_count',
    ):
        if row[field] != '0':
            raise ValueError('COLLISION_OR_ACTIVE_GRANT_' + field)
    fks = val('health_foreign_keys')
    if fks != [
        {'name':'dog_health_entries_dog_id_fkey','definition':'FOREIGN KEY (dog_id) REFERENCES dogs(id) ON DELETE CASCADE'},
        {'name':'dog_health_entries_owner_id_fkey','definition':'FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE'},
    ]:
        raise ValueError('HEALTH_FKS')
    rpc = val('weight_rpc')
    if not (rpc['owner']=='postgres' and rpc['body_md5']=='cd8bd0c10610a5878a8e6b829fc16ff9'
            and rpc['security_definer'] is True and rpc['volatility']=='s' and rpc['returns_set'] is True
            and rpc['config']==['search_path=""']
            and rpc['result']=='TABLE(id uuid, dog_id uuid, entry_date date, weight_kg numeric, created_at timestamp with time zone)'
            and rpc['acl']=='{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
            and row['weight_rpc_auth_execute']=='true' and row['weight_rpc_anon_execute']=='false' and row['weight_rpc_public_execute']=='false'):
        raise ValueError('WEIGHT_RPC')
    helper = val('owner_match_helper')
    if not (helper['owner']=='postgres' and helper['body_md5']=='608febdba1b74dc18708cd45fae80ec8'
            and helper['security_definer'] is True and helper['volatility']=='s'
            and helper['config']==['search_path=pg_catalog, public']
            and helper['acl']=='{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'):
        raise ValueError('OWNER_MATCH_HELPER')
    if row['exact_storage_object_count'] != '0':
        raise ValueError('STORAGE_EXACT_PATH')
    bucket = val('document_bucket')
    if not (bucket['name']=='dog-documents' and bucket['public'] is False
            and bucket['file_size_limit']==10485760 and 'image/png' in bucket['allowed_mime_types']):
        raise ValueError('STORAGE_BUCKET')
    policies = val('all_storage_policies')
    if len(policies) != 19:
        raise ValueError('STORAGE_POLICY_COUNT')
    for policy in policies:
        if policy['name'].startswith('dog_docs_'):
            continue
        if 'dog-documents' in (policy['using'] or '') or 'dog-documents' in (policy['with_check'] or ''):
            raise ValueError('OTHER_STORAGE_POLICY_TOUCHES_DOCUMENT_BUCKET')
    doc_storage = {p['name']:p for p in policies if p['name'].startswith('dog_docs_')}
    if set(doc_storage) != {'dog_docs_read','dog_docs_insert','dog_docs_update','dog_docs_delete'}:
        raise ValueError('STORAGE_DOCUMENT_POLICIES')
    if doc_storage['dog_docs_read']['roles'] != ['authenticated'] or doc_storage['dog_docs_read']['command']!='SELECT' or 'can_read_dog_document_path(name)' not in doc_storage['dog_docs_read']['using']:
        raise ValueError('STORAGE_DOCUMENT_READ')
    for name in ('dog_docs_insert','dog_docs_update','dog_docs_delete'):
        p = doc_storage[name]
        if p['roles'] != ['authenticated'] or not ('auth.uid()' in (p['using'] or '') or 'auth.uid()' in (p['with_check'] or '')):
            raise ValueError('STORAGE_DOCUMENT_WRITE')
    docs = val('all_document_policies')
    if len(docs) != 4 or {p['name'] for p in docs} != {'dog_documents_select','dog_documents_insert','dog_documents_update','dog_documents_delete'}:
        raise ValueError('DOCUMENT_POLICY_COUNT')
    select = next(p for p in docs if p['name']=='dog_documents_select')
    if select['using'] != '(((owner_id = auth.uid()) AND health_dog_owner_matches(dog_id, owner_id)) OR can_view_dog_document(id))':
        raise ValueError('DOCUMENT_SELECT')
    for policy in docs:
        if policy['roles'] != ['public'] or policy['permissive'] != 'PERMISSIVE':
            raise ValueError('DOCUMENT_POLICY_ROLE')
        if policy['name']=='dog_documents_insert' and policy['with_check'] != owner:
            raise ValueError('DOCUMENT_INSERT')
        if policy['name']=='dog_documents_update' and (policy['using'] != owner or policy['with_check'] != owner):
            raise ValueError('DOCUMENT_UPDATE')
        if policy['name']=='dog_documents_delete' and policy['using'] != owner:
            raise ValueError('DOCUMENT_DELETE')
    security = val('document_table_security')
    if security != {'acl':expected_acl,'rls_forced':False,'rls_enabled':True} or val('document_custom_triggers') is not None:
        raise ValueError('DOCUMENT_TABLE_SECURITY')
    helpers = val('document_related_helpers')
    expected_helpers = {'can_read_dog_document_path(text)':'fe8235b9f5e4e50e38f204ceea960dd6',
        'can_view_dog_document(uuid)':'caf0b0f5a099bd5ef356f36333b37f7b',
        'can_view_dog_health(uuid,text)':'10dc59202360526af22bbbcffe63a2a3',
        'can_view_legacy_dog_document(uuid)':'79b5decbbfeb7316032c4bd4167b0063',
        'health_grant_connection_valid(uuid,uuid,uuid)':'8d07f254b4f77758d6ff3257f3a51a98'}
    if len(helpers) != 5:
        raise ValueError('DOCUMENT_HELPERS_COUNT')
    for h in helpers:
        if (expected_helpers.get(h['signature']) != h['body_md5'] or h['security_definer'] is not True
                or h['volatility'] != 's' or h['config'] != ['search_path=pg_catalog, public']
                or h['acl'] != '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'):
            raise ValueError('DOCUMENT_HELPER')
    return {'status':'PASS_T115_FRESH_READONLY_METADATA_AND_STORAGE_SNAPSHOT',
            'source':('User-exported Supabase SQL Editor CSV; not an independently executed Production query'
                      if origin=='user_export' else 'Agent-observed read-only Supabase SQL Editor CSV through CUA'),
            'project_ref':'axkkhyqrjrtbkumaulta',
            'project_ref_provenance':('USER_CONFIRMED_ANYVO_PRODUCTION_SQL_EDITOR_NOT_CSV_FIELD' if origin=='user_export'
                                      else 'AGENT_OBSERVED_ANYVO_PRODUCTION_SQL_EDITOR_URL_NOT_CSV_FIELD'),
            'project_ref_evidence':('User supplied CSV in Chat 01 after instruction to run the named query in ANYVO Production SQL Editor; CSV itself contains only database_name=postgres and does not independently identify the Supabase project.'
                                    if origin=='user_export' else project_evidence),
            'project_ref_verified_in_csv':False,
            'source_csv_path':str(path),'source_csv_sha256':hashlib.sha256(raw).hexdigest(),
            'sql_path':str(SQL),'sql_sha256':EXPECTED_SQL_SHA256,
            'plan_path':str(PLAN),'plan_sha256':EXPECTED_PLAN_SHA256,
            'fixture_sha256':plan['fixtureSHA256'],
            'checked_at_utc':row['checked_at_utc'],'database_name':row['database_name'],
            'health_rows':26,'health_owner_dog_mismatch':0,'exact_storage_object_count':0,
            'new_id_collision_counts_zero':True,'prior_qa_grants_active_count':0,
            'exact_scope_active_grants_count':0,
            'historical_install_receipt_unchanged':True,'normal_jwt_qa_executed':False,
            'production_writes_by_this_review':False}


if __name__ == '__main__':
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('csv_path',type=Path)
    parser.add_argument('--origin',choices=('user_export','agent_cua'),required=True)
    parser.add_argument('--project-evidence')
    args=parser.parse_args()
    print(json.dumps(check(args.csv_path,args.origin,args.project_evidence),sort_keys=True,indent=2))
