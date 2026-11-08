# ANYVO — Production-Quellen-Audit (2026-11-08)

Erhoben durch Claude (T-181), ausschliesslich lesend. Verwendet wurden
`git show|diff|log|patch-id|hash-object` (ohne `-w`) mit `GIT_OPTIONAL_LOCKS=0`,
lesende `eas update:list|view`, `eas channel:view` und `eas build:list` sowie `gh` nur
mit GET. Kein Commit, Push, Branch, Stash, Merge, keine Datei im fremden Worktree
geändert, keine EAS-, Store-, Supabase- oder RevenueCat-Änderung.

> Öffentliche Fassung (Review 2026-11-08): Lokale Pfade sind durch Platzhalter ersetzt
> (`<Codex-Projektordner>`, `<lokaler Backup-Ordner>`). Die ungekürzte Fassung liegt nur
> lokal beim Integrator (`~/ANYVO_BACKUPS/2026-11-08-claude-uebernahme/t181-lokal/`).

## Ergebnis vorab

**`bf0725d7` ist nach diesem Audit als öffentlicher Backup-Branch geeignet,
mit Auflagen** (Abschnitt 5).
- Er enthält keine Secrets und keine echten Personendaten.
- Was er an Kennungen enthält, ist auf GitHub bereits öffentlich oder unkritisch.
- Gesichert werden darf **nur der Commit**, nicht die 11 lokalen Dateien.

## 1. Commit `bf0725d7` und was ein Backup tatsächlich veröffentlicht

| Feld | Wert |
|---|---|
| Commit | `bf0725d77c1372bc53a7cdcf276d85aa54206a79` |
| Parent | `91274c441f89a48a3a572b8885524b05bbeb88c8` |
| Betreff | `fix(training): keep swipeable unit cards opaque` (2026-11-04 07:50 +0100) |
| Inhalt gegenüber Parent | 2 Dateien: `components/training/UnitListCard.tsx` (+1/−5 effektiv), `components/training/__tests__/UnitListCard.test.tsx` (+65, synthetische Testdaten) |
| Branch / Worktree | `upgrade/sdk58-ios-20261103` in `<Codex-Projektordner>/anyvo-sdk58-ios-20261103` (HEAD = `bf0725d7`) |

**Ein Backup veröffentlicht nicht nur diesen einen Commit.** Auf GitHub liegt
bisher nur die Basis `c4afb5a8`, und zwar auf `release/source-c4afb5a817e7` und
sechs weiteren Branches. Ein Push macht deshalb **fünf** bisher nur lokale Commits
öffentlich:

| Commit | Betreff | Umfang |
|---|---|---|
| `d20b135b` | chore(ios): prepare and harden isolated Expo SDK 58 candidate | 243 Dateien (u. a. `package.json`, `package-lock.json`, App-/Feature-Code, Tests, Release-Skripte, `AGENTS.md`, `docs/SDK58_TEST_OTA.md`) |
| `6722b88f` | fix(ios): use RevenueCat Xcode 27 compilation fix | 3 (`package*.json`, `docs/agent/tasks/T-175.md`) |
| `00376126` | feat(release): prepare SDK58 iOS 1.0.7 customer OTA profile | 8 (`app.config.js`, `eas.json`, `scripts/update-production.mjs`, Tests, `docs/agent/SDK58_CUSTOMER_PATH.md`) |
| `91274c44` | fix(release): compare captured sensitive customer environment values | 2 (`scripts/update-production.mjs`, Test) |
| `bf0725d7` | fix(training): keep swipeable unit cards opaque | 2 |

Zusammen sind das 248 Dateien (39 neu, 209 geändert), keine gelöscht. Nach Bereich:
`features/` 89, `app/` 62, `components/` 48, `hooks/` 18, `scripts/` 16,
Doku 3, Konfiguration 6.
`00376126` ist zugleich der Quell-Commit des nativen iOS-Builds 1.0.7 (59)
(siehe Abschnitt 3); auch er liegt bisher nicht auf GitHub.

