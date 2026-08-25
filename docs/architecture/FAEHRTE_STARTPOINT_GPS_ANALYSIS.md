# FÄHRTE — Startpunkt-Rückkehr / GPS-Fehleranalyse

**Rolle:** Repository-Analyst (read-only). **Erstellt:** 2026-07-26
**Kein** Code geändert, keine Migration, kein Commit/Push. Alle Aussagen mit Datei:Zeile belegt.
**Bezug:** [[P0-05_GPS_PIPELINE_REPORT]] · [[P0-06_OFFLINE_TRUTH_REPORT]]

---

## 0. Kurzfazit (Root Causes)

| # | Root Cause | Beweis | Schwere |
|---|---|---|---|
| **RC-1** | **Unrealistische Erkennungs-Schwellen:** `radiusM=1.5`, `accuracyMaxM=3`, `stableMs=2000`. Ein Fix „zählt" nur, wenn er ≤1,5 m vom Start **und** gemeldete Genauigkeit ≤3 m ist. Im Fährtengelände (Wald/Acker) meldet das Telefon real 5–45 m → `isEligible` wird fast nie `true` → **Arming feuert nie** → Suche startet nie. | `engine/startApproach.ts:20,30-33`; Widerspruch zu `hooks/useTrackRecorder.ts:36` (`MAX_ACCURACY_M=45`, „Feld unter Bäumen ~30-45 m") und `utils/gpsFilter.ts:110-112` (≤3 m = „sehr-gut", Bestfall) | **KRITISCH** |
| **RC-2** | **Kein manueller Start / kein „Jetzt starten":** Während `arming` gibt es nur „Zurück" oder Auto-Start. Feuert RC-1 nicht, ist der Nutzer **komplett blockiert** (Suche unstartbar). | `app/track/run.tsx:461-489` (Arming-Overlay ohne Start-Button); Aktionen disabled bei `arming` (`run.tsx:497,505`) | **KRITISCH** |
| **RC-3** | **Provider-Wechsel zwischen Phasen:** Legen nutzt `positionSource` → **natives Precision-Modul**; Rückkehr nutzt **direkt `expo-location.watchPositionAsync`**. Andere Genauigkeits-/Glättungscharakteristik; auf iOS ohne erneutes `requestTemporaryFullAccuracy`. | Legen: `utils/positionSource.ts:78-79`, `positionStream.ts:39-55`; Rückkehr: `hooks/useStartPointApproach.ts:42-53` | **HOCH** |
| **RC-4** | **Start empty ⇒ Erkennung wird still übersprungen:** Startpunkt = `snap.laidLatLng[0]` aus dem Zustand-Store. Nach App-Neustart während der Liegezeit ist der Store leer, `decideRecovery` triggert nur bei `status==='searching'` (Liegezeit = `resting`) → kein Restore → `startPoint=null` → `beginSearchNow()` startet **sofort** ohne Rückkehr-Prüfung. | `run.tsx:105,156-160`; `store/searchRecovery.ts:13-17`; Anchor-Persistenz vorhanden aber ungenutzt: `store/trackPersist.ts:33` | **MITTEL** |
| **RC-5** | **Keine Stale-/Outlier-Absicherung im Rückkehr-Watch:** kein `loc.timestamp`-/Alters-Check (nutzt `Date.now()`), kein Ausreißer-/Speed-Filter, keine „N aufeinanderfolgende valide Fixes"-Logik über die reine `stableMs`-Zeit hinaus. Ein erster **cached last-known** Fix kann Distanz/Arming verfälschen. | `hooks/useStartPointApproach.ts:44-51` (nutzt `Date.now()` statt `loc.timestamp`; keine Outlier-Prüfung) | **MITTEL** |

**Primär:** RC-1 (+ RC-2 als fehlender Ausweg). RC-3/4/5 verschärfen bzw. erzeugen Zusatzfehlbilder.

---

## 1. Startpunkt — Speicherung & Format

- **Stabilisierter Anker** `StartAnchor { lat, lng, accuracy, t }` — `store/trackingStore.ts:37-42, 89`.
- Berechnung beim Legen (Start-Lock-Phase, Median aus guten Warmup-Fixes):
  `hooks/useTrackRecorder.ts:262-314` — Anker aus ≥`START_ANCHOR_MIN_FIXES=4` Fixes mit `accuracy ≤ START_ANCHOR_MAX_ACC_M=20 m` (`useTrackRecorder.ts:71-72,272-277`); bei Freigabe wird der Anker als **erster Linienpunkt** `p0 (cumDist=0)` gesetzt (`useTrackRecorder.ts:314`).
- **Konsequenz:** `trackPoints[0] == StartAnchor`. Persistenz: `store.startAnchor` (`trackingStore.ts:288`) und Offline-Snapshot `PendingTrack.startAnchor` (`store/trackPersist.ts:33`), sowie remote in `training_sessions`/`track_points` (kanonisch).
- **ABER für die Rückkehr genutzt wird nicht `startAnchor`, sondern** `snap.laidLatLng[0]` (`run.tsx:105`) = erster Punkt aus dem **Live-Store-Snapshot** (`run.tsx:72-83`). Koordinaten sind identisch zum Anker, **hängen aber am Store-Zustand** (siehe RC-4). Der persistierte `startAnchor` wird beim Rückkehr-Pfad **nicht** als Fallback herangezogen.

## 2. GPS-Quelle des Startpunkts (beim Legen)
`positionSource.startPositionSource` (`positionSource.ts:62-104`) → `positionStream.startPositionStream` (`positionStream.ts:20-56`): Priorität **externes BLE** → **natives Precision-Modul** (`precisionLocationClient.onLocation`, `mode:'tracking_dog_sport'`) → **expo-location-Fallback** (`positionSource.ts:85-102`). Der Anker entsteht also i. d. R. aus dem **nativen Modul**.

## 3. GPS-Quelle nach Ablauf der Liegezeit (Rückkehr)
**Andere Quelle:** `useStartPointApproach` öffnet einen **eigenen** `Location.watchPositionAsync({ accuracy: BestForNavigation, timeInterval: 1000, distanceInterval: 0 })` (`useStartPointApproach.ts:42-53`) — **kein** `positionSource`, **kein** natives Precision-Modul, **kein** BLE. → RC-3.

## 4. Lifecycle des Location-Listeners nach dem Timer
- **Liegezeit** (`app/track/liegen.tsx`): rein zeitstempelbasiert (`Date.now()`), **kein** GPS-Listener aktiv (App darf in den Hintergrund; `liegen.tsx:122,180`). Der Lege-Recorder wurde bei `onStop` beendet (`legen.tsx` → `rec.finish`), d. h. **zwischen Legen und Rückkehr läuft gar kein GPS**.
- **Betreten von `run.tsx`:** `useStartPointApproach` startet **neu** einen expo-Watch, sobald `active=arming && start!=null` (`useStartPointApproach.ts:30-57`). Cleanup bei Unmount/Deps-Änderung: `sub?.remove()` (`:56`).
- **Neu gestartet:** ja (frischer Watch). **Beendet:** beim Wechsel `arming→false` (Start der Suche) via Effekt-Cleanup. **Cached/stale:** möglich beim allerersten Fix (RC-5).
- **Nach Auto-Start** übernimmt `useSearchRecorder` die Aufnahme über `positionSource` (`useSearchRecorder.ts:14,338`) — wieder das native Modul. Es gibt also **zwei aufeinanderfolgende** Watches (expo für Arming → positionSource für Suche), die sauber getrennt sind, aber unterschiedliche Provider nutzen (RC-3).

## 5. Vollständige Rückkehr-/Start-Logik (Fundstellen)
- Startpunkt: `run.tsx:104-105`
- Arming aktivieren: `run.tsx:156-160` (`if (startPoint) setArming(true); else beginSearchNow()`)
- Live-Distanz + Genauigkeit: `useStartPointApproach.ts:48-51`
- Arming-Reducer (Radius/Stabilität/Genauigkeit): `engine/startApproach.ts:30-50`
- Auto-Start bei „armed": `run.tsx:163-165`
- Suche wirklich starten: `run.tsx:136-151` (`beginSearchNow` → `s.start()`, Status `searching`, `startTrackRun`)
- Arming-UI/Anzeige: `run.tsx:461-489`

## 6. Distanz-Schwellen (alle)
| Zweck | Wert | Fundstelle |
|---|---|---|
| **Start-Radius (Rückkehr)** | **1.5 m** | `startApproach.ts:20` |
| Stabilitätsdauer im Radius | 2000 ms | `startApproach.ts:20` |
| Lege-Linien-Distanz-Gate | 2.0 m (`MIN_STEP_M`) | `useTrackRecorder.ts:38` |
| Anker „echte Bewegung" | 3.5 m (`START_MOVE_MIN_M`) | `useTrackRecorder.ts:73` |
| Distanzfunktion | Haversine (Meter) | `gpsFilter.ts:23` (`calculateDistance = distanceM`) |

**→ Frage 7 (unrealistisch kleine Schwelle): JA.** Der Start-Radius **1,5 m** liegt **unter** dem eigenen Linien-Distanz-Gate (2,0 m) und weit unter der real gemeldeten Genauigkeit. Kombiniert mit `accuracyMaxM=3` ist die Bedingung im Feld praktisch unerfüllbar (RC-1).

## 7. Accuracy-Filter
| Aspekt | Rückkehr (`startApproach`/Hook) | Legen (`useTrackRecorder`) |
|---|---|---|
| max. akzeptierte Accuracy | **≤ 3 m** (`accuracyMaxM`, `startApproach.ts:20,32`) | **≤ 45 m** für Linie (`MAX_ACCURACY_M=45`, `:36,365`); Anker ≤ 20 m (`:72`) |
| horizontalAccuracy | `loc.coords.accuracy` (`useStartPointApproach.ts:47`) | via Sample `accuracy` |
| stale/timestamp | **keiner** (nutzt `Date.now()`, `:49`) | Speed-Gate via `t`-Delta (`:369-370`) |
| speed | **keiner** im Rückkehr-Pfad | `MAX_SPEED_MPS=12` (`:37,370`) |
| heading | ungenutzt | separat `watchHeadingAsync` |
| Outlier/Glättung | **keine** (Rohfix) | EMA/Puck + Speed/Distanz-Gate (`:338-378`) |

**Widerspruch:** Die App stuft ≤3 m selbst als „sehr-gut"/Bestfall ein (`gpsFilter.ts:110`), verlangt aber genau diesen Bestfall zwingend für die Rückkehr-Erkennung.

## 8. Konkurrierende GPS-Pfade
1. **Legen:** `positionSource` (nativ) + optional BLE + Background-Task (`backgroundLocationTask.ts`, expo `startLocationUpdatesAsync`) — siehe [[P0-05_GPS_PIPELINE_REPORT]].
2. **Rückkehr/Arming:** eigener `expo-location.watchPositionAsync` (`useStartPointApproach.ts:42`).
3. **Suche:** `positionSource` (nativ) via `useSearchRecorder`.
→ Innerhalb *einer* Phase kein dauerhafter Doppel-Listener; **über die Phasen hinweg** wechselt der Provider (nativ → expo → nativ). Kein einheitlicher Filter über alle Phasen (RC-3).

## 9. Single Source of Truth (laut Architektur)
Sollzustand ist **`positionSource` / `positionStream`** (nativ bevorzugt, expo-Fallback) als **einzige** Positionsquelle für die Fährtenaufnahme (`positionSource.ts:5-11`). Der Rückkehr-Pfad **verletzt** dies, indem er direkt `expo-location` anzapft.

## 10. Datenfluss je Zustand (A–D)
- **A. Legen:** nativ/BLE → `onFix` (EMA + Accuracy≤45 + Speed≤12 + Distanz≥2 m) → Store `trackPoints` → SQLite `local_track_points` + Supabase (`useTrackRecorder.ts:326-404`).
- **B. Liegezeit:** **kein GPS** (nur `Date.now()`-Timer, `liegen.tsx`). Store hält `trackPoints`/`startAnchor` **im RAM**.
- **C. Rückkehr:** eigener expo-Watch (`useStartPointApproach`) → `reduceApproach` (Radius 1,5 m / Acc ≤3 m / 2 s) → `armed` → `beginSearchNow`.
- **D. Suche:** `positionSource` (nativ) via `useSearchRecorder` → Store `searchTrackPoints` → SQLite `local_track_points(point_type='search')` → `track_runs.run_points`.

## 11. Übergänge: Listener-Austausch
- A→B: Lege-Recorder **beendet** (`rec.finish`), Background-Task gestoppt. Store bleibt im RAM.
- B→C: neuer expo-Watch (Arming). **Risiko:** RAM-Verlust bei App-Kill (RC-4).
- C→D: expo-Watch endet (`arming→false`), `positionSource` startet (Suche). Provider-Wechsel (RC-3).

## 12. iOS / Android
| Thema | iOS | Android |
|---|---|---|
| Precise Location | Beim **Legen** wird `requestTemporaryFullAccuracy` angefragt (`useTrackRecorder.ts:415`). Im **Rückkehr-Watch NICHT** → bei reduzierter Genauigkeit (Nutzer-Setting) liefert der Watch grobe Accuracy (≫3 m) → Arming unmöglich. | Fused Location; „precise" via `ACCESS_FINE_LOCATION`. Kein `requestTemporaryFullAccuracy` nötig. |
| Accuracy-Semantik | `horizontalAccuracy` (Meter, ~68 %). BestForNavigation nur mit voller Genauigkeit sinnvoll. | `Location.getAccuracy()` (Radius 68 %); Fused kann optimistisch/gedämpft sein. |
| Background | iOS: blaue Pille (`backgroundLocationTask.ts:56`) — nur Legen; Rückkehr läuft im Vordergrund. | Foreground-Service-Notification — nur Legen. |
| Cached first fix | `watchPositionAsync` kann initial last-known liefern | dito (Fused liefert oft sofort einen Cache-Fix) |

---

## 13. Empfehlung zur Reparatur (konkret, noch NICHT umzusetzen)

1. **RC-1 — Schwellen realistisch & dynamisch** (`engine/startApproach.ts`):
   - Start-Radius **dynamisch**: `radius = clamp(base + k·reportedAccuracy, min, max)`, z. B. `base=4 m`, `k=1.0`, `min=4 m`, `max=25 m`. So skaliert der Radius mit der real gemeldeten Genauigkeit.
   - `accuracyMaxM` an die Feld-Realität koppeln (z. B. **≤ 20 m**, konsistent mit `START_ANCHOR_MAX_ACC_M`) statt 3 m.
   - `stableMs` beibehalten (2 s), zusätzlich **N aufeinanderfolgende valide Fixes** verlangen (z. B. ≥3) statt nur Zeitfenster.
2. **RC-2 — Manueller „Jetzt starten"** in der Arming-UI (immer sichtbar), siehe Entwurf B.
3. **RC-3 — Einheitliche Quelle:** Rückkehr-Watch auf `positionSource`/`positionStream` umstellen (Single Source of Truth), inkl. iOS `requestTemporaryFullAccuracy`.
4. **RC-4 — Anchor-Fallback:** Startpunkt aus **persistiertem `startAnchor`** (`PendingTrack.startAnchor` / Supabase `track_points[0]`) laden, wenn der Store leer ist; Recovery-Bedingung um `resting` erweitern **oder** Startpunkt unabhängig vom Recovery-Zweig beziehen.
5. **RC-5 — Fix-Hygiene:** `loc.timestamp` prüfen (Fix älter als z. B. 5 s ablehnen), ersten last-known-Fix verwerfen, einfacher Ausreißerfilter (Sprung > plausibler Speed).
6. **Anzeige:** gemeldete Genauigkeit + benötigten Radius live zeigen (teilweise vorhanden: `run.tsx:469,482`), plus „Start möglich ab ±X m".

---

## 14. Entwürfe (Design, keine Implementierung)

### A) Automatische Startpunkterkennung (robust)
- Quelle: `positionSource` (nativ, iOS full-accuracy angefragt).
- Startpunkt: persistierter `startAnchor` (Fallback Supabase `track_points[0]`), unabhängig vom Store-RAM.
- Eligibility: `distanceToAnchor ≤ dynRadius(reportedAcc)` **und** `reportedAcc ≤ accCap(z. B. 20 m)`.
- Arming: ≥N valide Fixes in Folge **und** ≥`stableMs` im Radius; einmal armed → bleibt armed.
- Anti-Stale: `now - loc.timestamp ≤ 5 s`; erster Fix nach Watch-Start verworfen.
- UI: Live-Distanz, `dynRadius`, gemeldete Accuracy, „im Bereich – halten…".

### B) Button „Jetzt starten" (manueller Sofortstart)
- Immer sichtbar im Arming-Overlay (`run.tsx:461-489`), ruft `beginSearchNow()` direkt.
- Zwei Varianten: (1) **unbedingt** (Nutzer bestätigt „bin am Ansatz"), (2) **empfohlen erst**, wenn `withinRadius` oder Accuracy plausibel — sonst mit kurzer Bestätigung („GPS ungenau — trotzdem starten?").
- Löst die Blockade aus RC-2 unabhängig von RC-1.
- Kein Einfluss auf die Auto-Erkennung; beide Wege enden in `beginSearchNow()`.

### C) Optimale GPS-Aufzeichnung über die gesamte Fährte
- **Eine** Quelle (`positionSource`) über alle Phasen (A–D); Provider-Sprünge vermeiden.
- iOS: einmalig `requestTemporaryFullAccuracy` je Phase mit GPS.
- Konsequente Nutzung der **gemeldeten `horizontalAccuracy`** für alle Gates (kein fixer 3-m-Wert).
- Plausibilisierte TrackPoints: Speed-Gate, Ausreißer-/Stale-Filter, EMA-Glättung (im Legen bereits vorhanden — für Rückkehr/Suche vereinheitlichen).
- Klare, durchgängige Anzeige der aktuell gemeldeten GPS-Genauigkeit (Ampel `gpsFilter.getGpsQuality`).

> **Wichtig (Genauigkeit):** **20 cm sind mit reinem Smartphone-GPS NICHT garantierbar.** Realistisch sind je nach Gerät/Umgebung ~3–15 m (offen) bis 15–45 m (Wald), vgl. `useTrackRecorder.ts:36`. Die Erkennung MUSS die **gemeldete** `horizontalAccuracy` berücksichtigen und den Start-Radius dynamisch daran koppeln. Sub-Meter-Genauigkeit wäre nur mit **externem RTK/BLE-GPS** erreichbar (BLE-Pfad existiert: `lib/trackRecorder.ts`/`positionStream.ts:24-35`) und sollte, falls verbunden, bevorzugt genutzt und in der UI kenntlich gemacht werden.

---

## 15. BLOCKED / nicht read-only prüfbar
- Reales Geräteverhalten (gemeldete Accuracy iOS/Android im Feld), Cache-Fix-Verhalten, Provider-Umschaltzeiten — nur per Gerätetest/Debug-Panel (`PrecisionDebugPanel` vorhanden) verifizierbar.
- Native-Modul-Interna `modules/anyvo-precision-location` (nicht Teil dieser Analyse).
