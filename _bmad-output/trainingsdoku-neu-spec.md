# Trainingsdokumentation neu – Kurzspezifikation und Code-Abgleich

Stand: 9. Nov. 2026 · Status: **Entscheidungen getroffen, nicht umgesetzt**

## Warum
Heute braucht ein Training drei Schritte (Vorbereiten → Dokumentieren → Nächstes Mal).
Das letzte Training steckt hinter dem Link «Letztes Training ansehen». Ziel: Man sieht
sofort, was im letzten Training war, und dokumentiert das heutige in unter einer Minute.

## Entscheidungen (9.11.2026)
1. **Bewertung = Lernstufe + automatischer Trend (Varianten B + C).** Pro Übung
   «Neu / Lernen / Festigen / Sitzt», vorbelegt mit der Stufe vom letzten Mal.
   Trend ↑ → ↓ wird automatisch gegenüber dem letzten Eintrag derselben Übung berechnet.
   Speicherung im bestehenden Feld `rating` als 1/2/4/5, ohne Migration.
   Alte Sterne-Werte werden **nicht** umgedeutet: Anzeige «alte Bewertung x/5», kein Trend.
   Offen für die Code-Sitzung: sichere Unterscheidung alt/neu vorschlagen.
2. **«Geplant – noch nicht trainiert» entfällt.** Vorgewählte Übungen gelten als heute
   trainiert; was nicht gemacht wurde, wird abgewählt.
3. **GPS-Fährte fest verknüpfen.** Grund: Kundinnen legen mehrere Fährten am selben Tag
   mit mehreren Hunden – eine Zuordnung nur über Hund + Datum wäre nicht eindeutig.

## Fähigkeiten (Ziel)
1. **Hundekarte (Meine Hunde):** «Letztes Training: vor X Tagen · Sparte» + offener
   Hinweis; «Weiter» öffnet das Training dieses Hundes.
2. **Training-Tab «Weitermachen»:** Hund-Auswahl, letztes Training mit Hinweis,
   Übungen mit Lernstufe und Trend, darunter 3 frühere Trainings.
3. **Erfassen auf einem Screen:** «Letztes Mal» angeheftet; Übungen als Chips
   (vom letzten Mal vorgewählt); pro Übung Lernstufe, Trend, Notiz, Sprachnotiz;
   «Fürs nächste Mal»; Details eingeklappt. Pflicht: 1 Übung.
4. **Entwurf auf dem Gerät + Offline-Hinweis.**
5. **GPS-Fährten verknüpfen:** Liste der Fährten des Tages für diesen Hund
   (Uhrzeit, wer gelegt hat, Länge, Winkel, Liegezeit); eine oder mehrere ankreuzen.
   Genau eine passende Fährte → vorgewählt. Rückweg: Fährte zeigt verknüpfte Trainings.
6. **Verlauf mit Übungs-Matrix:** Pro Übung die letzten 6 Trainings als Lernstufen-Punkte,
   ↓ markiert Rückschritte; offene Hinweise; Liste.

## Grenzen / Nicht-Ziele
- Keine Löschung oder verlustbehaftete Umrechnung bestehender Trainings (AGENTS.md,
  Kundendatenerhalt). Alte 1–5-Bewertungen bleiben unverändert gespeichert.
- Keine Änderung an Tracking/GPS-Aufzeichnung; Verknüpfung ist rein additiv.
- Kein Commit auf main, kein Merge, keine OTA, kein Build, kein Live-DB-Write ohne
  ausdrücklichen Auftrag.

## Erfolgskriterium
- Vom Training-Tab bis «gespeichert»: höchstens 1 Screen, Pflichtangabe nur 1 Übung.
- Letztes Training (Datum, Übungen, Lernstufe, Hinweis) ohne Tippen sichtbar.
- Entwurf übersteht App-Schliessen und Offline-Phase.
- Bei mehreren Fährten am Tag ist die Zuordnung eindeutig und nachträglich änderbar.
- Text erfüllt 4,5:1 Kontrast; Bedienelemente mindestens 44 pt.

