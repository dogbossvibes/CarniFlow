# ANYVO – Platform Status

## Aktueller Android-Storestand — 2026-10-18

Android **1.0.5 (47)** ist laut frisch authentifiziertem Play-Console-Readback vom18.10.08:56:54Europe/Zurich öffentlich verfügbar (162Länder). Runtime1.0.5, Source39964e1f073e34783fa80d7603b12c0591688826, Build8c30df7d-2f6b-4858-8b40-93370575c98c; geprüftes Production-AAB mit neuem Logo/Splash und nativen DailyWidgets. ManagedPublishingistaufdirektenNutzerauftragausgeschaltet;nachReloadbestätigt. Geräteinstallation/Propagierung/QAnochOPEN. Derinterne46APK-StandistkeinaktuellerStorestandmehr. Bestehende45/104-GeräteerhaltenbisUpgradeihreseparatekompatibleOTA. AktuelleRuntime-/OTA-IDs,BelegeundFreigabegrenzenausschließlichim [Masterstatus](ANYVO_MASTER_STATUS.md); folgendeältereAbschnittesindhistorischeSnapshots.

## Hundefarben: iOS und Android 1.0.4 ausgeliefert — 2026-10-10

MASTER-EINTRAG

Datum:2026-10-10; CDN-Abschluss07:46:00/07:50:46 Europe/Zurich.
Thema: Freie Hundefarben nach separat bestätigter kompatibler DB-Erweiterung.
Status: Beide Production-OTAs durch01 veröffentlicht, PUBLISHED_LIVE_SOURCE_ALL_ASSETS_MANIFEST_CDN_PASS; Geräteempfang/-abnahme OPEN und ausdrücklich nachgelagert.
Enthalten: iOS1.0.4 Commit1221904ba0ff67d152063bfa0b29133da3ebdb33, Gruppe757a5f9d-d7b4-4fa3-bfde-7e104c101746, Update01a12458-4c26-7242-9fa7-01dd3232e67a. Android1.0.4 Commit3e667d10e9f6fdb6b474f85e5e3ea73855b96a71, Gruppe52696f2e-38c7-41c6-9a40-9edf58cc7b89, Update01a1245c-a634-7876-a946-ba9abf17f610. Vorherige Maßstab/Kalibrierung und Android-Footer erhalten; C1/Gruppen nicht enthalten. Ältere Runtimes erhalten keine Farben-OTA, bei HEX ggf. automatische Darstellungsfarbe.
Tests: iOS26Suiten471Tests/Android30Suiten493Tests, Typecheck/Lint/diff/Guard laut gelesenen Kandidatenbelegen PASS. Unabhängiges01-Review des07-Freeze gelesen. MASTER tatsächliche saubere Branches release/custom-colors-ios104 und -android104 samt HEAD/Dateihashes, LiveIDs, SourceMap/Bundle und alle48/49ManifestCDNAssets abgeglichen PASS. Belege outputs/CUSTOM-COLORS-{IOS104,ANDROID104}-{CANDIDATE,PUBLISH-STATE,LIVE,PUBLISHED-BUNDLE-PROOF,MANIFEST-CDN-PROOF}-2026-10-10.json und CUSTOM-COLORS-INDEPENDENT-REVIEW-2026-10-10.json.
Production betroffen: EAS production, explizite Plattform/Environment; FarbenDB bereits separat deployed dokumentiert. Kein neuer DBWrite/Push/mainMerge/NativeBuild/Store/Restore im MASTER.
Offen: Geräteseitig Tastatur/Mapkontrast/Accessibility/Offline-Neustart und reale HEX-Speicherung nicht geprüft; lokale Save-/ErrorTests und bestätigtes LiveConstraint ersetzen keine positive Geräte/APIAbnahme. Bekannte Winkel-Feldfehler offen. C1 bleibt ohne positive Zweiaccount-API-/Datenintegritätsabnahme unveröffentlicht.
Nächster Schritt:10 konkrete nachgelagerte Testwege; Hund→Bearbeiten→Fährtenfarbe, HEX wählen/Abbrechen/Übernehmen, Fehlerretry, Neustart/Offline und Hunde-/Accountwechsel; Farbe/Referenzoverlay auf Karten prüfen, vorhandene Profile bewahren, aktiveUpdateID belegen. Keine identische Wiederveröffentlichung.

## Android-Footer: drei Production-OTAs bestätigt — 2026-10-10

MASTER-EINTRAG

Datum: 2026-10-10; Manifest/CDN-Abschluss 07:33:00 / 07:37:08 / 07:41:05 Europe/Zurich.
Thema: Android-Auswertung, erreichbare Speichern-/Logbuchaktionen und Footer-Abstand zur Systemleiste.
Status: Android 1.0.4, 1.0.3 und Legacy 1.0.1 durch einzigen Publisher01 veröffentlicht; PUBLISHED_LIVE_SOURCE_ALL_ASSETS_MANIFEST_CDN_PASS. Geräteabnahme ausdrücklich nachgelagert OPEN.
Enthalten: 1.0.4 Commit022bda53d2f98581dc399b4cbcecb4974cb937a9, Gruppe8b13ffce-e5c5-4237-bcdb-75ad3f6ed3c1, Update01a1244c-6105-794d-b33b-800f2e5bcd37. 1.0.3 Commit2f513dbd37fa4a012679f2a2c0d8df5b9c7d3c27, Gruppeb20cfdd8-4293-415c-81cc-80ac9c2acc71, Update01a12450-2f69-7fe9-a25b-a08ba22af1d1. 1.0.1 Commit6070f02c695ad1f116c7c16f06b8d37534029ad5, Gruppef52ffbb1-7711-4373-a659-0bd843741189, Update01a12453-bb44-7cf3-be0e-79172c0a0e5c. Moderne Pakete bewahren Maßstab/Kalibrierung; C1 und freie Hundefarben ausgeschlossen. Legacy enthält nur separaten kompatiblen Footer-Layoutdelta.
Tests: 104/103 jeweils24Suiten427Tests, Legacy2Suiten8Tests; Typecheck/Lint/diff/ProductionGuard und Quellen-/Bundleprüfung laut gelesenen01-Belegen PASS. Unabhängiges04-Native-/Diffreview mit offenen Geräteannahmen gelesen. MASTER hat alle drei tatsächlichen Release-Branches/HEADs/sauberenStatus, Dateihashes, Candidate/PublishState/Live/SourceMap-/Bundlebelege abgeglichen; tatsächliche Manifest/CDN-Bytes samt allen49/49/48Assets PASS. Belege outputs/ANDROID-FOOTER-ANDROID104-, -ANDROID103-, -ANDROID101-{CANDIDATE,PUBLISH-STATE,LIVE,PUBLISHED-BUNDLE-PROOF,MANIFEST-CDN-PROOF}-2026-10-10.json sowie ANDROID-FOOTER-INDEPENDENT-REVIEW-2026-10-10.json.
Production betroffen: EAS production, explizit Android und Production-Environment. mainHEAD weiterhin1a574212f6b7c1827bc03048f2eb5b5d662cd7a1; keine Push-/Merge-/Native-/Store-/Restoreaktion im MASTER. FremdeWIPs erhalten.
Offen: Geräteempfang/Bedienbarkeit nicht bewiesen. Legacy-Buildquellen36/37/39 ohne expo-updates/config: Empfang UNKNOWN; kein neuer Alt-APK/AAB-Nachweis. Bekannte Winkel-Feldfehler unverändert. Farben-DB bereits separat bestätigt deployed; Farben-Client-OTAs104 werden durch01 vorbereitet. C1 benötigt weiterhin echte positive API-/Datenintegritätsprüfung mit zwei ausgewählten zugänglichen App-Testkonten; Schreibfreigabe vorhanden, Kontenauswahl offen.
Nächster Schritt:10 über drei bestätigte Pakete und konkrete nachgelagerte Testwege informieren;01 Farben104 auf aktuellen Production-Basen fortsetzen. Geräte-QA: vorhandene abgeschlossene Fährte → Auswertung → bis letztem Inhalt scrollen; Notiz/Tastatur öffnen/schließen, Speichern und Logbuch mit Drei-Tasten-/Gestennavigation, großer Schrift und Rotation prüfen. Bestehende Daten erhalten, tatsächlich geladene Update-ID belegen. Identische Pakete nicht erneut publizieren. Kontingent am Meilenstein87%verbraucht/13%verbleibend.

## OTA-Abschluss: Maßstab und Kalibrierung ausgeliefert — 2026-10-10

MASTER-EINTRAG

Datum: 2026-10-10, Abschluss04:09:06 Europe/Zurich; frischer EAS-Matrixabgleich04:09:04.
Thema: Nutzerentscheidung „geräte abnahme später, ota jetzt“ umgesetzt durch einzigen Publisher01.
Status: Sieben neue OTA-Gruppen veröffentlicht und vollständig nachkontrolliert; vier aktive Production-Runtimes bestätigt. Geräteempfang und Geräteabnahme weiterhin OPEN, ausdrücklich nachgelagert.
Enthalten: iOS1.0.4 und Android1.0.4/1.0.3 enthalten Maßstab, Meter-Markierungen, SmartFollow-/Native-Promise-Folgefix und Schrittlängen-Kalibrierung. iOS1.0.3 enthält separat geprüfte Kalibrierung, keinen neuen Maßstab. Aktive Matrix: ios 1.0.4: Commit 34532974df3b74f10ac3b97c0e66fd6f41585066; Gruppe d484eca2-bf2a-42ea-a210-e94004e11453; Update 01a12385-d04c-7784-b959-1254812679d9. android 1.0.4: Commit a5b2aadd5d6f6ac76e558dfb23c3425e08e5aa26; Gruppe c460316e-3461-4c49-b492-5cd2f72722fa; Update 01a12389-bb06-70d3-bd9b-5c05856f3ed5. android 1.0.3: Commit 44f76469f3976cd86022ac96748459f403a99d7b; Gruppe 8eb244a2-4733-4137-ae4f-e4a3a66e7f2e; Update 01a1238f-6014-7127-8e08-6546ad398260. ios 1.0.3: Commit 7a1bfbb4dfa33bad92cf1660bc3048fc026f8ec4; Gruppe f971a961-3f9f-4c12-9436-3b6426e29ddf; Update 01a12391-76c4-7a0c-b944-60a513eeea0d.
Tests: Kombinierte Kandidaten iOS10420Suiten/405Tests, Androidje20/396; iOS10311/259 laut gelesenen Kandidatenbelegen PASS. Typecheck/Lint/diff/ProductionGuard/Runtime-/Native-Kompatibilität und vollständige Quellen-/Bundleprüfungen PASS. Alle Manifest-/CDN-Assets PASS: iOS10448, Android10449, Android10349, iOS10347. MASTER hat abgeschlossenen01-Turn, Abschlussbericht, vier PublishStates/CDNProofs und frischenEAS-Matrixbeleg abgeglichen; tatsächliche vier Release-Worktree-Branches/HEADs/sauberenStatus selbst geprüft. Keine native Geräteprüfung daraus ableiten; überlappende Testzahlen nicht summieren.
Production betroffen: EAS production aktualisiert; kein Push/main-Merge/neuer nativer Build/Store-/DB-/Restore-Eingriff. Gitmain unverändert1a574212f6b7c1827bc03048f2eb5b5d662cd7a1; fremdeWIPs erhalten. origin/main41e51734053fbc9c04c5de527edd6bf464cce66e laut frischem01-read-only-Abgleich04:07:54. EASProduction bleibt getrennt vonGitmain. AppStore-/Play-Rollout nicht frisch verifiziert.
Offen: Tatsächlicher OTA-Empfang; native Kartenprovider/SmartFollow/Pitch/Layout/Accessibility, Kalibrierungs-Feldvergleich, Preferenceerhalt sowie Recorder-/BLE-/Resume-Isolation nachgelagert. C1-Gegenstandskorrekturen nicht veröffentlicht: positiveOwnerAPI-/Datenintegritätsbelege fehlen; keine zusätzliche LiveDB-Schreibfreigabe. iOS103-Maßstabadapter nicht validiert; Hundefarben-DB-Freigabe weiterhin separat offen. Bekannte Winkel-Feldfehler nicht als behoben erklärt.
Nächster Schritt:10 über alle bestätigtenAuslieferungen und konkreteTestwege informiert; Profil→Schrittlänge sowie Fährten→Legen/Absuchen später aufGeräten prüfen und aktiveUpdateID belegen. Kein erneutesPublizieren identischerPakete. FehlendeC1-/Farbenfreigaben separat behandeln. Belege outputs/OTA-RELEASE-RESULT-2026-10-10.txt/.json, OTA-FINAL-LIVE-MATRIX-2026-10-10.json und vier CALIBRATION-AFTER-SCALE-*-PUBLISH-STATE-/-MANIFEST-CDN-PROOF-2026-10-10.json. Kontingent amAbschluss:70%verbraucht/30%verbleibend.

## Maßstab-Folgefix auch Android1.0.3 ausgeliefert — 2026-10-10

MASTER-EINTRAG

Datum: 2026-10-10; CDN-Abschluss03:50:33 Europe/Zurich.
Thema: Maßstab und Meter-Markierungen samt SmartFollow-Folgefix, Android1.0.3.
Status: Durch01 veröffentlicht; Quellen-/Bundle-/Asset-/Manifest-CDN-NachkontrollePASS. Alle drei beauftragten Maßstabpakete nun ausgeliefert (iOS104, Android104, Android103).
Enthalten: Commit43da5d2e753c83f164d0bee67b72404018831c7b; Gruppeacc09b0a-75ab-4bb4-abec-d0811f5b4114; UpdateID01a12380-c4a1-73c6-91c5-a48b9836d2b2; BundleSHA25671a96bf97c009f0890a4e0e3866d82ffcb8edcf389b808a656b635d3f25d9c5a. iOS103-Maßstabadapter nicht enthalten.
Tests: IntegrierterAndroid10311Suiten/278Tests, Typecheck/Lint/diff/Guard und volleQuelle/BundlePASS laut01; alle49ManifestAssets/CDN PASS. MASTER PublishState+CDNProof abgeglichen; tatsächlichen Geräteempfang nicht geprüft.
Production betroffen: Android1.0.3 aktualisiert, frühere MaßstabpaketeiOS104/Android104 separat bereits bestätigt. KeineDB-/Native-/Store-/mainMergeaktion. Kalibrierung in diesemMaßstabpaket nicht enthalten.
Offen: NativeGeräte-/Provider-/Layout-/Accessibility-Abnahme ausdrücklich nachgelagertOPEN. KalibrierungsOTAs laufen separat; C1-positiveAPI-/Datenintegritätsgate weiteroffen.
Nächster Schritt:01 verbleibende technisch geprüfteKalibrierungsOTAs veröffentlichen; belegteEndstände aufnehmen.10 überAndroid103-Auslieferung undTestwege informiert. Belege outputs/MAP-SCALE-FOLLOW-ANDROID103-PUBLISH-STATE- und -MANIFEST-CDN-PROOF-2026-10-10.json.

## Maßstab-Folgefix für iOS/Android 1.0.4 ausgeliefert — 2026-10-10

MASTER-EINTRAG

