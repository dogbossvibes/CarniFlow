# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

# ANYVO – Arbeitsregeln (Kurzfassung, Stand 2026-11-10)

Ziel: schnell, klar und sicher arbeiten. Kleine, klare Aufgaben direkt umsetzen,
ohne Planungsdokumente, Rollenwechsel oder wiederholte Vollprüfungen.

## Ordner und Rollen

- **Einziger Arbeitsordner:** `/Users/moyo/canisflow/canisflow` (Branch `main`).
  Der äussere Ordner `/Users/moyo/canisflow` ist ein separates Expo-Starterprojekt.
- **MASTER** = Claude-Code-Sitzung in diesem Ordner mit Worktree-Häkchen **aus**.
  Einziger Writer für `docs/agent/ANYVO_MASTER_STATUS.md` und `docs/agent/ACTIVE_WORK.md`,
  einziger Publisher für Production-OTAs, pflegt das GitHub-Projekt
  „ANYVO – Produkt & Entwicklung“ und die Release-Karten. Arbeitet nur auf Anfrage:
  kein Heartbeat, keine Prüfschleifen ohne neuen Anlass.
- **Aufgaben-Sitzung** = Claude Code in diesem Ordner mit Worktree-Häkchen **an**
  (eigener Worktree unter `.claude/worktrees/`) oder Cloud-Sitzung.
  1 Aufgabe = 1 Branch = 1 PR. Ergebnis/Blocker im Issue oder PR melden.
  Keine OTA, kein Schreiben in MASTER_STATUS/ACTIVE_WORK.
- **Claude-Chat im Projekt ANYVO mit Werkzeugen** (Mac-Verbindung und/oder angebundenes
  Repo) gilt als Aufgaben-Sitzung:
  - Über GitHub (Cloud-Klon): Ein Änderungsauftrag der Nutzerin ist die Einzelfreigabe,
    ab frischem `origin/main` einen eigenen Task-Branch anzulegen, nach den Pflichtprüfungen
    zu committen, zu pushen und einen PR gegen `main` zu öffnen. Merge entscheidet die Nutzerin.
  - Über die Mac-Verbindung: nur im freigegebenen Ordner lesen und ändern; ohne gesonderte
    Freigabe kein Commit/Push; fremde lokale Änderungen und Worktrees bleiben unangetastet.
  - Der PR nennt ausgeführte Prüfungen und Grenzen offen (z. B. keine Geräteprüfung).
- **Claude-Chat ohne Werkzeuge:** Planung, Entscheidungen, Issue-Texte, Reviews eingefügter
  Diffs, Anleitungen. Keine Git-, OTA- oder DB-Aktionen; nichts als erledigt melden, was nicht
  nachweislich im Repo/Board steht.
- Frühere ChatGPT/Codex-Rollen (MASTER-Chat, Fachchats, Publisher „01“, Heartbeat) sind
  beendet; ihre Freigaben gelten nicht weiter.
- Bei unklarer Zuständigkeit Schreibaktion stoppen und die Nutzerin fragen; read-only
  Prüfungen dürfen weiterlaufen.

## Start einer Sitzung

1. Branch, HEAD und `git status --short` prüfen. Fremde/ungesicherte Änderungen bewahren
   und nie als eigene ansehen.
2. **Aufgaben-Sitzung:** Auftrag/Issue lesen, betroffenen Code prüfen, umsetzen.
   `ANYVO_MASTER_STATUS.md` nur lesen, wenn die Aufgabe Release, Production-Stand,
   Runtime-Ziele oder den Projektstatus betrifft.
3. **MASTER:** `ANYVO_MASTER_STATUS.md` und `ACTIVE_WORK.md` lesen. Status nur bei
   nachweislich geprüfter Änderung aktualisieren.
4. Historische Hintergrunddateien (nicht der aktuelle Stand, keine Task-ID-Vergabe daraus):
   `docs/agent/README.md`, `CURRENT_STATE.md`, `SESSION_HANDOFF.md`, `TASKS.md`,
   `WORKTREES.md`, `WORK_LOG.md`, `docs/agent/tasks/`. Nur bei konkretem Bedarf lesen.

Priority rule (on any conflict):
```
Repository/Git facts > current canonical MASTER_STATUS/ACTIVE_WORK > historical handoff/task files > agent assumptions
```

## Arbeitsweise

