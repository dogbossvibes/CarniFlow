# Trainingstagebuch — Fix/Feature Report

Datum: 2026-08-02 · Branch: `feat/track-module-rewrite`
Status: implementiert, ungetestet am Gerät · **kein Commit / Push / Build / Submit**

Zentrales, spartenübergreifendes **Trainingstagebuch** (DE) / **Trainingstagebuech**
(gsw) / **Journal d'entraînement** (fr): alle dokumentierten Trainingseinheiten aller
Hunde und Sparten in einer chronologischen Historie — additiv auf der bestehenden
vereinheitlichten Datenquelle, **ohne** zweite Trainingsdatenbank und **ohne** DB-Migration.

---

## A. Single Source of Truth
`services/trainingFeed.ts` (`buildFeed`) + `hooks/useTrainingFeed.ts`. Dieser bereits
existierende Layer mischt **nicht-destruktiv**:
- `training_units` (+ `training_exercises`) — neues Modell (`getTrainingUnits`, completed)
- `training_sessions` — altes Modell (`getTrainingSessions`)
- GPS-Fährten aus `training_sessions(type='track')` bzw. `track_sessions` (`getUserTrackSessions`, `status='completed'`)

zu **einer** normalisierten `FeedItem[]`-Zeitleiste (1 Eintrag = 1 Übung), absteigend nach
`session_date` + `created_at`. Cross-Dog wenn kein `dogId`. Keine neue Tabelle, kein neuer Fetch-Pfad.

