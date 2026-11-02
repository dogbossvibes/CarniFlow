"""Materialize immutable receipts from an actually observed read-only CSV; no network."""
from pathlib import Path
import argparse
import json
import os
import runpy

BASE = Path(__file__).resolve().parent
AUTHOR = BASE.parent / 't115-health-sharing-db-05-20261029'


def write_once(path, content):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as output:
        output.write(content)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--csv', required=True, type=Path)
    parser.add_argument('--project-evidence', required=True)
    args = parser.parse_args()
    launcher = runpy.run_path(str(BASE / 't115-final-qa-full7-05.py'))
    launcher['require_date']()
    launcher['verify_sources']()
    reviewer = runpy.run_path(str(BASE / 't115-review-full7-snapshot-05.py'))
    snapshot = reviewer['check'](args.csv.resolve(), 'agent_cua', args.project_evidence)
    normalize = runpy.run_path(str(BASE / 'receipt_time.py'))['canonical_sql_utc']
    stamp = normalize(snapshot['checked_at_utc'])
    core = runpy.run_path(str(launcher['STAGE_B']))['core']
    core['parse_server_time'](stamp)  # Exact same strict parser used by the data test.
    fixture = json.loads((BASE / 'T115-HEALTH-SECTIONS-FIXTURES-FULL7-20261102.json').read_text())
    storage = {'project_ref': launcher['PROJECT'], 'bucket_id': 'dog-documents',
               'path': fixture['png_path'], 'exact_object_count': 0,
               'checked_at_utc': stamp, 'source_checked_at_utc': snapshot['checked_at_utc'],
               'source_csv_sha256': snapshot['source_csv_sha256'],
               'status': 'READ_ONLY_ABSENT_AT_CHECK_TIME_NOT_EXECUTION_APPROVAL'}
    csv_path = AUTHOR / 'T115-FULL7-QA-SNAPSHOT-20261102.csv'
    snapshot_path = AUTHOR / 'T115-FULL7-QA-SNAPSHOT-20261102.json'
    storage_path = AUTHOR / 'T115-FULL7-STORAGE-ABSENCE-20261102.json'
    if any(p.exists() for p in (csv_path, snapshot_path, storage_path)):
        raise SystemExit('STOP_EXISTING_RECEIPTS_PRESERVED')
    write_once(csv_path, args.csv.read_bytes())
    snapshot['source_csv_path'] = str(csv_path)
    for path, data in ((snapshot_path, snapshot), (storage_path, storage)):
        write_once(path, (json.dumps(data, indent=2) + '\n').encode())
    print('PASS_READONLY_RECEIPTS_ORIGINAL_SQL_INSTANT_PRESERVED')


if __name__ == '__main__':
    main()