Datum: 2026-10-10; iOS-CDN-Prüfung03:38:52, Android-CDN-Prüfung03:44:54 Europe/Zurich.
Thema: Maßstab und Meter-Markierungen inklusive SmartFollow-/Native-Promise-Folgefix.
Status: Beide Production-OTAs durch01 veröffentlicht und vollständig nachkontrolliert. Geräteabnahme auf ausdrückliche Nutzerentscheidung nachgelagert OPEN.
Enthalten: ios 1.0.4: Commit 7e84be084a3ea7228bd6817646d409da755cf715, Gruppe d5b3d6ed-7031-4a6e-b4fe-a573cf3c4c57, Update 01a12375-d976-7805-8f4c-e34ef793e8d7, BundleSHA256 01950c35f48e0a145ab625e88bad7372a6530cae75a64965c305c0567130867e, alle 48 Manifest-Assets PASS. android 1.0.4: Commit 14ec07671abc876e19d4dbbc114112676299a477, Gruppe a0ea9214-9e89-4441-a7f3-a0f0c09536ce, Update 01a1237b-7e98-7679-a185-07f6af75e399, BundleSHA256 aa3fefd498542b9a608417f1162f0e760bbc29fb513e3bbf661604a2d9e67b81, alle 49 Manifest-Assets PASS.
Tests: Integrierter Maßstab iOS11Suiten/287Tests, Android11/278 PASS laut01; Typecheck/Lint/diff/Guard und vollständige Quellen-/Bundleprüfungen PASS. MASTER hat beide PublishStates und Manifest/CDN-Belege abgeglichen. Cachebedingte alte Releasekennung vor Publish durch frischen Export korrigiert; veröffentlichte Kennungen entsprechen neuen Commits.
Production betroffen: iOS1.0.4 und Android1.0.4 aktualisiert. Kalibrierung/C1 sind in diesen beiden Paketen nicht enthalten. Gitmain weiterhin separat; keine Main-Integration/Push/NativeBuild/Store-/DB-Aktion im MASTER.
Offen: Android1.0.3-Maßstab-Auslieferung und Kalibrierungs-Veröffentlichungen durch01 noch nicht als abgeschlossen belegt; iOS1.0.3-Maßstabadapter ausgeschlossen. Native Geräte-/Feld-/Layout-/Accessibility-Abnahme und tatsächlicher Empfang weiterhin OPEN. C1-positiveOwnerAPI-/Datenintegritätsgate separat.
Nächster Schritt: Laufende restliche Veröffentlichungen durch01 verfolgen und belegte Endstände ergänzen;10 über bestätigte Auslieferungen mit Testwegen informieren. Keine identischen Pakete erneut veröffentlichen. Belege outputs/MAP-SCALE-FOLLOW-IOS104/-ANDROID104-PUBLISH-STATE- und -MANIFEST-CDN-PROOF-2026-10-10.json.

## Nutzerentscheidung: Geräteabnahme nach OTA — 2026-10-10

MASTER-EINTRAG

Datum: 2026-10-10, direkte menschliche Entscheidung im kanonischen MASTER.
Thema: „geräte abnahme später, ota jetzt“.
Status: Nutzer verschiebt Geräteabnahme ausdrücklich auf nach der OTA und beauftragt Veröffentlichung jetzt. Entscheidung an einzigen Publisher01 weitergegeben; keine Veröffentlichung allein aus dieser Freigabe ableiten.
Enthalten: Fortsetzung der laufenden Maßstab-Folgeintegration unter bestehender OTA-/isolierter Release-Commit-Freigabe. Geräteabnahme ist weiterhin OPEN und nachgelagert; kein Geräte-PASS behauptet.
Tests: Diese Entscheidung ist kein technischer Testnachweis. Quellen-/Hash-/Review-/Tests-/Typecheck-/Lint-/diff-/Runtime-/Ancestry-/Environment-/Native- und DB-Kompatibilitätsprüfungen sowie Manifest/CDN-Abgleich bleiben erforderlich.
Production betroffen: OTA-Veröffentlichung ausdrücklich beauftragt, Ergebnis noch durch01 zu belegen. Kein Push/main-Merge/neuer nativer Build/Store/Live-DB-Write/Restore daraus autorisiert.
Offen: Tatsächliche technische Freigabefähigkeit pro Paket und Runtime; C1-positiveAPI-/Datenintegritätsbelege werden durch verschobene Geräteabnahme nicht zu PASS. Legacyadapter weiterhin separat. Nachgelagerte native Geräte-/Feld-/Accessibility-Prüfung und tatsächlicher OTA-Empfang offen.
Nächster Schritt: 01 veröffentlicht technisch geprüfte verfügbare Pakete nach frischem Preflight, meldet Commit/Gruppe/UpdateID und LiveManifest/CDN-Belege; anschließend10 mit konkreten Testwegen informieren. Automatische Ablehnungen nicht umgehen, keine identischen Pakete erneut veröffentlichen.

## Maßstab bei laufender Kartennachführung: Folgefix lokal abgeschlossen — 2026-10-10

MASTER-EINTRAG

Datum: 2026-10-10; Owner-Freeze 03:25:06 Europe/Zurich, direkter Nutzerauftrag in 02 userMessage 01a1235f-89de-7c92-9bce-f3bac68b19f5 „offene punkte weiterarbeiten“.
Thema: Maßstabaktualisierung bei SmartFollow und Begrenzung ausstehender nativer Kartenabfragen.
Status: Lokal umgesetzt und unabhängig geprüft; an 01 zur getrennten Integration übergeben. Noch keine neue Veröffentlichung. Die früheren drei Maßstab-Releasecommits enthalten diesen Folgefix noch nicht und dürfen nicht als fehlerfreier Endstand behandelt werden.
Enthalten: Zwei synthetische Vorher-FAIL belegt: kontinuierliche Kartenbewegung verhindert Messung; Translation zwischen Projektionsbatches wird fälschlich abgelehnt. Folgefix umfasst begrenzte Abtastung, frischen Ursprung im Verifikationsbatch und Schutz vor alten Antworten. Zusätzlicher unabhängiger P2-Befund zu anwachsenden unbeantworteten Native-Calls durch physische MapView-Sperre, allSettled und abmeldbare Listener behoben. Drei Produktdateien, drei Testdateien und Bericht; Kamera und Recorder laut Freeze unverändert. Owner-Worktree anyvo-tracking-scale-follow-refresh, Branch fix/tracking-scale-follow-refresh, Basis/HEAD bc748ab1a4fec463976e9d13831db95cbd736ce3.
Tests: Owner 6 Suiten/103 Tests und überlappende Android4/70 PASS, Typecheck PASS, Lint0Fehler/1bestehendeWarnung, diff/reverse PASS. 07 unabhängig 3 Suiten/63 überlappende Tests sowie ursprünglicher Acht-Sekunden-Repro PASS; Typecheck/Lint im Review nicht wiederholt. MASTER hat abgeschlossene 02-/07-Turns, tatsächlichen Branch/HEAD/Working Tree, alle7Dateihashes, Patch und6Loghashes sowie diff/reverse geprüft. Keine echte Gerätebeobachtung aus synthetischen Repros ableiten.
Production betroffen: Keine neue OTA durch 02 oder MASTER; keine main-Integration, DB-/Native-/Storeaktion. main unverändert1a574212f6b7c1827bc03048f2eb5b5d662cd7a1, fremde WIPs erhalten. Keine neue EAS-Liveprüfung in diesem Abgleich.
Offen: Integration und unabhängige Runtime-/Bundle-/Releaseprüfung durch einzigen Publisher01. Native MapKit-/GoogleMaps-Projektion, tatsächliche Latenz, Pitch/SmartFollow, Layout und Accessibility weiterhin nicht abgenommen; iOS103Legacyadapter fehlt. C1-, Kalibrierungs- und Farben-Gates bleiben separat.
Nächster Schritt: 01 integriert das eingefrorene Folgedelta in die drei Maßstab-Kandidaten und prüft es unter bestehender Freigabe. Danach erforderliche native Abnahme und frischer Production-Preflight; keine unveränderten Alt-Kandidaten veröffentlichen. Beleg outputs/TRACKING-MAP-SCALE-FOLLOW-READY-2026-10-10.json; Patch SHA256 f34483bf88db6b06a5f6b992413d699ede9c52a2b5ae033135cfebe905859c6c. Kontingent am Meilenstein:68%verbraucht/32%verbleibend.

## Android-Maßstab: Commit-Blockade gelöst, technische Prüfungen bestanden — 2026-10-10

MASTER-EINTRAG

Datum: 2026-10-10; neue konkrete menschliche Bestätigung im MASTER userMessage01a122c9-fdfe-7862-ba7a-9c1a33067816.
Thema: Isolierte Android103/104-Maßstab-Release-Commits und erneute OTA-Freigabe.
Status: Neue konkrete Freigabe akzeptiert; beide Commits sauber und Guard-/Bundleprüfungen bestanden. Frühere automatische Commit-Ablehnung damit für diese Aktionen gelöst. Keine Veröffentlichung belegt.
Enthalten: Android10404409a9ebfe27733c9b10e9977d5ae89d100eaae aufe24861d0 und Android103c5478097d6ea00f8e7b2b09e2546966c9fa8880e auf7280444c, Branches release/visible-map-scale-android104/-android103, jeweils18geprüfteDateien. iOS104bc748ab1 bleibt separater geprüfter Kandidat. C1/Kalibrierung nicht beigemischt.
Tests: Android jeweils262Tests, Typecheck/Lint/diffPASS; frische ProductionGuardsPASS. Vollständige Android104567-/Android103565Produktquellen entsprechen Commit; Plattform, Commitstempel und geprüfteAssetsPASS laut01. MASTER hat die tatsächlichen beiden Branch-/HEAD-/sauberenWorkingTrees/diff und detaillierten Kandidaten-/Freigabe-/QA-Belege abgeglichen.
Production betroffen: Keine neue OTA, keinmainCommit/Push/Merge/Build/Store/DBWrite. Kundendaten unverändert; neue Freigabe ist keine belegte Geräteabnahme.
Offen: Native Kartenprojektion und Maßstabaktualisierung unter SmartFollow sowie notwendige Bedien-/Layoutabnahme. Nutzer kündigt Geräteprüfung „wird gemacht“ an; kein durchgeführterPASS und kein ausdrücklicherVerzicht. iOS103MaßstabLegacyadapter fehlt. Kritische C1SQLite/API- und KalibrierungLocation-/Recorder-/Feldgates unverändert.
Nächster Schritt: Ausführbaren kompatiblen Kandidatentestzugang bereitstellen, erforderlicheFunktionsabnahmen belegen, danach frischenProductionPreflight und Veröffentlichung unter bestehenderOTA-Freigabe. Keine erneuteCommitfrage für diese beiden erledigtenAktionen. Belege outputs/ANDROID-MAP-SCALE-COMMIT-AUTHORIZATION-2026-10-10.json, VISIBLE-MAP-SCALE-QA-GATE-ASSESSMENT-2026-10-10.json und VISIBLE-MAP-SCALE-ANDROID104/-ANDROID103-CANDIDATE-2026-10-09.json.

## Erneuter Auftrag: alle OTAs — geprüfter STOP am 2026-10-10, 00:18 Europe/Zurich

MASTER-EINTRAG

Datum: 2026-10-10; 01-Prüfabschluss00:18:36 Europe/Zurich.
Thema: Direkter Nutzerauftrag im MASTER „alle OTA veröffentlichen“.
Status: Erneut an einzigen Publisher01 weitergegeben; derzeit kein zusätzliches Paket veröffentlichungsfähig. Keine neue OTA.
Enthalten: Maßstab, Kalibrierung und C1 separat überprüft; acht saubere isolierte Release-Commits unverändert, zwei Android-Maßstab-Worktrees weiterhin uncommitted. Keine Änderung an main, Produktcode oder DB in diesem Lauf.
Tests: 01 frische EAS-/Geräte-/Kandidatenintegritätsprüfungen; keine unveränderten Tests wiederholt. MASTER hat aktuellen main-Branch/HEAD/Working Tree und abgeschlossenen01-Turn sowie Prüfbericht und Gerätebeleg gelesen. iPhone disconnected, kein Android über adb verbunden; keine native Kandidatenabnahme.
Production betroffen: Vier aktive Production-Gruppen unverändert und nicht pausiert: ios104fe68e129 / ios103d454a06b / android104e24861d0 / android1037280444c. Keine identischen Pakete erneut veröffentlicht. main1a574212f6b7c1827bc03048f2eb5b5d662cd7a1.
Offen: Maßstab native Karten-/Layoutabnahme, Android-Commits und iOS103Legacyadapter. Kalibrierung native Recorder-/BLE-Isolation, Speicherung und vermessener Feldvergleich. C1 natives SQLite6→7, Offline/Auth/Konflikte und positiveOwner-API-Abnahme; iOS103Fulladapter fehlt. R2 zuvor separat installiert, positiveAPI-Schreibtests dadurch nicht autorisiert oder belegt. Frühere automatische Android-Commit-Ablehnung bleibt; kein erneuter Versuch/Workaround.
Nächster Schritt: Konkrete Freigabe beider isolierten Android-Maßstab-Release-Commits direkt in01; ausführbarer nativer Kandidatenzugang auf erreichbaren iOS-/Android-Geräten und autorisierte isolierte Testdaten nötig. Danach belegte Abnahmen und frischer Preflight unter bestehender OTA-Freigabe. Belege outputs/OTA-RESUME-STATUS-2026-10-10.json/.txt, OTA-DEVICE-ACCESS-, OTA-LIVE-STATUS- und OTA-CANDIDATE-INTEGRITY-2026-10-10.json. Neuer OTA-Auftrag hebt Pflichtprüfungen und separate DB-/Buildgrenzen nicht auf.

## Maßstab-Preflight abgeschlossen: Geräteabnahme und Android-Commit blockiert — 2026-10-09, 19:52 Europe/Zurich

MASTER-EINTRAG

Datum: 2026-10-09; 01-Preflight 19:52:37 Europe/Zurich.
Thema: Sichtbarer Kartenmaßstab beim Legen und Absuchen, separates Release-Paket.
Status: Technische Vorbereitung abgeschlossen; keine Veröffentlichung. Automatische Android-Commit-Ablehnung und fehlende native Geräteabnahme verhindern Fortsetzung.
Enthalten: iOS104 sauberer isolierter Release-Commit bc748ab1a4fec463976e9d13831db95cbd736ce3 auf fe68e129. Android104/103 enge Darstellungstransfers auf e24861d0/7280444c, jeweils 18 Dateien uncommitted; Import-/optionale Darstellungstypen angepasst. C1 und Kalibrierung ausgeschlossen, eingefrorene Ownerquelle erhalten.
Tests: 01 iOS10411Suiten/271Tests, Android je11/262PASS; Typecheck/Lint/diffPASS. iOS104Guard und vollständiger Bundle-/Quellen-/AssetvergleichPASS. AndroidEnvironment/AncestryPASS, Guard verweigert schmutzigen Working Tree; Bundle deshalb nicht erzeugt. MASTER hat Preflightbeleg gelesen und die tatsächlichen drei Branch-/HEAD-/WorkingTree-Zuordnungen sowie diff geprüft. Keine installierte native Abnahme behauptet.
Production betroffen: Maßstab-Paket unveröffentlicht; bisherige Production-Matrix unverändert laut frischem 01-Preflight. Keine DB-/Nativeabhängigkeit. main unverändert1a574212f6b7c1827bc03048f2eb5b5d662cd7a1, fremde Dokumentänderungen erhalten.
Offen: Automatische Prüfung hat Android104-Commit zweimal ohne Ausführung abgelehnt: chatübergreifend gelesene MASTER-Erlaubnis gilt für den Prüfer als nicht vertrauenswürdiger Toolinhalt und hebt das Commit-Verbot in01 nicht auf. 01 hat die konkrete Freigabe für beide isolierten Android-Release-Commits beim Nutzer angefordert; keine Umgehung. iOS103Legacyadapter fehlt, dort verwirft bisheriger Run-Snapshot breakBefore; kein ungeprüfter Gesamttransfer. Native MapKit-/GoogleMaps-, Pitch-/SmartFollow-/Layout-/Screenreader-Abnahme fehlt; iPhone unavailable und kein Android angeschlossen (01-Prüfung19:39).
Nächster Schritt: Konkrete Android-Commit-Bestätigung direkt in01 und ausführbarer nativer Kandidaten-Testzugang erforderlich; anschließend AndroidGuard/Bundle, Geräteabnahmen und frischer Production-Preflight. Bestehende OTA-Freigabe bleibt gültig. Beleg outputs/VISIBLE-MAP-SCALE-RELEASE-PREFLIGHT-2026-10-09.json; keine erneuten unveränderten Prüfungen oder identischen Veröffentlichungen.

## Sichtbarer Kartenmaßstab: lokal abgeschlossen, Releaseprüfung offen — 2026-10-09, 19:27 Europe/Zurich

MASTER-EINTRAG

