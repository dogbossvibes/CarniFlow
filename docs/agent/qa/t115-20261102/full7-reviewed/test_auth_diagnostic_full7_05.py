import json
from pathlib import Path
import runpy
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).with_name('t115-final-qa-full7-05.py')
MOD = runpy.run_path(str(SOURCE))
NS = MOD['complete'].__globals__

class AuthDiagnosticReview(unittest.TestCase):
    def test_only_four_new_fixed_codes_are_exposed(self):
        for code in ('NORMAL_LOGIN_A_REJECTED','NORMAL_LOGIN_B_REJECTED',
                     'IDENTITY_A_MISMATCH','IDENTITY_B_MISMATCH'):
            self.assertEqual(MOD['safe_code'](MOD['Stop'](code)), 'STOP_' + code)
        for value in ('PRIVATE_INPUT','NORMAL_LOGIN_C_REJECTED','HTTP_RESPONSE_400_PRIVATE'):
            self.assertEqual(MOD['safe_code'](MOD['Stop'](value)), 'STOP_UNEXPECTED_LOCAL_QA_ERROR')

    def test_login_failure_records_account_and_never_runs_data_phase(self):
        for account,reason in [('A','NORMAL_LOGIN_A_REJECTED'),('B','NORMAL_LOGIN_B_REJECTED'),
                               ('A','IDENTITY_A_MISMATCH'),('B','IDENTITY_B_MISMATCH')]:
            with self.subTest(account=account,reason=reason),tempfile.TemporaryDirectory() as tmp:
                base=Path(tmp);calls={'login':[],'stage':0,'sections':0}
                def login(key,label,email,uid):
                    calls['login'].append(label)
                    if label==account: raise MOD['Stop'](reason)
                    return 'FAKE_TOKEN_'+label
                def stage_run(**kwargs):calls['stage']+=1;return 'UNEXPECTED'
                def sections_run(*args,**kwargs):calls['sections']+=1;return 'UNEXPECTED'
                stage={'core':{'USERS':[('A','test-a',MOD['OWNER']),('B','test-b',MOD['RECIPIENT'])]},
                       'qa':{'login':login},'run':stage_run}
                sections={'run':sections_run}
                bindings={'BASE':base,'require_date':lambda:None,'verify_sources':lambda:None,
                          'require_fresh_qa_approval':lambda:None,'validate_receipts':lambda *_:None,
                          'acquire_once':lambda:None,'public_key':lambda:'FAKE_PUBLIC_KEY'}
                with patch.dict(NS,bindings),patch.object(MOD['runpy'],'run_path',side_effect=lambda path:stage if Path(path)==MOD['STAGE_B'] else sections):
                    code,result=MOD['complete'](base/'unused-install',base/'unused-storage')
                record=json.loads(result.read_text())
                self.assertEqual(code,'STOP_'+reason)
                self.assertEqual(record['phase'],'login_'+account)
                self.assertEqual(calls['stage'],0)
                self.assertEqual(calls['sections'],0)
                self.assertEqual(calls['login'],['A'] if account=='A' else ['A','B'])
                self.assertNotIn('FAKE_TOKEN',result.read_text())
                self.assertNotIn('FAKE_PUBLIC_KEY',result.read_text())

if __name__=='__main__':unittest.main()
