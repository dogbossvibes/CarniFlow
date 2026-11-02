import csv
import datetime as dt
import json
from pathlib import Path
import runpy
import tempfile
import unittest
from unittest.mock import patch

REVIEW = runpy.run_path(str(Path(__file__).with_name('t115-review-fresh-qa-snapshot-20261102-05.py')))
OWNER = '((owner_id = auth.uid()) AND health_dog_owner_matches(dog_id, owner_id))'
ACL = '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'
EXEC = '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
ZERO_FIELDS = (
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
)


def synthetic_row():
    def policy(name, command, using=None, with_check=None):
        return {'name':name,'roles':['PUBLIC'],'using':using,'command':command,
                'permissive':True,'with_check':with_check}
    writes = [policy('dog_health_entries_delete','d',OWNER),
              policy('dog_health_entries_insert','a',with_check=OWNER),
              policy('dog_health_entries_update','w',OWNER,OWNER)]
    storage = [{'name':f'other_{i}','roles':['authenticated'],'using':"bucket_id = 'other'",
                'command':'SELECT','permissive':'PERMISSIVE','with_check':None} for i in range(15)]
    storage += [
      {'name':'dog_docs_read','roles':['authenticated'],'using':"bucket_id = 'dog-documents' AND can_read_dog_document_path(name)",'command':'SELECT','permissive':'PERMISSIVE','with_check':None},
      {'name':'dog_docs_insert','roles':['authenticated'],'using':None,'command':'INSERT','permissive':'PERMISSIVE','with_check':'auth.uid() = owner_id'},
      {'name':'dog_docs_update','roles':['authenticated'],'using':'auth.uid() = owner_id','command':'UPDATE','permissive':'PERMISSIVE','with_check':None},
      {'name':'dog_docs_delete','roles':['authenticated'],'using':'auth.uid() = owner_id','command':'DELETE','permissive':'PERMISSIVE','with_check':None},
    ]
    def doc(name,command,using=None,check=None):
        return {'name':name,'roles':['public'],'using':using,'command':command,
                'permissive':'PERMISSIVE','with_check':check}
    docs = [doc('dog_documents_delete','DELETE',OWNER),
            doc('dog_documents_insert','INSERT',check=OWNER),
            doc('dog_documents_select','SELECT','(((owner_id = auth.uid()) AND health_dog_owner_matches(dog_id, owner_id)) OR can_view_dog_document(id))'),
            doc('dog_documents_update','UPDATE',OWNER,OWNER)]
    helper_hashes = {
      'can_read_dog_document_path(text)':'fe8235b9f5e4e50e38f204ceea960dd6',
      'can_view_dog_document(uuid)':'caf0b0f5a099bd5ef356f36333b37f7b',
      'can_view_dog_health(uuid,text)':'10dc59202360526af22bbbcffe63a2a3',
      'can_view_legacy_dog_document(uuid)':'79b5decbbfeb7316032c4bd4167b0063',
      'health_grant_connection_valid(uuid,uuid,uuid)':'8d07f254b4f77758d6ff3257f3a51a98',
    }
    helpers = [{'signature':k,'body_md5':v,'security_definer':True,'volatility':'s',
                'config':['search_path=pg_catalog, public'],'acl':EXEC} for k,v in helper_hashes.items()]
    row = {
      'checked_at_utc':'2026-11-02 12:00:00', 'database_name':'postgres',
      'health_rls':'true','health_table_acl':ACL,'health_select_policy_count':'1',
      'health_read_policies':json.dumps([{'name':'dog_health_entries_select','roles':['authenticated'],
          'using':OWNER,'command':'r','permissive':True}]),
      'health_write_policies':json.dumps(writes),'health_custom_trigger_count':'0',
      'health_foreign_keys':json.dumps([
        {'name':'dog_health_entries_dog_id_fkey','definition':'FOREIGN KEY (dog_id) REFERENCES dogs(id) ON DELETE CASCADE'},
        {'name':'dog_health_entries_owner_id_fkey','definition':'FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE'}]),
      'health_owner_dog_mismatch_count':'0','health_row_count':'26',
      'exact_owner_dog_count':'1','recipient_owns_exact_dog_count':'0','exact_accepted_connection_count':'1',
      'weight_rpc':json.dumps({'owner':'postgres','body_md5':'cd8bd0c10610a5878a8e6b829fc16ff9',
          'security_definer':True,'volatility':'s','returns_set':True,'config':['search_path=""'],
          'result':'TABLE(id uuid, dog_id uuid, entry_date date, weight_kg numeric, created_at timestamp with time zone)',
          'acl':EXEC}),
      'weight_rpc_auth_execute':'true','weight_rpc_anon_execute':'false','weight_rpc_public_execute':'false',
      'owner_match_helper':json.dumps({'owner':'postgres','body_md5':'608febdba1b74dc18708cd45fae80ec8',
          'security_definer':True,'volatility':'s','config':['search_path=pg_catalog, public'],'acl':EXEC}),
      'exact_storage_object_count':'0',
      'document_bucket':json.dumps({'name':'dog-documents','public':False,'file_size_limit':10485760,
          'allowed_mime_types':['image/png']}),
      'all_storage_policies':json.dumps(storage),'all_document_policies':json.dumps(docs),
      'document_table_security':json.dumps({'acl':ACL,'rls_forced':False,'rls_enabled':True}),
      'document_custom_triggers':'null','document_related_helpers':json.dumps(helpers),
    }
    row.update({field:'0' for field in ZERO_FIELDS})
    return row


