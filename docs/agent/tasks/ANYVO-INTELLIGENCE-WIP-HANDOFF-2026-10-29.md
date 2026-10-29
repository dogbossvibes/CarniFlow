# ANYVO Intelligence – WIP-Sicherung und Weiterarbeit

Stand: 29.10.2026. **WIP-Quellensicherung, keine Releasefreigabe.**
GitHub-Ziel: [backup/intelligence-wip-20261029](https://github.com/dogbossvibes/CarniFlow/tree/backup/intelligence-wip-20261029).
Der vollständige Sicherungscommit ist der HEAD dieses Backup-Branches (`git rev-parse HEAD`).
Ausgangscommit: `aa09a64f7b11c08eb334dc4808d4bda2ee1d2ce1`, keine aktuelle Production-Basis.

## Enthalten

61 bekannte Dateien: `app/intelligence.tsx`, gesamte eigene `features/intelligence/`-Implementierung samt Tests und sechs eigene Intelligence-Taskdokumente. Hinzu kommen diese Übergabe und das Quellenmanifest. Der Ausgangscommit enthält bereits die damaligen Quellen-/Entwurfsadapter; keine fremden WIPs werden eingesammelt.

- Schwebender Begleiter und Sprachraum teilen einen Host, Runtime, Entwurf und Gespräch.
- App-Anbindung verwendet vorhandene authentifizierte Supabase-Gateways und den verzögert geladenen Expo-PCM-Port.
- Getrennte Text-/Audioeinwilligung, begrenzte Aufnahme, lokale Audio-Löschung, bestätigtes Transkript und separates Absenden bleiben erhalten.
- Account-/Hund-/Policywechsel sowie Hintergrund/Schließen unterbrechen; keine automatischen Modellwiederholungen oder kostenpflichtigen Fallbacks.
- Alle drei Quellengates in `releaseGate.ts` sind weiterhin `false`; gesperrter Fallback bleibt aktiv. Keine Provider-/Token-/Produktionsaktivierung aus diesem Backup.

## Prüfstand und Grenzen

Historischer eigener Prüflauf vom 24.10.: 342 Tests in 23 iOS-Suites, TypeScript0 und ESLint0/null Warnungen. Der unabhängige lokale Nachreview bestand einschließlich drei zusätzlicher Negativfälle: 58 eindeutige Tests nach letztem Ergebnis je Suite, sieben Suites; ein kalter Routentest-Timeout bestand den unveränderten Nachlauf. Testzahlen nicht addieren. Diese Volltests wurden am 29.10. ausdrücklich nicht wiederholt; nur Quellen-/Diff-/Sicherungsprüfung.

Alle 57 Quellenbindungen des damaligen App-Wiring-Freeze sind vor Sicherung unverändert: Manifest-SHA256 `5a2f11e0ffa1180bbc385d8b838e102ce49e17c4002c1587b742bc17357f4ddf`; unabhängiger Review `c006f2df7af6d6f28ba7f77d6c1ade249dff9565088e488283d9fe036a8fcf51`. Die sechs zusätzlichen Tasktexte enthalten historische Pläne; neuere Statusabschnitte haben Vorrang. Quellenhashes stehen im beigefügten Manifest. Historische lokale Belege sind keine neue Livebestätigung und werden nicht als Rohlogs exportiert.

## Offen – vor Aktivierung oder Veröffentlichung

1. Global höchstens **5 CHF zusätzliche KI-Kosten je Europe/Zurich-Kalendermonat** für alle Nutzer/Text/Audio einschließlich zusätzlicher Infrastruktur, Gebühren, Steuern und Wechselkurs belegen. Bestehender Supabase-Pro-Grundpreis ist ausgeschlossen. Der lokale Ledger ersetzt keine Rechnungs-/Kontoprüfung.
2. Backend05: aktuelle Tarife/Modelle/Accountzuordnung, Legacy-KI-Wege, Gesamtzusatzkosten, Consent/RLS/Isolation/Alarm und gesondert erlaubten Pilot nachweisen. Ein damals vom Nutzer gemeldeter Free-Subscription-GET-PASS ist nur ein enger Teilbeleg, kein Gesamt-PASS. Keine alten Tokens oder Kontostände wiederverwenden.
3. Home-Einstieg gehört UI07: lokal unabhängig geprüft, aber nicht Bestandteil dieses Writer-Backups. Nur gebundenen Home-Freeze übernehmen und tatsächliche gemeinsame Integration durch Integrator01 belegen.
4. Echte Native-/PCM-/Permission-/Audio-Lifecycle-Abnahme und frische kumulative iOS-/Android-Kompatibilität bleiben getrennte Prüfungen. Keine Geräteabnahme aus Mocks ableiten.
5. Vor Release aktuelle Production-Quelle neu bestimmen und neuere Änderungen vollständig erhalten. Dieses alte Basis-Snapshot nicht ungeprüft nach main mergen oder als OTA ausliefern. 01 bleibt alleiniger Publisher; keine OTA-/Build-/DB-/Deploymentfreigabe durch Sicherung.

## Weiterarbeit mit Chat und GitHub

Backup-Branch auschecken und zuerst AGENTS.md, aktuellen kanonischen Masterstatus und diesen Bericht lesen. Abhängigkeiten anhand der vorhandenen Lockdatei herstellen. Historische Behauptungen mit den mitgesicherten Quellen abgleichen; vor späterer Umsetzung relevante Tests und TypeScript/Lint erneut ausführen. Bestehende Owner 11 Intelligence, 05 Backend, 07 Home/UI, 01 Integration/Release beibehalten. Keine fremden Dateien überschreiben, keine Kundendaten löschen oder Datenmigration/Provideraktivierung aus der WIP-Sicherung ableiten.

Bewusst ausgelassen: lokale `outputs/`-Rohbelege, Browser-/Billing-Screenshots, Konten-/Token-/TTY-Daten, QA-Konten, Logs, GPS-/Gesundheits-/Kundendatensätze, Medien/Binaries, installierte Abhängigkeiten, Build-/OTA-Artefakte und fremde Home-/Backend-Worktrees. Diese Sicherung schützt Implementierung und technische Übergabe; sie ist kein vollständiges Backup persönlicher lokaler Artefakte.
