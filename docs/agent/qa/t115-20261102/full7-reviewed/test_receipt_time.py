from pathlib import Path
import datetime as dt
import runpy
import unittest

BASE = Path(__file__).resolve().parent
normalize = runpy.run_path(str(BASE / 'receipt_time.py'))['canonical_sql_utc']
core = runpy.run_path(str(BASE.parent / 't115-health-sharing-db-05-20261029/t115-auth-preflight.py'))


class ObservedUTC(unittest.TestCase):
    def test_exact_failed_r2_timestamp_preserves_instant_and_passes_real_parser(self):
        observed = '2026-11-02 22:39:22.784087Z'
        with self.assertRaises(ValueError):
            core['parse_server_time'](observed)
        canonical = normalize(observed)
        self.assertEqual(canonical, '2026-11-02T22:39:22.784087Z')
        self.assertEqual(core['parse_server_time'](canonical),
                         dt.datetime.fromisoformat(observed.replace('Z', '+00:00')))

    def test_sql_precision_and_zero_offset_forms_preserved(self):
        for text in ('2026-11-02 22:39:22', '2026-11-02 22:39:22.7',
                     '2026-11-02T22:39:22.784087+00:00', '2026-11-02 22:39:22+00'):
            parsed = core['parse_server_time'](normalize(text))
            original = dt.datetime.fromisoformat(text)
            if original.tzinfo is None:
                original = original.replace(tzinfo=dt.timezone.utc)
            self.assertEqual(parsed, original)

    def test_invalid_non_utc_and_overprecision_rejected(self):
        for text in ('2026-11-02 22:39:22+01:00', '2026-11-02', 'now', None,
                     '2026-13-02 22:39:22', '2026-11-02 22:39:22.1234567Z'):
            with self.subTest(text=text), self.assertRaises(ValueError):
                normalize(text)