class SnapshotReviewTests(unittest.TestCase):
    def review(self,row,origin='user_export',project_evidence=None):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'synthetic.csv'
            with path.open('w',newline='') as stream:
                writer=csv.DictWriter(stream,fieldnames=list(row))
                writer.writeheader();writer.writerow(row)
            return REVIEW['check'](path,origin,project_evidence)

    def test_synthetic_pass_and_source_binding(self):
        receipt=self.review(synthetic_row())
        self.assertEqual(receipt['status'],'PASS_T115_FRESH_READONLY_METADATA_AND_STORAGE_SNAPSHOT')
        self.assertEqual(receipt['project_ref_verified_in_csv'],False)
        self.assertEqual(receipt['sql_sha256'],REVIEW['EXPECTED_SQL_SHA256'])
        self.assertEqual(receipt['plan_sha256'],REVIEW['EXPECTED_PLAN_SHA256'])

    def test_every_new_id_or_active_grant_blocks(self):
        for field in ZERO_FIELDS:
            with self.subTest(field=field):
                row=synthetic_row();row[field]='1'
                with self.assertRaisesRegex(ValueError,'COLLISION_OR_ACTIVE_GRANT'):
                    self.review(row)

    def test_wrong_account_or_storage_or_date_blocks(self):
        for field,value,code in [
            ('exact_owner_dog_count','0','TEST_ACCOUNT'),
            ('recipient_owns_exact_dog_count','1','TEST_ACCOUNT'),
            ('exact_accepted_connection_count','0','TEST_ACCOUNT'),
            ('exact_storage_object_count','1','STORAGE_EXACT_PATH'),
            ('checked_at_utc','2026-11-01 22:00:00','QA_DATE_MISMATCH'),
        ]:
            with self.subTest(field=field):
                row=synthetic_row();row[field]=value
                with self.assertRaisesRegex(ValueError,code):self.review(row)

    def test_sql_or_plan_drift_blocks(self):
        row=synthetic_row()
        with patch.dict(REVIEW['check'].__globals__,{'EXPECTED_SQL_SHA256':'0'*64}):
            with self.assertRaisesRegex(ValueError,'SQL_SOURCE_DRIFT'):self.review(row)
        with patch.dict(REVIEW['check'].__globals__,{'EXPECTED_PLAN_SHA256':'0'*64}):
            with self.assertRaisesRegex(ValueError,'PLAN_SOURCE_DRIFT'):self.review(row)

    def test_agent_origin_requires_project_ui_evidence(self):
        row=synthetic_row()
        with self.assertRaisesRegex(ValueError,'PROJECT_UI_EVIDENCE_REQUIRED'):
            self.review(row,origin='agent_cua')
        receipt=self.review(row,origin='agent_cua',project_evidence='https://supabase.com/dashboard/project/axkkhyqrjrtbkumaulta/sql')
        self.assertEqual(receipt['project_ref_provenance'],'AGENT_OBSERVED_ANYVO_PRODUCTION_SQL_EDITOR_URL_NOT_CSV_FIELD')


if __name__=='__main__':unittest.main()