- Kleine, klare Aufgaben direkt umsetzen. BMAD (`docs/agent/BMAD.md`) nur auf ausdrücklichen
  Wunsch der Nutzerin oder bei grossen bzw. unklaren Funktionen. Risiko trotzdem beachten:
  Änderungen an Auth, Berechtigungen, Kundendaten, Persistenz, Abo oder Tracking brauchen
  vertiefte Prüfung und Regressionstests.
- Sichtbare UI-Änderungen: zuerst ein Mockup zeigen.
- Keine parallelen Agenten, Subagenten oder Party Mode ohne ausdrücklichen Wunsch.
- Funktionierendes Tracking/GPS bewahren; Feldbelege und Kontinuität prüfen, bevor
  Trackinglogik ersetzt wird.
- Prüfen bei Produktcode: relevante Tests, TypeScript, ESLint, `git diff --check`
  (begründete Einschränkungen offen nennen). Nur tatsächlich ausgeführte Prüfungen melden.
- Abschluss: Ergebnis, ausgeführte Prüfungen, offene Gerätetests. Pro PR genau eine Handlung
  nennen: «Mergen», «auf dem Gerät testen, dann mergen» oder «Schliessen».

## Git, PRs und Merge

- **Task-Branch sichern** (Nutzerfreigabe 2026-11-05): Nach relevanten Tests, TypeScript,
  ESLint, Diff-/Secret-Prüfung dürfen abgeschlossene Aufgaben auf dem **eigenen** Task-Branch
  committet und gepusht werden (`npm run agent:github:push`, Ablauf und STOP-Bedingungen:
  `docs/agent/GITHUB_AUTOSYNC.md`). Kein Upload fremder WIP-Dateien; bei unsauberem Worktree
  STOP. Nicht erlaubt: Commit/Push auf `main`, Release-/Backup-/Integrationsbranches, Merge,
  OTA, Build, Store-Release, Live-DB- oder Kundendatenaktion.
- **Doku-PRs selbst mergen** (Nutzerfreigabe 2026-11-09): Reiner Doku-PR = ausschliesslich
  `*.md`-Dateien unter `docs/` (nicht `docs/agent/release-policy.json` oder andere
  Nicht-Markdown-Dateien), Basis `main`, alle Checks grün. Merge nur mit
  `gh pr merge <Nr> --squash --delete-branch --match-head-commit <voller SHA>`; kein `--admin`,
  kein Umgehen von Branch-Schutz. Lokal erzwungen durch `~/.claude/hooks/anyvo-release-guard.py`.
- **Alle anderen PRs** (Code, Skripte, `package.json`, `AGENTS.md`, `CLAUDE.md`, Konfiguration,
  Release) mergt nur die Nutzerin.
- **PR-Ordnung** (Nutzerfreigabe 2026-11-10): Jeder PR wird zeitnah gemergt oder geschlossen,
  «bewusst offen lassen» gibt es nicht. Claude darf nachweislich überholte PRs selbst
  schliessen (nicht mergen), mit Kommentar zu Grund und Wiedereröffnung; Branches dabei nicht
  löschen. Bei Unklarheit nicht schliessen, sondern fragen.

## NEVER
- overwrite unrelated uncommitted changes
- delete unknown files
- `git reset`
- `git checkout` modified files
- `git clean`
- push, merge, or commit without explicit user permission (exceptions: own task branch per
  "Git, PRs und Merge" above; docs-only PR merges; closing stale PRs)
- publish an OTA, start a build, or release to a store without explicit user permission
- run destructive SQL or write to Production Supabase/DB without explicit user permission
- publish a Production OTA from a branch that does not contain the documented current
  Production baseline

## Kundendatenerhalt (direkte Nutzeranforderung 2026-10-08)

