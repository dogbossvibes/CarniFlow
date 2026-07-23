# 02 — Domain Inventory (Ist-Zustand)

> Analysebericht. Ist-Zustand. **[UNKLAR]** markiert Ungesichertes.

## Zweck

Bestandsaufnahme der Kern-Domäne: Hundemodell/`dog_id`, Profile/Rollen, Trainingsmodule und zentrale Typen.

## Gefundene Dateien (zentral)

- Typen: `types/index.ts` (`Profile`, `Dog`, `NewDog`, `TrainingSession`, `Training`, `NewTrainingSession`), `types/capabilities.ts`, `types/trainer.ts`, `types/trainingUnit.ts`, `types/trainingPlan.ts`, `types/tracking.ts`, `types/analytics.ts`, `types/calendar.ts`, `types/chat.ts`, `types/comment.ts`, `types/connection.ts`, `types/customCategory.ts`, `types/umfrage.ts`.
- Hunde: `services/dogs.ts`, `services/dogHub.ts`, `hooks/useDogs.ts`, `features/dogs/*` (`DogHubScreen.tsx`, `buildDogHubVM.ts`, `useDogHubDynamic.ts`, `dogCommands.ts`, `heatCycles.ts`, `documentCategories.ts`, `demoDogs.ts`), `components/dogs/*`, `app/dog/[id].tsx`, `app/add-dog.tsx`, `app/edit-dog.tsx`, `app/dog-*/*`.
- Training: `services/training.ts`, `services/trainingUnitService.ts`, `services/trainingUnitStats.ts`, `services/trainingPlanService.ts`, `services/trainingFeed.ts`, `constants/disciplines.ts`, `constants/sparten.ts`, `app/unit/*`, `app/training/[id].tsx`, `stores/activeTraining.ts`.

## Hundemodell & `dog_id` (Kern)

- Zentraler Typ `Dog` in `types/index.ts` (Felder u. a. `id`, `owner_id`, `name`, `breed`, `birth_date`, `weight_kg`, `gender`, `photo_url`, `titles[]`, Abstammung `sire/dam/kennel`, Identität `color/microchip_number/tasso_registered`, Sport `discipline/level/best_score`, Gesundheit `vet/vaccination/food`, `is_favorite`). Insert-Typ `NewDog` (Pick-Untermenge).
- **`dog_id` ist der durchgängige Fremdschlüssel** in der gesamten Domäne: `TrainingSession.dog_id`, `TrackSession.dog_id` (`types/tracking.ts`), Tracking-Store `dogId` (`features/tracking/store/trackingStore.ts`), Aktive-Fährten-Registry (Schlüssel = `dog_id`), Offline-SQLite (`local_training_sessions.dog_id`, `lib/localDb/migrations.ts`).
- Zusatz-Hundedaten liegen in eigenen Tabellen/Services: `dog_commands`, `dog_documents`, `dog_goals`, `dog_health_entries`, `dog_heat_cycles`, `dog_vet_appointments` (siehe Bericht 03; App-Seiten unter `app/dog-*`, Features unter `features/dogs`).
- **Bestätigte Single Source of Truth:** Ein Hund = eine `dogs.id` (`dog_id`), keine zweite Hundestruktur im Code gefunden. Die Registry (`activeFaehrten`) referenziert `dog_id`, kopiert das Hundemodell nicht.

## Profile & Rollen

- `Profile` (`types/index.ts`): `plan: 'free'|'premium'`, `role: 'user'|'trainer'|'admin'`, `is_trainer`, `is_internal_tester`, `tester_level`, `aktive_sparten[]`.
- Rollen-Typ zusätzlich in `types/trainer.ts` (`UserRole = 'user'|'trainer'|'admin'`, `CoachStatus`).
- **Inkonsistenz Plan-Typen:** `Profile.plan` kennt nur `'free'|'premium'`; parallel existieren `PlanLevel = 'free'|'pro'|'trainer'` (`types/capabilities.ts`) und `SubscriptionPlan = 'newbie'|'founder_active'|'active'|'trainer'` (`features/subscription/plans.ts`). Drei konkurrierende Plan-/Stufen-Vokabulare → Bericht 09.

