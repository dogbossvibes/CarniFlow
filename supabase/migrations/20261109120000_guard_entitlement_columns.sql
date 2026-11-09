-- ANYVO — Schutz der Abo- und Berechtigungsspalten vor Selbst-Freischaltung (T-182)
-- Auf Production angewendet am 2026-11-09 11:23 UTC (Freigabe der Nutzerin), als eine
-- Transaktion; danach lesend geprüft. Idempotent (create or replace / drop trigger if exists).
-- Getestet: supabase/local/guard_entitlement_columns_test.sql (16/16, lokal gegen
-- supabase/postgres 17.6.1.127 mit Production-Schemaausschnitt).
-- Rückweg: Trigger trg_anyvo_guard_* und Funktionen anyvo_guard_*, anyvo_is_client_role,
-- anyvo_subscription_grants entfernen; Daten werden durch diese Migration nicht verändert.
--
-- Prinzip: Direkte Client-Schreibzugriffe (PostgREST, Rolle `authenticated`/`anon`) dürfen
-- keine Rechte ERHÖHEN. Server-Pfade bleiben unverändert erlaubt:
--   * Edge Functions mit Service-Role (current_user = service_role)
--   * SECURITY-DEFINER-Funktionen (subscription_*_v1, claim_founder_slot …), current_user = Owner
-- Herabstufen (z. B. Wahl von NEWBIE, Trial-Kündigung) und harmlose Marker
-- (active_trial_offered_at/count, Push-Token, Locale …) bleiben für den Client erlaubt,
-- damit alle 13 Live-Runtimes mit Server-Autorität unverändert funktionieren.
-- Die 3 alten Runtimes (iOS 1.0.3, Android 1.0.3/1.0.1) schreiben bezahlte Pläne noch selbst;
-- deren Aktivierung läuft danach nur noch über Webhook/subscription-sync.

create or replace function public.anyvo_is_client_role()
returns boolean language sql stable
set search_path to ''
as $$ select current_user in ('authenticated', 'anon') $$;

-- Bezahlter bzw. rechtegewährender Zustand einer subscriptions-Zeile.
create or replace function public.anyvo_subscription_grants(p_plan text, p_status text)
returns boolean language sql immutable
set search_path to ''
as $$ select coalesce(p_plan, '') in ('active', 'founder_active', 'trainer') or coalesce(p_status, '') = 'trialing' $$;

-- subscriptions -----------------------------------------------------------
create or replace function public.anyvo_guard_subscriptions()
returns trigger language plpgsql
set search_path to ''
as $$
begin
  if not public.anyvo_is_client_role() then return new; end if;

  if tg_op = 'INSERT' then
    if public.anyvo_subscription_grants(new.plan, new.status)
       or new.trial_ends_at is not null then
      raise exception using errcode = '42501', message = 'ENTITLEMENT_SERVER_ONLY';
    end if;
    return new;
  end if;

  -- UPDATE: Schutzspalten dürfen nur gleich bleiben oder auf einen nicht gewährenden
  -- Zustand fallen. Erhöhen oder Verlängern ist dem Client verboten.
  if public.anyvo_subscription_grants(new.plan, new.status) then
    if not public.anyvo_subscription_grants(old.plan, old.status)
       or new.plan is distinct from old.plan
       or new.status is distinct from old.status
       or new.tier is distinct from old.tier
       or new.product_id is distinct from old.product_id
       or new.provider_product_id is distinct from old.provider_product_id
       or new.provider_subscription_id is distinct from old.provider_subscription_id
       or new.store is distinct from old.store
       or new.provider is distinct from old.provider
       or new.started_at is distinct from old.started_at
       or new.trial_ends_at is distinct from old.trial_ends_at
       or new.current_period_ends_at is distinct from old.current_period_ends_at
       or new.expires_at is distinct from old.expires_at then
      raise exception using errcode = '42501', message = 'ENTITLEMENT_SERVER_ONLY';
    end if;
  elsif new.trial_ends_at is distinct from old.trial_ends_at and new.trial_ends_at is not null then
    raise exception using errcode = '42501', message = 'ENTITLEMENT_SERVER_ONLY';
  end if;
  return new;
end $$;

drop trigger if exists trg_anyvo_guard_subscriptions on public.subscriptions;
create trigger trg_anyvo_guard_subscriptions
  before insert or update on public.subscriptions
  for each row execute function public.anyvo_guard_subscriptions();

-- user_capabilities -------------------------------------------------------
create or replace function public.anyvo_guard_user_capabilities()
returns trigger language plpgsql
set search_path to ''
as $$
begin
  if not public.anyvo_is_client_role() then return new; end if;
  if coalesce(new.pro_member, false)
       and not (tg_op = 'UPDATE' and coalesce(old.pro_member, false))
     or coalesce(new.trainer_module, false)
       and not (tg_op = 'UPDATE' and coalesce(old.trainer_module, false)) then
    raise exception using errcode = '42501', message = 'ENTITLEMENT_SERVER_ONLY';
  end if;
  return new;
end $$;

drop trigger if exists trg_anyvo_guard_user_capabilities on public.user_capabilities;
create trigger trg_anyvo_guard_user_capabilities
  before insert or update on public.user_capabilities
  for each row execute function public.anyvo_guard_user_capabilities();

-- profiles (alte, parallele Gating-Quelle) --------------------------------
create or replace function public.anyvo_guard_profile_plan()
returns trigger language plpgsql
set search_path to ''
as $$
begin
  if not public.anyvo_is_client_role() then return new; end if;
  if tg_op = 'INSERT' then
    if coalesce(new.plan, 'free') <> 'free' or new.plan_expires_at is not null
       or coalesce(new.is_trainer, false) then
      raise exception using errcode = '42501', message = 'ENTITLEMENT_SERVER_ONLY';
    end if;
    return new;
  end if;
  if (coalesce(new.plan, 'free') <> 'free'
        and (new.plan is distinct from old.plan or new.plan_expires_at is distinct from old.plan_expires_at))
     or (coalesce(new.is_trainer, false) and not coalesce(old.is_trainer, false)) then
    raise exception using errcode = '42501', message = 'ENTITLEMENT_SERVER_ONLY';
  end if;
  return new;
end $$;

drop trigger if exists trg_anyvo_guard_profile_plan on public.profiles;
create trigger trg_anyvo_guard_profile_plan
  before insert or update on public.profiles
  for each row execute function public.anyvo_guard_profile_plan();

-- Trigger-Funktionen sind nicht per RPC aufrufbar (Rückgabetyp trigger); keine weiteren Grants nötig.
