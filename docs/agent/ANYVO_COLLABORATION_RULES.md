# ANYVO — Zusammenarbeit und Rollen

Teil der zentralen Projektübergabe (2026-11-08, T-181). Verwandt:
[Produktkontext](ANYVO_PRODUCT_CONTEXT.md) ·
[Release-Geschichte](ANYVO_RELEASE_HISTORY.md) ·
[Architektur](ANYVO_ARCHITECTURE_AND_CRITICAL_AREAS.md) ·
[Repository-Inventur](REPOSITORY_INVENTORY.md) ·
[Claude-Umgebung](CLAUDE_ENVIRONMENT.md).

Die verbindlichen Regeln stehen in `AGENTS.md` (gemeinsam) und `CLAUDE.md`
(Claude-spezifisch). Dieses Dokument fasst Rollen und Informationsquellen zusammen
und ersetzt diese Regeln nicht.

## 1. Rollen [Nutzervorgabe 2026-11-08]

| Rolle | Verantwortung |
|---|---|
| **Claude** | Hauptentwickler: Analyse, Umsetzung, Tests, Dokumentation, Issues/PRs, Release-Vorbereitung |
| **ChatGPT** | unabhängige Kontrolle: Architektur-Review, QA, Risikoanalyse, Release-Koordination |
| **Codex** | bisheriger Entwicklungsagent, viele bestehende Worktrees und Owner-Rollen (Werkstatt, 01 Publisher, 07 Review laut Projektdoku). **Seit 2026-11-08 keine neuen Schreibaufträge** (siehe 1a) |
| **OpenCode** | Entwicklungsagent der SDK-58-/iOS60-Linie (T-179, T-180). Die drei iOS-OTAs vom 2026-11-07 wurden nachweislich aus Worktrees veröffentlicht, in denen OpenCode arbeitete [B: Zeitstempel der `dist/`-Exporte und `.opencode/`-Ordner]. **Seit 2026-11-08 Ausweichlösung mit DeepSeek:** arbeitet nur auf ausdrücklichen Auftrag der Nutzerin (siehe 1a) |
| **GitHub** `dogbossvibes/CarniFlow` | zentrale versionierte Codebasis (**öffentliches** Repository) |
| **EAS** | tatsächliche Build- und OTA-Production-Stände |
| **Nutzerin** | Produktentscheidungen, alle Freigaben (Commit/Push/Merge/Build/OTA/Store/DB) |

## 1a. Entscheidungen der Nutzerin vom 2026-11-08 [N, verbindlich]

- **Claude Code ist der primäre Entwicklungsagent für ANYVO.**
- **Codex erhält vorerst keine neuen Schreibaufträge.** Laufende
  Arbeiten werden nicht automatisch abgebrochen oder verändert; ihre Worktrees und
  uncommitteten Änderungen bleiben unangetastet.
- **Der Wechsel zu Claude Code ist vollzogen.** OpenCode mit DeepSeek ist die
  Ausweichlösung und arbeitet nur auf ausdrücklichen Auftrag der Nutzerin; die
  Freigaberegeln gelten dann unverändert.
- **Jeder Commit, Push, Merge, Build, jedes OTA, jede Store- und jede
  Datenbankänderung braucht eine ausdrückliche Einzelfreigabe der Nutzerin.** Die
  stehende Push-Freigabe für Task-Branches aus `GITHUB_AUTOSYNC.md` (2026-11-05) gilt
  bis auf Widerruf nicht mehr; auch `npm run agent:github:push` nur nach Freigabe.
- Bestehende Arbeit wird vollständig erhalten: keine Worktrees löschen, bereinigen
  oder zurücksetzen.
- Das Repository bleibt vorerst öffentlich. Sichtbarkeit und Berechtigungen ändert
  nur die Nutzerin.
- Ordnerfreigaben auf dem Mac werden einzeln begründet; Finanzkonten und
  Zahlungsportale werden nie ohne vorherige ausdrückliche Einzelfreigabe geöffnet.

## 2. Wissensquellen und ihr Gewicht

1. **Frische Fakten:** Code, Git, GitHub und EAS, gelesen zum Zeitpunkt der Aussage.
   Sie entscheiden technische Fragen.
2. **Nutzerentscheidungen:** gelten als Produktvorgaben. Weichen sie vom Code ab,
   wird der Widerspruch benannt und nicht eigenmächtig aufgelöst.
   - Beispiel NEWBIE und Fährte: Ich habe den Widerspruch gemeldet und die Nutzerin
     am 2026-11-08 gefragt. Ihre Entscheidung lautet „1 Fährte pro Monat“, also wie
     im Code.
3. **Kanonische Statusdoku** (`anyvo-main/docs/agent/ANYVO_MASTER_STATUS.md`,
   `ACTIVE_WORK.md`): Koordinationsstand. Datierte Angaben vor Verwendung neu prüfen.
4. **ChatGPT-Projektgeschichte und Task-Berichte:** wichtige historische Belege, aber
   nicht die alleinige Quelle. Übernahme nur mit Kennzeichnung [N] oder [H], bis sie
   bestätigt sind.

In allen Berichten werden **bestätigte Fakten, Vermutungen, offene Prüfungen und
erledigte Arbeit** getrennt.

