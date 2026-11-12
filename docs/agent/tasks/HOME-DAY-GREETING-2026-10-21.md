# Home Tagesgruss – Issue4 – 07 – 2026-10-21

## Auftrag / Quelle

Direkte Human-Werkstattnachricht `01a16060-da0d-7e70-a675-f624945c2f66` und vollständiges GitHub-Issue https://github.com/dogbossvibes/CarniFlow/issues/4 persönlich gelesen. VarianteB: fünf Mintpunkte, personalisierter Tagesgruss, kleiner öffentlicher Benutzername, Originalton optional, alle bestehenden Home-Funktionen erhalten. iOS/Android-OTA ausdrücklich erst nach bestandenen Sicherheits-/Kompatibilitäts-/UI-/Audiogates. Dauerfreigabe für eigene geprüfte Commits/normalen GitHub-Backup mit00,01 einziger Publisher; kein Nativebuild/Store/DB/Tracking-/Auth-/Abo-Delta.

Sole Writer07: `/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/anyvo-home-day-greeting`, Branch `feat/home-day-greeting`, sauberer Ausgangs-HEAD `d6442ac1257b080ecd2e596b3653b195c6764208` (SingleChoice-iOS53-Quelle). Neues isoliertes Worktree; App-Worktreewerkzeug meldete im nicht-Git-Projektroot „Not a git repository“, reguläres Git-Worktreeadd auf bekannter Releasequelle genutzt. Keine Journal-WIPs/fremden Statusdokumente geändert. Aktuelle endgültige Production-/Nativebasen vor einer späteren Integration durch01 frisch zu prüfen.

## Umsetzung

Bestehendes Home verwendet neue kleine `HomeDayGreeting`-Komponente, bestehende Widgets/Navigation/Bilder unverändert. Lokale Tageszeitgrenzen05/11/18, erneute Berechnung bei Fokus/Resume und alle30s. Vorname aus bestehendem authentifiziertem Profil (ID muss aktuellem Account entsprechen), sonst eigener User-Metadatenname; kein Emailfallback mehr. Leere/ungültige Namen neutral; öffentlicher Benutzername validiert und kleiner/dezenter. Kombinierter Screenreader-Header, dekorative fünf Mintpunkte ohne Touchfläche/Logo/Loop. Einmal pro Account und App-Prozess, etwa1.88s subtile native-driver-Welle und2040ms Obergrenze; ReducedMotion statisch, Screenreader unterdrückt den optionalen Ton. Profil-/Settingsloads lösen keine Wiederholungen aus.

Originaldatei `/Users/moyo/Downloads/ANYVO_Begruessung_Spotton_ab23s.mp3` unverändert als `assets/audio/anyvo-greeting.mp3` kopiert, SHA256 `67dff7ede179982f30ba9017f865ba0f5da073148bd6d9f62c5e5f0090c079d3`. afinfo2.040000s/48kHz/Stereo/192kbps; keine weitere Sekunde23-Ausschneidung oder Bearbeitung. MP4 nur Referenz, nicht eingebunden (SHA2565102ffed372753aa6cd2eb78daa2d37f8b9e520470a8d6fd8f1f00842b7172de). Lokal gebündeltes Require, keine Remote-Audio-URL. Tatsächliche Offline-Wiedergabe auf Geräten noch nicht bestätigt.

Optionaler Ton standardmäßig AUS, in bestehendem Home-Anpassen ein lokaler accountgebundener Schalter. Separater kleiner Home-Tonstore mit geteilten Snapshots, expliziter Loadbereitschaft, accountgebundenen Keys, serialisierten Writes und Rollback auf wirklich gespeicherten Wert. Bestehende Home-Konfiguration und DB unverändert. Erklärung: erster berechtigter Home-Besuch nach App-Neustart; Umschalten spielt nicht sofort einen Ton ab. Vier neue Schlüssel in allen fünf Sprachen.

## Audio-Änderungen / bewusst konservative Grenzen

Kein vorhandener globaler Audio-Mutex. `lib/greetingAudioSafety.ts` gibt vorhandener Aufnahme/Mediensteuerung Vorrang: zwölf vorhandene AudioMode-Aufrufe in genau fünf Dateien delegieren ihre unveränderten Argumente an denselben Expo-Aufruf: `components/ui/AudioRecorder.tsx`(3), `components/training/CommentThread.tsx`(3), `app/chat/[id].tsx`(3), `app/unit/detail.tsx`(1), `features/voice/services/voiceRecordingService.ts`(2). Ihre AST-Statement-Bodies wurden gegen Parent verglichen: identisch nach reinem Funktionsnamenwechsel, Importänderung ausgenommen. Dennoch ist dies eine echte Semantikänderung und benötigt unabhängigen Review: Eine gerade laufende Home-Modusinitialisierung wird zuerst abgewartet, dann wird der vorhandene Aufruf ausgeführt; dekorativer Ton wird vorab gestoppt. Fehler beim dekorativen Cleanup blockieren den bestehenden Aufruf nicht. Bereits benutzte fremde Audio-Session sperrt weitere Begrüssungstöne im selben Prozess.

