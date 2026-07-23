# 05 — Fährte Inventory (Ist-Zustand)

> Analysebericht. Ist-Zustand. **[UNKLAR]** markiert Ungesichertes.

## Zweck

Bestandsaufnahme des Fährtenmoduls: Screens, Winkel, Gegenstände, Teilstrecken, Lebenszyklus, Aktive-Fährten-Registry, Persistenz.

## Gefundene Dateien

- Screens: `app/track/index.tsx` (Übersicht), `app/track/legen.tsx` (Legen), `app/track/liegen.tsx` (Liegezeit/Vor-Absuche), `app/track/run.tsx` (Absuche), `app/track/[id].tsx` (Detail), `app/track/historie.tsx` (Logbuch), `app/track/quick-add-article.tsx`.
- Store/Persistenz: `features/tracking/store/trackingStore.ts`, `trackPersist.ts`, `searchPersist.ts`, `searchRecovery.ts`, `restingTime.ts`, `activeFaehrten.ts`, `activeFaehrtenModel.ts`.
- Service: `features/tracking/services/trackService.ts` (aktiv), `services/trackingService.ts` (LEGACY).
- Recorder/Hooks: `useTrackRecorder.ts`, `useSearchRecorder.ts`, `useTrackVoiceGuidance.ts`, `useTrackHapticGuidance.ts`, `useActiveFaehrte.ts`.
- Ereignis-Logik: `features/tracking/utils/trackSegments.ts` (Teilstrecken), `angleClassify.ts` (Winkel), `engine/turnDetection.ts`, `engine/objectPlacement.ts`.
- Komponenten: `features/tracking/components/*` (`TrackingMap.tsx`, `MarkerBottomSheet.tsx`, `LegBars.tsx`, `TrackSketch.tsx`, `PlanControls.tsx`, `ActiveFaehrteCard.tsx`, `GlobalActiveFaehrtenBar.tsx`, `FaehrtenChrome.tsx`, `LiveChrome.tsx`, `WarmupOverlay.tsx`, `PrecisionDebugPanel.tsx` …).
- Native: `faehrteLiveActivity.ts`, `liegezeitLiveActivity.ts`, `liegezeitNotification.ts`, `backgroundLocationTask.ts`.
- Doku: `docs/faehrte/05_FAEHRTE.md` (Ziel), `docs/faehrte/01_Architektur.md` (LEER), `docs/faehrte/07_SMART_ANALYSE.md`/`15_DECISIONS.md` (Stubs), `docs/Faehrten_OW_BW_Implementation.md`.

## Datenmodell (tatsächlich)

- **Session:** `training_sessions` mit `type='track'`, `category='IGP'`, `training_type='privat'`, `status ∈ {active, completed}` (`trackService.createTrackSession`).
- **GPS:** `track_points` (`point_type='lay'` bzw. Absuche über `track_runs.run_points`).
- **Winkel & Gegenstände:** `track_markers` (`marker_type`, `angle_kind`, `material`, `latitude/longitude`, `accuracy`, `distance_from_start`, `note`, `audio_url`, `found`). Store-Typ `MarkerSample` (`MarkerType='gegenstand'|'winkel'|'verleitung'|'sprachmarker'`).
- **Teilstrecken:** **nur JSON** in `training_sessions.track_data.segments` — Typ `TrackSegment` (`features/tracking/utils/trackSegments.ts`); keine eigene Tabelle.
- **Plan/Bewertung:** ebenfalls in `track_data` (`plan{}`, `legs[]`, `score`).

## Winkel (AngleKind, `trackingStore.ts`)

`'links'|'rechts'` (~90°), `'spitz_links'|'spitz_rechts'` (<90°), `'spitz'` (nur Altdaten), `'absatz'` (Start/Ende), `'abriss'` (diagonaler Versatz). Schärfe und Richtung sind getrennt modelliert. Klassifizierung: `features/tracking/utils/angleClassify.ts` + `engine/turnDetection.ts`. Laut `AI_HANDOFF.md`: automatische Erkennung nur für Winkel/Spitzwinkel; **Abriss ist manueller Button** (setzt `winkel`-Marker mit `angleKind:'abriss'`).

## Gegenstände

`MarkerType='gegenstand'` mit `MarkerMaterial ('stoff'|'holz'|'duebel'|'leder'|'plastik'|'metall'|'teppich'|'diverses')`. Stabilisierte Position via `engine/objectPlacement.ts` (`placeTrackingObject`, Median/Drift-Guard). Schnell-Gegenstand: Volume-Taste/Deeplink (`app/track/quick-add-article.tsx`, `features/tracking/quickAddArticleBus.ts`, `hooks/useVolumeKeyArticleSetting.ts`).

## Teilstrecken (`trackSegments.ts`)

