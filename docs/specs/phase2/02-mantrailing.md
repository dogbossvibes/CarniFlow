# Spec 2 · Mantrailing-Modus

Stand: 2026-11-24 · Status: **Freigegeben von der Nutzerin am 2026-11-24** (eigenes NEWBIE-Kontingent, Übergabe in V1, Korridor fest 25 m)
Quelle: Marktanalyse & Roadmap vom 24.11.2026, Phase 2 (Q1–Q2 2027)
Testweg: **Vorher**, Feldtest iOS **und** Android vor jeder Production-OTA

## Warum

Mantrailing ist eine der grössten wachsenden Hundesport-Sparten. Bestehende
Apps zeichnen nur «eine Linie» auf. ANYVO hat bereits eine starke GPS-Engine
(Legen, Absuche, Abweichung, Hintergrund-GPS, Übergabe zwischen Handys). Damit
können wir Trailer-Spur und Hundespur sauber übereinanderlegen und mit
Trail-Alter, Wind und Ergebnis auswerten.

## Grundsatz: IGP-Fährte bleibt unverändert

- Die IGP-Fährtenlogik (Winkelerkennung, Gegenstände, Auswertung V3,
  Prüfungsvorlagen, Absuche-Ansagen) wird **nicht geändert**.
- Mantrailing ist ein **eigener Sitzungstyp** (`training_sessions.type = 'mantrail'`).
  Alle bestehenden Abfragen mit `type = 'track'` (Historie, Statistik, Teilen,
  Quota) sehen Mantrailing dadurch automatisch **nicht** – keine Vermischung.
- Neuer Code liegt unter `features/mantrailing/` und `app/mantrail/` und nutzt
  den bestehenden Recorder (Punkte aufzeichnen, Hintergrund-GPS, Wiederherstellung)
  nur über seine vorhandenen Schnittstellen.
- Einzige gemeinsame Stelle: der Recorder darf nur **eine** Aufnahme gleichzeitig
  besitzen (`layRecorderOwnership`). Mantrailing meldet sich dort als Besitzer an
  wie eine Fährte. Falls dafür eine Erweiterung nötig ist, wird sie vorher mit
  den Feldbelegen und der Kontinuitätsprüfung abgesichert (siehe Testweg).

## Was die Funktion kann (Version 1)

1. **Trail anlegen** (Trailer läuft): Spur aufzeichnen, Start/Ende, optional
   «Versteck» als Endpunkt. Aufzeichnen kann
   - der Trailer auf dem eigenen Handy und per bestehender **Übergabe**
     (`tracking-transfer` / Gruppen-Übergabe) an den Hundeführer schicken, oder
   - der Hundeführer selbst (Training ohne Helfer), oder
   - gar nicht (Trail ohne Aufzeichnung, z. B. fremder Trailer ohne App).
2. **Hund arbeitet**: Hundespur aufzeichnen; die Trailer-Spur liegt als Linie auf
   derselben Karte (bei Doppelblind verborgen, siehe unten).
3. **Angaben je Trail**:
   - Trail-Alter (automatisch: Ende Trailer → Start Hund, überschreibbar)
   - Wind beim Legen und beim Start (Richtung/Stärke aus dem vorhandenen
     Wetterdienst `getLiveConditions`, ohne Netz manuell)
   - Geruchsträger (Kleidung, Socke, Mütze, Gaze/Tupfer, Autositz, Anderes) und
     «möglicherweise verunreinigt»
   - Umgebung (Stadt, Wohngebiet, Wald, Feld, Gemischt, Gebäude) und Untergrund
   - Länge (aus Spur oder manuell), Anzahl Kreuzungen/Abzweigungen (optional)
   - **Negativtrail**: es gibt keine Person; Ergebnis = Hund zeigt korrekt
     «nichts» an oder nicht
   - **Doppelblind**: Hundeführer und Begleiter kennen den Verlauf nicht
4. **Ergebnis**: Person gefunden / nicht gefunden / abgebrochen; bei Negativtrail
   korrekt negativ / falsch positiv; Anzeigeverhalten (frei wählbar, z. B.
   Hinsetzen, Anspringen, Hinlegen), Notiz.
