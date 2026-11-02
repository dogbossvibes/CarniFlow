import csv
import hashlib
import json
from pathlib import Path
import runpy
import tempfile
import unittest
from unittest.mock import patch

BASE = Path(__file__).resolve().parent

class ReceiptBuilderIntegration(unittest.TestCase):
    def test_original_csv_and_instant_preserved_and_second_write_rejected(self):
        builder = runpy.run_path(str(BASE / 'build_readonly_receipts.py'))
        fixtures = runpy.run_path(str(BASE / 'test_full7_snapshot_05.py'))
        real_run = runpy.run_path
        def load(path):
            module = real_run(path)
            if Path(path).name == 't115-final-qa-full7-05.py':
                module['require_date'] = lambda: None  # Offline fixture date only.
            return module
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'output'; output.mkdir()
            source = Path(folder) / 'input.csv'
            row = fixtures['synthetic_row']()
            row['checked_at_utc'] = '2026-11-03 22:39:22.784087'
            with source.open('w', newline='') as stream:
                writer = csv.DictWriter(stream, fieldnames=list(row)); writer.writeheader(); writer.writerow(row)
            original = source.read_bytes()
            argv = ['builder', '--csv', str(source), '--project-evidence', 'https://supabase.com/dashboard/project/axkkhyqrjrtbkumaulta/sql']
            with patch.dict(builder['main'].__globals__, {'AUTHOR': output}), patch('sys.argv', argv), patch.object(builder['runpy'], 'run_path', side_effect=load):
                builder['main']()
                before = {p.name:p.read_bytes() for p in output.iterdir()}
                with self.assertRaisesRegex(SystemExit, 'STOP_EXISTING_RECEIPTS_PRESERVED'): builder['main']()
                self.assertEqual(before, {p.name:p.read_bytes() for p in output.iterdir()})
            proof = json.loads((output / 'T115-FULL7-STORAGE-ABSENCE-20261103.json').read_text())
            snapshot = json.loads((output / 'T115-FULL7-QA-SNAPSHOT-20261103.json').read_text())
            self.assertEqual(proof['checked_at_utc'], '2026-11-03T22:39:22.784087Z')
            self.assertEqual(snapshot['checked_at_utc'], row['checked_at_utc'])
            self.assertEqual(proof['source_csv_sha256'], hashlib.sha256(original).hexdigest())
            self.assertEqual((output / 'T115-FULL7-QA-SNAPSHOT-20261103.csv').read_bytes(), original)
            for p in output.iterdir(): self.assertEqual(p.stat().st_mode & 0o777, 0o600)

if __name__ == '__main__': unittest.main()
