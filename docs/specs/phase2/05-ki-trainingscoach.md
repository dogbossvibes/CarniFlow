# Spec 5 · Trainingscoach: Wochenvorschlag je Hund

Stand: 2026-11-24 · Status: **Freigegeben von der Nutzerin am 2026-11-24: Variante A** (regelbasiert, keine KI-Dienste; Name «Coach»; Premium, NEWBIE 1 Vorschau)
Quelle: Marktanalyse & Roadmap vom 24.11.2026, Phase 2 (Q1–Q2 2027)
Testweg: **Vorher**, weil Vorschläge in den Kalender übernommen (geschrieben)
werden. Die reine Anzeige ohne Übernehmen wäre «Nachher».

## Wichtiger Ausgangspunkt: bestehender Entscheid «keine externe KI»

- `docs/agent/DECISIONS.md`: «Entfernung aller externen KI aus dem
  Client-Runtime … Keine Übermittlung von Trainings-/Hunde-/Audiodaten an
  Anthropic/OpenAI. Smart Coach/Analyse laufen regel-/statistikbasiert.»
- `app/privacy.tsx` verspricht: Smart Coach ist regel- und statistikbasiert,
  «es werden hierfür keine Daten an externe KI-/LLM-Anbieter übermittelt».
- Server: `supabase/functions/_shared/ai-guard.ts` sperrt alle KI-Funktionen
  (`generate-coach-summary`, `recommend` …) standardmässig mit 410.

Dieser Spec bleibt deshalb **im Hauptweg bei diesem Entscheid** (Variante A).
Eine externe KI (Variante B) ist nur möglich, wenn die Nutzerin den Entscheid
ausdrücklich ändert – mit allen Folgen unten.

## Warum

Viele Hundeführer wissen nach dem Training nicht, was als Nächstes dran ist.
ANYVO kennt die echten Daten (Trainings, Bewertungen, Fährten, Pausen, Ziele,
bald Prüfungsbuch) und kann daraus einen nachvollziehbaren Wochenvorschlag
machen – mit Begründung, die auf diesen Daten beruht.

## Variante A (empfohlen): Regelbasierter Coach auf dem Gerät

1. **Wochenvorschlag je Hund**: 2–5 Einheiten für die nächsten 7 Tage, z. B.
   «Di · Fährte · Winkeltraining, 300 Schritte, 30′ Liegezeit».
2. **Begründung aus echten Daten**, immer mit Zahlen, z. B.
   «Die letzten 3 Fährten hatten am 2. Winkel die grösste Abweichung (Ø 4.1 m)»,
   «Unterordnung seit 16 Tagen nicht trainiert», «Prüfung IGP 2 in 5 Wochen»,
   «Liegezeit zuletzt 3× 30′ ohne Probleme → 45′ versuchen».
3. **Regeln** (erweiterbar, im Code, getestet): Pausen je Sparte, Trend der
   Bewertungen, Fährten-Auswertung V3 (Winkel, Gegenstände, Abweichung),
   Liegezeit-Steigerung, Ziele (`dog-goals`), Prüfungstermine (Spec 1),
   Erholung (keine zwei harten Einheiten hintereinander), Hundealter/Läufigkeit
   nur, wenn bereits erfasst.
4. **Übernehmen**: einzelne Vorschläge oder die ganze Woche als Termine in den
   bestehenden Kalender (`calendar_events`, Typ Training, mit Hund). Danach sind
   es normale Termine: bearbeiten, verschieben, löschen wie immer.
5. **Ausblenden**: einzelner Vorschlag («nicht passend»), Regel für diesen Hund
   aus, oder ganzer Coach aus (Profil-Einstellung). Ausgeblendetes nutzt das
   bestehende `ai_insights`-Dismiss.
6. **Keine Daten verlassen das Gerät** für die Berechnung; gelesen wird, was die
   App ohnehin lädt (lokal + eigene Serverdaten).

## Variante B (nur bei geändertem Entscheid): Externe KI formuliert

- Regeln aus A wählen die Einheiten; ein Sprachmodell formuliert nur Text und
  Begründung schöner. Edge Function (bestehendes Muster, Freischaltung über
  `ANYVO_SERVER_AI_ENABLED`), Modell bei Anthropic.
- **Welche Daten gehen raus** (minimal, ohne Namen): Sparte, Datum, Dauer,
  Bewertung, Fährtenkennzahlen (Länge, Winkel, Abweichung), Liegezeit,
  Hundealter in Jahren. **Nicht**: Hundename, Personenname, Ort/GPS, Notizen,
  Gesundheit, Fotos, Sprachmemos.
- Pflichten: Datenschutzerklärung und Sub-Prozessoren ändern, KI-Kennzeichnung
  (EU AI Act Art. 50), ausdrückliche Einwilligung in der App, Kosten je Anfrage,
  Ausfall-Rückfall auf Variante A, keine Inhalte in Logs.
