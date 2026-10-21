# Trainingsdokumentation in drei Schritten – 07 – 2026-10-21

## Auftrag und geprüfter Ausgangsstand

Der Nutzer hat den klickbaren Entwurf „Klarer Ablauf“ abgestimmt und die Umsetzung ausdrücklich beauftragt. Ziel: heute dokumentieren und beim nächsten passenden Training die eigenen Hinweise wiedersehen.

- Worktree: `/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/anyvo-journal-all-disciplines`
- Branch: `fix/journal-all-disciplines`
- Basis / HEAD: `829eb0a7dc83900d5c357d7c107ce0857ce8c5fa`
- Ausgangsstatus: sauber. Implementierung als uncommittierter Diff; bestehende Release-Quellen nicht verändert.
- Alte globale Handoff-/Statusdateien enthalten ältere Branch-/Release-Angaben. Git-Zustand wurde direkt geprüft; globale Koordinationsdateien bleiben unverändert.

## Umsetzung

Neue Dokumentationen führen durch Vorbereiten → Dokumentieren → Nächstes Mal. Hund, Sparte und lokalisiertes Datum sind kompakt sichtbar; Kontextänderung ist aufklappbar. Im ersten Schritt erscheinen offene Hinweise lesend, mit Datum und vorhandener Ursprungsnavigation. Weitere offene Hinweise sind aufklappbar. Aufklappen öffnet keine Texteditoren; erledigte Hinweise bleiben in der Verwaltung erhalten und werden in der Vorbereitung ausgeblendet. Statusänderung nur durch explizites Erledigen. Lokale Althinweise bleiben als solche gekennzeichnet.

Im zweiten Schritt wählt der Nutzer heute trainierte Übungen. Die ausdrückliche Auswahl bestätigt heutiges Training; Beobachtung ist direkt sichtbar. Bewertungen und Verlauf sind optional aufklappbar. Aus der Historie übernommene Pläne bleiben dagegen untrainiert, bis der Nutzer sie bestätigt. Übungsidentitäten und historische Daten werden weder gelöscht noch nach Namen zusammengeführt. Bestehende Mehrfachidentitäten bleiben einzeln auswählbar; Umbenennen ist im neuen Dokumentationsablauf ausgeblendet. Medien, Datum, Dauer und allgemeine Notiz bleiben unter weiteren Angaben erreichbar.

Der dritte Schritt trennt die heutige Beobachtung vom neuen Hinweis pro Übung. Ein zusätzlicher Spartenhinweis bindet an eine tatsächlich trainierte Sparte. Speichern verwendet den unveränderten atomaren Speicherpfad einschließlich Identitäten, Hinweisen und dauerhaftem Wiederholungsauftrag. Die Erfolgsansicht erscheint erst nach bestätigtem Speichern und der Entwurfsbereinigung; sie zeigt Beobachtungen und neue Hinweise sowie den Zugang zum gespeicherten Training.

Der bestehende kontogebundene lokale Entwurf wird abwärtskompatibel um Schritt und weitere Hundeentwürfe ergänzt. Hundwechsel sichert und restauriert Eingaben einschließlich eigener Unit-/Request-IDs, Timersekunden, Medien und Freigabe; keine stillschweigende Übertragung auf einen anderen Hund. Speichern eines Hundes erhält offene Entwürfe für andere Hunde. Ungültige Entwürfe bleiben geschützt. Zurück innerhalb des Ablaufs erhält Eingaben; Android-Systemzurück verwendet dieselben Schritte. Der bestehende Editor gespeicherter Einheiten bleibt als Einzelansicht verfügbar.

Die Hilfe sowie neue Texte sind in DE, GSW, EN, FR und IT angepasst. Eingaben haben grössere Schrift, die neue Beobachtungsfläche mehr Platz, die Hauptaktion eine flexible Mindesthöhe und Schrittüberschriften eine Accessibility-Auszeichnung.

## Selbst ausgeführte Prüfungen

- Jest ohne Cache und mit unveränderter Timeout-Konfiguration: **21 Suites / 256 Tests PASS**.
- Abgedeckt: Vorbereitung → heutige Beobachtung → zukünftiger Hinweis → bestätigte Speicherung → neuer Einstieg mit Hinweis; keine Übernahme alter Leistungswerte; Fehler und Wiederherstellung nach Neustart; separate Hundeentwürfe einschließlich Erhalt des anderen Hundes nach Speichern; unterschiedliche Request-/Unit-IDs; Android-Systemzurück; lesendes Aufklappen von Hinweisen; bewusstes Erledigen; bestehende Identitäten, atomarer Retry, Edit-Konflikt, genaue Timersekunden, Historie, Journale und Übersetzungen.
- Vollständiger Typecheck, ESLint aller berührten Code-/Test-/Sprachdateien und `git diff --check`: siehe abschliessenden hashgebundenen Prüfbericht.
- Frühere Entwicklungsprüfungen deckten veraltete Testnavigation und doppelte React-Sibling-Keys auf. Tests an den tatsächlichen neuen Ablauf angepasst, Keys getrennt und danach die vollständigen relevanten Prüfungen erneut ausgeführt. Keine Timeout-Erhöhung, kein Skip und keine unterdrückten Warnungen.

Evidenz im Projektordner: `outputs/training-guided-documentation-07-2026-10-21/verification.json` mit Quellhashes, tatsächlichen Prüfergebnissen und Rohlogs.

## Abnahme- und Auslieferungsgrenzen

Gerätetests, tatsächliche Screenreader-/Tastatur-/Schriftgrössenprüfung auf iOS und Android bleiben zurückgestellt. Der Integrationstest für den nächsten Einstieg verwendet kontrollierte API-Antworten; er ersetzt keine Live-API-Abnahme. Keine Änderung des Backend-Vertrags, keine Migration, kein DB-Schreibzugriff, kein Commit, Push, Merge, Build oder OTA durch diesen Auftrag. Der neue UX-Stand ist noch nicht veröffentlicht.


## Nachtrag: Git- und OTA-Auftrag

Nach Abschluss der Umsetzung beauftragt der Nutzer ausdrücklich „gerne ota und git“. Die obigen Nicht-Veröffentlichungsangaben beschreiben den Implementierungsabschluss davor.07 sichert den geprüften eigenen Diff gezielt als Commit;00 koordiniert unabhängiges Review, runtime-isolierte Releasequellen und normale GitHub-Sicherung.01 bleibt alleiniger OTA-Publisher nach frischem vollständigem Preflight. Gerätetests bleiben zurückgestellt. Keine Freigabe für Force-Push, main-Merge, native Builds, Store-Submit oder DB-Schreibzugriff aus diesem Auftrag. Tatsächliche Release-Ergebnisse und Commit-/Update-IDs werden separat erst nach Bestätigung dokumentiert.
