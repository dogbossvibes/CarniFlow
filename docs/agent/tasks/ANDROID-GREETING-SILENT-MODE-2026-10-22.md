# Android-Begrüßung: Lautlosmodus – 07 – 2026-10-22

## Auftrag und Arbeitsstand

Direkter Humanauftrag in07: Lautlosmodus-Problem beheben, mit01 nötigen Build klären, Geräteprüfungen zurückstellen. Weitere Humanfreigabe im MASTER für natives Android-Build/Veröffentlichung nach Review und Preflight durch01; vom MASTER und01 bestätigt.07 startet keinen Build/Release.01 ist einziger Integrator/Publisher,00 koordiniert GitHub-Sicherung,04 unabhängigen Native-Review über00.

Isolierter Fix-Worktree `/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/anyvo-android-greeting-silent-mode`, Branch `fix/android-greeting-silent-mode`, Ausgangs-HEAD `f24743398694831db6080a2a1d16e70a579c00c0` (Home-Feature). Das ist ein Featurefix, KEINE kumulative Android-Releasequelle.01 muss die vollständige Home-Änderung und dieses kleine Folgedelta auf seine aktuelle Android-Quelle integrieren und dabei sämtliche Build48-Korrekturen erhalten; zuletzt mit01 abgeglichen `f0b050e4164355f9489ea8a194f730b1cc0eb57b`. Keine fremden Release-/Trackingdateien verändert. Keine neue npm-Abhängigkeit, Berechtigung, DB-/Auth-/Aboänderung oder Änderung am Systemlautlosmodus.

## Ursache und Entscheidung

`expo-audio`1.1.1 `playsInSilentMode` ist iOS-spezifisch. Die frühere alleinige Prüfung dieses Players war jedoch zu eng: `react-native-volume-manager`2.0.8 ist bereits vorhanden.01 hat Getter/Listener und Registrierung in den tatsächlichen AABs47/48 nachgewiesen: `outputs/home-day-greeting-android105-release-01-2026-10-22/existing-ringer-api/ACTUAL-47-48-RINGER-API-PROOF.json` (SHA256 `2d8e42b69fa4b4213cdb04d33fe9337fd8a90d4b4f2456e79dfb1747ca7c4bec`).

Ein zunächst lokal getestetes JS-Gate wurde verworfen und ist NICHT Bestandteil dieses Fixes: Getterantwort → JS → nativer Playaufruf sowie Ringerereignis → JS → Pause bleiben vom JS-Thread abhängig; die vorhandene Observerregistrierung verschluckt Fehler.04/01 bestätigten diesen konkreten Reviewbefund. Der neue native Adapter ist wegen dieser Start-/Stopsemantik erforderlich, nicht wegen angeblich fehlender Getter.

## Änderung

Lokales Android-only Expo-Modul `modules/anyvo-greeting-audio`, API1. Nur der feste, unveränderte Originalton wird als Raw-Ressource eingebaut; keine freien Dateipfade/URLs, Accountdaten oder anderen Medien werden an native Methoden gegeben. SHA256 beider MP3-Kopien `67dff7ede179982f30ba9017f865ba0f5da073148bd6d9f62c5e5f0090c079d3`.

Native Wiedergabe ist auf dem Main-Looper serialisiert. Die Ringer-/Noisy-Receiverregistrierung muss vor der ersten Zustandsabfrage erfolgreich sein; Ausnahmen führen zum Abbruch. Ringer NORMAL, normale Audio-Betriebsart, hörbare Medien- und Systemlautstärke, keine aktive Aufnahme, sichtbare/fokussierte Activity und nicht aktivierter DND-Filter sind konservative Voraussetzungen. Unbekannter Zustand/Fehler bleibt still. Der MediaPlayer verwendet `USAGE_ASSISTANCE_SONIFICATION`/`CONTENT_TYPE_SONIFICATION`, keine Media-Usage und keine Bypassflags. Systemlautstärke, DND, Ringerzustand und Audiofocus werden nicht verändert.

Nach asynchronem Prepare werden Policy, Cancelzustand und monotone Deadline erneut unmittelbar vor `start()` geprüft. Native Ringer-/Kopfhörerereignisse stoppen ohne JS-Roundtrip; ein nativer25ms-Watchdog prüft die Voraussetzungen zusätzlich. Silent/Vibrate, Audiofehler, Ablauf, Pause/Destroy oder Cancel beenden den eigenen Player ohne Replay/Resume. Alte Prepare-/Completion-Callbacks sowie alte Token-Stops können einen neueren Player nicht beeinflussen. Eine bereits abgebrochene/abgelaufene verspätete Startanforderung darf auch keinen neueren Player stoppen.

`beginSession` erzeugt eine opake UUID mit maximal2040ms monotone Lebensdauer. JS übergibt nur die restliche Dauer des bestehenden Begrüßungsfensters. `cancel` markiert synchron thread-sicher den Abbruch, bevor ein queued Play starten könnte; `stop` bestätigt die tatsächliche native Freigabe. Bestehende Aufnahme-/Medienaufrufe warten über `greetingAudioSafety` auf dieses Stop-ACK, auch bei zwei gleichzeitigen Übernahmen oder zuvor durch Blur gestarteter Freigabe. Keine globale Audio-Deaktivierung und kein geratenes Wiederherstellen eines fremden Modus. Native Android-Begrüßung initialisiert keinen gemeinsamen Expo-Audiomodus. Vorhandene fünf Audio-Caller bleiben unverändert; iOS verwendet weiterhin den bisherigen Expo-Player und seinen Modus.

