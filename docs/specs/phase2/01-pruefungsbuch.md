# Spec 1 · Prüfungs- und Turnierbuch je Hund

Stand: 2026-11-24 · Status: **Freigegeben von der Nutzerin am 2026-11-24** (mit Teilen in V1, Abo: Erfassen frei, Rest Premium)
Quelle: Marktanalyse & Roadmap vom 24.11.2026, Phase 2 (Q1–Q2 2027)
Testweg: **Vorher** (neue Kundendaten, Offline/Sync)

## Warum

Hundesportler führen ihr Prüfungsbuch heute auf Papier (Leistungsheft) oder gar
nicht. ANYVO hat schon Trainings, Fährten und Dokumente je Hund – es fehlt der
Teil, auf den alles hinausläuft: die Prüfung. Mit dem Prüfungsbuch sieht man auf
einen Blick, wo der Hund steht, was zur nächsten Stufe fehlt und wie sich die
Punkte je Abteilung entwickeln.

## Was die Funktion kann (Version 1)

1. **Eintrag erfassen** je Hund: Datum, Ort, Verein, Richter, Prüfungsart und
   Stufe, Punkte je Abteilung, Gesamt (automatisch summiert, überschreibbar),
   Bewertung (V/SG/G/B/M bzw. Sparten-Wert), bestanden ja/nein, Notiz.
2. **Prüfungsarten** aus einem festen Katalog im Code (erweiterbar, versioniert):
   - IGP (V, 1, 2, 3) – Abteilungen A Fährte, B Unterordnung, C Schutzdienst, je 100
   - IFH (V, 1, 2, 3) – eine Abteilung Fährte, 100
   - FH (1, 2) – eine Abteilung, 100
   - BH/VT – bestanden ja/nein, keine Punkte (Teil A/B als Häkchen)
   - Obedience (Beginner, 1, 2, 3) – Gesamtpunkte, Bewertung
   - Rally (Beginner, 1, 2, 3, Senior) – Gesamtpunkte (max. 100)
   - Agility (A1, A2, A3, Jumping) – Fehler, Zeit, Platz, Qualifikation
   - Mondioring (Brevet, 1, 2, 3) – Gesamtpunkte (100/200/300/400)
   - «Andere» – freier Name, freie Abteilungen
   Der Katalog ist nur eine Eingabehilfe. Gespeichert werden immer die tatsächlich
   eingegebenen Werte samt Max-Punkten, damit spätere Katalogänderungen alte
   Einträge nie verändern.
3. **Fotos/Dokumente** anhängen (Bewertungsbogen, Urkunde, Foto): nutzt das
   bestehende Dokument-System (`dog_documents`, Kategorie `sport` gibt es schon).
4. **Verknüpfen** mit Fährten und Trainingseinheiten (z. B. «Vorbereitung»),
   in beide Richtungen sichtbar, wie die bestehenden Fährten-Verknüpfungen.
5. **Übersicht je Hund**: Liste nach Datum, höchste bestandene Stufe je Sparte,
   **Fortschritt zur nächsten Stufe** (z. B. «IGP 2 bestanden → nächste: IGP 3»),
   **Punkteverlauf je Abteilung** (Linie A/B/C über die Zeit).
6. **Offline erfassen**: Eintrag wird zuerst lokal gespeichert und später
   synchronisiert, wie Trainingseinträge.
7. **PDF-Export** (optional, eigener PR): Prüfungsbuch eines Hundes als PDF mit
   dem bestehenden PDF-Schreiber (`features/training/pdfWriter.ts`).

## Nicht-Ziele (Version 1)

- Keine Anmeldung zu Prüfungen, kein Kalender-Import von Vereinen.
- Keine offizielle Gültigkeit (kein Ersatz für Leistungsheft/Ahnentafel).
- Keine automatische Bewertung oder Prüfungsordnungs-Kontrolle der Punkte
  (nur einfache Plausibilität: Punkte ≤ Max).
- Kein Bearbeiten durch andere Personen (Teilen ist nur Lesen).
- Keine Änderung an bestehenden Trainings-, Fährten- oder Dokumentdaten.

