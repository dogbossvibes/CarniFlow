# P0-03 — Fährten-Domain Report (Winkel / OW-BW / GS / TS)

**Rolle:** Repository-Analyst (read-only). **Erstellt:** 2026-07-26
**Bezug:** [[P0-01_DATABASE_TRUTH_REPORT]] · [[P0-02_TRACKING_LEGACY_REPORT]]
Keine neuen Produktentscheidungen — nur Ist-Zustand aus Code + bestehender ANYVO-Doku.

---

## 1. Winkel (`AngleKind`)

### Codewerte (Quelle: `features/tracking/store/trackingStore.ts` + `utils/angleClassify.ts`)
```
type AngleKind = 'links' | 'rechts' | 'spitz_links' | 'spitz_rechts' | 'spitz' | 'absatz' | 'abriss';
```
- `links`/`rechts` = rechtwinklig (~90°); `spitz_links`/`spitz_rechts` = spitz (<90°); `spitz` = **Legacy** (Altdaten ohne Richtung); `absatz` = Start-/Endpunkt; `abriss` = diagonaler Versatz.
- `ANGLE_LABEL`/`ANGLE_SHORT` decken alle 7 Werte ab. Auto-Erkennung (`suggestAngleKind`) liefert nur `links/rechts/spitz_links/spitz_rechts`. `abriss` wird **nur manuell** gesetzt (`app/track/legen.tsx` → `addMarker('winkel',{angleKind:'abriss'})`).

### Persistenz
`track_markers.angle_kind` (remote-verifiziert, existiert). Marker werden über `trackService.ts` in `track_markers` (kanonisch, `session_id`) geschrieben.

### ⚠️ Kernkonflikt P0-03-A: Code-Werte ≠ SQL-CHECK-Constraint
Einzige `angle_kind`-Constraint im Repo — `TRACK_MARKER_ANGLE.sql`:
```sql
check (angle_kind in ('links','rechts','spitz','absatz'));
```
- Erlaubt **nur 4** Werte. Code emittiert zusätzlich `spitz_links`, `spitz_rechts`, **`abriss`**.
- **Falls diese Constraint remote so aktiv ist**, würden `spitz_links`/`spitz_rechts`/`abriss`-Marker beim Insert **fehlschlagen** (Constraint-Violation) → verlorene Winkel/Abrisse.
- **Beweislage:** `track_markers.angle_kind` existiert (200) und die Tabelle hat 140 Zeilen — aber der **CHECK-Constraint-Inhalt ist read-only NICHT prüfbar** ⇒ **BLOCKED — REMOTE DDL VERIFICATION REQUIRED**. Es ist nicht bewiesen, ob remote noch die 4-Wert-Constraint gilt oder eine erweiterte/entfernte.
- **Risiko:** hoch, falls alte Constraint aktiv; die App setzt `abriss`/Spitzwinkel-Richtungen im Normalbetrieb.

---

## 2. OW / BW

### Was Code/Doku sagen
- **Kein** `AngleKind`-Wert `ow`/`bw` im Code. Keine `track_markers`-Spalte für OW/BW. Keine Persistenz von OW/BW im Code gefunden.
- **Bestehende ANYVO-Doku:**
  - `docs/handbook-source/05_FAEHRTE_INVENTORY.md`: „**Bodenwinkel (BW, Standard 5 s)** und **Offener Winkel (OW)** sind reine Ereignisse … alle Ereignisse über **TrackEvents**, nicht über neue Tabellen." + explizit **[UNKLAR]**, wie OW/BW im Code repräsentiert werden.
  - `docs/handbook-source/11_GAPS_AND_CONFLICTS.md`: „OW/BW dokumentiert, aber **kein eigener `AngleKind`-Wert** → **[UNKLAR]**."
  - `docs/handbook-source/12_ANALYSIS_SUMMARY.md` (offener Punkt 6): „**OW/BW-Repräsentation** im Datenmodell festlegen (fehlt als eigener Typ)."
  - `docs/Faehrten_OW_BW_Implementation.md` existiert, ist aber **leer (0 Zeilen)**.

### Bewertung (kein Neuentscheid)
| Frage | Ist-Zustand |
|---|---|
| Was ist OW? | **Offener Winkel** — laut Doku ein Fährten-Ereignis (nicht näher im Code definiert). |
| Was ist BW? | **Bodenwinkel**, Doku-Standard 5 s — Fährten-Ereignis. |
| Werden OW/BW aktuell gespeichert? | **NEIN** — kein Code-Pfad, kein Feld. |
| `AngleKind` oder eigenes `TrackEvent`? | **Ungeklärt.** Doku tendiert zu „**TrackEvent**, keine neuen Tabellen". Code hat weder `AngleKind`-Wert noch ein `TrackEvent`-Konzept (Marker liegen in `track_markers`). Entscheidung ausstehend — **nicht** hier zu treffen. |

**Befund P0-03-B:** OW/BW sind dokumentiert, aber **weder im `AngleKind`-Set noch persistiert**. Offene Designentscheidung (siehe ADR-001/ADR-005).

---

## 3. GS (Gegenstände)

Quelle: `MarkerSample` (`trackingStore.ts`), `GEGENSTAND_MATERIALS` (`legen.tsx`), `trackService.ts`, `track_markers` (remote).