- Empfehlung: **nicht** in Phase 2; frühestens, wenn A im Feld genutzt wird.

## Nicht-Ziele

- Keine medizinischen Ratschläge, keine Futter-/Gesundheitsempfehlungen.
- Kein automatisches Eintragen ohne Tippen der Person.
- Kein Coach für fremde Hunde (Trainer-Sicht später, eigener Schritt).
- Keine Änderung an bestehenden Insights/Analysen; der Wochenvorschlag ist ein
  neuer Block im bestehenden Coach.

## Datenmodell und Datenwirkung

- Variante A braucht **keine neue Tabelle**:
  - Übernommene Vorschläge = neue Zeilen in `calendar_events` (bestehende
    Spalten; Herkunft über `source_type = 'coach'`, `source_id = <Vorschlags-
    Schlüssel>`). **Im PR prüfen**: ob `source_type` einen CHECK hat; falls ja,
    nur **erweitern**. Alternativ ohne Schemaänderung: Hinweis in `notes`.
  - Ausblenden über bestehende Tabelle `ai_insights`.
  - Coach an/aus und Regel-aus je Hund lokal (Gerät) oder in bestehendem
    Profil-JSON – im PR festlegen.
- Bestehende Termine werden nie verändert oder gelöscht; doppelte Übernahme
  wird über `source_id` erkannt («schon im Kalender»).
- Variante B zusätzlich: keine Speicherung der KI-Antworten auf dem Server.

## Rechte und Sichtbarkeit

- Nur eigene Hunde und eigene Daten. Geteilte/fremde Hunde erhalten keinen
  Vorschlag.
- Termine folgen den bestehenden Kalender-Regeln (Trainer sieht nur, was heute
  schon geteilt wird).
- Keine personenbezogenen Daten in Logs (auch keine Begründungstexte).

## Abo

Entscheid 2026-11-24: ganzer Wochenvorschlag ab Premium; NEWBIE sieht einen
Vorschlag pro Woche als Vorschau (bestehende Capability-Prüfung).

## Mockup

```
┌────────── Coach · Luna ─────────────────┐
│ Deine Woche (25.–31.11.)        ⋯ aus   │
│ ┌─────────────────────────────────────┐ │
│ │ Di · Fährte · Winkeltraining        │ │
│ │ 300 Schritte · 2 Winkel · 45′ liegen│ │
│ │ Warum: Am 2. Winkel zuletzt Ø 4.1 m │ │
│ │ Abweichung (3 Fährten). 30′ klappte │ │
│ │ 3× → Liegezeit steigern.            │ │
│ │ [ In Kalender ]   [ Nicht passend ] │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ Do · Unterordnung · Fussarbeit      │ │
│ │ Warum: 16 Tage nicht trainiert;     │ │
│ │ IGP 2 in 5 Wochen.                  │ │
│ │ [ In Kalender ]   [ Nicht passend ] │ │
│ └─────────────────────────────────────┘ │
│ [ Ganze Woche übernehmen ]              │
│ Berechnet auf deinem Gerät aus deinen   │
│ Trainingsdaten. Keine KI-Dienste.       │
└─────────────────────────────────────────┘
```

## Umsetzung in PRs (nach Freigabe)

1. **PR A – Regelwerk**: reine Funktionen `features/ai/coachWeek/*` mit
   Datentypen, Regeln, Begründungstexten (i18n de-CH/de-DE/gsw-CH), Tests.
2. **PR B – Anzeige**: Block im Coach-Bildschirm und Hundeprofil, Ausblenden
   (zunächst nur lesend → könnte allein mit Testweg «Nachher»).
3. **PR C – Übernehmen in Kalender** (schreibend → Testweg «Vorher»).

## Testweg und Erfolgskriterium

- Jest: jede Regel mit Grenzfällen (keine Daten, nur alte Daten, nur Fährten,
  Prüfung in der Vergangenheit, Läufigkeit), Begründung enthält echte Zahlen,
  keine Doppel-Übernahme.
- Gerätetest Staging: Vorschlag ansehen, übernehmen, Termin im Kalender und
  Geräte-Kalender prüfen, löschen, erneut übernehmen; Coach aus.
- Fertig, wenn jeder Vorschlag eine nachprüfbare Begründung aus den eigenen
  Daten hat und Übernehmen nur neue Termine erzeugt.

## Entscheide der Nutzerin (2026-11-24)

1. **Variante A** freigegeben: regelbasiert auf dem Gerät, keine Daten an
   KI-Dienste; der Entscheid «keine externe KI» bleibt unverändert. Variante B
   ist nicht freigegeben.
2. Abo: Premium; NEWBIE 1 Vorschlag pro Woche als Vorschau.
3. Name in der App: «Coach» (ohne «KI»). Der Dateiname dieses Specs bleibt
   aus Nachvollziehbarkeit zur Roadmap.