Datum: 2026-10-09; 07-Recheck 19:27:03 und 02-Freeze 19:27:52 Europe/Zurich.
Thema: Kartenmaßstab plus Meter-Markierungen beim Legen und Absuchen; direkter Nutzerwunsch in 02.
Status: Lokal umgesetzt und unabhängig im Code geprüft; noch nicht veröffentlicht. 01 prüft das separate Release-Paket.
Enthalten: Projektionsbasierter m/km-Balken in beiden Karten, kontrastreiche Linienmarkierungen und Lay-Linie mit Datenlücken; dynamische Abstände zwischen Metriken, Maßstab und Fortschritts-/Teilstreckenanzeige. Der von 07 belegte P2-Überdeckungsbefund ist für beide Routen im geprüften Code behoben. Owner 02: anyvo-tracking-visible-map-scale, Branch fix/tracking-visible-map-scale, Basis/HEAD fe68e1290161f12838bde6480d7868147b295995; 18-Datei-Freeze, Patch SHA256 4139183c643d20f64cdcf63f8e9448b2c0aabc5c791f9aeeeeebb334e6263cf2.
Tests: Owner 6 Suiten/87 Tests und überlappende Android4/54 PASS, Typecheck PASS, Lint0Fehler/9 belegte Baselinewarnungen. 07 unabhängig 4 Suiten/75 überlappende Tests und diff PASS; Typecheck/Lint nicht unabhängig wiederholt. MASTER hat tatsächlichen Worktree/Branch/HEAD, alle18Datei-/Patch-/5Loghashes und diff abgeglichen sowie den abgeschlossenen 07-Recheck gelesen. Keine native Geräteprüfung aus Mocktests ableiten.
Production betroffen: Für dieses Paket keine neue Veröffentlichung belegt; keine DB-/Native-/Trackingalgorithmusänderung im geprüften Scope. C1 und Kalibrierung bleiben separat gesperrt.
Offen: Android103/104 benötigen angepasste Importhunks; iOS103 fehlen ältere Maßstabgrundlagen, gesonderter Transfer nötig. Frische Runtime-/Ancestry-/Environment-/Bundleprüfungen durch 01; reale MapKit-/GoogleMaps-Projektion, Pitch/Rotation/SmartFollow, große Schrift, Screenreader und Geräteabnahme offen. Freeze-Beleg outputs/TRACKING-VISIBLE-MAP-SCALE-READY-2026-10-09.json; unabhängiger Recheck outputs/TRACKING-VISIBLE-MAP-SCALE-07-REVIEW-2026-10-09.json.
Nächster Schritt: 01 als einziger Integrator/Publisher prüft getrennte Runtimepakete und erforderliche Abnahmen unter bestehender OTA-Freigabe; keine Umgehung offener Gates oder Doppelimplementation.

## C1 / Kalibrierung: technische Vorbereitung abgeschlossen, Release-STOP — 2026-10-09, 11:15 Europe/Zurich

MASTER-EINTRAG

Datum: 2026-10-09; 01-Abschlussbelege 11:08 Europe/Zurich.
Thema: C1-Gegenstandskorrekturen und separate Schrittlängen-Kalibrierung.
Status: Saubere isolierte Release-Commits vorbereitet; keine neue Veröffentlichung. Pflichtabnahme mangels ausführbarem Testgerät fehlt.
Enthalten: C1 iOS10408cdb2fa / Android1048e03d875 / Android10369713175; iOS103 ohne geprüften Fulladapter. Kalibrierung iOS10443bac13f / Android1049b101bda / Android1030a6d953b / iOS1037a1bfbb4. Pakete getrennt, R2 bereits live. Keine main-Integration/Push/Build/Storeaktion.
Tests: C1 iOS104372Tests, Android je359; Kalibrierung iOS104/Android je275, iOS103259 laut gelesenen Preflightbelegen. Typecheck/Lint/Guard/Source-/Bundleprüfungen PASS laut 01. MASTER hat alle sieben tatsächlichen Branch-/HEAD-/Worktree-Zuordnungen, sauberen Working Tree und Basis-Ancestry geprüft. Counts überlappen, nicht summieren. Kein installierter nativer Geräte-/API-/Feldnachweis.
Production betroffen: Vorher bestätigte OTA-Matrix unverändert (ios104fe68e129 / ios103d454a06b / android104e24861d0 / android1037280444c). Git main unverändert1a574212f6b7c1827bc03048f2eb5b5d662cd7a1. R2-Backendinstallation durch05 separat gültig.
Offen: C1 nativeSQLite6→7/Neustart/Rollback/Connection-Konkurrenz, Flugmodus/abgelaufeneAuth/Retry/positiveOwner-API/Mehrgeräte-/MixedIntent-Abnahme. Kalibrierung nativeLocation-/Recorder-/BLE-Isolation, Preferenceerhalt, DynamicType/Screenreader und GPS-Feldvergleich auf vermessener gerader Strecke. iPhone nicht erreichbar, kein physischesAndroid; iOSSimulatorprofile fehlen. VorhandenesAndroidReleaseBinary44/runtime103 im Emulator kann unveröffentlichteKandidaten nicht ausführen; Emulator beendet, Daten unangetastet.
Nächster Schritt: Ausführbarer kompatibler Testzugang auf iOS/Android mit unveröffentlichtem Kandidaten und autorisierten isolierten Testdaten nötig; anschließend belegte Abnahme und frischer Production-Preflight. Keine Production-OTA als Umgehung fehlender Prüfung, kein neuer nativer Build ohne separate Freigabe. Keine wiederholten unveränderten Analysen bis Zugang/Ergebnis sich ändert. Farben-DB weiterhin separat nicht freigegeben.
Belege: outputs/RELEASE-FINAL-STATUS-2026-10-09.json; OBJECT-REVIEW-C1-RELEASE-PREFLIGHT-2026-10-09.json; STEP-CALIBRATION-RELEASE-PREFLIGHT-2026-10-09.json; OBJECT-REVIEW-C1-REQUIRED-ACCEPTANCE-2026-10-09.md. Kontingent am Abschluss geprüft:61%verbraucht/39%verbleibend,keinReset.


## Schrittlängen-Kalibrierung: separater Freeze — 2026-10-09, 10:43 Europe/Zurich

MASTER-EINTRAG

Datum: 2026-10-09.
Thema: Sichere Schrittlängen-Kalibrierung und Persistenz.
Status: Lokal umgesetzt; unabhängiger 07-UX-/Regressionsreview am 2026-10-09 um 10:46 Europe/Zurich abgeschlossen, keine neuen belegten P1-/P2-Befunde im geprüften Umfang. Nicht veröffentlicht.
Enthalten: Eigener Foreground-GPS-Handle; Standanker → ausdrücklicher Start → 50 selbstgezählte gerade Schritte → frischer Endanker → ausdrückliches Speichern nur akzeptabler Messung. Late-start/Unmount/Background/Lücken/Doppeltipp sowie Lade-/Schreibfehler abgesichert. Ungültige Werte löschen bestehende persönliche Einstellung nicht. Legen/run behalten den beim Mount geladenen Wert via freezeWhileMounted, keine Änderung ihrer Trackingalgorithmen. Header/A11y/Savezustände und fünf Sprachen aktualisiert, HelpSheet-Komponente unverändert.
Tests: 10 Suiten/123 PASS und überlappende Android5/46 PASS; Typecheck Exit0, Lint0Fehler/8 belegte bestehende Warnungen, diff/reverse PASS. Vorher-Speicherregression FAIL, nachher PASS. MASTER hat Branch/HEAD, Patch, alle21Dateihashes/Beleghashes und diff abgeglichen. Read-only Apply laut Freeze auf vier aktuellen Runtimebasen PASS; keine Integration/Nativekompatibilität allein daraus ableiten.
Production betroffen: Keine neue OTA/DB/native Änderung. Basis fe68e129, Branch fix/tracking-step-calibration, eigener Worktree anyvo-tracking-step-calibration. C1/R2-Freeze unverändert getrennt.
Offen: Unabhängiger Release-/Codereview durch 01, frische Runtime-/Source-/Bundle-/Release-Preflights und echte Geräte-/Feld-/visuelle QA. 07 hat fünf Suiten/46 überlappende Tests und diff ausgeführt, alle21Datei-/Patchhashes bestätigt; Typecheck/Lint im 07-Review nicht wiederholt. MASTER hat den direkten abgeschlossenen07-Turn abgeglichen; Beleg outputs/TRACKING-STEP-CALIBRATION-07-REVIEW-2026-10-09.json. GPS-Qualitätsschwellen sind konservative Heuristiken, keine garantierte Genauigkeit; Praxisvergleich auf vermessener gerader Strecke erforderlich.
Nächster Schritt: 07 read-only UX-Abgleich, 01 unabhängiger Release-Review und OTA nach Gates unter direkter beauftragter Freigabe. 02 einziger Implementierungs-Writer.
Freeze: outputs/TRACKING-STEP-CALIBRATION-READY-2026-10-09.json; Patch SHA256 00a918a073e54310449fb19d0e79604bd1306dcd7746985fac3f82ff66fd20cc. Expo SDK54 Location/Pedometer und Android Location#getAccuracy wurden laut Bericht gegen offizielle Dokumentation geprüft.


## C1 unabhängig geprüft — 2026-10-09, 10:12 Europe/Zurich

MASTER-EINTRAG

Datum: 2026-10-09; Review 10:12 Europe/Zurich, im MASTER nach R2-Deployment abgeglichen.
Thema: Offline-Regression C1 im vollständigen Korrekturclient.
Status: C1 für den unabhängig geprüften lokalen Code geschlossen; vollständiger Release weiterhin gated.
Enthalten: Dauerhafte Offline-Vormerkung ohne Servercache, Originalerhalt, bewusste ID-Zuordnung, Revision/UUID/atomare Archivierung und Retry geprüft. Full-Freeze9bf7306f/Delta4ecc0ae5; keine neue Produktänderung im Review.
Tests: 01 neun Suiten/94 Tests PASS, unabhängiger Typecheck Exit0 und gezielter Lint PASS; MASTER hat ausführlichen Reviewbeleg gelesen. Node-SQLite-/Mock-Prüfungen sind kein installierter nativer Gerätebeleg.
Production betroffen: Keine neue Client-Veröffentlichung belegt. Das spätere R2-Deployment hat inzwischen das DB-/Schema-/Rechte-Gate geschlossen; dessen positive Live-API-Schreibabnahme bleibt offen.
Offen: Runtime-spezifische volle Integration; Android/iOS103 benötigen Anpassung. Installiertes SQLite6→7-Upgrade/Neustart/Rollback/Transaktionskonkurrenz, Flugmodus mit abgelaufener Session, Wiederverbindung/Mehrgeräte-Konflikte und gemischte Vormerkungszustände ausdrücklich abnehmen. Geräte nicht erreichbar. Bekannte Winkel-Feldfehler separat offen.
Nächster Schritt: 01 prüft isolierte iOS104-Integration; fehlende Pflichtprüfungen führen zu STOP, kein Ersatz durch gleiche Runtime oder synthetische Tests. EAS laut frischer 01-Abfrage wieder erreichbar; keine zusätzliche Veröffentlichung daraus ableiten.
Beleg: outputs/OBJECT-REVIEW-C1-01-INDEPENDENT-REVIEW-2026-10-09.json. Frühere C1-review-offen- und R2-nichtdeployed-Angaben sind historisch.


## R2 Production-Deployment abgeschlossen — 2026-10-09, 10:24 Europe/Zurich

MASTER-EINTRAG

Datum: 2026-10-09; Preflight 10:16:42, Postflight 10:21–10:24 Europe/Zurich.
Thema: Backend für Gegenstandskorrekturen R2.
Status: Durch 05 unter direkt verifizierter Nutzerfreigabe installiert; Schema-/RLS-/ACL- und lesender Rollenpostflight bestanden.
Enthalten: Einmalige exakte R2-Transaktion SQL SHA256 ff6d0792c6bea6b5c8352b00baa2da54e83c530e1dc847d778862cc7d1c6b11d im bestätigten Production-Projekt. Drei neue Tabellen, 20 Spalten, 15 Constraints, sechs Funktionsquellen/Signaturen, drei Owner-SELECT-Policies und zwei Immutable-Trigger entsprechen laut Postflight dem Vertrag. Keine direkten Clientwrites, keine Anon-/Public-/Helperrechte; drei geschützte RPCs. Farbconstraint unverändert.
Tests: Frischer Preflight und separate lesende Live-Rollenprüfungen bestanden. Fehlende Auth, ungebundene synthetische A/B-Reads, privater Helper und Anonzugriffe abgewehrt. Alle vier Bestandszeilenzahlen und aggregierten Prüfsummen vor/nach identisch: 74 Hunde/119 Sessions/63 Runs/769 Marker; bestehende 15 Policies/ACL/RLS unverändert. MASTER hat ausführlichen Beleg und Bericht gelesen und Hashes abgeglichen. Frühere 92 lokale Tests nicht erneut ausgeführt.
Production betroffen: R2-Schema jetzt live; keine Kundendatenumschreibung, Farbaktion, Restore oder OTA durch 05. Neue Reviewtabellen beim Postflight leer.
Offen: Kein positiver Live-Owner-Schreibtest, kein authentifizierter HTTP/PostgREST-Smoke-Test und keine Geräteabnahme belegt. C1-Clientreview, Runtime-/SQLite-/Native-/Environment-/Ancestry-/Bundle-Gates bleiben bei 01/02. R2-Erfolg ist keine Client-/Gerätefreigabe.
Nächster Schritt: 01 hat den geprüften Backend-Abschluss erhalten und führt verbleibende Releaseprüfungen weiter. Migration nicht erneut ausführen. Hundefarben separat weiterhin nicht freigegeben.
Beleg: outputs/ANYVO-05-OBJECT-REVIEW-R2-DEPLOYED-2026-10-09.json; Evidence SHA256 349782e53b0c77deb96179b47bd343bce32b1ab6ffc82bd5da1d39c254f5f975. Frühere R2-nichtdeployed-Angaben unten historisch.


## R2-DB-Freigabe direkt verifiziert — 2026-10-09

MASTER-EINTRAG

Datum: 2026-10-09.
Thema: R2-Gegenstandskorrekturen, separate DB-Freigabe.
Status: Ausdrücklich vom Nutzer freigegeben; noch kein Deployment-Abschluss belegt.
Enthalten: MASTER hat die tatsächliche menschliche Antwort in 02 gelesen: userMessage 01a11fb9-8d85-7f50-a96c-8ae4417ce9cd beantwortet die konkrete R2-Frage call_3b7d4c8a1c0a4e94b9635d80dbe1083c mit „Ja, R2-Datenbankänderung freigeben“. Exakte R2-Transaktion SQL SHA256 ff6d0792c6bea6b5c8352b00baa2da54e83c530e1dc847d778862cc7d1c6b11d; frischer Preflight und anschließende Rechteprüfung. Vorangehende direkte Nachricht 01a11fb8-afa8-7802-a30e-dc6c4ec8755f „veröffentlichen“ betrifft den C1-korrigierten FullClient. Keine bloß weitergeleitete Freigabe angenommen.
Tests: Bestehende lokale SQL-/Client-Belege unverändert; dieser Eintrag bestätigt Freigabe, keine neue Test- oder Live-Ausführungsbehauptung.
Production betroffen: DB-Ausführung durch 05 jetzt autorisiert, Deployment noch nicht bestätigt. 05 bleibt einziger Backend-Writer; bereits gestartete Übergabe von 02 an 05/01 abgeglichen, kein Doppelauftrag.
Offen: Frischer DB-Preflight/Ausführung/unabhängiger Schema-/RLS-/ACL-Postflight, C1-Review, volle Runtime-Transfers und Geräte-QA. Hundefarben weiterhin separat nicht freigegeben. Kein Restore/native Build/Store/Push/mainMerge erlaubt.
Nächster Schritt: 05 führt innerhalb der exakten Freigabe aus und liefert Belege. 01 aktiviert FullClient erst nach sämtlichen Backend-/Client-/Runtime-/Geräte-Gates. Frühere R2-Freigabe-offen-Angaben unten sind historisch; Farb-Gate bleibt gültig.


## C1-Offline-Fix lokal eingefroren / unabhängiges Review offen — 2026-10-09, 10:06 Europe/Zurich

MASTER-EINTRAG