## Datenmodell (nur additiv)

Neue Tabelle `public.dog_exam_results`:

| Spalte | Typ | Hinweis |
|---|---|---|
| `id` | uuid pk | |
| `owner_id` | uuid, not null | = `auth.uid()` beim Anlegen |
| `dog_id` | uuid, not null, fk `dogs` | |
| `client_local_id` | text, not null | unique (`owner_id`, `client_local_id`) → Offline-Sync idempotent |
| `exam_date` | date, not null | |
| `location`, `club`, `judge` | text, null | |
| `exam_type` | text, not null | Katalog-Schlüssel, z. B. `igp`, oder `other` |
| `exam_type_label` | text, null | freier Name bei `other` |
| `exam_level` | text, null | z. B. `1`, `v`, `beginner`, `a2` |
| `sections` | jsonb, not null, default `[]` | `[{key,label,points,maxPoints}]` |
| `total_points`, `max_points` | numeric, null | |
| `rating` | text, null | z. B. `V`, `SG`, `vorzüglich`, `Q` |
| `passed` | boolean, null | null = unbekannt |
| `placement` | integer, null | Platz (Turniere) |
| `notes` | text, null | |
| `schema_version` | smallint, default 1 | |
| `created_at`, `updated_at` | timestamptz | |
| `deleted_at` | timestamptz, null | **Soft-Delete**, nie hart löschen |

Neue Verknüpfungstabelle `public.dog_exam_links`:
`exam_id` → `dog_exam_results`, `kind` (`training_session` | `document`),
`target_id` uuid, `created_at`; unique (`exam_id`, `kind`, `target_id`).

Lokal (SQLite, additive Migration in `lib/localDb/migrations.ts`, Version 14):
eigene Tabelle `local_exam_results` (ganzer Eintrag als JSON + `state`
pending/synced/conflict, `base_updated_at`) mit eigenem Sync – **nicht** über
`sync_queue`, weil ältere App-Stände unbekannte Queue-Typen verwerfen (gleiches
Muster wie die Fährten-Verknüpfungen, Version 13). Änderungen eines anderen
Geräts werden nie stillschweigend überschrieben (Konflikt, lokale Fassung bleibt).

## Datenwirkung

- Nur **neue** Tabellen (Server und lokal).
  Keine bestehende Tabelle, Spalte oder Datei wird geändert oder migriert.
- Löschen eines Eintrags = `deleted_at` setzen (mit «Rückgängig»). Verknüpfte
  Dokumente und Fährten bleiben immer erhalten.
- Hund löschen: bestehende Konto-/Hundelöschung (`delete-account`,
  `dogStorageCleanup`) muss die neuen Tabellen mit einbeziehen → wird im PR
  ergänzt und getestet, damit keine verwaisten Daten bleiben.
- Ältere App-Versionen kennen die Tabelle nicht und lassen sie unberührt.
- Migration auf Staging zuerst; Production-Migration nur mit Freigabe der Nutzerin.

## Rechte und Sichtbarkeit

- RLS: schreiben nur `owner_id = auth.uid()` **und** der Hund gehört der Person
  (`dogs.owner_id`).
- Verknüpfung nur auf eigene Trainings/Dokumente (Prüfung in RLS bzw. RPC).
- **Teilen in V1 (Entscheid Nutzerin 2026-11-24): nur Lesen**, ausdrücklich je
  Hund und je Person, jederzeit widerrufbar. Neue Tabelle
  `public.dog_exam_access_grants` (`owner_id`, `dog_id`, `grantee_user_id`,
  `connection_id`, `created_at`, `revoked_at`), gleiches Muster wie die
  bestehenden Gesundheits-Freigaben (`dog_health_access_grants`,
  `health_grant_connection_valid`): nur an bestehende Verbindungen (Trainer,
  Mitbesitzer), endet automatisch, wenn die Verbindung endet.
  Lesefunktion `can_view_dog_exams(dog_id)` = Besitzer oder gültige Freigabe.
