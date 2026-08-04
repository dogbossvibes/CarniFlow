# Agent Session Handoff

> Aktuellster Handoff zwischen **Claude Code** und **Codex**.
> Der Block zwischen den AUTO-GENERATED-Markern wird von `scripts/agent-handoff.mjs` erzeugt —
> **nicht manuell** bearbeiten. Alles ausserhalb der Marker wird von den Agenten **manuell** gepflegt.
>
> Priorität bei Widerspruch:
> **Repository state > Git state > Handoff documentation > Agent assumptions.**
> Der tatsächliche Repository-Zustand hat immer Vorrang vor dieser Doku.

<!-- AUTO-GENERATED:START -->

Generated: 2026-08-03T22:04:49.752Z
Agent: codex
Branch: feat/track-module-rewrite

### Git status
```
M AI_HANDOFF.md
 M app/(tabs)/_layout.tsx
 M app/(tabs)/clients.tsx
 M app/(tabs)/home.tsx
 M app/(tabs)/profile.tsx
 M app/(tabs)/training.tsx
 M app/edit-profile.tsx
 M app/home-customize.tsx
 M app/index.tsx
 M app/sync.tsx
 M app/track/kalibrierung.tsx
 M app/track/legen.tsx
 M app/trainer/dashboard.tsx
 M app/trainer/index.tsx
 M app/training-journal.tsx
 M app/unit/live.tsx
 M app/unit/stats.tsx
 M app/unit/summary.tsx
 M components/AppLockGate.tsx
 M components/QuickAddSheet.tsx
 M components/ShareSheet.tsx
 M components/dogs/DogHeatCard.tsx
 M components/dogs/DogQuickActions.tsx
 M components/home/QuickActionsWidget.tsx
 M components/home/__tests__/FabQuickAddSheet.test.tsx
 M components/tracking/GpsSourcePicker.tsx
 M docs/adr/ADR-001_Domain_Model.md
 M docs/agent/CURRENT_STATE.md
 M docs/agent/DECISIONS.md
 M docs/agent/SESSION_HANDOFF.md
 M docs/agent/TASKS.md
 M features/connect/components/ConnectIdentitySelector.tsx
 M features/connect/components/ConnectStates.tsx
 M features/connect/screens/ConnectHomeScreen.tsx
 M features/connect/services/connect-entitlements.ts
 M features/tracking/components/ActiveFaehrteCard.tsx
 M features/tracking/components/MarkerBottomSheet.tsx
 M features/tracking/components/TrackStatsPanel.tsx
 M features/training/__tests__/journal.test.ts
 M i18n/__tests__/backpack-i18n.test.ts
 M i18n/__tests__/localization-consistency.test.ts
 M i18n/de-CH.ts
 M i18n/gsw-CH.ts
 M i18n/locales/fr.ts
 M legal-web/index.html
 M services/connectionService.ts
 M services/profileService.ts
 M services/shareService.ts
 M services/trainingFeed.ts
 M stores/__tests__/homeScreenConfig.test.ts
 M stores/homeScreenConfig.ts
 M types/connection.ts
 M types/index.ts
?? .claude/development.code-workspace
?? ANYVO-current-repository.zip
?? STAGING_DEPLOY_RUN.sql
?? SUBSCRIPTION_P0_DB_DEPLOYMENT.md
?? after_bottomnav_galaxyS23_3button.png
?? after_bottomnav_galaxyS23_gesture.png
?? after_bottomnav_tablet_3button.png
?? after_bottomnav_tablet_gesture.png
?? app/(tabs)/__tests__/
?? app/__tests__/training-journal.test.tsx
?? artifacts/
?? assets/images/11GSLOGODSC4449.jpg
?? assets/images/Malu13.jpg
?? assets/images/bazooka.jpg
?? canisflow.code-workspace
?? components/dogs/__tests__/DogQuickActions.test.ts
?? components/home/__tests__/DogBackpackWidget.test.ts
?? design_handoff_faehrten/screen3.jpg
?? dist-auth-android/
?? dist-auth-ios/
?? dist-login-android/
?? dist-login-ios/
?? "docs/adr/ADR-002  Database Model"
?? "docs/adr/ADR-003  Identity & Authorization"
?? "docs/adr/ADR-004  GPS & Tracking Architecture"
?? "docs/adr/ADR-005  Track Recording Lifecycle"
?? "docs/adr/ADR-006  Smart Analysis"
?? "docs/adr/ADR-007  Offline First & Synchronisation"
?? "docs/adr/ADR-008  Subscription & Entitlements"
?? "docs/adr/ADR-009  Connect Architecture"
?? "docs/adr/ADR-010  UI & Navigation"
?? "docs/adr/ADR-011  Testing Strategy"
?? "docs/adr/ADR-012  Release & Deployment"
?? docs/architecture/CODEX_P0_FIX_01_REVIEW.md
?? docs/architecture/CODEX_P0_REVIEW.md
?? docs/architecture/DOG_PERSONAL_DASHBOARD_PHASE_C_FIX_REPORT.md
?? docs/architecture/FAEHRTE_ABRISS_MAP_FIX_REPORT.md
?? docs/architecture/FAEHRTE_ABSUCHE_HANDLER_DISTANCE_ANALYSIS.md
?? docs/architecture/FAEHRTE_ABSUCHE_HANDLER_DISTANCE_FIX_REPORT.md
?? docs/architecture/FAEHRTE_ANGLE_QUICK_PICKER_FIX_REPORT.md
?? docs/architecture/FAEHRTE_ANGLE_TYPES_FIX_REPORT.md
?? docs/architecture/FAEHRTE_OBJECT_QUICK_PICKER_FIX_REPORT.md
?? docs/architecture/FAEHRTE_STARTPOINT_GPS_ANALYSIS.md
?? docs/architecture/FAEHRTE_STARTPOINT_GPS_FIX_REPORT.md
?? docs/architecture/FAEHRTE_STEP_ACCURACY_ANALYSIS.md
?? docs/architecture/FAEHRTE_STEP_CALIBRATION_FIX_REPORT.md
?? docs/architecture/FAEHRTE_STEP_LOGIC_UNIFICATION_FIX_REPORT.md
?? docs/architecture/FAEHRTE_TEILSTRECKE_START_STOP_ANALYSIS.md
?? docs/architecture/FAEHRTE_TEILSTRECKE_START_STOP_FIX_REPORT.md
?? docs/architecture/P0-01_DATABASE_TRUTH_REPORT.md
?? docs/architecture/P0-02_TRACKING_LEGACY_REPORT.md
?? docs/architecture/P0-03_TRACK_DOMAIN_REPORT.md
?? docs/architecture/P0-04_SUBSCRIPTION_CAPABILITY_REPORT.md
?? docs/architecture/P0-05_GPS_PIPELINE_REPORT.md
?? docs/architecture/P0-06_OFFLINE_TRUTH_REPORT.md
?? docs/architecture/P0_ARCHITECTURE_VERIFICATION_SUMMARY.md
?? docs/architecture/TRAINING_JOURNAL_FIX_REPORT.md
?? "faehrten 6/design_handoff_faehrten/abriss.png"
?? legal-web/assets/
?? legal-web/funktionen.html
?? legal-web/funktionen/
?? screen20.jpg
?? services/__tests__/profileService.test.ts
?? services/__tests__/shareService.test.ts
?? services/__tests__/trainingFeed.test.ts
?? supabase/migrations/20260803120000_fix_shared_trainings_fk.sql
?? supabase/migrations/20260803140000_profiles_username.sql
?? supabase/migrations/README.md
?? supabase/production_public_schema_snapshot.sql
?? supabase/staging_p0_smoke_verify.sql
?? supabase/staging_public_schema_restore.sql
?? winkel.png
```