Datum: 2026-10-09.
Thema: Offline-Korrektur ohne gecachte Review-Basis.
Status: 02 meldet C1 lokal behoben, neuer Freeze an 01; Releaseblocker erst nach unabhängigem Review geschlossen.
Enthalten: Dauerhafte lokale Offline-Absicht in bestehender Outbox; spätere ausdrückliche Zuordnung zu bestätigten Servergegenständen und Basisrevision. Keine erfundenen IDs oder automatisches Mapping. Originaldaten unverändert, atomare Archivierung/Retry mit eigener UUID. R2/SQLite7/Snapshot/Export laut Hashvergleich unverändert.
Tests: Reproduzierter Vorher-Test 1 FAIL/7 PASS, danach Regression PASS; 18 Suiten/210 Clienttests, zusätzlich überlappende Android7/69 PASS. Typecheck Exit0, Lint 0 Fehler/4 bestehende Warnungen, diff/Forward-/Reverse-Apply PASS laut Freeze. MASTER hat Branch/HEAD, alle41Dateihashes, dreiPatchHashes, sämtlicheBeleghashes und diff abgeglichen. Frühere PDF-/R2-Tests nicht erneut ausgeführt.
Production betroffen: Keine Veröffentlichung/DB-/native Änderung. Bestehende Snapshot-OTAs unverändert.
Offen: Unabhängiges C1-Review, separate R2-Freigabe/Deployment/Postflight, Geräteupgrade-/Offline-QA und volle Runtime-Transfers. Lokale archivierte/entzogene Entwürfe bleiben bewahrt, ohne eigene Verlaufverwaltung in V1.
Nächster Schritt: 01 prüft den neuen Freeze; keine Aktivierung allein aus lokalem PASS.
Freeze: Full SHA256 9bf7306f7910224c33e7aec60d31d5738852437812bcf26fa5b669e987a59c04; Delta nach Snapshot 4ecc0ae5c7deace6476c35018d1f23e216c6761eac5b855235184b7ebcf8622e; enger C1-Fix gegen alten Fullfreeze 04ec03b0a54277707ec7ac9148e82d834f3ba8c472ae727bfef7d34ed00776e9. Alternative Patches nicht übereinander anwenden. Alte fc5c7163/4eb1fbd8 für Integration ersetzt, historische Artefakte erhalten.
Beleg: outputs/TRACKING-OBJECT-REVIEW-V1-C1-READY-2026-10-09.json.


## Vollständiger Korrekturclient: Offline-Regression blockiert Release — 2026-10-09, 09:43 Europe/Zurich

MASTER-EINTRAG

Datum: 2026-10-09.
Thema: Unabhängiges Review der vollständigen Gegenstandskorrekturen.
Status: Review abgeschlossen; neuer funktionaler Blocker C1. Bereits veröffentlichte Snapshot-OTAs enthalten diesen vollständigen Client nicht.
Enthalten: Vergleich gegen tatsächlichen iOS104-Livestand: Ohne je gecachte Review-Baseline könnte eine automatische Gegenstandserkennung offline nicht mehr korrigiert werden. FullClient entfernt den alten lokalen Pfad; Initialisierung benötigt Netz und neue Outbox benötigt bestätigte Baseline. Dies reduziert bisherige Offline-Funktionalität. Kein Geräte-Reproduktionsnachweis, belegter Codepfadvergleich.
Tests: 01 berichtet unabhängige neun Suiten/96 Tests PASS, Typecheck Exit0 und Lint 0 Fehler/0 Warnungen für zehn ausgewählte Produktdateien. Synthetische SQLite6→7-Prüfung und Originaldatenbewahrung geprüft; installierte Kundendatenbanken/Geräteupgrade nicht geprüft. Bestehende Tests decken den Cold-cache-Fall noch nicht ab. MASTER hat den vollständigen Reviewbeleg gelesen.
Production betroffen: Keine zusätzliche Veröffentlichung/Integration/DB-Aktion; aktuelle Snapshot-OTAs unverändert.
Offen: C1 beheben, separate R2-Freigabe/Deployment/Postflight, vollständige Runtime-Transfers und Geräteupgrade-/Rollback-/Offline-QA. iOS104-Delta ist anwendbar; Android und iOS103 benötigen angepasste Transfers. Keine beobachtete SQLite7-Quellkollision, reale Gerätestände bleiben ungeprüft.
Nächster Schritt: C1 eng an 02 als einzigen Writer zur nichtdestruktiven Behebung und Regressionstests weitergegeben. Keine ungefragte Einschränkung der Offline-Funktion akzeptieren; keine Originaldatenumschreibung als Reparatur. 01 prüft neuen Freeze vor Aktivierung.
Beleg: outputs/OBJECT-REVIEW-V1-01-INDEPENDENT-REVIEW-2026-10-09.json. Alter Fullfreeze fc5c7163/Delta4eb1fbd8 bleibt Release-blockiert.


## Android-Snapshot veröffentlicht: aktuelle OTA-Matrix — 2026-10-09, 09:30 Europe/Zurich

MASTER-EINTRAG

Datum: 2026-10-09; Android-Veröffentlichungen 09:16:53 und 09:21:18 Europe/Zurich, frische LIVE-Nachprüfung 09:23.
Thema: Original-Gegenstands-Snapshot auf Android 1.0.3 und 1.0.4.
Status: Beide Production-OTAs durch 01 veröffentlicht und nachgeprüft. Der Android-Transferblocker ist für diesen engen Snapshot-Scope geschlossen; keine vollständige fachliche iOS-/Android-Scoreparität behauptet.
Enthalten: Additive Originaldaten neuer abgeschlossener Suchläufe; bestehende Android-Scoreformel, fünf Zustände, GPS, Recovery und Heat-/Help-Fixes erhalten. Volle KorrekturUI/SQLite7/Outbox/RPC ausgeschlossen. Keine native oder DB-Änderung.
Tests: Je 17 Android-Suiten/140 Tests bestanden, mit externem Test-only-DatePicker-Mock; Typecheck Exit0, Lint 0 Fehler/4 bestehende Warnungen, diff/Production-Guard PASS laut 01. Unabhängiger 01-Review von Datenfluss und unveränderter Android-Scoreformel PASS. MASTER hat beide tatsächlichen Branch-/HEAD-/Worktree-Zuordnungen, Basis-Ancestry und LIVE-/Published-Bundle-/Manifest-CDN-Belege gelesen und abgeglichen; 564/562 Quellen, Release-Stamps und Assets PASS. Bundle SHA104 fe605d2b8d4134bfaedbe9ad927fb83e96894ba5310edcdec6bf9bd1002b090c; SHA103 7107cf62245a79219c56d058d120ccb67eeb89bb5de90a33ad5751ae312537be.
Production betroffen: Aktuelle bestätigte OTA-Matrix unten; Git main unverändert 1a574212f6b7c1827bc03048f2eb5b5d662cd7a1. Kein Push/Merge/native Build/Store/DB-Write.
Offen: Geräteempfang und Bedien-/Feldabnahme, iPhone weiterhin nicht erreichbar/kein Android-Gerät angeschlossen. Volle Korrekturfunktion und Farben warten auf separate ausdrückliche DB-Freigaben; bekannte Winkel-Feldfehler bleiben offen. iOS1.0.3 enthält die UI-/Medikamenten-/Sync-Fixes, keinen Snapshot.
Nächster Schritt: Bestätigten Android-Abschluss und konkrete Testwege an 10 geben. Bereits identische Pakete nicht wiederholen; DB-Gates bleiben STOP bis menschliche Freigabe.

| Plattform / Runtime | Source-Commit | Group | Update-ID |
|---|---|---|---|
| ios 1.0.3 | `d454a06b2b36121316f933ddd12ddada419a287a` | `ca90fbc0-b360-4dfd-a0a5-f8283180e26f` | `01a11f58-77b0-7698-a48c-605ea03cf4e2` |
| ios 1.0.4 | `fe68e1290161f12838bde6480d7868147b295995` | `f6ea26d2-9f04-4a58-976b-15826929383f` | `01a11f5b-ba0b-7341-a6f1-905e1c868a0d` |
| android 1.0.4 | `e24861d0d8d5a9923139f9208178f42a2fa870f0` | `1d64e5ed-925a-4988-8733-8c2155635acf` | `01a11f85-a0a4-701b-95a7-fd31db9b9894` |
| android 1.0.3 | `7280444cf48470494d85a5778a1bab1d13e5de0a` | `f5575fc8-042d-492a-bf2e-5f402e63db8d` | `01a11f89-ad7a-7990-a67d-359fb60a07d7` |

Beleg: outputs/RELEASE-FINAL-STATUS-2026-10-09.json sowie OPEN-JS-ANDROIDOBJECT{103,104}-{CANDIDATE,LIVE,PUBLISHED-BUNDLE-PROOF,MANIFEST-CDN-PROOF}-2026-10-08.json. Frühere Android-UI-only-Stände und Transferblocker unten sind historisch. Codex-Kontingent am Abschluss lesend geprüft: 49 % verbraucht/51 % verbleibend; kein Reset ausgelöst.


## Android-Gegenstands-Snapshot: Adapter eingefroren — 2026-10-09, 09:01 Europe/Zurich

MASTER-EINTRAG

Datum: 2026-10-09.
Thema: Android-Parität des Original-Gegenstands-Snapshots.
Status: 02 hat den engen Adapter für Android 1.0.3 und 1.0.4 lokal fertiggestellt und an 01 übergeben; noch nicht veröffentlicht. Der zuvor belegte Direkttransfer-Blocker hat jetzt einen geprüften Review-Kandidaten.
Enthalten: Zehn Dateien (vier Produktdateien/fünf Tests/Bericht) auf den tatsächlichen Basen 208bc19329236af23729f007f12c74a0e94688bd und b4ab8a5c08a185f844aa380e1297857776b14acd. Beide exakten Patches SHA256 5e4cf1212c591a5e3076bbbc5e72c8163c7a4c610e505ad7526afd410ee055dd. Original-Android-Scoreformel/Gegenstandszustände/GPS laut Owner unverändert; keine volle KorrekturUI/SQLite7/RPC/DB/native/Runtime-Änderung.
Tests: Je Runtime regulär 17 Suiten/140 PASS; Android-Preset 16/135 plus separate Heat-Suite 1/5 mit Test-only-DatePicker-Mock PASS, überlappende Zahlen nicht addieren. Typecheck Exit0, Lint 0 Fehler/4 bestehende Warnungen, Diff/Apply PASS laut Belegen. MASTER hat beide Basen, Patch-/20 Dateihashes und alle referenzierten Beleg-Hashes abgeglichen.
Production betroffen: Noch keine neue Android-Veröffentlichung; vorherige iOS-/Android-Stände bleiben gültig.
Offen: Unabhängiges Review und frischer komponierter Release-Preflight durch 01; Geräte-QA. DB-Gates für volle Korrekturen/Farben unverändert separat offen.
Nächster Schritt: 01 als einziger Publisher übernimmt nach bestandenen Gates unter bestehender OTA-Dauerfreigabe. Kein zweiter Writer.
Beleg: outputs/TRACKING-ANDROID-OBJECT-SNAPSHOT-READY-2026-10-09.json.


## Gegenstands-Snapshot iOS 1.0.4 veröffentlicht / Android-Parität offen — 2026-10-09, 08:45 Europe/Zurich

MASTER-EINTRAG

Datum: 2026-10-09; Veröffentlichung 08:31:07 Europe/Zurich, LIVE-Nachprüfung 08:33.
Thema: Originalzustand der Gegenstände neuer abgeschlossener Suchläufe bewahren.
Status: iOS 1.0.4 Production-OTA veröffentlicht; Android-Direkttransfer wegen abweichender JS-Strukturen blockiert.
Enthalten: DB-unabhängiger additiver Snapshot von Original-IDs, Zuständen, Material und Scorebasis neuer Suchläufe. Heat-/Help-Fixes bleiben enthalten. Keine vollständige Korrektur-UI, SQLite7, Outbox oder RPC; keine neue native/DB-Abhängigkeit. Release-Commit fe68e1290161f12838bde6480d7868147b295995; Group f6ea26d2-9f04-4a58-976b-15826929383f; Update 01a11f5b-ba0b-7341-a6f1-905e1c868a0d.
Tests: 01 unabhängiger Review und 10 Suiten/244 kombinierte Tests, Typecheck/diff PASS, Lint 0 Fehler/4 Warnungen. MASTER hat tatsächliche Worktree-/Branch-/HEAD-Zuordnung, Ancestry zur vorherigen UI-Basis, LIVE-/Published-Bundle-/Manifest-CDN-Belege abgeglichen. 571 Quellen stimmen laut Bundle-Beleg; Assetprüfung PASS. CDN-/Manifest-/Publish-Bundle SHA256 918c79cca7f2996d163a01aa790d037ad0af60367ab61be548642810f607bc88.
Production betroffen: iOS 1.0.4 jetzt auf fe68e129; ersetzt dort die UI-only-OTA 35b6c88b als deren Nachfolger. Android 1.0.4 bleibt 208bc193; Android 1.0.3 b4ab8a5c; iOS 1.0.3 d454a06b. Git main unverändert 1a574212f6b7c1827bc03048f2eb5b5d662cd7a1.
Offen: Geräteabnahme blockiert: gekoppeltes iPhone laut 01 nicht erreichbar, adb meldet kein Android-Gerät. Kein Empfang/Touch-/Feldtest belegt. Android-Snapshot benötigt engen Adapter und neue zusammengesetzte Tests. Volle Korrektur-Funktion und Hundefarben warten weiterhin auf getrennte ausdrückliche DB-Freigaben; bekannte Winkel-Feldfehler bleiben offen.
Nächster Schritt: Android-Snapshot-Adaption im bestehenden Scope an 02 als einzigen Tracking-Owner weitergegeben, 01 bleibt Reviewer/Publisher. Chat 10 erhält neue Update-ID und Testwege. Keine Neuinstallation, Löschung oder Datenrücksetzung.
Belege: outputs/RELEASE-FINAL-STATUS-2026-10-09.json und OPEN-JS-OBJECTIOS104-{CANDIDATE,LIVE,PUBLISHED-BUNDLE-PROOF,MANIFEST-CDN-PROOF}-2026-10-08.json.


## Heat-/HelpSheet-OTAs veröffentlicht — 2026-10-09, 08:28 Europe/Zurich

MASTER-EINTRAG

Datum: 2026-10-09; Veröffentlichungen 08:17–08:27 Europe/Zurich.
Thema: Läufigkeits-Verlauf schließen und Hilfefenster scrollen.
Status: Durch 01 auf iOS/Android, Runtime 1.0.3 und 1.0.4 veröffentlicht; Nachkontrollen bestanden.
Enthalten: Begrenzte Layout-/Schließen-/Scroll-Korrekturen. iOS 1.0.3 erhält einen isolierten Backport mit bisherigen Help-Props/Texten. Runtime-Basen und vorhandene Funktionen bleiben laut geprüftem Transfer erhalten. Keine neue native oder DB-Abhängigkeit.
Tests: Je 157 Tests für iOS/Android 1.0.4 und Android 1.0.3; 141 für iOS 1.0.3. Typecheck/diff bestanden, Lint 0 Fehler/3 Warnungen laut Kandidaten. MASTER hat alle vier tatsächlichen Worktree-/Branch-/HEAD-Zuordnungen, Basis-Ancestry, LIVE-/Published-Bundle-/Manifest-CDN-Belege und übereinstimmende Update-/Commit-/Bundle-Hashes gelesen und abgeglichen. 570/563/561/529 Produktquellen stimmen laut Bundle-Belegen; Assets PASS. iOS 1.0.3 ohne eingebetteten Release-Stamp, EAS-Metadaten separat abgeglichen.
Production betroffen: Vier Production-OTAs veröffentlicht; Git main weiterhin 1a574212f6b7c1827bc03048f2eb5b5d662cd7a1. Kein Push/Merge/Build/Store/DB-Write daraus ableiten.
Offen: Geräteempfang und Bedienabnahme (kleine Displays, große Schrift, Rotation, Scrollen, Schließen/Wiederöffnen, VoiceOver/TalkBack). Gegenstands-Snapshot wird separat von 01 veröffentlicht und ist durch diesen UI-Abschluss noch nicht als live belegt. Vollständige Korrekturfunktion und Farben warten auf separate DB-Gates.
Nächster Schritt: Chat 10 erhält konkrete Testwege; 01 verfolgt den getrennten Snapshot. Keine identischen UI-Pakete erneut veröffentlichen.

| Plattform / Runtime | Source-Commit | Group | Update-ID |
|---|---|---|---|
| ios 1.0.4 | `35b6c88be94b9107171200a30405e97abe259c1e` | `5c353c40-4cf4-42da-a017-7ce5f7f0dac5` | `01a11f4e-de74-7858-a5e0-14278fc5e143` |
| android 1.0.4 | `208bc19329236af23729f007f12c74a0e94688bd` | `d9b48bfd-0fac-475e-8dcc-6f2144263879` | `01a11f52-46b5-7589-b1c6-d136750d5e09` |
| android 1.0.3 | `b4ab8a5c08a185f844aa380e1297857776b14acd` | `7d00ac49-246a-4219-b95a-d0727bfcc60c` | `01a11f55-dd6f-707e-a35f-cf5024c0f55a` |
| ios 1.0.3 | `d454a06b2b36121316f933ddd12ddada419a287a` | `ca90fbc0-b360-4dfd-a0a5-f8283180e26f` | `01a11f58-77b0-7698-a48c-605ea03cf4e2` |

