"""Offline scope checks for the fresh T115 attempt; never contacts Supabase."""
import hashlib
import json
from pathlib import Path
import re
import unittest

BASE = Path(__file__).resolve().parent
FULL2 = BASE.parent / 't115-full-qa-backend-05-20261102'
FULL3 = BASE.parent / 't115-full3-qa-05-20261102'
FULL4 = BASE.parent / 't115-full4-qa-05-20261102'
FULL5 = BASE.parent / 't115-full5-qa-05-20261102'


class Full6Scope(unittest.TestCase):
    def test_unique_fresh_ids_and_paths(self):
        old = json.loads((FULL5 / 'PLAN-REVIEW-ONLY.json').read_text())
        new = json.loads((BASE / 'PLAN-REVIEW-ONLY.json').read_text())
        mapping = new['replacementMapFromPriorTestIds']
        self.assertEqual(len(mapping), 19)
        self.assertEqual(len(set(mapping.values())), 19)
        self.assertTrue(set(mapping).isdisjoint(mapping.values()))
        self.assertEqual(new['storagePath'], old['storagePath'].replace(
            old['storagePath'].split('t115-health-')[1][:36],
            mapping[old['storagePath'].split('t115-health-')[1][:36]]))
        fixture = json.loads((BASE / 'T115-HEALTH-SECTIONS-FIXTURES-FULL6-20261102.json').read_text())
        self.assertEqual(fixture['png_path'], new['storagePath'])
        for table, rows in fixture['fixtures'].items():
            for row in rows:
                self.assertIn(row['id'], mapping.values())

    def test_read_only_sql_covers_current_and_prior_scope(self):
        sql = (BASE / 'T115-FULL6-PREFLIGHT-READONLY-20261102.sql').read_text()
        old = json.loads((FULL2 / 'PLAN-REVIEW-ONLY.json').read_text())
        old_fixture = json.loads((FULL2 / 'T115-HEALTH-SECTIONS-FIXTURES-FULL2-20261102.json').read_text())
        new = json.loads((BASE / 'PLAN-REVIEW-ONLY.json').read_text())
        self.assertFalse(re.search(r'\b(insert|update|delete|alter|create|drop|truncate|grant|revoke)\s+(?:into|table|function|on|from|public|storage)\b', sql, re.I))
        self.assertIn(new['storagePath'], sql)
        self.assertIn(old['storagePath'], sql)
        for table, rows in old_fixture['fixtures'].items():
            guard = sql.split(' as prior_full2_fixture_or_file_remaining_count')[0].splitlines()[-1]
            part = guard.split(f'from public.{table} where id in (', 1)[1].split('))', 1)[0]
            for value in [r['id'] for r in rows] + [old['probes'][table]]:
                self.assertIn(value, part, table)
        for value in (old['stageBRow'], old['stageBGrant'], old['sectionsGrant']):
            self.assertIn(value, sql)
        full4 = json.loads((FULL4 / 'PLAN-REVIEW-ONLY.json').read_text())
        full4_fixture = json.loads((FULL4 / 'T115-HEALTH-SECTIONS-FIXTURES-FULL4-20261102.json').read_text())
        guard4 = sql.split(' as prior_full4_fixture_or_file_remaining_count')[0].splitlines()[-1]
        for table, rows in full4_fixture['fixtures'].items():
            part = guard4.split(f'from public.{table} where id in (', 1)[1].split('))', 1)[0]
            for value in [r['id'] for r in rows] + [full4['probes'][table]]:
                self.assertIn(value, part, table)
        for value in (full4['stageBRow'], full4['stageBGrant'], full4['sectionsGrant'], full4['storagePath']):
            self.assertIn(value, sql)
        full5 = json.loads((FULL5 / 'PLAN-REVIEW-ONLY.json').read_text())
        fixture5 = json.loads((FULL5 / 'T115-HEALTH-SECTIONS-FIXTURES-FULL5-20261102.json').read_text())
        guard5 = sql.split(' as prior_full5_fixture_or_file_remaining_count')[0].splitlines()[-1]
        for table, rows in fixture5['fixtures'].items():
            part = guard5.split(f'from public.{table} where id in (', 1)[1].split('))', 1)[0]
            for value in [r['id'] for r in rows] + [full5['probes'][table]]:
                self.assertIn(value, part, table)
        for value in (full5['stageBRow'], full5['stageBGrant'], full5['sectionsGrant'], full5['storagePath']):
            self.assertIn(value, sql)
        for value in new['replacementMapFromPriorTestIds'].values():
            self.assertIn(value, sql)

    def test_manifest_and_launcher_are_bound(self):
        manifest = BASE / 'QA-SOURCE-MANIFEST-FULL6-05.json'
        launcher = (BASE / 't115-final-qa-full6-05.py').read_text()
        self.assertIn(hashlib.sha256(manifest.read_bytes()).hexdigest(), launcher)
        for entry in json.loads(manifest.read_text())['sources']:
            self.assertEqual(hashlib.sha256(Path(entry['path']).read_bytes()).hexdigest(), entry['sha256'])


if __name__ == '__main__':
    unittest.main()
