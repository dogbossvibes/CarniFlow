# ANYVO — Agent Handoff (ChatGPT + Codex; optional Claude fallback)

## Start here

For the current ANYVO production baseline, completed work,
active work and open work, read:

`docs/agent/ANYVO_MASTER_STATUS.md`

This is the canonical project status source.

Then use the other files as supporting detail:

- `TASKS.md` → historical task-ID ledger
- `CURRENT_STATE.md` → historical technical snapshot
- `DECISIONS.md` → technical/product decisions
- `WORK_LOG.md` → chronological work history
- `WORKTREES.md` → worktree references
- `SESSION_HANDOFF.md` → handoff/session context
- `tasks/` → detailed task reports and root-cause analyses

If an older file conflicts with `ANYVO_MASTER_STATUS.md`,
the master status is authoritative for current project state.

ChatGPT + Codex sind der primäre Entwicklungsworkflow. Claude Code bleibt ein
optionaler Fallback; die folgenden Claude-Handoff-Schritte sind historische, weiterhin
nutzbare Übergabeverfahren. Das **Repository** ist die gemeinsame technische Wahrheit.

## Dateien
| Datei | Zweck |
|---|---|
| `CURRENT_STATE.md` | Länger gültiger technischer Zustand (Verified/Assumed/Unknown). |
| `SESSION_HANDOFF.md` | Aktuellster Handoff: manuelle Abschnitte + automatischer Git-Snapshot. |
| `TASKS.md` | **Verpflichtend zum Start.** Task-IDs, Status und die **nächste TASK-ID**. |
| `DECISIONS.md` | Relevante technische Entscheidungen (mit Begründung). |
| `WORK_LOG.md` | Kurzer chronologischer Verlauf. |
| `../../AI_HANDOFF.md` | **Legacy** (2026-07-23). Durch `SESSION_HANDOFF.md` abgelöst; nur noch historische Quelle (in `docs/handbook-source/*` zitiert). Nicht als aktueller Handoff nutzen. |
| `../../scripts/agent-handoff.mjs` | Aktualisiert nur den AUTO-GENERATED-Block. |
| `../../scripts/agent-status.mjs` | Read-only Statusübersicht + Stale-Warnung. |
| `../../scripts/agent-start.mjs` | Read-only Kompaktübersicht beim Session-Start. |

## Optional: CLAUDE → CODEX
1. In Claude: `/handoff`  _(oder ohne Slash-Command:)_ `npm run agent:handoff -- --agent=claude`
   - Vorher die **manuellen** Abschnitte in `SESSION_HANDOFF.md` pflegen (Current task, Work completed, …).
2. Claude schliessen.
3. Im gleichen Projektordner starten: `codex`
4. Codex liest `AGENTS.md` → `docs/agent/CURRENT_STATE.md` → `SESSION_HANDOFF.md` → `TASKS.md` und vergleicht mit `git status`.

## Optional: CODEX → CLAUDE
1. In Codex die manuellen Handoff-Abschnitte aktualisieren.
2. `npm run agent:handoff -- --agent=codex`
3. Codex schliessen.
4. Im gleichen Projektordner: `claude`

## Status prüfen
```
npm run agent:status      # voller Status + Stale-Warnung
npm run agent:start       # kompakte Session-Start-Übersicht
```

## Prioritätsregel (bei Widerspruch)
```
Repository state  >  Git state  >  Handoff documentation  >  Agent assumptions
```
Der tatsächliche Repository-Zustand hat immer Vorrang vor der Handoff-Doku.
Ein Agent darf uncommittete Änderungen **nie** automatisch als eigenen Stand
interpretieren oder überschreiben.

## Grenzen des Scripts
`agent-handoff.mjs` schreibt ausschliesslich zwischen
`<!-- AUTO-GENERATED:START -->` und `<!-- AUTO-GENERATED:END -->`.
Es macht **kein** commit / push / reset / checkout / clean, löscht nichts,
wechselt keinen Branch, startet keine Tests und stellt keine Remote-/DB-Verbindung her.
Manuelle Abschnitte bleiben immer erhalten.

## Paralleler Betrieb (Worktrees)
Für mehrere gleichzeitige, unabhängige Tasks siehe **`WORKTREES.md`**. Kurz:

- `1 Task = 1 Task-ID = 1 Branch = 1 Worktree = 1 Primary Agent` (Ordner `../anyvo-<slug>`).
- Jeder Task hat einen eigenen Report unter **`tasks/<TASK-ID>.md`** (Vorlage `tasks/_TEMPLATE.md`).
  Nur diese Datei wird im Task-Branch gepflegt — **globale** Dateien (`TASKS.md`,
  `SESSION_HANDOFF.md`, `CURRENT_STATE.md`, `WORK_LOG.md`) erst bei der **Integration**.
