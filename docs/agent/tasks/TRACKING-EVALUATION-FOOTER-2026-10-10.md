# Android: Auswertungs-Footer über Systemnavigation

## Auftrag und Ausgangsstand

Direkter Nutzerauftrag im Workflow-Chat 01a1182a-51e4-7832-8dfb-38c5036917e8,
Turn 01a1242e-d90d-73b1-a72a-f1d43f2a1bfa, UserMessage
01a1242e-db0d-76b1-8bef-51cda5907565: Android-Navigationsbalken überdeckt
Speichern, Hochscrollen sei nicht möglich; beheben und per OTA ausliefern.
07 ist UI-Writer, 04 prüft nativ lesend, 01 veröffentlicht ausschließlich Android.

- Worktree: `/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/anyvo-tracking-evaluation-footer`
- Branch: `fix/tracking-evaluation-footer`
- Basis und unveränderter HEAD: `a5b2aadd5d6f6ac76e558dfb23c3425e08e5aa26`
- Ausgangsstatus vor eigenen Änderungen: sauber.
- Android 1.0.4, durch 01 frisch bestätigt: Update-Group `c460316e-3461-4c49-b492-5cd2f72722fa`, Update `01a12389-bb06-70d3-bd9b-5c05856f3ed5`, Source gleich Basis.
- Android 1.0.3: Source `44f76469f3976cd86022ac96748459f403a99d7b`, Group `8eb244a2-4733-4137-ae4f-e4a3a66e7f2e`, Update `01a1238f-6014-7127-8e08-6546ad398260` laut 01.
- Kein Commit, Push, Merge, Build, OTA oder DB-Schreibzugriff durch 07.

Foto selbst angesehen: `/tmp/codex-remote-attachments/01a1182a-51e4-7832-8dfb-38c5036917e8/1A1BB1EE-94F6-4795-882F-494103515567/1-Foto-1.jpg`.
SHA-256: `c22ecd31d3ec1a9ad65cbfe13f1821de4a6939f5f43a2091b6b8b863e0162123`.
Das Foto belegt die Überdeckung, aber weder APK/OS noch geladenes OTA eindeutig.

## Befund und Änderung

Im aktuellen `app/track/[id].tsx` schützt die Root-SafeArea nur oben. Der Footer
liegt außerhalb der ScrollView und hatte festes paddingBottom 26 ohne unteren
System-Inset. Scrollen verschiebt diesen Footer deshalb nicht. Eine zusätzliche
eigenständige Blockade des Scrollens wurde nicht auf einem Gerät reproduziert.

Das neue lokale `TrackEvaluationLayout` verwendet für den Android-Footer eine
native SafeAreaView mit bottom/left/right. Das bisherige Spacing wird gemäß
SafeArea-Vertrag zum Inset addiert, genau einmal. Der Footer bleibt im normalen
Layoutfluss und schrumpft nicht; die flex1/minHeight0-ScrollView erhält den
verbleibenden Platz. Keine absolute Überlagerung und keine doppelte Footerhöhe
im Scroll-Padding. Tastatur kann beim Ziehen geschlossen werden; handled taps
bleiben erhalten. iOS-KAV-padding und Androids vorhandenes adjustResize bleiben.
iOS erhält keinen zusätzlichen Footer-Inset; normales Spacing und 1:1.4 bleiben.

Bei Breite unter 360 oder fontScale über 1.3 stehen die Aktionen untereinander.
Lokale Mindesthöhe 48 und automatische Höhe ersetzen für diese Aktionen die
feste Höhe. Shared AnyvoButton, Labels und Datenpfade werden nicht geändert.
Speichern, Notizen, Scoring, GPS, Recovery, Medien und Export behalten ihre
vorhandenen Handler/Inhalte. Keine Änderungen an Persistenz oder Berechtigungen.

## Native Berichtsevidenz aus 04

