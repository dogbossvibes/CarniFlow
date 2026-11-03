# Anyvo — BMAD schlank

Eingerichtet am 2026-11-01: offizielles BMAD **6.12.4**, Modul `bmm` plus
benötigter Core, für Codex und Claude Code. Keine Erweiterungsmodule oder
Kompatibilitäts-Shims. `uv` ist als notwendiges Hilfsprogramm installiert.

## Start

BMAD bei jedem Anyvo-Auftrag automatisch berücksichtigen und den Umfang nach
Komplexität und Risiko wählen, ohne gesonderte Aufforderung. Das gilt für Codex
und Claude. BMAD läuft als Arbeitsweise im jeweiligen Auftrag, nicht als
Hintergrunddienst. Bestehende Freigabegrenzen bleiben unverändert.

- Bei jeder Aufgabe Ziel und Erfolgskriterium klären, betroffene Stellen und
  Auswirkungen prüfen, im beauftragten Umfang arbeiten und angemessen
  verifizieren. Reine Prüfaufträge bleiben lesend.
- Für kleine klare Aufgaben mit geringem Risiko reichen diese Grundschritte
  kompakt im Arbeitsablauf und Abschlussbericht. Keine separate Spezifikation
  allein wegen BMAD und keine künstlichen Rollenwechsel.
- Komplexität und Risiko getrennt bewerten: Auch eine kleine Änderung an Auth,
  Berechtigungen, Kundendaten, Persistenz oder Tracking kann vertiefte Analyse,
  Regressionstests und ein Review erfordern.
- Bei unklaren Anforderungen oder größeren Funktionen den passenden
  Spezifikations-/Umsetzungsablauf nutzen; Architektur und vertiefte Reviews
  nach Bedarf ergänzen. Vorhandene Spezifikationen und Prüfbelege wiederverwenden.
- Den gewählten Umfang kurz nennen; bei kleinen Aufgaben genügt eine knappe
  Arbeitsankündigung. Dafür keine zusätzliche Bestätigung verlangen.
- Vor Nutzung den tatsächlichen Skill unter `.agents/skills/<name>/SKILL.md`
  (Codex) bzw. `.claude/skills/<name>/SKILL.md` (Claude) lesen. Fehlt er in der
  Werkzeugliste, die lokale Anleitung und referenzierte Dateien direkt lesen.
  Fehlende Installation offen benennen, keine BMAD-Ausführung vortäuschen.
- Zusätzliche Agenten, parallele Reviews und Party Mode nur auf ausdrücklichen
  Nutzerwunsch. Ohne Delegationsfreigabe die nötigen Prüfschritte nacheinander
  im aktuellen Agenten bearbeiten und fehlende unabhängige Prüfung benennen.

Im jeweils vereinbarten aktuellen Anyvo-Checkout arbeiten (`package.json` mit
`name: anyvo`); nicht im äußeren Expo-Starter oder ungeprüft im alten September-Zweig.
Codex bzw. Claude nach der Installation neu öffnen, damit die lokalen Skills
erkannt werden. Bei Bedarf `bmad-help` aufrufen; Claude bietet dafür
`/bmad-help`, `/bmad-spec`, `/bmad-build` und `/bmad-code-review` an.

- Klar umrissener fachlicher Fix: Ziel beschreiben, `bmad-build` nutzen, Ergebnis prüfen.
- Größere Funktion: mit `bmad-spec` eine kurze Spezifikation erstellen: Warum,
  Fähigkeiten, Grenzen, Nicht-Ziele und Erfolgskriterium. Danach `bmad-build`.
- Prüfung: passende Tests und `bmad-code-review`, Befunde beheben und Ergebnis
  im vorhandenen Aufgabenreport dokumentieren. Geräteprüfung bei nativen oder
  GPS-bezogenen Änderungen getrennt ausweisen.
- PRD, Architektur, Sprintplanung und weitere Rollen nur bei tatsächlichem Bedarf.
  Keine automatische Nutzung von Party Mode oder parallelen Agenten.

## Gemeinsame Wahrheit für Codex und Claude

