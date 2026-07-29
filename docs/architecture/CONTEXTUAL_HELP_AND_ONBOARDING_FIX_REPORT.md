# ANYVO — Kontextuelle Hilfe / Coachmarks / Hilfe-Center (Fix-Report)

**Rolle:** Implementierung. **Erstellt:** 2026-07-29
**Keine DB-Migration · keine GPS-/Tracking-/Training-/Analyse-Logikänderung · keine KI · kein Commit/Push.**

Drei Ebenen umgesetzt: (1) kontextuelle Coachmarks beim ersten Nutzen, (2) „?"-Hilfe im Screen, (3) zentrales Hilfe-Center im Profil mit „ANYVO kennenlernen".

## A. Vorhandene Onboarding-/Help-Strukturen (vorher)
- `app/help.tsx` — statische FAQ „Hilfecenter" (Accordion + Support-Mail), verlinkt aus Profil → Support (`/help`). **Bleibt erhalten**, jetzt zusätzlich aus dem neuen Help-Center verlinkt.
- `features/connect/utils/onboarding.ts` / `ConnectOnboardingScreen` — **CONNECT-spezifisch** (eigenes Feature, flag-off), nicht generisch.
- **Kein** generisches Coachmark-/Tooltip-/Walkthrough-System; keine `hasSeen…/dismissed…`-Hilfe-Flags.
- Wiederverwendbar: `AnyvoBottomSheet` (Modal-Muster), per-User-Store-Muster aus `stores/homeScreenConfig.ts`.

## B. Neue Help-Registry
`features/help/helpRegistry.ts` — **Single Source of Truth** (reine Daten): `HelpTopicId`, `HelpTopic { id, title, shortDescription, body?, category }`, `HELP_TOPICS` (Record), `HELP_CATEGORY_ORDER/LABEL`, `topicsByCategory()`, `GUIDED_TOUR` (6 Schritte). Speist Coachmarks, „?"-Hilfe, Help-Center und Rundgang. Keine Hilfetexte in den Screens verteilt.

## C. Help-Themen (Kategorien)
- **Schnellstart:** `home` (Startbildschirm anpassen), `add_dog`, `start_timer`
- **Fährte:** `track_laying`, `track_segments`, `track_objects`, `track_angles` (GW/OW/BW/✕), `track_gps`, `track_search`, `track_handler_distance` (5/10 m), `track_step_calibration`
- **Training:** `start_training`, `document_training`
- **Analyse:** `smart_analysis` (deterministisch), `recent_sessions`
Keine KI erwähnt (per Test abgesichert).

## D. Coachmarks
`components/help/HelpSheet.tsx` (Overlay-Karte, Dark, Mint-Akzent, kurze Texte, ein primärer Button „Verstanden", optional „Mehr erfahren") + `components/help/HelpButton.tsx` mit `autoShow`: zeigt das Thema **einmalig beim ersten relevanten Auftreten** (erst nach Hydrierung, nur wenn nicht gesehen), markiert danach als gesehen → **nie automatisch erneut**, aber jederzeit über „?" erreichbar. Auto-Coachmarks aktiv auf: home, Fährte legen, Fährte absuchen, Schrittlänge, Training starten/dokumentieren, Analyse. Untertopics (Teilstrecke/Gegenstände/Winkel/Abstand) sind über „?" → „Mehr erfahren", Help-Center und Rundgang erreichbar — bewusst **ohne** Eingriff in die Fährten-Aktionslogik.

## E. „?"-Buttons
`HelpButton` (Icon `help-circle-outline`, 40×40-Touchziel, hitSlop) eingebunden in: `app/(tabs)/home.tsx`, `app/track/legen.tsx`, `app/track/run.tsx`, `app/track/kalibrierung.tsx`, `app/unit/start.tsx`, `app/unit/document.tsx`, `app/analyse/insights.tsx`. Tap → kompakte Hilfe zum aktuellen Thema; „Mehr erfahren" → Help-Center.

## F. Hilfe-Center
`app/help-center.tsx` — Profil → Support → **„Hilfe & ANYVO kennenlernen"** (`/help-center`). Oben „ANYVO kennenlernen"; darunter alle Themen nach Kategorie (datengetrieben); Verweis auf bestehende FAQ (`/help`); unten „Alle Hinweise erneut anzeigen". Jeder Eintrag öffnet die kompakte Anleitung (`HelpSheet`, mit Detailabsätzen).

## G. „ANYVO kennenlernen"
`components/help/GuidedTour.tsx` — 6-Schritt-Rundgang (Startbildschirm → Hund → Training → Fährte → Absuche → Smart Analyse) mit `Zurück/Weiter/Fertig`, Fortschrittspunkten, Zähler „n / 6". **Startet kein echtes Training** — reines Info-Overlay.

## H. Persistenz „gesehen"-Status
`stores/helpSeen.ts` — per-User External-Store (`useSyncExternalStore`), AsyncStorage-Key `help_seen_topics:<userId>` (Fallback `:anon`). `markHelpSeen`, `resetHelpSeen`, `useHelpSeen`, `useHelpSeenState` (mit `hydrated`-Signal). `sanitizeSeen` filtert ungültige/doppelte IDs. **Keine DB-Migration.**

