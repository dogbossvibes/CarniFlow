# ANYVO — Agent Handoff (ChatGPT + Codex; optional Claude fallback)

## Start here

For the current ANYVO production baseline, completed work,
active work and open work, read:

`docs/agent/ANYVO_MASTER_STATUS.md`

This is the canonical project status source. Read `ACTIVE_WORK.md` next for scope, owners and worktree routing. Actual repository/Git facts take precedence over stale documentation; current MASTER/ACTIVE_WORK take precedence over historical handoff/task files.

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
| `TASKS.md` | Historisches Task-ID-Ledger; eine dort genannte nächste ID ist keine Reservierung. Aktuelle Owner/Scopes stehen in MASTER/ACTIVE_WORK. |
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
4. Codex prüft Repository/Git-Zustand und liest `AGENTS.md` → kanonischen `ANYVO_MASTER_STATUS.md` → `ACTIVE_WORK.md`; historische Handoff-/Task-Dateien dienen danach nur als geprüfter Kontext.

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

### Nutzeraufträge professionell formulieren — direkte Präferenz 2026-10-29

Vor neuen Arbeitsaufträgen aktuelle Owner, bestehende Tasks und relevante Quellen
prüfen. Kurze oder fehlerhaft formulierte Befehle unter Wahrung von Ziel und
Handlungsabsicht in einen direkt ausführbaren professionellen Auftrag übersetzen
und im autorisierten Scope an den bestehenden Fachchat geben; laufende Tasks
fortsetzen, keine Doppelaufträge. Je nach Aufgabe kompakt Ziel, belegten Iststand,
Scope, geschützte Funktionen/Daten, Anforderungen, Prüfungen, Akzeptanzkriterien,
bei kritischen Aufgaben STOP-Bedingungen und Abschlussbelege nennen. Nichts erfinden.
Keine zusätzliche Bestätigung allein für die Umformulierung; nur echte fehlende
Pflichtinformationen oder nicht autorisierte Aktionen gezielt klären und sichere
unabhängige Arbeit fortsetzen. Nutzer kurz über Auftrag und Empfänger informieren.
Fragen/Ideen/Statusanfragen nicht zu Implementierung oder Release umdeuten.
Umformulierung erweitert keine Git-/Merge-/OTA-/Build-/Store-/DB-Freigabe.
Bestehende Grenzen, Datenerhalt, QA, Kontingentschonung und Quellsicherung gelten
weiter. Keine neuen Chats, Prozessstrukturen, Automationen oder Antwortketten.


### Zuständigkeit und bestehende Quellen

`00-01 – ANYVO MAIN MASTER – Status & Entscheidungen` übernimmt Eingang, Priorisierung,
Abhängigkeiten, Weiterleitung, Ergebniseinholung und nächste Freigabeempfehlung.
Hier keine Produktentwicklung; Umsetzung im passenden bestehenden Fachchat und
isolierten Task-Worktree. ANYVO bleibt eine All-in-One-App für Hundehalter.

Es entsteht keine zweite Statusliste:

- `ANYVO_MASTER_STATUS.md`: einziger operativer Produkt-/Release-Gesamtstand.
- `ACTIVE_WORK.md`: zuständiger Chat, Task/Scope, Branch, Code-Worktree, Writer,
  Abhängigkeiten und nächster Nachweis; kein Ersatz für den Master.
- `PLATFORM_STATUS.md`: Code-, Native-, Runtime-, OTA-/Store- und QA-Parität.
- `TASKS.md`: historisches Ledger stabiler Task-IDs; `tasks/`: Einzelberichte und Belege. Neue IDs nur atomar in der gemeinsamen git-common-dir Registry mit Owner, Zweck und exakter Basis reservieren. Das unabhängig geprüfte Registry-Tool ist lokal integriert; verbindlicher Aufruf und Grenzen in `tasks/T-69.md` (`node scripts/agent-worktree.mjs create` mit exakter Basis, Owner, Zweck und Branch). Verfügbarkeit ersetzt keinen konkreten Arbeitsauftrag; keine IDs aus historischen Zählern vergeben. Bestehende IDs/Owner weiterverwenden.
- `DECISIONS.md`: bestätigte Entscheidungen; `SESSION_HANDOFF.md`: Wiedereinstieg.