### Diff stat
```
AI_HANDOFF.md                                      |    6 +
 app/(tabs)/_layout.tsx                             |  179 ++--
 app/(tabs)/clients.tsx                             |    3 +
 app/(tabs)/home.tsx                                |   72 +-
 app/(tabs)/profile.tsx                             |  120 +--
 app/(tabs)/training.tsx                            |   12 +
 app/edit-profile.tsx                               |  105 +-
 app/home-customize.tsx                             |  390 +++++--
 app/index.tsx                                      |    8 +-
 app/sync.tsx                                       |   38 +-
 app/track/kalibrierung.tsx                         |   62 +-
 app/track/legen.tsx                                |   12 +-
 app/trainer/dashboard.tsx                          |   30 +-
 app/trainer/index.tsx                              |   56 +-
 app/training-journal.tsx                           |    3 +-
 app/unit/live.tsx                                  |   24 +-
 app/unit/stats.tsx                                 |   40 +-
 app/unit/summary.tsx                               |   20 +
 components/AppLockGate.tsx                         |   14 +-
 components/QuickAddSheet.tsx                       |  764 +++++++++++---
 components/ShareSheet.tsx                          |   31 +-
 components/dogs/DogHeatCard.tsx                    |   44 +-
 components/dogs/DogQuickActions.tsx                |   68 +-
 components/home/QuickActionsWidget.tsx             |   18 +-
 .../home/__tests__/FabQuickAddSheet.test.tsx       | 1076 ++++++++++++++++++--
 components/tracking/GpsSourcePicker.tsx            |   22 +-
 docs/adr/ADR-001_Domain_Model.md                   |  416 ++++++++
 docs/agent/CURRENT_STATE.md                        |  113 +-
 docs/agent/DECISIONS.md                            |   25 +
 docs/agent/SESSION_HANDOFF.md                      |  430 +++++---
 docs/agent/TASKS.md                                |   93 +-
 .../connect/components/ConnectIdentitySelector.tsx |   11 +-
 features/connect/components/ConnectStates.tsx      |    6 +-
 features/connect/screens/ConnectHomeScreen.tsx     |    2 +-
 features/connect/services/connect-entitlements.ts  |    6 +-
 features/tracking/components/ActiveFaehrteCard.tsx |   48 +-
 features/tracking/components/MarkerBottomSheet.tsx |   59 +-
 features/tracking/components/TrackStatsPanel.tsx   |   10 +-
 features/training/__tests__/journal.test.ts        |   44 +
 i18n/__tests__/backpack-i18n.test.ts               |   57 ++
 i18n/__tests__/localization-consistency.test.ts    |   10 +
 i18n/de-CH.ts                                      |   75 +-
 i18n/gsw-CH.ts                                     |   79 +-
 i18n/locales/fr.ts                                 |   58 +-
 legal-web/index.html                               |  454 +++++----
 services/connectionService.ts                      |    4 +-
 services/profileService.ts                         |   66 ++
 services/shareService.ts                           |   11 +-
 services/trainingFeed.ts                           |    8 +-
 stores/__tests__/homeScreenConfig.test.ts          |  267 +++++
 stores/homeScreenConfig.ts                         |  262 ++++-
 types/connection.ts                                |    7 +-
 types/index.ts                                     |    1 +
 53 files changed, 4709 insertions(+), 1130 deletions(-)
```

### Modified files
```
AI_HANDOFF.md
app/(tabs)/_layout.tsx
app/(tabs)/clients.tsx
app/(tabs)/home.tsx
app/(tabs)/profile.tsx
app/(tabs)/training.tsx
app/edit-profile.tsx
app/home-customize.tsx
app/index.tsx
app/sync.tsx
app/track/kalibrierung.tsx
app/track/legen.tsx
app/trainer/dashboard.tsx
app/trainer/index.tsx
app/training-journal.tsx
app/unit/live.tsx
app/unit/stats.tsx
app/unit/summary.tsx
components/AppLockGate.tsx
components/QuickAddSheet.tsx
components/ShareSheet.tsx
components/dogs/DogHeatCard.tsx
components/dogs/DogQuickActions.tsx
components/home/QuickActionsWidget.tsx
components/home/__tests__/FabQuickAddSheet.test.tsx
components/tracking/GpsSourcePicker.tsx
docs/adr/ADR-001_Domain_Model.md
docs/agent/CURRENT_STATE.md
docs/agent/DECISIONS.md
docs/agent/SESSION_HANDOFF.md
docs/agent/TASKS.md
features/connect/components/ConnectIdentitySelector.tsx
features/connect/components/ConnectStates.tsx
features/connect/screens/ConnectHomeScreen.tsx
features/connect/services/connect-entitlements.ts
features/tracking/components/ActiveFaehrteCard.tsx
features/tracking/components/MarkerBottomSheet.tsx
features/tracking/components/TrackStatsPanel.tsx
features/training/__tests__/journal.test.ts
i18n/__tests__/backpack-i18n.test.ts
i18n/__tests__/localization-consistency.test.ts
i18n/de-CH.ts
i18n/gsw-CH.ts
i18n/locales/fr.ts
legal-web/index.html
services/connectionService.ts
services/profileService.ts
services/shareService.ts
services/trainingFeed.ts
stores/__tests__/homeScreenConfig.test.ts
stores/homeScreenConfig.ts
types/connection.ts
types/index.ts
```

