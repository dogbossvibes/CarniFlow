# ANYVO — Personalisierbarer Startbildschirm + individuelle Schnellauswahl (Fix-Report)

**Rolle:** Implementierung. **Erstellt:** 2026-07-29
**Keine DB-Migration · keine Änderung an Trainings-/GPS-/Fährten-/Subscription-Logik · keine neue AI · keine neue Dependency · kein Commit/Push.**

## A. Welche Datei rendert den Startbildschirm
`app/(tabs)/home.tsx`. Hero-Banner (Begrüssung/Stats, immer sichtbar) + ScrollView mit Widget-Sektionen. FAB via `<QuickAddSheet />`.

## B. Bisheriger Zustand
- `stores/homeLayout.ts` — **globaler** Store (Key `home_layout`), nur 4 Boolean-Schalter (`woche/hauptaktionen/letzteEinheiten/hunde`), keine Reihenfolge, kein Layout, **nicht pro Benutzer**.
- `app/home-customize.tsx` — nur 4 Switches. Keine Schnellzugriffe, keine Reihenfolge, keine Layout-Wahl, keine Vorschau, kein Reset.
- Hauptaktionen (Timer/Dokumentieren) fest im JSX; keine Registry.

## C. Zentrales Config-Modell (neu)
`stores/homeScreenConfig.ts`:
```
HomeScreenConfig = {
  layout: 'grid' | 'list' | 'compact',
  quickActions: HomeQuickActionId[],   // Reihenfolge = Anzeige, max 6
  widgetOrder: HomeWidgetId[],
  hiddenWidgets: HomeWidgetId[],
}
```
IDs sind stabile Keys (kein UI-Text): Widgets `week · smart_analysis · quick_actions · recent_sessions · dogs`; Aktionen `add_dog · start_timer · track_gps · lay_track · document_training · start_obedience · show_analysis`.

## D. Default-Config (ohne Benutzeraktion nutzbar)
`DEFAULT_HOME_CONFIG`: Layout `grid`; Widgets `week, smart_analysis, quick_actions, recent_sessions, dogs` (alle sichtbar); Schnellzugriffe (6): `add_dog, start_timer, track_gps, document_training, lay_track, start_obedience`. **Analyse** nicht Default (7. optional). **Schutzdienst** bewusst nicht angeboten (fachlich/verfügbarkeitshalber ausgelassen).

