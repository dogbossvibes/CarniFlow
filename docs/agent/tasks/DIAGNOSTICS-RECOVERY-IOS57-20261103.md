# Persönliche Fährtendiagnose: Wiederherstellung und Release-Parität

## Ist-Zustand und Ursache

- Autor-Worktree `anyvo-bmad-tracking-timing-20261101`, Branch `fix/gps-arrival-ordering-review-20261102`, Basis `73c5317d95bf98b8b7aaa4aed9884fe3b0dd45e0`.
- Veröffentlichter iOS-57-Stand: `bb09bf625bb7305f4e8e619d1148d2685e79afd6`, Runtime `1.0.6-map49-v1`. Beide betroffenen Produktdateien sind bytegleich zur Autor-Basis.
- Der vorhandene iOS-55-Fix `0e16001d4f9aeeb9d06adf384c9b86376fae2250` enthält bereits getrennte Ergebnisse für Freigabe, explizite Ablehnung, technischen Fehler und veraltete Antwort sowie Wiederholungen. Diese Funktion fehlt im veröffentlichten 57-Stand. Chat01 hat die Paritätslücke ebenfalls per Quellvergleich bestätigt.
- In der alten Schleife werden nur aktuell erlaubte Konten erneut geprüft. Ein technischer Fehler sperrt den Zugang und damit zugleich seine automatische Wiederherstellung. Der nächste App-Resume versucht es erneut. Die neuen Tests mit tatsächlichem Service, Authority-Store, Hook und Sync-Komponente reproduzieren den Fehler nach Erstabruf und Erneuerung.
- Eine fehlende Netzantwort wird bislang nur abgebrochen; ignoriert der Transport das Abbruchsignal, beendet sich der Aufrufer nicht zuverlässig. Dies ist ebenfalls gezielt reproduziert.
- Das erklärt einen belegten Fehlerpfad, beweist ohne aktuelle Gerätesitzung jedoch nicht den einzelnen Auslöser auf dem iPhone. Die persönliche Production-Berechtigung ist in dieser Aufgabe nicht frisch aus der Datenbank gelesen worden. Der alte T-130-Bericht ist ausschließlich historische Evidenz.

## Begrenzte Korrektur

- Ergebnisunterscheidung und die geprüften Retry-Abstände aus Build55 übernommen: 30/60/120/240/300 Sekunden, ausschließlich im Vordergrund. Explizites Server-`false` bleibt gesperrt und wartet auf einen neuen Resume.
- Folgeabruf wird nach Abschluss geplant, unabhängig davon, ob der vorherige Abruf Zugang erlaubte. Gleichzeitig höchstens eine Anfrage pro Sync-Lifecycle; mehrere Resume-Ereignisse werden zusammengefasst.
- Harte Acht-Sekunden-Frist neben Transport-Abbruch; späte Antworten können nach Timeout keine Berechtigung erteilen. Konto-, Generation- und Sequenzprüfungen bleiben erhalten.
- Präferenzen werden nur nach erfolgreichem aktuellem Grant geladen. Präferenzfehler verhindern die nächste Berechtigungsprüfung nicht.
- Alle ursprünglichen Tests sowie die fünf zusätzlichen Regressionen aus dem Build55-Fix übernommen; elf neue integrierte Lebenszyklustests ergänzen sie. Der `try/finally`-Schutz des früheren Fixes bleibt erhalten: Auch ein werfender Store-Abonnent darf die Wiederholung nicht dauerhaft verriegeln.
- Keine Änderung an serverseitiger Berechtigung, 60-Sekunden-Lease, Route-/Exportschutz, Datenbankschema, GPS, Winkelerkennung, Gegenständen oder Live-Share. Keine E-Mail im App-Code, keine persistierte lokale Freigabe und kein Rechte-Fallback.

## Prüfung und Freigabegrenzen

- Vor der Korrektur: 4 von 7 neuen integrierten Fällen rot; Fehlerprotokoll `outputs/archive-native-audit/diagnostics-recovery-before.log`.
- Erster Kandidat: 49 Tests in 7 Suiten PASS, einschließlich aller bisher geprüften Zugriffssperren. Ergänzter Subscriber-Fehlerfall und finale Ergebnisse stehen im Übergabebeleg. Protokoll `outputs/archive-native-audit/diagnostics-recovery-final.log`.
- Abschließender Volltest, TypeScript und Lint werden im Übergabebeleg dokumentiert; keine Geräteprüfung behauptet.
- Kein Commit, Push, neuer Build oder OTA durch diese Aufgabe. Chat01 erhält einen isolierten Patch für Review und Integration auf der dann frisch geprüften Release-Basis.
- Release-Anforderung: Die echten Wiederherstellungstests müssen auf jeder Ziel-Release-Linie laufen. Erhaltung der unmittelbaren Vorgänger-OTA allein beweist keine Parität mit den bereits korrigierten anderen Runtime-Linien.

## Gerätetest nach geprüfter Auslieferung

1. Richtige Update-ID prüfen; persönliche Diagnose bei bestehender Netzverbindung öffnen.
2. Netzwerk kurz unterbrechen: geschützte Diagnose darf bei fehlender Bestätigung sperren. Netz wiederherstellen, App im Vordergrund lassen: der Eintrag muss spätestens beim nächsten vorgesehenen Retry wieder erscheinen, ohne Neustart.
3. Bildschirm sperren/App wechseln, entsperren und zurückkehren: erneute Prüfung und Wiederherstellung.
4. Abmelden/anderes Konto: keine Übernahme der Diagnoseberechtigung. Das andere Konto bleibt gesperrt.
5. Eigene Fährte und Diagnoseexport prüfen; Rohdaten, Lege-/Suchlinie, Gegenstände und Live-Share unverändert kontrollieren.
