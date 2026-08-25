# ADR-001 – Domain Model

Version: 1.0
Status: Proposed
Grundlage:

- 02_DOMAIN_INVENTORY.md
- 03_DATABASE_INVENTORY.md
- 12_ANALYSIS_SUMMARY.md

---

# 1. Ziel

Dieses ADR definiert das verbindliche Domänenmodell von ANYVO.

Es beschreibt ausschließlich fachliche Objekte.

Keine technische Implementierung.

Keine UI.

Keine Services.

Keine Datenbankdetails.

---

# 2. Grundprinzipien

## Single Source of Truth

Analysebeleg

12_ANALYSIS_SUMMARY.md

Feststellung

Die Analyse bestätigt folgende Single Sources of Truth:

- Hund = dog_id
- Supabase Client
- Query Client
- Founder Slot
- TrackSegments
- GPS Engine

Entscheidung

Diese Strukturen dürfen nicht dupliziert werden.

---

## Fachliche Domänen

ANYVO besteht aus folgenden Domänen.

User

↓

Dog

↓

Training

↓

Track

↓

TrackEvent

↓

Trainer

↓

Connect

↓

Subscription

↓

Analytics

↓

Media

↓

Notification

Jede Domäne besitzt eine klar definierte Verantwortung.

---

# 3. Domäne Dog

Analyse

02_DOMAIN_INVENTORY.md

Feststellungen

Dog ist der zentrale Typ.

Gefunden wurden

Dog

NewDog

dog_id

services/dogs.ts

hooks/useDogs.ts

DogHub

Dog Commands

Dog Documents

Dog Goals

Dog Health

Dog Heat Cycles

Dog Vet Appointments

Analyseergebnis

Alle hundebezogenen Informationen referenzieren ausschließlich dog_id.

Keine zweite Hundestruktur wurde gefunden.

Entscheidung

Dog ist die einzige autorisierte Hundedomäne.

Alle zukünftigen Erweiterungen müssen Dog referenzieren.

Nicht zulässig

eigene Hundestrukturen

lokale Hundekopien

zweite Hundetabellen

---

# 4. Domäne Training

Analyse

02_DOMAIN_INVENTORY.md

Feststellungen

Im Repository existieren aktuell zwei konkurrierende Fachmodelle.

TrainingSession

Training

Zusätzlich existiert

TrainingUnit

TrainingPlan

Bewertung

Die Analyse kann nicht eindeutig bestimmen,

welches Modell langfristig führend sein soll.

Entscheidung

TrainingSession wird zukünftig das führende Domänenmodell.

Training gilt als Legacy.

TrainingUnit bleibt eine Spezialisierung.

TrainingPlan beschreibt ausschließlich Planung.

Migration erforderlich.

---

# 5. Domäne Track

Analyse

03_DATABASE_INVENTORY.md

12_ANALYSIS_SUMMARY.md

Feststellungen

Es existieren zwei Trackmodelle.

Aktiv

training_sessions(type='track')

Legacy

track_sessions

Bewertung

Diese Parallelstruktur verletzt das Prinzip

Single Source of Truth.

Entscheidung

Es wird zukünftig genau eine Track-Domäne geben.

Track besitzt

track_id

dog_id

training_session_id

Track enthält

TrackPoints

TrackEvents

Metadaten

Keine Hundedaten.

---

# 6. Domäne TrackEvent

Analyse

12_ANALYSIS_SUMMARY.md

Aktueller Zustand

track_markers

track_data.segments

Kein echtes TrackEvent-Modell vorhanden.

Entscheidung

TrackEvent wird zukünftig die einzige Ereignisstruktur.

TrackEvents beschreiben

Winkel

Gegenstände

Verleitungen

Unterbrüche

Richterereignisse

Benutzerereignisse

Neue Ereignisse dürfen ausschließlich über TrackEvent modelliert werden.

---

# 7. Domäne Subscription

Analyse

02_DOMAIN_INVENTORY.md

03_DATABASE_INVENTORY.md

12_ANALYSIS_SUMMARY.md

Feststellungen

Drei konkurrierende Planmodelle

Profile.plan

PlanLevel

SubscriptionPlan

Zusätzlich

subscriptions

user_capabilities

user_entitlements

Bewertung

Architektur nicht konsistent.

Entscheidung

Es existiert zukünftig genau ein Subscription-Modell.

Capabilities werden ausschließlich daraus abgeleitet.

---

# 8. Domäne Connect

Analyse

03_DATABASE_INVENTORY.md

12_ANALYSIS_SUMMARY.md

Feststellungen

Es existieren

connect\_\*

und

connection\_\*

Bewertung

Alt- und Neusystem parallel.

Entscheidung

Connect wird langfristig das einzige Community-System.

connection\_\* wird als Legacy betrachtet.

---

# 9. Domäne Smart Analyse

Analyse

12_ANALYSIS_SUMMARY.md

Feststellungen

Repository enthält

deterministische Smart Analyse

und

KI-Subsystem

Bewertung

Architektur widersprüchlich.

Entscheidung

Smart Analyse ist zukünftiger Standard.

Neue Funktionen dürfen keine KI-Abhängigkeit erzeugen.

Bestehende KI-Komponenten bleiben bis zur Migration dokumentiert.

---

# 10. Verbote

Nicht zulässig

- zweites Hundemodell
- zweites Trackmodell
- parallele Trainingsdomänen
- Businesslogik im UI
- doppelte Fachobjekte
- zyklische Domänenabhängigkeiten

---

# 11. Migrationsbedarf

Hoch

- Trackmodell
- TrackEvents
- Subscription

Mittel

- Connect
- Rollenmodell

Niedrig

- Legacy Training
