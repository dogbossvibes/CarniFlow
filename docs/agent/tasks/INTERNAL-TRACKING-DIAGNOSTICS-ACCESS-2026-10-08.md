# Persönlicher interner Diagnosezugang — 2026-10-08

| Feld | Stand |
|---|---|
| Auftrag | Dedizierte, servergeschützte Diagnoseberechtigung für den direkt benannten bestätigten Account; Tester-/Abo-/Trainerrechte erhalten |
| Verantwortlich | Chat 05, Codex |
| Worktree | `/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/anyvo-internal-diagnostics-access` |
| Branch / Basis | `feat/internal-diagnostics-access`, `1a574212f6b7c1827bc03048f2eb5b5d662cd7a1` |
| Status | Lokal implementiert und geprüft; eigener Commit freigegeben. Live-Ausführung wartet auf aktionsbezogene Browserbestätigung. |
| Review | Eigenreview und kombinierte Regressionen; unabhängiger Release-Kandidatenreview offen |
| Git-/Releasefreigabe | Direkter MASTER-Nutzerauftrag vom 08.10.: offene OTAs vorher sauber committen; verifiziert per read_thread. Hier nur eigener Feature-Commit, kein Push/main-Merge/OTA/native Build/Store. |

## Implementierung und tatsächliches Verhalten

- `profiles.can_use_internal_tracking_diagnostics`: boolean, NOT NULL, DEFAULT false. Separater BEFORE INSERT OR UPDATE-Trigger verhindert Clientänderungen: INSERT erzwingt false, UPDATE erhält OLD. Nur bestehender privilegierter service_role-Kontext darf administrativ ändern. Fester leerer search_path; Triggerfunktion nicht als Client-RPC ausführbar. Partieller Unique-Index erlaubt höchstens einen freigeschalteten Account. Migration allein vergibt keine Rechte. Unerwartete vorhandene Spaltendefinition führt zum Abbruch.
- Gezielte Adminoperation löst ausschließlich die direkt benannte E-Mail in auth.users auf. Genau ein Treffer mit email_confirmed_at und vorhandener Profilzeile erforderlich. Prüft bestehende Own-Row-RLS und aktiven Schutztrigger; anderes bereits freigeschaltetes Konto führt zum Abbruch. Keine automatische Account-/Profilanlage, keine Umschichtung fremder Rechte.
- Vorher/Nachher-Vergleich aller übrigen Profilfelder (updated_at ausgenommen) sowie bestehender user_capabilities und subscriptions; Abweichung bricht die Transaktion ab. Keine Änderung von is_internal_tester/tester_level, Trainer-/Abo-Migrationsdateien, Billing oder Membership-Modell.
- Menü, Route, QA-Schalter, Capture und Export nutzen dieselbe flüchtige Authority. Sie wird aus einem schmalen Own-Profile-Serverread geladen, nicht aus einem gecachten Profil, Testerrollen, E-Mail im Bundle oder gespeicherter lokaler Freigabe.
- Autorisierung wird nicht persistiert. Erfolgreiche Freigabe gilt höchstens 60 Sekunden, während aktiver App alle 30 Sekunden erneut geprüft; Anfrageabbruch nach acht Sekunden. Nicht freigeschaltete Nutzer werden nicht ständig gepollt, sondern bei Login/App-Resume erneut geprüft. Fehlende Spalte, Fehler, Offlinezustand oder Ablauf sperren. Export/Kopieren/Teilen verlangen zusätzlich unmittelbar einen erfolgreichen Servercheck.
- Account-/Grantgenerationen verwerfen verspätete Netzwerk- und Speicherantworten. Logout/Accountwechsel sperren synchron. Ein verspätetes getSession-Bootstrap kann nach einem Auth-Ereignis kein altes Konto wiederherstellen. Provider-Unmount entfernt die Authority.
- QA-Präferenzen unter `anyvo.qa.preferences.v2.<userId>` werden erst nach positiver Serverprüfung wirksam. Alte globale Schalter werden ignoriert. Kein stiller Zugriff durch historische Testereinstellungen. Neue persönliche Präferenzen beginnen mit current/precision/QA aus.
- Laufende Quellen-/Engineentscheidungen sind bis zum regulären Stopp fixiert, einschließlich Hintergrund-Legen. Entzug beendet interne Diagnosebeobachtung, wechselt jedoch weder GPS-Quelle noch Engine unkontrolliert. Neue Streams dürfen keine gesperrte/fremde laufende QA-Konfiguration übernehmen. Bestehendes QA-abhängiges Stop-Flush-Verhalten bleibt für den laufenden Lay-Vorgang als Startsnapshot erhalten.
- Hintergrundpausen können JS-Timer verzögern. Deshalb prüfen Diagnosezugriffe und der Beobachtungsteil eines Fixcallbacks auch die Ablaufzeit direkt, ohne Netzwerkaufruf pro GPS-Fix. Nach Ablauf/Entzug beginnt ein alter Aufnahmebeobachter auch nach erneuter Freigabe nicht wieder zu schreiben. Normale Support-Erfassung bleibt erhalten; Search fällt von QA auf Support zurück und entfernt interne Dwell-Felder.
- Export prüft zusätzlich das Eigentum der gewählten lokalen Session. Vorbereitete Exporte sind an die konkrete Freigabegeneration gebunden. Accountwechsel/Entzug/Regrant kann einen alten Export nicht erneut freigeben. Erneute Prüfung nach asynchronen Lese- und Dateischritten.