### Untracked files
```
.claude/development.code-workspace
ANYVO-current-repository.zip
STAGING_DEPLOY_RUN.sql
SUBSCRIPTION_P0_DB_DEPLOYMENT.md
after_bottomnav_galaxyS23_3button.png
after_bottomnav_galaxyS23_gesture.png
after_bottomnav_tablet_3button.png
after_bottomnav_tablet_gesture.png
app/(tabs)/__tests__/training.test.tsx
app/__tests__/training-journal.test.tsx
artifacts/faehrten-teilstrecken/ios/01_boot_home.png
artifacts/faehrten-teilstrecken/ios/02_faehrten_index.png
artifacts/faehrten-teilstrecken/ios/03_legen_teilstrecke_abriss_buttons.png
assets/images/11GSLOGODSC4449.jpg
assets/images/Malu13.jpg
assets/images/bazooka.jpg
canisflow.code-workspace
components/dogs/__tests__/DogQuickActions.test.ts
components/home/__tests__/DogBackpackWidget.test.ts
design_handoff_faehrten/screen3.jpg
dist-auth-android/_expo/static/js/android/entry-9a4f5220dacd2f2900cbac6f8f9490c4.hbc
dist-auth-android/assets/017bc6ba3fc25503e5eb5e53826d48a8
dist-auth-android/assets/02bc1fa7c0313217bde2d65ccbff40c9
dist-auth-android/assets/069d99eb1fa6712c0b9034a58c6b57dd
dist-auth-android/assets/0747a1317bbe9c6fc340b889ef8ab3ae
dist-auth-android/assets/0a328cd9c1afd0afe8e3b1ec5165b1b4
dist-auth-android/assets/1190ab078c57159f4245a328118fcd9a
dist-auth-android/assets/140c53a7643ea949007aa9a282153849
dist-auth-android/assets/1681f34aaca71b8dfb70756bca331eb2
dist-auth-android/assets/19eeb73b9593a38f8e9f418337fc7d10
dist-auth-android/assets/1f77739ca9ff2188b539c36f30ffa2be
dist-auth-android/assets/20e71bdf79e3a97bf55fd9e164041578
dist-auth-android/assets/286d67d3f74808a60a78d3ebf1a5fb57
dist-auth-android/assets/31b5ffea3daddc69dd01a1f3d6cf63c5
dist-auth-android/assets/35ba0eaec5a4f5ed12ca16fabeae451d
dist-auth-android/assets/370dd5af19f8364907b6e2c41f45dbbf
dist-auth-android/assets/3b89dd103490708d19a95adcae52210e
dist-auth-android/assets/3cd68ccdb8938e3711da2e8831b85493
dist-auth-android/assets/3f78af31cca60105799838a1a7a59fbd
dist-auth-android/assets/412dd9275b6b48ad28f5e3d81bb1f626
dist-auth-android/assets/4403c6117ec30c859bc95d70ce4a71d3
dist-auth-android/assets/4e85bc9ebe07e0340c9c4fc2f6c38908
dist-auth-android/assets/56c8d80832e37783f12c05db7c8849e2
dist-auth-android/assets/605ed7926cf39a2ad5ec2d1f9d391d3d
dist-auth-android/assets/61ca7e64b7d605716c57706cef640b9a
dist-auth-android/assets/6483674c8ab6279e20870d797487d178
dist-auth-android/assets/6e435534bd35da5fef04168860a9b8fa
dist-auth-android/assets/778ffc9fe8773a878e9c30a6304784de
dist-auth-android/assets/78c625386b4d0690b421eb0fc78f7b9c
dist-auth-android/assets/871378c6eab492a3e689a9385dc45a12
dist-auth-android/assets/8b078b8487180a92e4a0f8e9a718ab11
dist-auth-android/assets/8bc5a686abf2a1f5fc8165d6bb0fe9f1
dist-auth-android/assets/9898592643347b4b60195db5da72e15f
dist-auth-android/assets/ab19f4cbc543357183a20571f68380a3
dist-auth-android/assets/adec7d6f310bc577f05e8fe06a5daccf
dist-auth-android/assets/aff2c65b39a296d4f7e96d0f58169170
dist-auth-android/assets/b06871f281fee6b241d60582ae9369b9
dist-auth-android/assets/b49ae8ab2dbccb02c4d11caaacf09eab
dist-auth-android/assets/b4eb097d35f44ed943676fd56f6bdc51
dist-auth-android/assets/c3273c9e5321f20d1e42c2efae2578c4
dist-auth-android/assets/c79c3606a1cf168006ad3979763c7e0c
dist-auth-android/assets/ca4b48e04dc1ce10bfbddb262c8b835f
dist-auth-android/assets/d1ea1496f9057eb392d5bbf3732a61b7
dist-auth-android/assets/d2285965fe34b05465047401b8595dd0
dist-auth-android/assets/d84e297c3b3e49a614248143d53e40ca
dist-auth-android/assets/d8b800c443b8972542883e0b9de2bdc6
dist-auth-android/assets/d8e7601e3df962f83c62371ac14964d8
dist-auth-android/assets/e20945d7c929279ef7a6f1db184a4470
dist-auth-android/assets/fad77ae871f985f563a6fea56741411d
dist-auth-android/metadata.json
dist-auth-ios/_expo/static/js/ios/entry-581c1204d68d60dded8811b5ef81bc4f.hbc
dist-auth-ios/assets/017bc6ba3fc25503e5eb5e53826d48a8
dist-auth-ios/assets/0747a1317bbe9c6fc340b889ef8ab3ae
dist-auth-ios/assets/0a328cd9c1afd0afe8e3b1ec5165b1b4
dist-auth-ios/assets/0ea69b5077e7c4696db85dbcba75b0e1
dist-auth-ios/assets/1190ab078c57159f4245a328118fcd9a
dist-auth-ios/assets/140c53a7643ea949007aa9a282153849
dist-auth-ios/assets/1681f34aaca71b8dfb70756bca331eb2
dist-auth-ios/assets/19eeb73b9593a38f8e9f418337fc7d10
dist-auth-ios/assets/1f77739ca9ff2188b539c36f30ffa2be
dist-auth-ios/assets/20e71bdf79e3a97bf55fd9e164041578
dist-auth-ios/assets/2d0a9133e39524f138be6d4db9f4851f
dist-auth-ios/assets/31b5ffea3daddc69dd01a1f3d6cf63c5
dist-auth-ios/assets/370dd5af19f8364907b6e2c41f45dbbf
dist-auth-ios/assets/3b89dd103490708d19a95adcae52210e
dist-auth-ios/assets/3cd68ccdb8938e3711da2e8831b85493
dist-auth-ios/assets/3f78af31cca60105799838a1a7a59fbd
dist-auth-ios/assets/412dd9275b6b48ad28f5e3d81bb1f626
dist-auth-ios/assets/4e85bc9ebe07e0340c9c4fc2f6c38908
dist-auth-ios/assets/56c8d80832e37783f12c05db7c8849e2
dist-auth-ios/assets/605ed7926cf39a2ad5ec2d1f9d391d3d
dist-auth-ios/assets/61ca7e64b7d605716c57706cef640b9a
dist-auth-ios/assets/6483674c8ab6279e20870d797487d178
dist-auth-ios/assets/6e435534bd35da5fef04168860a9b8fa
dist-auth-ios/assets/78c625386b4d0690b421eb0fc78f7b9c
dist-auth-ios/assets/7d40544b395c5949f4646f5e150fe020
dist-auth-ios/assets/871378c6eab492a3e689a9385dc45a12
dist-auth-ios/assets/8b078b8487180a92e4a0f8e9a718ab11
dist-auth-ios/assets/8bc5a686abf2a1f5fc8165d6bb0fe9f1
dist-auth-ios/assets/9898592643347b4b60195db5da72e15f
dist-auth-ios/assets/a132ecc4ba5c1517ff83c0fb321bc7fc
dist-auth-ios/assets/ab19f4cbc543357183a20571f68380a3
dist-auth-ios/assets/adec7d6f310bc577f05e8fe06a5daccf
dist-auth-ios/assets/aff2c65b39a296d4f7e96d0f58169170
dist-auth-ios/assets/b06871f281fee6b241d60582ae9369b9
dist-auth-ios/assets/b49ae8ab2dbccb02c4d11caaacf09eab
dist-auth-ios/assets/b4eb097d35f44ed943676fd56f6bdc51
dist-auth-ios/assets/ca4b48e04dc1ce10bfbddb262c8b835f
dist-auth-ios/assets/d1ea1496f9057eb392d5bbf3732a61b7
dist-auth-ios/assets/d2285965fe34b05465047401b8595dd0
dist-auth-ios/assets/d62ddc38b69aff346c20a28774933d6a
dist-auth-ios/assets/d84e297c3b3e49a614248143d53e40ca
dist-auth-ios/assets/d8b800c443b8972542883e0b9de2bdc6
dist-auth-ios/assets/d8e7601e3df962f83c62371ac14964d8
dist-auth-ios/assets/dad2fa9f4394a630f0f9a0d6dabd44bc
dist-auth-ios/assets/e20945d7c929279ef7a6f1db184a4470
dist-auth-ios/assets/f3a81967828232c893d547162e922764
dist-auth-ios/assets/fad77ae871f985f563a6fea56741411d
dist-auth-ios/metadata.json
dist-login-android/_expo/static/js/android/entry-5edbf41ecf22da9973b5f97eb8470d42.hbc
dist-login-android/assets/017bc6ba3fc25503e5eb5e53826d48a8
dist-login-android/assets/02bc1fa7c0313217bde2d65ccbff40c9
dist-login-android/assets/069d99eb1fa6712c0b9034a58c6b57dd
dist-login-android/assets/0747a1317bbe9c6fc340b889ef8ab3ae
dist-login-android/assets/0a328cd9c1afd0afe8e3b1ec5165b1b4
dist-login-android/assets/1190ab078c57159f4245a328118fcd9a
dist-login-android/assets/140c53a7643ea949007aa9a282153849
dist-login-android/assets/1681f34aaca71b8dfb70756bca331eb2
dist-login-android/assets/19eeb73b9593a38f8e9f418337fc7d10
dist-login-android/assets/1f77739ca9ff2188b539c36f30ffa2be
dist-login-android/assets/20e71bdf79e3a97bf55fd9e164041578
dist-login-android/assets/286d67d3f74808a60a78d3ebf1a5fb57
dist-login-android/assets/31b5ffea3daddc69dd01a1f3d6cf63c5
dist-login-android/assets/35ba0eaec5a4f5ed12ca16fabeae451d
dist-login-android/assets/370dd5af19f8364907b6e2c41f45dbbf
dist-login-android/assets/3b89dd103490708d19a95adcae52210e
dist-login-android/assets/3cd68ccdb8938e3711da2e8831b85493
dist-login-android/assets/3f78af31cca60105799838a1a7a59fbd
dist-login-android/assets/412dd9275b6b48ad28f5e3d81bb1f626
dist-login-android/assets/4403c6117ec30c859bc95d70ce4a71d3
dist-login-android/assets/4e85bc9ebe07e0340c9c4fc2f6c38908
dist-login-android/assets/56c8d80832e37783f12c05db7c8849e2
dist-login-android/assets/605ed7926cf39a2ad5ec2d1f9d391d3d
dist-login-android/assets/61ca7e64b7d605716c57706cef640b9a
dist-login-android/assets/6e435534bd35da5fef04168860a9b8fa
dist-login-android/assets/778ffc9fe8773a878e9c30a6304784de
dist-login-android/assets/78c625386b4d0690b421eb0fc78f7b9c
dist-login-android/assets/871378c6eab492a3e689a9385dc45a12
dist-login-android/assets/8b078b8487180a92e4a0f8e9a718ab11
dist-login-android/assets/9898592643347b4b60195db5da72e15f
dist-login-android/assets/ab19f4cbc543357183a20571f68380a3
dist-login-android/assets/adec7d6f310bc577f05e8fe06a5daccf
dist-login-android/assets/aff2c65b39a296d4f7e96d0f58169170
dist-login-android/assets/b06871f281fee6b241d60582ae9369b9
dist-login-android/assets/b49ae8ab2dbccb02c4d11caaacf09eab
dist-login-android/assets/b4eb097d35f44ed943676fd56f6bdc51
dist-login-android/assets/c3273c9e5321f20d1e42c2efae2578c4
dist-login-android/assets/c79c3606a1cf168006ad3979763c7e0c
dist-login-android/assets/ca4b48e04dc1ce10bfbddb262c8b835f
dist-login-android/assets/d1ea1496f9057eb392d5bbf3732a61b7
dist-login-android/assets/d2285965fe34b05465047401b8595dd0
dist-login-android/assets/d73eae0b5b40e54bf6cb1e308cf8564c
dist-login-android/assets/d84e297c3b3e49a614248143d53e40ca
dist-login-android/assets/d8b800c443b8972542883e0b9de2bdc6
dist-login-android/assets/d8e7601e3df962f83c62371ac14964d8
dist-login-android/assets/e20945d7c929279ef7a6f1db184a4470
dist-login-android/assets/fad77ae871f985f563a6fea56741411d
dist-login-android/metadata.json
dist-login-ios/_expo/static/js/ios/entry-dd53d916461c92946d69dbb59d0f26d6.hbc
dist-login-ios/assets/017bc6ba3fc25503e5eb5e53826d48a8
dist-login-ios/assets/0747a1317bbe9c6fc340b889ef8ab3ae
dist-login-ios/assets/0a328cd9c1afd0afe8e3b1ec5165b1b4
dist-login-ios/assets/0ea69b5077e7c4696db85dbcba75b0e1
dist-login-ios/assets/1190ab078c57159f4245a328118fcd9a
dist-login-ios/assets/140c53a7643ea949007aa9a282153849
dist-login-ios/assets/1681f34aaca71b8dfb70756bca331eb2
dist-login-ios/assets/19eeb73b9593a38f8e9f418337fc7d10
dist-login-ios/assets/1f77739ca9ff2188b539c36f30ffa2be
dist-login-ios/assets/20e71bdf79e3a97bf55fd9e164041578
dist-login-ios/assets/2d0a9133e39524f138be6d4db9f4851f
dist-login-ios/assets/31b5ffea3daddc69dd01a1f3d6cf63c5
dist-login-ios/assets/370dd5af19f8364907b6e2c41f45dbbf
dist-login-ios/assets/3b89dd103490708d19a95adcae52210e
dist-login-ios/assets/3cd68ccdb8938e3711da2e8831b85493
dist-login-ios/assets/3f78af31cca60105799838a1a7a59fbd
dist-login-ios/assets/412dd9275b6b48ad28f5e3d81bb1f626
dist-login-ios/assets/4e85bc9ebe07e0340c9c4fc2f6c38908
dist-login-ios/assets/56c8d80832e37783f12c05db7c8849e2
dist-login-ios/assets/605ed7926cf39a2ad5ec2d1f9d391d3d
dist-login-ios/assets/61ca7e64b7d605716c57706cef640b9a
dist-login-ios/assets/6e435534bd35da5fef04168860a9b8fa
dist-login-ios/assets/78c625386b4d0690b421eb0fc78f7b9c
dist-login-ios/assets/7d40544b395c5949f4646f5e150fe020
dist-login-ios/assets/871378c6eab492a3e689a9385dc45a12
dist-login-ios/assets/8b078b8487180a92e4a0f8e9a718ab11
dist-login-ios/assets/9898592643347b4b60195db5da72e15f
dist-login-ios/assets/a132ecc4ba5c1517ff83c0fb321bc7fc
dist-login-ios/assets/ab19f4cbc543357183a20571f68380a3
dist-login-ios/assets/adec7d6f310bc577f05e8fe06a5daccf
dist-login-ios/assets/aff2c65b39a296d4f7e96d0f58169170
dist-login-ios/assets/b06871f281fee6b241d60582ae9369b9
dist-login-ios/assets/b49ae8ab2dbccb02c4d11caaacf09eab
dist-login-ios/assets/b4eb097d35f44ed943676fd56f6bdc51
dist-login-ios/assets/ca4b48e04dc1ce10bfbddb262c8b835f
dist-login-ios/assets/d1ea1496f9057eb392d5bbf3732a61b7
dist-login-ios/assets/d2285965fe34b05465047401b8595dd0
dist-login-ios/assets/d62ddc38b69aff346c20a28774933d6a
dist-login-ios/assets/d73eae0b5b40e54bf6cb1e308cf8564c
dist-login-ios/assets/d84e297c3b3e49a614248143d53e40ca
dist-login-ios/assets/d8b800c443b8972542883e0b9de2bdc6
dist-login-ios/assets/d8e7601e3df962f83c62371ac14964d8
dist-login-ios/assets/dad2fa9f4394a630f0f9a0d6dabd44bc
dist-login-ios/assets/e20945d7c929279ef7a6f1db184a4470
dist-login-ios/assets/f3a81967828232c893d547162e922764
dist-login-ios/assets/fad77ae871f985f563a6fea56741411d
dist-login-ios/metadata.json
docs/adr/ADR-002  Database Model
docs/adr/ADR-003  Identity & Authorization
docs/adr/ADR-004  GPS & Tracking Architecture
docs/adr/ADR-005  Track Recording Lifecycle
docs/adr/ADR-006  Smart Analysis
docs/adr/ADR-007  Offline First & Synchronisation
docs/adr/ADR-008  Subscription & Entitlements
docs/adr/ADR-009  Connect Architecture
docs/adr/ADR-010  UI & Navigation
docs/adr/ADR-011  Testing Strategy
docs/adr/ADR-012  Release & Deployment
docs/architecture/CODEX_P0_FIX_01_REVIEW.md
docs/architecture/CODEX_P0_REVIEW.md
docs/architecture/DOG_PERSONAL_DASHBOARD_PHASE_C_FIX_REPORT.md
docs/architecture/FAEHRTE_ABRISS_MAP_FIX_REPORT.md
docs/architecture/FAEHRTE_ABSUCHE_HANDLER_DISTANCE_ANALYSIS.md
docs/architecture/FAEHRTE_ABSUCHE_HANDLER_DISTANCE_FIX_REPORT.md
docs/architecture/FAEHRTE_ANGLE_QUICK_PICKER_FIX_REPORT.md
docs/architecture/FAEHRTE_ANGLE_TYPES_FIX_REPORT.md
docs/architecture/FAEHRTE_OBJECT_QUICK_PICKER_FIX_REPORT.md
docs/architecture/FAEHRTE_STARTPOINT_GPS_ANALYSIS.md
docs/architecture/FAEHRTE_STARTPOINT_GPS_FIX_REPORT.md
docs/architecture/FAEHRTE_STEP_ACCURACY_ANALYSIS.md
docs/architecture/FAEHRTE_STEP_CALIBRATION_FIX_REPORT.md
docs/architecture/FAEHRTE_STEP_LOGIC_UNIFICATION_FIX_REPORT.md
docs/architecture/FAEHRTE_TEILSTRECKE_START_STOP_ANALYSIS.md
docs/architecture/FAEHRTE_TEILSTRECKE_START_STOP_FIX_REPORT.md
docs/architecture/P0-01_DATABASE_TRUTH_REPORT.md
docs/architecture/P0-02_TRACKING_LEGACY_REPORT.md
docs/architecture/P0-03_TRACK_DOMAIN_REPORT.md
docs/architecture/P0-04_SUBSCRIPTION_CAPABILITY_REPORT.md
docs/architecture/P0-05_GPS_PIPELINE_REPORT.md
docs/architecture/P0-06_OFFLINE_TRUTH_REPORT.md
docs/architecture/P0_ARCHITECTURE_VERIFICATION_SUMMARY.md
docs/architecture/TRAINING_JOURNAL_FIX_REPORT.md
faehrten 6/design_handoff_faehrten/abriss.png
legal-web/assets/images/11GSLOGODSC4449.jpg
legal-web/assets/images/Malu13.jpg
legal-web/assets/images/anyvologo.png
legal-web/assets/images/app-icon.png
legal-web/assets/images/bazooka.jpg
legal-web/assets/images/yam20.jpg
legal-web/assets/screenshots/faehrten-ios.png
legal-web/assets/screenshots/hunde-android.png
legal-web/assets/screenshots/training-android.png
legal-web/assets/screenshots/training-ios.png
legal-web/assets/site.css
legal-web/assets/site.js
legal-web/funktionen.html
legal-web/funktionen/index.html
screen20.jpg
services/__tests__/profileService.test.ts
services/__tests__/shareService.test.ts
services/__tests__/trainingFeed.test.ts
supabase/migrations/20260803120000_fix_shared_trainings_fk.sql
supabase/migrations/20260803140000_profiles_username.sql
supabase/migrations/README.md
supabase/production_public_schema_snapshot.sql
supabase/staging_p0_smoke_verify.sql
supabase/staging_public_schema_restore.sql
winkel.png
```

