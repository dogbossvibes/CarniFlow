---
title: 'Trainingsdoku Etappe 3: Verlauf mit Übungs-Matrix (T-184, gh-31)'
type: 'feature'
created: '2026-11-10'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: 'f765156ea00dd72b09e62b8cb32eb587a8b12382'
context: ['{project-root}/_bmad-output/trainingsdoku-neu-spec.md', '{project-root}/_bmad-output/implementation-artifacts/spec-gh-31-trainingsdoku-etappe2.md', '{project-root}/AGENTS.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Man sieht nicht auf einen Blick, welche Übungen eines Hundes gut laufen, wo es hakt und was lange nicht trainiert wurde.

**Approach:** Neuer, rein lesender Screen „Verlauf“ pro Hund (Mockup „3 · Verlauf mit Übungs-Matrix“), erreichbar aus „Weitermachen“ im Training-Tab: Sparten-Tabs (Sparten des Hundes + „Alle“), Matrix pro Übung über die letzten 6 Trainings als Lernstufen-Punkte mit Legende, ↓ markiert Rückschritte, Hinweis auf eine zurückgefallene und seit ≥ 7 Tagen nicht mehr trainierte Übung, offene Hinweise, Liste aller Trainings (antippen → Detail).

## Boundaries & Constraints

**Always:** Nur lesen (bestehende Abfragen wie Etappe 2, grösseres Fenster für die Matrix). Lernstufe/Trend ausschliesslich über `learningLevel.ts`; alte Sterne als eigener, neutraler Punkt „alte Bewertung“, nie als Lernstufe; „nicht trainiert“ als leerer Ring. Zeilen pro Übung über `exercise_identity_id`; Einträge ohne Identität (alte Daten) als eigene Zeile nach Sparte + Name, nie mit identitätsgebundenen Zeilen zusammengelegt. Farben unterscheiden sich auch in Helligkeit, zusätzlich Symbole (✓ Sitzt, ↓ Rückschritt) – nie Farbe allein. Text ≥ 4,5:1, Bedienelemente ≥ 44 pt, jede Zelle mit Screenreader-Text.

**Never:** Keine Schreibpfade, keine Migration, keine Fährten-/GPS-Daten, kein Ändern von Hinweisen. Kein Commit auf main, kein Push/Merge/OTA/Build.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Matrix | 8 Trainings Unterordnung | Spalten = letzte 6 Trainings dieser Sparte (alt → neu), Zeilen = Übungen | – |
| Rückschritt | Übung Festigen → Lernen | Zelle „Lernen“ mit ↓ | – |
| Alte Sterne | Übung mit 4 Sternen | neutraler Punkt „alte Bewertung 4/5“, kein ↓ | – |
| Nicht trainiert | Übung fehlt in einem Training | leerer Ring | – |
| Lange nicht trainiert | letzte Zelle ↓, letztes Training der Übung vor ≥ 7 Tagen | Hinweiszeile mit Übungsname und Tagen | – |
| Tab „Alle“ | mehrere Sparten | Matrix über alle Sparten | – |
| Keine Trainings | Hund ohne Trainings | „Noch kein Training“ | – |
| Ladefehler | Abfrage scheitert | Fehlerzeile mit „Erneut“ | Retry |

</frozen-after-approval>

## Code Map

- Neu `app/unit/progress.tsx` (Route `/unit/progress?dogId=…&discipline=…`) -- Screen; der frühere `/unit/history` wurde app-weit entfernt (Kommentar in `app/(tabs)/training.tsx`), daher neuer Name.
- Neu `features/training/continue/matrix.ts` -- reine Logik: Spalten, Zeilen, Zellen (Stufe/alt/leer, ↓), Rückfall-Hinweis.
- `hooks/useDogTrainingSummary.ts` -- Ladefunktion um eine Variante mit grösserem Fenster erweitern (`useDogTrainingHistory`, z. B. 30 Einheiten + 10 alte Sessions, Hinweise), gleicher Lese-Weg, eigener Query-Key; Invalidierung nach Speichern/Löschen ergänzen (gleiche 5 Stellen wie Etappe 2).
- `components/training/ContinueTrainingSection.tsx` -- Link „Verlauf ansehen“ → `/unit/progress?dogId`.
- `learningLevel.ts`, `labels.ts`, `i18n/*`, `constants/colors.ts` (bestehende Farben, ggf. neue Stufenfarben lokal im Screen).

## Tasks & Acceptance

**Execution:**
- [x] `features/training/continue/matrix.ts` + Tests (alle Matrixfälle)
- [x] `hooks/useDogTrainingSummary.ts` -- `useDogTrainingHistory` + Invalidierung
- [x] `app/unit/progress.tsx` -- Screen (Tabs, Matrix, Legende, Rückfall-Hinweis, offene Hinweise, Liste)
- [x] `ContinueTrainingSection.tsx` -- Einstieg
- [x] `i18n/*`
- [x] Tests: Screen (Tabs, Zellen-Labels, Liste → Detail, Fehler), Einstieg

**Acceptance Criteria:**
- Given der Verlauf-Screen, when er geöffnet wird, then werden keine Schreib-Requests ausgelöst.
- Given ein Screenreader, when eine Zelle fokussiert wird, then wird Datum, Übung und Stufe (oder „nicht trainiert“/„alte Bewertung“) vorgelesen.

## Implementation Notes

- Sparten-Tabs kommen aus den geladenen Trainings (nicht aus den Hundeprofil-Sparten): nur Sparten mit Daten ergeben eine Matrix. Unbekannte/verschwundene Sparte (Link-Parameter, gelöschtes Training) fällt auf „Alle“ zurück.
- Vorgänger/↓ nur über `exercise_identity_id` (wie Etappe 2). Kommt eine Identität in einem Training mehrfach vor, gilt sie als mehrdeutig: kein ↓ dort und im Folgetraining (vorsichtiger als die Karte in Etappe 2, die nur das ältere Training prüft).
- Ladefenster 40 Einheiten / 15 alte Sessions; erreicht eine Quelle ihr Limit, wird das gemeinsame Fenster beim jüngsten Abbruchtag gekappt (`loadDogTrainingHistory`, `truncated`), damit keine stille Lücke entsteht. Nichts wird gelöscht.
- Rückschritt: Stufenpunkt bleibt sichtbar (z. B. „L↓“) mit orangem Rand. Stufenfarben mit abgestufter Helligkeit (neu hell → sitzt dunkel), Symbolkontrast ≥ 4,5:1 per Test.
- Offene Hinweise im Sparten-Tab nach `discipline_key` der Übungen dieser Sparte gefiltert, sortiert wie Etappe 2.

## Spec Change Log

## Review Triage Log

| # | Befund | Verdikt | Route |
|---|---|---|---|
| 1 | Getrennte Limits 40/15 → stille Lücke in „Alle Trainings“/Spalten (blind, edge) | medium | patch: Fenster kappen + Test |
| 2 | Unbekannte Sparte aus Link → kein Tab aktiv, falscher Leerzustand (blind, edge, verif.) | medium | patch: Rückfall auf „Alle“ + Test |
| 3 | Dauer-Spinner ohne `dogId`/Session (blind, edge) | medium | patch: `isLoading` + Test |
| 4 | Offene Hinweise ignorieren Sparten-Tab, unsortiert (blind) | medium | patch + Test |
| 5 | Stufenfarben ohne Helligkeitsabstufung (verif.) | high | patch: neue Farben + Kontrast-/Helligkeitstest |
| 6 | Rückschritt ersetzt Stufe optisch (verif.) | medium | patch: „L↓“ + Rand + Test |
| 7 | „trainiert, ohne Stufe“ fehlt in Legende, kaum vom Ring unterscheidbar; Legende 8 pt (blind, edge, verif.) | low | patch |
| 8 | Trend über Namen / Duplikate (eigene Prüfung vor Review) | medium | patch + Tests |
| 9 | Alte Einträge ohne Übungen fehlten in „Alle Trainings“ (eigene Prüfung) | medium | patch + Test |
| 10 | Fehlende Tests: 40/15, Nur-Lesen, Key-Präfix, Tab „Alle“, Rückfall-Hinweis, Unit-Navigation (verif.) | medium | patch: Tests ergänzt |
| 11 | Rückfall-Hinweis Gleichstand nicht deterministisch (blind) | low | patch: Name als Tie-Break |
| 12 | Duplikat-Regel weicht von Etappe 2 ab (edge) | low | defer: Matrix vorsichtiger, dokumentiert |
| 13 | Zweites Duplikat im selben Training unsichtbar (blind, edge) | low | defer |
| 14 | Gleichnamige Zeilen (alt ohne Identität + neu) ohne Kennzeichnung (blind, edge) | low | defer: gewollt (nie über Namen zusammenlegen) |
| 15 | Mehrere Trainings am selben Tag: gleiche Spaltenköpfe/Labels (edge) | low | defer |
| 16 | `session_date` als UTC-Timestamp bei alten Sessions (edge) | maybe-false | defer: Schema prüfen, gleiche Logik wie Etappe 2 |
| 17 | `today` beim Öffnen eingefroren (blind) | low | abgelehnt: Screen wird kurz genutzt |
| 18 | Tabs nicht aus Hundeprofil-Sparten (verif.) | low | abgelehnt: dokumentiert, nur Sparten mit Daten |

## Verification

**Commands:**
- `npx jest app components features hooks stores` -- siehe T-184.md (keine Klammer-Filter)
- `npx tsc --noEmit` -- 0 Fehler
- ESLint geänderte Dateien gegen Basis -- keine neuen Fehler
- `git diff --check` -- sauber
