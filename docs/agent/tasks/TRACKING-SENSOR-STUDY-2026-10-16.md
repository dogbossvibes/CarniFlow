# Tracking – Studienpunkte 1–3, 2026-10-16

## Auftrag und Ergebnisstand

Zeitbezug/Sensorintegration, Gerätebewegung versus GPS-Winkel und GPS-Ausreißer/kurze Schenkel systematisch prüfen. FGO bleibt eine getrennte Untersuchung. Lokale, belegte Schutzkorrekturen; keine Änderung der Winkel-, GPS-Zulassungs- oder Bewertungsschwellen. Kein Feld-PASS und kein vollständiger Abschluss der nativen Sensorqualität.

Arbeitsstand: `fix/tracking-sensor-study`, eigener Worktree `anyvo-tracking-sensor-study` im ANYVO-Projektverzeichnis. Basis/HEAD `f5557a8b6bb67c03ab80447f6beb146cc622e725` (veröffentlichte iOS-1.0.4-Gruppen-/Trainingsbasis). Änderungen uncommitted. Main und fremde Änderungen unangetastet. Vorhandene Dependencies lesend verwendet; keine Installation. Keine Veröffentlichung, kein Commit/Push/Merge, kein Build, keine Datenbankänderung.

## 1. Zeitbezug, Sensorverfügbarkeit und Lebenszyklus

### Tatsächlicher Datenfluss

- GPS: PositionSource → Fix-Zulassung → Recorder. Search wertet nach der GPS-Zulassung optional Motion aus; Motion kann Stillstand/Ausreißer plausibilisieren, erzeugt aber keine eigene Position.
- Search: `motionClient.onSample` → bisher zeitstempelloser letzter Motion-Wert → `evaluateFusion`, Start-Acquisition und Analytics. Der letzte Wert konnte nach Ausfall des Sensors beliebig lange weiterwirken.
- Lay: produktiver `useTrackRecorder.startWarmup` → nativer Motion-Listener → `MotionEvidenceBuffer` → Geometriestart und Winkel-Fusion. Es handelt sich nicht mehr um einen unverdrahteten QA-Prototyp.
- Native Quelle: eigenes `modules/anyvo-motion`, iOS Core Motion. Kein produktiver Android-Motion-Adapter in diesem Modul; ohne Modul bleibt GPS-only. Expo DeviceMotion ist nicht die hier verwendete Implementierung.
- Native Einheiten: Beschleunigung in g; Rotationsbetrag in rad/s; Yaw-Differenz in Grad; Schrittzahl als Delta; Kadenz in Schritten/min. Keine doppelte Beschleunigungsintegration und keine PDR-Position eingeführt.

### Reproduzierte Fehler und lokale Korrekturen

1. Search erhält Zeitstempel der Motion-Probe. Frische wird sowohl relativ zur aktuellen Uhr als auch zum jeweiligen GPS-Fix geprüft. Obergrenze 2.000 ms (acht native Standard-Aggregationsfenster à 250 ms); älter/inkompatibel bedeutet GPS-only, nicht Ablehnung des GPS-Fixes. Das ist eine konservative technische Frischegrenze, keine durch Feldmessung optimierte Schwelle.
2. Ungültige, zukünftige, doppelte und rückwärts laufende Search-Motion-Zeitstempel ersetzen keine gültige Probe. Native Bruchteile von Millisekunden werden beim Zukunftsvergleich gegenüber JS `Date.now()` berücksichtigt.
3. Start, Stop, Pause/Continuity-Unterbrechung und Unmount leeren Search-Motion. Idle-/Pause-Callbacks werden ignoriert. Neue Aufnahmen verwenden keine Evidenz der vorherigen Aufnahme.
4. Motion-Ring akzeptiert nur endliche, streng steigende Zeiten. Duplikate und verspätete Proben werden nicht nochmals als Schritte/Yaw gezählt; `clear()` ermöglicht einen neuen Lauf.
5. Lay-Callbacks und verspätete Start-Promises sind an die Warm-up-Generation gebunden. `start() === false` wird nicht als Sensorbereitschaft ausgewiesen.
6. Veraltete Kommentare zum angeblich isolierten Motion-Prototyp und zur möglichen Richtungsübersteuerung wurden korrigiert.

