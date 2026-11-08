# ANYVO — Build- und Release-Geschichte

Teil der zentralen Projektübergabe (2026-11-08, T-181). Verwandt:
[Produktkontext](ANYVO_PRODUCT_CONTEXT.md) ·
[Architektur](ANYVO_ARCHITECTURE_AND_CRITICAL_AREAS.md) ·
[Zusammenarbeit](ANYVO_COLLABORATION_RULES.md) ·
[Repository-Inventur](REPOSITORY_INVENTORY.md) ·
[Production-Quellen-Audit](PRODUCTION_SOURCE_AUDIT_2026-11-08.md).

**Kennzeichnung:**
- **[B]** bestätigt am 2026-11-08 (Git oder EAS)
- **[N]** Nutzerangabe aus der Projektgeschichte
- **[H]** historische Doku (z. B. `anyvo-main/docs/agent/BUILD59_CONTENT_AUDIT.md`, MASTER_STATUS)
- **[O]** offen

**Quelle der Wahrheit für „was läuft“:** EAS, frisch gelesen. Für den Code:
GitHub `dogbossvibes/CarniFlow`. MASTER_STATUS (letzter Eintrag 2026-11-01)
bildet die Veröffentlichungen ab dem 03.11. nicht ab [B].

## 1. Leitentscheidungen

1. **iOS Build 57 ist die Funktionsreferenz** [N]. Er läuft bei Kunden gut und darf
   nicht durch einen älteren Stand ersetzt werden.
2. **Build 59** war ein SDK-58-Kandidat mit zusätzlichen Funktionsänderungen [N].
   Diese Änderungen werden nicht ungeprüft als Teil der SDK-Migration übernommen.
3. **Build 60** ist die SDK-58-Migration auf Basis von Build 57 [N], Version 1.0.8,
   Branch `upgrade/sdk58-ios60-from57-20261105`, Worktree
   `~/canisflow-worktrees/anyvo-sdk58-ios60-from57-20261105` [B].
4. Die SDK-Migration und neue Funktionen sind getrennte Aufgaben [N].

## 2. iOS-Builds

| Build | App-Version | Runtime | EAS-Build | Quell-Commit | Bezug | Status |
|---|---|---|---|---|---|---|
| 57 | 1.0.4 laut EAS-Metadaten; „1.0.6 veröffentlicht“ laut [H] BUILD59/SDK58_CUSTOMER_PATH | `1.0.6-map49-v1` | `442f7bc3-…` (2026-10-29, Profil `ios49-map-repair`) [B] | `17443616` (auf GitHub) [B] | SDK 54, Kundenreferenz [N] | Store-Status [O]; App-Version-Widerspruch [O] |
| 58 | 1.0.6 (58) | SDK58-QA | – | `6722b88f` (nur lokal, jetzt im Bundle) [B] | SDK-58-Kompatibilitätsnachweis | Upload abgewiesen (geschlossene Version) [H] |
| 59 | 1.0.7 (59) | `sdk58-customer-ios-v1` | `4346505a-…` (2026-11-04, Profil `sdk58-customer-ios`) [B] | `00376126` (**nur lokal**, im Bundle) [B] | SDK 58, eigene Linie ab `c4afb5a8` mit Zusatzänderungen [N][B] | TestFlight [H]; Absturz beim Fährtenabschluss ungeklärt [H: release-policy.json] [O] |
| 60 | 1.0.8 (60) | `1.0.8-sdk58-v1` | `3b15fc9c-…` (2026-11-06, Profil `sdk58-testflight-60`) [B] | `3858c0ff` (auf GitHub) [B] | SDK 58 auf Basis der Build-57-Linie [B] | TestFlight-Upload dokumentiert (`1dcdf213`) [H]; Store-Freigabe [O] |

### Prüfung „Build 60 basiert auf Build 57“ [B]

- `17443616` (Build 57) und `3d21d664` (letzter Build-57-OTA-Stand am 03.11.)
  sind Vorfahren von `3858c0ff` (Build 60).
