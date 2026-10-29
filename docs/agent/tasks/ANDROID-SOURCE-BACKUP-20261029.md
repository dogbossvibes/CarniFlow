# Android source backup — 2026-10-29

Owner: Chat 04, Android Native. **WIP SOURCE BACKUP — not an integration or release candidate.**

Direct human backup instruction verified in workshop turn `01a1869b-1c8e-7361-96ef-771d95ae3171`. It authorizes isolated commits and normal GitHub backup pushes. No merge, main push, app build, OTA, store, account, DB or device action is included.

## Source identity and continuation

- Original worktree basename: `anyvo-android-field-reliability-qa`.
- Original branch: `feat/android-field-reliability-qa`; exact base/previous HEAD: `3f44b1d2793c7241ac2305fc6e05418ab1c07069`.
- Backup branch: `backup/android-field-qa-20261029` in `dogbossvibes/CarniFlow`.
- GitHub: https://github.com/dogbossvibes/CarniFlow/tree/backup/android-field-qa-20261029
- Obtain this backup's full commit with `git rev-parse HEAD` after checking out this branch. No absolute Mac path is required to recover the sources.
- Historical failure-characterization tests only. Passing characterization tests reproduce old defects; they do not prove a fix. Product corrections belong to Chat 02.
- Read the original task/report included in this backup. Its old 'uncommitted' labels and dated test results describe the historical candidate, not the backup operation or current production state.
- Before implementation or integration, compare with the then-current canonical product/runtime baseline and coordinate the existing owner. Do not blindly replay these older candidates onto main or publish them.

## Backup validation and limits

Explicit source list and SHA-256 freeze below; all existing staged entries were empty before staging. File types, secret/token patterns and synthetic fixtures reviewed; no known customer data, credentials, raw GPS exports, personal documents/media, logs, build products, dependencies or IDE state included. Source bytes preserved. Staged whitespace and blob scan are checked by the backup operator. No redundant full tests/builds/device checks were run for this archival commit; historical checks remain as documented, not rerun PASS claims. GitHub push and exact remote binding are reported separately after success.

## Exact original source-file freeze

| Path | SHA-256 |
| --- | --- |
| `docs/agent/tasks/ANDROID-FIELD-RELIABILITY-P0-2026-10-08.md` | `623fb4a87ec00a0119f5c37f8cbc05e45c87aee646d61d065274ee33e37695cd` |
| `features/tracking/hooks/__tests__/useTrackRecorder.androidFieldReliability.test.tsx` | `97b8d180a2abe46e7e87684ce27e82cf6a6c7cef9c2dbacf08597d0de1fccd2a` |
| `features/tracking/store/__tests__/androidFieldPersistence.characterization.test.ts` | `5c53fd6a55ec8d2ed6664eb322da21f0d33053e1e407938c876cbed77cd467f3` |