### Recent commits
```
7490969 feat(home): add customizable quick action button
9f48119 feat(dogs): simplify sports profile and allow custom discipline
f4076c4 fix(dogs): keep tasso_registered non-null on create
ec85884 feat(dogs): add country-specific registry details
9560f0b fix(dogs): hide training fab on dogs tab
```

### Runtime
```
Node: v24.15.0
Package manager: npm
```

<!-- AUTO-GENERATED:END -->

> Hinweis: Der AUTO-GENERATED-Block oben wird beim Handoff-Script aktualisiert.
> Maßgeblich bei Widerspruch bleibt der tatsächliche Repository-Zustand.
> Stand der manuellen Sektionen: 2026-08-04.
> WICHTIG: Der AUTO-GENERATED-Block ist bewusst NICHT aktualisiert worden (kein `agent:handoff` in dieser
> Doku-Session) — er zeigt noch den Stand 2026-08-03/HEAD `7490969` und ist **veraltet**.

## Current task
**Build-39-Release-Readiness (Readiness-Audit abgeschlossen, 2026-08-04) — GATE: NOT READY.**
Read-only-Audit über alle gewünschten Build-39-Änderungen: HEAD `c268eee` ist als Basis technisch sauber,
aber Build 39 ist noch nicht startbar, weil Build-39-Features (T-39/T-40/T-44 + Fixes) **uncommittet**, zwei
Migrationen **remote fehlen** und die Release-Konfiguration **unvollständig** ist (versionCode 37, fehlender
RevenueCat-Android-Key). Diese Session hat **ausschliesslich die Agent-/Handoff-Doku** aktualisiert.