## 2. Prüfung auf Secrets, Personendaten und vertrauliche Evidenz

**Vorgehen:**
- Dateinamen-Prüfung und Musterprüfung aller 4882 hinzugefügten Zeilen
  (`package-lock.json` getrennt).
- Gesucht wurde nach: JWT/Supabase-Keys, Private Keys, Stripe-/RevenueCat-/
  GitHub-/Supabase-/AWS-Token, Zuweisungen der Form `secret|password|api_key|token = "…"`,
  E-Mail-Adressen, Telefonnummern, IBAN, UUIDs, Koordinaten, lokale Pfade,
  `.env`/Schlüssel-/Service-Account-/Evidenz-/Log-/CSV-Dateien.
- Die drei Doku-Dateien, `eas.json`, `app.config.js` und die Release-Skript-Änderungen
  habe ich manuell gelesen.

| Fund | Bewertung |
|---|---|
| Secrets, Schlüssel, Token, Passwörter | **keine** gefunden |
| `.env`, Service-Accounts, Schlüssel, `*-PRIVATE*`, Logs, CSV, Evidenz-JSON | **keine** im Commit-Bereich |
| E-Mail im Code | nur `synthetic@example.invalid` (Testfixture) |
| Testdaten | synthetisch (`synthetic-unit`, `synthetic-owner`, `synthetic-dog`) |
| Production-Supabase-Projekt-Ref `axkkhyqrjrtbkumaulta` (URL, kein Key) | bereits in 18 Dateien auf GitHub-`main` öffentlich; zudem in jeder App-Auslieferung enthalten |
| EAS-Projekt-ID `e6475526-…` | bereits öffentlich in `app.json` auf `main` |
| EAS-Build-ID `442f7bc3-…` (Test-Erwartung) | interne Kennung ohne Zugriffswirkung |
| Build-ID `225c3dbf-…` und Chat-/Owner-ID `01a1182a-…` in `T-175.md` | interne Kennungen ohne Zugriffswirkung; gleichartige IDs stehen schon in `AGENTS.md` auf `main` |
| Autor-E-Mail in den Commit-Metadaten | bereits in 462 Commits auf `main` öffentlich, keine neue Offenlegung |
| `package-lock.json` | 982 neue `resolved`-URLs, alle `registry.npmjs.org`; keine Auth-Token |
| Verweise auf `../outputs/…` | nur Pfadangaben, die Evidenzdateien selbst sind nicht enthalten |
| `scripts/update-production.mjs` mit `eas env:list … --include-sensitive` | liest geschützte EAS-Werte nur zur Laufzeit und gibt nur Variablennamen aus (`Customer environment mismatch: <KEY>`). Kein Wert im Repo. Hinweis für ein späteres Code-Review: sensible Werte im Prozessspeicher |
| Interne Prozessdoku (`T-175.md`, `SDK58_CUSTOMER_PATH.md`, `SDK58_TEST_OTA.md`) | geben Arbeitsweise, Versions- und Build-Planung sowie Store-Status preis. Nicht vertraulich im Sinne von Zugangsdaten, aber öffentlich lesbar, weil `CarniFlow` öffentlich ist |

**Grenze:** Eine Musterprüfung ist kein vollständiger Beweis. Den grossen Commit
`d20b135b` (243 Dateien) habe ich gescannt, aber nicht Zeile für Zeile manuell
gelesen. Ein dedizierter Secret-Scanner (z. B. gitleaks) ist lokal nicht installiert.

## 3. Die 11 lokalen Dateien im Worktree (nicht Teil des Commits)

