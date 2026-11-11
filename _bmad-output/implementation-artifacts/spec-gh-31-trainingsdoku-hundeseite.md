---
title: 'Trainingsdoku Etappe 3b: Ein Ort pro Hund – Seite „Training von <Hund>“ (T-184, gh-31)'
type: 'feature'
created: '2026-11-11'
status: 'done'
review_loop_iteration: 1
route: 'dispatch'
baseline_commit: 'b6ef690f5aa19431b495ddb291e68a1a37ffb46b'
context: ['{project-root}/_bmad-output/implementation-artifacts/spec-gh-31-trainingsdoku-etappe2.md', '{project-root}/_bmad-output/implementation-artifacts/spec-gh-31-trainingsdoku-etappe3.md', '{project-root}/AGENTS.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nutzerin-Test 2026-11-11 (Build 60, Etappe 1–3 live): Die neuen Teile sind schwer zu finden. „Letztes Training“ steht an drei Orten (Training-Tab, Hundekarte, Erfassen), die Matrix ist nur über einen kleinen Link im Kasten „Weitermachen“ erreichbar.

**Approach:** Ein Ort pro Hund (Mockup „Training von Yam“, von der Nutzerin am 2026-11-11 mit „passt so“ bestätigt). Eine Seite pro Hund mit, von oben nach unten:
1. grosser Knopf „Training erfassen“,
2. „Letztes Training“ mit offenem Hinweis,
3. „Übungen im Überblick“ (die bestehende Matrix, direkt sichtbar, Legende darunter),
4. „Alle Trainings“ dieses Hundes.

Erreichbar über eine neue Zeile „Training von <Hund>“ auf jeder Hundekarte (Tab Hunde) und über die Hundeauswahl im Training-Tab. Der Kasten „Weitermachen“ wird dafür auf die Hundeauswahl reduziert, damit nichts doppelt steht.

## Boundaries & Constraints

**Always:** Nur Ansicht und Navigation. Bestehende Abfragen (`useDogTrainingSummary`, `useDogTrainingHistory`) und Logik (`matrix.ts`, `learningLevel.ts`) wiederverwenden. Alte Sterne bleiben lesbar. Text ≥ 4,5:1, Bedienelemente ≥ 44 pt, Screenreader-Texte, Dark Mode, alle 5 Sprachen.

**Never:** Keine Migration, keine Schreibpfade, kein Ändern des Erfassen-Bildschirms (`app/unit/document.tsx`), kein Tracking/GPS. Bestehende Ziele der Hundekarte (Profil `/dog/[id]`, Fährte, Statistik) bleiben erreichbar. Kein Commit auf main, kein Push/Merge/OTA/Build ohne eigene Freigabe.

</frozen-after-approval>

## Umsetzung (Vorschlag)

1. **Seite ausbauen statt neu bauen:** `app/unit/progress.tsx` wird zur Seite „Training von <Hund>“.
   - Kopf mit Hundename und Zurück.
   - Oben der Knopf „Training erfassen“ → `/unit/document?dogId` (+ Sparte des letzten Trainings, wie heute „Weiter“).
   - Karte „Letztes Training“ aus `useDogTrainingSummary` (gleiche Darstellung wie heute in `ContinueTrainingSection`; als kleine Komponente herauslösen und dort wiederverwenden).
   - Darunter die bestehenden Bereiche Sparten-Reiter, Matrix, Legende, offene Hinweise, Trainingsliste in dieser Reihenfolge.
   - Route bleibt `/unit/progress?dogId=…`, damit bestehende Links weiter funktionieren.
2. **Hundekarte (`components/dogs/DogCompactCard.tsx`, `app/(tabs)/dogs.tsx`):** Neue volle Zeile „Training von <Hund> ›“ unter dem letzten Training, führt zur Seite. Die Schnellknöpfe Training/Fährte/Statistik bleiben.
3. **Training-Tab (`components/training/ContinueTrainingSection.tsx`):** Kasten wird zur Liste „Deine Hunde“: pro Hund eine Zeile mit Name + „Letztes Training: vor X Tagen · Sparte“ → Seite. Bei genau einem Hund direkt dessen Zeile. Die doppelte Anzeige des letzten Trainings und der Link „Verlauf ansehen“ entfallen.
4. **Texte:** neue Schlüssel (`dogTraining.title` „Training von {name}“, `dogTraining.capture`, `dogTraining.overview`, `dogTraining.all`, `dogTraining.open`) in allen 5 Sprachdateien; nicht mehr genutzte Schlüssel stehen lassen (keine Löschung in derselben Etappe).

## I/O & Edge-Case Matrix

| Szenario | Zustand | Erwartet |
|---|---|---|
| Hund ohne Training | keine Einträge | Seite zeigt „Training erfassen“ + „Noch kein Training“; keine leere Matrix |
| Nur alte Einträge | Sterne, keine Lernstufen | Letztes Training mit „alte Bewertung x/5“, Matrix mit neutralen Punkten |
| Mehrere Hunde | 6 Hunde | Training-Tab: 6 Zeilen, je Tipp → richtige Seite |
| Gelöschter Hund | Link mit alter dogId | Seite zeigt „Hund nicht gefunden“ + Zurück, kein Absturz |
| Geteilter Hund („Mit mir geteilt“) | fremder Besitzer | offen, siehe Fragen; bis geklärt keine neue Zeile auf diesen Karten |
| Laden fehlgeschlagen | Netzfehler | Hinweis + „Erneut versuchen“, wie heute |
| Nach dem Speichern | neues Training | Seite und Hundekarte aktualisieren sich (Query-Key `dogTrainingSummary`) |

## Tests

- Seite: Reihenfolge der Bereiche, Knopf öffnet Erfassen mit richtigem Hund/Sparte, leerer Hund, unbekannter Hund, Ladefehler.
- Hundekarte: neue Zeile vorhanden, führt zu `/unit/progress?dogId`, bisherige Knöpfe unverändert.
- Training-Tab: eine Zeile pro Hund, Navigation, kein doppeltes „Letztes Training“.
- Bestehende Tests für Matrix, Verlauf, Weitermachen und Hundekarte angepasst, nicht gelöscht.
- Voller Jest-Lauf, `npx tsc --noEmit`, ESLint auf dem Diff (0 Fehler), `git diff --check`, Review mit 3 Prüfern.

## Auslieferung

Keine Migration nötig. Nach Freigabe der Nutzerin: Branch auf aktuellen Build-60-Production-Stand, Prüfzentrum, OTA nur iOS Build 60 über den Wrapper (gesteuert von MASTER), Test auf TestFlight.

## Entscheide der Nutzerin (2026-11-11, „Ja, so bauen“)

1. Geteilte Hunde bekommen vorerst keine Trainingsseite (sie laufen über `SharedDogsInbox`, nicht über `DogCompactCard`).
2. Der Tipp auf die ganze Hundekarte bleibt beim Profil; die Trainingsseite kommt über die neue Zeile.

## Umsetzungsnotizen

- `app/unit/progress.tsx`: Kopf „TRAINING · <Hund>“ (Screenreader: „Training von <Hund>“), Knopf „Training erfassen · <Sparte>“ (gewählter Tab bzw. Link-Sparte, sonst erste Sparte des letzten Trainings – die Sparte steht sichtbar im Knopf), `LastTrainingCard`, danach Tabs/Matrix/Legende/Rückfall/Hinweise/Alle Trainings. Ladefehler Hunde → Fehlertext + Neu laden (nicht „nicht gefunden“); Ladefehler Zusammenfassung → Erneut versuchen. Der Hinweis der Karte wird nur aus der Hinweisliste entfernt, wenn die Karte sichtbar ist (`openHint.id` neu in `summarizeTraining`).
- `components/training/LastTrainingCard.tsx` (neu): letztes Training mit Lernstufe/Trend bzw. alter Bewertung, Pfeil, Hinweis; Screenreader-Text inkl. Übungen.
- `components/training/ContinueTrainingSection.tsx`: Titel „Deine Hunde“, eine Zeile pro Hund (letztes Training, Hinweis) → Hundeseite; bei Ladefehler lädt der Tipp neu.
- `components/dogs/DogCompactCard.tsx` + `app/(tabs)/dogs.tsx`: Zeile „Training von <Hund> ›“ (optional per `onTrainingPage`); Karte `accessible={false}`, oberer Bereich ist ein eigenes Bedienhilfen-Element mit Aktion „Profil öffnen“, damit Zeile und Schnellknöpfe einzeln erreichbar sind.
- Texte `dogTraining.*` in de-CH, gsw-CH, en, fr, it.

## Review-Triage (3 Prüfer: Korrektheit, Bedienhilfen/UX, Tests)

Behoben: Hunde-Ladefehler als „nicht gefunden“; fehlender Fehlerzustand der Zusammenfassung; Hinweis verschwand ohne letztes Training; Retry im Training-Tab (Tipp lädt neu statt zu navigieren); Erfassen-Sparte unsichtbar → im Knopf; Link-Sparte während Laden; Screenreader-Texte (Kopf, Karte mit Übungen, Zeilen mit Hinweis/Laden); Karten-Gruppierung für VoiceOver; Titel „Deine Hunde“; fr Du-Form, gsw-Wortlaut; fehlende Tests (alte Sterne, mehrere Sparten, Session-Route, 6 Hunde, Fehlerfälle, widersprüchliche Fixture, trivialer Spinner-Test).

Zurückgestellt (kein Fehler, eigene Entscheidung nötig): Schnellknopf „Training/Weiter“ auf der Karte umbenennen; en „{name}'s training“ vs. „Training: {name}“; fr „Saisir un/l'entraînement“ vereinheitlichen; Zusammenfassung und Verlauf aus einer Abfrage (kurzes Doppel-/Flackern nach Invalidierung möglich); Hinweis der Karte stammt im Sparten-Tab evtl. aus einer anderen Sparte. VoiceOver-Verhalten der Karte am Gerät prüfen.

## Prüfungen (2026-11-11)

Voller Jest-Lauf 571/572 Suites, 6563/6564 Tests; einziger Fehler `scripts/__tests__/productionNativeContract.test.ts` (prüft Build-57-Version 1.0.6, Branch ist Build-60-Linie 1.0.8; vorbestehend, nicht Teil dieser Änderung). `npx tsc --noEmit` 0; ESLint auf allen geänderten ts/tsx seit `b676b403` 0 Fehler; `git diff --check` sauber.

## Offene Fragen an die Nutzerin (beantwortet, siehe Entscheide)

1. Geteilte Hunde („Mit mir geteilt“): sollen sie auch eine Trainingsseite bekommen (nur lesen) oder vorerst nicht?
2. Soll ein Tipp auf die ganze Hundekarte künftig direkt zur Trainingsseite führen (Profil dann über einen eigenen Knopf), oder bleibt der Kartentipp beim Profil und die Trainingsseite kommt über die neue Zeile? Vorschlag: neue Zeile, Kartentipp unverändert.
