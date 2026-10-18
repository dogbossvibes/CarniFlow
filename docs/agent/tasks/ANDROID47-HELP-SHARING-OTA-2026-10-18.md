# Android Build 47: Hilfe und Fährten teilen — 2026-10-18

Verantwortlich: Chat 01, Quellpakete Chat 07. Eigener Worktree
`anyvo-release-android47-open-ota`, Branch `release/android47-open-ota`.
Exakte native Basis: `39964e1f073e34783fa80d7603b12c0591688826`, EAS-Build
`8c30df7d-2f6b-4858-8b40-93370575c98c`, Android 1.0.5, versionCode 47,
Runtime 1.0.5, Production. Der Nutzer hat nach der Build-47-Lückenliste
ausdrücklich „bitte ergänzen und ausführen“ beauftragt.

## Auslieferungsumfang

- Neuer Einstieg „Fährten teilen & Gruppen“ mit Übersicht, Eingang, Gesendet,
  Kontakten, drei Fachaktionen und untergeordnetem Dateiimport. Bestehende
  Transfer-/Datei-/Gruppenabläufe und konkrete Deep-Links bleiben erhalten.
- Eingangsprojektion aus bestehenden kontogebundenen Transferdaten und lokalen
  Dateiaufgaben/übernommenen Rückgaben. Externe Dateizustellung wird nicht als
  bestätigter Versand oder Empfang ausgegeben. Gruppeneingänge bleiben im
  bestehenden gated Gruppenbereich. Die Übersicht liest nur Metadaten.
- Erste Schritte, optionaler Rundgang, aktualisierte kontextuelle Hilfe,
  Scroll-/Großschrift-Verhalten und abgesicherter kontogebundener Hilfestatus.
  47 Hilfekeys wurden gezielt in fünf Sprachen übertragen; alle anderen
  Dictionarywerte bleiben erhalten. Sharing registriert 52 eigene Keys pro Sprache.

## Quellen und Anpassung

Help-Freeze SHA256 `790b5c3a1b85283107ce08484aab1df8f208425fb792737c8e9f58f6908d8ba2`;
Sharing-Freeze SHA256 `438581f9f6a1f46b6b5ab0e49548b0c2c37380cb82fc58323337fae757a76395`.
Die alte Entwicklungsbasis 7521 wird nicht direkt veröffentlicht. Drei Dateien
wurden auf die echte Androidbasis zusammengeführt: Auswertung behält Androidlayout
und Gap-Sperre; ExchangeScreen behält `mainReferencePoints`; TransferScreen behält
Gap-Warnung und Übernahmesperre. Die funktionalen Owner-Deltas bleiben erhalten.

Alle 47 Zusatzdateien des nativen Builds gegenüber seiner Android104-Basis sind
unverändert: DailyWidget, TaskManager, native Konfiguration, Runtime, Dependencies,
Postinstall-Commitstamp und Dienste. Kein GPS-/Score-/Recorder-Algorithmus geändert.
Keine neue DB-Schnittstelle, Migration oder DB-Installation erforderlich.

## Unabhängige Prüfung

Auf diesem tatsächlichen Android47-Integrationsstand: **43 Suites / 362 Tests PASS**,
vollständiger TypeScript-Check PASS, ESLint aller 46 erfassten TS/TSX-Dateien mit
0 Fehlern und 0 Warnungen, `git diff --check` PASS. Enthalten: Hilfe/Kontoisolation,
Navigation/Altlinks, Sharingprojektion/Metadaten, Offline/Resume/ABA/Ablauf,
Transfer/Gap/Cloud-Overwrite/Recovery sowie bestehende Connection-/Health-Regressionen.
Die Testmengen werden nicht mit Ownerläufen addiert.

Visuell geprüfte RN-Web-Vorschau stammt aus der echten SharingView mit externen
synthetischen QA-Daten. Keine echte Geräte-, Screenreader- oder Empfangsabnahme
behauptet. Keine Demo-Datensätze in das Produkt übernommen.

## Releasegates und Abgrenzung

Vollständiger Production-Export mit SourceMap-/Commit-/Asset-Abgleich und frischer
repo-eigener Guard stehen nach dem isolierten Commit an. Bei weiterhin fehlender
Android105-OTA muss der Originalwrapper den Initial-Modus mit exakt dem obigen
nativen Basis-Build verwenden; niemals eine fremde Runtime als Basis wählen.
Neue exakte GitHub-Quellref benötigt eigene Pushfreigabe; die frühere Neun-Ref-
Freigabe wird nicht erweitert. Kein main-Push oder Merge.

Joker/Gummi ist separat vorbereitet und wegen ausstehender realer Backend-HTTP-QA
nicht Teil dieses Kandidaten. Keine DB-Write-, native Build- oder Storeaktion.
Veröffentlichung und tatsächlicher Geräteempfang sind zum Commitzeitpunkt nicht
behauptet. Release-Nachweise liegen außerhalb des Produktbaums unter
`outputs/android47-open-ota-01-2026-10-18/`.
