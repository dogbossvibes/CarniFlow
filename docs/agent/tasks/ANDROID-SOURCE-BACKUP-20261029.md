# Android source backup — 2026-10-29

Owner: Chat 04, Android Native. **WIP SOURCE BACKUP — not an integration or release candidate.**

Direct human backup instruction verified in workshop turn `01a1869b-1c8e-7361-96ef-771d95ae3171`. It authorizes isolated commits and normal GitHub backup pushes. No merge, main push, app build, OTA, store, account, DB or device action is included.

## Source identity and continuation

- Original worktree basename: `anyvo-android-daily-widget`.
- Original branch: `feat/android-daily-widget`; exact base/previous HEAD: `1a574212f6b7c1827bc03048f2eb5b5d662cd7a1`.
- Backup branch: `backup/android-daily-widget-20261029` in `dogbossvibes/CarniFlow`.
- GitHub: https://github.com/dogbossvibes/CarniFlow/tree/backup/android-daily-widget-20261029
- Obtain this backup's full commit with `git rev-parse HEAD` after checking out this branch. No absolute Mac path is required to recover the sources.
- Historical Android daily-widget native implementation only. Shared TypeScript contract/publisher/iOS belong to Chat 03 and are not supplied by this branch.
- Read the original task/report included in this backup. Its old 'uncommitted' labels and dated test results describe the historical candidate, not the backup operation or current production state.
- Before implementation or integration, compare with the then-current canonical product/runtime baseline and coordinate the existing owner. Do not blindly replay these older candidates onto main or publish them.

## Backup validation and limits

Explicit source list and SHA-256 freeze below; all existing staged entries were empty before staging. File types, secret/token patterns and synthetic fixtures reviewed; no known customer data, credentials, raw GPS exports, personal documents/media, logs, build products, dependencies or IDE state included. Source bytes preserved. Staged whitespace and blob scan are checked by the backup operator. No redundant full tests/builds/device checks were run for this archival commit; historical checks remain as documented, not rerun PASS claims. GitHub push and exact remote binding are reported separately after success.

## Exact original source-file freeze