Aktueller Commit-Stand auf `feat/track-module-rewrite` (HEAD `c268eee`, 42 Commits vor `origin`):
T-34…T-43 und der Trainer-Hub-Modal sind committed; **uncommittet** liegen T-39, T-40, T-44 (Trainer-Hub-Redesign,
Profil-Duplikat-Entfernung, Umfrage-/Summary-Back-Fallback) und weitere Build-39-Fixes im Tree.

## Goal
Build 39 READY machen, ohne unberechtigte Aktionen: (1) T-39/T-40/T-44 + Build-39-Fixes hunk-genau committen
(keine fremden WIP-Hunks in `profile.tsx`/`i18n/*`); (2) Migrationen `20260803120000` + `20260803140000`
kontrolliert über den Supabase-Migrationsworkflow remote anwenden bzw. History synchronisieren (kein
`supabase db push`), danach RPC-Smoke-Test; (3) Release-Konfiguration vor Build 39: Android `versionCode`
`37`→`39`, iOS `buildNumber` `"38"`→`"39"`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` prüfen/ergänzen; (4) sauberen
Release-Worktree aus committed HEAD erstellen und iOS+Android aus derselben Feature-Basis bauen.

## Work completed — opencode 2026-08-04 (Build-39-Readiness-Audit + Doku)
- **Clean-HEAD-Verifikation (Sektion 4), detachierter Worktree auf `c268eee`, danach entfernt:**
  `npm ci` OK; `npx tsc --noEmit` = 0 Errors; `npx jest` = **77 Suites / 856 Tests PASS**; `npm run lint` =
  **1 Error** (`app/dog-command/detail.tsx:69:110` `react/no-unescaped-entities`, vorbestehend seit `ab602c0`,
  NICHT Build-39) + 77 Warnungen; `npx expo config --type public` OK (Sentry-org/project nur via Env-Warnung);
  `npx expo export --platform ios` + `--platform android` beide OK (je ~7.6 MB JS-Bundle);
  `git diff --check HEAD^ HEAD` sauber.
- **Arbeitender Tree (mit allen uncommitteten Änderungen):** `npx tsc --noEmit` = 0 Errors;
  `npx jest` = **84 Suites / 910 Tests PASS** (+7 Suites/+54 Tests aus uncommitteter Build-39-Arbeit).
- **Datei-Klassifikation (Sektion 6, Verified):**
  - Rein Build-39, uncommittet: `app/(tabs)/training.tsx` (T-39), `app/unit/summary.tsx` (T-44, Back-Nav),
    `app/umfrage/index.tsx` (T-44, Back-Fallback), `app/trainer-hub.tsx` (T-44, Redesign), `app/training-journal.tsx`
    (T-40), `services/trainingFeed.ts` (T-40, `distance_meters`+Dedup), `features/training/__tests__/journal.test.ts`,
    `components/ui/DateField.tsx` (Android-Spinner-Fix), `services/shareService.ts` (ShareLink-Robustheit).
  - Gemischt (Build-39 + fremde WIP, hunk-genau): `app/(tabs)/profile.tsx` (T-44 Duplikat-Entfernung +
    T-43-`@username`-Anzeige + fremde i18n-Migration), `i18n/de-CH.ts`/`i18n/gsw-CH.ts` (`trainer.*`-Keys +
    fremde ANYVO-ID-Umbennung), `app/(tabs)/__tests__/tab-navigation.test.ts` (T-44-Tests, Hinzufügungen rein).
  - Fremd (NICHT committen): ANYVO-ID-Umbennung `i18n/locales/fr.ts` komplett; i18n-Hardcode-Migration in
    `trainer/dashboard`, `trainer/index`, `unit/live`, `unit/stats`, `index`, `sync`, `track/*`, `tracking/*`,
    `connect/*`, `AppLockGate`, `ShareSheet`, `DogHeatCard`, `DogQuickActions`, `GpsSourcePicker`,
    `MarkerBottomSheet`, `ActiveFaehrteCard`, `TrackStatsPanel`; `legal-web/*`, SQL-Dumps, Screenshots, `dist-*`,
    ADRs, `AI_HANDOFF.md`, Workspace-Dateien.
  - Untracked Build-39-Tests: `app/(tabs)/__tests__/training.test.tsx` (T-39), `app/__tests__/training-journal.test.tsx`
    + `services/__tests__/trainingFeed.test.ts` (T-40), `components/ui/__tests__/DateField.test.tsx`,
    `services/__tests__/shareService.test.ts`.
  - Untracked, zu committeden Features (T-42/DogQuickActions/DogBackpackWidget/backpack-i18n): optional, nicht
    Build-39-blockierend: `components/dogs/__tests__/DogQuickActions.test.ts`,
    `components/home/__tests__/DogBackpackWidget.test.ts`, `i18n/__tests__/backpack-i18n.test.ts`-Hunks.
- **Migrationen (Sektion 3, Verified read-only):** remote angewendet = 14; **remote fehlen**:
  `20260803120000_fix_shared_trainings_fk.sql` (untracked, NICHT committed; korrigiert `shared_trainings`-FK von
  `public.trainings` auf `training_sessions(id)` on delete cascade — nur per Supabase-Migrationsworkflow anwenden)
  und `20260803140000_profiles_username.sql` (committed `7517e1d`, NICHT remote; fehlende RPC/Column sind die
  verifizierte Wurzel des T-43-Fehlerbilds `PGRST202`/`42703`). Entitlement-Migrationen
  `20260802100000`/`20260802110000` committed `50ccfd2`, ebenfalls NICHT remote.
- **Release-Konfiguration (Sektion 5, Verified):** `app.json` version `1.0.1`, iOS `buildNumber "38"`, Android
  `versionCode 37` (T-18-Doku „versionCode 38" ist veraltet). `eas.json`: `appVersionSource: local`, production
  `autoIncrement: false`, channel `production`, `buildType: app-bundle`. **`EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`
  nirgends gesetzt** (`.env`/`.env.example`/`eas.json` nur iOS-Key) → `configurePurchases`
  (`lib/purchases.ts:27-28`) kehrt auf Android ohne Key zurück → IAP inaktiv, Trial-Fallback. Sentry-org/project
  nur via Env (Config-Warnung, im Build OK).
- **TASK-ID:** T-44 vergeben für die bislang nicht erfassten Build-39-Arbeiten (Trainer-Hub-Redesign,
  Profil-Duplikat-Einträge, Umfrage-Back-Fallback, Summary-Back-Fallback); TASKS.md bestätigt T-44 als nächste
  freie ID. Nächste freie ID ist jetzt **T-45**.
- **Agent-Doku aktualisiert (NUR diese Datei + `TASKS.md` + `CURRENT_STATE.md` + `WORK_LOG.md`):** kein
  `git add`, kein Commit, kein Push, kein Build, keine Migration, keine History-Reparatur, keine Release-Nummern.

## Tests / verification (Verified)
- Arbeitender Tree: `npx tsc --noEmit` = 0 Errors; `npx jest` = **84 Suites / 910 Tests PASS**.
- Clean-HEAD (`c268eee`, Worktree): `npx tsc --noEmit` = 0 Errors; `npx jest` = **77 Suites / 856 Tests PASS**;
  `expo export` iOS + Android OK; `git diff --check HEAD^ HEAD` sauber.
- Vorbestehend (nicht Build-39): 1 Lint-Error `app/dog-command/detail.tsx:69:110`; 77 Lint-Warnungen;
  Jest-Warnung „worker … not exit gracefully" (`trackPersist.ts:61` 4-s-Timer); `trainer-flow.test.ts` flaky
  (SIGSEGV nur im Parallel-Lauf, in Isolation grün).
- Doku-Verifikation: `git diff --check` sauber (nach den Doku-Änderungen erneut geprüft).

## Known issues / offene Punkte
- **Build 39 GATE = NOT READY.** Blocker: (P0) T-39/T-40/T-44 + Build-39-Fixes uncommittet, `profile.tsx`/`i18n/*`
  gemischt mit Fremd-WIP → nur hunk-genau stagen; (P0) Migrationen `20260803120000` (untracked, erst committen)
  + `20260803140000` fehlen remote; (P1) `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` fehlt → Android-IAP inaktiv;
  (P1) `versionCode 37`/`buildNumber "38"` müssen → 39; (P2) 42 Commits ungepusht; 1 vorbestehender Lint-Error;
  Sentry-Config-Warnung; TASKS.md/CURRENT_STATE/DECISIONS-AUTO-GENERATED teils veraltet.
- **AUTO-GENERATED-Block von SESSION_HANDOFF.md ist veraltet** (zeigt Stand 2026-08-03, HEAD `7490969`).
  `npm run agent:handoff -- --agent=codex` wurde auf Anweisung NICHT ausgeführt — vor dem nächsten
  Agenten-Handoff nachholen.
- Migrationen nicht remote angewendet; kein `supabase db push` (History-Reparatur nur kontrolliert).
- Fremde WIP (ANYVO-ID-Umbennung, i18n-Hardcode-Migration, Connect/Tracking) bleibt unangetastet im Tree.
- T-30 (Realgeräte-Abnahme), T-20 (Testerfeedback), T-22 (Website-Relaunch), T-23 (RevenueCat-Dashboard) offen.

## Important context
- **Commit-Kette (HEAD absteigend, ungepusht):** `c268eee` Trainer-Hub-Modal/Tab-Layout → `b96f34d` Umfrage-Formular
  → `7517e1d` T-43 Usernames → `e8f57be` Quick-Button-Drag → `7490969` Quick-Button → `9f48119` Sportprofil →
  `f4076c4`/`ec85884`/`9560f0b`/`c859e33` Dogs → `50ccfd2` T-34 → `e447cd2` Home-Backpack → `0061fed` Dashboard →
  `2a85fbc` Journal → `0434182` Backpack.
- **Uncommittete Build-39-Arbeit ist getestet:** Arbeits-Tree = 84 Suites/910 Tests, tsc 0 Errors. Committen ist
  reine Staging-Arbeit (hunk-genau), kein weiterer Code-Fix erwartet — ausser der vorbestehende Lint-Error soll
  vor Build 39 gefixt werden (freiwillig, `app/dog-command/detail.tsx:69:110`).
- **Staging-Kartei (hunk-genau):**
  - T-39: `app/(tabs)/training.tsx` + `app/(tabs)/__tests__/training.test.tsx` (neu).
  - T-40: `app/training-journal.tsx`, `services/trainingFeed.ts`, `features/training/__tests__/journal.test.ts`,
    `app/__tests__/training-journal.test.tsx` (neu), `services/__tests__/trainingFeed.test.ts` (neu).
  - T-44: `app/trainer-hub.tsx`, `app/umfrage/index.tsx`, `app/unit/summary.tsx`,
    `app/(tabs)/__tests__/tab-navigation.test.ts`, `trainer.*`-Hunks in `i18n/de-CH.ts`/`i18n/gsw-CH.ts`,
    Duplikat-Entfernungs-Hunks in `app/(tabs)/profile.tsx`.
  - Build-39-Fixes (optional separater Commit): `components/ui/DateField.tsx` + `DateField.test.tsx` (neu),
    `services/shareService.ts` + `shareService.test.ts` (neu), T-43-`@username`-Hunks in
    `app/(tabs)/profile.tsx`/`app/trainer/index.tsx`.
- **Datenbank-Kontext:** remote (Production ANYVO `axkkhyqrjrtbkumaulta`) hat 14 Migrationen; lokal fehlen remote
  `20260803120000` + `20260803140000`. Share-FK-Fix nur zusammen mit committed Share-Code behandeln (fremder
  ShareSheet-WIP nicht mitschneiden). Nach Anwendung RPC-Smoke-Test `check_username_available`
  (frei/reserviert/belegt/case-insensitive) + Unique-Index (2× gleicher lowercase-Name → 23505).
- **Release-Konfiguration:** `app.json` (`com.anyvo.app` iOS/Android, version `1.0.1`, edgeToEdge, neue Architektur,
  `supportsTablet:false`); `eas.json`-Profile development/development-simulator/preview/production (nur production
  Sentry-Upload aktiv); RevenueCat nur iOS-Key. Vor Build 39: versionCode/buildNumber → 39, Android-Key ergänzen.

## Do not touch
- Keine pauschalen Git-Aktionen (`git add .`, `git add -A`, reset, clean, checkout fremder Dateien).
- Kein Commit/Push ohne ausdrückliche Freigabe; kein Build; keine Remote-Migration; kein `supabase db push`.
- Fremde WIP in `app/index.tsx`, `app/sync.tsx`, `app/track/*`, `app/trainer/dashboard.tsx`,
  `app/unit/live.tsx`/`unit/stats.tsx`, `components/AppLockGate.tsx`, `components/ShareSheet.tsx`,
  `components/dogs/*`, `features/connect/*`, `features/tracking/components/*`, `legal-web/*`,
  `i18n/locales/fr.ts`, ANYVO-ID-Hunks in `i18n/de-CH.ts`/`gsw-CH.ts`, SQL-Dumps, `dist-*/`, Screenshots, ADRs.
- AUTO-GENERATED-Block von SESSION_HANDOFF.md nie händisch editieren (nur via `agent:handoff`).
- `docs/agent/*` manuell nur gemäss Handoff-Protokoll aktualisieren.

## Next recommended step
1. **Handoff-Block regenerieren:** `npm run agent:handoff -- --agent=codex` (auf Anweisung in dieser Session
   ausgelassen; ersetzt den veralteten AUTO-GENERATED-Block). Dann `npm run agent:status` + `npm run agent:start`.
2. **Build-39-Arbeit hunk-genau stagen/committen** (nur mit Freigabe), Commit-Vorschläge:
   - `feat(training): add journal entry card on training tab` (T-39)
   - `feat(training): show GPS track distance and dedup tracks in journal` (T-40)
   - `feat(trainer): redesign trainer hub and safe back navigation` (T-44)
   - ggf. `fix(dogs/date): use spinner picker on Android for date fields` (DateField)
   - ggf. `fix(share): harden share link creation error handling` (shareService)
3. **Migrationen kontrolliert remote anwenden** (Supabase-Migrationsworkflow, kein `db push`): erst
   `20260803120000_fix_shared_trainings_fk.sql` committen, dann beide anwenden; danach RPC-Smoke-Test
   (T-43-RPC + Unique-Index) und Share-FK nur zusammen mit committed Share-Code behandeln.
4. **Release-Konfiguration vor Build 39:** `app.json` Android `versionCode` `37`→`39`, iOS `buildNumber` `"38"`→`"39"`;
   `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` prüfen/ergänzen (sonst Android-IAP inaktiv); optional Lint-Error
   `app/dog-command/detail.tsx:69:110` fixen; sauberen Release-Worktree aus committed HEAD erstellen; iOS+Android
   aus derselben Feature-Basis bauen.
5. **T-30: Realgeräte-Abnahmetest** (Backpack/Journal/Dashboard/Home-Backpack, DE/gsw/FR, iPhone klein/gross +
   Galaxy S23); weiterhin offen: T-20, T-21, T-22, T-23, T-24.

## Relevant files (diese Session)
- Doku: `docs/agent/TASKS.md`, `docs/agent/CURRENT_STATE.md`, `docs/agent/SESSION_HANDOFF.md`, `docs/agent/WORK_LOG.md`
  (nur diese wurden geändert; kein `git add`).
- Uncommittete Build-39-Arbeit (Staging-Kartei, siehe Important context): `app/trainer-hub.tsx`,
  `app/(tabs)/training.tsx`, `app/(tabs)/profile.tsx`, `app/training-journal.tsx`, `app/umfrage/index.tsx`,
  `app/unit/summary.tsx`, `services/trainingFeed.ts`, `services/shareService.ts`, `components/ui/DateField.tsx`,
  `features/training/__tests__/journal.test.ts`, `app/(tabs)/__tests__/tab-navigation.test.ts`, `i18n/*`.
- Migrationen: `supabase/migrations/20260803120000_fix_shared_trainings_fk.sql` (untracked),
  `supabase/migrations/20260803140000_profiles_username.sql` (committed).
- Release-Config: `app.json`, `eas.json`, `lib/purchases.ts` (Android-Key-Lücke).

## Open questions
- Freigabe für hunk-genaues Staging/Committen von T-39/T-40/T-44 + Build-39-Fixes? In welcher Reihenfolge?
- Freigabe zum kontrollierten Remote-Anwenden der Migrationen (inkl. erstem Commit der Share-FK-Migration)?
- Soll der vorbestehende Lint-Error (`app/dog-command/detail.tsx:69:110`) vor Build 39 behoben werden?
- Woher kommt der `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` (nur iOS-Key vorhanden)? In `.env` + `eas.json` production?
- Wann Build 39 (versionCode/buildNumber 39, iOS+Android aus derselben Basis) starten?
- T-30 Realgeräte-Abnahme und T-20/T-22/T-23/T-24-Terminierung.
