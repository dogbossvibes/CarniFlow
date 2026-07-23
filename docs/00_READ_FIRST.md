# ANYVO Engineering Handbook

Version: 1.0
Status: Official Engineering Specification

---

# 1. Zweck dieses Handbuchs

Dieses Engineering Handbook ist die technische Referenz für die Entwicklung von ANYVO.

Es beschreibt verbindlich die Architektur, die Entwicklungsrichtlinien und die fachlichen Regeln der gesamten Plattform.

Alle zukünftigen Änderungen an ANYVO müssen sich an diesem Handbuch orientieren.

Dieses Dokument besitzt Vorrang vor einzelnen Chatanweisungen oder spontanen Architekturentscheidungen.

Wenn sich zwei Dokumente widersprechen, gilt immer dieses Engineering Handbook.

---

# 2. Ziel von ANYVO

ANYVO ist eine professionelle Plattform für Hundehalter, Hundesportler, Hundetrainer und Züchter.

Die Plattform unterstützt sämtliche Trainings- und Dokumentationsprozesse eines Hundes während seines gesamten Lebens.

ANYVO ist kein einzelnes Trainingsmodul.

ANYVO ist ein vollständiges Ökosystem.

Dazu gehören unter anderem:

- Hundeverwaltung
- Training
- Fährten
- Unterordnung
- Schutzdienst
- Obedience
- Agility
- Mondioring
- Trainerbereich
- Community (Connect)
- Auswertungen
- Smart Analyse
- Statistiken
- Kalender
- Dokumentation
- Offlinebetrieb
- Synchronisation
- Premiumfunktionen

Alle zukünftigen Funktionen müssen sich in diese Architektur einfügen.

---

# 3. Grundprinzipien

Die folgenden Prinzipien sind verbindlich.

## 3.1 Single Source of Truth

Jede fachliche Information besitzt genau eine Quelle.

Beispiel:

Ein Hund wird ausschließlich über seine dog_id identifiziert.

Es dürfen keine zusätzlichen Hundestrukturen entstehen.

---

## 3.2 Erweitern statt Ersetzen

Bestehende Komponenten werden erweitert.

Sie werden nicht ersetzt.

Neue Services dürfen nur entstehen, wenn keine geeignete bestehende Architektur existiert.

---

## 3.3 Offline First

ANYVO muss möglichst vollständig offline funktionieren.

Eine Internetverbindung darf niemals Voraussetzung für normales Training sein.

---

## 3.4 Plattformneutral

Neue Funktionen müssen grundsätzlich auf

- iOS
- Android

identisch funktionieren.

Plattformspezifischer Code darf nur verwendet werden, wenn dies technisch notwendig ist.

---

## 3.5 Deterministische Smart Analyse

ANYVO verwendet keine künstliche Intelligenz zur Trainingsanalyse.

Alle Analysen erfolgen nachvollziehbar anhand definierter Regeln.

Jede Berechnung muss reproduzierbar sein.

---

## 3.6 Wiederverwendbare Komponenten

Komponenten werden nicht kopiert.

Bereits vorhandene Komponenten werden erweitert.

---

## 3.7 Kleine Verantwortlichkeiten

Jede Klasse besitzt genau eine Aufgabe.

Beispiele:

GPS-Service

→ Positionen

nicht

→ Gegenstände

→ Winkel

→ Smart Analyse

---

# 4. Verbotene Architektur

Folgende Muster sind grundsätzlich verboten.

## Doppelte Datenhaltung

Ein Objekt darf nicht gleichzeitig in mehreren Strukturen gepflegt werden.

---

## Zweite Hundestruktur

Es existiert genau ein Hundemodell.

---

## Zweite GPS Engine

Alle GPS-Funktionen verwenden dieselbe GPS Engine.

---

## Fachlogik im UI

Businesslogik gehört niemals in Screens.

Screens stellen ausschließlich dar.

---

## Direkte Datenbankzugriffe

Screens kommunizieren niemals direkt mit Supabase.

---

## Magic Numbers

Numerische Werte müssen als Konstanten definiert werden.

---

## Unstrukturierte States

Große lokale useState-Ketten sind zu vermeiden.

---

# 5. Repository-Analyse

Vor jeder Änderung muss die bestehende Architektur analysiert werden.

Mindestens:

- vorhandene Services
- bestehende Hooks
- vorhandene Stores
- bestehende Komponenten
- bestehende Datenmodelle
- vorhandene Datenbanktabellen
- vorhandene Tests

Erst danach darf implementiert werden.

---

# 6. Standard-Workflow

Jede Entwicklung erfolgt in dieser Reihenfolge.

1. Dokumentation lesen

2. Repository analysieren

3. Auswirkungen prüfen

4. Architektur festlegen

5. Implementieren

6. Tests ergänzen

7. iOS prüfen

8. Android prüfen

9. Abschlussbericht erstellen

10. Kein Commit

11. Kein Push

---

# 7. Qualitätsanforderungen

Neue Funktionen müssen

- nachvollziehbar
- testbar
- wartbar
- dokumentiert
- wiederverwendbar
- performant
- offlinefähig

sein.

---

# 8. Dokumentationspflicht

Jede größere Änderung muss dokumentiert werden.

Mindestens:

- Zweck

- Architektur

- Auswirkungen

- Datenmodell

- Tests

---

# 9. Definition of Done

Eine Aufgabe gilt nur als abgeschlossen wenn:

✓ Architektur analysiert

✓ Dokumentation angepasst

✓ Code implementiert

✓ Tests ergänzt

✓ TypeScript erfolgreich

✓ Lint erfolgreich

✓ iOS geprüft

✓ Android geprüft

✓ Abschlussbericht erstellt

---

# 10. Zu lesende Dokumente

Vor jeder Entwicklung sind folgende Dokumente vollständig zu lesen.

01_SYSTEM_ARCHITEKTUR.md

02_CODING_STANDARDS.md

03_DATABASE.md

04_GPS_ENGINE.md

05_FAEHRTE.md

06_TRACK_EVENTS.md

07_SMART_ANALYSE.md

08_UI_GUIDELINES.md

09_OFFLINE.md

10_TESTPLAN.md

11_RELEASE.md

15_DECISIONS.md

---

# Ende des Dokuments
