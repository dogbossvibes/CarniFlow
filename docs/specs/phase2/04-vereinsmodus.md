# Spec 4 · Vereins- und Hundeplatzmodus

Stand: 2026-11-24 · Status: **Freigegeben von der Nutzerin am 2026-11-24** (Gruppe = Verein, Organisator trägt ein + Zusage, Planen Premium / Teilnehmen frei)
Quelle: Marktanalyse & Roadmap vom 24.11.2026, Phase 2 (Q1–Q2 2027)
Testweg: **Vorher** (Rechte, fremde Hunde, Gruppendaten)

## Warum

Im Verein wird der Fährtentag heute per WhatsApp und Zettel geplant: wer kommt,
wer legt für wen, welches Feld, welche Liegezeit, in welcher Reihenfolge.
ANYVO hat das Gruppentraining schon (Gruppen, Mitglieder, Organisatoren,
Übergabe, Blindsuche, Auswertung teilen, «Wer sieht was»). Es fehlt die
**Planung vorab** und die **Ablaufliste am Tag**.

## Was schon da ist (`features/training-groups`, Server-RPCs `training_private_*`)

- Gruppen mit Besitzer, Mitgliedern, Rolle «Organisator», Einladungen, Beitrittscode.
- Live-Trainings (`training_private_sessions`) mit Teilnehmern und je einem
  eigenen Hund (`training_private_participants`, nur eigene Hunde).
- Fährten in der Gruppe mit **Leger** und **Hundeführer**
  (`training_private_tracks.layer_id` / `handler_id`), Blindsuche, Übergabe.
- Auswertung je Fährte, teilbar an die Gruppe oder an einzelne Personen
  (`training_private_evaluations`, `..._grants`).
- Alle Tabellen sind für die App gesperrt; Zugriff nur über geprüfte RPCs.
  Dieses Muster bleibt.

## Was die Funktion kann (Version 1)

1. **Trainingstag planen** (nur Organisatoren/Besitzer): Datum, Uhrzeit,
   Treffpunkt/Gelände (Text + optional Kartenpunkt), Notiz.
2. **Startliste**: Reihenfolge der Teams; pro Zeile Hundeführer, Leger, geplante
   Liegezeit, Fährtenart (frei oder Prüfungsvorlage IGP/IFH/FH bzw. Mantrailing,
   sobald vorhanden), Feld/Abschnitt, blind ja/nein.
3. **Zusagen**: Mitglieder sehen den Plan, sagen zu/ab und wählen **selbst**
   ihren Hund. Ein Hund erscheint im Plan erst nach Zusage des Besitzers.
   Wer als Leger eingetragen ist, bestätigt «Ich lege für …».
4. **Ablaufliste am Tag**: «Tag starten» erzeugt das bestehende Live-Training.
   Jede Zeile zeigt den Stand aus den echten Fährten: geplant → wird gelegt →
   liegt (Liegezeit läuft) → Suche → fertig. Hinweis, wenn die geplante
   Liegezeit erreicht ist. Fährte legen/übergeben über die **bestehende**
   Übergabe; nichts Neues bei der Aufzeichnung.
5. **Gemeinsame Auswertung**: Am Ende eine Tagesübersicht je Hund mit den
   Auswertungen, die der jeweilige Hundeführer für die Gruppe freigegeben hat.
   Nicht freigegebene erscheinen nur als «nicht geteilt».
6. **Benachrichtigung** (bestehender Gruppen-Versand): «Neuer Trainingstag»,
   «Plan geändert», «Du bist dran mit Legen».

## Nicht-Ziele (Version 1)

- Keine Vereinsverwaltung (Mitgliederbeiträge, Platzbuchung, Kasse).
- Kein eigenes Objekt «Verein» – der Verein ist eine bestehende Gruppe
  (siehe Frage 1).
- Keine automatische Zuteilung «wer legt für wen» (nur von Hand; Vorschlag
  später möglich).
- Keine Änderung an Aufzeichnung, Übergabe, Blindsuche oder Auswertungslogik.
- Kein Zugriff Dritter auf Hundeprofile, Gesundheit oder private Trainings.

## Datenmodell (nur additiv)

Neue Tabellen, wie alle `training_private_*`-Tabellen für die App gesperrt und
nur über neue RPCs erreichbar:

`training_private_plans`
: `id`, `group_id` → groups, `created_by`, `title`, `starts_at`, `meeting_point`
  (text), `meeting_lat/lng` (nullable), `notes`, `status`
  (`draft` | `published` | `started` | `done` | `cancelled`), `session_id`
  (nullable, gesetzt bei «Tag starten»), `created_at`, `updated_at`.

`training_private_plan_entries`
: `id`, `plan_id` → plans, `position`, `handler_id`, `layer_id` (nullable),
  `dog_id` (nullable, **nur durch den Hundebesitzer setzbar**), `dog_epoch`,
  `planned_lying_minutes`, `track_kind` (Text, z. B. `free`, `igp1`, `mantrail`),
  `field_note`, `blind`, `handler_response` (`open`|`yes`|`no`),
  `layer_response` (`open`|`yes`|`no`), `track_id` (nullable → bestehende
  `training_private_tracks`, gesetzt sobald gelegt), `created_at`, `updated_at`.

