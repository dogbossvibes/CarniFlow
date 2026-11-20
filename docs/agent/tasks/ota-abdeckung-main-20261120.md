# OTA-Abdeckung von `main`: was fehlt wirklich? (Stand 2026-11-20)

Nur lesende Untersuchung. Kein Code geändert, keine OTA, kein Build, keine DB-Aktion,
keine CI-Läufe, keine `.env*`-Datei gelesen.

## Kurzfassung

- Die Abdeckungsprüfung meldet für `main` (`a5f35771`) **16 frühere Production-OTAs als
  fehlend** (8 iOS, 8 Android, alle vom 16. bis 20.11.2026).
- **Keine dieser 16 Meldungen ist ein echter Verlust.** Alle gemeldeten App-Dateien sind auf
  `main` Byte für Byte gleich wie im heute aktiven Production-Stand, mit zwei Ausnahmen, die
  nur je eine Kommentarzeile betreffen. Der Rest sind Dateien, die gar nicht in die App
  gelangen (`.maestro/`, Skript-Einträge in `package.json`).
- Grund für die Meldungen: Die Prüfung vergleicht jede OTA einzeln mit `main`. Wurde eine
  Datei später weiterentwickelt (auf `main` und in späteren OTAs), passt der alte
  Zwischenstand nicht mehr Zeile für Zeile. Das ist ein Fehlalarm der Methode, kein Verlust.
- **Echte Lücke, aber ausserhalb der 16 Meldungen:** Auf der Android-Linie (Build 53) liegen
  drei Änderungen, die `main` nicht hat, darunter **T-209 «Absuche bei ausgeschaltetem
  Bildschirm wach halten»**. Die Prüfung sieht sie nicht, weil sie mit dem nativen Build kamen
  und nicht per OTA. Wird der nächste Android-Build von `main` gebaut, ohne das nachzuziehen,
  geht dieses Verhalten für Android-Kundinnen verloren. In `ACTIVE_WORK.md` ist das bereits
  als «main hinter Production» notiert.

## Geprüfte Stände

| Was | Stand |
| --- | --- |
| Kandidat `origin/main` | `a5f35771` (nach Merge PR 208, 205, 196, 200) |
| Aktive Production iOS (`1.0.8-sdk58-v1`) | Commit `bf23cae0`, Gruppe `6e8e1d29`, 20.11. 19:34 UTC, frisch aus EAS gelesen |
| Aktive Production Android (`1.0.8-sdk58-android-v1`) | Commit `dc8f756f`, Gruppe `1afbcbc3`, 20.11. 19:39 UTC, frisch aus EAS gelesen |
| Gemeinsamer Vorfahre beider Release-Stände mit `main` | `9f69f9cb` (Merge PR 203) |

Befehl: `node scripts/check-ota-coverage.mjs --candidate origin/main --live`
Ergebnis: 473 Production-OTAs geprüft, 295 enthalten, 162 ausgenommen, 16 offen (Exit 1).

Hinweis: Am Vormittag waren es 12, während der Untersuchung zuerst 14 (Stand `bf414037`),
dann 16. Die Zahl wächst, weil `main` weitergeht (PR 205 änderte `.maestro/`, PR 208 und 196
änderten `package.json`). Inhaltlich kam nichts dazu.

## Der wichtigste Beleg

Vergleich des ganzen Quellbaums (nicht nur der gemeldeten Dateien) zwischen dem gemeinsamen
Vorfahren `9f69f9cb` auf `main` und den aktiven Production-Commits:

- **iOS `bf23cae0`:** Unterschied nur 2 Dateien, je 1 Zeile, beides `eslint-disable`-Kommentare
  (`features/tracking-exchange/ExchangeScreen.tsx`, `features/tracking-exchange/live/useLiveShare.ts`).
- **Android `dc8f756f`:** dieselben 2 Kommentarzeilen plus die Android-Linie (siehe Abschnitt
  «Zusätzlicher Befund»).

Alles andere, was Kundinnen heute per OTA haben, steht also auf `main`. Seit `9f69f9cb` hat
`main` nur dazugewonnen (nativer Google-Login fürs nächste Build, Release-Skripte,
Maestro-Tests, Android-Startlogo, Doku).

## Einordnung je gemeldeter OTA und Datei

