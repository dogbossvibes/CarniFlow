# Android Tracking P0 – gezielter Transfer

Stand: 2026-10-08. Owner: Chat 02. Lokaler Kandidat, uncommitted. Kein Release.

## Basis und Umfang

Worktree: `/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/anyvo-android-tracking-p0`.
Branch: `fix/android-tracking-p0`; unveränderte Basis/HEAD `3f44b1d2793c7241ac2305fc6e05418ab1c07069`.
Neuer Worktree war sauber. Der App-Worktree-Dienst scheiterte mit „Not a git repository“ im Projektspiegel; anschließend wurde dieser normale Git-Worktree über das reale Repository angelegt. Fremde Worktrees und globale Statusdateien unverändert. Vorhandene Dependencies per temporärem eigenem `node_modules`-Symlink, keine Installation. Für den vollständigen Typecheck wurde von main-Dependencies auf den bestehenden Export-Dependency-Baum `/Users/moyo/canisflow-worktrees/anyvo-feature-tracking-analysis-export/node_modules` gewechselt: main enthielt die bereits im Android-Baseline-Code benötigten PDF-Pakete nicht. Der erste fehlgeschlagene Typecheck war deshalb kein Produktfehler-Beleg. Der eigene Symlink wurde nach den Prüfungen entfernt; fremde Dependencies unverändert.

Dieser Diff überträgt ausschließlich belegte P0-Speicher-/Lifecycle-Korrekturen in Androids vorhandenen Inline-Lay-Processor. Kein Austausch mit der modernen iOS-Processor-Pipeline, keine GPS-Zulassungs-/Fusion-/Winkel-/Distanzschwellenänderung. Die umfassende neue Continuity-Semantik ist hier noch NICHT enthalten.

## Behobene Ursachen

- Search-Puffer sind je Session isoliert; ein fehlgeschlagener Write von A bleibt A zugeordnet. Gleichzeitige Flush-Aufrufer warten auf das reale Ergebnis und den nachfolgenden Tail. Verwerfen wartet auf den eigenen Write.
- Beide Search-Abschlusspfade warten auf dauerhaft geschriebene Punkte. Recovery darf nach fehlgeschlagenem Run-Write den gespeicherten Zustand nicht leeren; Fehlermeldung in allen fünf vorhandenen Sprachen. Die ältere Recovery-Score-Semantik ist noch nicht Teil dieses P0-Transfers und muss mit der umfassenden Continuity integriert werden.
- Lay-Puffer verwendet denselben geprüften seriellen Write-Helfer. Der Abschluss darf nach einem fehlgeschlagenen Punkt-Write nicht `saved` melden. Ein neuer Start wartet zunächst auf den vorherigen lokalen Puffer.
- Nach dem unabhängigen 04-Review: Ein verspäteter Finalize-Erfolg oder -Fehler von A darf die sichtbare Aufnahme B nicht ändern, auch bei neuer Hook-Instanz und gleichem Hund. Finish friert Session-ID, Input, Creation-Promise und Store-Ownership vor dem ersten await ein. Ein prozessweit geteilter Store-Token schützt die sichtbare Statusaktualisierung. Derselbe Hook wartet vor Wiederverwendung seiner Session-Refs auf den vorigen Finalisierungsabschluss; danach erneute Generationsprüfung.
- Stop/Unmount stößt das Schreiben des kurzen Vordergrund-Tails an und hält bei laufendem Legen den pausierten Pending-Zustand. Dies ist kein Nachweis gegen OS-Kill ohne Callback.
- Recording-/Warmup-Generationen verhindern, dass alte Permission-, Positions-, Heading- oder Native-Start-Antworten eine spätere Aufnahme verändern. Start-/Stop-Aufrufe für den globalen Hintergrundtask laufen seriell. Ein neuer Vordergrund-Fallback bleibt bei verspätetem alten Native-Start erhalten.
- Der bestehende JS-Background-Task wartet nun auf asynchrone Verarbeitung/Persistenz. Seine Callback-Referenz bleibt während eines Batches beim ursprünglichen Recorder; dessen Generation lehnt inzwischen überholte Fixes ab. Akzeptierte kurze Background-Tails werden vor Task-Abschluss geschrieben. Fehler werden als fehlgeschlagener Task weitergereicht, nicht als durable Speicherung bestätigt. Keine Behauptung einer automatischen OS-Wiederholung.

## Tests