## Kombinierter Diagnoseumfang und Android-Review

Der fertig geprüfte additive Chat-03-Diagnosepatch wurde im eigenen Worktree auf derselben Basis kombiniert; Konflikte in beiden Recordern und Export-Service/Test einzeln aufgelöst. Es gab keinen Git-Merge und keine Änderung im fremden Worktree.

Quelle: `/private/tmp/ANYVO-QA-RECORDING-EVIDENCE-2026-10-08.patch`, SHA256 `e92abb274d1ed591c8151b9d79527c225f7af483b4730a5c58b2ca3dcf745d1e`.

Enthalten sind schemaMinor 10, sessionbezogene Aufnahmeidentität, Quellen-/Lifecyclebelege und vorhandene Hintergrundzähler/Timeline. Recording-Evidence-Writer und -Loader sind hier zusätzlich an den persönlichen Grant gebunden; der Kunden-Supportexport enthält diese internen Belege nicht. Grenzen/Retention/Privacy wie im Chat-03-Quellbericht. Aufnahme-/Exportgeometrie unverändert. Diesen kombinierten Commit übernehmen; Chat03 nicht anschließend noch einmal anwenden.

Chat04-Patch `/private/tmp/ANYVO-ANDROID-TRACKING-DIAGNOSTICS-2026-10-08.patch`, SHA256 `6dd50fd05a7953ab8132bc42b95a9f2b59234f3839d83416e0fc101012e06842`, hinsichtlich gemeinsamem Screen reviewed: nur Import und Mount von AndroidTrackingDiagnosticsCard innerhalb PrecisionLocationTestContent und damit innerhalb DiagnosticsRouteGate. Die Karte zeigt nur Android-Systemstatus, fragt auf Tastendruck ab und schützt verspätete Antworten beim Unmount. Keine alternative Route oder Autorisierung. **Chat04-Native-/UI-Dateien nicht in diesen Kandidaten kopiert oder hier kompiliert.** Gesamte Android-Integration und Geräteprüfung bleiben beim zuständigen Kandidaten.

## Verifikation

- Kombinierte Jest-Prüfung: 49 Suiten / 470 Tests; zunächst 3 fehlerhafte Suiten. Der neu eingeführte Fix-Wrapper reichte anfangs das Processor-Ergebnis nicht weiter; vor Abschluss korrigiert. Die beiden betroffenen Lay-Suiten anschließend PASS. Die dritte Suite enthielt veraltete statische Import-/Share-Erwartungen; angepasst, anschließend 24/24 Tests PASS.
- Zusätzlicher echter Hook-/Source-Test für Entzug während laufender Suche: beide Quellen liefern weiter Punkte, keine neue/gestoppte Quelle, QA fällt auf Support zurück. `searchLocationOwnership`: final 16/16 PASS, zwei neue Tests gegenüber obiger Gesamtprüfung.
- Profil-/Deep-Link-Verdrahtung separat 7/7 PASS. Damit abgedeckte einzigartige Abschlussmenge: **50 Suiten / 479 Tests**, aufgeteilt auf Gesamtprüfung und gezielte Wiederholungen; kein behaupteter einzelner 50-Suiten-Lauf.
- Enthalten: abgelaufene und verweigerte Authority, verspätete Reads, Login/Logout/Accountwechsel, accountgebundene Prefs, gepinnte Engine/Quelle, Capture-/Evidence-Revoke, Own-Session-Export, frischer Serverentzug vor Export, Entzug während Datei-Write, veralteter Export nach Regrant, unveränderte Kunden-Supportpfade, Lay-/Search-Ausgabeparität mit/ohne QA.
- PostgreSQL **17.10**, neu erstellter lokaler Container ohne Netzwerk/Hostdaten: beide Schutzmigrationen, Auth-GUC-/Own-Row-RLS-Fixture und tatsächliche Grantoperation ausgeführt. PASS: Idempotenz, Default false, Client INSERT/UPDATE/UPSERT, fremde Zeilen unsichtbar, anon gesperrt, gezielter bestätigter Grant, übrige Tester-/Paidrechte, nur ein Grant, administrativer Entzug. Zusätzliche Abbruchfälle PASS: unbestätigte Mail, mehrdeutige Mail, RLS aus, bereits anderer freigeschalteter Account. Keine solchen Testmutationen in Production.
- Wiederholbare SQL-Positive-Suite: `supabase/tests/internal_tracking_diagnostics_access.sql` (ausschließlich leere, wegwerfbare lokale Datenbank). Zusätzliche Negative-SQL-Prüfung `/private/tmp/anyvo-diagnostics-negative-tests.sql`, Log `/private/tmp/anyvo-diagnostics-db-negative-tests.log`.
- TypeScript: finaler erneuter Lauf nach Wrapperkorrektur `npm run typecheck` PASS, Exit 0. Kein Timeout als Erfolg gewertet; unter hoher gleichzeitiger Rechnerlast dauerte der Lauf über 20 Minuten.
- ESLint: 0 Fehler, nach Korrektur der neu entstandenen Hook-Warnung verbleiben 25 bereits vorhandene Warnungen (Profil: 23; Lay-Hintergrundtest: 2). Letzter gezielter ESLint auf geändertem Recorder/Exporttest ohne Warnung.
- `git diff --check`: PASS. Temporärer Symlink auf vorhandene main/node_modules nach den Prüfungen entfernt; nicht Bestandteil des Commits. Isolierter PostgreSQL-Testcontainer nach positiven und negativen Prüfungen gestoppt/entfernt. Keine Dependency-/Lockfile-/Native-Konfigurationsänderung.

