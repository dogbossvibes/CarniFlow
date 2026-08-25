# Subscription P0 — DB Deployment Checklist (Staging → Production)

> **Kein Auto-Runner im Repo.** Diese Migrationen werden **manuell** und **nur nach
> ausdrücklicher Freigabe** ausgeführt. Reihenfolge strikt einhalten.
>
> **Release-Blocker:** Der fail-closed NEWBIE-Quota-Client (`claim_newbie_quota`) blockiert
> in Production Trainings-/Fährten-Neuanlage, wenn die RPC **nicht** existiert. Daher MUSS
> `SUBSCRIPTION_NEWBIE_QUOTAS_SETUP.sql` **vor** dem Ausrollen des Client-Builds deployed sein.

## Artefakte
1. `SUBSCRIPTION_NEWBIE_QUOTAS_SETUP.sql` — Tabelle `newbie_quota_claims`, RPC `claim_newbie_quota`, `newbie_quota_status`, `newbie_quota_limit`, `is_pro_member`.
2. `FOUNDER_SLOT_LIFECYCLE_SETUP.sql` — Statusspalten auf `founder_slots`, `claim_founder_slot` (11 jemals), `lapse_/release_/restore_founder_slot`.

## Reihenfolge

1. **Remote-Schema prüfen**
   - `public.user_capabilities(user_id, pro_member)` vorhanden (CAPABILITY_MODEL_SETUP.sql).
   - `public.dogs.owner_id` vorhanden.
   - `public.founder_slots` vorhanden (SUBSCRIPTION_V2_SETUP.sql).
2. **Backup / Snapshot** der Datenbank (PITR-Punkt notieren).
3. **Quota-SQL** in Staging ausführen: `SUBSCRIPTION_NEWBIE_QUOTAS_SETUP.sql`.
   - Idempotent → erneuter Lauf muss fehlerfrei sein.
4. **Founder-Lifecycle-SQL** in Staging ausführen: `FOUNDER_SLOT_LIFECYCLE_SETUP.sql`.
   - Prüfen: bestehende `founder_slots`-Zeilen erhalten `status='active'` (Default), keine Zeile gelöscht.
5. **RPC Smoke-Tests** (als eingeloggter Test-User, nicht service_role):
   - `select * from claim_newbie_quota('training', gen_random_uuid()::text);` → success=true, used=1, limit=2
   - zweiter Aufruf mit **neuer** ref → used=2; dritter → success=false (exceeded).
   - erneuter Aufruf mit **gleicher** ref → success=true (idempotent, kein Verbrauch).
   - `select * from claim_newbie_quota('track', gen_random_uuid()::text);` → success=true; zweite neue ref → success=false.
   - Als Premium-User (pro_member=true): `claim_newbie_quota('training', …)` → success=true, limit sehr groß (kein Verbrauch).
   - `select * from newbie_quota_status('dog');` → used = tatsächliche Hundeanzahl, limit=1.
   - Founder: `select * from claim_founder_slot(auth.uid());` idempotent; `lapse_founder_slot` setzt status='lapsed' (kein Delete); `founder_slots_status()` remaining = 11 − count(*).
6. **RLS/Sicherheit** prüfen: fremde `user_id` in `newbie_quota_claims` nicht lesbar; RPCs nutzen ausschließlich `auth.uid()`.
7. **Client-Test** (Staging-Build):
   - NEWBIE: Training 1+2 ok, 3 → Limit-Dialog; Fährte 1 ok, 2 → Limit-Dialog; bestehende Inhalte sichtbar.
   - RPC künstlich blockieren → Production-Build zeigt „Kontingent konnte nicht geprüft werden", **kein** unbegrenztes Weiterarbeiten.
   - Premium: keine Limits.
8. **Production**: Schritte 2–6 auf Produktion — **nur nach expliziter Freigabe** — dann Client-Build ausrollen.

## Rollback
- Quota: `drop function claim_newbie_quota, newbie_quota_status, newbie_quota_limit, is_pro_member; drop table newbie_quota_claims;` (nur Staging; entfernt Enforcement → Gate greift dann nicht mehr).
- Founder-Lifecycle: Funktionen sind `create or replace` → durch Wiedereinspielen von FOUNDER_WEBHOOK_SETUP.sql/SUBSCRIPTION_V2_SETUP.sql rückführbar. **`founder_slots`-Zeilen NICHT löschen.**

**Keine produktive DB-Änderung ohne ausdrückliche Freigabe.**