- 4 gezielte Suites / 26 Tests PASS: bestehender Recorder-Startup, sieben Android-P0-Szenarien, Search-Persistenz und gepufferter Lay-Writer. Beleg `/private/tmp/anyvo-android-tracking-p0-tests.json`.
- Zusätzlich 1 Suite / 4 Tests PASS: Task wartet auf Write, Batch bleibt beim alten Handler, Fehler wird weitergereicht, ungebundene Fixes werden keiner fremden Aufnahme zugerechnet. Beleg `/private/tmp/anyvo-android-tracking-p0-task.json`.
- Zusätzlich **3 Suites / 16 Tests PASS** für normale Search-Finalisierung und Recovery einschließlich Fehler-Gates, `/private/tmp/anyvo-android-tracking-p0-finish.json`. Der bestehende Quelltext-Vertragstest nutzt die tatsächliche Funktionsgrenze statt eines starren Zeichenausschnitts.
- Nach dem Finalize-Fix erneute **2 Suites / 20 Tests PASS**, `/private/tmp/anyvo-android-p0-finalization-tests.json`: zehn Android-P0- und zehn bestehende Startup-Tests. Neue Fälle: später Erfolg/Fehler von A nach neuem Hook B mit gleichem Hund und neue Aufnahme im selben Hook wartet auf A. Die übrigen sechs unveränderten Suites bleiben mit ihren oben angegebenen Belegen erhalten. Damit **8 verschiedene gezielt geprüfte Suites / 49 Tests**, kein neuer gemeinsamer Acht-Suite-Lauf. Die Charakterisierungstests von 04 bleiben unverändert im QA-Worktree und belegen den alten Fehlerstand; diese neuen Tests prüfen das gewünschte Verhalten.
- ESLint für den gesamten Änderungsscope **0 Fehler / 6 Warnungen** in zwei disjunkten Prüfgruppen (vorhandene Hook-/Directive-/import-first-Stellen). Zusätzliche neue Native-Testdatei: 0 Fehler / 0 Warnungen.
- Letzter Finalize-Delta ESLint **0 Fehler / 0 Warnungen**, `/private/tmp/anyvo-android-p0-finalization-lint.log`; obige Gesamt-Warnungen bleiben unverändert.
- `git diff --check` PASS.
- **Vollständiger Typecheck nach allen Änderungen einschließlich Finalize-Fix PASS, Exit 0**, `/private/tmp/anyvo-android-p0-finalization-typecheck.log`. Vorheriger Beleg: `/private/tmp/anyvo-android-tracking-p0-typecheck-complete.log`, eigener Cache unter `/private/tmp`. Keine neue breite Jest-Prüfrunde.

04 hat den Finalize-Fix eng lesend nachgeprüft und für diesen Fix keine weiteren wesentlichen Befunde gemeldet. Kein zusätzlicher Geräte- oder Vollsuiten-PASS.

## Verifikationsgrenzen und Release

Keine physische Android-/Sperrbildschirm-/GNSS-/Shelly-Abnahme; keine verbundenen Geräte durch diesen Auftrag geprüft. Nach komplettem JS-Prozessverlust ohne registrierten Recorder verarbeitet diese ältere Pipeline ungebundene Hintergrundpunkte weiterhin nicht. Das ist durch diesen Diff nicht als gelöst markiert. Search-Background-Quelle ebenfalls separat offen.

JS-/TS-Änderungen verwenden vorhandene APIs; kein neuer nativer Code, kein Build- oder Schemawechsel durch diesen Diff. Android Runtime 1.0.3 und der separate native 1.0.4(45)-Auftrag von 01 benötigen getrennte Kompatibilitäts-/Integrationsprüfungen. Dieser Kandidat gehört nicht automatisch zum neuen Build. OTA ausschließlich über Chat 01 nach aktuellem Preflight, tatsächlicher Sourceintegration und Tests. Keine Runtime-Versprechen aus allein bestandenem Mock-Test.

Der zuerst übergebene Patch SHA256 `5b512dbffe3077716812bc379b4c0b5ec5edc4361fb5ba95a8951d1504265cab` ist wegen des Finalize-Reviewbefunds zurückgezogen. Ausschließlich den neu erzeugten Patch samt Manifest verwenden.

Kein Commit, Push, Merge, OTA, Build, Prebuild, Store-Schritt oder Live-DB-Eingriff.

## Dateien

- `app/track/__tests__/run-point-persistence.test.ts`
- `app/track/__tests__/run-recovery-analytics-gap.test.ts`
- `app/track/run.tsx`
- `docs/agent/tasks/TRACKING-ANDROID-P0-2026-10-08.md`
- `features/tracking/hooks/__tests__/useTrackRecorder.androidP0.test.tsx`
- `features/tracking/hooks/useTrackRecorder.ts`
- `features/tracking/native/__tests__/backgroundLocationTask.persistence.test.ts`
- `features/tracking/native/backgroundLocationTask.ts`
- `features/tracking/store/__tests__/searchPersist.test.ts`
- `features/tracking/store/searchPersist.ts`
- `features/tracking/utils/__tests__/bufferedPointWriter.test.ts`
- `features/tracking/utils/backgroundTransitionQueue.ts`
- `features/tracking/utils/bufferedPointWriter.ts`
- `features/tracking/utils/layRecorderOwnership.ts`
- `i18n/de-CH.ts`
- `i18n/gsw-CH.ts`
- `i18n/locales/en.ts`
- `i18n/locales/fr.ts`
- `i18n/locales/it.ts`
