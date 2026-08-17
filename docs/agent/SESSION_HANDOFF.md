# Agent Session Handoff

> Aktuellster Handoff: **OpenCode (2026-08-10)** → **OpenAI Codex**.
> Der Block zwischen den AUTO-GENERATED-Markern wird von `scripts/agent-handoff.mjs` erzeugt —
> **nicht manuell** bearbeiten. Alles ausserhalb der Marker wird von den Agenten **manuell** gepflegt.
>
> Priorität bei Widerspruch:
> **Repository state > Git state > Handoff documentation > Agent assumptions.**
> Der tatsächliche Repository-Zustand hat immer Vorrang vor dieser Doku.

<!-- AUTO-GENERATED:START -->

Generated: 2026-08-17T10:30:53.558Z
Agent: claude
Branch: feat/track-module-rewrite

### Git status
```
M AGENTS.md
 M AI_HANDOFF.md
 M app/trainer/index.tsx
 M docs/adr/ADR-001_Domain_Model.md
 M docs/agent/CURRENT_STATE.md
 M docs/agent/README.md
 M docs/agent/SESSION_HANDOFF.md
 M docs/agent/TASKS.md
 M docs/agent/WORK_LOG.md
 M features/subscription/plans.ts
 M features/tracking/hooks/useTrackVoiceGuidance.ts
 M hooks/useCapabilities.ts
 M i18n/de-CH.ts
 M i18n/gsw-CH.ts
 M i18n/locales/fr.ts
 M package-lock.json
 M package.json
 M scripts/agent-handoff.mjs
 M scripts/agent-lib.mjs
 M scripts/agent-start.mjs
 M scripts/agent-status.mjs
 M supabase/migrations/20260803140000_profiles_username.sql
?? .claude/development.code-workspace
?? .opencode/
?? ANYVO-current-repository.zip
?? STAGING_DEPLOY_RUN.sql
?? SUBSCRIPTION_P0_DB_DEPLOYMENT.md
?? after_bottomnav_galaxyS23_3button.png
?? after_bottomnav_galaxyS23_gesture.png
?? after_bottomnav_tablet_3button.png
?? after_bottomnav_tablet_gesture.png
?? artifacts/
?? assets/images/11GSLOGODSC4449.jpg
?? assets/images/Journalscreenshot.png
?? assets/images/Malu13.jpg
?? assets/images/backpackscreenshot.png
?? assets/images/bazooka.jpg
?? assets/images/smartanalysescreenshot.png
?? canisflow.code-workspace
?? components/subscription/PremiumInlineUpsell.tsx
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
?? docs/architecture/EMAIL_CONFIRMATION_FLOW.md
?? docs/architecture/FAEHRTE_ABRISS_MAP_FIX_REPORT.md
?? docs/architecture/FAEHRTE_ABSUCHE_HANDLER_DISTANCE_ANALYSIS.md
?? docs/architecture/FAEHRTE_ABSUCHE_HANDLER_DISTANCE_FIX_REPORT.md
?? docs/architecture/FAEHRTE_ANGLE_QUICK_PICKER_FIX_REPORT.md
?? docs/architecture/FAEHRTE_ANGLE_TYPES_FIX_REPORT.md
?? docs/architecture/FAEHRTE_OBJECT_QUICK_PICKER_FIX_REPORT.md
?? docs/architecture/FAEHRTE_OFF_TRACK_AND_HANDLER_DISTANCE_FIX_REPORT.md
?? docs/architecture/FAEHRTE_SAVE_RELIABILITY_ANALYSIS.md
?? docs/architecture/FAEHRTE_SAVE_RELIABILITY_DESIGN.md
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
?? docs/manual-test/
?? "faehrten 6/design_handoff_faehrten/abriss.png"
?? features/subscription/__tests__/healthCapabilities.test.ts
?? legal-web/__tests__/
?? legal-web/assets/auth-confirm.js
?? legal-web/auth/
?? opencode.json
?? screen20.jpg
?? supabase/migrations/README.md
?? supabase/production_public_schema_snapshot.sql
?? supabase/staging_p0_smoke_verify.sql
?? supabase/staging_public_schema_restore.sql
?? winkel.png
```