Typen `no_food|low_food|intensive_food|distraction|surface_change|custom`; Status `planned|active|completed|cancelled`. Konstanten (Default 10, Min 1, Max 500 Schritte, Vorankündigung 3 Schritte). Genau **eine** `planned|active`-Teilstrecke pro Fährte (`activeOrPlannedSegment`). Kartensegmentierung `buildTrackSegmentPolylines`, Sprachansagen `searchSegmentAnnouncements`/`segment*Announcement`, Analyse `analyzeTrackSegments`. Persistenz sofort (`useTrackingStore.addSegment/updateSegment` → `persistNow`), Legacy-sicher (`coerceTrackSegments` normalisiert Altdaten ohne `segments` zu `[]`).

## Lebenszyklus & Aktive-Fährten-Registry

- `SessionStatus` (siehe Bericht 04). Eine aktive Fährte **pro Hund**; mehrere Hunde parallel je eine.
- Registry `features/tracking/store/activeFaehrten.ts` (`useActiveFaehrten`, beim Boot `hydrate()`), Modell `activeFaehrtenModel.ts`, an `dog_id` gebunden. UI: `ActiveFaehrteCard`, `GlobalActiveFaehrtenBar`. Recorder bleibt laut Memo unangetastet.
- Recovery: AsyncStorage-`PendingTrack` (hundebasiert, `trackPersist.ts`) + SQLite (autoritativ für Suchpunkte, `searchPersist.ts`/`searchRecovery.ts`).

## Tatsächlicher Datenfluss

Legen (`app/track/legen.tsx`) → `useTrackRecorder` → Store + `track_points`/`track_markers` + `track_data.segments`. Liegezeit (`liegen.tsx`) → `restingTime`/Live-Activity/Notification. Absuche (`run.tsx`) → `useSearchRecorder` → `track_runs` + `searchTrackPoints`; Abschluss → `finishTrackRun` (Session `completed`). Auswertung → `saveTrackEvaluation` (`track_data.legs/score`).

## Bestehende Abhängigkeiten

- `expo-speech` (Ansagen), Haptik (`features/tracking/utils/haptics.ts`, `lib/haptics.ts`), `expo-live-activity`, `expo-notifications`, `react-native-maps`, Farb-Tokens `constants/colors.ts` (`C.track*`).

## Aktuelle Regeln

- `docs/faehrte/05_FAEHRTE.md`: eine Fährte = ein Hund; Lebenszyklus geplant/legen/ruhend/absuchen/abgeschlossen; **alle Ereignisse über „TrackEvents", nicht über neue Tabellen**; GPS nur beim Legen/Absuchen; Bodenwinkel (BW, Standard 5 s) und Offener Winkel (OW) sind reine Ereignisse.

## Inkonsistenzen (zentral)

- **Ziel „TrackEvents" ≠ Ist:** Der Ist-Code hat **kein** einheitliches TrackEvents-Modell. Gegenstände/Winkel liegen in `track_markers`, Teilstrecken in JSON `track_data.segments`. Das dokumentierte `06_TRACK_EVENTS.md` (in `docs/00_READ_FIRST.md` referenziert) existiert nicht.
- **Zwei Fährten-Datenmodelle** (`training_sessions[type=track]` aktiv vs. `track_sessions` legacy via `services/trackingService.ts`/`types/tracking.ts`).
- **OW/BW:** In `docs/faehrte/05_FAEHRTE.md` und `docs/Faehrten_OW_BW_Implementation.md` beschrieben; im `AngleKind`-Set aber **keine** expliziten `ow`/`bw`-Werte. **[UNKLAR]** wie OW/BW aktuell im Code repräsentiert werden (evtl. über bestehende Winkel + Verhalten, nicht als eigener Typ).
- Faehrte-Doku größtenteils Stub/leer (`01_Architektur.md` 0 Bytes; `07`/`15` „...").

## Offene Fragen

- Wie werden OW und BW datenseitig unterschieden (falls überhaupt)?
- Soll das Ziel-„TrackEvents"-Modell die heutige `track_markers`+JSON-Struktur ablösen oder nur begrifflich zusammenfassen?
- Ist `services/trackingService.ts`/`track_sessions` noch irgendwo aktiv referenziert (Screens/Hooks)? → **muss verifiziert werden**.

## Technische Risiken

- Teilstrecken in JSON sind nicht relational abfragbar/aggregierbar (Smart Analyse muss die ganze Session laden).
- Divergenz Doku↔Code beim Ereignismodell erschwert das verbindliche Handbuch (Blocker, siehe Bericht 12).

## Mögliche spätere Verbesserungen

- Entscheidung dokumentieren: entweder Ist-Modell (`track_markers` + JSON) als kanonisch festschreiben **oder** echtes `track_events` einführen; Doku entsprechend angleichen.
- Legacy-`track_sessions`-Pfad entfernen/deprecaten.
