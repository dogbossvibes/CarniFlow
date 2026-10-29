# Android source backup — 2026-10-29

Owner: Chat 04, Android Native. **WIP SOURCE BACKUP — not an integration or release candidate.**

Direct human backup instruction verified in workshop turn `01a1869b-1c8e-7361-96ef-771d95ae3171`. It authorizes isolated commits and normal GitHub backup pushes. No merge, main push, app build, OTA, store, account, DB or device action is included.

## Source identity and continuation

- Original worktree basename: `anyvo-android-widget`.
- Original branch: `feat/android-quick-start-widget`; exact base/previous HEAD: `bd94ff2e7e1f849eaccdfb33c3800f84fc50ff0f`.
- Backup branch: `backup/android-quick-widget-20261029` in `dogbossvibes/CarniFlow`.
- GitHub: https://github.com/dogbossvibes/CarniFlow/tree/backup/android-quick-widget-20261029
- Obtain this backup's full commit with `git rev-parse HEAD` after checking out this branch. No absolute Mac path is required to recover the sources.
- Historical Quick-Start widget candidate, separate from the daily widget. Existing T-65 report is scoped to this worktree; not an assertion of current release readiness.
- Read the original task/report included in this backup. Its old 'uncommitted' labels and dated test results describe the historical candidate, not the backup operation or current production state.
- Before implementation or integration, compare with the then-current canonical product/runtime baseline and coordinate the existing owner. Do not blindly replay these older candidates onto main or publish them.

## Backup validation and limits

Explicit source list and SHA-256 freeze below; all existing staged entries were empty before staging. File types, secret/token patterns and synthetic fixtures reviewed; no known customer data, credentials, raw GPS exports, personal documents/media, logs, build products, dependencies or IDE state included. Source bytes preserved. Staged whitespace and blob scan are checked by the backup operator. No redundant full tests/builds/device checks were run for this archival commit; historical checks remain as documented, not rerun PASS claims. GitHub push and exact remote binding are reported separately after success.

## Exact original source-file freeze

| Path | SHA-256 |
| --- | --- |
| `app.json` | `993278549aa23eddfe949db84d852271ce159901ef5250236be0352bd2b9380d` |
| `docs/agent/tasks/T-65.md` | `0a49bfa5f05fc769df22ed72f05fe45450e464dc6a1ec44b09b47241383c877e` |
| `plugins/__tests__/androidWidget.test.ts` | `c5d9c603a1e5e134943a01af01bfd6c25c03024e712bbe4312ef165cd545daf7` |
| `plugins/android/quick-start-widget/AnyvoQuickStartWidgetProvider.java` | `8b56c12380f770cbf7319cc9c3711a32be51802792606cda1ff6dd6f2b5d64b1` |
| `plugins/android/quick-start-widget/res/drawable/anyvo_widget_background.xml` | `19d866b655e614544b7cf91775d498822abd8274d3f41125088a2821e67e7b83` |
| `plugins/android/quick-start-widget/res/drawable/anyvo_widget_lay.xml` | `eaf3de53cf4f5da3af8e25163e38c946558ab0a6cc300d64cc0713a82081aea8` |
| `plugins/android/quick-start-widget/res/drawable/anyvo_widget_logbook.xml` | `ea81c5dfeeeb215e9c4b99715cb31344e071c6e3508177155e9a1df39110c9cc` |
| `plugins/android/quick-start-widget/res/drawable/anyvo_widget_tile.xml` | `8b85f7a7d8244cbb9f665883ded380667a7eb722862602351f139db2ed4b7181` |
| `plugins/android/quick-start-widget/res/drawable/anyvo_widget_tracks.xml` | `874c289a314c7335bdf096bb657f06a04cfcec023ae79d90afa491281594926c` |
| `plugins/android/quick-start-widget/res/layout/anyvo_widget_medium.xml` | `bef66b47d070b77172d04454a3c676928971db2f00b44eaf4000fd3f1618a44f` |
| `plugins/android/quick-start-widget/res/layout/anyvo_widget_small.xml` | `aa297f6c1d3afec6f623867c01120f5ff70663d2fcae8b29f83456ad13bfb035` |
| `plugins/android/quick-start-widget/res/values-de/anyvo_widget_strings.xml` | `46eee5b7d0c68fea1f65f18cf21ffb1a099126a545a3c27f0907ed219f43b518` |
| `plugins/android/quick-start-widget/res/values-fr/anyvo_widget_strings.xml` | `2b3664315a32991cd2d4595bc330a1a147ec9fc0cf6271267086ee09552dc599` |
| `plugins/android/quick-start-widget/res/values-it/anyvo_widget_strings.xml` | `379c11acd5635d5ec4bf7d8099520a41a964685c7d521683d3ca53b4379666d8` |
| `plugins/android/quick-start-widget/res/values/anyvo_widget_strings.xml` | `e27bc84ddf4b75369e6535abafb37bb935555f4e149e43847f97af0c4e0891b2` |
| `plugins/android/quick-start-widget/res/xml/anyvo_quick_start_widget.xml` | `0e7a96aec491d1fe6e5a391be2dbc1984bf6e11c70948e521ceef800ca8da649` |
| `plugins/withAnyvoAndroidWidget.js` | `cc2815e0c19df924c338f5e2b6b6d6b5a7838c306eadf914d2028bbff8f836b2` |