5. **Auswertung je Trail**: Karte mit beiden Spuren, Dauer, Länge, grösste
   Abweichung von der Trailer-Spur und Anteil «in der Nähe» (eigene einfache
   Berechnung mit festem Korridor **25 m** (Entscheid 2026-11-24), weil Mantrailing nicht
   fussgenau ist). Keine Winkel- oder Gegenstandsbewertung.
6. **Eigene Sparte** «Mantrailing» in `constants/disciplines.ts` (Übungen wie
   Starttraining, Kurztrail, Langtrail, Negativtrail, Doppelblind, Stadt) und
   **eigene Statistik**: Anzahl Trails, Fundquote, Negativ-Trefferquote,
   Trail-Alter (Ø und max), Länge, Verlauf nach Umgebung.

## Doppelblind – wie es geschützt wird

- Die Trailer-Spur wird beim Hundeführer erst nach «Ende» angezeigt.
- Kommt die Spur per Übergabe, wird sie gespeichert, aber bis «Ende» verdeckt
  (gleiches Prinzip wie die bestehende Blindsuche in der Gruppe,
  `features/training-groups/blindSearch.ts`).
- Während der Arbeit nur: Zeit, eigene Strecke, GPS-Qualität. Kein
  Richtungs- oder Abweichungshinweis.
- «Spur vorzeitig zeigen» ist möglich (Sicherheit), wird im Trail vermerkt.

## Nicht-Ziele (Version 1)

- Keine Änderung der IGP-Fährte, ihrer Auswertung oder ihrer Statistik.
- Kein Live-Mitverfolgen durch den Trailer (später über bestehendes Live-Teilen).
- Keine Prüfungsordnungen für Mantrailing-Prüfungen (kommen ins Prüfungsbuch).
- Keine Watch, kein Halsband-GPS (externes GPS bleibt wie heute nutzbar).
- Keine Geruchs- oder Wind-Simulation, nur Erfassung.

## Datenmodell (nur additiv)

- `training_sessions`: neue Zeilen mit `type = 'mantrail'`, `category = 'Mantrailing'`.
  Zusatzangaben in der **bestehenden** Spalte `track_data` (jsonb) unter
  `track_data.mantrail = { version: 1, trailAgeMinutes, windLay, windRun,
  scentArticle, scentContaminated, environment, surface, negative, doubleBlind,
  result, indication, revealedEarly, trailSource }`.
- Trailer- und Hundepunkte in den **bestehenden** Tabellen `track_points`
  (`point_type` `lay` / `search` wie heute) und lokal `local_track_points`.
- **Zu prüfen in PR A (Staging, nur lesend):** ob `training_sessions` einen
  CHECK auf `type` oder `category` hat. Falls ja, wird er nur **erweitert**
  (neue erlaubte Werte), kein bestehender Wert entfällt. Ohne Freigabe keine
  Production-Migration.
- Keine neue Spalte nötig, falls kein CHECK besteht.
- Lokal: keine neue Tabelle; `local_training_sessions.type = 'mantrail'`.

## Datenwirkung

- Bestehende Fährten, Punkte, Marker, Auswertungen und Statistiken bleiben
  unverändert, weil sie nach `type = 'track'` filtern.
- Löschen eines Trails nutzt den bestehenden Lösch-/Rückgängig-Pfad für
  Trainings; Konto-/Hundelöschung muss `type = 'mantrail'` mit erfassen (Test).
- Quota/Abo (Entscheid 2026-11-24): **eigenes Kontingent** – NEWBIE 1 Trail pro
  Monat zusätzlich zur 1 Fährte, höhere Pläne frei. Umsetzung additiv neben dem
  bestehenden `newbie_track_claim` (eigener Zählschlüssel `mantrail`); die
  bestehende Fährten-Zählung bleibt unverändert. Production-Migration nur mit
  Freigabe.
- Ältere App-Versionen ignorieren `type = 'mantrail'` (Prüfung im PR: keine
  Liste stürzt bei unbekanntem Typ ab).

## Rechte und Sichtbarkeit

