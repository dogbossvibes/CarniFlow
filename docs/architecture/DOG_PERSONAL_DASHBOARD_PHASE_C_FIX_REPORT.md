# Persönliches Hunde-Dashboard — Phase C Report

Datum: 2026-08-02 · Branch: `feat/track-module-rewrite`
Status: implementiert, Gerätesichtung ausstehend · **kein Commit / Push / Build / Submit**

Der Overview-Tab im Hundeprofil wurde zu einem persönlichen, hundespezifischen
Dashboard ausgebaut — **additiv auf bestehenden Datenquellen**, ohne zweite
Datenarchitektur, ohne DB-Migration, ohne neue KI, ohne Wetter.

---

## A. Geänderte Dateien
**Neu**
- `features/dogs/dashboard.ts` — reine Logik (Termin-Filter/Sort, Backpack-Status, „Heute"-Hinweise)
- `components/dogs/DogTodayCard.tsx` — „Heute mit {Hund}"
- `components/dogs/DogAppointmentsCard.tsx` — Nächste Termine
- `components/dogs/DogRecentCard.tsx` — „Zuletzt" + Journal-Einstieg
- `components/dogs/DogStatusTiles.tsx` — 2×2-Trainingsstatus
- `features/dogs/__tests__/dashboard.test.ts`, `i18n/__tests__/dashboard-i18n.test.ts`
- `docs/architecture/DOG_PERSONAL_DASHBOARD_PHASE_C_FIX_REPORT.md`

**Geändert**
- `features/dogs/DogHubScreen.tsx` — Overview-Tab in neuer Reihenfolge (1–8), neue Props `appointments`
- `app/dog/[id].tsx` — lädt Termine (`getCalendarEvents` + `toDogAppointments`), reicht `appointments`
- `features/dogs/buildDogHubVM.ts` + `components/dogs/types.ts` — additive VM-Felder `trainingsThisWeek`, `lastFaehrteLabel`
- `features/dogs/demoDogs.ts` — Demo-VMs um die zwei Felder ergänzt
- `components/dogs/DogBackpackCard.tsx` — kompakter Statustext (Alles bereit / Noch nichts eingepackt)
- i18n: `i18n/de-CH.ts`, `i18n/gsw-CH.ts`, `i18n/locales/fr.ts` (`dash.*` + 3 `backpack.*`)

## B. Neue Dashboard-Struktur (Overview-Reihenfolge)
1. **Heute mit {Hund}** · 2. **Nächste Termine** · 3. **Läufigkeit** (nur Hündin) ·
4. **Aktuelles Ziel** · 5. **Backpack** · 6. **Journal / Zuletzt** ·
7. **Trainingsstatus** (2×2) · 8. **Smart Analyse** (+ bestehende Kommando-Kürzel am Ende).
Bestehendes ANYVO-Dark-Design, kompakte Rounded Cards, Mint-Akzent, dezente Spartenfarben.

## C. Datenquellen (alle bereits vorhanden)
- Feed (`useTrainingFeed(id)`) → letztes Training, letzte Fährte, Trainings/Woche (VM)
- Ziel: `dog_goals` via `getDogHubExtras` (VM `goal`)
- Läufigkeit: `heatCycles`/`predictHeat` (bestehender `heat`-Prop)
- Backpack: `getBackpack` (lokal, `backpackCounts`)
- **Neu geladen (einzige Ergänzung):** Termine via bestehendem `getCalendarEvents(userId)`, hundegefiltert
- Smart Analyse: deterministischer `insightService`/`useAiCoach` (bestehende `DogAiCoachCard`)
Keine N+1-Abfragen: Termine 1× pro Fokus (gebündelt mit Backpack/Heat/Extras im bestehenden `useFocusEffect`).

## D. Heute-Karte
`DogTodayCard` — max. 4 Hinweise, deterministisch priorisiert (`buildTodayHints`):
Termin heute → überfälliger Termin → Läufigkeit (≤45 T oder aktiv) → Ziel → Backpack offen → letzte Aktivität.
Keine Daten → „Für heute ist nichts geplant." Keine erfundenen Empfehlungen.

## E. Termine
`DogAppointmentsCard` — max. 3 hundebezogene, offene Termine; **überfällig zuerst, dann chronologisch**.
Typ-Icon/-Farbe aus `eventMeta`; optional Sparte; Überfällig-Badge (nicht nur Farbe). CTA „Alle anzeigen" → `/plaene`.
Leer → „Keine offenen Termine" + „Termin erstellen" (öffnet Kalender). Keine neue Kalenderarchitektur.

## F. Läufigkeit
Nur Hündinnen (`gender === 'female'`). Wiederverwendung der bestehenden `DogHeatCard`
(inkl. Prognose aus `predictHeat` und der freigegebenen kompakten Variante-A-Empty). Keine Zykluslogik geändert.
Bei Rüden: keine Läufigkeitskarte.

## G. Ziel
Wiederverwendung `DogGoalsCard` (Ring + Teilfortschritte; Empty „Noch kein Ziel" + CTA „Ziel festlegen").
Nur reale Werte, keine künstliche Fortschrittsberechnung. CTA → bestehender `dog-goal/[id]`-Flow.

## H. Backpack
Wiederverwendung `DogBackpackCard`, ergänzt um kompakten Status: „{n} aktive Gegenstände · Alles bereit /
Noch nichts eingepackt / {packed} von {total} eingepackt". CTA „Ansehen" → `/dog-backpack/[id]`.
**Keine** automatische „Heute mitnehmen"-Filterung, keine neue Packlogik.

## I. Journal / Zuletzt
`DogRecentCard` — letztes Training + letzte Fährte (nur vorhandene Daten) + CTA
„Alle Trainings im Journal" → `/training-journal?dogId={dogId}`. Keine zweite Hundehistorie.

## J. Trainingsstatus
`DogStatusTiles` (2×2): Trainings diese Woche · Letztes Training · Letzte Fährte · Aktuelles Ziel.
Fehlende Werte → „Noch kein Training" / „Noch keine Fährte" / „Kein Ziel" (keine Bindestriche).
Nur bestehende VM-Werte, keine neue Statistik.

## K. Smart Analyse
Bestehende, deterministische `DogAiCoachCard` (aus `insightService`), ans Ende verschoben.
Premium-/Entitlement-Gate unverändert (`aiUnlocked`/`isUnlocked`). Keine KI, keine neue Empfehlung, keine Marketingkarte.

## L. Navigation
Termine → `/plaene`; Läufigkeit → bestehender `dog-heat`-Flow (via `onAdd`); Ziel → `dog-goal/[id]`;
Backpack → `/dog-backpack/[id]`; Journal → `/training-journal?dogId=`; Smart Analyse → bestehende Card/Flows.
Keine neue doppelte Route.

## M. i18n
Neue `dash.*` + 3 `backpack.*` Keys in **de/gsw/fr** (Key-Satz de↔gsw identisch → Consistency-Test grün).
Produktnamen „Journal"/„Backpack" unverändert. Datums-/Zeitformate locale-basiert (`toLocaleDateString/TimeString`,
gsw→`de-CH`). Keine sichtbaren Hardcodings in den neuen Komponenten (Test 36).

## N. Accessibility
Karten mit zusammenfassenden `accessibilityLabel`s; CTAs mit Button-Rolle + Label; Überfällig/Status
zusätzlich als Text (nicht nur Farbe); Touch-Targets ausreichend; `adjustsFontSizeToFit` in Status-Kacheln
für lange FR-Texte; sinnvolle Reihenfolge (Heute zuerst).

## O. Offline-Verhalten
Backpack + Läufigkeit sind lokal/offline. Termine/Journal/Ziel/Insight: bestehendes Verhalten
(Supabase + React-Query-Cache); Fehler/kein Netz → `catch` → leere Liste / Empty-State, keine Crashes.
Einzelne fehlende Quelle lässt das Dashboard nicht ausfallen (jede Karte rendert unabhängig). Keine neue Offline-Architektur.

## P. Tests
`dashboard.test.ts` (19) + `dashboard-i18n.test.ts` (6): Termin-Filter (dog_id/dog_ids, cancelled/completed
ausgeschlossen), Sortierung (überfällig zuerst), Hundetrennung, Backpack-Status, „Heute"-Hinweise (Priorität,
max 4, Empty, Heat-Schwelle), i18n-Parität de/gsw/fr, keine roh gerenderten Keys, Guard „keine Supabase/AsyncStorage".
Bestehende Card-Tests an neue Darstellung angepasst. **Gesamte Suite: 69 Suites / 671 Tests grün.**
`tsc --noEmit` Exit 0, ESLint 0 Fehler.