### Diff stat
```
AGENTS.md                                          |  10 +-
 AI_HANDOFF.md                                      |   6 +
 app/trainer/index.tsx                              |  63 ++--
 docs/adr/ADR-001_Domain_Model.md                   | 416 +++++++++++++++++++++
 docs/agent/CURRENT_STATE.md                        |  35 ++
 docs/agent/README.md                               |  20 +-
 docs/agent/SESSION_HANDOFF.md                      |  61 ++-
 docs/agent/TASKS.md                                |  25 ++
 docs/agent/WORK_LOG.md                             |  17 +
 features/subscription/plans.ts                     |  21 ++
 features/tracking/hooks/useTrackVoiceGuidance.ts   |   2 +
 hooks/useCapabilities.ts                           |  11 +
 i18n/de-CH.ts                                      |   6 +
 i18n/gsw-CH.ts                                     |   6 +
 i18n/locales/fr.ts                                 |   6 +
 package-lock.json                                  | 234 ++++++++++++
 package.json                                       |   1 +
 scripts/agent-handoff.mjs                          |   4 +-
 scripts/agent-lib.mjs                              |   2 +-
 scripts/agent-start.mjs                            |  13 +-
 scripts/agent-status.mjs                           |   2 +-
 .../20260803140000_profiles_username.sql           |  79 +---
 22 files changed, 902 insertions(+), 138 deletions(-)
```

### Modified files
```
AGENTS.md
AI_HANDOFF.md
app/trainer/index.tsx
docs/adr/ADR-001_Domain_Model.md
docs/agent/CURRENT_STATE.md
docs/agent/README.md
docs/agent/SESSION_HANDOFF.md
docs/agent/TASKS.md
docs/agent/WORK_LOG.md
features/subscription/plans.ts
features/tracking/hooks/useTrackVoiceGuidance.ts
hooks/useCapabilities.ts
i18n/de-CH.ts
i18n/gsw-CH.ts
i18n/locales/fr.ts
package-lock.json
package.json
scripts/agent-handoff.mjs
scripts/agent-lib.mjs
scripts/agent-start.mjs
scripts/agent-status.mjs
supabase/migrations/20260803140000_profiles_username.sql
```

### Untracked files
```
.claude/development.code-workspace
.opencode/agent/primary.md
.opencode/agents/anyvo-analyst.md
.opencode/agents/anyvo-engineering-lead.md
.opencode/commands/handoff.md
ANYVO-current-repository.zip
STAGING_DEPLOY_RUN.sql
SUBSCRIPTION_P0_DB_DEPLOYMENT.md
after_bottomnav_galaxyS23_3button.png
after_bottomnav_galaxyS23_gesture.png
after_bottomnav_tablet_3button.png
after_bottomnav_tablet_gesture.png
artifacts/faehrten-teilstrecken/ios/01_boot_home.png
artifacts/faehrten-teilstrecken/ios/02_faehrten_index.png
artifacts/faehrten-teilstrecken/ios/03_legen_teilstrecke_abriss_buttons.png
assets/images/11GSLOGODSC4449.jpg
assets/images/Journalscreenshot.png
assets/images/Malu13.jpg
assets/images/backpackscreenshot.png
assets/images/bazooka.jpg
assets/images/smartanalysescreenshot.png
canisflow.code-workspace
components/subscription/PremiumInlineUpsell.tsx
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
docs/architecture/EMAIL_CONFIRMATION_FLOW.md
docs/architecture/FAEHRTE_ABRISS_MAP_FIX_REPORT.md
docs/architecture/FAEHRTE_ABSUCHE_HANDLER_DISTANCE_ANALYSIS.md
docs/architecture/FAEHRTE_ABSUCHE_HANDLER_DISTANCE_FIX_REPORT.md
docs/architecture/FAEHRTE_ANGLE_QUICK_PICKER_FIX_REPORT.md
docs/architecture/FAEHRTE_ANGLE_TYPES_FIX_REPORT.md
docs/architecture/FAEHRTE_OBJECT_QUICK_PICKER_FIX_REPORT.md
docs/architecture/FAEHRTE_OFF_TRACK_AND_HANDLER_DISTANCE_FIX_REPORT.md
docs/architecture/FAEHRTE_SAVE_RELIABILITY_ANALYSIS.md
docs/architecture/FAEHRTE_SAVE_RELIABILITY_DESIGN.md
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
docs/manual-test/FAEHRTE_OFF_TRACK_REAL_DEVICE_TEST.md
faehrten 6/design_handoff_faehrten/abriss.png
features/subscription/__tests__/healthCapabilities.test.ts
legal-web/__tests__/authConfirmStatus.test.ts
legal-web/assets/auth-confirm.js
legal-web/auth/confirmed.html
opencode.json
screen20.jpg
supabase/migrations/README.md
supabase/production_public_schema_snapshot.sql
supabase/staging_p0_smoke_verify.sql
supabase/staging_public_schema_restore.sql
winkel.png
```

