# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

## GitHub-Upload nach Aufgaben (direkte Nutzerfreigabe 2026-11-05)

> **AUSGESETZT seit 2026-11-08 (Nutzerentscheidung, bis auf Widerruf).** Die unten
> beschriebene fortlaufende Freigabe gilt nicht mehr, für Codex, Claude Code, OpenCode
> und jeden anderen Agenten. Jeder Commit und jeder Push, auch auf dem eigenen
> Task-Branch und auch über `npm run agent:github:push`, braucht eine ausdrückliche
> Einzelfreigabe der Nutzerin. Codex erhält vorerst keine neuen Schreibaufträge;
> OpenCode (DeepSeek) arbeitet nur auf ausdrücklichen Auftrag der Nutzerin. Details: `docs/agent/ANYVO_COLLABORATION_RULES.md` Abschnitt 1a.
> Der folgende Text bleibt nur als historischer Beleg stehen.

Der Nutzer hat ausdrücklich beauftragt, vor ANYVO-Codearbeiten den frischen GitHub-
Stand (main, relevanten Arbeits-/Runtime-Branch und offene Pull Requests) zu prüfen
und abgeschlossene, geprüfte Aufgaben **automatisch auf GitHub zu sichern**.
Dies ist eine eng begrenzte fortlaufende Freigabe für **Task-Commits und normale
Pushes ausschliesslich auf dem eigenen, korrekt zugeordneten Task-Branch** nach
relevanten Tests, TypeScript, ESLint, Diff-/Secret-Prüfung und Owner-Abgleich.
Verbindlicher Ablauf und STOP-Bedingungen: `docs/agent/GITHUB_AUTOSYNC.md`.
Nach geprüftem Task-Commit: `npm run agent:github:push`.
Kein automatischer Upload fremder WIP-Dateien; bei unsauberem Worktree STOP.
Diese Freigabe umfasst **keine** Commits/Pushes auf main, Release-/Backup-/
Integrationsbranches, keinen Merge, keine OTA, keinen Build, kein Store-Release,
keine Live-DB- oder Kundendatenaktion. Ein reiner Handoff bleibt ohne Push.
Die alten allgemeinen Freigabeverbote gelten ausserhalb dieses engen Scopes weiter.
Falls lokale Worktree-/Owner-Prüfungen nicht möglich sind, keine automatische
Freigabe unterstellen und keinen lokalen Sync als erfolgt melden.

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

## Zentrale ANYVO-Koordination mit Claude (direkter Nutzerauftrag 2026-11-09)

Die Nutzerin hat von ChatGPT/Codex zu Claude gewechselt. Die früheren Codex-Rollen
(MASTER-Chat `00-01 – ANYVO MAIN MASTER`, ID `01a18309-…`, Fachchats, Publisher „01“,
Heartbeat `anyvo-laufende-ota-koordination`) sind **beendet und historisch**; ihre
Freigaben gelten nicht weiter. `docs/agent/README.md` „Zentrale Koordination“ ist
insoweit historisch.

**MASTER** ist eine lokale Claude-Code-Sitzung „ANYVO MASTER“ auf dem Mac der Nutzerin
im Worktree `/Users/moyo/canisflow-worktrees/anyvo-main`. Der MASTER
- ist einziger Writer für `ANYVO_MASTER_STATUS.md` und `ACTIVE_WORK.md`,
- ist einziger **Publisher** für Production-OTAs (Regeln unten unverändert),
- pflegt das GitHub-Projekt „ANYVO – Produkt & Entwicklung“ und die Release-Karten,
- arbeitet nur auf Anfrage der Nutzerin: kein Heartbeat, keine zeitgesteuerten
  Prüfschleifen, keine wiederholten Vollprüfungen ohne neuen Anlass (Kontingent sparen).

**Weitere Claude-Sitzungen** (Cloud oder lokal) arbeiten je Aufgabe auf eigenem
Task-Branch, melden Ergebnis/Blocker im zugehörigen GitHub-Issue oder PR und schreiben
nicht in MASTER_STATUS/ACTIVE_WORK. Sie veröffentlichen keine OTA.

