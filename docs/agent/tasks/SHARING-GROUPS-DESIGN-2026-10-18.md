# Fährten teilen & Gruppen – Designumsetzung durch 07

## Stand und Auftrag

- Worktree: `/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/anyvo-sharing-groups-design`
- Branch: `feat/sharing-groups-design`
- HEAD/Basis: `7521d48609c3a5b246bc9e04cd20eade141bccbc`.
- Änderungen liegen uncommitted vor. 07 ist alleiniger Writer dieses Worktrees.
- Freigegebene Vorlage: `/Users/moyo/.codex/visualizations/2026/10/07/01a1182a-51e4-7832-8dfb-38c5036917e8/faehrten-teilen-gruppen.html`.
- Menschliche Umsetzungsfreigabe in Werkstatt: Turn `01a14d83-79b8-70c3-9ed8-d6df07f79ba7`; OTA für iOS Build 52 `01a14d84-cd75-7bb0-bd73-1d5e5fdf2295`, Android `01a14d85-1a90-7142-89bd-eef43833eb85`, erneuter Auftrag wegen fehlendem Design `01a14dbe-4099-7893-8f87-17bac0e46f83`. Von 07 lesend im Chat verifiziert.
- Die zuvor veröffentlichten UI-/R2-OTAs sind KEIN Beleg für dieses Design. Dieses Paket hat noch keine eigene Update-ID.

## Umgesetzt

- Echter Hub- und abgeschlossener Detail-Einstieg `ExchangeEntry` führt auf `/track/sharing`, einschließlich vorhandenem `sourceId`.
- Der bisherige unqualifizierte Einstieg `/track/share` leitet ebenfalls auf den neuen Hub um. Konkrete Datei-, Import- und Aufgaben-Deep-Links bleiben beim vorhandenen Handler.
- Native dunkle Mint-Oberfläche nach Vorlage: Titel, kurze Beschreibung, Übersicht/Eingang/Gesendet, drei kompakte Aktionszeilen, Kontakte oben, Eingangsvorschau, dezenter Dateilink.
- Landing enthält keine Formulare. Übergabe, Dateianfrage, empfangene Datei und Gruppen öffnen ihren bestehenden Ablauf erst nach einer ausdrücklichen Aktion.
- Eingangszeilen öffnen die tatsächliche Transfer- oder Aufgaben-ID. Rückgaben verwenden die tatsächliche lokale Hauptfährten-ID. Fehlende Transfer-IDs werden nicht gelesen/übernommen. Datei-Aufgaben werden bei Bedarf zusätzlich ownergebunden gelesen, wenn sie außerhalb der allgemeinen Aufgabenliste liegen.
- Bestehender Transfer-Client, Service, lokale Speicherung, Journal, ACTIVE-/Consent-/Hund-/Idempotenz-/Gap-Prüfungen bleiben maßgeblich. Nur gemeinsame UI-Verdrahtung wurde extrahiert; keine zweite Import-/Schreibimplementierung.
- Kontakte verwenden dieselbe bestätigte Verbindungsquelle und vorhandene explizite Suche/Verbindung. Ein separat wählbarer strikter Leseaufruf mit gemeinsamem internem Query propagiert Supabase-Fehler, statt sie als leere Kontaktliste darzustellen; bestehende Aufrufer behalten ihr bisheriges Standardverhalten. Neue Hub-Lesevorgänge sind abbrechbar und auf Kontowechsel/Unmount/Fokus/Resume abgesichert.
- Eingangsprojektion liest ausschließlich benötigte Metadaten aus bestehenden lokalen Tabellen, keine vollständigen GPS-Geometrien. Maximal drei ownergebundene SQLite-Metadatenabfragen je Refresh, maximal 200 Dateiaufgaben plus Begrenzungsdetektor. Kein Schema geändert. Lange Listen werden zunächst in 50er-Schritten gerendert; weitere tatsächliche Einträge sind explizit abrufbar. Ablauffristen aktualisieren gezielt am nächsten bekannten Ablauf statt die gesamte Liste sekündlich neu zu rendern.
- Fünf explizite Sprachpakete de/gsw/en/fr/it mit jeweils 52 gleichnamigen Schlüsseln.
- Buttons ab 44 Punkten, Tab-Auswahlzustände, beschrifteter Kontakteinstieg, scrollbare Inhalte und unbegrenzte Textskalierung. Bei großer Schrift werden Tabs und Abschnittskopf untereinander angeordnet.

## Tatsächliche Daten und Grenzen