Belege: outputs/UI-OTA-STATUS-2026-10-09.json sowie OPEN-JS-UI{IOS104,ANDROID104,ANDROID103,IOS103}-{CANDIDATE,LIVE,PUBLISHED-BUNDLE-PROOF,MANIFEST-CDN-PROOF}-2026-10-08.json. Frühere Production-Stände unten sind historisch. Kontingent beim Abschluss lesend geprüft: Codex 46 % verbraucht, 54 % verbleibend; kein Reset ausgelöst.


## Gegenstandskorrekturen V1: Client-Freeze — 2026-10-09

MASTER-EINTRAG

Datum: 2026-10-09.
Thema: Vollständiger Client für Gegenstandskorrekturen.
Status: Lokal umgesetzt, eingefroren und an 01 zum unabhängigen Review übergeben; nicht integriert oder veröffentlicht.
Enthalten: Korrektur-UI, separate SQLite-7-Cache/Outbox, Revision/UUID und idempotenter Retry, Konto-/Run-Isolation, Konflikt- und Syncstatus sowie PDF/JSON-Änderungshistorie. Originalaufnahme bleibt getrennt. 36 Dateien auf Basis 87d5e2b3b3ed931b655464eec971b95225dcf0ff, Branch feat/tracking-object-review-v1. Full-Patch SHA256 fc5c716384282c78605fa6831e707ee6326d5fcc2dfc308b887449752a70067c; Delta SHA256 4eb1fbd867086054b599910e4058a7be1d5b197e192b72199336ce8678d378ab setzt Snapshot 59805a84 voraus.
Tests: 16 Suiten/186 Clienttests laut gelesenem Log bestanden. Zusätzlich laut 02 fünf PDF-Tests und vier Seiten visuell geprüft; vollständiger Typecheck PASS, Lint 0 Fehler/4 bestehende Warnungen. MASTER hat Branch/HEAD, beide Patch-Hashes, alle 36 Dateihashes und diff --check geprüft. Snapshot-Tests überlappen; Zahlen nicht addieren.
Production betroffen: Keine Veröffentlichung oder DB-Schreibaktion; lokal/uncommitted.
Offen: Unabhängiges Review, SQLite-Migrationsnummer-/Plattform-/Runtime-Kompatibilität, ausdrückliche R2-DB-Freigabe und Backend-Postflight, Integration und Geräte-QA. Keine volle UI ohne kompatibles R2-Backend ausliefern. Winkel-Feldfehler bleiben offen.
Nächster Schritt: 01 prüft das übergebene Paket; DB-unabhängigen Snapshot separat im OTA-freigegebenen Scope verfolgen. Vollständige Korrekturen erst nach R2-Gates aktivieren. Keine neue Implementierung oder zweiter Writer nötig.
Beleg: outputs/TRACKING-OBJECT-REVIEW-V1-2026-10-09.json und outputs/object-review-qa/full-client-tests.log. Kein Verwaltungsdialog für verwaiste/entzogene lokale Entwürfe in V1; keine automatische Datenlöschung.


## R2-Gegenstandskorrekturen: Deployment-Preflight — 2026-10-09, 08:07 Europe/Zurich

MASTER-EINTRAG

Datum: 2026-10-09; lesender Production-Preflight um 08:07:56 Europe/Zurich.
Thema: Additiver R2-Datenbankvertrag für nachträgliche Gegenstandskorrekturen.
Status: Für separate konkrete DB-Freigabe vorbereitet; nicht live installiert.
Enthalten: Drei neue Review-Tabellen, sechs Funktionen (drei RPCs), drei Owner-SELECT-Policies und zwei Immutable-Update-Trigger. Keine Installations-DML, kein Backfill, keine Änderung bestehender Tabellen-Policies oder ACLs. R2-SQL SHA256 ff6d0792c6bea6b5c8352b00baa2da54e83c530e1dc847d778862cc7d1c6b11d.
Tests: Bereits belegte 92 lokale synthetische PostgreSQL-17.10-Tests. Neuer lesender Production-17.6-Preflight: Schema, Rollen, RLS, ACL, Namenskollisionen, Locks und DDL-Hooks geprüft; keine beobachtete Abweichung. MASTER hat Beleg- und SQL-Hashes unabhängig abgeglichen. Kein Geräte- oder vollständiger Production-Restore-Test.
Production betroffen: Bisher nur read-only geprüft; keine Live-Schreibaktion. Backup vom 2026-10-09 um 02:20:27 Europe/Zurich verfügbar; PITR aus, Restore nicht getestet.
Offen: Separate R2-DB-Freigabefrage gestellt und unbeantwortet; abschließender Client-Freeze, Integration und Geräte-QA bleiben separat offen. Hundefarben-Freigabe ist davon unabhängig.
Nächster Schritt: Nach ausdrücklicher R2-Freigabe führt 05 einen frischen Abgleich, die exakte Transaktion und unabhängige Schema-/Rechte-Nachprüfung aus; erst danach Client-Aktivierung durch 01 mit vollständigem OTA-Preflight.
Beleg: outputs/ANYVO-05-OBJECT-REVIEW-V1-R2-DEPLOYMENT-PREFLIGHT-2026-10-09.json; ausführlicher Beleg SHA256 717a71a9f5ac6c93a6aca09f6248d648592f5667522515ed6b10dc3aeafe65e4. Frühere V1-SQL bleibt zurückgezogen.


Stand: **2026-10-08 (Europe/Zurich)**. Kanonische Übersicht für Code-, Native- und Release-Parität; Produkt-/Arbeitsgesamtstatus bleibt [ANYVO_MASTER_STATUS.md](ANYVO_MASTER_STATUS.md).


## OTA-Dauerfreigabe / Nachverfolgung eingerichtet — 2026-10-09

DirekterNutzerauftrag imMASTER erteilt fortlaufendProduction-OTAs für beauftragte
ANYVO-Änderungen, einschließlichvorbereiteterHeat/HelpSheet-Fixes; nötigeisolierte
saubereRelease-Commits gemäßfrühererAnweisung. AllePreflights/Reviews/Quellen-/
Bundle-/Live-CDN-Prüfungen bleiben Pflicht,01einzigerPublisher. Weiterleitungan01
erfolgreich, neueDialog-OTAs nichtalsbereitsveröffentlichtbehauptet. DB-/Store-/
NativeBuild-/Push-/mainMerge-Aktionen nichtmitfreigegeben. Aktiver15MinutenHeartbeat
`anyvo-laufende-ota-koordination` imkanonischenMASTER perToolangelegt undpersistiert
verifiziert. Erster planmäßiger Heartbeat am 2026-10-09 um 08:00 Europe/Zurich
mit lesender main-/Fachchat-Statusabholung bestätigt; kein neuer OTA-Abschluss
oder Geräteempfang daraus abgeleitet. VorhandeneACTIVE-Bridge-
Automation unangetastet. Regeln inAGENTS/README; keinezweiteStatusübersicht,
keineProduktänderung/CommitimMASTER. KonkreteFarbDB-Freigabefrage separatnochunbeantwortet.

## Neuester belegter OTA-Abschluss / Fortsetzung — 2026-10-09, 07:33 Europe/Zurich

MASTER hat den tatsächlichen Fortsetzungsauftrag in02 und den01-Abschlussbericht gelesen. Die frühere30-Minuten-Abschlussphase begrenzt diesen neuen Auftrag nicht. Keine erneute Veröffentlichung bereits ausgelieferter Pakete. Git main weiterhin `1a574212f6b7c1827bc03048f2eb5b5d662cd7a1`; runtimebezogene Release-Commits sind davon getrennt.

- ios Runtime1.0.4: Source `87d5e2b3b3ed931b655464eec971b95225dcf0ff`, Group `3d6e3b57-4e14-4c70-8b7b-9851bfb0e643`, Update `01a11e47-90c4-7e83-bff1-ae6a2901520e`. LIVE/PUBLISHED-BUNDLE/Manifest-CDN laut01 PASS, LIVE/CDN-Belege vomMASTER selbst gelesen. Publish `2026-10-09T01:29:29.028Z` UTC.
- android Runtime1.0.4: Source `54f7203e579b366ecad1b3063d60c5dc563e0662`, Group `5af04065-9b6d-4bee-96ae-115d0bc8b4c6`, Update `01a11e4c-1f9b-77a6-96e3-513afac4da56`. LIVE/PUBLISHED-BUNDLE/Manifest-CDN laut01 PASS, LIVE/CDN-Belege vomMASTER selbst gelesen. Publish `2026-10-09T01:34:27.739Z` UTC.
- iOS enthält FN-Korrekturen und die abgesicherte persönliche Motion-Diagnose auf der Continuity-/Accuracy-/Exportbasis; Android FN-Anzeigen, Null-Gegenstandszähler und Vorschaukorrekturen.570iOS-/563Android-Quellen, Release-Stempel/Assets und tatsächlicheCDN-Hashes nachgeprüft. Zusätzliche QA-Sitzungsisolation aus87d5 ist damit jetzt ausgeliefert; neue Geräte-Anwendung weiterhin OPEN. Winkelerkennungsfehler im Feld weiterhin ungelöst.
- iOS1.0.3 bleibt zuletzt bestätigt5465f1fd/0218a4a4; Android1.0.3 zuletzt085a55c7/d7c6f457. Der Medikamentenfix bleibt auf allen vier dokumentierten Runtimes enthalten. Kein neuer Store-/nativerBuild-/DB-Schritt aus diesem OTA-Abschluss ableiten; Playstatus im älteren Abschluss unten ist zeitgebundener letzter Prüfstand.
- Gegenstandskorrekturen:02 führt Client/Queue fort;05 hat den lokalen additiven Basis-/State-/append-onlyAudit-Vertrag samt initialize/get/apply-RPC aufR2 korrigiert.92PostgreSQL17.10-Prüfungen PASS (synthetische Daten, kein kompletter Productionklon; Production17.6). Originalerhalt, RLS/Owner/Trainer/Anon, Race/Idempotenz/Revision/Entzug/Altformate/Gaps geprüft. Vollständiger Live-Deploymentpreflight, Client-/Geräteintegration und konkrete DB-Freigabe offen; nicht deployed.07 bleibt Farbclient-Owner, kein zweiter Writer.
- GegenstandsvertragR2 ersetzt den altenSQL-Kandidaten `5bb943d04aa5ff7fe006081b2b2f3c264844fc304816aeeec4c65cc684b3b737`. ReproduzierterLegacy-Init-Fehler bei getrenntemMarkerDelete/Insert-Sync: alterTest FAIL, nachFix92lokaleTests PASS einschließlich10neuerRegressionen. R2 verlangt bekannten nichtnegativen articles_total undexakteMarkerzahl einschließlichDübel mitParent-/Markerlocks; unvollständigerStand liefert REVIEW_REFERENCE_INCOMPLETE ohneTeilbasis. NachvollständigemSync neuinitialisierbar. NeuerSQLSHA `ff6d0792c6bea6b5c8352b00baa2da54e83c530e1dc847d778862cc7d1c6b11d`; Beleg `outputs/ANYVO-05-OBJECT-REVIEW-V1-R2-2026-10-09.json`. MASTER hat9Dateihashes/SQL-/ZIPHashes und92Testresultat nachgeprüft. Weiterhinnurlokal/nichtdeployed; Zählkonsistenz garantiert keinehistorischenMarkeridentitäten.
- DB-unabhängigeSnapshot-Vorbereitung von02 separat an01 zurReview/OTA-Preflightübergeben: PatchSHA `59805a8403c4bf32c52e3bafa3cea4036ea87f439620111c341993543b6f1fce`, Basis87d5,7Suiten87Tests/fullTypecheck/Lint0Fehler4bestehendeWarnungen/diff/reverse PASS lautgelesenemManifest, tatsächlicherPatchhash vonMASTER geprüft. NurOriginalIDs/Zustände/Material/Scorebasis neuerRuns, keinevollständigeKorrekturUI/SQLite/RPC-/LiveDB-Abhängigkeit. Nochunveröffentlicht; `outputs/TRACKING-OBJECT-SNAPSHOT-READY-2026-10-09.json`. FarbSQLea96/Preflight07:48 bleibenunverändert/getrennt, DB-Freigabe weiterhin offen.
- Farb-Backupgate erledigt: physisches Backup09.10.2026,02:20:27Zürich und verfügbare Restoreaktion lesend bestätigt; keinRestoretest, PITRnichtaktiv, Storageobjekte nicht enthalten. Vollrestore würde spätere Writes verlieren und ist kein automatischerRollback. Konkreter Farb-Preflight09.10.07:48:16Zürich PASS: validierter alterCHECK/nullableText/noDefault/RLS/ACL unverändert,74gültigeHundezeilen/0HEX,0fremdeLocks amMesszeitpunkt. Nur die exakteCHECK-/Kommentar-Transaktion SHA `ea96e899d4d743ad912b3121b48621242a554044805cdec234794adaf80c0928` ist bereit zur separaten ausdrücklichen Live-DB-Freigabe;92lokaleSQL-Prüfungen PASS. Keine Zeilenumschreibung/Grants/RLS-Änderung, keinDBWrite ausgeführt.3sLocktimeout/15sStatementtimeout/SchemaGuard bleiben; unmittelbar vorAusführung frisch prüfen.
- MASTER hat beidePakete samt18Dateihashes/ZIP-/SQL-SHAs,82Testresultat sowie finalenFarb-Preflightbeleg selbst gelesen/nachgeprüft. Belege: `outputs/ANYVO-05-DOG-CUSTOM-COLOR-READY-2026-10-09.json`, `outputs/ANYVO-05-DOG-CUSTOM-COLOR-DEPLOYMENT-PREFLIGHT-2026-10-09.json`, `outputs/ANYVO-05-OBJECT-REVIEW-V1-R2-2026-10-09.json`. Nur Farb-DB-Freigabe jetzt konkret reviewbar; kein ObjectRPC-Deployment aus dieser Freigabe ableiten.
- Google-Login-Vorfall durch direkte spätere Nutzermeldung imWorkflow erledigt: Anmeldung funktioniert, Ursache laut Nutzer eigenes Netzwerk; ursprünglicher spezieller Authfix-/OTA-Auftrag zurückgenommen, Entwarnung an01/05. Keine daraus abgeleitete Produkt-/Supabase-Konfig-/Accountänderung.
- Belege: `outputs/OTA-RESUME-STATUS-2026-10-09.json`, `outputs/OPEN-JS-{FNQA104,FNANDROID104}-{LIVE,MANIFEST-CDN-PROOF}-2026-10-08.json`. Frühere Frist-/Unveröffentlicht-Angaben unten sind historische Stände und werden durch diesen belegten Abschluss ersetzt. Agent-/Statusdokumente lokal/uncommitted; kein main-Commit/Push/Merge durchMASTER.

## Historischer Fristabschluss — 2026-10-09, 00:22 Europe/Zurich

Git main: `1a574212f6b7c1827bc03048f2eb5b5d662cd7a1`, unverändert; kein Push/Merge. EAS production bleibt getrennt. MASTER hat die folgenden LIVE-, Kandidaten- und tatsächlichen Manifest/CDN-Belege gelesen; alle aktiven Pakete enthalten den Medikamenten-Datumsfix. Geräte-Anwendung der neuen Updates weiterhin OPEN.

| Plattform / Runtime | Source-Commit | Update Group | Update-ID |
|---|---|---|---|
| ios 1.0.3 | `5465f1fda0367d1977942f48a25d70d958295b1c` | `0218a4a4-5195-45ef-92a4-6ccd2fe2dc03` | `01a11d72-615c-7abd-ac98-4335b495fac5` |
| android 1.0.3 | `085a55c7ec74cb05bb17d2ab963befc9bba92115` | `d7c6f457-695b-4531-9952-1a06cb3e4b47` | `01a11d99-16f9-7f08-b894-4b8a78850aeb` |
| ios 1.0.4 | `839371d3f325f5a4923353029db5796b5d40bbc8` | `0de0c0a9-6430-439f-b916-0991b493e6a5` | `01a11d8b-801f-7511-882d-5f3fe2510338` |
| android 1.0.4 | `472c4eca45e4988fab8f0c949a9ae4feb636c30e` | `3060767c-baa4-4bf1-83e9-a8a92e9f39df` | `01a11d6b-7b61-7745-9a46-6f176d8018ef` |