04 meldet nach eigener Read-only-Prüfung des AAB 1.0.4(45), EAS3406f59a:
target/compileSDK36, min24, MainActivity adjustResize (0x10), edge-to-edge aktiv,
Expo54.0.36/RN0.81.5/safe-area-context5.6.0, ExpoRoot-SafeAreaProvider vorhanden.
Keine app-eigenen WindowInsets-Consumer oder Gesteninterception gefunden.
SafeArea5.6 verwendet Systemleisten-Insets ohne IME. Kein neuer nativer Build
aus diesem Befund nötig. Dies ist Berichtsevidenz; 07 hat das AAB nicht selbst geprüft.
04 hat anschließend den konkreten Diff read-only geprüft: keine blockierenden
Native-/Keyboard-/Layout-Findings. Kein eigener Testlauf oder Geräte-PASS durch 04.

## Selbst ausgeführte Prüfungen

- Jest: 4 Suites, 31 unterschiedliche Tests PASS: TrackEvaluationLayout (5),
  TrackExportActions (11), evaluation-screen-consistency (12),
  evaluation-conditions-layout (3).
- Neue Regressionen: Android-Edge-Vertrag und Footer außerhalb Scroll; vorhandene
  Save/Logbook-Callbacks; Save während loading gesperrt; schmaler Bildschirm und
  große Schrift erhalten bearbeitete Notiz; iOS-Keyboardstrategie und Row-Proportionen.
- Vollständiger Typecheck `tsc --noEmit`: PASS.
- ESLint für Screen, Layout und Test: PASS, keine Meldungen.
- `git diff --check`: PASS.
- Patch rückwärts auf eigenem Stand prüfbar: PASS. `git apply --check` auf den
  sauberen aktuellen Android104/103-Release-Basen: jeweils PASS, rein lesend.
- Erstläufe scheiterten ausschließlich am neuen Testharness (Hook-Mock-Isolation
  und unvollständige lokale Renderer-Typen); korrigiert, obige Abschlussläufe grün.
- Keine Installation: vorhandene Dependencies temporär per eigenem node_modules-
  Symlink genutzt. Symlink wird vor Freeze entfernt; kein Bestandteil des Pakets.

Jest prüft den SafeArea-Edge-Vertrag, keine nachgebildete Android-Geometrie.
Kein tatsächlicher App-Lauf mit diesem Diff und keine physische Geräteabnahme.

## Offene Abnahme und Release-Gates

01 muss den Paketstand separat auf beiden aktuellen Android-Runtime-Basen
anwenden, prüfen und über die bestehenden Production-Gates veröffentlichen.
Keine C1/GSW33-WIP-Kandidaten oder andere ungeprüfte Änderungen bündeln.
Kein iOS-Publish, kein nativer Build, keine DB-Änderung im Auftrag dieses Fixes.

Geräte-QA bleibt OPEN: Android 1.0.3/1.0.4 mit 3-Button- und Gestennavigation;
Notiz-Tastatur auf/zu; normale/große Schrift und schmale/gedrehte Anzeige;
kleine verbleibende Höhe zusammen mit gestapelten Buttons und offener Tastatur;
letzter Inhalt erreichbar; Speichern und Logbuch vollständig über Systemleiste;
bearbeitete Notiz bleibt erhalten. Hochscrollen und ursprüngliche gemeldete
Blockade tatsächlich nachprüfen. OTA-ID des geladenen Standes verifizieren.
Keine Neuinstallation, kein Löschen und kein Reset vorhandener Kundendaten.

## Offizielle Grundlagen

- https://docs.expo.dev/versions/v54.0.0/sdk/safe-area-context/
- https://reactnative.dev/docs/0.81/scrollview
- https://developer.android.com/develop/ui/views/layout/edge-to-edge
- https://developer.android.com/develop/ui/views/layout/sw-keyboard

## Zuständigkeit

07: lokaler UI-Fix, Tests und unveränderliches Übergabepaket.
04: Read-only-Native-Review; Gerätebefunde klar von Codebefunden trennen.
01: alleiniger Android-Publisher mit frischen Gates und Release-/OTA-Nachweis.