- Direkte Übergaben: bestehendes `track_transfer_v1` / `service.list()`, tatsächliche IDs, Besitzer, Status, serverseitige Zeit und Ablauf; keine automatische Annahme und keine Quota-Verbuchung durch den Hub.
- Dateiaufgaben: vorhandene `local_track_exchange`-Metadaten auf diesem Gerät. Vorbereitete Datei ist nicht gleich versendet oder zugestellt.
- Rückgaben: vorhandene `local_track_exchange_receipts`; diese wurden bereits geprüft und auf diesem Gerät übernommen und werden entsprechend beschriftet. Der Hub behauptet für diese Daten nicht „bereit zur Prüfung“.
- Externe noch nicht geöffnete Dateien sind keine nachgewiesenen App-Eingangsdaten. Sie werden weiterhin über den Dateilink im bestehenden Picker und Preview-/Bestätigungsablauf geöffnet. Native Pending-Tokens werden nicht zum Zählen verbraucht.
- Für externen Dateiversand fehlen Zustell-/Empfangs-/Lesebestätigungen. Eine gespeicherte Verleitung bekommt deshalb „Rückgabe unbestätigt“. Kein neuer Backend- oder Persistenzvertrag wird erfunden. Ein systemweiter, geräteübergreifender ungelesener Datei-Eingang wäre ein eigener Datenvertrag.
- Der Badge zählt nachweislich anstehende Übernahmen und lokale Dateiaufgaben ohne fertige Verleitung, keine angeblich ungelesenen Nachrichten. Bei Laden/Teilfehlern wird kein vollständiger Zähler behauptet. Bei begrenzter Auswahl werden Zähler und Listenhinweis entsprechend eingegrenzt.
- Gruppenaufgaben und deren Rückgaben bleiben im bestehenden Gruppenbereich, über den dritten Aktions-Einstieg erreichbar. Dessen Release-Gate bleibt unverändert. Im Eingang wird dieser Ort genannt. Es gibt hier keinen neuen gruppenübergreifenden Backend-Inbox-Aggregator.
- Transferangebote tragen im vorhandenen Listenvertrag keinen Fährtennamen oder Empfängerhund vor Annahme. Der Hub verwendet neutrale lokalisierte Titel; keine Beispielnamen oder vermeintlich bekannten Hunde werden eingesetzt. Tatsächliche Referenz und eigene Hunde werden weiterhin im bestehenden Übernahmescreen gelesen/gewählt.
- Sortierung verwendet tatsächliche gespeicherte Geräte-/Serverzeitstempel. Es wird kein erfundener Empfangszeitpunkt eingesetzt.
- Fehler/Offline behalten zuvor bekannte Einträge mit Aktualisierungsfehlerhinweis; nach einem Kontowechsel werden sie nicht in das neue Konto übernommen.

## Prüfungen

- Abschließende Regression: 35 Suites, 310 Tests bestanden; enthalten neue UI-/Navigation-/Metadaten-/Konto-/ABA-/Offline-/Resume-/Ablauf-/Kontaktfehlerfälle und bestehende Datei-/Gruppen-/Transfer-/Gap-/Import-/Rückgabeprüfungen sowie Health-/TrackShare-/Connection-Regressionen.
- Vollständiger TypeScript-Check bestanden.
- ESLint für sämtliche geänderten/neuen TS-/TSX-Dateien: 0 Fehler, 0 Warnungen.
- `git diff --check` sowie Prüfung neuer Dateien bestanden; abschließende Belege und Hashes im Freeze.
- Die initialen neuen UI-Tests hatten Wrapper-Zählfehler und einen unvollständigen RN-Testmock; diese Testfehler sind korrigiert und die vollständige Suite wurde wiederholt. Ein zusätzlicher bestehender statischer Connection-Test verlangte die exakte alte Funktionssignatur; diese bleibt jetzt durch den bestehenden öffentlichen Wrapper unverändert, während das neue strikte Lesen denselben internen Query nutzt.
- Visuelle Prüfung der tatsächlichen `SharingView.tsx` über React Native Web: Übersicht, Eingang, Gesendet, Kontakte, große Schrift 180 % bei 320 Pixeln, Scrollende/Dateilink. Dabei erkannte Tab- und Abschnittskopf-Überläufe wurden korrigiert; abschließende Button-Grenzprüfung zeigt keinen horizontalen Überlauf.
- Vorschau enthält ausschließlich klar als QA gekennzeichnete Testdaten außerhalb des Produktcodes. Native Icons werden nur im Vorschau-Harness durch passende SVG-Symbole dargestellt. Statisch gerendert, keine funktionsfähige App und kein Gerätebeleg.
- Reale iOS-/Android-, VoiceOver-/TalkBack- und Geräte-Offlineprüfungen bleiben ausdrücklich zurückgestellt. Sprachliche Abnahme durch Muttersprachler bleibt offen.

## Übergabe an 01

- Das gesicherte Patch ausschließlich auf FRISCH verifizierte kumulative Runtime-Quellen portieren. Diese Entwicklungsbasis `7521…` darf nicht als neuer Production-Stand veröffentlicht werden; die inzwischen ausgelieferten R2-/Support-/nativen Korrekturen erhalten.
- Ziele laut Nutzer: iOS Build 52 mit tatsächlicher Runtime `1.0.5-motion-v2` und kompatible Android-Linien nach frischem Preflight (bestehende 1.0.4 und gegebenenfalls der inzwischen vorbereitete native Android-47-Stand 1.0.5). Keine Runtime umbenennen, keine native Funktion per OTA versprechen und keine Android-Gap-Sperre entfernen.
- Produkt-Allowlist/Hashes, vollständiges Patch, i18n-Delta, Tests und Screens liegen unter `outputs/sharing-groups-design-07/` im Projektspiegel.
- Nach Integration relevante Tests/Typecheck/Lint, tatsächlichen Einstieg im Export und neue Texte/Route im gebündelten Source-Map-Inhalt verifizieren. Anschließend regulären Production-Wrapper/Ancestry-/Environment-/Native-Kompatibilitäts-Preflight ausführen. Kein alter UI-/R2-Beleg darf als Design-PASS übernommen werden.
- 01 bleibt alleiniger Publisher. Er muss tatsächliche Update-/Group-IDs, Runtime, Plattform, Produktionsumgebung, Quellcommit und Bundle-/CDN-Nachprüfung liefern.
- Durch 07 kein Commit, Push, Merge, OTA, nativer Build, Store-Release oder Live-DB-Schreibzugriff. Andere eingefrorene Worktrees unverändert.