Legende:
(a) nur Kommentar/Formatierung oder Datei gehört nicht zur App.
(b) auf `main` gleichwertig oder neuer.
(c) echtes Verhalten, das Kundinnen haben und `main` fehlt.

«gleich» heisst: Datei auf `main` ist Byte für Byte identisch mit der Datei im aktiven
Production-Stand beider Plattformen (Git-Blob verglichen).

| # | OTA (Datum, Plattform, Gruppe, Commit) | Datei | Einordnung | Beleg |
| --- | --- | --- | --- | --- |
| 1 | 16.11. iOS `dc8c8dce` / `dbb9179e` Heimzone und gekürzte Trainer-Kopie | `features/home-zone/confirm.ts` | b | gleich. Alle 41 Zeilen der OTA stehen auf `main`; später kam die Auswertungs-Abfrage dazu. |
| | | `features/home-zone/i18n.ts` | b | gleich. 5 Einleitungstexte wurden später umformuliert (in `main` und in späteren OTAs). |
| | | `features/home-zone/trainerShare.ts` | b | gleich. Die gekürzte Kopie wurde später umgebaut (7 Zeilen anders), derselbe Stand ist live. |
| | | `features/tracking-exchange/ExchangeScreen.tsx` | a | Einzige Abweichung: 1 `eslint-disable`-Kommentarzeile am Dateianfang fehlt auf `main`. Kein Verhalten. |
| | | `features/tracking-exchange/live/useLiveShare.ts` | a | Wie oben: 1 `eslint-disable`-Kommentarzeile. |
| | | `features/training-groups/GroupHandoverScreen.tsx` | b | gleich. 3 Zeilen (Heimzonen-Hinweis, zwei Knöpfe) später angepasst. |
| 2 | 16.11. iOS `98054619` / `c3fd9879` Gruppentraining Stufe 3 | `features/tracking-exchange/groups/groupRpc.ts` | b | gleich. Die Zeile mit der Liste der Server-Aufrufe wurde später erweitert. |
| | | `features/training-groups/GroupNotifyCard.tsx` | b | gleich. Komponente später leicht umgebaut (5 Zeilen anders). |
| | | `features/training-groups/GroupSessionScreen.tsx` | b | gleich. 4 Zeilen (Flächen, Standort teilen) später weiterentwickelt. |
| | | `i18n/de-CH.ts`, `i18n/gsw-CH.ts`, `i18n/locales/en.ts`, `fr.ts`, `it.ts` | b | Auf `main` gleich wie iOS-Production. Zwei Texte (`groups.wsCourseWho`, `groups.mapLegend`) später umformuliert. Android hat zusätzlich einen Schlüssel, siehe «Zusätzlicher Befund». |
| 3 | 16.11. Android `3ff4fc77` / `0818effa` Gruppentraining Stufe 3 | `groupRpc.ts`, `GroupSessionScreen.tsx`, 5 i18n-Dateien | b | Wie Zeile 2, gleicher Inhalt für Android. |
| 4 | 16.11. Android `b308a14e` / `56c34b86` Stufe 4a, Auswertung teilen | `features/home-zone/confirm.ts` | b | gleich. Abfrage vor dem Teilen später präzisiert (3 Zeilen). |
| | | `features/tracking-exchange/groups/evaluationService.ts` | b | gleich. 3 Zeilen später geändert (Empfängerliste, Kommentare). |
| | | `features/training-groups/GroupEvaluationScreen.tsx` | b | gleich. Kartenansicht später überarbeitet (5 Zeilen). |
| | | `features/training-groups/ShareEvaluationSheet.tsx` | b | gleich. 3 Zeilen später geändert. |
| | | `features/training-groups/evaluationLocal.ts` | b | gleich. Später umgebaut («ohne fremde gelegte Linie», OTA vom 17.11., die als enthalten gilt). |
| | | 5 i18n-Dateien | b | Alle damals hinzugefügten Zeilen stehen auf `main`; nur die Umgebung hat sich verschoben. |
| | | `supabase/local/training_group_stage4a_cases.sql` | a | Lokale Testfälle für die Datenbank, nicht Teil der App. Auf `main` gleich wie in Production-Quelle. |
| 5 | 17.11. iOS `e1ab0893` / `fb127898` Stufe 4a | 5 i18n-Dateien | b | Alle 41 hinzugefügten Zeilen je Datei stehen auf `main`. |
| 6 | 17.11. Android `ce5617a7` / `b65c304d` fremd gelegte Gruppenfährte | `app.json` | a | Die OTA fügte nur die Zeile `googleServicesFile` ein; sie steht auf `main` (anders eingerückt). `app.json` ist Build-Konfiguration. |
| 7 | 17.11. Android `15c66ab8` / `4068e2f5` Tagesdatum lokal | `services/trainingUnitStats.ts` | b | gleich. Eine Zeile zur Wochenberechnung wurde in der Folge-OTA vom 17.11. (lokal statt UTC, als enthalten gewertet) nochmals verbessert. |
| 8 | 17.11. iOS `b6f2e26a` / `0cd591e7` Tagesdatum lokal | `services/trainingUnitStats.ts` | b | Wie Zeile 7. |
| 9 | 18.11. Android `78a7a39d` / `7b8681a8` Spitzwinkel, Taste Fährtenverlust | `features/tracking/engine/layProcessingSession.ts` | b | gleich. Eine lange Zeile (Liste von Referenzen) wurde später um weitere Einträge ergänzt. Fährtenlogik auf `main` = live. |
| 10 | 18.11. iOS `41021491` / `e4ac8b76` Spitzwinkel, Taste Fährtenverlust | `features/tracking/engine/layProcessingSession.ts` | b | Wie Zeile 9. |
| 11 | 18.11. iOS `eb7308c6` / `8da2418c` PR 188 | `package.json` | a | Nur Skript-Einträge (`status:check`, `test:process`). `main` ist neuer (zusätzlich `release:check`, `test:e2e`, Google-Login-Paket fürs nächste Build). |
| 12 | 18.11. Android `9a4c1724` / `ba6fe4d9` PR 188, 179, 182 | `package.json` | a | Wie Zeile 11. |
| 13 | 20.11. iOS `40607c4d` / `574b56b6` Papierkorb VoiceOver | `.maestro/common/dismiss-logbox.yaml`, `.maestro/common/start.yaml`, `.maestro/flows/05-training-dokumentieren.yaml` | a | Testabläufe, nicht Teil der App. `main` ist neuer (PR 205). |
| 14 | 20.11. Android `c2672539` / `ee05929b` Papierkorb Screenreader | dieselben 3 `.maestro`-Dateien | a | Wie Zeile 13. |
| 15 | 20.11. iOS `64143006` / `fabff601` Absuche Abstand je Hund | `.maestro/common/dismiss-logbox.yaml` | a | Wie Zeile 13. |
| 16 | 20.11. Android `b48c0505` / `6c0b6dc0` Absuche Abstand je Hund | `.maestro/common/dismiss-logbox.yaml` | a | Wie Zeile 13. |