## Code-Abgleich (geprüft am Repo, read-only)
**Quelle:** `main` (0e74454, 9.11.) enthält den 3-Schritt-Ablauf **nicht**. Er liegt auf
`feat/ios60-training-ui-review-20261106` (50548db, 6.11.). Dort: Expo 58, React Native
0.88, expo-router 58 (AGENTS.md-Hinweis auf v54 ist veraltet). ACTIVE_WORK: Trainings-Hub-
Paket vom 24.10. fehlt in Build 59 – Basis vor Umsetzung mit MASTER klären.

| Thema | Befund im Code | Folge |
|---|---|---|
| Ablauf | `app/unit/document.tsx` (934 Z.), `workflowStep` 0/1/2 | Schritte zusammenführen |
| Entwurf | `features/training/documentation/draft.ts` (AsyncStorage, pro Konto, mehrere Hunde) | Wiederverwenden |
| Offline-Speichern | `saveIntent.ts` + `retryTrainingSave` | Wiederverwenden, Hinweis ergänzen |
| Letztes Training | `services/trainingPreparation.ts` (Hund + Sparte; Fährten `type 'track'` ausgeschlossen) | Für Karte/Tab nutzen |
| Übungen übernehmen | `planFromHistory` setzt `performed:false`, kopiert keine Bewertung | `performed` künftig true bei Vorwahl |
| Hinweise | `ServerTrainingFocusList` / `TrainingFocusList` (offen/erledigt) | Wiederverwenden |
| Bewertung Übung | `TrainingExercise.rating` 1–5 (Sterne, im Beobachtungsmodus versteckt) | Lernstufe 1/2/4/5 |
| Bewertung Training | `score` 1–10 + 6 Metriken 1–5 | Unter «Mehr Details» |
| Sprachnotiz | Formular nur `audio_files` am Training; Tabelle `voice_notes` hat `training_unit_id`, `context 'exercise_note'`, `metadata` | Pro Übung vermutlich ohne Migration – Policies/Upload prüfen |
| Fährten | `training_sessions` (`type 'track'`) mit `track_runs` (mehrere Absuchen je Fährte); keine Verknüpfung zu `training_units` | Neue Verknüpfungstabelle |
| Kontrast | `C.muted #777`, `C.placeholder #333` (≈1,5:1 auf `#161616`) | `C.textMuted`/`textPlaceholder #8A8A8A` |
| Farben | Akzent `#00FFCC`, `warning #FFB800`, `danger #FF3B30` | Mockup-Farben darauf abbilden |

## Vorschlag Datenmodell GPS-Verknüpfung (zu prüfen in Etappe 5)
Additiv, keine Änderung bestehender Tabellen:
`training_unit_tracks (id, owner_id, training_unit_id → training_units, training_session_id
→ training_sessions, track_run_id → track_runs nullable, created_at)`, eindeutig je
(Training, Fährte, Absuche), RLS nur Besitzer. Mehrere Fährten pro Training und mehrere
Trainings (Hunde) pro Fährte möglich. Löschen eines Trainings entfernt nur die Verknüpfung,
nie die Fährte. Ältere App-Versionen ignorieren die Tabelle.
Ablauf: Migration zuerst (ausdrückliche Freigabe, MASTER), dann OTA. Testweg **Vorher**.
Offline: Verknüpfung im bestehenden Speicherablauf mitspeichern oder nachgelagert mit
Wiederholung – Entscheid in der Code-Sitzung nach Prüfung von `saveDocumentedUnitAtomic`.

## Etappen
| # | Inhalt | Risiko / Testweg |
|---|---|---|
| 1 | Erfassen auf einem Screen, Lernstufe + Trend, «Letztes Mal» oben, Kontrast | Daten-Formular → **Vorher** |
| 2 | Training-Tab «Weitermachen» + Hundekarten-Zeile (nur lesen) | UI → Nachher |
| 3 | Verlauf-Matrix (nur lesen) | UI → Nachher |
| 4 | Sprachnotiz pro Übung über `voice_notes` | Daten/Upload → **Vorher** |
| 5 | GPS-Fährten fest verknüpfen (Migration + OTA) | DB/Tracking → **Vorher** |