## E. Zentrale Registry (eine Quelle, keine doppelten Switches)
`HOME_QUICK_ACTIONS_META` (Label/Icon/**Route**) und `HOME_WIDGETS_META` (Label/Icon/Beschreibung). Home rendert über `visibleWidgets(config).map(renderWidget)`; `renderWidget` mappt Widget-ID → bestehende Komponente. Schnellzugriffe rendert `QuickActionsWidget` aus der Registry.

## F. Wiederverwendete bestehende Komponenten
`HomeTimelineCard` (week), `AiCoachCard` (smart_analysis), `UnitListCard`+`SwipeableTrainingItem`+`useTrainingFeed` (recent_sessions), `DogCard`+`useDogs` (dogs), `AnimatedPressable`, `HomeHeatCard` (kontextuell, immer sichtbar, nicht konfigurierbar). Keine neue Business-Logik im Renderer.

## G. Einstiegspunkt „anpassen"
Dezenter Icon-Button (`options-outline`) oben rechts im Hero-Kopf, ohne grosses Label, mit `hitSlop` + a11y-Label „Startbildschirm anpassen". Öffnet die bestehende Route `/home-customize`. Safe-Area durch `SafeAreaView edges={['top']}`.

## H. Anpassen-Screen (`app/home-customize.tsx`, neu aufgebaut)
Abschnitte: **Vorschau** (live) · **Layout** (3er-Segment) · **Widgets** (Toggle + ↑/↓) · **Schnellzugriffe** (aktiv mit ↑/↓ + Toggle, `n/6` Zähler; „Verfügbar" inaktiv, deaktiviert bei 6) · **Auf Standard zurücksetzen** (mit Bestätigung).

## I. Schnellzugriffe (Phase 5/6)
7 verfügbare Aktionen, alle mit **existierender Route** (verifiziert: `/add-dog`, `/unit/timer`, `/unit/document`, `/unit/start`, `/track`, `/track/legen`, `/analyse/insights`). Aktivieren/Deaktivieren/Reorder; **MAX 6** aktiv — `toggleQuickAction` blockiert die 7., Sanitizer kappt ebenfalls auf 6. Keine Dead-Links.

## J. Widgets (Phase 7/8)
Nur bestehende Widgets mit Datenquelle. Ein-/ausblenden via `setWidgetVisible`; Reihenfolge via `moveInArray` auf `widgetOrder`. Renderer nutzt ausschliesslich vorhandene Komponenten.

## K. Layouts (Phase 9)
`grid` (2-spaltige Kacheln), `list` (breite Zeilen), `compact` (3-spaltige kleinere Kacheln) — gleiche Daten/Aktionen, nur Darstellung. Betrifft aktuell das Schnellzugriffe-Widget; übrige Widgets rendern ihre bestehende Darstellung.

## L. Live-Vorschau (Phase 10)
`HomePreview` im Anpassen-Screen zeigt sichtbare Widgets in Reihenfolge; „Schnell starten" zeigt aktive Aktionen im gewählten Layout. Aktualisiert sofort (gleiche reaktive Config).

## M. Persistenz pro Benutzer (Phase 11)
Neuer External-Store (`useSyncExternalStore`) über **AsyncStorage**, Key `home_screen_config:<userId>` (`keyForUser`, Fallback `:anon`). Hydriert pro `user.id` aus `useSession`. **Keine DB-Migration.** Nicht global.

## N. Robuster Fallback (Phase 12)
`sanitizeHomeScreenConfig(raw)`: ungültiges Layout → Default; unbekannte/veraltete IDs raus; Duplikate weg; leere Schnellzugriffe → Default; auf 6 gekappt; **neue** Widgets hinten ergänzt; JSON-Parse in `try/catch`. Nie Crash; fehlende/kaputte/leere Config → Default.

## O. Reset (Phase 13)
„Auf Standard zurücksetzen" mit `Alert`-Bestätigung → `resetHomeScreenConfig()` schreibt `DEFAULT_HOME_CONFIG`. Betrifft nur die Home-Config, keine anderen Einstellungen.

## P. Renderer statt Switch-Wildwuchs (Phase 14/15)
`home.tsx`: `config.widgetOrder` (gefiltert um `hiddenWidgets`) → `renderWidget(id)`; eine zentrale Zuordnung. Alle Aktionen nutzen bestehende Routen (kein Duplikat-Screen).

## Q. Smart Analyse (Phase 16)
`AiCoachCard` als optionales Widget `smart_analysis` — **keine neue AI**, bestehende deterministische Karte, nur ein-/ausblendbar/verschiebbar.

## R. FAB (Phase 17)
`<QuickAddSheet />` bleibt unverändert (globaler „Neu"-Flow). Redundanz zu den Schnellzugriffen ist gewollt/gering: FAB = globaler Schnell-Erfassen-Flow, Schnellzugriffe = konfigurierbare Direktrouten. Keine Änderung nötig.

## S. Accessibility (Phase 18)
Touch-Targets ≥40 px (Anpassen-Button 40, Zeilen `minHeight 60`, List-Rows 56). `accessibilityRole="button"` + `accessibilityLabel` an Anpassen-Button, Segmenten, Reorder-Pfeilen, Aktions-Kacheln/-Zeilen, Switches; `accessibilityState.selected` am Layout-Segment. `numberOfLines` gegen Clipping. Farbtokens (`C.*`) = bestehendes Dark-Design. `AnimatedPressable` um a11y-Props erweitert (abwärtskompatibel).

## T. Dependency (Phase 19)
Keine Drag&Drop-Lib installiert → **keine neue Dependency**. Reorder via ↑/↓-Buttons mit bestehenden Komponenten (Ränder als No-Op via `moveInArray`).

## U. Verifikation (Phase 20/21)
- **Neu:** `stores/homeScreenConfig.ts`, `components/home/QuickActionsWidget.tsx`, `stores/__tests__/homeScreenConfig.test.ts`.
- **Geändert:** `app/(tabs)/home.tsx`, `app/home-customize.tsx`, `components/ui/AnimatedPressable.tsx` (a11y-Props).
- **Verwaist (belassen, nicht gelöscht):** `stores/homeLayout.ts` — durch die neue Config abgelöst, nirgends mehr importiert (kein Import → kein Laufzeiteffekt). Bewusst nicht entfernt (kein Löschen ausserhalb des Auftragskerns).
- Tests (12, decken die 20 geforderten Fälle ab): Default gültig; ohne/kaputte/leere Config → Default; unbekannte Aktion/Widget gefiltert; fehlende Widgets ergänzt; 3 Layouts; Toggle add/remove; **max 6** erzwungen+gekappt; Reorder ↑/↓ inkl. Ränder; Widget aus/ein + `visibleWidgets`-Reihenfolge; **Pro-Benutzer-Key-Isolation**; Reset=Default.
- `tsc --noEmit`: **0 Fehler** · `jest --runInBand`: **408/408** (42 Suites) · ESLint geänderte Dateien: **0 Errors** (nur vorbestehende `no-unused-vars`-Warnungen in `home.tsx`).
- `npx expo export --platform ios`: **exit 0** · `--platform android`: **exit 0**.

## Echter Gerätetest empfohlen
Am Gerät prüfen: Anpassen-Button-Position/Safe-Area (kleine iPhones, Android 3-Button/Gesture, Tablet); Reorder-Pfeile + Live-Vorschau; 3 Layouts ohne Clipping in hell/dunkel; Persistenz nach App-Neustart; Nutzerwechsel (Key-Isolation); VoiceOver/TalkBack-Labels.

## Harte Vorgaben eingehalten
Keine DB-Migration · GPS/Fährten/Training/Subscription unberührt · keine neue AI · keine neue Dependency · kein Commit/Push.