## 2a. Wo welche Information gepflegt wird

| Information | Gepflegt in | Wer pflegt | Wann |
|---|---|---|---|
| Verbindliche Agentenregeln | `AGENTS.md` (alle), `CLAUDE.md` (Claude) | Claude, nur nach Nutzerentscheidung | bei Regeländerung |
| Einstieg und Übersicht | `docs/agent/ANYVO_MASTER_CONTEXT.md` | Claude | bei jeder bestätigten Statusänderung, die eine Sitzung kennen muss |
| Produkt, Pläne, Rechte | `ANYVO_PRODUCT_CONTEXT.md`; Entscheidungen zusätzlich `DECISIONS.md` | Claude nach Nutzerentscheidung | bei Produktentscheidung |
| Builds, Runtimes, OTAs | `ANYVO_RELEASE_HISTORY.md`; je Production-OTA zusätzlich eine Release-Karte (Issue + GitHub-Projekt, `AGENTS.md`) | Claude; Release-Karte durch den Publisher (Claude-MASTER) | nach jedem Build, OTA oder Store-Schritt, mit frischen EAS-Daten |
| Architektur, kritische Bereiche | `ANYVO_ARCHITECTURE_AND_CRITICAL_AREAS.md` | Claude | bei Architekturänderung |
| Kundenprobleme | `ANYVO_CUSTOMER_ISSUE_HISTORY.md` (ohne Personendaten) und GitHub-Issues | Claude | bei Meldung, Ursache, Fix, Test |
| Verzeichnisse | `ANYVO_DIRECTORY_MAP.md` (öffentlich, `~`-Pfade), Vollfassung lokal im Backup | Claude | bei neuen relevanten Worktrees |
| Laufende Aufgaben, Koordination | `ACTIVE_WORK.md`, `ANYVO_MASTER_STATUS.md` (kanonisch im main-Worktree) | nur der Claude-MASTER (Sitzung „ANYVO MASTER“ im main-Worktree, siehe `AGENTS.md`) | nach bestätigtem Statuswechsel |
| Einzelaufgabe | `docs/agent/tasks/T-<n>.md` | Claude je Task | während und am Ende der Aufgabe |
| Kontrolle und Gegenprüfung | Berichte unter `docs/agent/audits/` und PR-Beschreibungen | Claude erstellt, ChatGPT prüft | vor Merge und Release |
| Code | GitHub `dogbossvibes/CarniFlow` (PR mit Quality Gate) | Claude | Commit/Push/PR nur mit Freigabe |
| Production-Stand | EAS (Builds/OTAs), Supabase, RevenueCat, Stores | Nutzerin gibt frei | nie aus der Doku ableiten, immer frisch lesen |

**Änderungen dokumentieren:**
- Jede Änderung bekommt einen Task-Report mit Ziel, geänderten Dateien, Ursache/Lösung,
  Tests, Commit/Branch und Restrisiken.
- Jede bestätigte Statusänderung kommt zusätzlich in das passende Dokument oben.
- Angaben werden gekennzeichnet: [B] bestätigt mit Datum, [N] Nutzerangabe, [H] historisch,
  [O] offen.
- Personendaten, Kunden-IDs und Secrets kommen **nie** in das öffentliche Repository.

## 3. Arbeitsablauf (Kurzfassung)

1. `/anyvo-start`: Ort, fremde Änderungen, frischer GitHub- und EAS-Stand, Owner;
   eigener Task-Worktree mit atomarer Task-ID.
2. BMAD-Umfang nach Risiko wählen (`docs/agent/BMAD.md`).
3. Umsetzen (`/anyvo-feature`); kritische Bereiche mit Fach-Review.
4. Prüfen (`/anyvo-quality`, `/anyvo-mobile-test`), Task-Report pflegen,
   abschliessen (`/anyvo-abschluss`).
5. Übergabe an ChatGPT zur Kontrolle: Branch/HEAD, Diff, Checks, offene Risiken.
6. Commit, Push, PR, Build, OTA und Store nur nach jeweils eigener ausdrücklicher
   Freigabe; Releases über `/anyvo-release-preflight`.

## 4. Grundsätze für Releases und Migrationen

- **Build 57 ist die Funktionsreferenz.** Keine Auslieferung, die ihn durch einen
  älteren Stand ersetzt.
- **SDK-Migrationen und Funktionsentwicklung sind getrennte Aufgaben.** Jede hat
  eigenen Branch, eigene Prüfung und eigene Freigabe.
- Pakete aus Build 59 werden nur einzeln, geprüft und freigegeben übernommen.
- Production-OTA nur über den Wrapper mit `--environment production` und einem
  frischen Ancestry-Preflight (CLAUDE.md).
- Der Quellstand jeder Production-Auslieferung muss auf GitHub (`release/source-<sha>`)
  oder mindestens als geprüftes lokales Bundle gesichert sein (siehe Audit).

## 5. Fremde Arbeit

- Worktrees anderer Agenten, uncommittete Änderungen und globale Koordinationsdateien
  werden nicht verändert. Bei Bedarf wird der Owner gefragt.
- Das Repository ist öffentlich. Keine Evidenzdateien mit Personendaten
  (`*-PRIVATE.json`), Secrets oder internen Kundendaten committen.
