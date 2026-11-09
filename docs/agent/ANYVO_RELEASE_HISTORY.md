# ANYVO — Build- und Release-Geschichte

Teil der zentralen Projektübergabe (T-181), überarbeitet am **2026-11-09**. Verwandt:
[Master-Kontext](ANYVO_MASTER_CONTEXT.md) ·
[Produktkontext](ANYVO_PRODUCT_CONTEXT.md) ·
[Architektur](ANYVO_ARCHITECTURE_AND_CRITICAL_AREAS.md) ·
[Kundenprobleme](ANYVO_CUSTOMER_ISSUE_HISTORY.md) ·
[Verzeichniskarte](ANYVO_DIRECTORY_MAP.md) ·
[Production-Quellen-Audit](PRODUCTION_SOURCE_AUDIT_2026-11-08.md).

**Kennzeichnung:**
- **[B]** bestätigt (Git, EAS, Supabase; Datum steht dabei)
- **[N]** Nutzerangabe
- **[H]** historische Doku (z. B. `anyvo-main/docs/agent/BUILD59_CONTENT_AUDIT.md`, MASTER_STATUS)
- **[O]** offen

**Quelle der Wahrheit für „was läuft“:** EAS, frisch gelesen. Für den Code: GitHub
`dogbossvibes/CarniFlow`. MASTER_STATUS (letzter Eintrag 01.11.) bildet die
Veröffentlichungen ab dem 03.11. nicht ab [B].

## 0. Begriffe

| Begriff | Bedeutung | Wo nachsehen |
|---|---|---|
| Nativer Build | Binärdatei aus EAS Build: iOS `buildNumber` bzw. Android `versionCode`. **Getrennte Zählung je Plattform** | `eas build:list` |
| App-Version | Store-Version, z. B. 1.0.4. Mehrere Builds können sie teilen | EAS-Build-Metadaten, `app.json` |
| Runtime-Version | Schlüssel für OTA-Kompatibilität. Ein OTA erreicht nur Builds mit gleicher Runtime | EAS-Build und EAS-Update |
| EAS-Update (OTA) | JS-Bundle, Kanal `production` → Branch `production`. Ersetzt keinen nativen Code | `eas update:list --branch production` |
| Git-Commit | `gitCommitHash` eines Builds oder Updates | EAS-Metadaten, Git |
| Store-Veröffentlichung | Freigabe in App Store/Play. **Ein Build in EAS ist nicht automatisch im Store** | App Store Connect / Play Console, von Claude nicht erreichbar |

## 1. Leitentscheidungen [N]

1. **Build 49, 57 und 60 sind wichtige, funktionierende Referenz-Builds.**
2. **iOS Build 57 ist die Funktionsreferenz und Kundenbasis.** Er darf nicht durch einen
   älteren Stand ersetzt werden.
3. **Build 60** ist die SDK-58-Migration auf Basis von Build 57 (Version 1.0.8). Bewährte
   Funktionen bleiben erhalten.
4. **Build 59** ist eine zweite SDK-58-Linie (1.0.7) mit zusätzlichen Funktionsänderungen.
   59 und 60 werden nicht ungeprüft vermischt.
5. SDK-Migration und Funktionsentwicklung sind getrennte Aufgaben.

## 2. iOS-Builds und Abstammung [B: EAS `build:list` und Git, 2026-11-09]