### Recent commits
```
adfc3b5 fix(subscription): allow 2 NEWBIE trainings per month
c210008 feat(subscription): add 3-day ACTIVE trial funnel
888d25f chore(agent): refresh production handoff state
fddd1f1 fix: restore track rendering and robust angle detection
71f2bef fix(tracking): export voice guidance helper used by track run
```

### Runtime
```
Node: v24.15.0
Package manager: npm
```

<!-- AUTO-GENERATED:END -->

> Hinweis: Der AUTO-GENERATED-Block oben wird beim Handoff-Script aktualisiert.
> Maßgeblich bei Widerspruch bleibt der tatsächliche Repository-Zustand.
> Stand der manuellen Sektionen: **2026-08-17 (Codex)** — NEWBIE-Quota read-only Production-Preflight (No-Op) +
> T-57 Trainer-Keyboard-Fix committed als `0e7aaba`; HEAD `0e7aaba`.
> Hinweis: Der AUTO-GENERATED-Block oben ist ggf. älter als diese manuellen Sektionen; maßgeblich ist der echte git-Stand.

## Current task
**Session 2026-08-17 (Codex):** (1) **Read-only Production-Preflight** der geplanten NEWBIE-Quota-Korrektur
gegen ANYVO Production (`axkkhyqrjrtbkumaulta`); (2) **T-57 committed** `app/trainer/index.tsx`
(Bottom-Sheet „Trainer verbinden → Code eingeben" bei Tastatur sichtbar). **Kein Push/Build/OTA/Submit,
keine Production-Schreiboperation.** HEAD steht auf **`0e7aaba`**, Branch `feat/track-module-rewrite`, und ist
**3 Commits VOR origin** (`c210008`, `adfc3b5`, `0e7aaba` sind **ungepusht**; 0 hinter origin).

> **Repository-Zustand > Handoff.** Zwei Subscription-Commits sind seit dem letzten Handoff (`fddd1f1`) auf dem
> Branch, in der vorherigen Session **nicht** erstellt und **noch nicht gepusht** — nur als Repo-Zustand dokumentiert:
> `c210008 feat(subscription): add 3-day ACTIVE trial funnel` und `adfc3b5 fix(subscription): allow 2 NEWBIE trainings per month`.
> **Neu in dieser Session:** `0e7aaba fix(trainer): keep connect sheet above keyboard`, ebenfalls ungepusht.

## Goal
NEWBIE-Quota-Zielzustand (dog=1 · training=2 · track=0) sicher auf Production halten **ohne unnötige Migration**,
den committed Trainer-Verbinden-Keyboard-Fix auf echten Geräten abnehmen und den **realen Feldtest** des
Fährten-Confidence-/Render-Fixes (P0, T-56, siehe unten).

## NEWBIE-Quota Preflight — Ergebnis (Verified read-only, 2026-08-17)
- **Production liefert bereits** `newbie_quota_limit` = **dog=1, training=2, track=0** (via PostgREST/anon-RPC gegen
  `axkkhyqrjrtbkumaulta`; `.env EXPO_PUBLIC_SUPABASE_URL` = Production bestätigt). Tabelle `newbie_quota_claims` existiert.
- **Migration `supabase/migrations/20260816130000_newbie_training_quota_two.sql` (training 1→2) ist damit ein No-Op**
  (idempotentes `CREATE OR REPLACE`, keine Datenänderung, keine Wirkung). **Nicht erforderlich.**
- **Falle:** `20260808120000_newbie_training_quota_one.sql` senkt training auf **1** — darf **nicht isoliert** auf
  Production laufen (Regression 2→1).
- Premium (ACTIVE/FOUNDER/TRAINER/Lifetime) via `is_pro_member`/`user_capabilities.pro_member` wird **vor**
  `newbie_quota_limit` auf unbegrenzt kurzgeschlossen → von der Quota unberührt.
- **Verifikationsgrenze:** kein DDL-Dump möglich (`pg_dump`/`psql`/`service_role` fehlen; `supabase migration list
  --linked` scheitert an fehlendem `SUPABASE_DB_PASSWORD`). Beleg ist **verhaltensbasiert** (RPC-Rückgabewerte),
  nicht per Funktions-Body-Dump.

## Trainer-Verbinden Keyboard-Fix (committed `0e7aaba`, `app/trainer/index.tsx`)
- **Bug:** Bottom-Sheet „Code eingeben" war `position:absolute; bottom:0` in einem `Modal` **ohne**
  `KeyboardAvoidingView` → Tastatur verdeckte das Eingabefeld, Eingabe nicht sichtbar.
- **Fix (Projekt-Idiom):** Backdrop + Sheet in eine Vollbild-`KeyboardAvoidingView`
  (`behavior={Platform.OS==='ios'?'padding':'height'}`, `modalRoot { flex:1, justifyContent:'flex-end' }`);
  `position:absolute` vom Sheet entfernt; `autoFocus` aufs Code-Feld. Tap-auf-Backdrop-Schließen bleibt erhalten.
- **Verifikation:** `npx tsc --noEmit` PASS; `npx jest services/__tests__/trainer-flow.test.ts --runInBand` PASS
  (1 Suite / 6 Tests); `git diff --check` PASS. **Real-Device-Test iOS/Android steht aus** (Galaxy S23: Gesten- und
  Drei-Button-Navigation; Keyboard öffnen/schließen, Backdrop bei offenem Keyboard, mehrfaches Öffnen/Schließen,
  kleine Displayhöhe/vergrößerte Schrift, gültiger/ungültiger Codefluss).

## Current implementation state (Verified im Code `fddd1f1`)
- **Solid-Track produktiv:** gelegte Fährte immer solide Mint via `laidTrackStroke()`
  (`features/tracking/utils/trackSegments.ts`), Renderer `features/tracking/components/TrackingMap.tsx`; Ist-Suchspur
  separat blau; `dimLay` deprecated.
- **Confidence-Winkel produktiv:** `features/tracking/utils/autoCornerDetection.ts` — hartes `MAX_ANGLE_ACCURACY_M`-
  Gate entfernt, Confidence-Faktoren (angle .24 / straightBefore .16 / straightAfter .16 / support .10 /
  accuracy .12 (robust über Sequenz) / bearing .12 / legLength .10), Zustände accept/pending/reject. Ein einzelner
  schlechter GPS-Fix zerstört einen klaren Winkel nicht mehr. Schlangenlinien-Schutz erhalten.
- Voice/Haptik/Store/Persistenz/1-5-10-m/Off-Track **unverändert** (Voice/Haptik waren nicht die Root Cause).

## Work completed — Stand 2026-08-15
- **Commit `0e7aaba`** — `fix(trainer): keep connect sheet above keyboard` (ausschließlich
  `app/trainer/index.tsx`, 35+/28−). Kein Build/OTA/Submit/DB-Vorgang, nicht gepusht.
- **Commit `fddd1f1`** — `fix: restore track rendering and robust angle detection` (10 Dateien: TrackingMap +
  trackSegments + autoCornerDetection + 5 Tests + 2 Reports; `angleDiagnostics.ts` DEV-only). Gepusht (== origin).
- **Production-OTA 2026-08-15** aus **sauberem detached Worktree** auf `fddd1f1` (kein fremder WIP), Runtime **1.0.1**,
  Channel `production`, plattformweise:
  - iOS update `01a00692-bd2f-7edd-868e-54143abe7c41` (group `219a6fc9-3278-4fb6-b01c-45b4b5231f18`)
  - Android update `01a00697-d886-7580-ab39-7528bc0163f5` (group `d88e7d0d-fb09-4e57-b55e-9b63df340828`)
  - Message „fix(tracking): restore solid track rendering and robust angle detection". Kein Build/Submit/DB.
- Reports: `FAEHRTE_SEARCH_RENDER_AND_GUIDANCE_FIX_REPORT.md`, `FAEHRTE_ANGLE_CONFIDENCE_FIX_REPORT.md`.

## Tests / verification (Verified)
- Targeted Tracking/Angle/Guidance **103 PASS**; Gesamtsuite **1191 PASS / 1 FAIL** = ausschließlich der
  vorbestehende stale `app/track/__tests__/run-arming.test.ts` (`run.tsx` unverändert). **Suite NICHT vollständig
  grün, solange dieser stale Test existiert.** `tsc --noEmit` 0 Errors, ESLint berührter Dateien 0 Errors,
  iOS + Android `expo export` OK.

## Open work (P0)
- **Real-Device-Test des Confidence-/Render-Fixes** (iOS + Android) — siehe `TASKS.md` T-56 (Karte, Guidance,
  Schlangenlinien-Regression, 1/5/10-m, kurzer Off-Track).

## Do not change casually (ohne Feldbeleg + Regressionstests)
- Confidence-**Gewichte** und **Schwellen** (`ACCEPT_CONF`, `STRAIGHT_ACCEPT`, `ACC_BAD_M` …), **Straightness-Regeln**,
  **Schlangenlinien-Unterdrückung**, **Links/Rechts-Logik**, **Voice/Haptik**. Nicht durch großzügiges Anheben von
  Accuracy-Schwellen „reparieren".

## Known issues / offene Punkte
- **NEWBIE-Quota-Migration `20260816130000` ist auf Production ein No-Op** (training bereits 2). Nicht ausführen,
  außer man will die Definition bewusst idempotent festschreiben — **nur nach ausdrücklicher Freigabe**.
- **Trainer-Verbinden Keyboard-Fix** (`0e7aaba`) ist committed, aber **real-device-untestet** (iOS + Galaxy S23
  mit Gesten- und Drei-Button-Navigation).
- **Stale Test** `app/track/__tests__/run-arming.test.ts` (`([5, 10] as const).map` vs. `HANDLER_DISTANCES_M`) rot, unabhängig.
- **Web-Bundle** bricht via `react-native-maps` → OTA plattformweise ios/android; kein Mobile-Blocker, **nicht nebenbei fixen**.
- **`freezeProgress` bewusst DEFERRED** — nur Feedback, kein Progress-/Recorder-Freeze.
- Fremder WIP im Tree (inkl. bündelbarer Diff `features/tracking/hooks/useTrackVoiceGuidance.ts`) — **nicht anfassen**.

## Important context
- **NICHT erneut bauen:** zweite Track-Sync-Queue · zweite Off-Track-State-Machine · zweite Winkel-Erkennung ·
  separater Run-Sync-Stack · Search-Points zusätzlich remote in `track_points` replizieren (kanonisch ist
  `track_runs.run_points`).
- Architektur: **SQLite = durable local truth**, **Sync-Queue = einziger Remote-Transport** nach lokaler Finalisierung,
  **clientUuid = `training_sessions.id`**, **runUuid = `track_runs.id`**, Remote-Sync **idempotent** (Upsert onConflict:id +
  Replace-by-session), **Remote ist NIE die Save-Erfolgsschwelle**, Navigation wartet nicht auf Remote-Sync.
- `AGENTS.md` + `docs/agent/*` sind die gemeinsame Wahrheit (Handoff Claude Code ↔ Codex).

## Do not touch
- Der gesamte vorbestehende fremde WIP (Produkt-/Tracking-/i18n-WIP, SQL-Dumps, Artefakte, Screenshots, `dist-*`,
  Workspaces, ZIPs, `.opencode/`) — inkl. `features/tracking/hooks/useTrackVoiceGuidance.ts`.
- **T-57 ist committed:** `app/trainer/index.tsx` in `0e7aaba`; nicht ohne neuen, klar abgegrenzten Auftrag verändern.
- **Keine Production-DB-Schreiboperation** (NEWBIE-Quota-Migration inkl.) ohne ausdrückliche Freigabe.
- Keine pauschalen Git-Aktionen (`git add .`, reset, clean, checkout fremder Dateien); kein Push/Build/OTA/Store-Submit ohne Freigabe.
- Den AUTO-GENERATED-Block nie händisch editieren (nur via `agent:handoff`).

## Next recommended step
1. **NEWBIE-Quota:** Entscheidung des Nutzers einholen — da Production bereits training=2 liefert, ist die Migration
   **nicht nötig**; optionales idempotentes Festschreiben nur nach Freigabe. `20260808120000` (→1) **nicht** anwenden.
2. **Trainer-Keyboard-Fix real-device testen** (iOS + Galaxy S23 Gesten- und Drei-Button-Navigation): „Trainer
   verbinden → Code eingeben", Sheet über Tastatur sichtbar, getippte Zeichen + CTA sichtbar, Keyboard schließen,
   Backdrop-Tap bei offenem Keyboard, mehrfaches Öffnen/Schließen, kleine Displayhöhe/vergrößerte Schrift sowie
   gültiger/ungültiger Codefluss.
3. **T-56 Real-Device-Test** Confidence-/Render-Fix auf echten Geräten (iOS **und** Android): solide Mint-Fährte,
   Auto-Winkel (90°/Spitz L+R) sichtbar + Voice/Haptik, Schlangenlinie → 0 Winkel, 1/5/10-m-Stichprobe, kurzer Off-Track.
2. Bei Feldbeleg zur Auto-Erkennung optional die vorbereitete **DEV-Diagnostik** (`angleDiagnostics.ts`) für **eine**
   Fährte aktivieren (accept/pending/reject + Confidence + Accuracy) — danach wieder entfernen.
3. **T-24 Store/Release-Monitoring** (OTA-Zustellung realer Geräte) · **T-22 Website deployen** · **T-21 Dirty-Tree/
   Release-Branch-Strategie** (fremder WIP unangetastet).

## Relevant files (diese Session 2026-08-17)
- **Keyboard-Fix (committed `0e7aaba`):** `app/trainer/index.tsx` (Bottom-Sheet „Code eingeben").
- **NEWBIE-Quota (Repo, keine Ausführung):** `supabase/migrations/20260816130000_newbie_training_quota_two.sql` (No-Op),
  `20260808120000_newbie_training_quota_one.sql` (→1, nicht isoliert anwenden), `SUBSCRIPTION_NEWBIE_QUOTAS_SETUP.sql`,
  `features/subscription/plans.ts` (`NEWBIE_QUOTA = { dog:1, training:2, track:0 }`), `SUBSCRIPTION_P0_DB_DEPLOYMENT.md`.

## Relevant files (Render- + Confidence-Fix `fddd1f1`)
- Render: `features/tracking/components/TrackingMap.tsx`, `features/tracking/utils/trackSegments.ts` (`laidTrackStroke`).
- Confidence: `features/tracking/utils/autoCornerDetection.ts` (+ `angleDiagnostics.ts` DEV-only, nicht verdrahtet).
- Tests: `features/tracking/utils/__tests__/{laidTrackStroke,cornerConfidence}.test.ts`,
  `features/tracking/__tests__/searchGuidancePipeline.test.ts`, `features/tracking/utils/__tests__/autoCornerDetection.test.ts`.
- Konsument (unverändert): `app/track/run.tsx`, `features/tracking/hooks/{useTrackVoiceGuidance,useTrackHapticGuidance,useTrackRecorder}.ts`.

## Open questions
- NEWBIE-Quota: Will der Nutzer die No-Op-Migration trotzdem idempotent festschreiben, oder Production so belassen (empfohlen)?
- Trainer-Keyboard-Fix: Real-Device-Abnahme iOS/Android noch offen; bei Abweichung zuerst reproduzierbaren Beleg
  und minimale Korrektur festlegen.
- Justieren einzelne Feld-Fährten die Confidence-Gewichte/Schwellen? Nur mit Regressionstests + Feldbeleg.
- Wann/ob der Web-Bundle-Bruch (`react-native-maps`) separat behoben wird (kein Mobile-Blocker).