## Trainingsmodule

- **Zwei Trainings-Typmodelle nebeneinander in `types/index.ts`:** `TrainingSession` (type) und `Training` (interface) beschreiben dasselbe fachliche Objekt mit leicht abweichenden Feldern/Optionalität (Kommentare markieren DB-Feldnamen wie `owner_id`, `session_date`, `training_type`, `rating`). **[UNKLAR]** welche Struktur wo verbindlich genutzt wird.
- Kategorien: `TrainingCategory = 'IGP'|'IBGH'|'Mondioring'|'Alltagstraining'` (`types/index.ts`), plus Disziplinen/Sparten in `constants/disciplines.ts` und `constants/sparten.ts` sowie `Profile.aktive_sparten`. **[UNKLAR]** Verhältnis dieser drei Kategorien-/Sparten-Quellen.
- „Units" als eigener Trainings-Zweig: `types/trainingUnit.ts`, `services/trainingUnitService.ts`, `app/unit/*` (`start`, `live`, `timer`, `summary`, `stats`, `detail`, `document`, `[discipline]`). Zusätzlich `TrainingSession`/`Training` — **[UNKLAR]** ob `TrainingUnit` und `TrainingSession` dasselbe DB-Objekt oder getrennte Tabellen sind (Trainer-Feed nutzt `training_units`, siehe `types/trainer.ts` Kommentar „kein FK training_units→profiles").
- Fährte ist datenmodell-technisch ein Spezialfall von `training_sessions` (`type='track'`, `category='IGP'`) — siehe Bericht 04/05.

## Tatsächlicher Datenfluss

- Hunde: `app/dog/[id].tsx`/`DogHubScreen` → `useDogs`/`services/dogHub.ts` → `supabase` (`dogs` + Zusatztabellen). ViewModel-Bau in `features/dogs/buildDogHubVM.ts`.
- Training: `app/unit/*` → `services/trainingUnit*` → `supabase`; parallele Session-Sicht über `services/training.ts` + `hooks/useTrainingSessions.ts`.

## Bestehende Abhängigkeiten

- Nahezu alle Domänenobjekte hängen an `owner_id` (Profil/User) und `dog_id`.
- Trainer-Sichten hängen an `training_units`/`connections` (Bericht 18).

## Aktuelle Regeln

- Handbuch: genau ein Hundemodell, `dog_id` als alleinige Referenz, „Erweitern statt Ersetzen" (`docs/00_READ_FIRST.md`, `docs/faehrte/15_DECISIONS.md`).

## Inkonsistenzen

- `TrainingSession` vs. `Training` (Doppelmodell in `types/index.ts`).
- Plan-Vokabular dreifach (siehe oben).
- Kategorien/Sparten in mehreren Quellen (`TrainingCategory`, `constants/disciplines.ts`, `constants/sparten.ts`, `Profile.aktive_sparten`).

## Offene Fragen

- Ist `TrainingUnit` (`training_units`) dieselbe Tabelle wie `TrainingSession` (`training_sessions`) oder ein getrenntes Modell? (Namensgebung deutet auf zwei Tabellen — **muss verifiziert werden**.)
- Welche der beiden Trainings-Typdefinitionen ist kanonisch?

## Technische Risiken

- Doppelte/uneinheitliche Typmodelle erhöhen das Risiko von Feld-Drift zwischen Client und DB.
- Mehrere Kategorien-Quellen → widersprüchliche Auswahllisten/Filter möglich.

## Mögliche spätere Verbesserungen

- `TrainingSession`/`Training` auf einen Typ konsolidieren.
- Kategorien/Sparten aus einer einzigen Konstanten-Quelle ableiten.
- Plan-Vokabular vereinheitlichen (siehe Bericht 09).