| Build | Version | Runtime | Kanal | Profil | Commit | Datum (UTC) |
|---|---|---|---|---|---|---|
| 46–48 | 1.0.3 | `1.0.3` | production | production | `f50092e2`/`7892a7d3`/`6efcc592` | 26.–27.09. |
| **49** | **1.0.4** | `1.0.4` | production | production | `3f7c2e74` (in `main`) | 06.10. |
| 50 | 1.0.5 | `1.0.5` | production | native-widgets-ios | `465f2680` | 14.10. |
| 51 | 1.0.5 | `1.0.5` | production | production | `3f39e78f` | 15.10. |
| 52 | 1.0.5 | `1.0.5-motion-v2` | production | native-sensor-ios | `71632a68` | 17.10. |
| 53 | 1.0.5 | `1.0.5-motion-v3` | production | native-sensor-ios | `82786fdf` | 20.10. |
| 54 | 1.0.5 | `1.0.5-watch-v1` | native-widgets-qa | Watch-Test | `a26a562e` | 21.10. |
| 55 | 1.0.5 | `1.0.5-motion-v4` | production | native-sensor-ios | `d153e6cc` | 21.10. |
| 56 | 1.0.4 | `1.0.5-map49-v1` | production | ios49-map-repair | `e8a754f3` | 26.10. |
| **57** | **1.0.4** | `1.0.6-map49-v1` | production | ios49-map-repair | `17443616` | 29.10. |
| 58 | 1.0.6 | `sdk58-qa-ios-v1` | sdk58-test | sdk58-test-ios | `6722b88f` (nur lokal) | 04.11. |
| 59 | 1.0.7 | `sdk58-customer-ios-v1` | production | sdk58-customer-ios | `00376126` (**nur lokal**) | 04.11. |
| **60** | **1.0.8** | `1.0.8-sdk58-v1` | production | sdk58-testflight-60 | `3858c0ff` | 06.11. |

```
iOS 49 (3f7c2e74, SDK 54)
 ├─ 50 → 51 → 52 → 53 → 55   1.0.5-Linie (native Sensorik/Motion/Widgets), Seitenlinie
 └─ 56 (e8a754f3)  Kartenreparatur der 49er-Linie, Version wieder 1.0.4
     └─ 57 (17443616)  Kundenreferenz
         ├─ OTAs auf 57 bis c4afb5a8 (03.11.) gemeinsam für 59 und 60
         ├─ 59-Linie: c4afb5a8 → d20b135b SDK-58-Kandidat → 6722b88f → 00376126 → 91274c44 → bf0725d7
         └─ 60-Linie: c4afb5a8 → 708f3d65 → 3d21d664 → dbb23a7f SDK-58-Migration → 3858c0ff (Build 60)
                      → 343b1c94 Trainings-Tab … → 50548db0 → 3bb78943 (OTA 07.11.)
```

- 49 ist Vorfahr von 56, 57, 59 und 60. Die Builds **50–55 sind keine Vorfahren von 57** [B].
  Ob das Auslassen der 1.0.5-Sensorlinie gewollt war, ist offen [O].
- iOS 15.1 als Mindestversion: Der Commit von 49 bezieht sich darauf [B]. Für SDK 58
  (Build 60) ist das Deployment-Target nicht geprüft [O].

### Build 59 gegenüber Build 60 [B: `git log 17443616..`, 2026-11-09]

Gemeinsam bis `c4afb5a8` (03.11.). Danach:

| | Build-59-Linie (`bf0725d7`) | Build-60-Linie (`3bb78943`) |
|---|---|---|
| Enthält die letzten 57-OTAs `708f3d65` (Gesundheitsformulare, Medikamentenhistorie) und `3d21d664` (große Schrift: Startseite und Kalender)? | **nein** | ja |
| SDK-58-Migration | `d20b135b` „isolated Expo SDK 58 candidate“ | `dbb23a7f` „Migrate ANYVO to Expo SDK 58 for ios60“ |
| RevenueCat-Fix für Xcode 27 | `6722b88f` | `3858c0ff` |
| Training | „swipeable unit cards opaque“ (`bf0725d7`), Trainings-Unit-Karten | Timer-zentrierter Trainings-Tab (`343b1c94`) mit i18n-Fixes und Regressionstests |
| Release-Profil | Kunden-OTA-Profil 1.0.7 (`00376126`), Env-Vergleich (`91274c44`) | TestFlight-Profil 60 |
| Auf GitHub | **nein** (nur lokales Bundle) | ja |

Diff-Umfang ab 57: Linie 59 hat 431 Dateien, Linie 60 hat 293 Dateien. Zwischen den beiden
Linien liegen 252 Dateien. **Bekannt [H]:** Build 59 hatte einen Absturz beim
Fährtenabschluss, ungeklärt.

## 3. Android-Builds [B]