- Build 60 = `3d21d664` + `dbb23a7f` „Migrate ANYVO to Expo SDK 58 for ios60“
  + `3858c0ff` RevenueCat-Bump für Xcode 27.
- Keiner der fünf Commits der Build-59-Linie (`d20b135b` bis `bf0725d7`) ist als
  gleicher Patch in der Build-60-Linie enthalten. **Die Linien sind getrennt.**
- Die Migration `dbb23a7f` ändert 69 Dateien. Die Tracking-Recorder
  (`useTrackRecorder.ts`, `useSearchRecorder.ts`) und `anyvo-precision-location`
  bekommen dabei nur Typ-Anpassungen (`AppState.currentState as string`).
  Eine vollständige Feldabnahme der Fährte auf SDK 58 ist **nicht** belegt [O].

### Funktionsänderungen auf der Build-60-Runtime (per OTA)

- `3e9d5b3b-…` (2026-11-07 10:27 UTC) „feat(training): neue Trainingsübersicht“,
  Quelle `50548db0` [B].
- `431d93e2-…` (2026-11-07 16:26 UTC) „fix(i18n): Fährten-Label“, Quelle `3bb78943` [B].
- Damit enthält die Build-60-Runtime eine Funktionsänderung über Build 57 hinaus,
  den Trainings-Tab. Sie wurde als eigene Aufgabe entwickelt
  (`release/ios60-training-ui-20261106`, PR #16) [B].
- **Von der Nutzerin am 2026-11-08 als gewollte, freigegebene Funktionsauslieferung
  bestätigt.** Das widerspricht der Trennregel nicht: Die SDK-Migration (Build 60
  nativ) und die Trainingsübersicht (eigener Task, eigenes OTA) waren getrennte
  Aufgaben mit eigener Freigabe.
- Veröffentlichter Stand auf EAS für die Runtime `1.0.8-sdk58-v1` = Build-57-Funktionsumfang
  + Trainingsübersicht + Fährten-Label [B: EAS]. **Das ist der Stand auf dem Server,
  nicht der belegte Stand auf Geräten.**
- **Geräteempfang nicht belegt, Gegenbeleg vorhanden [B: Issue #15, 2026-11-07]:** Der
  Feldtest-Export `qa-ffde8561` vom 2026-11-07 (rund 1 h nach dem Trainings-OTA) meldet auf
  dem iPhone mit Build 60 `launch=embedded`, `updateId=null`. Das Gerät lief also mit dem
  im Build eingebetteten Stand, nicht mit dem OTA. Ursache offen (z. B. noch kein zweiter
  Kaltstart, Download- oder Startfehler). Ob das spätere Fährten-Label-OTA angekommen
  ist, ist ebenfalls nicht belegt [O].
- Herkunft der drei iOS-OTAs vom 2026-11-07: veröffentlicht über das Konto
  `dog.boss.vibes` aus Worktrees, in denen OpenCode arbeitete. Die Exporte in `dist/`
  entstanden 20–30 s vor den Veröffentlichungszeiten in EAS [B: Dateizeitstempel].
  Ein Release-Protokoll im Repo fehlt; der Release-Wrapper hinterlässt keinen dauerhaften Beleg [O].

### Build-59-Inhalt [H: BUILD59_CONTENT_AUDIT, 2026-11-04]

- Enthält SDK 58, die OTA-Aktivierung und die Übernahmen T174/T177/T178.
- Enthält **nicht** das am 24.10. für iOS55 veröffentlichte Trainings-Hub-Paket `d67773be`.
- Die 11 uncommitteten Dateien im Worktree `anyvo-sdk58-ios-20261103` entsprechen
  inhaltlich diesem nachzuholenden Paket. `ApportierholzIcon.tsx` ist bytegleich mit
  `d67773be` [B], der Rest weicht davon ab [B]. Sie sind nicht live [B: Zeitstempel und Guard].

## 3. Laufende Production-Runtimes (EAS, Channel `production` → Branch `production`) [B]

| Plattform | Runtime | nativer Build | aktuelles Update (Group) | Datum UTC | Quelle | GitHub |
|---|---|---|---|---|---|---|
| iOS | `1.0.6-map49-v1` (Build 57) | 1.0.4 (57) `442f7bc3` | `94a765b6-f504-4d8f-abc9-f3d39c93c37d` | 2026-11-07 16:29 | `d11fcb37` | ja |
| iOS | `1.0.8-sdk58-v1` (Build 60) | 1.0.8 (60) `3b15fc9c` | `431d93e2-e3f1-4d17-a81c-e53fb97d11ab` | 2026-11-07 16:26 | `3bb78943` | ja |
| iOS | `sdk58-customer-ios-v1` (Build 59) | 1.0.7 (59) `4346505a` | `574f82ad-cd28-43af-a1a0-76c434503099` | 2026-11-04 07:02 | `bf0725d7` | **nein** (lokales Bundle vorhanden) |
| Android | `1.0.5-gnss-v1` | 1.0.5 (50) `13d80093` | `6b52516b-399f-458a-b225-56451eae8c5c` | 2026-11-03 20:15 | `21c04eee` | ja |
| Android | `1.0.5-greeting-v1` | 1.0.5 (49) `008a9051` | `765ff6a8-2e47-4ee8-b357-b0e3d2d912c9` | 2026-11-03 20:06 | `da715fc7` | ja |

Keine dieser Quellen ist in `main` enthalten [B].

## 4. Abgleich des dokumentierten Kunden-OTA-Stands [N] mit EAS [B]

| Angabe [N] | Befund [B] |
|---|---|
| Runtime `1.0.6-map49-v1` | identisch: Build-57-Runtime |
| „Update-ID“ `328c64f6-c150-4ed6-8afe-6c81c33a3038` | ist die **Update-Group-ID**, iOS-Update-ID `01a1a2fe-9932-741d-b295-fc5d201641ce`, veröffentlicht 2026-11-03 19:59 UTC, Nachricht „Große Schrift: Startseite und Kalenderkopf ohne Überlagerung“ |
| Quelle `3d21d664` | stimmt, auf GitHub vorhanden |
| aktueller Stand? | **Nein, abgelöst.** Am 2026-11-07 16:29 UTC folgte `94a765b6` aus `d11fcb37`. Das ist genau ein Commit nach `3d21d664` („Fährten-Label“, nur `i18n/de-CH.ts` und `i18n/gsw-CH.ts`) |

Bewertung: **kein Widerspruch.** Die Angaben beschreiben ein älteres Update derselben
Runtime. Das ist auch nicht der Stand der Runtime von `bf0725d7`, die eine andere
ist (Build 59). Für 1.0.6-map49-v1 sind insgesamt 17 Production-Updates belegt.

## 5. Offene Punkte

1. Store-Stände (App Store Connect, Play Console). Unklar ist, welche Builds öffentlich
   sind und welche nur TestFlight.
2. App-Version von Build 57: 1.0.4 (EAS) oder 1.0.6 (Doku).
3. Nutzung je Runtime (Update-Insights). Unklar ist, ob Build 59 überhaupt
   Kunden-Installationen hat.
4. Build 59: Absturz beim Fährtenabschluss und OTA-Empfang [H].
5. ~~Freigabe der Trainingsübersicht auf Build 60~~: erledigt, am 2026-11-08 als gewollt bestätigt.
   Offen bleibt die Geräteabnahme der Trainingsübersicht auf Build 60.
6. Vollständige Inventur nach `anyvo-main/docs/agent/RELEASE_COMPLETENESS.md`
   (`release-policy.json`: `complete: false`) [H].
7. Rückführung der Release-Linien in `main` (siehe Audit, Abschnitt 5D).
