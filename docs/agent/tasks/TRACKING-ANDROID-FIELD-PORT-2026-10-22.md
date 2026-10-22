# Android: geprüfte Tracking-Schutzkorrekturen übertragen

Stand: 22.10.2026. Lokal implementiert und geprüft, uncommitted. Keine Veröffentlichung.

## Auftrag und Arbeitsplatz

Chat 01 hat Chat 02 nach der menschlichen Android-Release-Anweisung in Chat 05 als alleinigen Tracking-Writer beauftragt. Der Nutzer hat kein Android-Testgerät; Geräte-QA wird nicht als bestanden ausgegeben. Chat 01 bleibt Integrator, unabhängiger Prüfer und alleiniger Builder/Publisher. Chat 00 verwaltet die GitHub-Sicherung.

- Worktree: `/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/anyvo-android-tracking-field-20261022`
- Branch: `fix/android-tracking-field-20261022`
- Basis und unveränderter HEAD: `ae3e372df017e1c1b600ea3878ef6934e3c5afec`.
- Basis: veröffentlichtes Android-Journal-Paket, Version/Runtime 1.0.5; Versionsnummern, Runtime, native Konfiguration und Dependencies wurden nicht verändert.
- Ausgangszustand sauber. Exakter Umfang: sechs Produktdateien, sieben Testdateien, dieser eigene Bericht. Keine globalen Statusdateien.
- Arbeitsnachweise: `/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/outputs/android-tracking-field-port-02-2026-10-22`.

## Datenfluss und Umsetzung

### Abschlussprüfung und lokale Anzeige

`getTrackSessionById` wertet Fehler der drei kritischen Kindabfragen für Punkte, Marker und Suchläufe aus. Eine fehlgeschlagene Abfrage wird nicht mehr als erfolgreich geladene, leere Aufnahme behandelt. Der bestehende lokale Anzeige-Fallback bleibt erhalten.

`getTrackCompletionById` prüft Abschlussdaten unabhängig vom GPS-/Markerabruf. Der neue, bereits auf iOS geprüfte `useTrackCompletion` unterscheidet loading, unknown, absent, open und final. Unbekannter Abschluss berechtigt nicht zum Wiederöffnen einer alten lokalen Kopie. Nach erneutem Prüfen sind eigene, nachweislich offene oder remote noch nicht vorhandene Aufnahmen weiterhin fortsetzbar.

Beide Aufrufer – Hundeprofil und Fährtenauswertung – sind auf Sitzung, Hund und Konto begrenzt. Verspätete Antworten nach Kontextwechsel werden verworfen. Ein endgültiger Suchlauf im Eltern-Payload bleibt Abschlussbeleg. Aktive lokale Aufnahmen bleiben im Hundeprofil auch offline erreichbar. Die Auswertung zeigt lokale Fremdkonto-Daten nicht an. Die bestehende Android-Transfer-/Marker-/Suchlauf-Ergänzung wurde beibehalten.

Das entspricht dem geprüften R2-Verhalten aus `1b2dee534debac7409016c2b8584c1db2ed9a310`. Hundeprofil und neuer Hook sind bytegleich; Service und Detail wurden in ihre vorhandenen Android-Versionen integriert. Die auf Android bisher fehlende iOS-Continuity-Restore-Funktion wurde nicht nebenbei eingeführt.

### GPS-Start: Empfangszeit und Messzeit

Der Android-Hook berechnete die Fix-Frische gegen dieselbe Fix-Zeit. Dadurch konnte historische oder zukünftige Evidenz als aktuell erscheinen. Empfangszeit ist jetzt `Date.now()`: Startdauer, Frische, Bewegungsfenster und Startdiagnose verwenden sie. Ein Fix muss zur laufenden Sitzung gehören, darf nicht aus der Zukunft stammen und muss die vorhandene Fünf-Sekunden-Grenze einhalten. Der vorhandene Fallback wartet auf tatsächliche zwölf Sekunden und einen geeigneten aktuellen Fix.

Die Messzeit bleibt für Anker, Linienpunkte und Persistenz erhalten. Die 24 hinzugefügten/entfernten Zeilen sind exakt die geprüfte Korrektur aus `b62b7eba370ffda30d53312894a144b95761a36a`, übertragen in den bestehenden Android-Hook. Der ganze Funktionskörper unterscheidet sich weiterhin absichtlich von iOS; bestehende Android-Anteile wurden nicht ersetzt oder in einen neuen Prozessor extrahiert. Siehe `START-CLOCK-AST-COMPARISON.json`.

### Winkel-Fusion

`turnFusion.ts` ist bytegleich mit dem geprüften Stand `12c436564be3d3f00e7248e29b13a0e99e9ee065`: begrenztes GPS-Wackeln innerhalb eines bestätigten Drehsektors und qualitätsgebundenes Motion-Veto. Strecken-, Konzentrations-, Richtungs- und Geometriebedingungen bleiben bestehen. Große Gegenbewegungen bleiben gesperrt. Es wurden keine allgemeinen Erkennungsschwellen gelockert.