### Native Grenze – noch offen, nicht durch JS lösbar

`AnyvoMotionManager.swift` setzt den Aggregat-Zeitstempel beim Senden mit `Date()`. Bei leerem Device-Motion-Fenster werden Beschleunigung/Rotation als 0 gesendet. Das aktuelle Payload unterscheidet dadurch ein frisches, wirklich ruhiges Messfenster nicht zuverlässig von einem leeren Fenster. Die JS-Frischeprüfung behebt gespeicherte/verspätete Bridge-Proben, nicht dieses Problem innerhalb der nativen Aggregation.

Weiterer nativer Prüfbedarf: Messzeit statt nur Sendezeit, Anzahl gültiger Proben je Fenster, Alter/Verfügbarkeit je Sensor, explizite Laufgeneration für native Callbacks sowie serialisierter Start/Stop/Timer. Aktuelle Schritt-/Aktivitätscallbacks und Timer sind nicht durch einen gemeinsamen Generationvertrag abgesichert. Dies ist ein aus Code abgeleitetes Risiko, kein neu reproduzierter Gerätefehler. Eine native Korrektur benötigt einen neuen Build und native Tests; hier keine Swift-Änderung.

Empfohlener additiver Vertrag: `windowStartMs/windowEndMs`, `deviceMotionSampleCount`, `deviceMotionAgeMs`, `pedometerAgeMs`, eindeutige Laufgeneration und expliziter Verfügbarkeitsstatus. Alte Binaries bleiben unterstützt; fehlende Felder dürfen nicht als vorhandene Sensoren interpretiert werden. Leere Fenster dürfen keine bestätigte Stillstandsevidenz liefern. Tests: leeres Fenster, Berechtigungsablehnung, verzögerte Pedometer-Lieferung, Stop→Start→alter Callback, Timer-Neustart, Uhrsprung und Background/Resume.

## 2. Handydrehung versus gelaufener Winkel

Geprüfte Schutzgrenze: Ein reines IMU-Ereignis wird ohne GPS-Ecke nur diagnostisch erfasst (`persisted: false`). Zusätzliche Negativtests speisen ±90° und ±135° Handydrehung beim Geradeausgehen durch die tatsächlichen Motion-Lookups der Fusion, nicht nur durch den Diagnoseeingang. Bestehende Stop-/Tail-, Drift- und Bewegungsbenchmarks bleiben enthalten.

Belegte Einschränkung: Bei einer bereits vorhandenen schwachen GPS-Ecke darf starke gerichtete Motion die Richtung übersteuern (`motion_override_low_geometry`). Das aktuelle Aggregat kann eine bewusste Handydrehung während des Gehens nicht sicher von der Körperdrehung unterscheiden. Daher weder eine vollständige Trennung behaupten noch aus Yaw allein neue Ecken oder Spitzwinkel erzeugen. Spitz-/Normal-Schärfe bleibt von der GPS-Geometrie abhängig.

Keine pauschale Abschaltung bestehender Richtungsunterstützung: Sie würde auch bisher belegte Feldfälle verändern. Nächster gezielter Nachweis benötigt synchronisierte Daten mit markierten Handydrehungen, Trageposition und tatsächlichen Scheitelzeiten; nicht einfach einen lockereren Detektor.

## 3. Ausreißer, kurze Schenkel und tatsächliche FN1/FN2

Verwendet wurden die vom Nutzer zeitlich und in der Winkelreihenfolge bestätigten Aufnahmen vom 08.10., nicht die älteren gleichnamigen `realFieldV21/new/1FN/2FN`-Fixtures.

| Aufnahme | Nutzerbestätigte Folge | Aktuelle Fusion im Replay | Stand |
|---|---|---|---|
| FN1 `qa-9ca60ac3` | rechts → links | links | vollständige Folge nicht erreicht |
| FN2 `qa-80049c56` | spitz rechts → spitz links → rechts → links | links (Schärfe unaufgelöst) → rechts | vollständige Folge nicht erreicht |