| Datei | Status | in irgendeinem Commit vorhanden? |
|---|---|---|
| `app/(tabs)/training.tsx` | geändert (Trainings-Hub neu gestaltet, Accessibility-Labels, grössere Touch-Ziele) | nein |
| `components/training/SwipeableTrainingItem.tsx` | geändert (Lösch-Aktion mit animierter Deckkraft) | nein |
| `components/training/__tests__/UnitListCard.test.tsx` | geändert (Mock reicht `progress` durch) | nein |
| `components/ui/ApportierholzIcon.tsx` | geändert (neue Icon-Silhouette) | ja, identischer Blob in `d67773be` (Codex-Klon) |
| `i18n/de-CH.ts`, `i18n/gsw-CH.ts`, `i18n/locales/{en,fr,it}.ts` | geändert (`training.timerHint`, „Fährten“-Label) | nein |
| `app/(tabs)/__tests__/training-compact-hub.test.tsx` | unversioniert | nein |
| `components/training/__tests__/SwipeableTrainingItem.test.tsx` | unversioniert | nein |

**Bestätigte Fakten:**
- Die Änderungen betreffen nur UI, Texte und Tests. Es gibt keine Secrets und keine
  Personendaten, weder Tracking- noch Datenbank- noch Abo-Logik.
- Bearbeitet wurden die Dateien am **2026-11-04 zwischen 21:16 und 21:20 Uhr**
  (Dateizeit). Der Publish der Runtime `sdk58-customer-ios-v1` war am
  **2026-11-04 um 08:02 Uhr** Ortszeit (07:02 UTC).
- Der Release-Wrapper an diesem Stand blockiert bei einem nicht sauberen Worktree
  (`evaluatePublishGuards`: „Worktree nicht sauber …“).
- Die Dateien unterscheiden sich vom live laufenden iOS60-Stand `3bb78943`
  (z. B. `training.tsx` 16 Zeilen, `SwipeableTrainingItem.tsx` 45 Zeilen).

**Schlussfolgerung (nicht direkt belegbar, EAS speichert kein Dirty-Flag):**
Das live ausgelieferte Bundle entspricht dem sauberen Commit `bf0725d7`. Die
11 Dateien sind ein späterer, unveröffentlichter Entwurf. Er ähnelt der
Trainingsübersicht, die auf der iOS60-Linie neu umgesetzt wurde, ist aber nicht
identisch mit ihr.

## 4. Laufende Production-Runtimes (frisch aus EAS, 2026-11-08)

Der Channel `production` zeigt auf genau einen EAS-Branch (`production`). Für jede
Runtime ist hier das neueste Update auf diesem Branch aufgeführt.

| Plattform | Runtime | nativer Build (EAS-Metadaten) | Build-Commit | letztes OTA (UTC) | Update-Group | OTA-Quell-Commit | Quelle auf GitHub |
|---|---|---|---|---|---|---|---|
| iOS | `1.0.6-map49-v1` | 1.0.4 (57), `442f7bc3`, Profil `ios49-map-repair`, 2026-10-29 | `17443616` (auf GitHub) | 2026-11-07 16:29 | `94a765b6-f504-4d8f-abc9-f3d39c93c37d` | `d11fcb37…` | ja: `fix/ios57-faehrten-label-20261107` |
| iOS | `1.0.8-sdk58-v1` | 1.0.8 (60), `3b15fc9c`, Profil `sdk58-testflight-60`, 2026-11-06 | `3858c0ff` (auf GitHub) | 2026-11-07 16:26 | `431d93e2-e3f1-4d17-a81c-e53fb97d11ab` | `3bb78943…` | ja: `fix/ios60-faehrten-label-20261107` |
| iOS | `sdk58-customer-ios-v1` | 1.0.7 (59), `4346505a`, Profil `sdk58-customer-ios`, 2026-11-04 | `00376126` (**nur lokal**) | 2026-11-04 07:02 | `574f82ad-cd28-43af-a1a0-76c434503099` | `bf0725d7…` | **nein** |
| Android | `1.0.5-gnss-v1` | 1.0.5 (50), `13d80093`, Profil `android50-gnss`, 2026-10-29 | `c4649ad5` (auf GitHub) | 2026-11-03 20:15 | `6b52516b-399f-458a-b225-56451eae8c5c` | `21c04eee…` | ja: `release/source-21c04eee535a` |
| Android | `1.0.5-greeting-v1` | 1.0.5 (49), `008a9051`, Profil `production`, 2026-10-22 | `f2ed8d78` (auf GitHub) | 2026-11-03 20:06 | `765ff6a8-2e47-4ee8-b357-b0e3d2d912c9` | `da715fc7…` | ja: `release/source-da715fc7c558` |

