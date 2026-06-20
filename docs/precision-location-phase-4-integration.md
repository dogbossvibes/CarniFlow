# Precision Location — Phase 4 (Integration in die Fährtenaufnahme)

Phase 4 verbindet die native Precision-Engine (`anyvo-precision-location`) mit der
bestehenden Anyvo-Fährtenaufnahme. Die Aufnahme nutzt jetzt die native Quelle
(mit automatischem `expo-location`-Fallback) und eine echte Filter-/Fusions-
Pipeline für Raw-Track + Clean-Track.

## Pipeline (pro GPS-Fix)

```
Quelle (BLE | Native Precision | expo-location Fallback)
  → Rohpunkt  → rawTrackPoints (Raw Track, ungefiltert)
  → evaluateTrackPoint (Genauigkeit > 25 m? Speed > 2.2 m/s? Stillstand? Drift?)
      → akzeptiert → GpsKalman-Fusion → trackPoints (Clean Track)
      → verworfen  → nur Statistik (rejectionRate)
  → motionStatus (moving / slow_moving / stationary / drift)
```

- **Quelle:** `positionStream` routet Telefon-GPS über die native Engine; ist das
  native Modul nicht im Build, greift transparent der expo-location-Fallback.
  Externes BLE-GPS hat weiterhin Vorrang.
- **Filter:** `features/tracking/precision/trackFilter.ts` (Hundesport-getunt:
  langsames Gehen, Stopps, Drift, Wald/Feld).
- **Fusion:** accuracy-gewichteter Kalman (`fusionEngine.ts`) glättet die Linie.
- **Objekt-Platzierung:** Marker werden auf den **Median der letzten ~12 s guter
  Punkte** gesetzt (`objectPlacement.ts`) statt auf den springenden letzten Fix;
  danach 3 s Drift-Schutz.

## Raw Track + Clean Track

- `useTrackingStore.rawTrackPoints` — alle Rohpunkte.
- `useTrackingStore.trackPoints` — gefilterte, gefusionte Linie (wird gespeichert).
- `useTrackingStore.gpsStats` — `rawCount`, `filteredCount`, `rejectedCount`,
  `rejectionRate`, `lastAccuracy`, `bestAccuracy`.
- `useTrackingStore.motionStatus` — aktueller Bewegungszustand.

## Debug-Panel (Aufnahme-Screen)

Im Aufnahme-Screen (`app/track/record.tsx`) gibt es unten rechts einen
**Bug-Button**. Aktiviert er den Debug-Modus:
- Die **Rohspur** wird grau/ungeglättet über die Karte gelegt (Clean-Track bleibt
  türkis) → GPS-Drift wird sichtbar.
- Ein kleines Panel zeigt: Engine (Native/Fallback), Roh-/Clean-Anzahl,
  Verwerfungsrate %, letzte Genauigkeit, Bewegungsstatus.

Kein Redesign — nur ein zuschaltbares Overlay. Satelliten-/GNSS-Details bleiben
im dedizierten Dev-Screen `anyvo://dev/precision-location-test`.

## Speicherung

- Der **Clean Track** wird wie bisher als `point_type = 'lay'` in `track_points`
  gespeichert (`finishTrackRecording`) und laufend lokal in SQLite gepuffert
  (crash-/akkusicher).
- Der Raw Track bleibt aktuell für Live-Debug/Analyse in-memory (keine DB-
  Migration) — optionale Persistenz ist ein Phase-5-Thema.

## Fallback-Verhalten

| Lage | Quelle |
| --- | --- |
| Native Modul im Build | Native Precision (Android LocationManager / iOS Core Location) |
| Kein natives Modul | expo-location (`watchPositionAsync`, BestForNavigation) |
| BLE-GPS verbunden | externes GPS (unverändert) |

Die Filter-/Fusions-Pipeline läuft in allen Fällen — unabhängig von der Quelle.

## Testen

- **Unit-Tests:** `npm test` → `features/tracking/precision/__tests__/precision.test.ts`
  deckt Accuracy-/Speed-Filter, Stillstand, Drift, Sharp-Turn, Objekt-Median und
  Fusion ab.
- **Gerät:** Dev-Build (`eas build --profile development --platform ios|android`),
  Fährte starten, langsam gehen/anhalten, Gegenstand setzen, Bug-Button für das
  Debug-Panel. Erwartung: ruhige Clean-Linie, sichtbar verrauschte Rohspur,
  steigende Verwerfungsrate bei schlechter Genauigkeit, stabile Marker-Position.
- iOS und Android funktionieren beide; ohne natives Modul automatisch Fallback.

## Bekannte Einschränkungen / Phase 5

- Raw Track noch nicht serverseitig persistiert (nur lokal/in-memory).
- Bewegungserkennung nutzt GPS-Inferenz (`sensorMotion: 'unknown'`); echte
  Sensorfusion (Accelerometer) ist optional für später.
- GNSS-Satellitendetails im Aufnahme-Debug bewusst ausgespart (separater Dev-Screen).