## Q. iOS Export
`expo export --platform ios` erfolgreich.

## R. Android Export
`expo export --platform android` erfolgreich.

## S. Sichtbare Probleme
Keine funktionalen. `DogHeatCard` (wiederverwendet) rendert zusätzlich die Verlaufsliste → im Dashboard etwas
höher als eine reine Prognosezeile (bewusste Wiederverwendung statt Neubau). Relative Datumslabels aus dem VM
(`lastTrainingLabel`, `lastFaehrteLabel`) sind wie bisher deutschsprachig (bestehendes VM-Verhalten, kein Regress).

## T. DB-Migration? — **NEIN.** Nur Lesezugriff auf bestehende Tabellen/Quellen.

## U. Businesslogik verändert? — **NEIN.** Keine Änderung an Trainings-, Fährten-, Kalender-, Zyklus-,
Smart-Analyse- oder Abo-Logik. Alle Änderungen additiv (neue Karten/Props/i18n + additive VM-Felder).

## V. Wetter umgesetzt? — **NEIN.** Bewusst nicht (Phase-C-Vorgabe).

## W. Gerätetest erforderlich? — **Ja.** Visuell: Hündin mit/ohne Läufigkeitsdaten, Rüde, mit/ohne Termine,
mit/ohne Ziel, leerer/voller Backpack, mit/ohne Historie, DE/gsw/FR, kleines iPhone/Galaxy S23, grosse Schrift.

## X. Offene Punkte
1. „Heute mitnehmen" (Backpack-Filter nach Termin/Disziplin) bewusst nicht umgesetzt (keine saubere Ableitung vorhanden).
2. Relative Datumslabels im VM nicht lokalisiert (bestehendes Verhalten) — spätere i18n-Vereinheitlichung möglich.
3. `DogHeatCard`-Kompaktvariante fürs Dashboard optional als spätere Politur.
4. Letzte-Fährte-Distanz („· 420 m") nicht gezeigt, da im vereinheitlichten Feed nicht enthalten (würde Feed-Logik verändern).
5. Termine werden clientseitig gefiltert (bestehender Service lädt alle Nutzer-Events); bei sehr vielen Events später serverseitig eingrenzen.