| Aspekt | Ist-Zustand | Persistenz (remote-verifiziert) |
|---|---|---|
| **Position** | `lat`/`lng` + `distance_from_start` | `track_markers.latitude/longitude` (200), `distance_from_start` (200) |
| **Material** | 8 Werte: `holz, duebel, stoff, leder, plastik, metall, teppich, diverses` (`MarkerMaterial`) | `track_markers.material` (200); SQL: `TRACK_MARKER_MATERIAL.sql` |
| **found** | Boolean; im **Legen** = false, in der **Absuche** → true (`markMarkerFound` in `trackService.ts`, Zeile 106) | `track_markers.found` (200) |
| **Audio** | `audio_url` am Marker (Sprachmarker/Notiz) | `track_markers.audio_url` (200) |
| **Notiz** | `note` | Spalte im Marker-Insert (nicht separat geprüft) |
| **Legephase** | Gesetzt via `placeGegenstand`/`quickAddArticle` (Volume-Taste Android, Deeplink iOS) während `phase='recording'` | `track_markers` (`marker_type='gegenstand'`) |
| **Absuche** | Wiederfinden setzt `found=true`; Absuche-Spur separat in `track_runs.run_points` | `track_runs` (200) |

### ⚠️ Kernkonflikt P0-03-C: Material-Werte ≠ SQL-CHECK (analog zu P0-03-A)
`MarkerMaterial` (Code) = **8 Werte**: `stoff, holz, duebel, leder, plastik, metall, teppich, diverses`.
Einzige `material`-Constraint im Repo — `TRACK_MARKER_MATERIAL.sql`:
```sql
check (material in ('stoff','holz','leder','plastik','diverses'));
```
- Erlaubt **nur 5** Werte. **Fehlen: `duebel`, `metall`, `teppich`** — alle drei sind in der UI-Auswahl (`GEGENSTAND_MATERIALS` in `legen.tsx`) aktiv wählbar.
- **Falls die Constraint remote so aktiv ist**, schlagen Gegenstände mit `duebel`/`metall`/`teppich` beim Insert fehl → verlorene Gegenstände.
- **Beweislage:** lokaler Code/SQL-Drift belegt; Remote-CHECK-Inhalt = **BLOCKED — REMOTE DDL VERIFICATION REQUIRED**.
- Zusätzlich: `MarkerType` kennt `verleitung`/`sprachmarker`; deren Constraint-Abdeckung ist ebenfalls unbestätigt (BLOCKED).

*(Ergänzt nach Gegenprüfung `CODEX_P0_REVIEW.md`, 2026-07-26.)*

---

## 4. TS (TrackSegment / Teilstrecken)

Quelle: `features/tracking/utils/trackSegments.ts`, `trackingStore.ts`, `trackService.ts`, `trackPersist.ts`.

| Aspekt | Ist-Zustand |
|---|---|
| **Typen** | `no_food, low_food, intensive_food, distraction, surface_change, custom` |
| **Status** | `planned → active → completed` / `cancelled` |
| **Start/Ende** | `startStep`/`endStep` (Schritte), `startCoordinate`/`endCoordinate`, `startTrackPointIndex`/`endTrackPointIndex`, `startedAt`/`completedAt` |
| **Schritte** | `plannedLengthSteps` (1–500, Default 10); Pre-Announce 3 Schritte |
| **Voice** | `voiceEnabled`; TTS-Ansagen (`plannedSegmentAnnouncement`, `segmentStart/EndAnnouncement`) via `expo-speech`, de-CH |
| **Persistenz (Supabase)** | In `training_sessions.track_data.segments` (JSON) — `trackService.ts` Zeile 156: `track_data: { ...currentTrackData, segments }`. `training_sessions.track_data` remote-verifiziert (200) |
| **Persistenz (Offline/Recovery)** | `trackPersist.PendingTrack.segments?` → **AsyncStorage**-Snapshot (optional, abwärtskompatibel) |
| **Recovery** | Segmente werden mit dem Track-Snapshot wiederhergestellt; Live-Fortschritt aus `distanceMeters`/Schritten neu berechnet |

**Befund P0-03-D:** TS ist vollständig als JSON in `training_sessions.track_data.segments` persistiert — **keine eigene Tabelle** (deckt sich mit der Doku-Linie „keine neuen Tabellen"). Es gibt **kein** normalisiertes Segment-Schema; Auswertung/Query auf Segmentebene ist damit nur über JSON möglich (Analytics-Einschränkung).

---

## Zusammenfassung P0-03

| Domäne | Status | Kritisch |
|---|---|---|
| Winkel | Code=7 Werte, SQL-Repo-CHECK=4 Werte | **P0-03-A Konflikt** (abriss/spitz_* evtl. nicht persistierbar) — DDL BLOCKED |
| OW/BW | dokumentiert, **nicht** im Code/Schema | **P0-03-B** offene Designentscheidung |
| GS | vollständig (Position/Material/found/Audio/Notiz/Phasen) | **P0-03-C Konflikt** (Material Code=8 / SQL-CHECK=5 → `duebel/metall/teppich` evtl. nicht persistierbar) — DDL BLOCKED |
| TS | vollständig als `track_data.segments` (JSON) | keine Normalisierung → Analytics-Grenze |