## B. Bisherige Trainingshistorien
- `app/track/historie.tsx` („LOGBUCH") — **nur GPS-Fährten**, pro Hund. Bleibt unverändert.
- `app/(tabs)/activity.tsx` — **Trainer-Sicht** (geteilte Kunden-Einheiten), nicht die eigene Historie.
- Hundeprofil → Tab „Training" → `DogTrainingList` (letzte Trainings, per Hund, via `useTrainingFeed(dogId)`).
Ein **spartenübergreifendes** Tagebuch existierte noch nicht → genau diese Lücke schliesst dieser Screen.

## C. Neue Route
`app/training-journal.tsx` → `/training-journal` (Push-Screen, akzeptiert optionalen `?dogId=` für Vorfilterung).
Keine bestehende History-Route dupliziert.

## D. Navigation
Bewusst **kein neuer Bottom-Tab** (die Leiste ist mit Start/Hunde/Training/Analyse·Hub/Connect/Profil
bereits voll; ein Tab hätte bestehende verdrängt — siehe Phase-3-Vorgabe). Stattdessen mehrere Einstiege:
- **Home-Schnellaktion** „Tagebuch" (opt-in, `stores/homeScreenConfig.ts`).
- **Hundeprofil → „Alle Trainings anzeigen"** (Training-Tab) → `/training-journal?dogId=…`.
- **Analyse-Tab** → Karte „Trainingstagebuch".
Keine Sackgassen (Back via `router.back()`).

## E. Datenservice
`useTrainingFeed()` (voller Feed) + reines Logikmodul `features/training/journal.ts`
(Filter, Suche, Gruppierung, Zusammenfassung, Pagination) — **seiteneffektfrei**, kein Supabase/AsyncStorage.

## F. Enthaltene Sparten
Alle, die als `exercises[0].discipline` vorkommen: Fährte, Unterordnung, Schutzdienst, Obedience,
Agility, Rally, Mondioring **und eigene Kategorien** (Custom-Labels erscheinen 1:1). Sparten-Chips
werden dynamisch aus den vorhandenen Daten erzeugt (`disciplinesOf`).

## G. Fährtenintegration
GPS-Fährten sind über `buildFeed` bereits normale `FeedItem`s (`source='track'`, discipline „Fährte").
Sie erscheinen in derselben Liste. Distanz/Winkel/Gegenstände sind im vereinheitlichten `FeedItem`
**nicht** enthalten (nur Dauer/Bewertung/Notiz) — bewusst nicht erweitert, um die geteilte Feed-Logik
nicht zu verändern (siehe X). Tap öffnet die bestehende Fährten-Detailseite `/track/[id]`.

## H. Hund-Filter
Client-seitig auf dem geladenen Feed (`filterFeed({dogId})`). Chips „Alle Hunde" + je Hund
(aus `useDogs`). Vorfilterung via `?dogId=` aus dem Hundeprofil.

## I. Spartenfilter
Client-seitig (`filterFeed({discipline})`), Chips dynamisch aus `disciplinesOf(feed)`, mit Sparten-Farbpunkt
(`disciplineColor`) — Unterscheidung über Icon **und** Farbe, nicht nur Farbe.

## J. Zeitraumfilter
Segment „Alle / 7 Tage / 30 Tage / Dieses Jahr" (`filterFeed({period})`). Eigener Date-Picker
bewusst weggelassen (kein passender wiederverwendbarer Range-Picker vorhanden) — dokumentiert.

## K. Suche
Lokale Freitextsuche über bereits geladene Daten: Hundename, Sparte, Titel/Übung, Notiz
(`filterFeed({query})`, getrimmt + case-insensitive). Keine neue Supabase-Volltextsuche.

## L. Pagination
Client-seitiges Fenster (`paginate`, `DEFAULT_PAGE_SIZE=25`) auf dem via React-Query gecachten Feed +
„Mehr laden". Stabile Sortierung (Datum+created_at aus `buildFeed`), keine Duplikate. Echte
serverseitige Pagination wäre eine Erweiterung des geteilten Feed-Service → bewusst nicht angefasst (X).

## M. Offline-Verhalten
Reuse React-Query-Cache von `useTrainingFeed` (zuletzt geladene Einheiten bleiben sichtbar; Pull-to-Refresh).
Kein zweiter Offline-Store. Explizite Kennzeichnung lokal-noch-nicht-synchronisierter Einheiten ist im
vereinheitlichten Feed derzeit nicht abbildbar → offener Punkt (X). Kein Crash offline (leere/gecachte Liste).

## N. Detailnavigation
Pro `source` die bestehende Detailseite: `unit` → `/unit/detail?id=`, `track` → `/track/[id]`,
sonst → `/training/[id]` (identische Routing-Logik wie Home/Hundeprofil). Keine neue Detailarchitektur.

## O. Home-Schnellaktion
`training_journal` in `HomeQuickActionId` / `ALL_QUICK_ACTIONS` / `HOME_QUICK_ACTIONS_META`
(Route `/training-journal`, Icon `book-outline`) + i18n-Label `home.actionTrainingJournal`
in beiden `QUICK_ACTION_LABEL_KEY`-Maps (Widget + Customize). **Opt-in**, nicht erzwungen, `MAX_QUICK_ACTIONS=6` bleibt.

## P. Hundeprofil-Integration
`DogHubActions.onOpenJournal` → Link „Alle Trainings anzeigen" im Training-Tab öffnet
`/training-journal?dogId=…`. Keine separate Hund-Historie dupliziert; dieselbe Datenquelle.

## Q. i18n
Alle Texte über `useT`. Neue Keys `journal.*` (+ `home.actionTrainingJournal`) in **de** (`de-CH.ts`,
Quelle), **gsw** (`gsw-CH.ts`, identischer Key-Satz → Consistency-Test grün) und **fr** (`locales/fr.ts`).
Kein EN/IT. Monatslabels via `toLocaleDateString` (locale-basiert, kein Hardcoding).

## R. DB-Migration?
**NEIN.** Ausschliesslich Lesezugriff über den bestehenden Feed. Keine Schemaänderung, keine neue Tabelle.

## S. Businesslogik verändert?
**NEIN.** Keine Änderung an Session-/Training-Logik (`services/training.ts`, `trainingUnitService.ts`),
keine Tracking-/Fährtenlogik (`trackService`, Registry), keine Abo-/RevenueCat-/Quota-Logik.
Änderungen sind rein additiv: neuer Screen, neues reines Logikmodul, neue i18n-Keys, ein Registry-Eintrag,
drei additive Einstiegs-Links.

## T. Tests
`features/training/__tests__/journal.test.ts` (20), `journal-sources.test.ts` (6),
`i18n/__tests__/journal-i18n.test.ts` (6): Zusammenführung aller Sparten, Fährte enthalten, mehrere Hunde,
neueste zuerst, keine Duplikate, Gruppierung (Heute/Gestern/Woche/Monat), Filter (Hund/Sparte/Zeitraum/kombiniert),
Suche (Hund/Sparte/Notiz/leer), Zusammenfassung, Pagination (stabil, ohne Duplikate), i18n-Parität DE/gsw/fr,
Guards (keine Supabase/AsyncStorage/Abo-Logik im Journal). **Gesamte Suite: 67 Suites / 651 Tests grün.**
`tsc --noEmit` Exit 0, ESLint 0 Fehler (nur bekannte Test-Mock-Warnungen).

## U. iOS Export
`expo export --platform ios` erfolgreich.

## V. Android Export
`expo export --platform android` erfolgreich.

## W. Gerätetest erforderlich?
**Ja** — visuelle/UX-Prüfung am Gerät ausstehend: mehrere Hunde/Sparten, leerer Zustand, viele Einheiten,
Filter/Suche/Pagination, kleine Bildschirmbreite, DE/gsw/fr, Monatslabel-Formatierung, Pull-to-Refresh.

## X. Offene Punkte
1. Fährten-Zusatzmetriken (Distanz/Winkel/Gegenstände) in der Card — erfordert additive Felder am geteilten
   `FeedItem`; bewusst zurückgestellt, um die Feed-Logik nicht zu verändern.
2. Serverseitige Pagination/Filter — aktuell client-seitig auf dem vollständig geladenen, gecachten Feed
   (der bestehende Service lädt alle completed Einheiten). Bei sehr grossen Datenmengen später am Service ergänzen.
3. Kennzeichnung lokal-unsynchronisierter Einheiten — im vereinheitlichten Feed derzeit nicht ausgewiesen.
4. Kalenderansicht (Liste|Kalender) — nicht umgesetzt (keine wiederverwendbare Kalenderkomponente); nur Liste.
5. Aktiv-Sektion für laufende Sessions — entfällt, da der Feed per Design nur `completed` enthält
   (laufende Fährten erscheinen im Hub / Fährten-Logbuch).