Identität SHA-256:
- FN1: `7792fb56fc1a216680cda91bb78a6d11daf5673db6d3d8d85da1acf2723e6e8a`
- FN2: `aeea5644a5976c7b7673234fbe2c0b73be18dd9576f4182885eff663df53073a`

Replay vor/nach den Schutzkorrekturen vollständig identisch. Rohdaten/Fixtures nicht verändert. Relative Koordinaten werden mit derselben vorhandenen Fixture-Konvention in Replay-Koordinaten übersetzt; Motion aus Kandidatenfenstern nach Zeit dedupliziert. Diese Ausschnitte sind kein vollständiger kontinuierlicher Sensorschnitt.

Aktuelle strenge Kandidatenprüfung:
- FN1: 7× fehlendes Vorher-Fenster, 6× fehlendes Nachher-Fenster, 5× kein ausreichender Richtungswechsel. Die Fusion ergänzt eine linksgerichtete Split-Apex-Ecke.
- FN2: 12× fehlendes Vorher-Fenster, 6× fehlendes Nachher-Fenster, 13× kein ausreichender Richtungswechsel, 2 akzeptierte Kandidaten.
- FN1: 41 Rohfixes, 20 Detektorpunkte, 11 persistierte Punkte; Accuracy-Median 5,18 m.
- FN2: 56 Rohfixes, 35 Detektorpunkte, 18 persistierte Punkte; Accuracy-Median 5,285 m. Beim unaufgelösten Kandidaten: gemeldete Accuracy 11,86 m, Schenkel 6,48/3,43 m, Qualitätsstufe niedrig.

Diese Zähler betreffen Kandidaten, nicht eindeutig zugeordnete tatsächlich gelaufene Scheitel. Nutzerbestätigte Scheitelpositionen/-zeitpunkte fehlen; daher keine erfundene präzise Recall-/Precision-Messung. Fehlende Fenster und unzureichende Geometrie belegen auch nicht automatisch GPS-Ausreißer. Die Exporte enthalten 0 explizit zurückgewiesene Fixes; unterschiedliche Roh-/Detektor-/Persistenzzahlen sind nicht gleichbedeutend mit Aufzeichnungslücken.

Ergebnis: Kein belegter Anlass, anhand dieser zwei Aufnahmen GPS-Zulassung, Glättung, Kurvenschwellen oder Punktabstände zu lockern. Die vorhandenen Ausreißer-, Drift-, kurzen-Schenkel-, Continuity-, End- und Recovery-Regressionen werden mitgeprüft. Winkelzuverlässigkeit im Feld bleibt offen.

## Plattformen und Integration

Vergleich zur veröffentlichten Android-1.0.4-Basis `6b5c7fcd5f59d20467c02d33e53a2efcf1fee40e`: Fusion-Engine, Motion-Evidenz, Turn-Fusion und natives Motion-Modul sind in der Basis identisch. Die beiden Recorder-Hooks unterscheiden sich erheblich, unter anderem bei Continuity. Kein blindes Ersetzen der Android-Dateien; spätere Integration benötigt eine separate Anpassung/Regression auf der dann aktuellen Zielbasis. Kein OTA-Kompatibilitäts- oder Geräte-PASS aus diesem lokalen Testlauf ableiten.

## FGO

Getrennte Untersuchung. Keine FGO-Abhängigkeit, keine produktive Aktivierung, kein Ersatz der vorhandenen GPS-/Motion-Logik. Eine spätere Offline-Untersuchung muss reproduzierbare FN-/Negativdaten, Drift/Gaps und Ressourcenbedarf gegen die bestehende Auswertung vergleichen.

## Prüfungen

