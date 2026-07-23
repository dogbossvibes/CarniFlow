# ADR-000

# Aktueller Architekturzustand und Zielarchitektur von ANYVO

Version: 1.0

Status: APPROVED (nach Freigabe)

Datum: 2026-07-23

Autor:
ANYVO Engineering Team

---

# 1. Zweck

Dieses Dokument definiert die verbindliche Zielarchitektur von ANYVO.

Es basiert auf der vollständigen Analyse des aktuellen Repositorys
(docs/handbook-source/00–12).

Das Dokument unterscheidet bewusst zwischen

- IST-Zustand
- Zielarchitektur

um spätere Fehlentwicklungen zu vermeiden.

Dieses ADR besitzt Vorrang gegenüber spontanen Architekturentscheidungen.

Alle zukünftigen Entwicklungen müssen sich an diesem Dokument orientieren.

---

# 2. Ziel

ANYVO entwickelt sich zu einer modularen Plattform für

- Hundehalter
- Hundesport
- Hundetrainer
- Züchter

mit folgenden Eigenschaften:

- Offline First
- Plattformneutral
- Modular
- Erweiterbar
- Wartbar
- Testbar
- Deterministische Smart Analyse
- Single Source of Truth

---

# 3. Ergebnisse der Repositoryanalyse

Die Analyse des Repositorys zeigt folgende zentrale Erkenntnisse.

## Bestätigt

✓ dog_id ist die zentrale Hundereferenz

✓ Supabase ist die zentrale Backendplattform

✓ Expo Router bildet die Navigationsstruktur

✓ Zustand ist bereits weitgehend modular aufgebaut

✓ Features sind überwiegend getrennt organisiert

---

## Inkonsistenzen

Folgende Bereiche besitzen konkurrierende Architekturen.

### Trackmodell

IST

training_sessions(type='track')

parallel zu

track_sessions

Bewertung

Nicht dauerhaft wartbar.

Entscheidung

Es wird künftig genau ein Trackmodell geben.

---

### TrackEvents

IST

track_markers

track_data.segments

ZIEL

TrackEvents

Begründung

Neue Ereignisse dürfen keine Sonderlösungen mehr sein.

Alle Ereignisse werden über TrackEvents modelliert.

---

### KI

IST

KI-Subsystem vorhanden

Edge Functions

pgvector

AI Module

ZIEL

Smart Analyse

Entscheidung

Neue Funktionen werden ausschließlich für Smart Analyse entwickelt.

Bestehende KI-Komponenten werden langfristig ersetzt oder entfernt.

Bis dahin bleiben sie dokumentiert.

---

### Offline

IST

Mehrere Offline-Systeme

ZIEL

Ein gemeinsames Offline Framework

---

### GPS

IST

Mehrere Eingangspfade

ZIEL

Eine gemeinsame GPS Engine

---

### Berechtigungen

IST

Mehrere Rollenmodelle

Mehrere Berechtigungstabellen

ZIEL

Ein zentrales Berechtigungssystem

---

# 4. Architekturprinzipien

## Prinzip 1

Single Source of Truth

Jede fachliche Information besitzt genau eine Quelle.

---

## Prinzip 2

Keine parallelen Domänenmodelle

Es existiert niemals

- zwei Hundemodelle

- zwei Trackmodelle

- zwei GPS Modelle

- zwei Trainerstrukturen

---

## Prinzip 3

Erweitern statt Ersetzen

Neue Funktionen erweitern bestehende Services.

Neue Services entstehen nur wenn keine geeignete Architektur existiert.

---

## Prinzip 4

Offline First

Alle Kernfunktionen müssen offline funktionieren.

---

## Prinzip 5

Deterministische Smart Analyse

Neue Analysen basieren ausschließlich auf nachvollziehbaren Regeln.

Keine neue KI.

---

## Prinzip 6

Modulare Features

Jedes Modul besitzt klar definierte Verantwortlichkeiten.

---

# 5. Zielarchitektur

ANYVO besteht künftig aus folgenden Kernmodulen.

Domain

↓

Application

↓

Services

↓

Persistence

↓

Supabase

↓

Offline Cache

↓

Platform

---

## Domänen

Dog

Training

Track

TrackEvent

Trainer

Connect

Subscription

Analytics

Media

Notification

---

## GPS

GPS

↓

TrackPoints

↓

Track

↓

TrackEvents

↓

Smart Analyse

---

## Smart Analyse

Track

↓

TrackPoints

↓

TrackEvents

↓

Deterministische Regeln

↓

Ergebnisse

---

# 6. Migration

Folgende Bereiche benötigen langfristig Migration.

| Bereich            | Priorität |
| ------------------ | --------- |
| Trackmodell        | Hoch      |
| TrackEvents        | Hoch      |
| Offline            | Mittel    |
| Rollenmodell       | Mittel    |
| KI → Smart Analyse | Hoch      |
| GPS Eingangspfade  | Mittel    |

---

# 7. Verbindliche Regeln

Neue Features dürfen

NICHT

- neue Hundemodelle erzeugen

- neue GPS Engines erzeugen

- neue Trackmodelle erzeugen

- Businesslogik im UI enthalten

- Magic Numbers verwenden

- Daten mehrfach speichern

---

# 8. Dokumentationspflicht

Jede Architekturänderung benötigt künftig

- neues ADR

oder

- Erweiterung eines bestehenden ADR.

---

# 9. Gültigkeit

Dieses ADR bildet die Grundlage für das gesamte

ANYVO Engineering Handbook.

Alle folgenden Dokumente beziehen sich auf dieses Dokument.

---

# Ende ADR-000