| Build | Version | Runtime | Kanal | Commit | Datum |
|---|---|---|---|---|---|
| ≤41 | 1.0.1 | `1.0.1` | production | div. | bis 23.09. |
| 42–44 | 1.0.3 | `1.0.3` | production | `5a0610b6` | 01.–02.10. |
| 45 | 1.0.4 | `1.0.4` | production | `3f44b1d2` | 08.10. |
| 47, 48 | 1.0.5 | `1.0.5` | production | `39964e1f`, `f0b050e4` | 18./22.10. |
| **49** | 1.0.5 | `1.0.5-greeting-v1` | production | `f2ed8d78` | 22.10. |
| **50** | 1.0.5 | `1.0.5-gnss-v1` | production | `c4649ad5` (Satelliten-Diagnose) | 29.10. |
| 51 | 1.0.6 | `sdk58-qa-android-v1` | sdk58-test | `5e9cd10a` | 04.11. |

**Achtung:** „Build 49“ kommt auf iOS und auf Android vor. Gemeint ist meist iOS 49 [O,
von der Nutzerin zu bestätigen].

## 4. Production-Runtimes und aktuelles OTA [B: `eas update:list --branch production`, 200 Updates, 2026-11-09]

**Mindestens 16 Runtimes** haben Production-Updates. Die „fünf Production-Runtimes“ vom
08.11. sind nur die zuletzt aktualisierten (fett markiert).

| Plattform | Runtime | Builds | Updates (≥) | letztes OTA (UTC) | Quell-Commit | GitHub |
|---|---|---|---|---|---|---|
| iOS | **`1.0.6-map49-v1`** | 57 | 17 | 07.11. 16:29, Gruppe `94a765b6` | `d11fcb37` | ja |
| iOS | **`1.0.8-sdk58-v1`** | 60 | 2 | 07.11. 16:26, Gruppe `431d93e2` | `3bb78943` | ja |
| iOS | **`sdk58-customer-ios-v1`** | 59 | 1 | 04.11. 07:02, Gruppe `574f82ad` | `bf0725d7` | **nein** |
| iOS | `1.0.5-map49-v1` | 56 | 4 | 29.10. 03:14 | `17443616` | ja |
| iOS | `1.0.5-motion-v4` | 55 | 31 | 29.10. 08:07 | `0e16001d` | ja |
| iOS | `1.0.5-motion-v3` | 53 | 7 | 29.10. 02:54 | `a4eb7ffe` | ja |
| iOS | `1.0.5-motion-v2` | 52 | 9 | 29.10. 02:58 | `6c304948` | ja |
| iOS | `1.0.5` | 50, 51 | 9 | 29.10. 02:50 | `67895981` | ja |
| iOS | `1.0.4` | 49 | 33 | 29.10. 02:46 | `936131a1` | ja |
| iOS | `1.0.3` | 46–48 | 3 | 10.10. 02:08 | `7a1bfbb4` | ja |
| Android | **`1.0.5-gnss-v1`** | 50 | 15 | 03.11. 20:15, Gruppe `6b52516b` | `21c04eee` | ja |
| Android | **`1.0.5-greeting-v1`** | 49 | 24 | 03.11. 20:06, Gruppe `765ff6a8` | `da715fc7` | ja |
| Android | `1.0.5` | 47, 48 | 13 | 29.10. 03:06 | `e2957bd8` | ja |
| Android | `1.0.4` | 45 | 25 | 29.10. 03:01 | `e0198c71` | ja |
| Android | `1.0.3` | 42–44 | 6 | 10.10. 05:36 | `2f513dbd` | ja |
| Android | `1.0.1` | ≤41 | 1 | 10.10. 05:40 | `6070f02c` | ja |

Ältere Updates jenseits der 200 gelesenen sind nicht erfasst [O].

- **Kein** Production-Quell-Commit liegt in `main` (`92ec7340`) [B].
- Nicht auf GitHub: `bf0725d7` und `00376126` (Linie 59). Sie sind gesichert in einem
  lokalen Bundle `~/anyvo-backups/2026-11-08/` und im Gesamt-Bundle vom 08.11. Die
  GitHub-Sicherung ist ein separater, freizugebender Auftrag.