Nur der abgestimmte main-Writer pflegt globale Dokumente. Fachchats pflegen ihren
Task-Bericht; dieser ausdrückliche Dokumentationsauftrag erlaubt dem MASTER die
lokale Einrichtung der Koordinationsregeln auf main, keinen Commit/Release.
Eine fremde laufende Session oder fremde WIP-Datei wird dadurch nicht übernommen.

### Browserwahl — direkte Nutzerpräferenz 2026-10-08

Für Browseraktionen in ANYVO allgemein Safari verwenden. Diese direkte Vorgabe
ersetzt die bisherige Browserwahl und gilt auch für Supabase-/RevenueCat-/
Play-/Store-Anmeldung sowie Release- und Geräte-Testkoordination. Bestehende
Chrome-Tabs nicht ungefragt schließen oder fremde Sitzungen verändern.

Falls ein notwendiger Schritt mit den verfügbaren Werkzeugen nicht in Safari
steuerbar ist oder dort die benötigte Anmeldung fehlt, die konkrete technische
Voraussetzung nennen. Nicht automatisch auf Chrome wechseln. Geeignete APIs/CLI
und reine Dokumentrecherche bleiben erlaubt; Browserwahl erweitert keine
Produkt-/DB-/Git-/Releasefreigabe. Bereits autorisierte Prüfungen und bestehende
Zugangsfragen nicht erneut stellen.

### Nutzungskontingent — direkte Nutzerpräferenz 2026-10-08

Der MASTER behält das verfügbare Codex-Kontingent während aktiver Koordination
im Blick: Kontostand zu Beginn größerer Arbeiten und an Build-/Releaseabschlüssen
mit dem Kontingentwerkzeug lesen, keine Werte schätzen. Unterschiedliche
Kontingentfenster getrennt behandeln; fehlt ein Wert, ausdrücklich unbekannt.
Bei deutlichem Verbrauch oder wenig verbleibender Nutzung rechtzeitig knapp
melden und fertige beauftragte Arbeit samt Belegen priorisieren. Keine doppelten
Analysen oder Prüfwiederholungen ohne neuen Befund; notwendige Release- und
Sicherheitsprüfungen vollständig durchführen. Kontingentknappheit erweitert
keine Freigabe und rechtfertigt keine ungeprüfte Veröffentlichung.

Diese Kontingentvorgabe gilt auch im separat autorisierten MASTER-Heartbeat
seit09.10.2026; vor dessen Einrichtung umfasste sie nur aktiveArbeit. Kein
automatischer Kontingentreset. Keine Kontodaten oder laufenden Prozentstände
in die Produktstatusdokumente kopieren.

### Kontingent schonen bei voller Prüfqualität — Nutzerauftrag 2026-10-11

Diese Ergänzung gilt für neue Aufträge und Übergaben; bestehende Modelle und
Denkstufen bleiben unverändert. Keine pauschale Qualitätsreduktion und kein
Versprechen einer prozentualen Ersparnis.

- Genau ein verantwortlicher Implementierer je Aufgabe. Fachreview bei konkretem
  Risiko oder Fachbedarf; keine routinemäßige Mehrfachanalyse desselben Codes.
  Arbeit je Fachgebiet geordnet abarbeiten. Unabhängige autorisierte Arbeit darf
  weiterlaufen; keine unnötigen parallelen Implementierungen.
- Präzisierung vom 2026-10-18: Werkstatt übergibt an den primären Owner; der
  MASTER wird nur für tatsächliche Koordination oder Integration eingebunden
  und dokumentiert die Aufgabe einmal. Keine routinemäßigen Nachrichten an
  mehrere Fachchats pro Zwischenschritt. Weitere Owner nur bei konkreter
  Abhängigkeit oder erforderlichem unabhängigem Review beteiligen.
