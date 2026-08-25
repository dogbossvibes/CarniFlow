# FÄHRTE — Winkel-Schnellauswahl beim Legen (Fix-Report)

**Rolle:** Implementierung. **Erstellt:** 2026-07-28
**Grundlage:** [[FAEHRTE_ANGLE_TYPES_FIX_REPORT]]
**Keine DB-Migration, keine neue GPS-Logik, keine neue Winkelarchitektur, kein Commit/Push.**

## A. Alte Auswahl
Winkel-Button → `AnyvoBottomSheet` „Winkel setzen" (Sheet öffnet, 2-Spalten-Liste, Tap auf Option → setzen → Sheet schliesst). Beim Gehen zu langsam.

## B. Neue Auswahl
Winkel-Button → **Inline-Schnellwahl (Popover)** direkt über dem Button im Lege-Screen: eine Reihe **[GW] [OW] [BW] [Abriss]** (4 große Touch-Ziele, `flex-1` → füllt die Breite, kein Clipping). Tap auf ein Ziel → Marker **sofort** an aktueller Position + Popover schliesst. **Kein BottomSheet**, keine Navigation, keine Bestätigungsstufe. Tap auf den Backdrop (außerhalb) → schliesst ohne Marker. Erneuter Tap auf den Button → Toggle zu.

## C. Geänderte Dateien
- `app/track/legen.tsx` — Winkel-`AnyvoBottomSheet` **entfernt**; Inline-Popover + Backdrop; Button = Toggle (aktiver Zustand mint hervorgehoben). `placeWinkel` unverändert wiederverwendet.
- `features/tracking/components/TrackingMap.tsx` — OW-Marker: Badge → **Dreieck** (`triangle`-Glyph + „OW").

## D. Position der Schnellwahl
Absolut positioniert **oberhalb** der Steuerleiste (`bottom-[100px]`, links/rechts 14px) — mit dem Daumen erreichbar, verdeckt die Karte nur transient, innerhalb der Safe Area (SafeAreaView-Kind), `flex-1`-Chips ⇒ kein Abschneiden auf kleinen iPhones/Android.

## E. GW-Darstellung
Karte: **Rechteck** mit „GW" (unverändert). Schnellwahl-Chip: `square-outline` + „GW".

## F. OW-Darstellung
Karte: **Dreieck** — gefüllter Ionicons-`triangle`-Glyph (`C.trackWarning`) mit „OW"-Text (messbarer Inhalt, Android-/iOS-tauglich, **kein** leeres CSS-Border-Dreieck → kein `tracksViewChanges`-Leer-View-Problem). Schnellwahl-Chip: `triangle-outline` + „OW". *(Vorher Badge → jetzt überall Dreieck.)*

## G. BW-Darstellung
Karte: **Kreis** mit „BW" (unverändert). Schnellwahl-Chip: `ellipse-outline` + „BW".

## H. Abriss-Darstellung
**Unverändert** (Kästchen mit „✕"). Schnellwahl-Chip: `close`-Icon + „Abriss". `angleKind='abriss'` bleibt erhalten; wird nie als GW/OW/BW gesetzt/gerendert.

## I. Anzahl Taps vorher/nachher
- **Vorher:** Tap „Winkel" → Sheet öffnet → Tap Option (→ setzen). Effektiv 2 Taps + Sheet-Animation/Verdeckung.
- **Nachher:** Tap „Winkel" → Tap Option (→ setzen). **2 Taps ohne Sheet-Overhead** — Schnellwahl erscheint sofort inline direkt am Daumen, keine Bestätigungsstufe.

## J. GPS-Logik verändert? **NEIN**
`placeWinkel` nutzt weiterhin `currentPosition`/positionSource; keine Einzelabfrage, kein zweiter Listener.

## K. Persistenz verändert? **NEIN**
Gleicher Markerpfad (Store → PendingTrack → SQLite `local_track_markers` → Supabase `track_markers`), `angleKind`-Werte unverändert.

## L. 5/10-m-Absuche verändert? **NEIN** (`searchGeometry`/`dogProgressM`/Voice-Distanz unberührt).

## M. Tests
- Winkel-Dispatch & -Werte weiterhin durch `angleTypes.test.ts` (`angleMarkerKind('ow')='ow'` = OW-Dreieck-Dispatch, GW/BW, Abriss eigener Zustand, normal unverändert) und `angleTypesStore.test.ts` (gw/ow/bw gespeichert, mehrere Winkel + Abriss erhalten, Recovery).
- Schnellwahl-Interaktion (Tap öffnet/schliesst, außerhalb schliesst) ist UI im Lege-Screen; die Setz-/Feedback-Logik (`placeWinkel`) ist unverändert und store-getestet.
- `tsc --noEmit`: **0 Fehler** · `jest --runInBand`: **391/391** (40 Suites) · ESLint geänderte Dateien: **0 Errors** (Warnings vorbestehend).

## N. iOS Export
`npx expo export --platform ios` → **erfolgreich** (exit 0).

## O. Android Export
`npx expo export --platform android` → **erfolgreich** (exit 0).

## P. Echter Gerätetest noch nötig?
**Ja.** Am Gerät prüfen: Schnellwahl erscheint sofort ohne Clipping (kleine iPhones/Android), Tap setzt sofort, Backdrop schliesst; OW als klar erkennbares Dreieck mit „OW" auf iOS **und** Android; Abriss weiterhin sichtbar; mehrere Spezialwinkel nacheinander.