- **Ob ein OTA auf den Geräten aktiv ist, ist nicht belegt.**
  - iOS 60 meldete am 07.11. rund 1 h nach dem Trainings-OTA `launch=embedded`,
    `updateId=null` [B: Issue #15].
  - Die Geräteverteilung je Runtime (EAS-Insights) ist nicht geprüft [O].

### OTA-Inhalt Build 60 [B]

- `3e9d5b3b` (07.11. 10:27 UTC): neue Trainingsübersicht, Quelle `50548db0`.
  Von der Nutzerin als gewollt bestätigt [N].
- `431d93e2` (07.11. 16:26 UTC): Fährten-Label, Quelle `3bb78943`.
- Herkunft der drei iOS-OTAs vom 07.11.: veröffentlicht über das Konto `dog.boss.vibes`
  aus Worktrees, in denen OpenCode arbeitete. Die `dist/`-Exporte entstanden 20–30 s vor
  den EAS-Zeitstempeln [B]. Ein Release-Protokoll fehlt [O].

## 5. Abgleich „Build-57-Quell-Commit“: `3d21d664` oder `d11fcb37`? [B]

**Beide Angaben stimmen, aber zu verschiedenen Zeitpunkten.**

- `3d21d664` war das Production-OTA vom 03.11. (19:59 UTC, iOS-Update `01a1a2fe…`, Gruppe
  `328c64f6…`; die frühere Angabe „Update-ID“ war die Gruppen-ID).
- Am 07.11. folgte `94a765b6` aus `d11fcb37`. Das ist genau ein Commit nach `3d21d664` und
  ändert nur `i18n/de-CH.ts` und `i18n/gsw-CH.ts` (Fährten-Label).
- Aktuell ist `d11fcb37`.

## 6. Backend-Stand zu den Releases [B: Supabase Production, nur lesend, 2026-11-09]

- Angewendete Migrationen: 32, die letzte ist `20261008170000`.
- **Drift:**
  - `20261008190000_internal_tracking_diagnostics_access.sql` liegt in allen
    Live-Quellen (57/59/60), ist aber **nicht** auf Production angewendet.
  - `20261006180000` liegt in `main`, ist aber nicht angewendet.
  - `20260825180000` und `20261005150000` sind angewendet, liegen aber nur auf
    Seitenbranches (`c4d7301a`, `2fff7f42`).
- Die Abo-Edge-Functions `subscription-sync` v5, `revenuecat-webhook` v9 und
  `revenuecat-webhook-google` v8 wurden am 28.10. deployed. Ihr Code und die
  DB-Funktionen `subscription_*_v1` liegen **in keinem Git-Stand** [B].
- NEWBIE-Fährtenquote auf Production: `newbie_quota_limit('track') = 1` [B].
- Alle Tabellen im Schema `public` haben RLS aktiv [B].

## 7. Was gesichert werden muss [O, jeweils separate Freigabe]

1. Linie 59 (`bf0725d7`, `00376126`) auf GitHub.
2. Code der deployten Abo-Edge-Functions und SQL der `subscription_*_v1`-Funktionen ins
   Repository.
3. Klärung der Migrations-Drift: Wird `20261008190000` gebraucht? Sollen die
   Seitenbranch-Migrationen nach `main`?
4. Rückführung der Production-Linien in `main` (Audit, Abschnitt 5D).

## 8. Offene Punkte

1. Store-Stände: Welche Builds sind öffentlich, welche nur TestFlight bzw. intern? Für
   Claude nicht erreichbar.
2. Geräteverteilung je Runtime: Welche alten Runtimes müssen weiter bedient werden?
3. Build 59: Absturz beim Fährtenabschluss und OTA-Empfang [H].
4. Build 60: OTA-Aktivierung auf Geräten (`launch=embedded`).
5. Deployment-Target iOS für SDK 58.
6. Vollständige Inventur nach `anyvo-main/docs/agent/RELEASE_COMPLETENESS.md`
   (`release-policy.json`: `complete: false`) [H].
