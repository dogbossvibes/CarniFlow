# TRACKING-MAP-DIRECTION-2026-10-14

Datum: 2026-10-14 · Verantwortlich: Chat 02

Worktree: `/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/anyvo-tracking-map-direction`

Branch: `fix/tracking-map-direction`

Basis/HEAD: `a2361efea416badc118206f517a98875569f9561`

Status: lokal implementiert, uncommitted; Review/Integration bei Chat01 ausstehend.

## Scope und Ergebnis
Kartenanzeige beim Legen und Absuchen. Die vorhandene Laufrichtungssteuerung verwendete getrennte Follow-Zustände; ihr Effekt reagierte nicht unmittelbar auf Modus-/Neigungswechsel oder das Anhängen der Karte. Diese Übergänge sind jetzt synchronisiert und lösen eine gezielte Kamerafahrt auch ohne neuen GPS-Fix aus.

Laufrichtung/Nord/Frei sowie pausierte Nachführung sind sichtbar. Follow-Schalter, Moduswahl und Wiederaufnahme steuern dieselbe tatsächlich wirksame Nachführung. Eine manuelle Kartengeste pausiert weiterhin ohne automatisches Zurückspringen. Wiederaufnahme aus Frei wählt Laufrichtung. Explizite Steueraktionen umgehen die Anzeige-Drosselung und animieren direkt zur bekannten Zielrichtung; normale GPS-Updates behalten bestehende Drosselung, Glättung und Richtungsberechnung. Die bisherige Gerätekompass-Initialisierung beziehungsweise Positionsrichtungsableitung bleibt unverändert.

## Bewusste Abgrenzung
Nur TrackingMap und useSmartTrackCamera plus zugehörige Tests. Kein Recorder-/GPS-/Fusion-/Winkel-/Score-/Persistenz-/Berechtigungs-/Native-Eingriff, keine zusätzlichen Sensorabonnements. Lay und Run verwenden bereits smartFollow. Die Kamera hält eine ermittelte Richtung bei Stillstand; vor verlässlicher Bewegung kann noch keine Laufrichtung zugesichert werden. Geräteprüfung für reale iOS-/Android-Kartenanimation und Overlay-Platzbedarf bleibt OPEN.

## Prüfungen
- `node node_modules/jest/bin/jest.js features/tracking/hooks/__tests__/useSmartTrackCamera.test.tsx features/tracking/utils/__tests__/smartCamera.test.ts features/tracking/components/__tests__/TrackingMap.cameraControls.test.tsx features/tracking/components/__tests__/TrackingMap.distanceScale.test.tsx features/tracking/components/__tests__/TrackingMap.referenceOverlays.test.tsx --runInBand --silent --testTimeout=30000`: 5 Suites / 55 Tests PASS.
- Nach Bereinigung der Effect-Abhängigkeit/Imports: cameraControls erneut 1 Suite / 2 Tests PASS (Teilmenge der 55).
- Regressionen: Map-Anbindung mit vorhandener Position, Mode/Pitch ohne neuen Fix, Recenter aus Frei, Pan-Pause/Resume, Follow-Toggle, Nord/Frei/Heading-Konsistenz, bestehende Maßstab-/Referenzdarstellung.
- TypeScript `node node_modules/typescript/bin/tsc --noEmit`: PASS. ESLint für alle betroffenen TS-/TSX-Dateien: 0 Fehler, 1 bestehende Warnung (ungenutzte eslint-disable-Direktive in TrackingMap:51). `git diff --check`: PASS.

## Release / offene Abnahme
OTA-fähig; kein neues Binary und keine DB-Migration. Eigenes unabhängiges Paket, darf nach Prüfung zusammen mit Verleitungs-Flow veröffentlicht werden. Chat01 ist alleiniger Integrator/Publisher, frische iOS-/Android-1.0.4-Basen und vorherige Recovery-Korrektur erhalten. Keine Geräte-/Feldabnahme behauptet. Rücknahme durch Revert der isolierten Anzeigeänderung, ohne Nutzdatenänderung.

## Dateiliste

- `features/tracking/components/TrackingMap.tsx`
- `features/tracking/hooks/__tests__/useSmartTrackCamera.test.tsx`
- `features/tracking/hooks/useSmartTrackCamera.ts`
- `features/tracking/components/__tests__/TrackingMap.cameraControls.test.tsx`

Globale Statusdateien, fremde Worktrees, main und native Konfigurationen wurden durch diesen Auftrag nicht geändert. Temporärer node_modules-Symlink wird nicht ausgeliefert. Kein Commit, Push, Merge, OTA, Build oder Cloud-Schreibzugriff durch Chat02.

## Nachprüfung R2 — unabhängiger P2-Befund vom 14.10.

Der unveränderte externe Hook-Repro von Chat 01 zeigte: Kurs 90° → Norden 0° → Laufrichtung führte nur zu 31,5°. Ohne weiteren GPS-Fix blieb die Karte dort stehen. Explizite Steueraktionen fahren nun in einer 350-ms-Animation direkt auf die bekannte Zielrichtung. Die normale Glättung und Drosselung bei GPS-Updates bleibt unverändert. Ein zusätzlicher echter Hook-Test belegt die Glättung auf 31,5° bei normalem Kurswechsel, die Drosselung und vollständiges Recenter auf 90°.

R2-Regression: 5 Suites / 56 Tests PASS. Unveränderter externer Repro von Chat 01: 1 Suite / 1 Test PASS. Kein Recorder-, Sensor- oder Native-Eingriff. Neue R2-Patch- und Dateihashes ersetzen den bisherigen Freeze für die Integration; die alte Patchdatei bleibt als Nachweis erhalten. Geräte-QA weiterhin OPEN, keine Veröffentlichung durch Chat 02.

Finale R2-Prüfungen: TypeScript PASS, ESLint 0 Fehler / 1 bestehende Warnung, diff-check PASS.
