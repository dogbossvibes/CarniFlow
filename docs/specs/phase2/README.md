# Phase 2 – Differenzierer (Q1–Q2 2027): Specs

Quelle: Marktanalyse & Roadmap der Nutzerin vom 24.11.2026. Reihenfolge wie in
der Roadmap (Entscheid der Nutzerin 2026-11-24). Alle fünf Specs wurden am
2026-11-24 einzeln von der Nutzerin freigegeben; Entscheide stehen jeweils am
Ende des Specs.

| Nr | Spec | Testweg | Native Build nötig |
|---|---|---|---|
| 1 | [Prüfungs- und Turnierbuch](01-pruefungsbuch.md) | Vorher | nein |
| 2 | [Mantrailing-Modus](02-mantrailing.md) | Vorher, Feldtest iOS + Android | nein |
| 3 | [Sprachsteuerung](03-sprachsteuerung.md) | Vorher | V1 nein; Stufe 2 (gesperrter Bildschirm) ja |
| 4 | [Vereins- und Hundeplatzmodus](04-vereinsmodus.md) | Vorher | nein |
| 5 | [Coach: Wochenvorschlag](05-ki-trainingscoach.md) | Vorher (Übernehmen), Anzeige allein Nachher | nein |

Gemeinsame Regeln für die Umsetzung:

- Eine Aufgabe = ein Branch ab frischem `origin/main` = ein PR gegen `main`;
  grosse Punkte in mehreren PRs (siehe «Umsetzung in PRs» je Spec).
- Nur additive Tabellen/Spalten; Migrationen zuerst auf Staging, Production nur
  mit ausdrücklicher Freigabe der Nutzerin.
- Kundendaten bleiben erhalten (Soft-Delete, kein Überschreiben); IGP-Fährten-
  und GPS-Logik bleibt unverändert.
- Pro PR gemeldet: Tests, TypeScript, ESLint, `git diff --check` – nur Ausgeführtes.