- Wie eigene Trainings: nur Besitzer, Teilen über die bestehenden Regeln
  (Trainer-Verbindung, Gruppe). Übergabe Trailer → Hundeführer nutzt die
  bestehende, bereits geprüfte Übergabe; keine neuen Freigabewege.
- Wind/Ort werden nur im Trail gespeichert, nicht geloggt.

## Mockup

```
┌────────── Trail starten ─────┐  ┌──────── Hund arbeitet ───────┐  ┌──────── Auswertung ──────────┐
│ Hund      Malu               │  │ ⏱ 07:42   📏 486 m   GPS ●●● │  │  ░░ Karte ░░░░░░░░░░░░░░░░░  │
│ Trail-Alter  2 h 10 (auto)   │  │  ░░ Karte ░░░░░░░░░░░░░░░░░  │  │   ┄┄┄ Trailer   ━━━ Malu     │
│ Wind  SW 12 km/h  (Wetter)   │  │   Hundespur ━━━              │  │  Gefunden ✓  · Alter 2 h 10  │
│ Geruchsträger  [Socke ▾]     │  │   Trailer-Spur: verborgen    │  │  Länge 1.2 km · 18 min       │
│ Umgebung  [Wohngebiet ▾]     │  │   (Doppelblind)              │  │  in der Nähe 86 % · max 41 m │
│ ☐ Negativtrail ☑ Doppelblind │  │                              │  │  Wind SW 12 → W 8            │
│ Trailer-Spur  aus Übergabe ✓ │  │ [ Person gefunden ] [ Ende ] │  │  Notiz …                     │
│        [ Hund starten ]      │  │                              │  │                              │
└──────────────────────────────┘  └──────────────────────────────┘  └──────────────────────────────┘
```

Einstieg: Training → Sparte «Mantrailing» → «Trail legen» / «Hund starten».

## Umsetzung in PRs (nach Freigabe)

1. **PR A – Grundlage**: Sparte, Typen, `track_data.mantrail`-Modell, Speichern
   lokal/Server, Schema-Prüfung auf Staging (lesend), Lösch-/Konto-Pfade,
   Tests; noch ohne Recorder.
2. **PR B – Aufzeichnung**: Trail legen und Hund arbeiten über den bestehenden
   Recorder, Übergabe, Doppelblind-Verdeckung. Vorher: Feldbelege der
   Fährten-Engine lesen (`docs/faehrte/`, `docs/tracking-canonical-baseline.md`),
   Recorder-Kontinuität (Hintergrund, Sperre, App-Neustart, Wiederherstellung)
   mit bestehenden Tests absichern; IGP-Simulator-Matrix (T-192) muss
   unverändert grün bleiben.
   Aufgeteilt (Entscheid Nutzerin 2026-11-25):
   - **PR B1**: Trail legen (bestehender Recorder, Sitzungstyp `mantrail`) oder ohne
     Aufzeichnung, Hund arbeitet (bestehender Absuche-Recorder ohne Gegenstände),
     Doppelblind-Verdeckung, Wiederherstellung, eigenes Kontingent (Migration).
   - **PR B2**: Übergabe Trailer → Hundeführer.
3. **PR C – Auswertung und Statistik**.

## Testweg «Vorher» und Erfolgskriterium

- Jest: Modell, Trail-Alter, Korridor-Auswertung, Statistik, Typ-Trennung
  (IGP-Abfragen sehen keinen `mantrail`), Doppelblind-Verdeckung.
- Regression: bestehende Fährten-Tests und Simulator-Matrix unverändert.
- Feldtest iOS und Android (Staging-Build): Trail legen, Übergabe ans zweite
  Handy, Hund arbeiten mit gesperrtem Bildschirm, App im Hintergrund,
  Negativtrail, Doppelblind; danach eine normale IGP-Fährte → identisch wie
  vorher.
- Fertig, wenn ein Mantrail mit beiden Spuren ausgewertet wird und eine IGP-
  Fährte nachweislich gleich funktioniert wie vorher.

## Entscheide der Nutzerin (2026-11-24)

1. Kontingent: eigenes NEWBIE-Kontingent 1 Trail/Monat, sonst frei.
2. Übergabe Trailer → Hundeführer ist Teil von V1 (PR B).
3. Korridor «in der Nähe»: fest 25 m.
