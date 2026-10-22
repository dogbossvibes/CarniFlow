# Android Greeting: Gradle-Metadatenkorrektur – 07

## Befund

Erster Cloud-Build Android49 `c4c5c329-4bb5-4928-af39-e61e731d97a2` aus sauberer, gesicherter Releasequelle `1400bf6d5261f5af5a701d77e223aa95af13c71c` scheiterte bei der Konfiguration von `:anyvo-greeting-audio`: `'android.defaultConfig.versionName' is not defined`. Kein AAB, keine Veröffentlichung. Die vorherigen Kotlin-/AAPT-/Logikprüfungen belegten ausdrücklich keinen vollständigen AGP/AAB-Build; die Gradle-Publikationsmetadaten waren dabei nicht erfasst.

Installiertes ExpoSDK54 `expo-module-gradle-plugin/.../android/MavenPublicationExtension.kt:43` verlangt `defaultConfig.versionName` für `PublicationInfo`. Die bereits gesetzte Gradle-Projektversion `1.0.0` wird nicht automatisch als Android-defaultConfig-Version übernommen. Bestehendes lokales Widget-Modul verwendet `versionName project.version.toString()`.

## Enger Fix

07 alleiniger Writer im Feature-Worktree `anyvo-android-greeting-silent-mode`, Branch `fix/android-greeting-silent-mode`, sauberer Parent `2d922879ebdbb1ab2ca15b37dd7c101dfdb8a3a9`. Genau zwei Dateien: Modul-`build.gradle` und dieser Bericht. `defaultConfig.versionName` aus der bereits bestehenden Projektversion ergänzt. minSdk24, Modulversion/Namespace/Plugins und alle Audio-/JS-/Lifecycle-/Priority-/Ringer-/Policy-/Ressourcenquellen unverändert. Keine Dependencies, Berechtigungen, Runtime- oder App-Versionsänderung durch07.01 integriert erst nach Freeze/04-Deltareview; nur01 darf den beauftragten Build erneut starten, nach erneuter Sicherung und Kollisionsprüfung durch00/01.

## Tatsächliche lokale Konfigurationsprüfung

Eigenes isoliertes Prüfprojekt aus dem unveränderten Release-Commit1400bf6 erzeugt und mit tatsächlichem gepinntem Expo-Prebuild für Android generiert. Bestehende installierte Abhängigkeiten wiederverwendet; keine Versionsupdates, kein npm-Install. Tatsächlicher GradleWrapper8.14.3, JDK aus AndroidStudio, AndroidSDK36, minSdk24, Kotlin2.1.20/KSP2.1.20-2.0.1 und die tatsächlich installierten Expo-/React-/AndroidGradle-Plugins. Offline gegen den vorhandenen Cache, kein Cloud-Build/APK oder Store-Schritt.

Vorher: vollständige reale Projektkonfiguration mit `gradlew help` reproduziert exakt den Cloudfehler, Exit1. Danach: ausschließlich die korrigierte Modul-Gradledatei ins identische Prüfprojekt kopiert; derselbe Konfigurationsschritt besteht mit Exit0. Zusätzliche Gradle-Assertions bestätigen HauptprojektANYVO, tatsächliche AndroidLibrary-/Expo-Plugins, Projektversion1.0.0, defaultConfig.versionName1.0.0, minSdk24 und Namespace. Ein anfänglicher Fehler im Prüf-Init-Skript bezog die Assertions auch auf Gradles Composite-Pluginbuilds; auf das tatsächliche ANYVO-Hauptprojekt begrenzt, Assertions unverändert, erfolgreicher Ausgabemarker erforderlich. Negativ-/Hilfsskriptfehler-/Positivlogs bleiben erhalten.

Zusätzlicher Release-Taskgraph-Trockenlauf mit denselben echten Plugins; endgültiges Ergebnis, Quell- und Loghashes im `outputs/android-greeting-gradle-version-fix-07-2026-10-22/SOURCE-FREEZE-07.json`. Ein Taskgraph-Trockenlauf ist keine Bibliotheks-/APK-Kompilierung. Frühere275JS-/13nativeLogiktests nicht pauschal wiederholt: alle davon betroffenen Produkt-/Testquellen sind unverändert und werden im Freeze gegen Parent/ursprünglichen Owner-Freeze hashgebunden. Neue relevante Prüfung ist die echte AGP-Konfiguration. `git diff --check` erforderlich.

## Grenzen und Übergabe

04 prüft den exakt gefrorenen Metadaten-Delta unabhängig.01 erhält den neuen Commit/Patch und führt in seiner kumulativen Releasequelle die weitere Prüfung, GitHub-Sicherung mit00 sowie frischen Buildnummer-/Runtime-/In-flight-Preflight durch. Build48-Korrekturen und alle bestehenden Daten/Funktionen erhalten. Der fehlgeschlagene Build49 wird nicht als erfolgreiche Erstellung oder Auslieferung dargestellt; endgültige Buildnummer bestimmt01 frisch. Gerätetests weiterhin ausdrücklich zurückgestellt.07 hat keinen Cloud-Build, Push, OTA, Play-/DB-Schritt ausgeführt.