`AGENTS.md` bleibt das Regelwerk; `CLAUDE.md` importiert es. Vor jeder Sitzung
das dortige Startprotokoll ausführen. Bestehende Quellen weiterverwenden:

| Information | Datei |
|---|---|
| Geprüfter Gesamtstatus und Integrationsplan | `ANYVO_MASTER_STATUS.md` |
| Aktive Arbeit, Owner und Stops | `ACTIVE_WORK.md` und tatsächlicher Git-/Codezustand |
| Aufgaben-IDs | Gemeinsame atomare Taskregistry gemäß `AGENTS.md` |
| Aktuelle Aufgabenbelege | `tasks/<TASK-ID>.md`, gegen MASTER/ACTIVE_WORK geprüft |
| Historische technische Unterstützung | `CURRENT_STATE.md` |
| Ergänzende Übergabehistorie | `SESSION_HANDOFF.md` |
| Historisches Task-Ledger | `TASKS.md`; keine ID-Vergabe daraus |
| Technische Entscheidungen | `DECISIONS.md` |
| Verlauf | `WORK_LOG.md` |
| Neue Specs und Arbeitsergebnisse | `../../_bmad-output/` |

Die Dokumentpfade sind relativ zu diesem Ordner. BMAD verwendet
`docs/agent` als langfristige Wissensquelle. Kein zweites Backlog und keine
vollständige Neudokumentation. Specs aus dem bestehenden Aufgabenreport verlinken.
Aufgaben-IDs ausschließlich über die aktuelle atomare Taskregistrierung vergeben.
Historische Zähler in `TASKS.md` sind keine Reservierung. MASTER_STATUS und
ACTIVE_WORK bestimmen aktuellen Scope, Owner und Stops; andere Dateien ergänzen sie.
Alte Branch-, Release- und Testangaben sind historische Aussagen, kein Nachweis
für den aktuellen Stand.

## Übergabe an Claude

1. Im selben Checkout arbeiten oder die eingecheckten BMAD-Dateien mitnehmen.
2. Manuelle Übergabe mit Ziel, Änderungen, Prüfungen und nächstem Schritt pflegen.
3. Codex: `npm run agent:handoff -- --agent=codex`.
   Claude: `npm run agent:handoff -- --agent=claude`.
4. Der übernehmende Agent prüft Branch, Dateien und `npm run agent:status`.

Die bestehenden Freigabegrenzen bleiben gültig, auch falls ein BMAD-Workflow
Commits oder Veröffentlichung vorschlägt. Die Installation wurde mit PR #11
in `main` integriert. Andere Checkouts erhalten Änderungen erst durch einen
gezielten Transfer; fremde lokale Änderungen dabei bewahren.

## Wartung

Installer-Version bewusst festhalten: `6.12.4`. Kein automatischer Wechsel auf
v7 Preview. Team-Anpassungen liegen updatefest in `_bmad/custom/config.toml`;
persönliche Einstellungen und Render-Dateien sind ignoriert. Die installierten
Skills unter `.agents/skills/` und `.claude/skills/` sowie `_bmad/` gehören bei
einem späteren Commit zusammen. `_bmad-output/` mit geprüften Specs mitnehmen.

Reproduzierbare Installation (aus diesem Projektordner):

```sh
npx --yes bmad-method@6.12.4 install --modules bmm --tools codex,claude-code --user-name Moyo --communication-language German --document-output-language German --output-folder _bmad-output --set bmm.project_knowledge=docs/agent --no-shims --yes
```

Quellen: https://github.com/bmad-code-org/BMAD-METHOD/tree/V6.12
und die Hilfe des offiziellen Installers `bmad-method@6.12.4`.

## Grenze der Native-Hookanalyse

Die vorhandene Analyse prüft bekannte native Pfade, Paketverträge und direkte
Hook-/Aliasreferenzen. Transitive Imports eines unveränderten Setupskripts sind
kein vollständig geprüfter Abhängigkeitsgraph. Änderungen an solchen Helfern
benötigen eine gesonderte Native-/Buildprüfung; ein JS-only-Ergebnis allein ist
dafür keine Freigabe. Diese bereits bestehende Grenze wird hier nicht durch eine
ungeprüfte neue Abhängigkeitsanalyse ersetzt.