- Helfer: `npm run agent:wt:create|list|finish|remove` (`remove` nur wenn der Worktree clean ist).


## Zentrale Koordination (verbindlich seit 2026-10-08)

### Zuständigkeit und bestehende Quellen

`00 – ANYVO MAIN MASTER – Status & Entscheidungen` übernimmt Eingang, Priorisierung,
Abhängigkeiten, Weiterleitung, Ergebniseinholung und nächste Freigabeempfehlung.
Hier keine Produktentwicklung; Umsetzung im passenden bestehenden Fachchat und
isolierten Task-Worktree. ANYVO bleibt eine All-in-One-App für Hundehalter.

Es entsteht keine zweite Statusliste:

- `ANYVO_MASTER_STATUS.md`: einziger operativer Produkt-/Release-Gesamtstand.
- `ACTIVE_WORK.md`: zuständiger Chat, Task/Scope, Branch, Code-Worktree, Writer,
  Abhängigkeiten und nächster Nachweis; kein Ersatz für den Master.
- `PLATFORM_STATUS.md`: Code-, Native-, Runtime-, OTA-/Store- und QA-Parität.
- `TASKS.md`: Vergabe/Ledger stabiler Task-IDs; `tasks/`: Einzelberichte und Belege.
- `DECISIONS.md`: bestätigte Entscheidungen; `SESSION_HANDOFF.md`: Wiedereinstieg.

Nur der abgestimmte main-Writer pflegt globale Dokumente. Fachchats pflegen ihren
Task-Bericht; dieser ausdrückliche Dokumentationsauftrag erlaubt dem MASTER die
lokale Einrichtung der Koordinationsregeln auf main, keinen Commit/Release.
Eine fremde laufende Session oder fremde WIP-Datei wird dadurch nicht übernommen.

### Ablauf bei einem neuen Anliegen

1. Nutzerziel, Priorität und freigegebenen Scope erfassen. Bestehende Arbeit,
   Entscheidungen, Abhängigkeiten und Plattform-/DB-Auswirkungen zuerst prüfen.
2. Tatsächliche Chats mit `list_threads` und bei Bedarf `read_thread` prüfen;
   Git-Worktree-Liste und Branch/HEAD/status des Ziel-Worktrees frisch lesen.
   Chat-cwd, Workspace-Anzeige und Branchname allein beweisen keine Zuordnung.
3. Vorhandenen Auftrag/Task-ID wiederverwenden. Bei Überschneidung den bestehenden
   verantwortlichen Chat weiterführen; keinen zweiten Writer starten. Bei doppelten
   IDs Berichte mit Chat-ID + Worktree + Scope eindeutig referenzieren und die
   Ledger-Bereinigung vor neuer ID-Vergabe abstimmen, keine Berichte überschreiben.
4. Auftrag an den passenden bestehenden Fachchat senden: Nutzerziel, Task/Scope,
   Basis-Commit, absoluter Worktree, erlaubte/verbotene Dateien und Aktionen,
   Abhängigkeiten, Tests, Akzeptanzkriterien, STOP-Bedingungen, erwartete Belege.
   Scope unklar: zunächst begrenzte read-only Analyse. Neue Chats nur auf Nutzerwunsch.
   Nach jeder tatsächlichen Weiterleitung im MASTER unmittelbar sichtbar berichten:
   `Auftrag weitergeleitet an: [exakter Chatname, belegter nutzbarer Chat-Link falls vorhanden]`,
   `Aufgabe: [konkreter Scope]`, `Status: läuft / wartet / abgeschlossen / blockiert`.
   Nur den beobachteten Status nennen: erfolgreicher Nachrichtenversand allein
   belegt keinen Arbeitsstart oder Abschluss. Bei einem älteren ausführenden Chat
   statt des nummerierten Fachchats die konkrete Zuordnung und den Grund nennen.