Keine der fünf Quellen ist in `main` enthalten.

**Fehlend oder nicht verifiziert:**
- Ob und wie viele Nutzer jede Runtime tatsächlich ausführen
  (Update-Insights nicht abgefragt).
- Store-/TestFlight-Status der Builds: App Store Connect und Play Console sind
  nicht erreichbar.
- **Widerspruch:** EAS meldet für Build 57 die App-Version 1.0.4, die Doku im
  Commit nennt „1.0.6 (57) veröffentlicht“. Den Store-Stand prüfen.
- Ob ältere Runtimes ausserhalb dieser fünf noch Nutzer haben.
- Ein Dirty-Flag beim Publish (siehe Abschnitt 3).

## 5. Sicherungsstrategie (Vorschlag, nichts ausgeführt)

**A. Lokales Backup: AUSGEFÜHRT am 2026-11-08, 04:29.**
- Datei: `<lokaler Backup-Ordner>/anyvo-production-source_2026-11-08_bf0725d77c13_sdk58-customer-ios-v1.bundle`
  (242160 Bytes, SHA-256 `6369ba5f34dd6b499d40ec456e1a20616d0f1db5937785e2a43794bc265dee6a`, Rechte 600).
  Ein Manifest liegt daneben (`….MANIFEST.md`).
- Ref `refs/heads/upgrade/sdk58-ios-20261103` → `bf0725d7`, Voraussetzung `c4afb5a8`.
- `git bundle verify` meldet okay.
- Wiederherstellung in einem frischen Bare-Klon von GitHub: alle 5 Commits vorhanden,
  `git fsck` sauber, Trees aller 5 Commits identisch.
- Lokale Repos und Worktrees unverändert: 476 Worktrees, 552 Branches,
  der Ziel-Worktree weiter mit 9 geänderten / 2 unversionierten Dateien.

Ursprünglicher Vorschlag (schreibt nur Dateien ausserhalb der Repos):
```bash
mkdir -p ~/anyvo-backups/2026-11-08
git -C ~/canisflow/canisflow bundle create <lokaler Backup-Ordner>/bf0725d7-line.bundle c4afb5a817e7c58b5c93e6b76a7ec04e5d8ce179..bf0725d77c1372bc53a7cdcf276d85aa54206a79
git -C ~/canisflow/canisflow bundle verify <lokaler Backup-Ordner>/bf0725d7-line.bundle
```

**B. GitHub-Backup des Commits** (benötigt eine ausdrückliche Push-Freigabe).
Es folgt der bestehenden Namenskonvention `release/source-<12 Zeichen SHA>`, legt
keinen lokalen Branch an und lässt den Worktree unberührt:
```bash
git -C ~/canisflow/canisflow push origin bf0725d77c1372bc53a7cdcf276d85aa54206a79:refs/heads/release/source-bf0725d77c13
```
Auflagen:
- Veröffentlicht werden die fünf Commits aus Abschnitt 1, nicht mehr.
- Die 11 lokalen Dateien werden nicht übertragen.
- Vorher optional gitleaks über `c4afb5a8..bf0725d7` laufen lassen.
- Danach prüfen, dass `gh api repos/dogbossvibes/CarniFlow/branches/release/source-bf0725d77c13`
  den SHA `bf0725d7…` liefert.
- Optional einen Branch-Schutz gegen Löschen setzen (GitHub-Einstellung, Nutzerfreigabe).

