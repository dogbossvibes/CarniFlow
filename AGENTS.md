# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

## ANYVO project status

Before substantial ANYVO work, read:

`docs/agent/ANYVO_MASTER_STATUS.md`

It is the canonical source for current production baseline, completed work,
active work and open work.

Detailed task files under `docs/agent/tasks` are historical/technical sources
and must not override the current master status.

Do not update the master status unless the task explicitly includes a verified
status change.

Do not publish a Production OTA from a branch that does not contain the
documented current Production baseline.

## Zentrale ANYVO-Koordination (Nutzerauftrag 2026-10-08)

Der aktive Chat `00-01 – ANYVO MAIN MASTER – Status & Entscheidungen` ist
Eingang für Ideen, Probleme und Prioritäten und koordiniert die bestehenden
Fachchats. Der Nutzer erlaubt Aufgabenweiterleitung und Ergebniseinholung im
jeweils beauftragten Scope. Diese Erlaubnis erweitert weder den Produkt-Scope
noch die Freigabe für Commit, Push, Merge, OTA, nativen Build, Store-Release oder
DB-Write; jede dieser Aktionen braucht eine separate ausdrückliche Freigabe.

Der Folgeauftrag vom 2026-10-08 erlaubt beauftragten bestehenden ANYVO-Fachchats
auch Status-, Ergebnis- und Blockaden-Rückmeldungen an den MASTER
`01a18309-ad36-7ef0-9950-1941ac2c816a` (Host `local`, Master-Ablösung auf direkten Nutzerauftrag 2026-10-28). Bei Weiterleitung diese
direkte Nutzerfreigabe und Ziel-ID nachvollziehbar mitgeben; sie autorisiert
keine anderen Empfänger, Produktänderungen oder Git-/Release-Aktionen.
Der MASTER holt Ergebnisse selbst ab; Rückmeldungen lösen keine gegenseitigen
automatischen Nachrichtenketten aus. Tool-Ablehnungen nicht umgehen.

Vor jeder Weiterleitung: kanonische Dokumente, tatsächlichen Chat-Status,
Worktree/Branch/HEAD/Working Tree, vorhandenen Task-Bericht und zuständigen
Writer prüfen. `docs/agent/ACTIVE_WORK.md` enthält die Routing-Zuordnungen;
Chat-cwd ist kein Beleg für den Code-Worktree. Laufende oder überlappende Arbeit
fortsetzen/abstimmen, keine Doppelaufträge und keine fremden Änderungen.

Der verbindliche Koordinationsablauf und Freigabegrenzen stehen in
`docs/agent/README.md`, Abschnitt „Zentrale Koordination“. Fachchats lesen diese
Regeln vor neuen Aufträgen aus `/Users/moyo/canisflow-worktrees/anyvo-main`, auch
wenn ihr eigener Worktree eine ältere Dokumentkopie enthält. Bei Drift oder
unklarer Zuständigkeit die betroffene Schreibaktion stoppen; unabhängige
read-only Prüfungen fortsetzen.

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

## Fortlaufende OTA-Freigabe (direkter Nutzerauftrag 2026-10-09)

Direkte Nutzernachricht im MASTER: „bitte alle offenen OTA immer wieder freigeben,
ich fahre jetzt weg und lasse es hier laufen“. Sie erteilt eine fortlaufende
Production-OTA-Freigabe für die beauftragten ANYVO-Änderungen. Frühere Anweisung
„vorher sauber committen“ gilt für die dafür nötigen isolierten Release-Commits.
Keine erneute Nutzerfrage für dieselben OTA-Scopes, auch für die vorbereiteten
Heat-/HelpSheet-Fixes. Keine Erlaubnis für ungeprüfte oder scopefremde Pakete.

01 bleibt einziger Publisher. Vollständige sinnvolle Checks, nötige unabhängige
Reviews, saubere Release-Quelle, frischer Production-/Runtime-/Ancestry-/Native-/DB-
Preflight und tatsächliche Bundle-/Asset-/Live-/Manifest-CDN-Nachkontrolle bleiben
Pflicht. Fertige bereits veröffentlichte Pakete nicht erneut ausliefern. STOP bei
ungeklärter Quelle, fehlendem Check, Runtime-Inkompatibilität, Datenverlustrisiko
oder automatischer Ablehnung; keine Umgehung.

Diese direkte Freigabe ersetzt nur frühere Einzel-OTA-Freigabevorbehalte für
beauftragte Scopes. Sie erweitert nicht die Freigabe für Push, main-Merge, native
Builds, Store-Release, Live-DB-Write oder Restore. Frühere konkrete Freigaben dieser
Aktionen gelten separat weiter, neue nicht aus der OTA-Freigabe ableiten.