**Grenze:** Die schwächere Zwei-Segment-Winkelrettung braucht weiterhin unabhängige, brauchbare Bewegungssensor-Bestätigung. Das gegenwärtige `AnyvoMotion` registriert nur Apple; der Android-Wrapper läuft ohne diesen Provider als GPS-only. Die Bibliothekstests mit synthetischer Motion sind daher kein Nachweis, dass Android sämtliche iOS-FN1-Winkelrettungen ausführen kann. Es wurde kein neuer Android-Sensor-/GNSS-Provider eingeführt und keine Verbesserung des Satellitenempfangs behauptet. Die iOS-spezifische native Schrittfenster-Kette wurde nicht kopiert.

## Dateiliste

Produkt:

1. `app/track/[id].tsx`
2. `features/tracking/components/DogTrackingPanel.tsx`
3. `features/tracking/hooks/useTrackCompletion.ts` (neu)
4. `features/tracking/services/trackService.ts`
5. `features/tracking/utils/turnFusion.ts`
6. `features/tracking/hooks/useTrackRecorder.ts`

Tests:

1. `app/track/__tests__/detail-completion-guard.test.tsx` (neu)
2. `app/track/__tests__/detail-resume-recovery.test.ts`
3. `features/tracking/components/__tests__/DogTrackingPanel.test.tsx`
4. `features/tracking/services/__tests__/getTrackSessionById.test.ts`
5. `features/tracking/utils/__tests__/motionVetoQuality.test.ts` (neu)
6. `features/tracking/utils/__tests__/turnEpisodeSector.test.ts` (neu)
7. `features/tracking/hooks/__tests__/useTrackRecorder.startup.test.tsx`

Die bestehende statische Detail-Prüfung wurde auf den strengeren Owner-/Route-/Abschlussvertrag aktualisiert. Ihre übrigen Lifecycle-/Registry-/Quota-/Abbruchprüfungen bleiben erhalten, ebenso die bereits vorhandene Android-Layout-Erkennung. Die neuen real gerenderten Detail-/Profiltests laufen explizit mit Android-Platform; die elf Startzeitfälle explizit ohne Motion-Provider.

## Prüfungen

- Vor den Produktänderungen: sechs Suiten, 42 Tests bestanden und 46 fehlgeschlagen, keine übersprungen. Die 46 Fehler sind keine 46 unterschiedlichen Produktfehler; mehrere Profilfälle scheiterten auch am neuen Abschluss-Mockvertrag. Belegt sind insbesondere die Startzeit-, Kindabfrage-, Abschluss- und Fusion-Regressionen.
- Erster gezielter Grünlauf: sechs Suiten / 88 Tests bestanden.
- Abschließender breiter Lauf: **156 Suiten / 1.943 Tests bestanden, null Fehler, null übersprungen**. Enthalten sind Hook-, native Adapter-/Android-Diagnose-, Hintergrundpersistenz-, Start-, End-/Gegenstands-, Winkel-, Recovery- und Lifecycle-Regressionen. Zahlen überlappen.
- TypeScript: bestanden.
- ESLint auf allen 13 Produkt-/Testdateien: null Fehler, eine bereits bestehende `import/first`-Warnung im Service-Test.
- `git diff --check`: bestanden.
- Alle 1.700 Basisdateien außerhalb der ausdrücklich geänderten Produkt-/Testpfade sind bytegleich; darunter 62 native Dateien, Android-Diagnose und Hintergrundpersistenz sowie beide Journal-Produktdateien. Siehe `SOURCE-RETENTION.json`.
- Tests nutzten ausschließlich einen eigenen, temporären Symlink auf die vorhandenen, zur Basis passenden Android-Journal-Dependencies. Package- und Lock-Datei stimmen bytegleich überein. Keine Installation oder Änderung fremder Dependencies.

## Übergabe und offene Grenzen

Nächster Schritt: unabhängiger Source-/Port-Review durch Chat 01, native Android-Vertragsprüfung mit Chat 04; danach isolierte Integration und vollständiger Release-Preflight auf der dann aktuellen Zielbasis. Dieser lokale Port ist kein Release-PASS.

Offen bleiben tatsächliches Android-Geräteverhalten, Feld-Winkelzuverlässigkeit, drei bekannte fehlende Yam-Winkel, langsamer GPS-Start/Ansatz im Feld und die genaue historische Ursache der nativen Kartenanzeige. Die iOS-Feldaufnahmen belegen keine Android-Geräteregression. Es wurden keine weiteren Kunden-/Serverdaten abgefragt und keine Aufnahme verändert.

Kein Commit, Push, Merge, OTA, nativer Build, Store-/Play-Schritt, DB-Eingriff oder globaler Status-Schreibzugriff durch diesen Auftrag.