| Path | SHA-256 |
| --- | --- |
| `modules/anyvo-daily-widget/android/PARITY-2026-10-14.md` | `f44b637af7021806650595c07f3149c0dc093aa1604745693998456fee9b149f` |
| `modules/anyvo-daily-widget/android/README.md` | `5fb12a666ac3ed9f7c0689f48b3d0ddce4ad3af9100d60237cc85b6ecba1d68a` |
| `modules/anyvo-daily-widget/android/REPORT-2026-10-14.md` | `a6a3fe1a6a09fe43f8352f6e060861ccd5d1e2d8cd11cdca3c30941c28c9cafc` |
| `modules/anyvo-daily-widget/android/build.gradle` | `4b15bdc8ade0586862a25d91cc6f3a7cdbcf8833431e5e89a64ad58b48a37028` |
| `modules/anyvo-daily-widget/android/src/main/AndroidManifest.xml` | `9b66cd73a3d3ce3aca0dd4d1e5586a94f5ab90d4806bbc1144ab9ab6d26de301` |
| `modules/anyvo-daily-widget/android/src/main/java/expo/modules/anyvodailywidget/AnyvoDailyWidgetConfigureActivity.java` | `c41d7738515e6c799d761471c31b16509f7f4fb85e4096a9ca683b8a61e7bde1` |
| `modules/anyvo-daily-widget/android/src/main/java/expo/modules/anyvodailywidget/AnyvoDailyWidgetModule.kt` | `7a52875baa678f156ddfa9aea07f2ed791ceed6a266669fb67ace336153b6a72` |
| `modules/anyvo-daily-widget/android/src/main/java/expo/modules/anyvodailywidget/AnyvoDailyWidgetProvider.java` | `62e64959533463d2cdedf3a5b18c01c06901fc57364d342c727b9704b2658c7b` |
| `modules/anyvo-daily-widget/android/src/main/java/expo/modules/anyvodailywidget/DailyWidgetBinding.java` | `df8c3227c2f3e8cfe47e2e9773f39e30670e229a33ed1b87e1890079b4983946` |
| `modules/anyvo-daily-widget/android/src/main/java/expo/modules/anyvodailywidget/DailyWidgetCacheCodec.java` | `0d037c5684c7f6fe2990edc632301982af4ed17266dc939055ef8df6d85257c7` |
| `modules/anyvo-daily-widget/android/src/main/java/expo/modules/anyvodailywidget/DailyWidgetSelection.java` | `eb49a9040f3c7a4238985e193ef75d0b5694b80d680a6ae6e80d3e2ec4c3fce0` |
| `modules/anyvo-daily-widget/android/src/main/java/expo/modules/anyvodailywidget/DailyWidgetSnapshot.java` | `064d42fa9f0b231ccdf181f8296d55dd1f09517470600c6a684105804861a356` |
| `modules/anyvo-daily-widget/android/src/main/java/expo/modules/anyvodailywidget/DailyWidgetState.java` | `4da74497e5591632d9433ce859e1144aeef437e573af334097d212fef4e59138` |
| `modules/anyvo-daily-widget/android/src/main/java/expo/modules/anyvodailywidget/DailyWidgetStore.java` | `b438529c81879e97abc62ba261f1786eecd27efb39f2ec3adcbdd3607681434b` |
| `modules/anyvo-daily-widget/android/src/main/res/drawable/anyvo_daily_background.xml` | `e664a02835ed8bb31112d44974e97c358946920283ba3c2a48a2a38185d5b139` |
| `modules/anyvo-daily-widget/android/src/main/res/layout/anyvo_daily_compact.xml` | `eebd2a26bba5de0a6cc78c8de47d1873eae7c691290e41338049abe94b29cae9` |
| `modules/anyvo-daily-widget/android/src/main/res/layout/anyvo_daily_expanded.xml` | `b4f7d9cba5fc31f443f0cd0e432594fd552c0d355c7c4522c4eca26197889124` |
| `modules/anyvo-daily-widget/android/src/main/res/layout/anyvo_daily_minimal.xml` | `24defd2f172ced8d99bb1eef1b24b4046579041b6b99b7b7c470bc70146daf7d` |
| `modules/anyvo-daily-widget/android/src/main/res/values-de/anyvo_daily_strings.xml` | `2a63841523e469e14dd7fbc7158171ea1fa476dec9953ec0ab2612460a3347f7` |
| `modules/anyvo-daily-widget/android/src/main/res/values-fr/anyvo_daily_strings.xml` | `f8a4d83bed79a1dbdbd00cd614e6892d761b7d1d59844da299316a4e46d1f9de` |
| `modules/anyvo-daily-widget/android/src/main/res/values-it/anyvo_daily_strings.xml` | `a86a8d3002b7c487316f8e3e72e2a3de57c3c5d099625545a29cb85c34cbf5a9` |
| `modules/anyvo-daily-widget/android/src/main/res/values/anyvo_daily_strings.xml` | `c31a173d7177036e43a6ed9935f5d770c49ffe55080781fb0b067b9c5d290974` |
| `modules/anyvo-daily-widget/android/src/main/res/values/anyvo_daily_styles.xml` | `1f25a75a87514110a0ea70491411d5add7f1196097b80100ad664e7e39fe4494` |
| `modules/anyvo-daily-widget/android/src/main/res/xml/anyvo_daily_widget.xml` | `342583e784f24e86ebf1713fe62fa5f18eb9d47a9e87af077baf2c0239d07dca` |
| `modules/anyvo-daily-widget/android/src/test/java/expo/modules/anyvodailywidget/DailyWidgetContractTest.java` | `d3fea735d451d51573613036342e1b5028b450eb6a48b70e23685a2b3cb45a55` |
| `modules/anyvo-daily-widget/android/verify_native.py` | `d2a2c198dce7526507b7cef618b8f9d0b5cb5d38d5325dcc40e1397c962c516e` |
