# Joker/Gummi auf iOS Build 52 nach Hilfe und Teilen

## Auftrag und Basis

Chat 02 führt den bereits geprüften Joker/Gummi-R3-Stand mit der von Chat 01
veröffentlichten Hilfe-/Teilen-Basis zusammen. Die bestehende Nutzerfreigabe
umfasst die Veröffentlichung über Chat 01 nach abgeschlossener Serverabnahme.

- Eigener Worktree: `anyvo-tracking-jokers-ios52-after-help`
- Branch: `feat/tracking-jokers-ios52-after-help`
- Basis und unveränderter HEAD: `d8bc3b7e4869d8022b6c23ec5a28c60b0ef2f757`
- Ausgangszustand sauber; keine fremden Änderungen übernommen.
- R3-Quelle: `outputs/tracking-joker-guidance-r3-2026-10-18/native52-r2/manifest-r3.json`
- R3-Basis: `fe1e383b9f7d13c8ec328e080889f8f1380f9e7d`

## Zusammenführung

Alle 77 Dateien des eingefrorenen R3-Pakets sind übernommen. 69 sind bytegenau
identisch zur Quelle. Drei Codedateien wurden per Dreiwegevergleich zusammengeführt:

- `app/track/[id].tsx`: Hilfe-Schaltfläche bleibt erhalten; Zählung und Analyse
  verwenden weiterhin die geprüfte Joker-Projektion.
- `features/tracking-exchange/contract.ts`: der für Teilen erforderliche
  `label`-Export bleibt erhalten; Materialprüfung und Nummerierung verwenden
  die geprüfte Joker-/Gummi-Logik.
- `features/tracking-transfer/TransferScreen.tsx`: der neue UI-Kontext,
  Eingangs-/Ausgangsansichten und gezielte Übergaben bleiben erhalten;
  die Vorschau zählt nur bewertete Gegenstände.

Die fünf Sprachdateien erhalten jeweils ausschließlich fünf zusätzliche
Joker-Schlüssel. Entfernt man diese hinzugefügten Zeilen, entspricht jede Datei
bytegenau der Hilfe-/Teilen-Basis. Alle übrigen 41 Dateien dieses Basis-Commits
bleiben bytegenau unverändert.

Dieses Dokument ist die einzige zusätzliche Datei gegenüber den 77 R3-Dateien.
Native Quellen, App-Konfiguration, Runtime, Dependencies, globale Statusdateien,
GPS-/Sensor-/Winkelschwellen und alle anderen Plattform-Worktrees bleiben unverändert.
Der lokale `node_modules`-Symlink dient nur der Prüfung und gehört nicht zum Patch.

## Prüfung

- 26 gezielte Jest-Suites / 227 Tests PASS: Hilfe, Teilen, Transfer, Dateiaustausch,
  Joker-Projektion, Gegenstandskorrekturen, Export sowie Voice-/Haptik-Isolation.
- TypeScript `--noEmit`: PASS.
- ESLint auf allen acht zusammengeführten Code-/Sprachdateien:
  PASS, keine Fehler oder Warnungen.
- `git diff --check`: PASS.
- Alle ursprünglichen R3-Dateihashes und der ursprüngliche Patchhash erneut
  geprüft; eingefrorene Quellen unverändert.
- 41 unveränderte Hilfe-/Teilen-Dateien und alle 77 Port-Dateihashes überprüft.

Die Tests sind gezielte Integrationsregressionen und überlappen frühere
R3-Prüfungen; Zahlen nicht addieren. Keine neue Geräteabnahme behauptet.

## Server und Release

Die vereinbarte Serverabnahme von Chat 05 ist bestanden und durch Chat 02 anhand
der Belege und Prüfsummen bestätigt (`r4-final-server-acceptance.json`).
Sie umfasst Materialtransfer, Kopie, Zählung, Isolation, Replay, Speichern,
Wiederherstellung sowie C1-v2-Projektion und Zugriffsablehnungen. Positive
C1-Schreiboperationen wurden im letzten reinen Lese-/Ablehnungslauf nicht neu
über HTTP getestet.

Der neue Port wird mit Dateihashes und Patch an Chat 01 zur unabhängigen Prüfung
übergeben. Chat 01 verantwortet den isolierten Release-Commit, die konkrete
Quellensicherung, den frischen EAS-/Runtime-/Environment-Preflight und die
Veröffentlichungs- und Auslieferungsprüfung.

Durch diesen Port: kein Commit, Push, Merge, OTA, Build, Store- oder DB-Eingriff.
Geräte-QA bleibt offen.
