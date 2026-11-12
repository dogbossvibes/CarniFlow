---
title: 'Trainingsdoku: Speicher-Hinweis + „Allgemeines Training“ (T-184, gh-31)'
type: 'feature'
created: '2026-11-12'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: '2f7a1e7fa73fcaece3cce4740a2dad7c3aeaf35c'
context: ['{project-root}/_bmad-output/implementation-artifacts/spec-gh-31-trainingsdoku-hundeseite.md', '{project-root}/AGENTS.md']
---

## Intent

**Problem:** Gerätetest der Nutzerin 2026-11-12 (Build 60): Training komplett ausgefüllt, „Einheit speichern“ blieb aus. Ursache: Speichern braucht mindestens eine Übung (Regel seit 2026-10-15), der kleine graue Hinweis „Übung auswählen“ war leicht zu übersehen. Manche Trainings haben keine bestimmte Übung.

**Approach (Entscheid der Nutzerin „ja so bauen“, Variante 1 + Allgemeines Training):**
1. Hinweis über dem Knopf wird ein deutlicher, antippbarer Text „Wähle mindestens eine Übung, um zu speichern“; Tipp öffnet die Übungsauswahl und scrollt zu „Heute trainiert“.
2. Erster Eintrag in der Übungsauswahl (nur beim Erfassen): „Allgemeines Training“. Gespeichert als normale Übung der Sparte – die Sparte bleibt erhalten, keine DB-Änderung.
3. In der Übungs-Matrix ausgeblendet (Zeilen, Spalten, Trend, Rückfall-Hinweis); in „Alle Trainings“, als letztes Training und als Sparten-Reiter sichtbar.

**Never:** Speichern ohne Übung; Änderungen an Speichern/Retry/Entwurf/Konflikt-Token; Migration; Tracking.

## Umsetzung

- `app/unit/document.tsx`: Fusszeile – bei gewähltem, geladenem Hund, Erfassen-Modus und keiner Übung ein Knopf (≥ 44 pt, Akzentfarbe, Screenreader-Hinweis + Ansage), deaktiviert bei Speichern/Fertig/ausstehendem Speichern; sonst unveränderte Hinweise. `suggestions` beginnt im Erfassen-Modus mit `trainingFlow.generalTraining`.
- `features/training/documentation/generalExercise.ts`: `isGeneralExercise` erkennt den Namen in allen 5 App-Sprachen (aus den Wörterbüchern).
- `features/training/continue/matrix.ts`: Matrix nur aus Nicht-Allgemein-Übungen; Trainings-Liste und Sparten unverändert.
- Texte `trainingFlow.generalTraining`, `trainingFlow.chooseExerciseToSave` in de-CH, gsw-CH, en, fr, it.

## Review-Triage (3 Prüfer)

Behoben: Hinweis während ausstehendem Speichern deaktiviert; Hinweis nur, wenn der Hund geladen ist (sonst Hund-Hinweis wie bisher); Screenreader-Hinweis und Ansage nach dem Tipp; gsw-Text; Tests für Bearbeiten-Modus, Wiederverwendung einer bestehenden Allgemein-Übung (keine neue Identität), Trend über ein reines Allgemein-Training hinweg, letztes Training, Erkennung je Sprache.

Zurückgestellt (bewusst, `components/training/ExerciseIdentityList.tsx` nicht angefasst, weil die Datei vorbestehende react-hooks-Fehler trägt und ein Umbau der Ladelogik für dieses Update zu riskant ist):
- Sprachwechsel nach dem ersten Anlegen erzeugt beim nächsten Tipp eine zweite Allgemein-Übung in der neuen Sprache (beide in der Matrix ausgeblendet, im Verlauf getrennt).
- Eine umbenannte Allgemein-Übung wird nicht mehr erkannt und erscheint dann in der Matrix (Umbenennen nur im Bearbeiten-Modus).
- Eine eigene Übung, die zufällig exakt „Allgemeines Training“ (o. ä. in einer App-Sprache) heisst, wird in der Matrix ausgeblendet.
- Deaktivierter Speichern-Knopf ohne eigenen Screenreader-Hinweis (`AnimatedPressable` kennt `accessibilityHint` nicht); der Hinweisknopf darüber trägt ihn.

## Prüfungen (2026-11-12)

Voller Jest-Lauf 582 Suites grün, 6 übersprungen, 6669 Tests grün; einziger Fehler `scripts/__tests__/productionNativeContract.test.ts` (Build-57-Version, vorbestehend). `npx tsc --noEmit` 0; ESLint auf allen geänderten ts/tsx seit `51d7d706` 0 Fehler; `git diff --check` sauber.
