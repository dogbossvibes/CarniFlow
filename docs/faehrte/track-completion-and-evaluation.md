# Tracking-Fix: Fährtenende + Bewertung Save/Reload

Zwei finalisierte, isolierte Fixes. **Keine** Änderung an Geometrie (Recall-Immediate-
Persist, EMA-Gating, turn-aware-EMA-Vorschlag), Confidence, Adaptive Confirmation,
GPS-Quality, Winkel-Schwellen, Jump-/Speed-Gates oder DB/RLS/Migrationen.

## 1. Fährtenende / Voice / UI
- **Offene Gegenstände blockieren das Track-Ende NICHT mehr.** Root Cause: ein Gegenstand
  wurde nur als „gefunden" markiert, wenn die virtuelle Hundeposition (auf der geglätteten
  Linie) ≤ 2.5 m an das eigene GPS-Marker `SearchObject.at` kam — zwei unabhängige ±3–5 m-
  Fehlerquellen → das Objekt blieb dauerhaft „offen" → `openMandatoryObjects > 0` verhinderte
  das Ende hart (reales Feldsymptom: Hund am Ende, keine Meldung).
- **Neue Logik:** `TrackEndOptions.openObjectsBlockEnd` (Default **false**). Das Ende folgt aus
  **order-aware progress (≥ 0.97) UND geom-Nähe (≤ 3 m)**. Verpasste Gegenstände werden
  **separat im Score** geführt (foundObjects/objectPts), nicht als Endsperre. Opt-in
  `openObjectsBlockEnd = true` behält das alte, blockierende Verhalten.
- **Premature-End-Schutz bleibt:** order-aware `dogProgressM` + geom verhindern ein vorzeitiges
  Ende, wenn die Fährte früher räumlich nahe am späteren Endpunkt vorbeiführt oder sich kreuzt.
- **Voice einmalig** (`Ende der Fährte erreicht.`), **Haptik einmalig**, UI-Status `reached`
  (`Fährtenende erreicht`), once-only (`completed` bleibt). **Keine automatische Finalisierung.**
- **Diagnose:** additiver Grund `triggered_open_objects` (Ende trotz offener Objekte) im
  DEV-`[endDiag]`-Log; `open_objects` nur noch bei opt-in-Blockade.

## 2. Bewertung Save / Reload
- **Fährten-Score 0–100 nur in `track_data`** (`track_data.score` / `track_data.legs` /
  `track_data.evaluated_at`). `training_sessions.rating` behält die **1–5-Semantik** (DB-Check-
  Constraint): `validSessionRating()` in allen drei Write-Pfaden (remote create, sync-Update-
  Retry, direkter `saveTrackEvaluation`) → ein 0–100-Score landet **nie** in `rating` (kein
  PGRST 23514). Normale Trainingssessions (1–5) unverändert.
- **local-first Overlay nach `evaluated_at`:** `overlayLocalEval()` überlagert beim Reload die
  neuere lokale Bewertung (legs/score/notes/evaluated_at) auf die Remote-Zeile — **stale/leere
  Remote-Daten überschreiben eine neuere lokale Bewertung nicht** (kein Rückfall auf Default/
  100 %). Ist die Remote-Bewertung neuer, bleibt sie (kein Rückschritt).
- **PGRST116 / local-first:** `getTrackSessionById` nutzt `maybeSingle()` — eine local-only
  Fährte ohne Remote-Zeile liefert still `not found` (kein console.error/LogBox); der Detail-
  Screen baut sie vollständig aus SQLite. Echte Fehler (Netz/Auth/RLS) bleiben sichtbar.

## Tests
- `features/tracking` 57 Suites / 604 PASS; `features/sync` 17 PASS; `app/track` 8/8 PASS;
  tsc PASS; ESLint clean.

## REAL DEVICE FIELD QA: OPEN
Noch auf echtem Gerät zu prüfen: Ende wird angesagt (Voice einmal, Haptik, UI-Status), kein
premature Ende, Bewertung 100→95 % bleibt, Legs bleiben, App-Neustart bleibt, späterer Sync
identisch, local-only ohne LogBox.