- Baseline vor Änderungen: 6 Suites / 127 Tests PASS.
- Rote Reproduktion vor Korrektur: 5 Fehler / 8 PASS (alte Motion-Proben und ungeordneter Puffer).
- Lifecycle-Zwischenprüfung: 4 Suites / 46 Tests PASS.
- Breiter Lauf: 41 Suites / 569 Tests; 39 Suites / 567 Tests PASS, 2 Fehler. Einer betraf den Enderkennungs-Test mit auseinanderlaufenden simulierten GPS-/Motion-Uhren. Die Fixture wurde auf eine gemeinsame Uhr und kontinuierlich frische Motion umgestellt; die Produkt-Endlogik blieb unverändert. Dieser Fall besteht im finalen gezielten Lauf.
- Verbleibender Altfehler: `turnFusionQa.test.ts`, ein wörtlicher Quelltextvergleich erwartet die Ausgabe ohne inzwischen vorhandenen Continuity-Indexoffset. Frisch auf unveränderter veröffentlichter Basis reproduziert: 1 Fehler / 9 PASS. Nicht durch diese Änderungen verursacht; nicht als grüner Gesamt-Suite-Lauf ausgegeben.
- Abschließend gezielt: **6 Suites / 92 Tests PASS**, einschließlich Search-Fusion, EndFix-Admission, Lay-Startup, Sample-Reihenfolge, Frischegrenzen und Turn-Fusion.
- TypeScript: **PASS** (`tsc --noEmit`, finaler Lauf Exit 0).
- ESLint für alle geänderten TS-/TSX-Dateien: **0 Fehler, 2 bestehende Warnungen** (Test-`require`, vorhandene Hook-Abhängigkeit `processor`).
- `git diff --check`: PASS.
- Testzahlen überschneiden sich und werden nicht addiert. Keine Simulator-/Geräte-/Background-Abnahme in diesem Auftrag.

Evidenz liegt unter `outputs/tracking-sensor-study/` im übergeordneten Projektverzeichnis: Baseline, rote Reproduktionen, Lifecycle-Prüfung, Regression, TypeScript, ESLint und identische FN-Replays.

## Quellen und Grenzen

Primär die tatsächlich vorhandenen Produkt-/Native-Dateien dieser Basis sowie die anonymisierten Feldfixtures und `TRACKING-FN1-FN2-FIELD-2026-10-08.md`. Die angefragten Expo-v54-Index-/DeviceMotion-Seiten leiteten beim Abruf auf die aktuelle Dokumentation weiter; sie werden nicht als v54-Verifikation ausgegeben. Apple-Seiten zu CMLogItem.timestamp und Attitude-Referenzrahmen wurden angefragt, lieferten über das Webwerkzeug nur JS-Hüllen; keine unbelegte API-Behauptung daraus abgeleitet. Das implementierte Modul ist die maßgebliche Quelle dieser Bestandsanalyse.

## Geänderte Dateien

Produktverhalten: `features/tracking/engine/trackFusionEngine.ts`, `features/tracking/hooks/useSearchRecorder.ts`, `features/tracking/hooks/useTrackRecorder.ts`, `features/tracking/utils/motionTurnEvidence.ts`. Nur Kommentarberichtigung in `features/tracking/utils/turnFusion.ts`.

Tests: `engine/__tests__/motionForFix.test.ts`, `hooks/__tests__/useSearchRecorder.fusion.test.tsx`, `hooks/__tests__/useSearchRecorder.endFixAdmission.test.tsx`, `hooks/__tests__/useTrackRecorder.startup.test.tsx`, `utils/__tests__/motionSampleOrder.test.ts`, `utils/__tests__/turnFusion.test.ts` (jeweils unter `features/tracking/`). Dazu dieser eigene Aufgabenbericht.

## Nächste sichere Schritte

1. Unabhängiges Review der lokalen Frische-/Lifecycle-Korrekturen und gezielte Übernahme auf die aktuelle Plattformbasis; vor Veröffentlichung separater Preflight über Chat 01.
2. Native Messfenster-/Laufisolation mit additivem Datenvertrag implementieren und in einem neuen Binary prüfen. Bestehendes iOS-Payload kann die verbleibende Verfügbarkeitsfrage nicht beantworten.
3. Winkeltrennung gezielt mit synchronisierten Negativdaten (Handydrehung/Tragewechsel) und markierten tatsächlichen Scheiteln prüfen. Kein behaupteter FN-Feldabschluss aufgrund synthetischer Tests.
4. FGO ausschließlich separat offline bewerten.