5. Mit `wait_threads` bis zum belegten Ergebnis nachverfolgen, Host und Cursor
   übernehmen; `read_thread` für fehlende Details. Keine identischen Parallelaufträge,
   keine Nachrichten-Schleifen. Der MASTER holt Ergebnisse ab; Rücknachrichten aus
   Fachchats sind durch den direkten Nutzerauftrag vom 2026-10-08 für Status-,
   Ergebnis- und Blockadenmeldungen an MASTER-ID
   `01a117fa-04b7-7992-a485-cfdeca7fcfa6` (Host `local`) ausdrücklich autorisiert.
   Diese Nutzerfreigabe mit Auftrag und Ziel-ID weitergeben; keine anderen Empfänger,
   Scope-Erweiterungen oder automatischen Antwortketten. Tool-Ablehnung berichten.
   Scheitert eine Rückmeldung, holt der MASTER den Bericht selbst über Status-/Warte-/
   Lesewerkzeuge ab; der Nutzer muss nichts kopieren oder den Auftrag erneut senden.
   Danach Ergebnis, offene Punkte, tatsächliche Prüfgrenzen und separat erforderliche
   Freigaben kompakt im MASTER berichten. Fehlgeschlagene Rückmeldung allein ist
   kein Grund für einen doppelten Umsetzungsauftrag.
6. Bericht gegen Dateien/Diff, exakten Commit, tatsächlich ausgeführte Checks und
   QA-/Release-IDs prüfen. Behauptete, dokumentierte und frisch verifizierte Fakten
   unterscheiden. Blocker konkret mit benötigtem Zugang, Entscheidung oder Beleg melden.

### Nach jeder abgeschlossenen Arbeit oder Integration

Entwicklungsstatus: geplant → in Arbeit → implementiert → geprüft → integriert.
Blockiert oder auf Nutzerentscheidung wartend separat benennen. Ideen bleiben
geplant bis zur ausdrücklichen Beauftragung. Bereits klar beauftragte Arbeit
nicht erneut bestätigen lassen.

Umsetzung, Tests/Review, Integration in main, Geräte-QA und Veröffentlichung
jeweils getrennt als OPEN/PASS/FAIL/BLOCKED/UNKNOWN oder begründet N/A erfassen.
Ein Commit ist keine Integration; Integration ist keine Auslieferung; Publish
ist keine Geräteabnahme. Ein fertiger Teil lässt andere Phasen offen.

Änderungen als Dokumentation, Shared JS/TS/Assets, native Config/Module/Permissions
und/oder DB klassifizieren. Für iOS und Android getrennt den nächsten Schritt
ermitteln. Notwendige read-only Statusprüfungen und Preflights ohne erneute
Rückfrage durchführen, soweit Zugang besteht. Neue erforderliche Produktänderungen
nicht allein aus dem Koordinationsauftrag ableiten.

Vor Release-Empfehlungen Remote-main, EAS-Channel/Branch, Runtime-spezifische
OTA-Basis, native Builds und Store-Stände frisch prüfen. Vollständiges Bundle,
Feature-Erhaltung, Ancestry, Native-Kompatibilität, Production-Environment und
DB-Abhängigkeiten prüfen. Den repo-eigenen OTA-Wrapper nur als geprüften Dry-run
verwenden; keine Freigabe durch `--confirm` vortäuschen. Git main und EAS production
bleiben getrennte Wahrheiten. Runtime-Snapshots nicht automatisch nach main mergen.

Ergebnisse im vorhandenen Master-/Plattformstatus durch den abgestimmten Writer
nachführen; keine zweite Übersicht, keine unbestätigten Endstände. Alte belegte
Snapshots datieren; bei Widerspruch gilt der neueste belastbare Beleg, nicht die
neueste unbelegte Aussage. Geräte-/Hardwareprüfungen an Binary-/OTA-IDs binden.

### Abschluss im MASTER

Kompakte bestätigte Endstände im Format:

```text
MASTER-EINTRAG
Datum:
Thema:
Status:
Enthalten:
Tests:
Production betroffen:
Offen:
Nächster Schritt:
```

Die Empfehlung nennt: Was ist fertig? Was fehlt? Welche konkrete Aktion soll der
Nutzer freigeben? Commit, Push, Merge, OTA-Publish, nativer Build, Submit/Store-Release
und DB-Write einzeln freigeben lassen. Keine pauschale Freigabekette. Zwischenergebnisse
im MASTER nur bei echten Blockern, fachliche Details bleiben im Einzelbericht.

### Technische Grenze der dauerhaften Nachverfolgung

