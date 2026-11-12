---
title: 'Trainingsdoku Etappe 2: Weitermachen im Training-Tab und auf der Hundekarte (T-184, gh-31)'
type: 'feature'
created: '2026-11-09'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'bf569550393e199b20b10f392ebcdb760d9d7f56'
context: ['{project-root}/_bmad-output/trainingsdoku-neu-spec.md', '{project-root}/_bmad-output/implementation-artifacts/spec-gh-31-trainingsdoku-etappe1.md', '{project-root}/AGENTS.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Wer weitertrainieren will, sieht heute weder auf der Hundekarte noch im Training-Tab, wann und was zuletzt trainiert wurde und welcher Hinweis offen ist.

**Approach:** Rein lesende Anzeige auf Basis von Etappe 1: (1) Hundekarte „Letztes Training: vor X Tagen · Sparte“ plus offener Hinweis; „Weiter“ öffnet den Erfassen-Screen für diesen Hund. (2) Training-Tab oben „Weitermachen“: Hund-Auswahl, letztes Training mit offenem Hinweis, Übungen mit Lernstufe und Trend, darunter 3 frühere Trainings; „Weiter“ öffnet den Erfassen-Screen für Hund + Sparte.

## Boundaries & Constraints

**Always:** Nur lesen über bestehende Abfragen (`getTrainingUnits`, `getTrainingSessions` ohne `type='track'`, `listServerTrainingFocuses`). Lernstufe/Trend ausschliesslich über `learningLevel.ts` (alte Sterne als „alte Bewertung x/5“, kein Trend). Ältere Trainings (Legacy-Sessions) zählen als „letztes Training“ mit. Lade- und Fehlerzustände sichtbar, ohne bestehende Inhalte zu verdecken. Text ≥ 4,5:1, Bedienelemente ≥ 44 pt. Alle Texte über i18n.

**Never:** Keine neuen Schreibpfade, keine Migration, kein Ändern/Abschliessen von Hinweisen aus diesen Ansichten, keine Fährten-/GPS-Daten (Fährten bleiben im Fährten-Bereich), keine Änderungen am Erfassen-Screen ausser Einstiegsparametern. Kein Commit auf main, kein Push/Merge/OTA/Build.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Hund mit Trainings | letztes Training vor 3 Tagen, Unterordnung, offener Hinweis | Karte: „Letztes Training: vor 3 Tagen · Unterordnung“ + Hinweistext | – |
| Heute / gestern | Training heute bzw. gestern | „heute“ bzw. „gestern“ | – |
| Kein Training | Hund ohne Trainings | Karte ohne Zeile; Tab: „Noch kein Training“ + Weiter | – |
| Nur Legacy-Session | nur alte `training_sessions` (nicht Fährte) | wird als letztes Training angezeigt | – |
| Lernstufe/Trend | letzte Übung Festigen, davor Lernen | „Festigen ↑“ | – |
| Alte Sterne | letzte Übung 4 Sterne | „alte Bewertung 4/5“, kein Trend | – |
| Ladefehler | Abfrage scheitert | Karte unverändert ohne Zeile; Tab zeigt „Konnte nicht geladen werden · Erneut“ | Wiederholen-Knopf |
| Weiter | Tipp auf Weiter | `/unit/document` mit `dogId` (+ `discipline` der letzten Sparte im Tab) | – |

</frozen-after-approval>

## Code Map

- `components/dogs/DogCompactCard.tsx` -- Slot `lastTrainingLabel` existiert (heute `null`, Präfix „Zuletzt:“ hart kodiert) → i18n, zweite Zeile für offenen Hinweis, Aktion „Weiter“.
- `app/(tabs)/dogs.tsx` Z. 109–118 -- befüllt `lastTrainingLabel` (heute `null`); `onTraining` öffnet bereits `/unit/document?dogId`.
- `app/(tabs)/training.tsx` -- Training-Hub (Timer, Dokumentieren, Journal, Fährten) → Abschnitt „Weitermachen“ oben einfügen, Rest unverändert.
- `services/trainingUnitService.ts` `getTrainingUnits(owner, dog)` (mit Übungen, sortiert) -- lesend, `.limit()` ergänzen am Aufrufer.
- `services/training.ts` `getTrainingSessions` + `services/trainingFeed.ts` `sessionToFeedItem` -- Legacy-Normalisierung wie in `services/trainingPreparation.ts` (Fährten `type 'track'` ausgeschlossen).
- `services/trainingDocumentService.ts` `listServerTrainingFocuses(owner, dogId)` -- offene Hinweise je Hund.
- `features/training/documentation/learningLevel.ts`, `model.ts` (`lastExerciseHistory`) -- Lernstufe/Trend.
- Neu: `features/training/continue/summary.ts` (reine Logik: letztes Training, Tage, Sparte, Übungen mit Stufe/Trend, 3 frühere) + `hooks/useDogTrainingSummary.ts` (Laden über bestehende Dienste, Abbruch bei Hund-Wechsel).
- `i18n/*` -- neue Texte.

## Tasks & Acceptance

**Execution:**
- [x] `features/training/continue/summary.ts` -- reine Zusammenfassung inkl. Legacy und Relativdatum -- testbar
- [x] `hooks/useDogTrainingSummary.ts` -- lesend laden (Units limit 4, Legacy limit 4, Hinweise), Fehler/Retry
- [x] `components/dogs/DogCompactCard.tsx` + `app/(tabs)/dogs.tsx` -- Zeile + Hinweis + Weiter
- [x] `components/training/ContinueTrainingSection.tsx` + `app/(tabs)/training.tsx` -- Abschnitt Weitermachen
- [x] `i18n/*`
- [x] Tests: `summary` (alle Matrixfälle), Abschnitt/Karte (Anzeige, Weiter-Ziel, Fehler)

**Acceptance Criteria:**
- Given beliebige Daten, when Hundeliste und Training-Tab geöffnet werden, then werden keine Schreib-Requests ausgelöst.
- Given ein Hund-Wechsel im Tab, when ältere Antworten spät eintreffen, then wird nie ein Training des falschen Hundes angezeigt.

## Implementation Notes

- Umsetzung direkt in der Sitzung; nur lesende Abfragen. Trendfenster: 12 neue Einheiten, Anzeige letztes + 3 frühere.
- Hundekarte: Hülle `DogCardWithLastTraining` in `app/(tabs)/dogs.tsx`; „Weiter“ übergibt die erste Sparte des letzten Trainings.
- Speichern/Löschen (document, timer, summary, detail, useFeedDelete) aktualisieren zusätzlich `['dogTrainingSummary']`.
- Bestehende Suites `app/__tests__/dogs-training-document-navigation.test.tsx` und `app/(tabs)/__tests__/training.test.tsx` liefen nach der ersten Fassung nicht mehr (Supabase-Import) – mit Mocks repariert, Kartenselektor präzisiert.
- Vorbestehend/flaky: `useTrackRecorder.startup.test.tsx` scheitert nur unter Last (einzeln 37/37 grün); kein Tracking-Code geändert.

## Spec Change Log

## Review Triage Log

| # | Befund | Verdikt | Route |
|---|---|---|---|
| 1 | Bestehende Dogs-/Training-Tab-Suites laden nicht mehr (verif.) | high | patch: Mocks + Selektor |
| 2 | Keine Aktualisierung nach Speichern/Löschen (alle) | medium | patch: Invalidierung an 5 Stellen |
| 3 | Falsches „Noch kein Training“ bei deaktivierter Query (blind, edge) | medium | patch: `isPending` + `data` |
| 4 | Fehlerzeile und alte Daten gleichzeitig (edge) | low | patch |
| 5 | Trendfenster zu klein (blind, edge) | medium | patch: 12 Einheiten |
| 6 | NaN-Tage bei ungültigem Datum; Sortierung mit Zeitanteil (edge) | low | patch + Tests |
| 7 | Mehrdeutige Identität springt auf ältere Einheit (edge) | low | patch + Test |
| 8 | Hinweis-Status/Tie-Break (blind, edge) | low | patch + Test |
| 9 | „1 Übungen“, rohes ISO-Datum (blind, edge) | low | patch: Einzahl, formatDate |
| 10 | Weiter ohne Sparte bei mehreren/Karte (blind, edge) | low | patch: erste Sparte |
| 11 | Karte ungetestet (verif.) | medium | patch: `DogCompactCard.test.tsx` |
| 12 | A11y-Label „Weiter“ ohne Kontext (blind) | low | patch: Hundename |
| 13 | 3 Abfragen pro Hund (blind) | low | abgelehnt: React-Query-Cache, wenige Hunde je Konto |
| 14 | Dev-Vorschau ohne „Zuletzt:“ (blind, edge) | low | abgelehnt: nur Entwickler-Route |
| 15 | Hinweisliste paginiert (edge) | maybe-false | defer |
| 16 | Feste deutsche Labels „Fährte/Statistik“ (blind) | low | abgelehnt: vorbestehend |

## Verification

**Commands:**
- `npx jest features/training components/training components/dogs "app/(tabs)" hooks` -- grün
- `npx tsc --noEmit` -- 0 Fehler
- ESLint auf geänderten Dateien -- keine neuen Fehler
- `git diff --check` -- sauber

**Manual checks (if no CLI):**
- Gerät/Simulator „Nachher“: Hundeliste und Training-Tab mit mehreren Hunden, ohne Training, nur Legacy.