Präzisierung direkter Nutzerauftrag 2026-10-29 (Werkstatt Originalturn
01a1855d-7fd5-74f2-8af6-e147ef2b1621): Niemals bestehende Kundendaten entfernen.
Geschützt sind alle Kunden-/Hundedaten: Trainingserfassung/-dokumentation,
Übungen/Bewertungen/Notizen, Fährten samt Geometrie/Markern/Gegenständen/Absuche/
Verlauf, Gesundheitsakte/Medikamente sowie sämtliche Termine, Dokumente, Medien,
Einträge und Verknüpfungen. Auch Altformate, Offline-/unsynchronisierte Einträge
und Entwürfe erhalten. Keine Teil-/Volllöschung, destruktives Überschreiben,
verlustbehaftete Migration oder Cache-/Storage-/Datenresets mit Verlust
ungesicherter Einträge; keine Neuinstallation als Reparaturmaßnahme.
Anzeige-/Filter-/Syncfehler nicht ungeprüft als Datenlöschung darstellen.
Datenwirkung jeder Änderung/Integration/Update/Migration prüfen und vorhandene
Persistenz-/Altformat-/Update-/Offline-/Sync-/Abbruch-/Recovery-Nachweise
risikogerecht nutzen, keine redundanten Volltests ohne neuen Anlass.
Bei ungeklärtem Datenverlustrisiko betroffene Änderung/Veröffentlichung STOP;
Ursache und sichere Lösung melden. Keine absolute Verlustfreiheitsgarantie.
Keine persönlichen Daten/Secrets in GitHub, Logs, Fixtures oder Übergaben.
Keine produktiven Lösch-/Resetaktionen zu Testzwecken. Dieser Schutzauftrag
ist keine Freigabe für Live-Korrektur, DB-Operation, persönlichen Datenexport,
Restore oder Migration; bestehende Schutzmechanismen bewahren.


Bestehende Kundendaten müssen bei Fehlerkorrekturen erhalten bleiben. Keine
Datenlöschung, destruktives Überschreiben oder Resets als Bugfix; Neuinstallation
und Löschen lokaler Daten sind keine Standardlösung. Bestehende Einträge,
Datumswerte, Verläufe und ältere Datenformate weiterhin unterstützen. Insbesondere
bei Medikamentenfixes vorhandene Einträge laden/bearbeiten/speichern, Abbrechen
und Upgrade-Pfade soweit tatsächlich prüfbar testen; keine automatische
historische Datenkorrektur ohne gesonderten Auftrag.

Bei notwendiger Migration zuerst Sicherung, Wiederherstellbarkeit,
Rückwärtskompatibilität und bestehende Freigaben prüfen. Bei ungeklärtem
Datenverlustrisiko vor Integration/Veröffentlichung STOP. Diese Regel autorisiert
keine Migration, Live-DB-Schreibaktion, Wiederherstellung oder neue Veröffentlichung.
Nur ausgeführte Prüfungen melden; verbleibende Risiken/Geräteabnahmen offen
kennzeichnen, keine absolute Sicherheitsgarantie behaupten.

## OTA-Freigabe ab 2026-11-09 (direkter Nutzerauftrag)

Die fortlaufende OTA-Freigabe vom 2026-10-09 galt dem Codex-MASTER und ist beendet.
Der Claude-MASTER veröffentlicht eine Production-OTA nur nach ausdrücklicher Freigabe
der Nutzerin **für die konkrete Charge** (Inhalt und Ziele genannt). Vollständige
sinnvolle Checks, saubere Release-Quelle, frischer Production-/Runtime-/Ancestry-/
Native-/DB-Preflight und tatsächliche Bundle-/Asset-/Live-/Manifest-CDN-Nachkontrolle
bleiben Pflicht. Bereits veröffentlichte Pakete nicht erneut ausliefern. STOP bei
ungeklärter Quelle, fehlendem Check, Runtime-Inkompatibilität, Datenverlustrisiko oder
automatischer Ablehnung; keine Umgehung. Die Freigabe umfasst nicht Push auf main,
Merge, native Builds, Store-Release, Live-DB-Write oder Restore.

## Release-Karte nach jeder Production-OTA (direkter Nutzerauftrag 2026-11-09)

