# Android 1.0.4 — Verleitungsreferenz mit ehrlichen Spurabschnitten

Stand: 2026-10-14. Eigener Worktree `anyvo-tracking-distraction-android-boundaries`, Branch `fix/tracking-distraction-android-boundaries`, HEAD `d620222682ade9abc5f2d1ba1408722ba04c2f64`. Uncommitted; kein Publish/Push/Build/DB-Eingriff. Basis ist Recovery104 mit CameraR2, DistractionFlowR2, AndroidAngle31 und additivem Android-Startup-Testvertrag. Delta ausschließlich nach diesen Paketen anwenden; iOS bleibt unverändert.

## Ursache und Korrektur

Der Android-Detailadapter entfernt breakBefore bei der Lay-Projektion. Der Produktionsadapter für lokale eigene Fährten entfernt zusätzlich Punktpayloads und Session-Lay-Continuity, bevor die neue Referenz erstellt wird. Eine durchgehende Legacy-Lay-Linie würde auch bei erhaltener Metadatenmarkierung eine falsche Brücke zeichnen.

Die neue Verleitungsreferenz projiziert deshalb ausschließlich die gespeicherten Lay-Punkte und vorhandenen Grenzen (explizit, Punktpayload oder versionierte Timestamp-Metadaten). Der lokale Parent-Adapter erhält originale Punktpayloads und Session-Lay-Continuity nur für diese Referenz. Invalidierte Koordinaten werden abgelehnt, niemals entfernt und überbrückt. Keine neue zeit- oder distanzbasierte Gap-Erkennung.

DistractionScreen nutzt die neue opt-in Hauptreferenzebene, ohne die Punkte an die Legacy-Lay-Linie weiterzugeben. ParentReferenceLines zeichnet pro tatsächlichem Abschnitt eine eigene ungesmoothete Polyline. Einzelpunkte werden nicht verbunden. Hundefarbe, Start/Ende, gespeicherte Marker, Karten-Fit und Grenzen für Distanzmarkierungen bleiben verfügbar. Cache-Roundtrip erhält die Grenzen. Quelldaten werden nicht verändert.

## Prüfungen

Finaler Nachlauf: 16 Suiten / 110 Tests PASS, einschließlich aller Verleitungs-Suiten, Android-GapSafety, tatsächlicher TrackingMap-Darstellung und unverändertem externem 01-Repro. Der Produktionsadaptertest nutzt SQLite und prüft eigene Nichttransfer-Fährten sowohl mit Punktpayload- als auch Session-Timestamp-Grenzen, Cache-Roundtrip, unveränderte Quelldaten sowie fehlende Originalsession-/Syncwrites.

Vollständiger TypeScript-Check PASS. ESLint: 0 Fehler, 1 bereits bestehende unused-disable-Warnung in TrackingMap. Git diff --check PASS. Frühere Zwischenläufe 42/85 Tests überlappen; nicht addieren. Ein falscher Type-Import PolylineProps wurde vor dem finalen TSC durch MapPolylineProps ersetzt.

63 native/Compatibility-/Legacy-Dateien gegen d620222 unverändert geprüft. Recorder, TrackingStore und generisches Detailkartenmodell sind byteidentisch zum eingefrorenen Android-Winkelpaket. Search-/Transferguards, GPS-Fusion, Distanz, Bewertung, native Module, Dependencies, Runtime, Cloud/RLS und Schema werden durch diesen Delta nicht geändert. Der bestehende Parent-Cache-Revisionsschutz bleibt erhalten.

## Übergabe und Grenzen

Chat 01 bleibt alleiniger Publisher; seine unabhängige Integration, Bundle-/Runtime-/Production-Preflights sind erforderlich. Geräte-QA und tatsächliche Google-Maps-Darstellung auf einem Gerät bleiben OPEN. Keine neue Veröffentlichung behauptet. Der iOS-Release läuft unabhängig.

MASTER-Vorlage: 2026-10-14 · Android-Verleitungsreferenz · lokal korrigiert, 16/110 Tests + TSC/Lint/diff bestanden · explizite Aufzeichnungslücken in Referenzprojektion/Cache/Karte erhalten · unabhängiger 05-/01-Abschluss und OTA-Nachweis separat.

Chat05-Nachprüfung: R2-Scope PASS, alle neun Produkt-/Testhashes vor/nach identisch; 5 Suiten / 44 Tests unabhängig bestanden. Ein initialer ENOENT-Testharnesslauf wurde unverändert im korrekten Worktree wiederholt. Bericht: outputs/ANDROID-FLOW-05-BOUNDARY-R2-REVIEW-2026-10-14.json. Historisch bereits verlorene Grenzen lassen sich ohne Originaldaten nicht rekonstruieren.