Dateien sichern Regeln, starten aber keine Chat-Ausführung. Während eines aktiven
MASTER-Turns ist Ergebniseinholung mit den Chat-Werkzeugen möglich. Für selbstständige
Nachverfolgung nach Turn-Ende braucht es einen eingerichteten Wakeup/Event-Trigger
oder eine passende Automation mit Zugriff auf die Chats und den lokalen Host.
Dieser Dokumentationsauftrag richtet keinen solchen Hintergrundmechanismus ein.
Ohne ihn bei jedem MASTER-Wiedereinstieg offene Aufträge aus den bestehenden
Dokumenten abgleichen; keine dauerhafte Überwachung behaupten. Uncommittete Regeln
sind lokal gespeichert, werden nicht automatisch in bestehende Worktrees verteilt;
bis zur gesondert freigegebenen Versionierung die kanonischen Dateien explizit lesen.


### Nachgewiesener read-only Probelauf — 2026-10-08

Vor Versand war Chat `01 – RELEASES – iOS / Android / OTA / Stores`
(`01a117fa-4be0-7c43-b1b5-01701e7c7626`, Host `local`) idle. Der MASTER übermittelte
die direkte Nutzerfreigabe für Rückmeldungen und seine eindeutige Ziel-ID.
Auftrag: nur aktuellen Aufgabenstatus, Arbeitsort, Git-Stand und offene Punkte lesen.
Keine Produkt-, Dokument-, Test-, Git-Schreib- oder Release-Aktion beauftragt.

Antwort selbst via `wait_threads` abgeholt; Turn
`01a11b6d-2e1b-7363-b288-da3eca905645`, abgeschlossen 2026-10-08, 14:11 Europe/Zurich.
main-HEAD `153c0aa35c10b485ba584419f5c5e3fa57af2457`, vier bestehende Dokuänderungen;
Release-Worktrees auf `9453d5b`/`122aee5` sauber, iOS-QA-Worktree auf `bd94ff2`
mit uncommitteter Config und eigenem T-65-Bericht. Alle Angaben lokal unabhängig
abgeglichen. EAS/Stores nicht erneut gelesen, historische Release-Belege als solche
gekennzeichnet. Keine Rücknachricht erforderlich oder gesendet. Weiterleitung und
Ergebnisabholung PASS; aktiver Koordinationsablauf nachgewiesen, Scheduler nicht getestet.

### Vorschlag für spätere Nachverfolgung — nicht eingerichtet

Lokal geprüft: keine `automation.toml` unter dem auf diesem Host aufgelösten
CODEX_HOME/automations (0 Dateien). Das ist der lokale Datei-Bestand, keine Aussage
über mögliche Cloud-Schedules. Die Werkzeuge `list_threads`, `read_thread`,
`send_message_to_thread`, `wait_threads` und `automation_update` sind verfügbar.
Erste vier im aktiven Ablauf benutzt; Automation-Ausführung nicht getestet.

Empfohlen: nach separater Freigabe eine read-only Heartbeat-Nachverfolgung in diesem
MASTER alle 30 Minuten für die in ACTIVE_WORK bereits erfassten offenen Aufgaben.
Keine neuen Chats/Worktrees, Produktaufträge oder schreibenden Release-Schritte.
Prüfen: Chat-Zustand, neues Abschlussergebnis/Blockade, Drift von HEAD/Working Tree,
fehlende Integration oder Plattform-/Geräte-QA. Bestehende Statusdateien lesen;
Nachweise im MASTER melden, keine konkurrierende Aufgabenliste anlegen. Keine
laufenden Fachchats unterbrechen und keine identischen Statusaufträge erneut senden.

Nur Abschluss, belegte relevante Änderung, Fehler oder erforderliche Nutzerentscheidung
melden. Unverändert oder bereits gemeldetes Warten bleibt still. Beenden, wenn alle
für diesen Monitor festgelegten Aufgaben nach ihren Kriterien abgeschlossen sind;
auf Nutzerwunsch pausieren/beenden. Bei verlorener Berechtigung/Zugriff einmal konkret
melden und abhängige Schritte stoppen; keine automatischen Reparatur-/Release-Aktionen.

Voraussetzungen: freigegebener Heartbeat im richtigen lokalen MASTER, erreichbarer
Host/Projekt/Worktrees und funktionierende Chat-Werkzeuge im geplanten Lauf. Lokale
Dateiprüfungen benötigen einen verfügbaren Rechner und laufende Desktop-App. Bei der
Einrichtung ersten read-only Lauf prüfen, bevor unbeaufsichtigte Nachverfolgung als
funktionierend bezeichnet wird. Herkunft: aktuell verfügbare Tool-Beschreibung und
[offizielle OpenAI-Dokumentation zu geplanten Aufgaben](https://learn.chatgpt.com/docs/automations?surface=app).
Diese Einrichtung enthält bewusst weder eine neue noch eine geänderte Automation.
