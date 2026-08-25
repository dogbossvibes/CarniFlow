# FÄHRTE — Startpunkt-Rückkehr / GPS — Fix-Report

**Rolle:** Implementierung. **Erstellt:** 2026-07-26
**Grundlage:** [[FAEHRTE_STARTPOINT_GPS_ANALYSIS]]
**Kein Commit, kein Push, keine DB-Migration, keine neue parallele GPS-Engine.**

---

## 1. Root Causes (adressiert)
| # | Root Cause | Status |
|---|---|---|
| RC-1 | Unrealistische Fix-Schwellen (`radius 1.5 m`, `acc ≤ 3 m`) → Arming feuert nie | ✅ behoben (dynamischer Radius + Accuracy-Cap 12 m) |
| RC-2 | Kein manueller Start → Nutzer blockiert | ✅ behoben (Button „Jetzt starten" + Override) |
| RC-3 | Provider-Mismatch (Legen nativ / Rückkehr expo) | ✅ behoben (Rückkehr nutzt `positionSource`) |
| RC-4 | Startpunkt nach App-Neustart weg → stiller Sofortstart | ✅ behoben (StartAnchor-Fallback + kontrollierte Recovery) |
| RC-5 | Keine Stale-/Outlier-Absicherung | ✅ behoben (Alter, Sprunggeschwindigkeit, N-Fix-Logik) |

## 2. Tatsächlich geänderte Dateien
- `features/tracking/engine/startApproach.ts` — reine Logik neu (dynamischer Radius, N gültige Fixes, Stale/Outlier, `classifyManualStart`, `StartMode`, benannte Konstanten).
- `features/tracking/hooks/useStartPointApproach.ts` — GPS-Quelle auf `positionSource` umgestellt (Single Source), iOS `requestTemporaryFullAccuracy`, Stale-/Sprung-Vorfilter, neuer State (`radiusM`, `fixesRemaining`).
- `app/track/run.tsx` — Button „Jetzt starten" + Override-Dialog, `startMode`-Runtime-State, StartAnchor-Fallback, kontrollierte „kein Startpunkt"-Recovery, verbesserte Statusanzeige.
- `features/tracking/engine/__tests__/startApproach.test.ts` — Tests neu (18 Fälle).

**Nicht geändert:** `useTrackRecorder` (Lege-Filter/`onFix`), `positionSource`/`positionStream`/`precisionLocationClient`/natives Modul, `useSearchRecorder`-Aufnahme, `trackService`/`localTrackRepository`/`features/sync`, `trackingStore`-Recording.

## 3. Alte vs. neue Logik
### Startpunkt-Erkennung
| | Alt | Neu |
|---|---|---|
| Radius | fix **1.5 m** | **dynamisch** `clamp(acc·1.5, 3, 12)` m |
| Accuracy-Cap | **≤ 3 m** | **≤ 12 m** (`MAX_APPROACH_ACCURACY_M`) |
| Start-Bedingung | `within` für `stableMs=2000` | **≥ 3 aufeinanderfolgende gültige Fixes** (`REQUIRED_CONSECUTIVE_FIXES`) |
| Stale/Outlier | keiner | Alter ≤ 5000 ms (`MAX_LOCATION_AGE_MS`), Sprung ≤ 12 m/s (`MAX_JUMP_SPEED_MPS`) |
| Ausreißer | — | ein ungültiger Fix setzt den Zähler zurück |

Beispiele (dynamischer Radius): acc 2→R 3 m · acc 4→R 6 m · acc 7→R 10.5 m · **acc 15→abgelehnt**.

## 4. GPS Provider vorher/nachher
| Phase | Vorher | Nachher |
|---|---|---|
| Legen | `positionSource` (nativ/BLE, expo-Fallback) | unverändert |
| **Rückkehr** | **`expo-location.watchPositionAsync`** (eigener Pfad) | **`positionSource`** (dieselbe Abstraktion) |
| Absuche | `positionSource` | unverändert |
→ Ein einheitlicher Positions-Pfad über alle Phasen; kein zweiter GPS-Stack. Plattform-Fallback bleibt **innerhalb** `positionSource` gekapselt.

## 5. Start-Recovery (RC-4)
Startpunkt-Auflösung in `run.tsx`:
1. Runtime: `snap.laidLatLng[0]` (== `StartAnchor`)
2. **Fallback:** persistierter `PendingTrack.startAnchor` (`loadPending`)
3. sonst: **kontrollierter Dialog** „Startpunkt nicht gefunden" (Zurück / Trotzdem starten) — **kein** stiller Sofortstart mehr.

## 6. „Jetzt starten"-Verhalten (RC-2)
- Button immer im Arming-Overlay sichtbar.
- `classifyManualStart(distanceM, accuracy)`:
  - **innerhalb** dyn. Radius → sofort `beginSearchNow('manual-at-start')`.
  - **außerhalb/unbekannt** → Dialog „Noch nicht am Startpunkt · ca. X m" → „Trotzdem starten" ⇒ `beginSearchNow('manual-override')` (bewusste Aktion; markiert **nicht** als bestätigten GPS-Startpunkt).
- `startMode` (`automatic` | `manual-at-start` | `manual-override`) als **Runtime-State** (kein DB-Feld).

## 7. Statusanzeige (Phase 8)
Während Rückkehr: Distanz + gemeldete Genauigkeit, z. B. „Startpunkt 7 m entfernt · GPS ±4 m"; bei zu grober Genauigkeit „GPS wird stabilisiert … ±12 m"; im Radius „Ansatz erreicht – kurz halten… (n)". **Keine cm-Präzision** vorgetäuscht.

## 8. Tests
- **Neu** `startApproach.test.ts`: 18 Fälle — dyn. Radius, isEligible (acc 2/2.5 ✓, 4/5 ✓, 4/8 ✗, 15 ✗), stale ✗, Ausreißer-Reset, 1 Fix→kein Start, 3 Fixes→Auto-Start, `classifyManualStart` innerhalb/außerhalb/unbekannt.
- **Voll:** `tsc --noEmit` grün · `jest --runInBand` **331/331** (32 Suites) · `eslint` geänderte Dateien **0 Errors** (13 Warnings, alle vorbestehende Muster: `require`/Import-Reihenfolge in `run.tsx`, `start?.lat/lng`-Dep-Pattern im Hook).
- **Nicht unit-getestet (Screen-Ebene):** Fall 8 (Anchor-Fallback nach Runtime-Verlust) und Fall 11 (Override startet Suche) sind in `run.tsx` implementiert; die zugrundeliegende Entscheidungslogik ist über `classifyManualStart`/`reduceApproach` getestet. Empfehlung: Gerätetest.
- **iOS/Android Build:** statische Verifikation (TS + 331 Tests) bestanden; ein interaktiver Simulator-/Emulator-Durchlauf des Rückkehr-Flows wurde in diesem Pass **nicht** ausgeführt (erfordert vollständigen Lege→Liegezeit→Rückkehr-Ablauf am Gerät) → als Gerätetest empfohlen.

## 9. Offene Risiken
- Reale Feld-Genauigkeit unter Bäumen kann > 12 m sein → Auto-Start wird dann bewusst blockiert; der **manuelle „Jetzt starten"** ist dafür der vorgesehene Ausweg.
- `positionSource` im Arming benötigt kurze Warmup-Zeit (native Engine) → erste Sekunden ggf. „GPS wird gesucht…".
- `startMode` ist Runtime-only (nicht persistiert) — bewusst, keine DB-Migration.

## 10. Unterschiede iOS/Android
- **iOS:** `requestTemporaryFullAccuracy('TrackingDogSportPrecision')` jetzt auch im Rückkehr-Pfad (wie beim Legen) → bei reduzierter Ortungsgenauigkeit wird volle Präzision angefragt.
- **Android:** höchste Genauigkeit über `positionSource`/native Engine (`BestForNavigation`); Fused-Location-Charakteristik unverändert.
- Beide: gemeldete `horizontalAccuracy` steuert dynamischen Radius + Anzeige; Stale-/Sprungfilter plattformunabhängig.

## 11. Bestätigungen
- ✅ **keine DB-Migration**
- ✅ **keine neue parallele GPS-Engine** (Rückkehr nutzt bestehende `positionSource`)
- ✅ **keine Änderung an fremden Produktbereichen** (nur Fährten-Startpunkt/GPS-Rückkehr)
- ✅ **kein Commit / kein Push**
- ✅ 20 cm werden **nicht** als garantierbare Genauigkeit behandelt — Logik arbeitet mit gemeldeter `horizontalAccuracy`.