- Autorisierte unabhängige Arbeit bis zum prüfbaren Abschluss weiterführen,
  statt jeden Teilschritt an den Nutzer zurückzugeben. Bestehende konkrete
  Freigaben weiterverwenden; nur neue irreversible Aktionen oder geänderten
  Scope gesondert vorlegen. Abschluss knapp: Ergebnis, Tests, Restpunkt,
  nächster Schritt und höchstens die tatsächlich erforderliche Rückfrage.
- Der MASTER bewertet kompakte Abschlussbelege am exakten Kandidaten und prüft
  Zuordnung, Änderungen und Prüfgrenzen. Vollständige Owner-Prüfungen nicht
  pauschal reproduzieren. Erforderliche unabhängige Release-, Security- und
  Datenintegritätsprüfungen bleiben verbindlich.
- Einen geprüften Kandidaten nicht erneut vollständig testen, solange Code,
  Basis, Abhängigkeiten und Umgebung unverändert und die Belege gültig sind.
  Neue Änderungen, Fehler oder Risiken verlangen die passende erneute Prüfung.
  Zeitabhängige Production-/Runtime-/Environment-/DB-Preflights und Live-/CDN-
  Nachkontrollen bleiben vor beziehungsweise nach jedem neuen Release frisch.
- Übergaben enthalten Aufgabe, exakten Kandidaten und Belegpfad, Änderungen,
  Checks, Blocker und nächsten Owner. Keine wiederholt kopierte Chatgeschichte
  oder großen Logs; fehlende Details gezielt nachlesen.
- Statusmeldungen nur bei wichtigen Änderungen, Abschluss, Fehlern oder
  Nutzerentscheidungen. Keine gegenseitigen Bestätigungsschleifen oder unnötigen
  regelmäßigen Abfragen. Für nötige Nachverfolgung `wait_threads` mit Host und
  Cursor verwenden; vollständige `read_thread`-Verläufe nur bei fehlender Evidenz.
  Im bestehenden Heartbeat unveränderte oder nicht handlungsfähige Ergebnisse
  still behandeln, keine neuen Prüfaufträge allein durch Zeitablauf.
- Zusammengehörige freigegebene kompatible Fixes bei Bedarf gemeinsam für ein
  Release prüfen. Scope und Freigaben strikt erhalten; dringende Fixes nicht
  aus Spargründen verzögern. Kein zusätzlicher Release allein zum Bündeln.
- Formular-QA (Nutzerregel 2026-10-18): Neue oder geänderte Eingabemasken auf
  iOS und Android mit offener Tastatur prüfen: Fokusfeld sichtbar, Formular
  scrollbar, Speichern/Abbrechen erreichbar; Pickerwechsel, Safe Area und große
  Schrift berücksichtigen. Tatsächliche Geräteprüfung von Codeprüfung trennen.
  Bestehende Eingaben erhalten; keine pauschale Umgestaltung oder Releasefreigabe.
- Kundendatenerhalt, belegte Fehlerursache, relevante Regressionstests,
  Typecheck/Lint/diffcheck, Native-/Runtime-Kompatibilität und ehrliche Geräte-QA
  bleiben Pflicht. Umsetzung, Tests, Integration und Auslieferung getrennt belegen.
  Der Sparauftrag erlaubt keine neuen Automationen, Modellwechsel oder Git-,
  Release-, DB- und Restore-Aktionen und ersetzt keine erforderliche Freigabe.

### Kundendatenerhalt — direkte Nutzeranforderung 2026-10-08