**Normaler Claude-Chat im Projekt ANYVO** (ohne Claude Code, z. B. wenn das Code-Kontingent
aufgebraucht ist) dient Planung, Entscheidungen, Issue-Texten, Reviews eingefügter Diffs
und Arbeitsanweisungen für die Nutzerin. Er führt keine Git-, OTA- oder DB-Aktionen aus
und meldet nichts als erledigt, was nicht nachweislich im Repo/Board steht.

Bei unklarer Zuständigkeit Schreibaktion stoppen und die Nutzerin fragen; read-only
Prüfungen dürfen weiterlaufen.

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

# Agent Handoff Protocol (Codex and Claude Code)

Since 2026-11-08 Claude Code is the primary ANYVO development agent (switch
completed by user decision). OpenCode with DeepSeek is the fallback agent and works
only on an explicit user assignment. Codex gets no new write tasks; its existing
worktrees and uncommitted work stay untouched. This repository is the shared
source of truth for all agents. Full guide:
`docs/agent/README.md`.

## On start (Codex and Claude Code MUST do this, in order)
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

Every agent must **never** assume that uncommitted changes were made by itself.

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
- weaken, skip or adapt tests to hide failures; change a test only for a
  documented requirement change and name it in the report

## ALWAYS
- inspect `git status` before editing
- preserve unrelated work
- preserve working tracking/GPS behavior; review field evidence and continuity
  before replacing tracking logic
- treat as specially protected: Fährtenaufzeichnung (highest priority), GPS/IMU,
  Supabase RLS, RevenueCat, subscription sync and existing customer features
- for product-code changes, run relevant tests, TypeScript typecheck, ESLint,
  and `git diff --check` (report any justified limitation)
- check every change for regressions in affected and adjacent features
- document remaining issues
- update the handoff before stopping when appropriate

## When handing off between Codex and Claude
1. Update the **manual** sections of `docs/agent/SESSION_HANDOFF.md`
   (Current task, Goal, Work completed, Tests, Known issues, Important context,
   Do not touch, Next recommended step, Relevant files, Open questions).
2. Run `npm run agent:handoff -- --agent=<current-agent>` with `codex` for Codex or `claude` for Claude Code.
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
  Subagent. Claude Code is the Primary Agent; OpenCode with DeepSeek is the
  fallback (explicit user assignment only); Codex gets no new write tasks.
  Existing coordinator, writer and publisher assignments grant no commit, push,
  merge, build, OTA or store approval; each needs an explicit single approval.

The NEVER/ALWAYS rules above apply unchanged in every worktree. In addition, a parallel
agent must never delete or reset another worktree's or the main tree's uncommitted work,
never clean/reset foreign changes, and never push or merge without explicit approval.

# BMAD — schlanker Anyvo-Ablauf / Claude-Übergang

Always consider BMAD for every ANYVO task and scale its scope to complexity
and risk without a separate user request. For small, low-risk tasks, clarify
the goal, inspect affected areas, act within scope and verify the result in a
compact workflow. Even small changes may require deeper review when risk is high.
Read `docs/agent/BMAD.md` for the appropriate scope; briefly name the approach.
For small tasks, a short work announcement is sufficient; no mandatory spec.
Current canonical MASTER_STATUS/ACTIVE_WORK and the atomic task registry remain
authoritative; do not duplicate the backlog or allocate historical task IDs.
The dated audit `docs/agent/audits/2026-11-01.md` is supporting evidence, not a
replacement for the continuously maintained master status or fresh EAS checks.
Keep specs, decisions and handoffs in repository files so Claude can take over.
CLAUDE.md imports these rules; the same customer-data, release and writer rules
apply to both tools. Installed BMAD roles do not authorize parallel subagents.
User authorization for this preparation: no commit, push, merge or publication.
Any later Git/release action needs applicable direct authorization; installation
or a workflow suggestion alone does not provide it.

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
