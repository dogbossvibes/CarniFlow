# Minimaler Android-1.0.1-Footeradapter

- Worktree: `/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/anyvo-tracking-evaluation-footer-android101`
- Branch: `fix/tracking-evaluation-footer-android101`
- Basis/HEAD unverändert: `d9b5a87730554ae48468a6b20d68e66a01784891`.
- Initialer Status sauber, 07 alleiniger UI-Writer. Eigene vier Auftragsdateien.
- Direkter Android-Fix/OTA-Auftrag im Workflow; direkte aktuelle MASTER-Freigabe
  userMessage `01a12437-a5b3-7953-91dd-45fae53f9c93` selbst gelesen:
  „alle offenen OTA ausführen, ohne vorherigen gerätetest“.
- Zusätzliche Runtime von Publisher 01 gefunden: aktive Android-1.0.1-Gruppe
  `53e3be8e-8d0f-4832-801c-b521fc1fd768`, Update
  `01a07abe-b292-790f-9f1c-2c1879eb7d59`, Source gleich Basis, laut frischem
  EAS-Abgleich 01 um 07:10:11 Europe/Zurich. Keine eigene EAS-Abfrage durch 07.
- Build41 laut 01: `b24f3f44-126c-453c-be0d-aef1a2b99a80`, Source
  `29d5d398f1f8b27fa026d1dc98c8a7c6479ba19b`. EAS ist kein Play-Nachweis;
  tatsächlich installierte Versionen und Nutzerzahlen unbekannt.

## Scope und Ist-Befund

Auch auf dieser alten Basis: Root-SafeArea top-only, Footer außerhalb der
ScrollView, paddingBottom26 ohne System-Inset. Dieselbe UI-Ursache für die
Überdeckung. Eigenständige Scrollblockade und Geräteempfang weiterhin OPEN.

Nur Screen-Hülle und Footer ersetzt: lokale `TrackEvaluationLayout` ist bytegleich
zum geprüften Android103/104-Paket. Shared AnyvoButton auf beiden Basen bytegleich.
Android-SafeArea bottom/left/right, genau einmal additiv; flexShrink0-Footer im
normalen Layout, flex1/minHeight0-Scrollraum. iOS-KAV-padding erhalten;
Android-KAV undefined erhalten, handled taps und on-drag keyboard dismiss.
Große Schrift/schmale Breite: gestapelte Aktionen, minHeight48 und Höhe auto;
Standard-Row weiterhin 1:1.4. Keine Änderung an Labels oder globalem Button.

Keine moderne Screen-Version importiert. Insbesondere keine Übernahme von
PDF/C1/Kalibrierung/Scoring/GPS/Recovery/Export-Datenpfaden. Alle bestehenden
Inhalte und Save-/Logbook-/Notizhandler unverändert. app.json, package.json,
Lockfile und runtimeVersion unverändert. Alte Runtime bleibt 1.0.1.
Das Regressionstest-Harness ist lokal an die ältere Renderer-Typdeklaration
angepasst; keine Änderung globaler Typen oder Installation.

## Selbst ausgeführte Prüfungen

- Jest: 2 Suites, 8 Tests PASS: TrackEvaluationLayout (5) und vorhandene
  evaluation-conditions-layout (3).
- Save/Logbook-Callbacks, loading-Sperre, Layoutwechsel ohne Verlust bearbeiteter
  Notiz, Android-Edge-Vertrag/Footer außerhalb Scroll, iOS-Strategie/Proportionen.
- Vollständiger `tsc --noEmit`: PASS.
- ESLint Screen/Layout/Test: 0 Fehler, 1 unveränderte Baseline-Warnung (`LatLng`
  unbenutzt bereits in HEAD). Durch Extraktion neu unbenutztes Platform entfernt.
- `git diff --check`: PASS.
- Physische Insets/IME-Geometrie werden in Jest nicht geprüft.
- Temporären eigenen Dependency-Symlink vor Freeze entfernt.

## Abnahme und Übergabe

01 bleibt alleiniger Publisher. Eigenes Paket nur auf frisch bestätigter aktiver
Android101-Basis verwenden; Source/Assets/Runtime/Environment und Live-Manifest
prüfen. Moderne103/104-Publikation davon unabhängig fortsetzen.
Kein Commit, Push, Merge, Publish, Build, Store- oder DB-Zugriff durch 07.
Kein Reset, Löschen oder Neuinstallation vorhandener Kundendaten.

04 hat den konkreten101-Diff read-only geprüft: keine neuen Footer-API- oder
Native-Input-Anforderungen. Layout bytegleich zum geprüften104; vorhandene APIs
auch auf aktiver101-Quelle vorhanden. Native Source-Belege für Builds38–41 und
aktive101-Quelle: Expo54.0.36/RN0.81.5, SafeArea gelockt5.6.2 (Deklaration~5.6.0),
gleiche Plugins/localmodules. Dies ist Berichtsevidenz; keine APK-/AAB-Prüfung
dieser alten Builds durch04 oder07. Kein tatsächlicher WindowInsets-/Autolink-PASS.

Besondere Grenze laut04: Build39-Quelle `82b0868d` enthält weder expo-updates-
Dependency noch Updates-Config. Runtime1.0.1 allein beweist daher keinen OTA-
Empfang dieses Builds. 01 muss Source-/Native-Kompatibilität und tatsächliche
Auslieferung separat beurteilen; keine Behauptung, alle alten Installationen
seien erreicht. Builds36/37 sind vom begrenzten38–41-Review nicht abgedeckt.
Dies ist keine neue Anforderung des Footeradapters und blockiert103/104 nicht.

Physische
Geräte-QA bleibt OPEN, gemäß direkter Freigabe nach OTA: 3-Button/Gesten;
Tastatur auf/zu; letzte Inhalte scrollen; Actions erreichbar; unsaved Notiz
erhalten; große Schrift zusammen mit kleiner Höhe und offener Tastatur.
Fotografierte APK/OS und separate Scrollblockade weiterhin nicht verifiziert.

Offizielle Grundlage wie beim104-Paket:
https://docs.expo.dev/versions/v54.0.0/sdk/safe-area-context/
und https://reactnative.dev/docs/0.81/scrollview .
Runtime-Grenze: https://docs.expo.dev/eas-update/runtime-versions/ .