## I. Nutzertrennung
Schlüssel enthält `userId` → Nutzer A und B strikt getrennt; kein globaler Zustand. `hydrated`-Signal verhindert falsche Auto-Coachmarks vor dem Laden. Per Test abgesichert.

## J. Reset
Help-Center → „Alle Hinweise erneut anzeigen" mit Bestätigung („Möchtest du alle Einführungshinweise zurücksetzen?") → `resetHelpSeen()` leert **nur** `seenHelpTopics`; keine anderen Einstellungen betroffen.

## K. Accessibility
`accessibilityRole="button"` + sprechende `accessibilityLabel` an allen „?"-Buttons, Sheet-Buttons, Rundgang-Steuerung, Help-Center-Zeilen; `accessibilityViewIsModal` an Overlays; Touchziele ≥40 px (Zeilen ≥56); kurze, scanbare Texte; bestehendes Dark-Design/Token. Screenreader-verständlich (Titel + Text als Labels).

## L. GPS-/Fährtenlogik verändert? **NEIN**
In `track/legen.tsx`, `track/run.tsx`, `track/kalibrierung.tsx` wurde ausschliesslich ein `HelpButton`-Overlay + Import ergänzt. Coachmarks sind Modal-Overlays: sie stoppen weder GPS noch Recording/Timer, starten keine `positionSource` neu, verhindern kein Marker-Setzen und ändern kein Recovery (Phase 12 eingehalten).

## M. Training verändert? **NEIN**
`unit/start.tsx` / `unit/document.tsx`: nur „?"-Button + Import. Keine Änderung an Erfassung/Speicherung.

## N. Smart Analyse verändert? **NEIN**
`analyse/insights.tsx`: nur „?"-Button + Import. Weiterhin deterministische, kuratierte Auswertung — keine neue AI. Hilfetexte erwähnen keine KI (Test).

## O. DB-Migration? **NEIN**
Ausschliesslich lokaler AsyncStorage-State pro Nutzer.

## P. Tests
`stores/__tests__/helpSeen.test.ts` (6, decken die 16 Fälle ab): alle Kategorien vorhanden + Titel/Kurztext (4); Rundgang 6 Schritte (5); keine KI-Erwähnung / Smart Analyse deterministisch (14); fehlender/beschädigter State → leer, ungültige/doppelte IDs gefiltert (15/16); Key pro Nutzer getrennt (6/7); markieren/lesen/zurücksetzen isoliert (1/2/8). Fälle 3 („?" öffnet trotzdem) via `HelpButton`-Logik (manuell immer offen, unabhängig von `seen`); 9–13 (Fährte/GPS/Absuche/5–10 m/Schrittlänge/Smart Analyse unverändert) durch rein additive Overlays + volle bestehende Tracking-Suite (unverändert grün).
- `tsc --noEmit`: **0 Fehler** · `jest --runInBand`: **414/414** (43 Suites) · ESLint geänderte Dateien: **0 Errors** (nur vorbestehende Warnungen).

## Q. iOS Export
`npx expo export --platform ios` → **exit 0**.

## R. Android Export
`npx expo export --platform android` → **exit 0**.

## S. Echter Gerätetest erforderlich?
**Ja.** Am Gerät prüfen: Coachmark erscheint einmalig beim ersten Öffnen (home/legen/run/kalibrierung/start/document/insights) und danach nicht mehr automatisch; „?" öffnet trotzdem; **Fährte legen/absuchen laufen mit offenem Coachmark ungestört weiter** (GPS/Recording/Timer, Marker setzen, Hintergrund); „ANYVO kennenlernen" Zurück/Weiter/Fertig; Reset zeigt Hinweise wieder; Nutzerwechsel (Key-Isolation); VoiceOver/TalkBack; kleine iPhones/Android, Dark Mode.

## Neue/geänderte Dateien
- **Neu:** `features/help/helpRegistry.ts`, `stores/helpSeen.ts`, `components/help/HelpSheet.tsx`, `components/help/HelpButton.tsx`, `components/help/GuidedTour.tsx`, `app/help-center.tsx`, `stores/__tests__/helpSeen.test.ts`.
- **Geändert (additiv):** `app/(tabs)/profile.tsx` (Help-Center-Eintrag), `app/(tabs)/home.tsx`, `app/track/legen.tsx`, `app/track/run.tsx`, `app/track/kalibrierung.tsx`, `app/unit/start.tsx`, `app/unit/document.tsx`, `app/analyse/insights.tsx` (je „?"/Coachmark + Import).

## Harte Vorgaben eingehalten
Keine DB-Migration · keine GPS-/Tracking-Änderung · keine KI · keine neue Help-Architektur pro Screen (zentral/datengetrieben) · bestehende Produktlogik unverändert · iOS+Android · kein Commit/Push.
