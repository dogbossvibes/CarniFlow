# FÄHRTE — Winkeltypen GW / OW / BW (Fix-Report)

**Rolle:** Implementierung. **Erstellt:** 2026-07-28
**Keine neue Winkelarchitektur, keine DB-Migration, keine GPS-Änderung, kein Commit/Push.**

## A. Winkeltypen VORHER
`links, rechts, spitz_links, spitz_rechts, spitz` (Legacy), `absatz`, `abriss` — geometrisch/auto-erkannt; Abriss manuell. Kein GW/OW/BW.

## B. War OW implementiert? **NEIN** (nur in der Doku erwähnt, 0 Code-Treffer).
## C. War BW implementiert? **NEIN.**
## D. War GW implementiert? **NEIN.**
→ Die Aufgabenannahme („bestehende OW-Darstellung erhalten") traf **nicht** zu; GW/OW/BW wurden **neu** erstellt (nach Rückfrage bestätigt).

## E. Interne `angleKind`-Werte JETZT
`links | rechts | spitz_links | spitz_rechts | spitz | absatz | abriss | gw | ow | bw` (`trackingStore.ts`). **Bestehende Werte unverändert** — Altfährten bleiben lesbar. GW=`'gw'`, OW=`'ow'`, BW=`'bw'` (bestehende String/JSON-Speicherung, keine neue Struktur/Tabelle).

## F. Geänderte Dateien
- `features/tracking/store/trackingStore.ts` — `AngleKind` um `gw/ow/bw`.
- `features/tracking/utils/angleClassify.ts` — `ANGLE_LABEL`/`ANGLE_SHORT` für gw/ow/bw + neuer reiner Dispatch `angleMarkerKind`.
- `features/tracking/components/TrackingMap.tsx` — PinMarker-Kinds `gw` (Rechteck „GW"), `bw` (Kreis „BW"), `ow` (Badge „OW") mit **messbarem Text** (Android-tauglich); Dispatch via `angleMarkerKind`.
- `app/track/legen.tsx` — „Abriss"-Button → **„Winkel"-Button** öffnet Sheet [Geschlossen (GW) · Offen (OW) · Bodenwinkel (BW) · Abriss]; generischer `placeWinkel(angleKind)`.
- `features/tracking/hooks/useTrackVoiceGuidance.ts` — Voice-Namen für gw/ow/bw.
- Tests: neu `angleTypes.test.ts`, `angleTypesStore.test.ts`.

## G. Manuelle Auswahl
Der Winkel-Button (`legen.tsx`, Steuerleiste — ersetzt den Abriss-Button, weiterhin 5 Buttons) öffnet ein kompaktes `AnyvoBottomSheet` „Winkel setzen" mit 2-Spalten-Grid: **Geschlossen (GW)**, **Offen (OW)**, **Bodenwinkel (BW)**, **Abriss** (Labels `numberOfLines={2}`, nicht abgeschnitten). Auswahl → `addMarker('winkel',{angleKind})` an der **aktuellen `currentPosition`** (keine zusätzliche GPS-Abfrage; gleicher Guard wie zuvor: Startanker + valide Position). Normale Winkel bleiben **automatisch** (kein manuelles „Normal").

## H. Darstellung normaler Winkel
**Unverändert:** Mint-Badge mit `ANGLE_SHORT` (90 L/R · SL/SR). `angleMarkerKind(links/rechts/spitz*)='angle'` → alter Pfad.

## I. Darstellung GW
**Rechteck** mit Text „GW" (`gwBox`, `C.trackBlue`) — messbarer Inhalt.

## J. Darstellung OW
Eigenes abgerundetes **Badge** mit „OW" (`owBadge`, `C.trackWarning`) — neu (keine Altdarstellung vorhanden).

## K. Darstellung BW
**Kreis** mit Text „BW" (`bwCircle`, `C.trackPurple`) — messbarer Inhalt.

## L. Darstellung Abriss
**Unverändert** (reparierter Marker: Kästchen mit „✕"-Icon). `angleMarkerKind('abriss')='abriss'` → eigener Pfad; **nie** als GW/OW/BW gerendert. `angleKind='abriss'` bleibt erhalten (Phase 8 geschützt).

## M. Persistenz
Über den bestehenden Markerpfad: Store → `PendingTrack.markers` → SQLite `local_track_markers.angle_kind` (Spalte `text`, **keine** CHECK) → Supabase `track_markers.angle_kind` (`text`). **Keine** zweite Speicherung, **keine** Migration.
> Hinweis: `TRACK_MARKER_ANGLE.sql` listet als CHECK nur `links/rechts/spitz/absatz`; die App schreibt jedoch bereits `spitz_links/spitz_rechts/abriss` erfolgreich → die Remote-CHECK ist faktisch nicht strikt. `gw/ow/bw` fügen sich hier ein. Ob remote eine strikte CHECK aktiv ist, ist read-only nicht verifizierbar (BLOCKED) — bei Bedarf per separater, additiver Constraint-Erweiterung nachziehen (keine Datenmigration).

## N. Recovery
Über `PendingTrack.markers` (MarkerSample inkl. `angleKind`) → `restorePending`/`restoreSearchSession`. Test 13 bestätigt Erhalt von GW/BW nach Recovery.

## O. Voice Guidance
`phraseFor` erweitert: GW → „Geschlossener Winkel in ca. X Schritten", OW → „Offener Winkel …", BW → „Bodenwinkel …". Distanz weiterhin über **`dogProgressM`/Bogenlänge** (keine Luftlinie), 5/10-m-Hundeführerabstand aktiv.

## P. Haptic Guidance
Unverändert: Winkel (inkl. GW/OW/BW/Abriss) = 2× Vibration, Gegenstand = 1× — kein Sub-Typ nötig; Distanz ebenfalls `dogProgressM`.

## Q. 5/10-m-Absuche unverändert? **JA** (`searchGeometry`/`dogProgressM`/`estimateDogProgressM` nicht berührt).
## R. GPS verändert? **NEIN** (positionSource/Filter/Recorder unverändert; Marker nutzt bestehende currentPosition).
## S. DB-Migration? **NEIN.**

## T. Tests
- `angleTypes.test.ts` (4): Labels gw/ow/bw; Dispatch GW/BW/OW (4/9); normaler Winkel unverändert (1); Abriss bleibt eigener Zustand (10/11).
- `angleTypesStore.test.ts` (3): GW/OW/BW gespeichert (3/8); mehrere Winkel inkl. Abriss erhalten (12); Recovery erhält GW/BW (13).
- Fälle 5/7 (GW/OW/BW manuell wählbar) durch das Sheet + `placeWinkel`; 14–16 (Absuche erkennt Typen) über `phraseFor`; 17 (richtiger Name) via `ANGLE_LABEL`/phraseFor; 18 (5/10-m aktiv), 19 (Teilstrecken), 20 (Gegenstände), 21 (GPS) baulich unberührt.
- `tsc --noEmit`: **0 Fehler** · `jest --runInBand`: **391/391** (40 Suites) · ESLint geänderte Dateien: **0 Errors** (Warnings vorbestehend).

## U. iOS Export
`npx expo export --platform ios` → **erfolgreich** (exit 0).

## V. Android Export
`npx expo export --platform android` → **erfolgreich** (exit 0).

## Gerätetest empfohlen
GW/OW/BW auf der Karte visuell prüfen (Rechteck/Badge/Kreis mit Text, Android + iOS), Voice-Ansagen im Feld, Recovery nach App-Neustart.