Ergebnis: **0 × (c)** unter den 16 Meldungen.

## Ausnahmen-Datei

`docs/agent/ota-coverage-exceptions.json` (Stand `main`) enthält für keine der 16 Gruppen eine
Ausnahme. Die vorhandenen Ausnahmen betreffen ältere Runtimes und den Build-60-Abgleich
(Entscheide vom 09., 12. und 16.11.).

## Zusätzlicher Befund: Android-Linie fehlt auf `main` (Einordnung c)

Nicht von der Prüfung gemeldet, aber im Gesamtvergleich sichtbar. Android-Production
`dc8f756f` enthält gegenüber `main`:

| Commit | Inhalt | Dateien | Wirkung für Kundinnen |
| --- | --- | --- | --- |
| `3612e810` (T-209, PR 101) | Absuche bei ausgeschaltetem Bildschirm wach halten | `features/tracking/native/searchKeepalive.ts` (neu), `features/tracking/hooks/useSearchRecorder.ts` (Start/Stopp), `app/_layout.tsx` (Import), zwei Testdateien, `docs/agent/tasks/T-209.md` | Android: Ohne diesen Dienst liefert das Handy bei ausgeschaltetem Bildschirm kaum Positionen. Die Aufzeichnung der Absuche bekäme Lücken. Auf iOS ohne Wirkung. |
| `8e55b3a2` (Build 52) | Beschriftungen der Absuche übersetzbar | `app/track/run.tsx`, 5 i18n-Dateien (neuer Schlüssel `track.deviationShort`, EN «Article»/«Corner» gross), ein Test, `eas.json` (`distribution: store`), `app.json` (versionCode) | In anderen Sprachen stünden wieder feste deutsche Wörter («Gegenst.», «Abweich.», «Karte», «Skizze»). |
| `ec897e6b` | GPS-Qualitätswort verkleinern statt abschneiden | `app/track/run.tsx`, ein Test | Langes Wort (z. B. EN «GPS · EXCELLENT») würde wieder abgeschnitten. |
| `4aac8786` (Build 53) | Startbild, versionCode 53 | `app.json` | Startbild-Breite ist auf `main` schon da (PR 200). Offen bleibt nur `versionCode` (`main` 51, Android-Linie 53). |

