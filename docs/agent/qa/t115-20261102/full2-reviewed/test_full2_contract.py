import hashlib
import json
from pathlib import Path
import runpy
import unittest

BASE = Path(__file__).parent

class Full2Contract(unittest.TestCase):
    def test_all_old_fixture_and_probe_ids_are_audited(self):
        plan = json.loads((BASE / 'PLAN-REVIEW-ONLY.json').read_text())
        sql = (BASE / 'T115-FULL2-PREFLIGHT-READONLY-20261102.sql').read_text()
        ids = list(plan['replacementMapFromPriorTestIds'])
        for old in ids[:17]:
            self.assertIn("'" + old + "'::uuid", sql)
        self.assertIn('prior_qa_fixture_or_file_remaining_count', sql)
        self.assertIn('prior_qa_grants_active_count', sql)
        self.assertIn("and revoked_at is null and (expires_at is null or expires_at > now())) as prior_qa_grants_active_count", sql)
        self.assertNotIn('starts_at <= now() and (expires_at is null or expires_at > now())) as prior_qa_grants_active_count', sql)

    def test_all_new_ids_are_distinct_and_in_snapshot(self):
        plan = json.loads((BASE / 'PLAN-REVIEW-ONLY.json').read_text())
        ids = list(plan['replacementMapFromPriorTestIds'].values())
        self.assertEqual(len(ids), len(set(ids)))
        sql = (BASE / 'T115-FULL2-PREFLIGHT-READONLY-20261102.sql').read_text()
        for item in ids:
            self.assertIn("'" + item + "'::uuid", sql)


    def test_terminal_starter_uses_absolute_paths_from_any_cwd(self):
        command = (BASE / 'ANYVO-T115-FULL2-Abnahme-20261102.command').read_text()
        self.assertIn(str((BASE / 't115-final-qa-full2-05.py').resolve()), command)
        self.assertIn(str((BASE.parent / 't115-integration-review-01-20261101/T115-STAGE-B-INSTALL-POSTFLIGHT-20261101.json').resolve()), command)
        self.assertIn(str((BASE.parent / 't115-health-sharing-db-05-20261029/T115-FULL2-STORAGE-ABSENCE-20261102.json').resolve()), command)
        self.assertNotIn(str(BASE.parent.resolve()) + '/' + str(BASE.parent.resolve()), command)

    def test_deadline_starts_before_first_normal_login(self):
        source = (BASE / 't115-final-qa-full2-05.py').read_text()
        start = source.index('overall_deadline = time.monotonic() + 15 * 60')
        first_login = source.index("tokens[label] = stage['qa']['login']")
        self.assertLess(start, first_login)
        self.assertIn("if time.monotonic() >= overall_deadline:\n                raise Stop('TOTAL_15_MINUTE_DEADLINE')", source[start:first_login])

    def test_frozen_source_manifest_and_inert_default(self):
        runner = runpy.run_path(str(BASE / 't115-final-qa-full2-05.py'))
        manifest = runner['verify_sources']()
        self.assertEqual(manifest['status'], 'REVIEW_ONLY_NOT_EXECUTION_APPROVAL')
        self.assertFalse(runner['ATTEMPT'].exists())
        self.assertFalse(runner['FRESH_QA_APPROVAL'].exists())
        self.assertEqual(runner['main'].__globals__['MANIFEST_SHA256'], hashlib.sha256((BASE / 'QA-SOURCE-MANIFEST-FULL2-05.json').read_bytes()).hexdigest())

if __name__ == '__main__':
    unittest.main()