- Medikamentenfix für iOS1.0.3/Android1.0.3 und beide1.0.4-Runtimes veröffentlicht. iOS1.0.3:166 Tests, vollständiger Typecheck, Lint0Fehler/3bestehendeWarnungen, diff PASS. Keine Datenmigration/automatische historische Datenkorrektur; bestehende Edit-Save/Cancel-Datumerhaltfälle geprüft. Kein erneutes Publish desselben1.0.3-Fixes.
- iOS1.0.4: Continuity/Accuracy-Vertrag/Exportadapter auf Medikament-/Sync-/Exportbasis veröffentlicht09.10.00:04:03.999Zürich. Betroffene12Suiten164Tests, unabhängige02Review5Suiten72Tests, vollständiger Typecheck/Lint ohne Fehler (Warnungen dokumentiert),569 publizierte Quellen/Releasekennung/Assets und9.525.384Bytes-CDN PASS. Zahlen überlappen; nicht aufsummieren.
- Android1.0.3: FN F1–F3-Anzeige-/Vorschaukorrekturen veröffentlicht09.10.00:18:54.585Zürich auf Medikament-/Sync-/Recorder-P0-/Exportbasis.7Suiten122Tests, Typprüfung/Lint/diff und561 tatsächliche Bundlequellen/Releasekennung/Assets sowie9.482.672Bytes-CDN PASS. FN1/FN2-Winkel-Feldabnahme bleibt FAIL; diese Korrekturen sind kein bestandener Algorithmus-Feldtest.
- Android native1.0.4(45), Runtime1.0.4: EAS `3406f59a-273d-4bbf-a2ab-bbf200dd0f93` FINISHED. Tatsächliches AAB/Manifest/Signatur/Runtime/TaskManager-/Diagnostik-Dex geprüft; eingefrorener Input unverändert. iOS native1.0.4(49) unverändert, kein neuer iOS-Build. Play frisch read-only bestätigt1.0.3(44), vollständiger Rollout;45 nicht hochgeladen. Play-Uploadzertifikat entspricht tatsächlichem AAB45; Signatur-/VersionCode-Preflight PASS, neue Release-Consolevalidierung/Geräte-Kauf-Restore-QA OPEN. `outputs/PLAY-READONLY-PREFLIGHT-2026-10-09.json`.
- Schon freigegeben, sauber committed und vollständig vorgebündelt, aber NICHT veröffentlicht wegen gemessener Laufzeit über die Nutzerfrist: iOS1.0.4 FN/persönlicheMotionQA `87d5e2b3b3ed931b655464eec971b95225dcf0ff`; Android1.0.4 FN `54f7203e579b366ecad1b3063d60c5dc563e0662`. Neues iOS-QA-Paket unabhängig02 geprüft:29/29committedBlobs entsprechen Review, Authority/Session/Pause/JSON-Umfang behoben, Tests und finalerBundle-Preflight PASS. Android-QA-Transfer wegen fehlender äquivalenter Inline-Module weiterhin offen. Keine weitere Veröffentlichung läuft beim bestätigten Abschluss.
- Neue Heat-Historie-/HelpSheet-Bedienfixes zusammen vorbereitet:3Suiten157Tests, vollständiger Typecheck/diff PASS; keine nativen/DB-Deltas, nicht committed/veröffentlicht. Konkrete neue Commit-/OTA-Freigabefrage im MASTER unbeantwortet. Visuelle Nachprüfung/Touch-/Geräte-QA offen. `outputs/UI-HEAT-HELP-REVIEW-CANDIDATE-2026-10-09.json`.
- Freie HEX-Hundefarben: Client89Tests/fullTypecheck PASS; konkrete SQL92lokalePostgreSQL-Prüfungen PASS,74Live-Hundezeilen read-only gültig. Sicherung/Wiederherstellbarkeit und konkrete Live-DB-Freigabe fehlen; kein DB-Write. Gegenstands-Snapshot-Vorbereitung83Tests/fullTypecheck PASS, uncommitted; vollständige Korrektur-UI/Audit/Offlinequeue fehlen, bestehender Ganzparent-Upsert unsicher für nachträgliche Edits. Keine dieser Vorbereitungen als fertige Kundenfunktion ausliefern.
- Auto-review hat die chatübergreifend gelesene öffentliche Play-Freigabe abgelehnt; kein Umgehen. Direkte konkrete Freigabefrage für vorhandenenBuild45 im MASTER unbeantwortet, STOP vor Upload/Rollout. Googles Review/öffentliche Verfügbarkeit sind keine30-Minuten-Garantie.
- Datenerhalt dauerhaft in kanonischen AGENTS/README verankert. Keine Datenlöschung/Resets/Neuinstallation als Standardlösung; bei ungeklärtem Datenverlustrisiko STOP. Persönliche Diagnose-Gates und Altformate erhalten, reale Geräte-/Feldabnahmen offen. Statusdokumente lokal/uncommitted, kein Produktcode im MASTER geändert.
- Nächster Schritt: bereits freigegebene zwei Rest-OTAs in einem weiteren vollständigen Releasefenster ausliefern und Geräte-QA durchführen; neue UI-/Play-Freigaben beantworten; DB-Sicherung konkret verifizieren und erst danach die genau geprüfte DB-Aktion separat freigeben. Kein main-Merge/Push/zusätzlicher Build durch diesen Abschluss.

Belege im MASTER-Projekt: `outputs/OPEN-JS-{IOS103,FNANDROID103,CONTINUITY104,ANDROID104}-{LIVE,CANDIDATE,MANIFEST-CDN-PROOF}-2026-10-08.json` sowie `OPEN-JS-FNQA104-PREPUBLISH-BUNDLE-PROOF-2026-10-08.json`, `OPEN-JS-FNANDROID104-PREPUBLISH-BUNDLE-PROOF-2026-10-08.json`, `TRACKING-02-FNQA-FINAL-REVIEW-2026-10-09.json`. Ältere Stände unten bleiben historische Belege.

## Historischer Auslieferungsstand — 2026-10-08, Export/Shelly/ACTIVE-OTA

- Git main: `1a574212f6b7c1827bc03048f2eb5b5d662cd7a1`; Feature-Commits und runtimebezogene Release-Snapshots bleiben separat, kein main-Merge/Push in diesem Auftrag.
- iOS Runtime1.0.4, production/production/production: neuestes konkretesTracking-UX/Diagnosepaket veröffentlicht08.10.2026,20:09:20.958 Europe/Zurich. Group `89c0f8d2-8867-4e82-8f75-1bb85d8d832e`, Update `01a11cb4-9c3e-7b21-aa6e-288745209c95`, Source `28355badd869b1bf4f022c2c1c13a0c0b2636eca`. Hundefarben/ehrlicheGPS-Vorschau/sicherevorhandeneWiederaufnahme sowie persönlichgeschützteDiagnose(03einmal) neu; Health/ExportC/Tempo/Shelly-Hilfe/ACTIVE/GPS/Maßstab erhalten.70Suiten875uniqueTests/finalerTypecheck/Lint/Dryrun/WrapperExit0/Postcheck/frischesupdate:viewPASS. Tatsächlichpublizierte84Produktquellen/Commitstamp/Schrift/Logo entsprechenfinalemPreexport; unabhängiger nativer Manifest/CDN-Abruf9.492.944Bytes/AssetsPASS. MASTER hat [Gesamtbeleg](/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/outputs/TRACKING-FINAL-OTA-RELEASE-2026-10-08.json) und [iOS-CDN-Beleg](/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/outputs/TRACKING-FINAL-IOS-MANIFEST-CDN-VERIFICATION-2026-10-08.json) gelesen. iOS1.0.3nichtmitveröffentlicht, Gerät/Apply/QAOPEN. Journal10-NeuiOS-Empfang samtkonkretenMenü-/QAwegen durchMASTER gelesen: abgeschlossenerTurn `01a11cb9-802a-7b72-ae19-49a8f7524eee`; GeräteQAbleibtoffen.
- Android Runtime1.0.3, production/production/production: neuestesTracking-UX/persönlicheDiagnosepaket veröffentlicht08.10.2026,20:18:27.426 Europe/Zurich. Group `cb43ecf1-e6a0-48bf-809b-279747e3b045`, Update `01a11cbc-f2e2-7682-bdbf-fab77020b1f5`, Source `3f44b1d2793c7241ac2305fc6e05418ab1c07069`.69Suiten813uniqueTests/finalTypecheck/Lint/diff/WrapperGuard/Postflight undfrischeEAS20:27:04PASS. Tatsächlichpublizierte83Produktquellen/Stempel und9.472.752BytesHermesbytegleichPreflight; unabhängigerNativeManifest/CDNinkl.Font/LogoPASS. MASTER hat [Gesamtbeleg](/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/outputs/TRACKING-FINAL-OTA-RELEASE-2026-10-08.json) und [Android-CDN-Beleg](/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/outputs/TRACKING-FINAL-ANDROID-MANIFEST-CDN-VERIFICATION-2026-10-08.json) gelesen. iOSunverändert89c0f8d2/28355bad. NativeCallback/Inlinepipelineerhalten, BackgroundCountersunavailable; nativerTaskManagerFix weiterhinseparaterBinarybedarf. KeinneuerBuild/StoreausOTA, GeräteQAOPEN.
- Health-Ownercommit `ca36d27567ad992567772fdba3035c9e25b6c402`; unveränderte20Code/Testblobs mit235Tests belegt. iOS-Kandidat Typecheck/Lint/Export/Source-Map-Prüfung/Production-Guard PASS durch01; abgebrochene redundante Überlastungs-Prüfläufe ausdrücklich keinPASS. Geräte-/Server-/Sprach-QA OPEN. Nutzerpfad Hund → Gesundheitsakte.
- NeuesteiOS-Featurequellen: Tracking-UX `0c5a1ed37bba347257ea71729cf83780c0c6043a` undpersönlicheDiagnose `5608c0191453ea3b3aacd28906c2672819ce4de3` (03einmal), finaleFixturecommits ohneProduktänderung. FrühereExportC/Shelly/ACTIVE/Health-Inhalte auf9ae21dba-Baseline erhalten. PersönlicherDB-Einzelgrant/Schema separatdurch05livegeprüft, keinDB-EingriffdurchPublisher. NeueContinuity-/Gegenstandskorrektur-WIP nichtimveröffentlichtenPaket.
- PersönlicheDiagnose iOS/Androidjetztclientseitigveröffentlicht(28355bad/3f44b1d); iOS5608c01enthält03einmal, Androidseparatekompatible05-FassungmitursprünglicherCallbackpipeline.05-defaultdeny/Own-Row-RLS/Schutztrigger/Härtung/Unique-Einzelgrantlivegeprüft, Menü/Route/QA/ExporteüberpersönlicheAuthority. KeineanderenTester/Abo/Trainerrechteverändert. BackgroundLease-/Offline-/Entzug-/Logout-/Export-/GeräteQAoffen; keineerfundeneAndroidBackgroundTimeline.

