---
title: 'Trainingsdoku Etappe 1: Erfassen auf einem Screen mit Lernstufe und Trend (T-184, gh-31)'
type: 'feature'
created: '2026-11-09'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: '3bb7894364f26429c7e2a9f8e8e22dd70cf03817'
context: ['{project-root}/_bmad-output/trainingsdoku-neu-spec.md', '{project-root}/AGENTS.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Ein Training braucht heute drei Schritte (Vorbereiten → Dokumentieren → Nächstes Mal), das letzte Training liegt hinter einem Link, und die Sternebewertung pro Übung zeigt keinen Fortschritt.

**Approach:** Neues Training auf **einem** Screen: „Letztes Mal“ oben angeheftet, Übungen vom letzten Mal vorgewählt und als trainiert markiert, pro Übung Lernstufe (Neu / Lernen / Festigen / Sitzt) mit automatischem Trend, „Fürs nächste Mal“ und Details eingeklappt. Lernstufe in `rating` als 1/2/4/5.

**Entscheide (9.11.2026):**
1. **Alt/neu über neue Spalte:** `training_exercises.rating_scale` text, nullable, rein additiv. Leer = Sterne (alle bestehenden und von älteren Apps geschriebenen Einträge), `'lernstufe'` = neu. Keine Änderung bestehender Daten. Die atomare Speicherfunktion wird so angepasst, dass sie `rating_scale` speichert und zurückgibt. Migration nur **vorbereiten**, nicht ausführen; Ausführung erst nach ausdrücklicher Freigabe über den MASTER, **vor** der OTA.
2. **Einstiege umlenken:** Einfacher Timer (`app/unit/timer.tsx`) bleibt und führt mit Dauer in den neuen Erfassen-Screen. Einstiege in den Live-Ablauf mit Sternen (Coach, leeres Journal, KI-Hub) führen auf den neuen Screen. Live-Screens werden nicht gelöscht; ein bereits laufendes Live-Training lässt sich nach der OTA noch abschließen; alte Einträge bleiben lesbar.

## Boundaries & Constraints

**Always:** Bestehende Trainings, Entwürfe (inkl. alter `workflowStep`-Entwürfe) und Offline-/Retry-Speicherungen bleiben ladbar, bearbeitbar und speicherbar. Werte mit leerem `rating_scale` werden nie umgedeutet: Anzeige „alte Bewertung x/5“, kein Trend, keine Vorbelegung. Pflichtangabe nur 1 Übung. Text ≥ 4,5:1, Bedienelemente ≥ 44 pt. Bestehende Speicherpfade (`training_document_v1`, `saveIntent`, `retry`, `draft.ts`) wiederverwenden.

**Never:** Migration ausführen oder Live-DB schreiben; bestehende `rating`-Werte umrechnen; Live-Screens löschen; Tracking/GPS, Training-Tab, Hundekarte, Verlauf, Sprachnotiz, Fährtenverknüpfung ändern (Etappen 2–5). Kein Commit auf main, kein Merge, keine OTA, kein Build.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Vorgeschichte mit Lernstufe | letzte Übung `rating=2, rating_scale='lernstufe'` | vorgewählt, `performed=true`, Stufe „Lernen“ vorbelegt | – |
| Stufe hoch | Lernen (2) → Festigen (4) | Trend ↑, gespeichert `rating=4, rating_scale='lernstufe'` | – |
| Vorgänger Sterne | `rating=3`, `rating_scale` leer | „alte Bewertung 3/5“, keine Vorbelegung, kein Trend | – |
| Übung abgewählt | vorgewählt, dann abgewählt | nicht gespeichert | – |
| Altes Training bearbeiten | Sterne, keine Neubewertung | `rating` und `rating_scale` unverändert | – |
| Alter Entwurf | `workflowStep: 2` | lädt vollständig in den Ein-Screen | – |
| Laufendes Live-Training nach OTA | aktiver Live-Eintrag | LiveTrainingBar öffnet weiter `live.tsx`, Abschluss über `summary.tsx` möglich | bestehend |
| Timer beendet | Dauer gemessen | Erfassen-Screen mit Dauer | – |
| Offline | kein Netz | Entwurf/Retry wie bisher, Hinweis sichtbar | bestehender Retry |

</frozen-after-approval>

## Code Map

- `app/unit/document.tsx` (934 Z.) -- `workflowStep` 0/1/2 (Z. 187, 196, 612–617, 691–785, 853–863). Bearbeiten-Modus zeigt bereits alles auf einem Screen (`editing || workflowStep === n`) → neuen Eintrag wie Bearbeiten-Layout. Restore Z. 255: `workflowStep` tolerant ignorieren, Feld im Typ behalten. Validierung `rating` 1–5 (Z. 107) bleibt.
- `components/training/SelectedExerciseCard.tsx` -- Sterne/`observationMode`/`historical` → Lernstufen-Chips (≥44 pt), Trend, Altwert-Hinweis.
- `components/training/TrainingPreparation.tsx` -- „Letztes Mal“ angeheftet statt Toggle `preparationOpen`.
- `features/training/documentation/model.ts` -- `planFromHistory` (`performed:false`, `rating:null`) → `performed:true`, Lernstufe nur bei `rating_scale='lernstufe'`; `performedExercises` gibt `rating_scale` mit; `lastExerciseHistory` für Trend.
- `types/trainingUnit.ts` -- `TrainingExercise.rating_scale?: 'lernstufe' | null`.
- `services/trainingDocumentService.ts` -- RPC `training_document_v1` (`get`/`save`, `p_request` JSON). **Definition nicht im Repo/keinem Worktree versioniert** → muss lesend aus der DB beschafft und in der Migration als `create or replace` mit `rating_scale` (Insert und Rückgabe) ergänzt werden.
- Einstiege: `app/analyse/coach.tsx` Z. 36, 66; `app/training-journal.tsx` Z. 301; `features/ai/components/SmartFeedbackSection.tsx` Z. 27 → `/unit/document`. Unverändert: `app/unit/timer.tsx` (führt bereits mit Dauer zu `/unit/document`), `components/training/LiveTrainingBar.tsx`, `app/unit/live.tsx`, `summary.tsx`, `start.tsx`.
- `constants/colors.ts` -- `textMuted #8A8A8A` statt `muted`/`placeholder` im Screen.
- `i18n/*` -- Texte Lernstufen/Trend/„alte Bewertung“.
- `app/unit/detail.tsx` -- Übungsbewertung über `ratingDisplay` (Lernstufe ohne Stern, alte Bewertung als Stern). (Änderung nach Review, Loop 1)
- `features/training/documentation/retry.ts` -- Retry-Vergleich berücksichtigt `rating_scale`.
- Nicht ändern: `generate-coach-summary`, `insightService`/Analytics (lesen `rating` weiter als 1–5-Skala, Lernstufen bleiben plausibel), Tracking.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/drafts/20261109190000_training_exercises_rating_scale.sql` (Spalte + Wert-Check vorbereitet, ausserhalb `migrations/`, bricht bewusst ab bis RPC ergänzt ist) -- `add column if not exists rating_scale text null check (rating_scale in ('lernstufe'))` + angepasste RPC; **nur Datei, nicht ausführen**
- [ ] RPC-Definition `training_document_v1` lesend beschaffen (Weg mit MASTER klären) und in Migration übernehmen -- ohne sie speichert die App `rating_scale` nicht
- [x] `features/training/documentation/learningLevel.ts` (neu) -- Stufe↔1/2/4/5, Trend, `isLearningLevel(exercise)` nur über `rating_scale`
- [x] `types/trainingUnit.ts`, `model.ts`, `trainingDocumentService.ts` -- Feld durchreichen
- [x] `SelectedExerciseCard.tsx`, `TrainingPreparation.tsx`, `document.tsx` -- Ein-Screen
- [x] Einstiege umlenken (coach, training-journal, SmartFeedbackSection)
- [x] `i18n/*`
- [x] Tests: `learningLevel`, `model.test.ts`, `document.test.tsx` (Ein-Screen, alter Entwurf, Sterne unverändert); Einstiege ohne eigene Tests (aufgeschoben)

**Acceptance Criteria:**
- Given ein Training, when eine Übung gewählt und gespeichert, then ein Screen, ein Speichern-Knopf.
- Given die Migration ist nicht ausgeführt, when der Code geprüft wird, then keine DB-Schreibaktion und die Migration liegt nur als Datei vor.
- Given Release, then Reihenfolge: Migration (Freigabe) → OTA; vorher Geräteabnahme „Vorher“.

## Implementation Notes

- 2026-11-09 Umsetzung direkt in der Sitzung (keine Umsetzungs-Subagents, nur Prüfer-Agenten freigegeben).
- `learningLevel.ts`: Lernstufe nur bei `rating_scale = 'lernstufe'`; `legacyStars`, `trendOf`.
- `model.ts`: `PlannedExercise.ratingScale`; `planFromHistory` → `performed: true`, Vorbelegung nur bei markierter Lernstufe; `performedExercises` sendet `rating_scale` nur bei Lernstufe (Altzeilen unverändert ohne Feld).
- `document.tsx`: `workflowStep`-State, Schrittanzeige und BackHandler entfernt; Entwurf schreibt `workflowStep` nur noch rückwärtskompatibel (0/1). „Letztes Mal“ (`TrainingPreparation`) immer sichtbar; Vorwahl der letzten Übungen einmal pro Hund/Sparte im Lade-Callback (nicht in einem Effect), nur ohne geladenen Entwurf. Ein Speichern-Knopf. Kontrast: `C.textMuted` für Labels/Hilfetexte/Platzhalter.
- `SelectedExerciseCard.tsx`: Lernstufen-Chips (Radio, ≥44 pt), Trend ↑/↓/→, „alte Bewertung x/5“, Notiz und „Fürs nächste Mal“ direkt sichtbar; Herkunftswahl bleibt in Details.
- Einstiege `/unit/start` → `/unit/document`: Coach (2×), leeres Journal, KI-Hub. `timer.tsx`, `live.tsx`, `summary.tsx`, `start.tsx`, `LiveTrainingBar` unverändert.
- **Offen (extern):** RPC `training_document_v1` nicht im Repo – Definition muss lesend aus der DB kommen; die Migrationsdatei bricht bis dahin mit `raise exception` ab.
- **Befund ausserhalb Scope:** Home-FAB „Training starten“ (`components/home/FabQuickAddSheet`) führt weiter auf `/unit/start` (Live-Ablauf mit Sternen); in der Entscheidung nicht genannt → Nutzerentscheid nötig.
- Tests: neu `learningLevel.test.ts`; `model.test.ts` und `document.test.tsx` an Ein-Screen angepasst, Schutzaussagen erhalten; neue Fälle: Trend/Vorbelegung, Abwählen, alter `workflowStep: 2`-Entwurf, Sterne beim Bearbeiten ohne `rating_scale`.
- Vorbestehend rot (nicht durch diese Änderung): `scripts/__tests__/productionNativeContract.test.ts` erwartet 1.0.6, Basis hat 1.0.8. ESLint `document.tsx`: 4 vorbestehende Fehler (Basis 6), keine neuen.

## Spec Change Log

- Loop 1 (Review 2026-11-09): Befund „Detailansicht zeigt Lernstufe als ★4“ (verifiziert, medium). Code Map ergänzt: `app/unit/detail.tsx` nutzt `ratingDisplay`; `retry.ts` vergleicht `rating_scale`. Vermiedener Zustand: dieselbe Übung erscheint im Erfassen-Screen als Lernstufe und direkt danach in der Detailansicht als Sternebewertung. KEEP: Ein-Screen-Aufbau, `learningLevel.ts`, Vorwahl im Lade-Callback, Einstiegs-Umlenkung, alle bestehenden Schutz-Tests. Umsetzung inkrementell auf bestehendem Stand (direkt implementiert, kein Neuaufbau nötig).

## Review Triage Log

| # | Befund (Quelle) | Verdikt | Evidenz / Route |
|---|---|---|---|
| 1 | Client sendet `rating_scale`, RPC/Migration fehlen (alle 3) | medium | Real; bekannt. Release-Reihenfolge Migration+RPC → OTA ist im Intent fixiert; offene Aufgabe „RPC beschaffen“. → defer (Release-Blocker) |
| 2 | Migration in `migrations/` blockiert `db push` (blind, edge) | medium | Verifiziert: Datei lag in `supabase/migrations/` mit `raise exception`. → patch: nach `supabase/drafts/` verschoben |
| 3 | Check erlaubt `lernstufe` mit rating 3/0/7 (blind) | low | Real, trivialer Fix. → patch: `rating in (1,2,4,5)` |
| 4 | Detailansicht zeigt Lernstufe als Stern (blind, verif.) | medium | Verifiziert `app/unit/detail.tsx:206`. → bad_spec, Loop 1, behoben mit `ratingDisplay` + Test |
| 5 | insightService/Analytics lesen `rating` als Sterne (blind) | low | 1/2/4/5 bleibt auf 1–5-Skala plausibel; keine Fehlanzeige. → abgelehnt |
| 6 | Vorwahl speichert Übungen/Stufe ohne Zutun (blind) | false | Vom Intent so beschlossen (vorgewählt = trainiert, Stufe vorbelegt). → abgelehnt |
| 7 | Doppeltap löscht alte Sternebewertung beim Bearbeiten (blind, edge) | medium | Verifiziert. → patch: `legacyRating` wird beim Entfernen der Stufe wiederhergestellt + Test |
| 8 | `restoredDraft` nie zurückgesetzt / Scope verbraucht ohne Vorwahl (blind, edge) | medium | Verifiziert. → patch: Reset bei neuem Hundeentwurf, Scope nur bei tatsächlicher Vorwahl |
| 9 | Entfernte Übungen kommen nach Wiederöffnen zurück – ungetestet (verif.) | medium | Guard vorhanden, Test fehlte. → patch: Remount-Test |
| 10 | Retry-Vergleich ohne `rating_scale` (edge) | low | Verifiziert `retry.ts:30`. → patch |
| 11 | Trend gegen späteres Training beim Bearbeiten / gegen sich selbst (edge) | medium | Verifiziert. → patch: nur frühere Trainings, eigene Einheit ausgeschlossen |
| 12 | Notiz > 500 Zeichen wird beim Bearbeiten gekürzt (edge) | high | Verifiziert: vorher im Bearbeiten ohne maxLength. → patch: `maxLength ≥ Länge` |
| 13 | `historical.trainingNotes` nicht mehr angezeigt (edge) | low | Verifiziert. → patch |
| 14 | performedHint während Laden im Bearbeiten (edge) | false | Gleiches Verhalten vor der Änderung. → abgelehnt |
| 15 | Abwählen nur per Entfernen (edge) | false | Intent: „was nicht gemacht wurde, wird abgewählt“. → abgelehnt |
| 16 | Tote i18n-Keys/Styles (blind, edge) | low | Kein Nutzerschaden. → abgelehnt |
| 17 | „Fürs nächste Mal“ nicht eingeklappt (edge) | false | Quell-Spec: „«Fürs nächste Mal»; Details eingeklappt“ – nur Details eingeklappt. → abgelehnt |
| 18 | Einstiegs-Umlenkung ungetestet (edge, verif.) | low | Real. → defer |
| 19 | `showPreparation` Helfer wirkungslos (alle) | low | Verifiziert. → patch: Helfer entfernt |
| 20 | Intent-Restore-Test ohne `rating_scale` (verif.) | low | → defer (mit RPC-Vertragstest) |
| 21 | Ältere Apps überschreiben Lernstufe ohne Marker (blind) | maybe-false (medium) | Hängt von RPC-Verhalten ab. → defer, im Migrationskopf vermerkt |
| 22 | Locales de-DE/de/gsw fehlen Keys (blind) | false | Fallback auf de-CH; `tsc` grün. → abgelehnt |
| 23 | Rohes ISO-Datum / klein geschriebenes „alte Bewertung“ / Trend-A11y (blind) | low | Kosmetisch, bestehendes Muster. → abgelehnt |
| 24 | Speichern ohne Hund-Existenzprüfung (blind) | false | `canSave` prüft `dogs.some(d => d.id === dogId)`. → abgelehnt |
| 25 | Farb-/Routenänderungen „unbezogen“ (blind) | false | Kontrast und Einstiege sind Teil von Spec/Intent. → abgelehnt |
| 26 | Home-FAB führt weiter zu `/unit/start` (eigener Befund) | – | Nicht im Intent genannt. → Nutzerentscheid |

## Verification

**Commands:**
- `npx jest features/training app/unit components/training app/analyse` -- grün
- `npx tsc --noEmit` -- 0 Fehler
- `npx eslint app/unit app/analyse features/training features/ai components/training types` -- 0 Fehler
- `git diff --check` -- sauber

**Manual checks (if no CLI):**
- Migration nur gegen lokale/Staging-DB testen (mit Freigabe); Gerät „Vorher“: neues Training, altes Training bearbeiten, alter Entwurf, laufendes Live-Training abschließen, Offline.