Greeting initialisiert nur vor fremder Audioübernahme einmal `playsInSilentMode:false`, `allowsRecording:false`, `shouldPlayInBackground:false`, `interruptionMode:mixWithOthers`. Kein späterer Reset auf geratenen Modus, kein globales Deactivate beim Ende/Pause (`keepAudioSessionActive:true`), native Player/Listener/Timer beim Ende/Blur/Background/Unmount freigegeben. Recording-/Listening-/Tracking-/Warmupzustände ausschließlich lesend überwacht; keine Trackingdatei geändert. Bestehende Sprachwiedergabe vor Start geprüft und während des maximal2040ms Fensters abgefragt. Kein atomarer nativer Speech-/Audio-Mutex behauptet; reale Unterbrechungs-/Voice-Koexistenz muss geprüft werden.

## Tatsächlich ausgeführte Prüfungen

Finaler Cold-Lauf ohne Cache:11 Suites/262 Tests PASS,0 Fehler/Skipped. Einschließlich Tageszeitgrenzen/Zeitzonen-Neuberechnung, Name/Handle-Sanitizing, Account-A-B-A/once-Prozess, reduzierte Bewegung und Screenreader-Suppression, Profileload/Refokus/Resume, verspätete Initialisierung/Unmount, Aufnahme-Priorität/Race, Ton-Aus,2040ms-Abbruch, native Play-/Pause-Fehler/Cleanup, accountisolierte Settings/Writereihenfolge/Rollback, Homekonfiguration, Journal-Speichern/atomare Summary und i18n. Das sind reine Unit-/React-Renderer-Prüfungen, KEINE iOS-/Android-Geräteabnahme.

Vollständiger Typecheck nach Testtypkorrekturen Exit0. ESLint aller20 Code-/Test-/Sprachpfade:0Fehler,7Warnungen. Alle7 exakt gegen Parent via eslint--stdin gegengeprüft:6vorbestehendeUnused-Warnungen in Home,1vorbestehenderUnusedImport in Chat. Keine neuen Warnungen; keine unrelated Bereinigung. Vorbestehende act-Warnungen in Home-Konfigurationssuite im Rohlog erhalten.

Erste Tests:1Testfixture erwartete zusammengesetztes Textkind als einen String (133PASS/1FAIL); Assertion auf sichtbaren zusammengesetzten Text berichtigt. Test-only TypeScriptfehler durch minimale repositoryeigene Renderer-Typdeklarationen explizit typisiert. Zusätzliche Cleanup-Fehlerabsicherung produktiv ergänzt, danach kumulativ262PASS. Frühere Negativlogs bleiben erhalten; keine erhöhten Timeouts/Skips.

Git diff--check PASS. Original-Medienhash und afinfo geprüft. Offizielle Expo-SDK54-Audio-Dokumentation auf originalem Repositorybranch sdk-54 gelesen; installierte expo-audio1.1.1 Typen/nativeSources geprüft, keine latest58-API übernommen. Keine Dependency-/Nativekonfiguration verändert.

## STOP / offene Akzeptanzkriterien

**NICHT RELEASEFÄHIG.** Android `playsInSilentMode` ist im installierten AudioMode-Typ ausdrücklich @platform ios. Unter bestehender Native-/Dependencygrenze keine verlässliche Android-Ringerstatus-/Lautlosgarantie nachgewiesen. Daraus kein Audio-PASS ableiten; automatischer Ton muss vor Production unter Android-Lautlos/Medienlautstärke/Unterbrechungen real verifiziert oder innerhalb gesondert freigegebenen Scopes gelöst werden.

`adb devices -l` nach zulässigem Sandboxzugriff erfolgreich, Liste leer: kein angeschlossenes Androidgerät/Emulator. `xcrun simctl` nicht verfügbar, kein volles Xcode-Setup nachgewiesen. Daher keine native UI-/Audio-/Screenreader-/DynamicType-/kleinesDisplay-/Offline-Abnahme und keine Geräte-Screenshots/Videovorschau erstellt. Das Issue fordert diese Prüfungen ausdrücklich; historische globale „Gerätetests deferred“ gilt hier nicht als Ausnahme. Kein voller OTA-Bundle-/Production-Preflight/Publish bei diesen offenen Gates, keine Device-PASS-Behauptung.

Evidenz im übergeordneten Projektordner `outputs/home-day-greeting-07-2026-10-21/`: finale262Tests, Typecheck/Lint/Parent-Warning-Vergleich, fünf Caller-Bodyvergleiche, Medien-/Geräte-/Audio-Gates, Quellfreeze. 00 koordiniert Backup;01 unabhängiger Review und mögliche Veröffentlichung erst nach allen Gates. Keine externen Issuekommentare. Keine OTA/Build/Store/DB-/Trackingänderung durch07.