Die verbindliche Regel steht in [AGENTS.md](../../AGENTS.md#kundendatenerhalt-direkte-nutzeranforderung-2026-10-08). Der MASTER nimmt Datenerhalt, Altformat-/Upgrade-Kompatibilität und tatsächliche Prüfbelege in relevante Aufträge/Release-Preflights auf; offene Datenverlustrisiken blockieren Integration/Veröffentlichung. Keine Datenlöschung oder Neuinstallation als Standardlösung und keine daraus abgeleitete DB-/Release-Freigabe.

### Aktive OTA-Nachverfolgung / direkte Dauerfreigabe — 2026-10-09

Der Nutzer hat im MASTER fortlaufend die offenen OTAs für beauftragteANYVO-Arbeit
freigegeben und unbeaufsichtigte Fortsetzung gewünscht. Die verbindliche begrenzte
Freigabe steht in [AGENTS.md](../../AGENTS.md#fortlaufende-ota-freigabe-direkter-nutzerauftrag-2026-10-09).
Vorbereitete Heat-/HelpSheet-Fixes sind enthalten; notwendige isolierte saubere
Release-Commits gemäß früherer Anweisung ebenso. Unabhängige DB-/Build-/Store-/
Push-/main-Merge-Freigaben bleiben nötig. DB-Abhängigkeiten werden nicht übersprungen.

Heartbeat `anyvo-laufende-ota-koordination` ist ACTIVE, alle15Minuten im kanonischen
MASTER `01a117fa-04b7-7992-a485-cfdeca7fcfa6`; Werkzeuganlage undpersistierterTarget/
Schedule geprüft. Kein Cron-Parallelprojekt, keine fremdeAutomation verändert.
Der frühere Vorschlag weiter unten ist historisch. Erster planmäßiger Heartbeat
am 2026-10-09 um 08:00 Europe/Zurich bestätigt: main-Status und Fachchat-Ergebnisse
lesend abgeholt; keine neue Veröffentlichung oder Geräteabnahme daraus ableiten.
Keine Verfügbarkeitsgarantie bei schlafendem/offlinem Rechner oder fehlender Anmeldung. [Offizielle OpenAI-Dokumentation](https://learn.chatgpt.com/docs/automations?surface=app)
verlangt verfügbarenRechner/laufendeApp für lokaleProjekte. Ohne sinnvolleÄnderung
bleibt die Nachverfolgung still; Auslieferungen/Fails/konkreteBlocker meldetMASTER.
Keine automatische Bestätigung von DB-/Store-/Toolfreigaben oder Kontingentresets.

### GitHub-Sicherung veröffentlichter Stände — direkte Nutzerfreigabe 2026-10-18

Aktualisierung20.10.2026: Direkte neue dauerhafte Humanvorgabe inWerkstatt `01a15901-4893-7472-8ceb-50015b376910`, vonMASTER persönlichgelesen: „wichtig unbedingt alles immer auf  Github commiten“. Fertige, sinnvoll geprüfte Änderungen aus ausdrücklich beauftragten Tasks deshalb gezielt in isolierten eigenen Commits sichern und per normalem Push auf dem bestehenden GitHub-Remote ablegen; im Abschluss exakten Commit und frisch bestätigte Remote-Referenz angeben.00koordiniertweiteralleinPushes;OwnerliefernScope/Freeze/Tests. KeinefremdenWIPs/sources/Secrets/Kundendaten/ungeprüftenArtefakteeinchecken. Diese neue Anweisung gilt auch für fertige beauftragte Taskänderungen vor einem Release, erweitert aber weder den Produktumfang noch Freigaben für Force-Push, main-Merge, OTA, nativeBuild, Store, LiveDB oder destruktive Aktionen. Frühere konkrete Ablehnungen nicht umgehen; neue Anweisung und exakten Zielumfang bei erforderlicher Freigabeprüfung belegen. Bereits erledigte Sicherungen/Publishes nicht wiederholen.

Jeder veröffentlichte ANYVO-Stand muss einem eindeutigen tatsächlichen Source-Commit
zugeordnet und auf dem konfigurierten GitHub-Remote gesichert sein. Direkte
Nutzerbestätigung in der Werkstatt: `01a14c2c-fe47-7f40-abc1-1340f224cde5`.
Sie erlaubt die notwendigen isolierten Commits und normalen Pushes geprüfter,
freigegebener Release-Stände; keine pauschale Produkt-, OTA-, Build-, Store-, DB-
oder main-Merge-Freigabe. Frühere allgemeine Push-Vorbehalte bleiben außerhalb
dieses konkreten Sicherungszwecks gültig.

Vor Veröffentlichung: tatsächlichen geprüften Kandidaten sauber committen,
GitHub-Sicherung durchführen und die frische Remote-Referenz sowie Erreichbarkeit
des exakten Source-SHA bestätigen. 00 koordiniert allein die Sicherung/Pushes,
01 liefert die Release-Zuordnung und bleibt alleiniger Publisher. Branchschutz
respektieren; geeigneten Release-Branch beziehungsweise vorhandenen PR-Workflow
nutzen, kein Force-Push, Reset oder unerbetener Merge. Keine fremden WIPs,
Secrets, Outputs oder Kundendaten einchecken.

Im bestehenden Release-Beleg Plattform, Runtime, OTA-Gruppe/Update beziehungsweise
native Build-ID mit Source-SHA und bestätigter GitHub-Referenz verbinden. Lokaler
Commit und OTA-Publish allein belegen keine GitHub-Sicherung. Veröffentlichte
Altstände gezielt anhand vorhandener Belege prüfen und fehlende Originalcommits
sichern; unbekannte Quellen als Lücke ausweisen, keinen nachträglich erfundenen
Commit als Original ausgeben. Dafür weder erneut bauen noch veröffentlichen.

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
   `01a18309-ad36-7ef0-9950-1941ac2c816a` (Host `local`; aktuelles Routing auf direkten Nutzerauftrag 2026-10-28) ausdrücklich autorisiert.
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

### Release-Änderungen und Nutzer-Gerätetests: Chat10

Auf ausdrücklichen Nutzerwunsch im Workflow-Chat (2026-10-08) existiert
`10 – NEU & ZU TESTEN – OTA / Builds`, Host `local`, Chat-ID
`01a11bd3-2259-7be0-b88a-602c07e37c8e`. Der Chat ist Darstellung und Testeingang,
keine zweite operative Release-Steuerung oder konkurrierende Statusquelle.
Die tatsächliche Zuordnung steht in `ACTIVE_WORK.md`; Code-writer bleibt der
zuständige Fachchat, globale Dokumentation beim MASTER.

Nach einem belegten neuen OTA-/Build-/Store-Ergebnis sendet Chat01 im erlaubten
ANYVO-Koordinationsscope eine kompakte Meldung an Chat10: Datum, Plattform,
Appversion/Runtime, Group-/Update-/Build-ID und Source/Beleg; verständliche Änderungen,
Menüweg, konkret erwartetes Verhalten und offene Nutzer-Gerätetests. Keine bloßen
Pläne als verfügbar darstellen. Veröffentlicht, verfügbar, auf dem Gerät installiert
und QA bestanden ausdrücklich unterscheiden. Ein fertiger EAS-Build ist kein
Store-Rollout und eine veröffentlichte OTA kein Nachweis des Geräteempfangs.

Der MASTER prüft die Weitergabe und holt fehlende Ergebnisse selbst ab. Nutzer
können in Chat10 Testergebnisse melden; belegte Ergebnisse und echte Blocker werden
an MASTER/Chat01 zurückgeführt und durch den abgestimmten main-Writer in den
bestehenden Master-/Plattformstatus aufgenommen. Keine automatische Antwortkette,
keine neuen Freigaben aus einer Testmeldung ableiten. Dieser Ablauf richtet keinen
Heartbeat oder anderen Hintergrundtrigger ein.

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

### Historischer Vorschlag vor aktiver Einrichtung am2026-10-09

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
Dieser historische Einrichtungsschritt enthielt damals keine Automation.
Maßgeblich ist inzwischen die aktive OTA-Nachverfolgung vom2026-10-09 oben.

## Versionsregel für native Builds und OTAs (direkter Nutzerauftrag 2026-10-15)

- Weitere Testbuilds vor Veröffentlichung derselben App-Version behalten die Marketingversion und erhöhen nur die eindeutige Buildnummer, z. B. `1.0.5 (51)` → `1.0.5 (52)`.
- Ein neues natives App-Store-Update nach veröffentlichter Version1.0.5 erhält eine höhere Marketingversion und passende neue Buildnummer, z. B. `1.0.6 (53)`.
- Ein kompatibler OTA-Fix ändert weder Marketingversion noch Buildnummer. Eine weitere Buildnummer allein begründet keine neue OTA-Runtime; bei geänderter nativer Kompatibilität die Runtime kontrolliert trennen.

Vor jeder Nummern-/Runtimeänderung Istzustand von App-Konfiguration, Runtime-Policy, EAS-Versionierungsquelle/autoIncrement, Release-Skripten und tatsächlich installierten103/104/105-Basen prüfen. Tatsächlichen Änderungsverursacher belegen; keine automatische Marketingversionserhöhung unterstellen. Die vorhandene Kopplung von Runtime und Marketingversion nicht ohne gesonderte Kompatibilitätsprüfung umbauen. Bestehende Builds nicht umbenennen/rebuilden und Produktionskanäle nicht nachträglich umhängen. Diese Prozessregel allein autorisiert keinen neuen Build, Commit, Push, Release oder Änderung laufender Build51-Konfiguration. 01 prüft die Ursachen im gesonderten Build51-Abnahmebericht; globale Dokumentpflege bleibt beim MASTER.

### iOS Build53 / Motion3 im Release-Preflight — Nutzerauftrag 2026-10-20

Der beauftragte Crash-Fix-Build `1.0.5 (53)` verwendet wegen geänderter nativer AIRMap-Kompatibilität Runtime `1.0.5-motion-v3`. Native Basis: Source `82786fdf79d74a1599fb65e165fff145388d2b81`, GitHub `refs/heads/release/source-82786fdf79d7`, EAS `9ae7f3f9-f560-4eb9-b356-5f66e6d125c4`. Tatsächliches IPA: Production-Channel-Header, Updatecheck ALWAYS, Channel production → Branch production. Apple-TestFlight-Verfügbarkeit bestätigt; Geräteempfang bleibt laut MASTER-Endbeleg ungeprüft.

Aktualisierung20.10: Erste Motion3-OTA abgeschlossen, kein HTTP204 mehr: P1-Source `42d28edb532e02fdf5746b3e819c4630573bf7c4`, Gruppe `fa92e714-0686-45d8-8048-76c83f0169b5`, Update `01a1599a-55a9-7fb9-b5e4-c3d87445a7c4`, GitHub `refs/heads/release/source-42d28edb532e`. Originaler Initial-Runtime-Guard mit nativer53-/Source82786-Basis erfolgreich verwendet. Beleg `outputs/p1-line-ema-release-01-2026-10-20/FINAL-RUNTIME-MATRIX.json`: sechs neue P1-Routen, fünf Legacyrouten unverändert. Frühere HTTP204-Aufnahme im Crash-Build-Ordner bleibt historisch.

Aktueller Motion3-Stand nach Journal-V2 am20.10: Source `fb81698baced0a166432b175c5c37bdc39c6f192`, Gruppe `0b336b13-3978-4580-9b49-03f2265c2756`, Update `01a15b1f-c9f2-7404-bacd-769a47bff37c`, GitHub `refs/heads/release/source-fb81698baced`. Normale frische OTA-Ancestry wurde verwendet; die oben genannte erste P1-OTA bleibt historische Erstfreigabe. Aktuelle weiteren Runtimes und Endbelege stehen ausschließlich im kanonischen MASTERstatus; keinen alten Source ungeprüft als aktuelle Basis verwenden.

Jedes künftig einzeln freigegebene gemeinsame iOS-OTA-Paket muss Motion3 zusätzlich zu den weiter unterstützten Runtimes im Quellen-/Ancestry-/Environment-/Native-/DB-/Asset-/Manifest-CDN-Preflight berücksichtigen. Für weitere Motion3-OTAs die frisch aktive OTA-Quelle und normalen Ancestry-Guard verwenden; Initial-Runtime-Flag nicht erneut verwenden. Native53-Basisbeleg erhalten. Alte inkompatible Runtime nicht übernehmen, Runtimechecks nicht umgehen; keine pauschale Freigabe unbekannter künftiger Inhalte. Bestehende Funktionserhaltung,01 als alleiniger Publisher und ausdrücklich vertagte Gerätetests bleiben verbindlich.
