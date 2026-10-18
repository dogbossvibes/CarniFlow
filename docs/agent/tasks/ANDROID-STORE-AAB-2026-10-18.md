# Android Store AAB — vorbereiteter Releasequellstand 2026-10-18

Direkter Nutzerauftrag in Chat04: Android mit den aktuellen Änderungen fertigstellen, als AAB bauen und Google Play zur Prüfung vorlegen; neues Logo einschließen. Eine öffentliche Auslieferung ist davon getrennt. Chat01 führt Build/Einreichung aus, Chat00 koordiniert die GitHub-Sicherung. Dieser Bericht behauptet keinen abgeschlossenen Build oder Store-Upload.

## Kumulative Quelle

- Ausgangspunkt: geprüfter Android-R2-Feldcommit `25dd497c188d1eddeb566ef6989343a4bfe8e085`, auf UI-/Dokumentationscommit `b6380abc099caf86103f202d1a38f9482d190342`.
- Enthält Terminbearbeitung/Keyboard-R2, Winkelliste und Gegenstandsbezeichnungen, transparentes Logo und den direkten Einstieg von „Meine Hunde“ in die Trainingsdokumentation.
- Enthält die geprüften R2-Feldkorrekturen: kanonische Anzeige der Marker-Meter, Zeitachsen-/Gap-Erhalt im Referenzcache, vorhandener2m-Doppelwinkelschutz über Auswertungsdurchläufe, zugängliche Zoomgruppen und Endbeobachtung. Originaldaten, Score und Erkennungsschwellen werden nicht pauschal umgeschrieben.
- Die42Dateien der Native-/Widget-Integration aus Chat04 sind exakt quellgebunden übernommen; Android-Nativebasis ist der erfolgreich gebaute interne Widgetstand `c3f4a63e8af7bf6c2af7e622d7dfa98146b83ab2`. Die vorhandenen Android-Precision-/TaskManager-/Manifest-Cleanup-Korrekturen bleiben erhalten.
- Neues Native-Widget mit eigenen Hunden/Alle-Auswahl, generischen Termin-/Anfrage-/Erinnerungsanzeigen und geschütztem lokalem Snapshotcache; keine neuen Serverrechte, Abhängigkeiten oder Standortalgorithmen.

## Buildkonfiguration

Die frisch vollständig gelesene Play-Bundleliste enthält20Versionen, Maximum45; die frisch gelesenen29EAS-Android-Builds haben Maximum46. Kandidat: App1.0.5, Android-Code47 und Android-Runtime1.0.5. Vor dem tatsächlichen Build den Höchstwert nochmals frisch prüfen. Das vorhandene Production-Profil baut ein App-Bundle, verwendet Production-Environment/Channel und keinen automatischen Versionssprung. Die1.0.4-OTA-Linie bleibt separat.

Der EAS-Postinstall-Hook führt weiterhin zuerst die zwingende TaskManager-Prüfung aus. Im tatsächlichen Android-EAS-Job bindet er danach die öffentliche JS-Commitkennung an `EAS_BUILD_GIT_COMMIT_HASH`, über das dokumentierte joblokale `set-env`. Keine Änderung der geteilten Production-Environment. Der eingebettete Marker ist am fertigen AAB nachzuprüfen.

Logoquelle und native Splash-Quelle sind `assets/images/anyvologo.png`, SHA256 `fb24496c5f11d983267834ba55a80b3ffa810ee5b4b667bff078e893f4785856`. App-Icon und Adaptive-Icon bleiben ihre vorhandenen getrennten Ressourcen. Kompilierte Splash-/Bundle-Assets vor Upload prüfen.

## Prüfstand und verbleibende Gates

Quellgebundene lokale Integrations-, TypeScript-, ESLint- und Whitespace-Prüfungen und unabhängige Reviews sind in `outputs/android-store-release-01-2026-10-18` außerhalb dieses Releasequellstands dokumentiert. Native43JUnit-/Modul-Compile-Belege beziehen sich auf identische Modulquellen; sie ersetzen keinen vollständigen neuen AAB-Build. Frühere einzelne Cold-Load-Testzeitüberschreitungen bleiben dokumentiert und wurden mit unverändertem Standardlimit gezielt sowie in der vollständigen Dokumentationssuite nachgeprüft.

Vor Upload: tatsächlicher Build/Version/Runtime/Source, vollständiger Compile, Signierung, eingebettete JS-Quelle und neue Logoassets nachweisen. Das vorhandene `submit.production`-Profil zielt auf `internal` und ist kein Beleg für die gewünschte Production-Prüfung. Die bestehende verwaltete Veröffentlichung wurde als aktiviert gelesen; vor dem tatsächlichen Absenden zur Google-Prüfung erneut verifizieren. Keine öffentliche Veröffentlichung oder fremde wartende Änderungen freigeben.

Echte Android-Geräteabnahmen bleiben offen, insbesondere Widgets/Accountwechsel/Offline/Launcher sowie Tracking-Resume/Persistenz, Keyboard/Back/Insets und Kauf/Restore. Keine Neuinstallation oder Datenlöschung als Standardtest. Keine Live-DB-Schreibaktion oder neue DB-Migration gehört zu diesem Releaseauftrag.

Das neuere Joker-/Ball-/Gummi-Paket ist wegen eigener Backend-Kompatibilitäts-/Freigabegates separat. Die isolierte Hilfe-/Erste-Schritte-Überarbeitung hat keine Build-/OTA-Freigabe und ist ebenfalls nicht enthalten.