Aktiver MASTER-Heartbeat `anyvo-laufende-ota-koordination` prüft alle15Minuten
kompakt neue Fachchat-Ergebnisse, koordiniert fertige Pakete mit01 und hält die
bestehenden Statusdokumente aktuell. Kein zweiter Writer, keine neuen Chats oder
Produktentwicklung im MASTER. Bei unverändertem Stand still; nur echte Abschlüsse,
neue Blocker/Fehler oder nötige Nutzerentscheidungen melden. Kontingent im Blick
behalten, unnötige wiederholte Prüfungen vermeiden. Rechner/Projekt/Anmeldung und
laufende Desktop-App müssen verfügbar sein. Einrichtung und erster planmäßiger
Heartbeat am 2026-10-09 um 08:00 Europe/Zurich sind belegt: main-Status und
Fachchat-Ergebnisse wurden lesend abgeholt. Dies belegt keinen OTA-Geräteempfang.

# Agent Handoff Protocol (ChatGPT + Codex; optional Claude fallback)

ChatGPT + Codex are the primary ANYVO development workflow. Claude Code and
OpenCode remain optional historical fallbacks. This repository is the shared
source of truth for all agents. Full guide:
`docs/agent/README.md`.

## On start (Codex MUST do this, in order)
1. Check the actual worktree/root, branch, HEAD and `git status --short`; preserve all existing WIPs.
2. Read canonical `docs/agent/ANYVO_MASTER_STATUS.md` and `docs/agent/ACTIVE_WORK.md`
   in `/Users/moyo/canisflow-worktrees/anyvo-main` for current scope, stops and owners.
3. Read relevant `docs/agent/DECISIONS.md` entries and the existing task report.
4. Consult `CURRENT_STATE.md`, `SESSION_HANDOFF.md` and `TASKS.md` only as historical
   supporting context; compare every relevant claim with current repository/Git facts.
5. Reuse the existing task/owner. Historical “next TASK-ID” text does not reserve an ID.
   New IDs must be reserved atomically in the shared git-common-dir registry with
   owner, purpose and exact base recorded. The reviewed registry tool is locally
   integrated: use `node scripts/agent-worktree.mjs create <slug> --base <EXACT_BASE_COMMIT>
   --owner "<Owner/Chat-ID>" --purpose "<bounded purpose>" --branch <branch>` only
   within an authorized scope. See `docs/agent/tasks/T-69.md`. Never allocate IDs
   from historical counters or infer permission to create worktrees from tool availability.

Codex must **never** assume that uncommitted changes were made by itself.

## Priority rule (on any conflict)
```
Repository/Git facts > current canonical MASTER_STATUS/ACTIVE_WORK > historical handoff/task files > agent assumptions
```
The actual repository state always wins over handoff documentation.

## NEVER
- overwrite unrelated uncommitted changes
- delete unknown files
- `git reset`
- `git checkout` modified files
- `git clean`
- push, merge, or commit without explicit user permission
- publish an OTA, start a build, or release to a store without explicit user permission
- run destructive SQL or write to Production Supabase/DB without explicit user permission

## ALWAYS
- inspect `git status` before editing
- preserve unrelated work
- preserve working tracking/GPS behavior; review field evidence and continuity
  before replacing tracking logic
- for product-code changes, run relevant tests, TypeScript typecheck, ESLint,
  and `git diff --check` (report any justified limitation)
- document remaining issues
- update the handoff before stopping when appropriate

## When handing off to Claude (optional fallback)
1. Update the **manual** sections of `docs/agent/SESSION_HANDOFF.md`
   (Current task, Goal, Work completed, Tests, Known issues, Important context,
   Do not touch, Next recommended step, Relevant files, Open questions).
2. Run `npm run agent:handoff -- --agent=codex`.
3. Run `git status --short`.
4. Do **not** commit or push. Then stop.

The handoff script only rewrites the `AUTO-GENERATED` block of `SESSION_HANDOFF.md`;
manual sections are never touched.

# Parallel work with Git worktrees

For running several independent tasks at the same time, ANYVO uses Git worktrees.
Full guide: `docs/agent/WORKTREES.md`.

Core rule:
```
1 task = 1 Task-ID (T-XX) = 1 branch = 1 worktree = 1 responsible Primary Agent
```

- Worktrees are sibling folders: `../anyvo-<slug>`. Multiple Primary Agents may work
  in parallel, but **never in the same working tree**.
- Each task keeps its own report in `docs/agent/tasks/<TASK-ID>.md`
  (template: `docs/agent/tasks/_TEMPLATE.md`). The **global** files (`TASKS.md`,
  `SESSION_HANDOFF.md`, `CURRENT_STATE.md`, `WORK_LOG.md`) are updated **only at
  integration** by the responsible integration agent — not by parallel tasks.
- Helper: `npm run agent:wt:create|list|finish|remove`. `remove` refuses to delete a
  **dirty** worktree and never uses `--force`.
- Tool-neutral roles: Primary Agent, Implementation Agent, Review Agent, QA Agent,
  Subagent. ChatGPT + Codex are the primary workflow. Claude Code and OpenCode
  may be used as optional fallbacks; their historical configuration is retained.

The NEVER/ALWAYS rules above apply unchanged in every worktree. In addition, a parallel
agent must never delete or reset another worktree's or the main tree's uncommitted work,
never clean/reset foreign changes, and never push or merge without explicit approval.

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