Keine bestehende Tabelle wird geändert. Absagen/Entfernen = Status setzen,
nicht löschen; Pläne bleiben als Verlauf erhalten.

## Rechte und Sichtbarkeit (sorgfältig, im PR mit SQL-Tests)

| Wer | darf |
|---|---|
| Besitzer/Organisator | Plan anlegen, ändern, veröffentlichen, absagen, starten; Personen in Startliste eintragen; Reihenfolge ändern |
| Mitglied | veröffentlichte Pläne der eigenen Gruppe sehen; eigene Zeile zu-/absagen; **eigenen** Hund wählen/entfernen; als Leger bestätigen |
| Ehemaliges Mitglied | nichts mehr (Epochen-Prüfung wie heute) |
| Nicht-Mitglied | nichts |

- **Fremde Hunde**: Name und Rasse eines Hundes sind für die Gruppe nur
  sichtbar, wenn dessen Besitzer ihn selbst in den Plan gesetzt hat. Keine
  Hundeprofile, Gesundheitsdaten oder privaten Trainings. Zieht der Besitzer
  zurück oder verlässt die Gruppe, verschwindet der Hund aus dem Plan.
- **Auswertungen**: nur, was der Hundeführer über die bestehende
  «Auswertung teilen»-Regel freigibt.
- **Standort**: Treffpunkt nur für Gruppenmitglieder; Live-Standort weiter nur
  über den bestehenden Schalter.
- «Wer sieht was» (`WhoSeesWhatSheet`) bekommt eine Zeile «Trainingsplan:
  alle in der Gruppe».
- Alle neuen RPCs: `security definer`, `search_path` fest, Mitgliedschaft und
  Rolle bei jedem Aufruf geprüft, Grösse/Anzahl begrenzt (z. B. max. 40 Zeilen),
  keine Personendaten in Fehlermeldungen oder Logs.

## Datenwirkung

- Nur neue Tabellen und neue RPCs. Bestehende Gruppen, Trainings, Fährten,
  Auswertungen bleiben unverändert.
- Konto-Löschung: Einträge der gelöschten Person werden über `on delete cascade`
  bzw. Anonymisierung (Name → «Ehemaliges Mitglied») behandelt – im PR festlegen
  und testen; fremde Daten anderer Mitglieder bleiben erhalten.
- Migration zuerst Staging; Production nur mit Freigabe.

## Mockup

```
┌──── Fährtentag Sa 14.03. ─── ✎ ┐   ┌──── Ablauf heute ─────── 08:40 ┐
│ 08:00 · Feld Hinterberg         │   │ 1 Anna · Luna   ✓ fertig        │
│ Treffpunkt: Parkplatz Wald      │   │ 2 Beat · Rex    ⏳ liegt 34/60′ │
│ ── Startliste ──────────────    │   │    gelegt von Anna              │
│ 1 Anna · Luna   legt: Beat 60′ ✓│   │ 3 Carla · Ivo   🚶 wird gelegt  │
│ 2 Beat · Rex    legt: Anna 60′ ✓│   │    von Dani                     │
│ 3 Carla · ?     legt: Dani 90′ … │   │ 4 Dani · Kira   ○ geplant       │
│ 4 Dani · Kira   legt: Carla 30′ ✓│   │                                 │
│ [ Person hinzufügen ]           │   │ [ Fährte legen ] [ Übergabe ]   │
│ [ Veröffentlichen ]             │   │ [ Tagesauswertung ]             │
└─────────────────────────────────┘   └─────────────────────────────────┘
 «?» = Carla hat noch keinen Hund gewählt
```

## Umsetzung in PRs (nach Freigabe)

1. **PR A – Server**: Tabellen, RPCs, Rechte, SQL-Sicherheitstests lokal
   (`supabase/local/*_security_cases.sql`-Muster), Staging-Migration.
2. **PR B – Planen und Zusagen** (Oberfläche).
3. **PR C – Ablaufliste am Tag** (Status aus bestehenden Fährten) und
   Tagesauswertung.
4. **PR D – Benachrichtigungen**.

## Testweg «Vorher» und Erfolgskriterium

- SQL-Sicherheitstests: Nicht-Mitglied, ehemaliges Mitglied, Mitglied versucht
  fremden Hund zu setzen, Mitglied versucht Plan zu ändern, Organisator ohne
  Hund-Zusage sieht keinen Hundenamen.
- Jest: Statusableitung der Ablaufliste, Liegezeit-Hinweis, Zusage-Logik.
- Gerätetest mit 3 Konten (Staging, iOS + Android): planen → zusagen → Tag
  starten → legen/übergeben → suchen → Tagesauswertung; Mitglied verlässt Gruppe
  mitten im Plan.
- Fertig, wenn ein Fährtentag mit 3 Teams ohne WhatsApp-Zettel durchläuft und
  kein Konto Daten sieht, die es heute nicht sehen darf.

## Entscheide der Nutzerin (2026-11-24)

1. Verein = bestehende Gruppe; kein eigenes Vereinsobjekt in V1.
2. Organisator trägt Personen in die Startliste ein; jede Person sagt selbst zu
   und wählt den eigenen Hund.
3. Abo: Planen (Plan anlegen/ändern/starten) ab Trainer-/Premium-Plan über die
   bestehende Capability-Prüfung; Teilnehmen, Zusagen und Ablaufliste für alle.