Der optionale Ton bleibt standardmäßig aus. Darstellung, Punkteanimation, ReducedMotion-/Screenreader-, Account-/Fokus-/Speech-/Aufnahme-/Tracking-Schutz bleiben bestehen. Fehlt die neue native API oder ist sie inkompatibel, gibt es KEINEN ungeschützten Audiofallback auf alten Binaries. Der neue Ton kann daher nicht allein per OTA in Build47/48 eingebaut werden: neuer nativer Android-Build und durch01 abgegrenzte neue Runtime erforderlich. Diese API darf nicht als Voraussetzung in eine OTA für Runtime1.0.5 eingeführt werden. Keine neue Runtime/Versionsnummer durch07 geraten.

## Tatsächliche Prüfungen und Grenzen

13 native JVM-Controllerfälle: Receiverfehler, stiller Snapshot, Wechsel während Prepare, Cancel vor queued Start, native Policyänderung/Watchdog ohne JS, monotone Deadline, Lifecycle/alte Callbacks, Ersatzgeneration, Prepare-/Startfehler, keine Doppelwiedergabe und verspäteter alter Start. Das sind native Logiktests mit Fake-Host, keine Android-Gerätetests.

Vollständige neue Kotlin-Modulquellen gegen echte lokal vorhandene Android36-, ReactNative0.81.5- und ExpoSDK54-Klassen kompiliert; keine API-Stubs. Originalressource mit Android AAPT2 kompiliert/verlinkt, daraus tatsächlich generierte R-Klasse für Kotlin verwendet. Dies ersetzt weder einen vollständigen AGP/AAB-Build noch eine Geräteabnahme. Erster Kompilierversuch scheiterte an rekursiver Typinferenz beim Receiver; expliziter BroadcastReceiver-Typ korrigiert, danach gesamte Kompilierung erfolgreich.

Gezielte JS-/React-Tests und Home-/Journal-/Settings-/Sprachregressionen:12 Suites/275 Tests PASS,0 fehlgeschlagen/übersprungen. Vollständiger Typecheck Exit0, ESLint aller6 geänderten/neuen TS/TSX-Dateien0 Fehler/0 Warnungen, Diffprüfung PASS. Datei-/Evidenzhashes stehen im daneben erzeugten Freeze `outputs/android-greeting-silent-mode-07-2026-10-22/SOURCE-FREEZE-07.json`. Ein früher Test des verworfenen JS-Gates hatte eine synchrone Erwartung trotz jetzt asynchronem Testpfad; keine produktive Regression daraus behauptet, keine Timeouts erhöht oder Tests übersprungen.

04 reproduzierte im ersten Stop-ACK-Entwurf einen echten Account-/Cleanup-Race: spätes CleanupA konnte das noch ausstehende StopACKB durch ein bereits aufgelöstes A-ACK ersetzen. Behoben durch Akkumulation aller einzeln fehlerabgesicherten Stopbarrieren; stale Cleanup kann keine neuere Barriere ersetzen. Exakte A→B→B-Blur→staleA→Recording-Regression ergänzt und im finalen275-Test-Lauf bestanden. Dieser konkrete Reviewbefund wird vor Integration von04/01 unabhängig nachgeprüft.

Android-Autolinking erkennt das neue Modul; Apple-Autolinking muss es ausschließen. Keine physischen Audio-, OEM-, DND-, Bluetooth-/Kopfhörer-, Aufnahme-/Voice-Koexistenz- oder Lifecycleprüfungen ausgeführt: gemäß Humanauftrag zurückgestellt. Kein universelles sample-atomares Hardware-/OEM-Versprechen. Native Policy und Sonification-Routing vermeiden den belegten JS-/Media-Pfadfehler; das tatsächliche Geräteverhalten bleibt ungeprüft. Bei normalem Ringer, aber stummer Systemlautstärke oder DND bleibt der dekorative Ton absichtlich ebenfalls still.

## Übergabe

04/01 prüfen den exakten Freeze unabhängig vor Integration.01 führt neuen Runtime-/Build-/Retention-/Environment-/Quell-/GitHub-Preflight aus und startet allein den ausdrücklich beauftragten Build/Release.07 hat keinen Push, Build, Store-Schritt, OTA oder DB-Write durchgeführt. Die spätere Trainings-UX-Stufe3+4 ist ein anderer Auftrag und wird nicht in diesen Fix gemischt.

Quellen: [Expo SDK54 Audio-Typen](https://github.com/expo/expo/blob/sdk-54/packages/expo-audio/src/Audio.types.ts), [Expo SDK54 Module API](https://github.com/expo/expo/blob/sdk-54/docs/pages/modules/module-api.mdx), [Android AudioAttributes](https://developer.android.com/reference/android/media/AudioAttributes), [Android AudioManager](https://developer.android.com/reference/android/media/AudioManager).