**C. Lokale Zusatzänderungen sichern, ohne sie zu veröffentlichen.** Die Dateien
gehören zur Codex-Werkstatt (Owner `01a1182a-…` laut T-175). Zuerst den Owner fragen.
Falls eine Sicherung gewünscht ist, nur als Kopie ausserhalb des Repos (lesend für
den Worktree):
```bash
mkdir -p <lokaler Backup-Ordner>/sdk58-ios-wip
git -C <Codex-Projektordner>/anyvo-sdk58-ios-20261103 diff > <lokaler Backup-Ordner>/sdk58-ios-wip/tracked.patch
```
Dazu die beiden unversionierten Testdateien per `cp` in denselben Ordner. Kein
`git stash`, `git add` oder Push.

**D. Rückführung in eine nachvollziehbare Git-Historie:**
1. Je Production-Runtime einen unveränderlichen Ref `release/source-<sha>` auf GitHub
   (vorhanden für 4 von 5; mit B vollständig). Ergänzend dasselbe für den nativen
   Build-Commit `00376126` (bereits Vorfahre von `bf0725d7`, wird mit B ebenfalls öffentlich).
2. Eine Zuordnungstabelle Runtime → Build → OTA → Commit pflegen (Abschnitt 4).
   Fortschreiben durch den Integrator in MASTER_STATUS; deren letzter Stand ist vom 2026-11-01.
3. **Produktentscheidung:** Es gibt zwei getrennte SDK58-iOS-Linien,
   `sdk58-customer-ios-v1` (1.0.7) und `1.0.8-sdk58-v1` (iOS60).
   - Sie haben die Basis `c4afb5a8` gemeinsam. Keiner der fünf Commits aus Abschnitt 1
     ist als gleicher Patch in der iOS60-Linie enthalten.
   - Zu entscheiden ist, welche Linie weitergeführt wird. Die 1.0.7-Linie wird dann
     nur konserviert.
   - Fixes wie „opaque cards“ müssen bei Bedarf gezielt übertragen werden.
4. **Integration in `main`:** erst nach dieser Entscheidung, als eigener reviewter PR
   je Linie (SDK54 → SDK58 ist ein nativer Bruch für `main`). Kein Merge ohne Freigabe.

## 6. Risiken

- **Hoch:**
  - Die Quelle einer laufenden Production-Runtime und ihres nativen Builds existiert
    nur in einem lokalen Codex-Worktree.
  - Bei Verlust (Aufräumen, `git worktree remove`, Plattendefekt) wäre der
    ausgelieferte Stand nicht mehr reproduzierbar und Hotfixes für 1.0.7 wären kaum
    möglich.
- **Mittel:**
  - Fünf parallele Runtimes ohne Integration in `main` erhöhen das Regressionsrisiko
    bei jedem weiteren OTA.
  - MASTER_STATUS ist veraltet.
- **Mittel:**
  - Das öffentliche Repository macht interne Prozess- und Release-Doku sichtbar.
  - Das ist bisher schon gängige Praxis, aber bei jedem Push mitzudenken.
- **Niedrig:**
  - Das Backup aus B enthält keine erkennbaren Secrets oder Personendaten
    (Grenzen siehe Abschnitt 2).

## 7. Handlungsempfehlung

1. **Sofort:** A ausführen, das lokale Bundle. Es ist risikofrei und braucht keine
   GitHub-Freigabe.
2. **Danach mit Freigabe:** B ausführen. Ich empfehle das, weil kein Ausschlussgrund
   gefunden wurde.
3. Owner der Werkstatt (`01a1182a-…`) zu den 11 lokalen Dateien befragen, ggf. C.
4. Integrator: MASTER_STATUS mit Abschnitt 4 aktualisieren.
5. Produktentscheidung zu den beiden SDK58-iOS-Linien, danach Rückführungsplan (D3/D4).
6. Store-Stände (App Store Connect, Play Console) und Update-Insights je Runtime
   gegenprüfen.