- Geteilt werden nur die Prüfungseinträge (Daten, Punkte, Notiz). **Anhänge**
  (Fotos/Dokumente) bleiben in V1 beim Besitzer; Geteilte sehen nur «1 Anhang».
  Grund: die bestehende Speicher-Regel für Dokumente wird nicht angefasst.
- Verknüpfte Fährten/Trainings sehen Geteilte nur, wenn sie diese schon über
  bestehende Regeln sehen dürfen; sonst nur «verknüpft».
- Keine Personendaten in Logs; Richter-/Vereinsnamen nur in der Tabelle.

## Abo

Entscheid Nutzerin 2026-11-24: Erfassen, Liste und Teilen für alle Pläne frei;
Punkteverlauf und PDF-Export ab Premium (über die bestehende Capability-Prüfung).

## Mockup

```
┌──────────────────────────────┐   ┌──────────────────────────────┐
│ ‹ Luna · Prüfungsbuch     ＋ │   │ ‹ Neue Prüfung       Sichern │
│ ┌──────────────────────────┐ │   │ Datum      12.04.2027        │
│ │ IGP 2 bestanden          │ │   │ Prüfungsart [IGP ▾] Stufe [2]│
│ │ Nächste Stufe: IGP 3  ▸  │ │   │ Ort / Verein / Richter       │
│ └──────────────────────────┘ │   │ ── Punkte ──                 │
│ Punkteverlauf  A ─ B ┄ C ··  │   │ A Fährte        [ 92 ] /100  │
│   100 ┤    ╭─A               │   │ B Unterordnung  [ 85 ] /100  │
│    80 ┤╭──╯ ┄┄B              │   │ C Schutzdienst  [ 88 ] /100  │
│    60 ┼────────────          │   │ Gesamt 265/300 · SG          │
│ ───────────────────────────  │   │ Bestanden  (●) Ja  ( ) Nein  │
│ 12.04.27 IGP 2  265 SG  ✓    │   │ ＋ Foto / Bewertungsbogen    │
│ 03.10.26 IGP 1  281 V   ✓    │   │ ＋ Fährte/Training verknüpfen│
│ 20.05.26 BH/VT          ✓    │   │ Notiz …                      │
└──────────────────────────────┘   └──────────────────────────────┘
```

Einstieg: Hundeprofil → neue Kachel «Prüfungen» (neben Dokumente/Gesundheit).

## Umsetzung in PRs (nach Freigabe)

1. **PR A – Daten**: Migration (Staging), Katalog, Typen, Service, lokale Tabelle,
   Sync-Typ, Löschpfad, Freigabe-Tabelle und Lesefunktion; Tests für Katalog, Summen, Sync (Offline → Online,
   Doppel-Sync, Abbruch), RLS-Tests lokal.
2. **PR B – Oberfläche**: Liste, Formular, Kachel im Hundeprofil, Verknüpfungen,
   Fortschritt, Punkteverlauf, Freigabe-Blatt «Wer sieht das Prüfungsbuch» und
   Leseansicht für Geteilte.
3. **PR C – PDF-Export** (optional).

## Testweg «Vorher» und Erfolgskriterium

- Jest: Katalog, Summen/Plausibilität, Fortschrittslogik, Sync-Pfade.
- Staging-Gerätetest iOS und Android: Eintrag offline anlegen, App schliessen,
  online synchronisieren; bearbeiten; löschen + Rückgängig; Foto anhängen;
  Fährte verknüpfen; Hund ohne Einträge; älterer Stand ohne Tabelle.
- Fertig, wenn ein Eintrag offline erfasst, nach Sync auf zweitem Gerät
  sichtbar ist und keine bestehenden Daten verändert wurden.

## Entscheide und offene Punkte

- Freigabe, Abo und Teilen: entschieden am 2026-11-24 (siehe oben).
- Katalog: Ergänzungen (z. B. Rettungshunde, alte SchH-Bezeichnungen) jederzeit
  über «Andere» möglich; feste Ergänzung bei Bedarf im PR.
- Testweg zusätzlich: Freigabe erteilen, als Trainer lesen, Freigabe widerrufen
  → sofort nicht mehr sichtbar; Verbindung beenden → nicht mehr sichtbar.