Übersicht über OTA-Stände führt das GitHub-Projekt „ANYVO – Produkt & Entwicklung“
(https://github.com/users/dogbossvibes/projects/1, Projekt-ID `PVT_kwHOEQw4F84BqlcJ`).
Nach jeder Production-OTA, deren Nachkontrolle laut Wrapper bestanden ist, legt der
Publisher (Claude-MASTER) oder der berichtende Agent genau **eine** Release-Karte pro Charge an:

1. Issue in `dogbossvibes/CarniFlow` mit Vorlage `.github/ISSUE_TEMPLATE/ota-release-card.md`,
   Titel `OTA JJJJ-MM-TT · <Inhalt> (<Ziele>)`. Alle Ziele derselben Charge in eine Karte.
2. Je Ziel eine Tabellenzeile mit Runtime, Source-Commit, Update Group ID, Platform Update ID
   und Status – ausschliesslich aus der tatsächlichen Wrapper-/EAS-Nachkontrolle, nie aus
   Erinnerung, MASTER_STATUS oder einem früheren Preflight.
3. „Enthalten“ und „Nicht enthalten“ (Tasks/Scopes) ausdrücklich nennen, ebenso den
   vorherigen Production-Stand je Ziel.
4. Board-Felder setzen: Bereich = Release, Ziel, Task, Testweg.
   Status: Testweg „Nachher“ → „Live – Nachkontrolle offen“; Testweg „Vorher“ mit
   belegtem Gerätetest → „Veröffentlicht“. Nach erfolgter Gerätenachkontrolle Karte
   ergänzen und auf „Veröffentlicht“ setzen.
5. Testweg nach Risiko: Daten, Tracking/GPS, Abo/Bezahlung, Migrationen und grosse
   Umbauten → „Vorher“ (Gerätetest vor der Production-OTA); kleine risikoarme
   Änderungen (Texte, Layout, kleine UI-Fixes) → „Nachher“.
6. Das Repo ist öffentlich: keine Kunden-, Personen- oder Zugangsdaten, keine Secrets.
7. MASTER_STATUS verweist auf die Karte (Issue-Nummer) statt den Release ausführlich
   zu beschreiben.

Ohne Zugriff auf GitHub Projects (z. B. Cloud-Sitzung ohne GraphQL/Browser) die Karte
trotzdem als Issue anlegen – sie gelangt automatisch ins Board (Status Backlog) – und im
Bericht offen melden, dass Board-Felder/Status noch zu setzen sind; nicht als erledigt
melden. Diese Regel erlaubt nur Issue- und Board-Pflege. Sie erweitert keine Freigabe für
OTA, Push, Merge, Build, Store-Release oder DB-Aktionen; die Production-OTA-Regel unten
bleibt unverändert vorrangig.

## ANYVO Production OTA — zwingende Regel

Für ANYVO darf eine Production-OTA NIEMALS ohne explizite
Production-Environment veröffentlicht werden.

### iOS Production OTA

Zulässiges Muster:

```
eas update \
  --channel production \
  --environment production \
  --platform ios \
  --message "<message>"
```

VERBOTEN ist insbesondere:

```
eas update \
  --channel production \
  --platform ios \
  --message "<message>"
```

also jede Production-OTA ohne:

`--environment production`

Grund:
Die ANYVO Production-App benötigt Environment-Werte wie:

- `EXPO_PUBLIC_BACKEND_ENV`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Fehlen diese beim EAS-Update-Bundle, kann das veröffentlichte
JS-Bundle beim Start fehlschlagen und expo-updates auf einen
älteren funktionierenden Stand zurückfallen.

### Wrapper bevorzugen

Für iOS Production OTA bevorzugt immer den repo-eigenen
Production-OTA-Wrapper verwenden:

```
npm run update:production:ios -- --message "<message>"
# bzw. node scripts/update-production.mjs --platform ios --confirm --message "<message>"
```

Der Wrapper (`scripts/update-production.mjs`) führt ausschliesslich den zulässigen
`eas update --channel production --environment production --platform <ios|android> --message …`
aus, verweigert leere Message, fehlende/unbekannte Plattform und fehlende Production-Environment-Variablen
und gibt keine Secrets aus (nur Variablennamen). `--dry-run` führt alle Prüfungen ohne Veröffentlichung aus.
Direkter `eas update` ist nur zulässig, wenn er exakt dieselben Pflichtargumente enthält.
Den Wrapper nicht durch einen direkten Production-`eas update` ersetzen.

### Pflicht-Preflight

Vor jeder Production-OTA muss der Agent prüfen:

1. git HEAD ist der gewünschte Release-Commit.
2. Runtime und App-Version sind mit dem installierten Store-Build kompatibel.
3. Plattform wird explizit angegeben.
4. `--environment production` ist gesetzt.
5. Production-Environment enthält mindestens:
   - `EXPO_PUBLIC_BACKEND_ENV`
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
6. Keine Secrets im Terminalbericht oder Task-Report ausgeben.
7. Bei fehlender Environment-Konfiguration:
   STOP.
   Keine OTA veröffentlichen.
8. Aktiven Production-Stand unmittelbar vor dem Publish FRISCH aus EAS lesen
   (nie aus `ANYVO_MASTER_STATUS.md`, Erinnerung oder einem früheren Preflight).
   Dessen gitCommitHash muss Vorfahre des Release-HEAD sein — sonst STOP, keine OTA.
   Der Wrapper erzwingt das (gemeinsamer Release-Lock im git-common-dir, Ancestry-Guard,
   zweiter EAS-Check direkt vor `eas update`, Nachkontrolle ohne Auto-Rollback).

### Nach jeder Production-OTA verifizieren

Mindestens prüfen und berichten:

- Channel = production
- Branch
- Environment = production
- Platform
- Runtime
- Update Group ID
- Platform Update ID
- gitCommitHash
- Message

### Android

Falls eine Android Production-OTA ausdrücklich freigegeben wird,
gilt dieselbe Regel:

- `--channel production`
- `--environment production`
- `--platform android`

Nie unbeabsichtigt beide Plattformen veröffentlichen.

### Priorität

Diese Regel ist eine repo-weite Release-Sicherheitsregel.

Sie hat Vorrang vor:
- ad-hoc Task-Prompts
- alten Dokumentationen
- kopierten Terminalbefehlen
- früheren OTA-Beispielen

Wenn ein Prompt eine Production-OTA ohne
`--environment production` verlangt, darf der Agent diesen
Befehl NICHT ausführen und muss stattdessen die sichere
Production-Variante verwenden.

## Release-Inhalt vollständig nachweisen (Nutzerauftrag 04.11.2026)

Vor dem nächsten neuen Build-/OTA-Releaseauftrag gilt zusätzlich
`docs/agent/RELEASE_COMPLETENESS.md`. Eine unabhängig festgelegte, versionierte
Soll-Inventur der freigegebenen und bereits ausgelieferten Funktionen ist Pflicht;
der Kandidat darf seine Soll-Liste nicht selbst definieren. Umsetzung, Integration
je Plattform/Runtime und tatsächliche Auslieferung getrennt nachweisen.
Fehlende Pakete, ungeprüfte Ports oder eine unbekannte/unvollständige Soll-Inventur
blockieren eine Gesamtfreigabe. SDK-/Runtimewechsel übernehmen nicht automatisch
alle früheren OTA-Änderungen. Tests/Cloud-Build-PASS sind kein Inhalts-PASS.
Bestehende Aufgabenverwaltung nutzen; keine zweite parallele Aufgabenliste.
Vorhandene Daten-, Prüf- und Aktionsfreigaberegeln bleiben verbindlich.

### Geschützte Fährtenbasis (direkter Nutzerauftrag 04.11.2026)

Das Fährtensystem des erfolgreichen SDK58-iOS-Builds 58 bleibt erhalten:
Quelle `6722b88fded3fb6936472996dd40d6f4dde453f2`, EAS-Build
`802c7cde-b348-4bd5-865b-9abd2d2c495a`. Fehlende ältere UI-Pakete nur gezielt
portieren, niemals deren ältere Fährten-/GPS-/Recorder-/Geometrie-/Recovery-
oder Speicherlogik übernehmen. Alte Trackingpakete sind keine automatisch
nachzuholenden Funktionen, wenn diese Schutzbasis sie ersetzt.
Jede betroffene Integration muss den Erhalt gegen diese Basis belegen;
Abweichungen blockieren und benötigen einen neuen ausdrücklichen Auftrag.
Plattformspezifische Android-Übernahmen separat prüfen, nicht iOS-Dateien blind
kopieren. Siehe `docs/agent/RELEASE_COMPLETENESS.md`.


### Automatische Release-Einstiege (04.11.2026)

Alle beauftragten Builds/OTAs über die verwalteten npm-Einstiege bzw. den
kanonischen Production-Wrapper führen. `ANYVO_RELEASE_PLAN` und die aktuelle
unabhängige `refs/anyvo/release-policy` sind Pflicht. Kein direkter EAS-Aufruf
als Ersatz für ein blockiertes Gate, kein Ausweichen auf ältere Worktrees.
Eine neue OTA auch in einer älteren Runtime verlangt erneuten Soll-Abgleich.
Vor Kundenfreigabe zusätzlich `release:check:customer` mit echter Geräteabnahme;
TestFlight-Upload ist davon getrennt. Die Grenzen lokaler Durchsetzung stehen in
`docs/agent/RELEASE_COMPLETENESS.md`; externe CLI-/Portalrechte sind damit nicht
serverseitig eingeschränkt. Keine Releasefreigabe aus einem lokalen PASS ableiten.