## Live-Preflight und noch offener Server-Schritt

Safari, eigenständige private Query, verifiziertes ANYVO-Projekt / main PRODUCTION. Schreibgeschützte Abfrage tatsächlich ausgeführt: Zieltreffer 1, bestätigter Treffer 1, Profiltreffer 1, profiles RLS true; ausschließlich profiles_insert_own / profiles_select_own / profiles_update_own für authenticated mit id=auth.uid(). Neue Capability-Spalte noch nicht vorhanden. Bestehende aktive Trigger: guard_profile_role und protect_internal_tester_fields. Keine Account-UUIDs, Tokens oder vollständigen Accountdaten im Bericht.

Reviewbare atomare Ausführung: `/private/tmp/ANYVO-personal-diagnostics-activation.sql`, zusammengesetzt aus Migration und gezielter Adminoperation. Die Browser-Bedienrichtlinie verlangt für sicherheitsrelevante Berechtigungserweiterung eine Bestätigung unmittelbar vor Ausführung trotz direktem ursprünglichem Auftrag; entsprechende konkrete Frage gestellt. **Noch keine Live-Migration oder Freischaltung ausgeführt.**

Nach Ausführung Ergebnis nachlesen: exactly_one_personal_grant=true, only_confirmed_target=true; anschließend frische lesende Nachkontrolle der Spalte/Trigger/RLS und genau eines Grants. Keine zusätzliche Membershipmutation. Safari-Single-Writer mit MASTER/06 abgestimmt.

## Grenzen und Übergabe

- Ein Offlinegerät kann einen Serverentzug nicht sofort erfahren. Der hier gewählte Zugriff läuft spätestens nach 60 Sekunden ohne bestätigten Refresh aus; bei dauerhaftem Hintergrund/Offline endet damit interne QA-Beobachtung. Die produktive Fährte läuft weiter mit festgelegter Engine/Quelle. Das ist eine bewusste konservative Zugriffspolitik, kein Nachweis sofortiger Offline-Revocation. Export verlangt Netzbestätigung.
- Bereits an das Betriebssystem übergebene Shares/Clipboard-Inhalte lassen sich nicht zurückrufen. Zugriffsprüfung erfolgt vor Übergabe; ein bereits begonnenes lokales Schreiben kann nach Entzug zu Ende laufen, erhält aber keine neue Sharefreigabe.
- Lokale PostgreSQL-Prüfung belegt SQL-Semantik auf der beschriebenen Fixture, keine signierte Supabase-JWT-/Geräte-End-to-End-Prüfung.
- iPhone-1.0.4-Geräteabnahme erst nach autorisierter Veröffentlichung durch Chat01: Owner-Menü/Route, QA bewusst aktivieren, Lege-/Suchlauf, Appwechsel/Display aus, passender Sessionexport, Logout/anderer Account/Entzug. Normale Kunden dürfen keinen internen Zugang erhalten. Keine behauptete Geräte-/OTA-Abnahme.
- Release-Chat01 muss den fertigen kombinierten Scope auf die FRISCH geprüfte aktive Runtime-Baseline übernehmen und deren bereits veröffentlichte GPS-/Shelly-/Maßstab-Funktionen erhalten. Kein pauschales main-Release aus diesem Worktree.
- Globale Agentstatusdateien und fremde Worktrees unverändert. Nutzer-E-Mail ausschließlich im beauftragten administrativen SQL und dessen Test, nicht im App-Bundle.