- Ergänzende unabhängige Health-Nachprüfung durch MASTER am 08.10.2026, 18:11 Zürich: Native Expo-Protokollantwort für iOS Runtime1.0.4 lieferte die damalige Health-Update-ID `01a11c32-5dd2-7227-bb39-ebe53cbdab50`. Tatsächlich heruntergeladenes Hermes-Bundle (8.196.576 Bytes) stimmt per SHA-256 mit Manifest und Publish-Bundle überein. Sanitized Beleg: `outputs/HEALTH-IOS-MANIFEST-CDN-VERIFICATION-2026-10-08.json`. Keine Geräteinstallation daraus ableiten. Journal10 hat den Health-Eintrag samt Testwegen erhalten.
- Öffentlicher Schweizer Apple-Storestand frisch per Apple Lookup gelesen: ANYVO `com.anyvo.app`, id6776362904, Version **1.0.3**, veröffentlicht laut Lookup 2026-09-28T22:33:25Z. Dies belegt weder die installierte Owner-Version noch App Store Connect. Owner-Testgerät jetzt durch beide direkt gelesenen FN1/FN2-QA-Dateien bestätigt: iOS1.0.4, nativeBuild49, Runtime1.0.4 und Update01a11cb4-9c3e-7b21-aa6e-288745209c95 in Lay/Search-Identitäten. Diese OTA war beim Test geladen; Funktions-/Feldabnahme bleibt offen. Öffentlicher Storestand und weitere Geräte weiterhin getrennt; Runtime1.0.4-OTA erreicht keinen Runtime1.0.3-Client. [Öffentlicher Store](https://apps.apple.com/ch/app/anyvo/id6776362904).

- Separater Tracking-UX-Abschluss `0c5a1ed37bba347257ea71729cf83780c0c6043a`: echte GPS-Vorschau/offline, sichere vorhandene Wiederaufnahme im Hundeprofil und Hundefarben. MASTER hat Commit/sauberenWorktree/Whitespace/Bericht gelesen; Owner-Typecheck und Regressionen PASS. Bestehendes Production-Farbfeld samt Constraint read-only durch05 bestätigt. In neuesten iOS1.0.4-/Android1.0.3-Paketen veröffentlicht; GeräteQAoffen. Grenzen und Freigabezuordnung in [ACTIVE_WORK.md](ACTIVE_WORK.md).

- ACTIVE-Einzelgrant samt separater iOS1.0.3-Übergangsprojektion **gespeichert und unabhängig geprüft durch06** nach direkter unmittelbarer Bestätigung: Grantbeginn08.10.2026,18:54:28; Postflight18:59:05 Europe/Zurich, genau1permanent/unrevoked ACTIVE, Server/Legacy ACTIVE true, TRAINER/Tester false, Store-Daten unverändert. Authentifizierte RLS-/Hunde-/Training-/Fährten-/Claim-Prüfungen PASS. MASTER hat Abschlussmeldung gelesen. Geräte-QA und spätere sichere Bridge-Bereinigung OPEN; permanenter Grundgrant bleibt erhalten. Safari anMASTER zurückgegeben. Persönliche Diagnose-Client-OTA und Geräte-QA bleiben unabhängig ausstehend.

- Begrenzte ACTIVE-Übergangsnachprüfung in06 eingerichtet und durchMASTER lesend verifiziert: aktive tägliche10:00-Heartbeat-Automation `active-bergang-ios-1-0-3`. Prüft öffentlichen Schweizer Apple-Store plus `active_lifetime`-Kompatibilität; bei unverändertem Stand still, bei bestätigter Verfügbarkeit einmal melden und pausieren. Kein Cleanup als durchgeführt behauptet, permanenter ACTIVE-Grundgrant bleibt erhalten. Kein erfolgreicher automatischer Lauf bislang belegt; keine allgemeine MASTER-Hintergrundverfolgung daraus ableiten.


- KonkretefertigeOTA-Aufträge abgeschlossen: iOS1.0.4 `28355bad` undAndroid1.0.3 `3f44b1d` veröffentlicht/nachgeprüft; beideRelease-Worktrees vomMASTERcleangelesen. Journal10-Abschluss mitbeidenVersionen/IDs/konkretenSolltests gelesen, Turn `01a11cc6-2cb6-7763-9d72-bba26f93adbc`. Geräte-/Feld-/ApplyQAoffen. NeueContinuity/Gegenstandskorrektur-WIPkeinfertigesfreigegebenesOTA-Paket.
- iOS-Buildstand frisch durchMASTER am08.10.2026,19:23:41 Europe/Zurich per EAS build:list gelesen: neuester FINISHED production1.0.4(49), ID `994f04ba-0e1e-4cba-9888-79059a225213`, Source `3f7c2e746fd064d1b103aa67f926c514a52eed44`, erstellt06.10.2026,08:37:18 und fertig08:44:29 Zürich. Keine neueren/laufenden iOS-Builds in aktuellen zehn EAS-Datensätzen; heute kein neuer iOS-Build. [Sanitized Buildbeleg](/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/outputs/IOS-BUILD-STATUS-2026-10-08.json). EAS-Buildbeleg bestätigt weder Store-Freigabe noch Installation.

- Android-Diagnose-Transferblocker durchgezielte05-Fassung behoben: Owner `0bedec5d72e7232e0dac5b2333f49fb0dd52c6ec` plusreinerModetest/Report-Folgecommit `05873f85c4c74c8f2a25eb1a3a60833f59261391`, eigenerWorktreeclean durchMASTER gelesen. BestehendeInlineLay-/BackgroundPipeline undnativeCallbackbytegleich erhalten, fehlendeBackgroundTimeline ehrlichunavailable. Owner60Suiten582uniqueTests einschließlichgezielter48Mode-/Quellenfälle, Volltypecheck/Lint/DiffPASS lautgelesenemBericht.01 hatProdukttransfer aufsauberemKandidat `b5532ea17d46cf8ea405c3dbb196b99b132ae06d` übernommen; Matrixfolgefixan01übergeben. FinalePublisherprüfungen/Bundle/Publish/DeviceQA nochopen. Kein iOSPipeline-/04Native-/DB-Transfer.

- Frühere iOS-Cache-/Testfixtureblockerbehoben: final28355bad-ClearExport und tatsächlichpubliziertesBundle/Stempel/84Quellen/Assets/CDNPASS. Quelle `28355badd869b1bf4f022c2c1c13a0c0b2636eca` istjetztaktiveriOS1.0.4-Stand.70Suiten875Tests/finalerneuerTypecheck/GPS-FixurelintPASS; keineweitereCache-/GPS-Matrixblockade fürdiesenPublish.

- Android **1.0.4 (45), Runtime1.0.4, EAS production FINISHED** am08.10.2026,22:24:43.434 Europe/Zurich; ID `3406f59a-273d-4bbf-a2ab-bbf200dd0f93`, AAB vorhanden. MASTER hat EAS selbst um22:26:42 lesend geprüft: kein Fehler. [Aktueller Buildbeleg](/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/outputs/ANDROID-NATIVE-MASTER-LIVE-2026-10-08.json). Enthalten: aktueller Android-Sharedstand, nativer TaskManager-/Sourcebuild-Fix, native persönliche Diagnose und05Single-Flight-Sync. EAS gitCommitHash3f44b1d ist nur die Basis; tatsächlicher eingefrorener Input SHA256 `29d81a32098a327216f2484ef5e99ef139ecae3181b2a1de3f5117b8657f8739`, Archiv `cab753e9c6f7a766f9f264960a325ee7d9159d492f0d00767b8b4d1dca098d6d` selbst nachgeprüft. Lokaler tatsächlicher Debugcompile/4JUnit und final58Sync-Tests PASS. Fertiges AAB durch01 geprüft: Bundlevalidierung, Signatur, tatsächliche Runtime1.0.4/Productionchannel sowie Dexnachweis für TaskManager-ConcurrentMap/Completion-/Expiry-Entfernung/20s/MainLooper, AppLoader und native Diagnostik PASS;1160 eingefrorene Dateien nach Build unverändert. MASTER hat Manifest-/Zertifikat-/Dexbelege selbst gelesen, Dexpostflight22:40:54.785816 Zürich. [Dexbeleg](/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/outputs/ANDROID-NATIVE-AAB-DEX-PROOF-2026-10-08.json). Geräte-/Google-Play-Abnahme/Store-Veröffentlichung nicht erfolgt. Medikamente/Recorder-P0/Continuity/Export-UX/Widget/freie Farben nicht Bestandteil dieses Builds. Neue direkte Freigabe „und alle offenen OTA noch veröffentlichen“:01 prüft getrennte fertige Folgepakete, notwendige isolierte OTA-Commits gemäß früherer sauber-committen-Anweisung; kein Push/main-Merge/Store/DB-Write. Continuity bleibt bis Exportadapter/Integration gesperrt.

Alle älteren Release-Tabellen/Snapshots unten sind historisch; dieser neuere belegte Stand hat Vorrang.

- Git `main` ist die kanonische Code-Linie für die gesamte ANYVO-App (Hundeverwaltung und Alltag, Training/Tracking, Gesundheit, Dokumente, Termine, Medien und Trainer Connect).
- Native Store-Builds und OTA-Bundles können zeitweise hinter `main` liegen.
- EAS Branch/Channel `production` != Git `main`. EAS belegt veröffentlichte OTA-Bundles; Store-Konsolen belegen Store-Freigabe und Rollout; Device QA belegt tatsächliches Geräteverhalten.
- Code-, Native- und Release-Parität werden getrennt dokumentiert. Plattformbezogene Funktionen müssen nicht identisch aussehen.

**Verifikationsgrenze:** T-65 (2026-10-08) hat Git, Production-Environment, Plattform-Bundles und EAS frisch geprüft; siehe Update oben. Store-/Geräteabruf und native Kompilierung bleiben OPEN. Ältere Tabellenzeilen behalten ihren ausdrücklich historischen Belegstand. `LOKAL VERIFIZIERT` = hier direkt geprüft; `DOKUMENTIERT` = lokaler Bericht mit Datum, hier nicht unabhängig erneut geprüft; `UNKNOWN` = kein ausreichender aktueller Beleg; `OPEN` = ausstehende Prüfung/Arbeit; `BLOCKED` = explizite Voraussetzung fehlt. Dokumentierte Releases sind immer **nicht frisch verifiziert**.

## Koordinationsabgleich GPS/Shelly — 2026-10-08 (DOKUMENTIERT)

Neuerer Release-Beleg aus Chat `01 – RELEASES – iOS / Android / OTA / Stores`
(`01a117fa-4be0-7c43-b1b5-01701e7c7626`) und
[Releasebericht](/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/outputs/GPS-SHELLY-OTA-RELEASE-2026-10-08.txt).
Im read-only Koordinations-Probelauf 08.10.2026, 14:11 bestätigt und lokal gegen
saubere Release-Worktrees abgeglichen. **Keine neue EAS-/Store-Abfrage hier.**

| Plattform / Runtime | Release-Commit | Group | Update-ID |
|---|---|---|---|
| iOS / 1.0.4 | `9453d5b946d639ed23ec190fb80ff071337bef43` | `2a5102b2-cd35-49ab-b64b-4ac968e4baf6` | `01a11b45-c172-7278-a9ec-6dcfd828b4bd` |
| Android / 1.0.3 | `122aee5b2f066b3064bcb7de9f10b94d177bbb6b` | `bd824598-cd54-48ca-8b5a-dc3885a2a8b5` | `01a11b57-2886-7882-9b98-07b5508aaf34` |

Berichtete Publish-Zeiten: iOS 2026-10-08T11:28:38.770Z, Android
2026-10-08T11:47:39.270Z; production/production/production. Guard, Bundle-Prüfung,
Post-check und nachfolgende damalige EAS-Lesung PASS; je Kandidat 7 Suites/78 Tests,
überlappende Zahlen, hier nicht erneut ausgeführt.

Enthalten: vorhandene GPS-Qualitätsfelder und interne Shelly-Vordergrunddiagnose.
Keine neuen nativen Quellen/Configs/Dependencies/DB-Migrationen in den OTA-Patches.
Feature-Commit `7ed2962` ist nicht Vorfahre von main; neue native Android-Felder
bleiben vom passenden Build abhängig. iOS 1.0.3 laut Releasebeleg unverändert.
Geräte-/Hardware-/Background-/Kauf-/Restore-QA OPEN. Die älteren Aussagen unten
„GPS/Shelly lokal/uncommitted/nicht veröffentlicht“ gelten als historische
Snapshots; Shared-OTA-Auslieferung und vollständige main-Integration getrennt halten.
Vor nächster Release-Aktion live erneut verifizieren. Kein Release in diesem Doku-Auftrag.

## Plattform-Update: Tracking Phase 1 — integriert und separat veröffentlicht (2026-10-08)

End-/Gegenstandsübergänge, Grace und Run-/Voice-Isolation sind in main integriert
(`d807964e05ef26ddc807dc6664a06410d8c98778`, Feature `9a926a7`). Geräteabnahme bleibt **OPEN**.

| Plattform / Runtime | Production-Commit | Update Group | Plattform-Update-ID |
|---|---|---|---|
| iOS / 1.0.4 | `f8fb921f99cc4aff9cc9a5a460a6015e63b1cd37` | `2063bba4-8e92-456a-b12e-f8dfaee2a270` | `01a11a6e-792b-726b-b066-ac95fc46587e` |
| Android / 1.0.3 | `7e0f0406678bd2fbe8572ef4a23ff1af147d7343` | `235b19b1-f7a4-4bf9-9764-a25480abc338` | `01a11a75-5a2b-7abf-ba8e-fb923a8841f8` |

Channel/Branch/Environment jeweils `production`. Separate kompatible Snapshots
erhalten die jeweilige frisch geprüfte Plattform-Baseline und übernehmen nur die
elf Phase-1-Dateien. Native Konfiguration, Dependencies und Module sind zur jeweiligen
Baseline identisch. T-64-Native-Konfiguration und weitere main-Änderungen werden
dadurch nicht zusätzlich ausgeliefert. Keine vollständige main-Parität behauptet.

Frische EAS-Lesung, Environment-Guard, Ancestry, zweite Lesung, gemeinsamer Lock,
plattformbezogener Export, tatsächliche Bundle-Prüfung und Publish/Post-check **PASS**.
iOS 1.0.3 bleibt `968884f` / Group `455dc249-fb4f-4868-a646-67d88c1ae7cb`.
Integration: 213 Suites / 2611 Tests PASS; je Release 8 Suites / 103 Tests PASS;
TypeScript PASS, ESLint 0 Fehler / 3 bestehende Warnungen, diff-check PASS.
Zahlen überlappen. Kein Push, neuer nativer Build, Store-Schritt oder DB-Eingriff.

GPS-/GNSS-Qualität und Shelly-Diagnose sind separat **lokal implementiert und
geprüft, uncommitted / nicht integriert / nicht veröffentlicht** in
`anyvo-feature-tracking-gps-quality-shelly`, Branch
`feat/tracking-gps-quality-shelly-diagnostics`, Basis `d807964`.
Qualität wird additiv erhalten; Android-native Emission und Status-Trennung brauchen
ein neues passendes Binary. Shelly ist ein Vordergrund-Diagnoseprototyp ohne
Tracking-Aktionen. Continuity-Empfehlungen bleiben **unbeschlossen**.
Native Kompilierung, Hardwareempfang, Locked-screen- und Build49-Geräteabnahme **OPEN**.
Details: `tasks/T-65.md`; lokaler Featurebericht `tasks/TRACKING-GPS-QUALITY-SHELLY.md`.


## Android Native-Vorbereitung — Update 2026-10-07

T-64-Produktcommit `2316e7cfd06149f0b0a7a1b2baa04430b88b867f` nach ausdrücklicher Freigabe in main integriert.
Android 1.0.4 (45) vorbereitet, BLE optional und TaskManager-Patch im EAS-Postinstall-Hook geprüft.
4 Suites / 32 Tests, Typecheck, ESLint und Introspection PASS. iOS-ModResults unverändert.
**Nur Code-Integration:** kein neuer Build, keine OTA oder Store-Veröffentlichung; Native-/Geräteabnahme weiterhin OPEN.
VersionCode 45 vor Build gegen dann aktuelle Play-/EAS-Werte prüfen. Details: [T-64](tasks/T-64.md).

## Canonical Git

| Feld | Stand / Beleg |
|---|---|
| Branch | `main` — LOKAL VERIFIZIERT |
| Worktree | `/Users/moyo/canisflow-worktrees/anyvo-main` — LOKAL VERIFIZIERT |
| Code-Integration | `d807964e05ef26ddc807dc6664a06410d8c98778` — T-65, LOKAL VERIFIZIERT; T-64 erhalten, Status-Doku-Commit separat |
| Working tree vor Erstellung | Nur `?? docs/agent/ACTIVE_WORK.md`; vorhandene fremde Doku, unverändert erhalten |
| Lokaler Remote-Tracking-Ref | `origin/main` = `41e51734053fbc9c04c5de527edd6bf464cce66e` — lokal gelesen; main enthält weitere lokale Commits. Kein Fetch oder Push in T-64 |
| Tatsächlicher Remote-Stand | **UNKNOWN / nicht frisch verifiziert**; kein Fetch oder Remote-Abruf. Der lokale Ref beweist keinen aktuellen Serverstand |
| Doku-Drift | Master-Status nennt einige Integrationen noch als ausstehend und `main` noch als ungepusht. Tatsächliches lokales Git enthält Search-, Maßstab-, Heat- und Hygiene-Integration; der Remote-Tracking-Ref ist gleichauf. Ältere Doku ersetzt diesen Git-Beleg nicht |

## iOS

### App / Native

| Feld | Stand / Beleg |
|---|---|
| Aktuelle Repo-Config | App-Version `1.0.4`, buildNumber `49`, Bundle ID `com.anyvo.app` — [app.json](../../app.json), LOKAL VERIFIZIERT |
| Runtime-Config | `runtimeVersion.policy = appVersion`; Ziel gemäß App-Version `1.0.4` |
| Letzter dokumentierter nativer Build | `1.0.4 (49)`, Runtime `1.0.4`; EAS Build `994f04ba-0e1e-4cba-9888-79059a225213`, SUCCESS — Master-Status, 2026-10-06 |
| Native Source-Commit | `3f7c2e746fd064d1b103aa67f926c514a52eed44` — Build-Zuordnung DOKUMENTIERT; Commit lokal vorhanden |
| App Store Connect | Upload SUCCESS, Submission `02ea21d2-1804-4dcd-97a0-7b5c42dc7a92` — DOKUMENTIERT, 2026-10-06 |
| Aktueller App-Store-Status | **UNKNOWN / nicht frisch verifiziert**. Master-Status dokumentiert Build 49 als noch nicht veröffentlicht; Auftrag nennt Veröffentlichung nur als zu prüfenden Hinweis. Kein lokaler neuerer Freigabebeleg gefunden |
| Älterer Store-Stand | `1.0.3 (48)` mit Runtime `1.0.3` — Master-Status; heute nicht erneut geprüft |
| Native Funktionen Build 49 | Live Activity V2, Dynamic Island, Multi-Dog-Ruheaktivitäten, Schnellstart-Widget, App Intents/App Shortcuts (de/fr/it), Prebuild-Härtung — DOKUMENTIERT |

### OTA

EAS Branch/Channel `production`; aktuelle Zielruntimes frisch geprüft 2026-10-08, historische Vorgänger entsprechend gekennzeichnet.

| Runtime | Zuletzt dokumentierte Group / Commit | Beleg / Inhalt |
|---|---|---|
| `1.0.4` | `2063bba4-8e92-456a-b12e-f8dfaee2a270` / `f8fb921f99cc4aff9cc9a5a460a6015e63b1cd37` | T-65, 2026-10-08: frischer Guard/Publish/Post-check PASS; Phase 1 auf erhaltener Background-Lay-Baseline |
| `1.0.4`, vorherige OTA | `fcd879d9-b307-4cac-87e8-2a90f3d7f727` / `04cad8da58c7b86ee0b808d0e01964e3341cca2a` | Master-Status, 2026-10-06: adaptiver Fährtenmaßstab, Live-Distanz, Distanz zum nächsten Gegenstand; in obiger OTA enthalten |
| `1.0.3` | `455dc249-fb4f-4868-a646-67d88c1ae7cb` / `968884f712544f45b35ebf8900ab64332b45ff7d` | Veröffentlichung 2026-10-05, EAS-Prüfung 2026-10-06 / unverändert laut Snapshot 2026-10-07; Recovery, Ruhe-UX, Hold-to-abort, Multi-Dog-Overlays/Farben; Live Activity V2 JS mit V1-Fallback im älteren Binary |

**OPEN:** Geräte-Update-ID und Geräteabnahme; EAS-Abgleich 2026-10-08 bestanden. Die neue 1.0.4-OTA liefert ausschließlich Phase 1 auf bisheriger Baseline und enthält weiterhin nicht die zusätzlichen `main`-Commits für Subscription-Matching (`3979246`), Accuracy-aware Search (`6b103c1`) und zuverlässige Maßstabdarstellung (`f74ec87`). Deren iOS-Auslieferung ist hier nicht belegt.

### QA

- **DOKUMENTIERT PASS, 2026-10-06:** Owner-Gerät mit 1.0.4 (49) + Maßstab-OTA: Widget, Live Activity V2, Dynamic Island, Fährtenmaßstab.
- **DOKUMENTIERT PASS, 2026-10-07:** Background Lay, Screen-off/Hosentasche auf Hotfix-Stand vor Integration.
- **OPEN:** Post-OTA-Smoke auf Build 49 (Screen-off, Session-Zuordnung, Persistenz, Resume); Geräteprüfung der späteren Shared-Code-Integrationen. Kein frischer QA-Lauf in dieser Aufgabe.

## Android

### App / Native

| Feld | Stand / Beleg |
|---|---|
| Aktuelle Repo-Config | App-Version `1.0.4`, versionCode **`45`**, Package `com.anyvo.app` — app.json, LOKAL VERIFIZIERT; kein Beleg für ein veröffentlichtes 1.0.4-Binary |
| Runtime-Config | Policy `appVersion`; Repo-Ziel `1.0.4`, dokumentierte installierte Production-Linie `1.0.3` |
| Letzter bekannter nativer Play-Build | **44**, Runtime `1.0.3` — [DEVELOPMENT_WORKFLOW.md §8](../DEVELOPMENT_WORKFLOW.md); aktueller Store-versionCode laut T-63 nicht unabhängig geprüft |
| Native Source-Commit | `5a0610b6afc40625c768e5930e6c67fa4e25c6f2` — Workflow nennt Build 44 / Build-ID-Präfix `c2b7ef45` / `5a0610b`; voller Commit lokal aufgelöst. Zuordnung nicht frisch aus EAS geprüft |
| Historische Source-Config | `5a0610b:app.json` nennt Version `1.0.3`, versionCode `40`; dies ist **kein** Nachweis des tatsächlichen Binary-versionCode. Abweichung zur dokumentierten 44 muss im Build-Preflight geklärt werden |
| Aktueller Play-Status | **UNKNOWN / nicht frisch verifiziert**. T-63 vom 2026-10-07: Veröffentlichung owner-reported; genaue Version, Rollout, Länder und Policy-Status nicht unabhängig geprüft (Console-Login blockiert) |
| Native Config auf main | Background Location + Location-Foreground-Service aktiviert; BLE-Plugin, Motion/Sensor-Abhängigkeiten und Manifest-Cleanup vorhanden. Config/Paketbestand belegt nicht deren Funktion im installierten Binary |
| Native Parität | **OPEN**: älterer dokumentierter Binary-Source-Stand; kein neuer nativer Build durch T-63. Aktuelle native Abhängigkeiten, Permissions, Services und Verhalten gegenüber Build 44 separat abgleichen; iOS-Widget/Live-Activity-Funktionen nicht als Android-Funktion voraussetzen |

EAS-Config: `appVersionSource = local`, Production `autoIncrement = false` — [eas.json](../../eas.json). Vor einem später ausdrücklich beauftragten Build muss versionCode über dem dann frisch geprüften höchsten relevanten Play-/Build-Wert liegen; bei bestätigter 44 also **> 44**. T-64 bereitet 45 vor; vor Build erneut frisch prüfen.

### OTA

| Feld | Zuletzt dokumentierter Stand |
|---|---|
| Plattform / Runtime | Android / `1.0.3` |
| Channel / EAS Branch / Environment | `production` / `production` / `production` |
| Group | `235b19b1-f7a4-4bf9-9764-a25480abc338` |
| Commit | `7e0f0406678bd2fbe8572ef4a23ff1af147d7343` |
| Android Update ID | `01a11a75-5a2b-7abf-ba8e-fb923a8841f8` |
| Inhalt | Phase-1-End-/Gegenstands-/Grace-/Lifecycle-Fixes; vorhandener T-63-Subscription-Fix erhalten |
| Verifikation | **FRISCH VERIFIZIERT, 2026-10-08**, [T-65](tasks/T-65.md): Guard, Bundles, Publish/Post-check und anschließende EAS-Abfrage PASS |
| Vorherige OTA | Group `168ae23f-676f-455c-8f15-bb475910d83e`, Commit `e88371dc49233853162e87d8114c9f9d38a112d9` — T-63, erhalten |

T-63 bewahrt den bestehenden Android-1.0.3-Bundle-/Config-Stand und übernimmt gezielt den Subscription-Fix. Das ist **keine vollständige Auslieferung des aktuellen main**. Der releasebezogene Runtime-Snapshot darf laut T-63 nicht in main integriert werden. Historischer Parity-Commit `1d473a4fbea723dfc272cd1bd8de0e7267f071a1` ist lokal vorhanden; sein Name beweist keine heutige Parität.

### QA

- **DOKUMENTIERT, T-63 / 2026-10-07:** automatisierte Release-Prüfungen, Android-Export und Bundle-/Publish-Prüfung bestanden. Kein Ersatz für Geräteabnahme.
- **OPEN:** Store-Preise, aktive Kaufbuttons, Google-Kaufsheet, Lizenz-Testkauf/Restore und tatsächlicher Active-/Trainer-Zugang.
- Letzter belastbarer Geräte-QA-Beleg für den oben dokumentierten Android-Release: **UNKNOWN**. Tracking mit Screen-off, Resume, schlechter Verbindung und Permissions auf Android gesondert prüfen.

## Shared Code Parity

| Bereich | Code auf main | Auslieferung / Paritätsstatus |
|---|---|---|
| Shared JS/TS | Gemeinsame kanonische Linie; Background Lay `fd0c727`, Accuracy-aware Search `6b103c1`, Maßstab-Fix `f74ec87`, Subscription-Matching `3979246` lokal enthalten | **OPEN**: unterschiedliche dokumentierte OTA-Commits; aktueller main nicht als auf beiden Plattformen ausgeliefert belegt |
| iOS native parity | Native iOS-Erweiterungen im Repo; Build 49 dokumentiert | Widget/Live Activity/Shortcuts Device PASS dokumentiert; Store-Rollout UNKNOWN |
| Android native parity | Aktuelle Config vorhanden | **OPEN**: dokumentiertes älteres Binary; vollständiger Native-Diff und neuer Build-Preflight nötig |
| Subscription parity | Matching-Fix auf main | Android OTA dokumentiert, Geräteabnahme OPEN; iOS-Auslieferung des Fixes nicht belegt |
| Tracking parity | Background-Lay- und Search-/Scale-Fixes auf main | iOS Background-Lay-OTA dokumentiert; aktuelle gemeinsame Feld-/Geräteparität **OPEN** |
| Runtime parity | Repo-Ziel `1.0.4` für beide | Dokumentiert: iOS `1.0.3` + `1.0.4`, Android `1.0.3`; Runtime-Parität nicht hergestellt |
| Release parity | Release-Ausgangspunkt main | Native-/OTA-/Store-Stände getrennt; gleiche Source-Version und gleichwertiger QA-Stand nicht belegt |

## Known Gaps

- **Android Native — OPEN:** Build-44-Linie hinter aktuellem main; versionCode 45 vorbereitet (T-64); frischer Build-Preflight und nativer Build erforderlich. Kein einzelnes fehlendes natives Modul ohne Binary-Abgleich behauptet.
- **Runtimes — OPEN:** unterschiedliche dokumentierte installierte Runtimes; Repo-1.0.4 darf nicht mit Android-Store-1.0.3 verwechselt werden.
- **Release-Belege — OPEN:** iOS Build-49-Storestatus widersprüchlich zum Auftragshinweis; Android Store-versionCode/Rollout unbekannt; alle Live-Stände frisch prüfen.
- **Heat schema restore — DB-Thema:** Migration und Test auf main in `9417ec04d60bfdae1f34e5a0319779a1d9c6b993`; Commit dokumentiert Schema-Leseprüfung vom 2026-10-06 und keine Ausführung der Migration. Keine Plattformparitätslücke und keine DB-Write-Freigabe; aktueller DB-Zustand hier nicht geprüft.
- **End Detection — OPEN:** [ACTIVE_WORK.md](ACTIVE_WORK.md) nennt `fix/tracking-end-detection`, Analyse/Implementierung ausstehend; bestehende V6.2-Endkorrekturen ersetzen die offene Feldverifikation nicht.
- **Marker Collision — OPEN / geplant:** Winkel/Gegenstand/Ende gemäß ACTIVE_WORK.md; kein Abschlussbeleg.
- **Continuity/Gaps — BLOCKED:** ACTIVE_WORK.md und Master-Status Phase 3: zuerst explizite Continuity-Semantik; kein automatisches Schließen/Verbinden von Lücken. Getrennt von der früheren Production-Bundle-Continuity-Wiederherstellung.
- **Accuracy propagation audit — OPEN (Statusprüfung):** Auftrag nennt möglichen Folgeaudit; in den geprüften lokalen Dokumenten kein eigenständiger aktueller Abschluss-/Scope-Beleg gefunden. Accuracy-aware Search ist bereits integriert; daraus folgt kein vollständiger Propagation-Audit-PASS.

## Next Parity Actions

Diese Reihenfolge ist Planung, keine Freigabe für Push, OTA, Build, Store-Release oder DB-Aktion.

1. Remote-main sowie EAS-Groups je Plattform/Runtime und Store-Builds **read-only frisch verifizieren**; Doku-Widersprüche anhand dieser Belege auflösen. Ein Push ist nur bei belegtem Bedarf und ausdrücklichem Auftrag zulässig.
2. iOS-1.0.4-OTA-Preflight von aktuellem main für die späteren Shared-JS/TS-Änderungen: frische Runtime-Baseline, vollständige Feature-Erhaltung, Ancestry, Environment und Native-Kompatibilität prüfen. Veröffentlichung separat freigeben.
3. Android Native-Preflight von aktuellem main: tatsächlichen Play-/EAS-versionCode feststellen, höhere Buildnummer vorbereiten, Native-Diff/Permissions/Services und Runtime-Wechsel prüfen; aktuelle Android-Production-Funktionen erhalten. Build/Release separat beauftragen.
4. Geräte-QA auf beiden Plattformen: Subscription-Kauf/Restore, Tracking/Lay/Search, Screen-off, App-Wechsel/Resume, Offline/Persistenz sowie zentrale Hunde-/Alltagsfunktionen. Ergebnisse an konkrete Binary-/OTA-IDs und Source-Commits binden.

## Update Rule

Diese Übersicht bei neuem nativen iOS-/Android-Build, OTA, Store-Release, Runtime-Wechsel, plattformspezifischer nativer Änderung und relevanter Shared-Code-Integration aktualisieren.

Immer Datum, Plattform/Runtime, Source-Commit, Build-/Group-ID, Belegquelle und Verifikationsart erfassen. Repo-Config, gebauten Binary-Stand, veröffentlichtes Bundle, Store-Rollout und Device QA getrennt halten. Unverifizierte Werte bleiben UNKNOWN/OPEN; ältere belegte Stände bleiben datierte Snapshots. EAS/Stores vor Release-Entscheidungen frisch lesen. Diese Datei darf fremde WIP-Dokumente oder den Master-Gesamtstatus nicht stillschweigend überschreiben.


## Maßstab: frischer Code-/OTA-Abgleich — 2026-10-08, 14:53 Europe/Zurich

- Chat 01 frisch EAS geprüft: production-Channel vollständig auf production-Branch,
  nicht pausiert. iOS Runtime 1.0.4 Group `2a5102b2-cd35-49ab-b64b-4ac968e4baf6`,
  Update `01a11b45-c172-7278-a9ec-6dcfd828b4bd`, Source `9453d5b946d639ed23ec190fb80ff071337bef43`.
  Android Runtime 1.0.3 Group `bd824598-cd54-48ca-8b5a-dc3885a2a8b5`,
  Update `01a11b57-2886-7882-9b98-07b5508aaf34`, Source `122aee5b2f066b3064bcb7de9f10b94d177bbb6b`.
- Beide aktiven Quellen enthalten die Maßstabsberechnung, jedoch nicht den vorhandenen
  Mount-/Layoutfix `f74ec87f548c75217d106e946f64c0e37b5fb181`; main `1a57421` enthält ihn.
  Später geladene Referenzpunkte können den Maßstab in beiden OTAs unsichtbar lassen.
- Chat 02: main 8/98 PASS, beide Releases je 8/95 PASS; drei zusätzliche
  Regressionstests pro Releasekomponente FAIL, je 16 Mathematikszenarien PASS.
  Geometrie/Anzeigeereignisse getestet, keine neue native Geräte-/Feldabnahme.
- Nächster Scope nach Auftrag: bestehenden Zwei-Dateien-Fix auf beide aktive Quellen
  übertragen, Tests/Preflights, getrennte OTA-Freigaben und echte iOS-/Android-QA.
  Keine Native-/DB-Änderung im Fix. Aktive Quellen sind nicht Vorfahren von main;
  vollständige main-OTA ist ohne Erhaltung des Release-Inhalts nicht freigegeben.
- Neue Shelly-Hilfe im Feature-Worktree lokal für fünf Sprachen vorbereitet,
  Shared UI ohne Native-/DB-Änderung; Integration und Auslieferung OPEN.
  Einzelbelege/Chat-Zuordnung in ACTIVE_WORK. Keine neue Veröffentlichung ausgeführt.


### Neuester belegter Maßstab-/Diagnosestand — 2026-10-08, nach 15:30 Europe/Zurich

- Separat direkt freigegebene Maßstab-OTAs durch Chat01 veröffentlicht,
  Abschluss-Turn `01a11ba6-5a0a-77d0-a0a6-93f11f93a5af`,
  Bericht `outputs/SCALE-MOUNT-OTA-RELEASE-2026-10-08.txt` im Projektspiegel.
- iOS Runtime1.0.4: Source `9c176959d08c839a799464efd47b1d3f8108555a`,
  Group `1de50d5b-284f-46e2-a4f9-4cc2d8683fef`,
  Update `01a11bac-25fb-75e0-960c-a2fd8f8b34a0`.
- Android Runtime1.0.3: Source `60ae4d5ea77d8c7c93c36eb61c9e8c3d349d96ec`,
  Group `8e92eccb-ac1e-40c4-a140-182921760954`,
  Update `01a11bae-ec26-706e-81cf-99216d84e941`.
  Production channel/branch/environment, Guards/Nachprüfung/Bundlefix PASS.
  Damit ist das Fehlen von f74ec87 in diesen beiden Bundles aus älterem Audit
  behoben. Geräte-/Feld-QA weiterhin OPEN; iOS1.0.3 unverändert.
- Chat04 frisch EAS-read-only: Android Production-Build1.0.3(44), FINISHED,
  ID `c2b7ef45-6d0a-4340-91d4-6f4fefb03418`; Build45 weiterhin Vorbereitung.
  EAS-Nachweis ist keine Play-Rollout-/Installations-/Geräteabnahme. Native Android-
  TaskManager-/GNSS-Erweiterungen werden durch Shared-OTA nicht installiert.
- main unverändert `1a574212f6b7c1827bc03048f2eb5b5d662cd7a1`.
  Diagnose-Ausbau nur analysiert/PLAN, nicht umgesetzt oder veröffentlicht:
  siehe `tasks/TRACKING-DIAGNOSTICS-AUDIT-2026-10-08.md`.
  Shared7 Suites/131 Tests +2 isolierte Builder-Versuche; echte Native-/Feldtests OPEN.
  Bestehende native Sensorfähigkeit und Diagnose-Bereitschaft sind nicht gleichwertig.


### Diagnoseausbau: lokal implementiert, nicht ausgeliefert — 2026-10-08

Neuester belegter Source-Stand ersetzt frühere reine PLAN-Angabe: Chat03 hat
additive Shared-JS-Diagnose lokal in `anyvo-tracking-qa-session-evidence` auf
`feat/tracking-qa-session-evidence@1a57421` abgeschlossen. QA-Export mit
sessionexakten Hintergrunddaten/Verfügbarkeitsstatus, aufnahmezeitlicher Identität
und begrenzter Lay-/Search-Quellen-/Lifecyclebeobachtung. Bericht dort:
`docs/agent/tasks/TRACKING-QA-SESSION-EVIDENCE-2026-10-08.md`.
31/310 Tests plus tsc/Diffprüfung berichtetePASS, MASTER Patchhash/ApplycheckPASS;
keine native Kompilierung oder Geräte-/Energieabnahme. Kundenexport unverändert.

Persönliche iOS-Accountberechtigung wird separat durch05 umgesetzt; Zugriff,
Entzug/Logout/Accountwechsel/Capture/Export gemeinsam prüfen. Noch keine Integration
oder OTA; iOS Runtime1.0.4/AndroidRuntime1.0.3 bleiben bei den oben belegten
Maßstab-OTAs. Android-native Diagnose separat04 mit neuem Binary und01 als einzigem
Buildexecutor. Playanmeldung/Versionsnachweis und finaler TaskManagerpatch-/
Native-/Featureerhaltungscheck offen. Keine Installation oder FieldQA behaupten.