Warum die Prüfung das nicht sieht: Diese Änderungen kamen mit dem nativen Android-Build 52/53,
nicht mit einer OTA. Die Prüfung kennt nur OTAs.

Einordnung des Risikos: Tracking/GPS, also laut `AGENTS.md` vertiefte Prüfung nötig. Kein
Löschen bestehender Daten, aber lückenhafte neue Absuche-Aufzeichnungen auf Android wären
die Folge, wenn das im nächsten Build fehlt.

## Vorschläge (Entscheid bei der Nutzerin)

1. **Android-Linie nach `main` nachziehen (empfohlen, vor dem nächsten nativen Build).**
   Ein PR gegen `main` mit `3612e810`, `8e55b3a2` und `ec897e6b` samt Tests. `versionCode` im
   PR nicht blind übernehmen, sondern beim nächsten Build bewusst höher als 53 setzen.
   Gerätetest Android vor dem Build: Absuche mit ausgeschaltetem Bildschirm.
2. **Zwei Kommentarzeilen nachziehen (klein, optional).** Die `eslint-disable`-Zeilen in
   `ExchangeScreen.tsx` und `useLiveShare.ts` nach `main` holen. Ändert kein Verhalten, macht
   `main` aber deckungsgleich mit iOS-Production und erspart die Kommentar-Abweichung bei
   jedem Release-Merge.
3. **Die 16 Meldungen auflösen.** Zwei Wege:
   - **Ausnahmen eintragen:** 16 Gruppen in `docs/agent/ota-coverage-exceptions.json` mit
     Begründung «Inhalt auf main identisch mit aktiver Production, Datei später
     weiterentwickelt; Bericht `docs/agent/tasks/ota-abdeckung-main-20261120.md`»,
     `decidedBy` Nutzerin, Datum. Nachteil: Nach jeder weiteren OTA-Charge kommen neue
     gleichartige Meldungen dazu.
   - **Prüfung verbessern (nachhaltiger):** Eine OTA zusätzlich als enthalten werten, wenn
     ihre Dateien im Kandidaten gleich sind wie im neusten, bereits als enthalten gewerteten
     Stand derselben Plattform und Runtime, und Nicht-App-Pfade (`.maestro/`,
     `supabase/local/`, Skript-Einträge) ausnehmen. Das wäre eine Skriptänderung mit Tests,
     also ein eigener Code-PR, den die Nutzerin mergt.

## Was nicht geprüft wurde

- Kein Gerätetest, kein Emulator, keine Tests, kein TypeScript, kein ESLint (reine
  Lese-Untersuchung).
- Verglichen wurden die Git-Commits, die EAS als Quelle der OTAs nennt. Die tatsächlich
  ausgelieferten Bundles bei EAS wurden nicht heruntergeladen oder zerlegt.
- Die 162 bereits ausgenommenen OTAs (ältere Runtimes, Build-60-Abgleich) wurden nicht neu
  beurteilt.
- iOS-Runtime `1.0.6-map49-v1` (App-Store-Build 57): keine offene Meldung; nicht weiter
  untersucht.
- Datenbank, Migrationen und Edge Functions wurden nicht geprüft.
- Ob T-209 auf `main` ohne Anpassung sauber einspielbar ist (Konflikte mit seither geänderter
  Absuche), wurde nicht ausprobiert.
- `docs/agent/RELEASE_CHECKS.md` kam erst während der Untersuchung mit PR 208 auf `main`;
  gelesen, aber `npm run release:check` nicht ausgeführt.
- `git fetch` ging nur mit dem `gh`-Zugang für den einzelnen Befehl (Schlüsselbund liefert
  das falsche Konto); an der Git-Konfiguration wurde nichts geändert.
