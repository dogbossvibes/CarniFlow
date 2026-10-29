# Monitoring: veraltete Initialisierung nach Opt-out verhindern

24.10.2026. Chat 03 ist nach Abstimmung mit 00 alleiniger lokaler Writer.
Basis: `86c3d1e2a09952148bfd35a84642ca69be820b78`, Branch
`fix/ios-monitoring-consent-20261024` im bestehenden Worktree
`anyvo-ios-watch-session`. Die frühere Watch-Branch bleibt unverändert erhalten.

## Belegter Fehler

Die ursprüngliche Initialisierung prüft die gespeicherte Präferenz asynchron.
Ein währenddessen erfolgtes Ausschalten kann von der nachlaufenden Antwort
überschrieben werden. Zusätzlich bleibt `captureError` während einer ausstehenden
Opt-out-Speicherung offen; parallele Starts initialisieren Sentry doppelt.

Der Offline-Repro unter `outputs/platform-radar-ios03-20261024` liest den
unveränderten Releasecode mit SHA256
`286e6c7b3613ed621d034fa00130947c3cc0bbb37a93fdb1bacb5ccdbb673feb`.
Sentry, Speicher und Transport sind vollständig ersetzt; keine Ereignisse gehen
an einen Server. Drei Regressionen sind rot, die beiden Kontrollfälle ohne DSN
und mit bereits gespeichertem Opt-out grün. Derselbe Repro besteht am Fix alle
fünf Fälle. Das belegt einen Codefehler, keinen beobachteten Kundenvorfall.

## Änderung

- In-memory-Sperre und Präferenzrevision gelten vor jedem Speicher-Await.
- Eine veraltete Leseantwort darf Sentry nicht nachträglich starten.
- Initialisierung und Schließen sind serialisiert; parallele Starts werden
  innerhalb der Queue erneut geprüft. Wiederaktivierung wartet das Schließen ab.
- Präferenzschreibvorgänge behalten die Reihenfolge der Nutzerentscheidungen.
- `captureError` sperrt sofort. Der zusätzliche JS-`beforeSend`-Filter verwirft
  Ereignisse bei deaktiviertem Reporting oder fehlender Initialisierung.
- Fehler der Initialisierung werden lokal abgefangen. Fehler beim Schließen
  öffnen die lokale Sperre nicht erneut. Speicherfehler bleiben wie bisher
  best-effort; eine erfolgreiche dauerhafte Speicherung wird nicht vorgetäuscht.

Der vorhandene Präferenzschlüssel, Default an, DSN-Gate und Fehler-/Extra-Vertrag
bleiben erhalten. Keine Änderungen an Root, UI, Tracking, Konfiguration,
Dependencies oder Release-/Symboluploadpfaden.

## Prüfung und Grenzen

Die zwölf gezielten Jest-Regressionen bestehen: fehlende DSN, gespeichertes
Opt-out, verspäteter Read, ausstehender Write, JS-Ereignisfilter, parallele Starts,
Reenable während Close, schnelle Änderungen, Schreib-/Close-/Initfehler und der
bisherige Capture-/Extra-Vertrag. Keine übersprungenen Fälle.
Typecheck, ESLint und Diff-Ergebnis sowie genaue Dateihashes stehen im
abschließenden eigenen Freeze; keine unbestätigten Prüfungen daraus ableiten.

Dies ist eine lokale, noch nicht veröffentlichte Korrektur. Der JS-Filter ist
kein rückwirkendes Löschen bereits übertragener oder zuvor gepufferter Ereignisse.
Der SDK-Close kann vorhandene Queues flushen; native Crash-/Offline-Queues und
physisches Opt-out-/Reenable-Verhalten sind nicht auf einem Gerät abgenommen.
Bei fehlgeschlagener Speicherung kann der alte persistierte Wert einen späteren
Prozessneustart überleben. Keine neue Persistenz-/Datenschutzpolicy eingeführt.

Production-Ereignisse, absichtliche Crashes, Sentry-Uploads, Provideraktivierung,
Commit, Push, Merge, Build, OTA, Store- und DB-Aktionen wurden nicht durchgeführt.
Der unabhängige Review erfolgt nach dem Freeze durch 01. Die getrennte
Symbol-/Sourcemap-Inventur und SDK58-Planung sind keine Voraussetzung, diesen
kleinen Codefix unabhängig zu prüfen.
