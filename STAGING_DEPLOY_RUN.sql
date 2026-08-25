-- ============================================================================
-- STAGING_DEPLOY_RUN.sql — ANYVO Subscription P0 (NUR STAGING)
-- ============================================================================
-- EIN Skript zum Einfügen in den Supabase-SQL-Editor eines SEPARATEN
-- STAGING-Projekts. NIEMALS gegen Produktion (axkkhyqrjrtbkumaulta) ausführen.
--
-- VORAUSSETZUNGEN im Staging-Projekt (vorher ausführen, falls noch nicht da):
--   1) CAPABILITY_MODEL_SETUP.sql   → public.user_capabilities(user_id, pro_member)
--   2) DOGS_PROFILE_SETUP.sql       → public.dogs(owner_id, …)
--   3) SUBSCRIPTION_V2_SETUP.sql    → public.founder_slots, founder_slot_limit()=11
--   4) EIN Test-User: Dashboard → Authentication → Add user. Dessen UUID kopieren.
--
-- BEDIENUNG:
--   • TEIL 1 + TEIL 2 einmal ausführen (erzeugt Tabellen/RPCs; committen).
--   • In TEIL 3 die eine Stelle `REPLACE_WITH_STAGING_TEST_USER_UUID` durch die
--     Test-User-UUID ersetzen und ausführen. Ergebnisse erscheinen als NOTICE
--     im Tab „Messages"; TEIL 3 rollt ALLE Testdaten selbst zurück (persistiert nichts).
--   • Schick mir die NOTICE-Ausgabe zur Auswertung.
-- ============================================================================


-- ############################################################################
-- TEIL 1 — NEWBIE-QUOTAS  (= SUBSCRIPTION_NEWBIE_QUOTAS_SETUP.sql)
-- ############################################################################
begin;

create table if not exists public.newbie_quota_claims (
  user_id    uuid  not null references auth.users(id) on delete cascade,
  kind       text  not null check (kind in ('training','track')),
  period     text  not null,                 -- 'YYYY-MM' (UTC)
  ref_id     text  not null,                 -- stabile Objekt-ID (Idempotenz)
  created_at timestamptz not null default now(),
  primary key (user_id, kind, ref_id)
);
create index if not exists newbie_quota_claims_period_idx
  on public.newbie_quota_claims (user_id, kind, period);

alter table public.newbie_quota_claims enable row level security;
drop policy if exists "own quota claims" on public.newbie_quota_claims;
create policy "own quota claims" on public.newbie_quota_claims
  for select to authenticated using (user_id = auth.uid());

create or replace function public.newbie_quota_limit(p_kind text)
returns int language sql immutable as $$
  select case p_kind when 'dog' then 1 when 'training' then 2 when 'track' then 1 else 0 end
$$;

create or replace function public.is_pro_member(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select pro_member from public.user_capabilities where user_id = p_user_id), false)
$$;

create or replace function public.claim_newbie_quota(p_kind text, p_ref text)
returns table(success boolean, used int, "limit" int)
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_limit  int  := newbie_quota_limit(p_kind);
  v_period text := to_char(timezone('utc', now()), 'YYYY-MM');
  v_used   int;
begin
  if v_uid is null then return query select false, 0, v_limit; return; end if;
  if p_kind not in ('training','track') then return query select false, 0, v_limit; return; end if;
  if is_pro_member(v_uid) then return query select true, 0, 2147483647; return; end if;

  perform pg_advisory_xact_lock(hashtext(v_uid::text || ':' || p_kind));

  if exists (select 1 from newbie_quota_claims
             where user_id = v_uid and kind = p_kind and ref_id = p_ref) then
    select count(*) into v_used from newbie_quota_claims
      where user_id = v_uid and kind = p_kind and period = v_period;
    return query select true, v_used, v_limit; return;
  end if;

  select count(*) into v_used from newbie_quota_claims
    where user_id = v_uid and kind = p_kind and period = v_period;
  if v_used >= v_limit then return query select false, v_used, v_limit; return; end if;

  insert into newbie_quota_claims(user_id, kind, period, ref_id)
    values (v_uid, p_kind, v_period, p_ref);
  return query select true, v_used + 1, v_limit;
end; $$;
grant execute on function public.claim_newbie_quota(text, text) to authenticated;

create or replace function public.newbie_quota_status(p_kind text)
returns table(used int, "limit" int)
language plpgsql security definer set search_path = public stable as $$
declare
  v_uid    uuid := auth.uid();
  v_period text := to_char(timezone('utc', now()), 'YYYY-MM');
  v_used   int;
begin
  if v_uid is null then return query select 0, newbie_quota_limit(p_kind); return; end if;
  if is_pro_member(v_uid) then return query select 0, 2147483647; return; end if;
  if p_kind = 'dog' then
    select count(*) into v_used from public.dogs where owner_id = v_uid;
  else
    select count(*) into v_used from newbie_quota_claims
      where user_id = v_uid and kind = p_kind and period = v_period;
  end if;
  return query select v_used, newbie_quota_limit(p_kind);
end; $$;
grant execute on function public.newbie_quota_status(text) to authenticated;

commit;


-- ############################################################################
-- TEIL 2 — FOUNDER-LIFECYCLE  (= FOUNDER_SLOT_LIFECYCLE_SETUP.sql)
-- ############################################################################
begin;

alter table public.founder_slots add column if not exists status     text        not null default 'active';
alter table public.founder_slots add column if not exists claimed_at timestamptz not null default now();
alter table public.founder_slots add column if not exists updated_at timestamptz not null default now();
alter table public.founder_slots drop constraint if exists founder_slots_status_check;
alter table public.founder_slots add constraint founder_slots_status_check
  check (status in ('active','lapsed','cancelled','refunded'));

create or replace function public.claim_founder_slot(p_user_id uuid)
returns table(success boolean, slots_used int, slots_remaining int)
language plpgsql security definer set search_path = public as $$
declare v_count int; v_existing int; v_limit int := founder_slot_limit();
begin
  perform pg_advisory_xact_lock(770077);
  select count(*) into v_existing from founder_slots where user_id = p_user_id;
  if v_existing > 0 then
    update founder_slots set status = 'active', updated_at = now() where user_id = p_user_id;
    select count(*) into v_count from founder_slots;
    return query select true, v_count, greatest(0, v_limit - v_count); return;
  end if;
  select count(*) into v_count from founder_slots;
  if v_count >= v_limit then
    return query select false, v_count, 0; return;
  end if;
  insert into founder_slots(user_id, status) values (p_user_id, 'active');
  v_count := v_count + 1;
  return query select true, v_count, greatest(0, v_limit - v_count);
end; $$;
grant execute on function public.claim_founder_slot(uuid) to authenticated, service_role;

create or replace function public.lapse_founder_slot(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.founder_slots set status = 'lapsed', updated_at = now()
   where user_id = p_user_id and status <> 'lapsed';
end; $$;
grant execute on function public.lapse_founder_slot(uuid) to service_role;

create or replace function public.release_founder_slot(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.lapse_founder_slot(p_user_id);
end; $$;
grant execute on function public.release_founder_slot(uuid) to service_role;

create or replace function public.restore_founder_slot(p_user_id uuid)
returns table(success boolean)
language plpgsql security definer set search_path = public as $$
begin
  update public.founder_slots set status = 'active', updated_at = now() where user_id = p_user_id;
  return query select exists(select 1 from founder_slots where user_id = p_user_id);
end; $$;
grant execute on function public.restore_founder_slot(uuid) to authenticated, service_role;

create or replace function public.founder_slots_status()
returns table(slots_used int, slots_remaining int)
language sql security definer set search_path = public stable as $$
  select count(*)::int, greatest(0, founder_slot_limit() - count(*))::int from founder_slots;
$$;
grant execute on function public.founder_slots_status() to authenticated;

commit;


-- ############################################################################
-- TEIL 3 — SMOKE TESTS (self-rollback; persistiert NICHTS)
-- ----------------------------------------------------------------------------
-- Ersetze unten die EINE Stelle durch die UUID eines Staging-Test-Users
-- (Dashboard → Authentication → Users). Ergebnisse: Tab „Messages"/NOTICE.
-- Alle Testdaten (Claims, Premium-Flag, Founder-Slot) werden am Ende
-- automatisch zurückgerollt → keine Spuren, Founder-11-Kapazität unberührt.
-- ############################################################################
do $$
declare
  v_uid uuid := 'REPLACE_WITH_STAGING_TEST_USER_UUID'::uuid;   -- <<< HIER eintragen
  r     record;
begin
  -- auth.uid() = v_uid simulieren (beide Varianten je nach Postgres-Version setzen):
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  perform set_config('request.jwt.claim.sub', v_uid::text, true);
  delete from public.user_capabilities where user_id = v_uid;   -- Ausgangslage: NEWBIE

  -- NEWBIE Training (Limit 2)
  select * into r from public.claim_newbie_quota('training','smoke-train-A');
  raise notice 'Training A          -> success=% used=% limit=%   [erwartet t / 1 / 2]', r.success, r.used, r."limit";
  select * into r from public.claim_newbie_quota('training','smoke-train-A');
  raise notice 'Training A (retry)  -> success=% used=% limit=%   [erwartet t / 1 / 2  idempotent]', r.success, r.used, r."limit";
  select * into r from public.claim_newbie_quota('training','smoke-train-B');
  raise notice 'Training B          -> success=% used=% limit=%   [erwartet t / 2 / 2]', r.success, r.used, r."limit";
  select * into r from public.claim_newbie_quota('training','smoke-train-C');
  raise notice 'Training C          -> success=% used=% limit=%   [erwartet f / 2 / 2  exceeded]', r.success, r.used, r."limit";
  select * into r from public.newbie_quota_status('training');
  raise notice 'Status training     -> used=% limit=%              [erwartet 2 / 2]', r.used, r."limit";

  -- NEWBIE Fährte (Limit 1)
  select * into r from public.claim_newbie_quota('track','smoke-track-A');
  raise notice 'Track A             -> success=% used=% limit=%   [erwartet t / 1 / 1]', r.success, r.used, r."limit";
  select * into r from public.claim_newbie_quota('track','smoke-track-A');
  raise notice 'Track A (retry)     -> success=% used=% limit=%   [erwartet t / 1 / 1  idempotent]', r.success, r.used, r."limit";
  select * into r from public.claim_newbie_quota('track','smoke-track-B');
  raise notice 'Track B             -> success=% used=% limit=%   [erwartet f / 1 / 1  exceeded]', r.success, r.used, r."limit";

  -- Dog-Status (Ist-Bestand)
  select * into r from public.newbie_quota_status('dog');
  raise notice 'Status dog          -> used=% limit=%              [used=# Hunde des Test-Users, limit=1]', r.used, r."limit";

  -- Premium-Bypass
  insert into public.user_capabilities(user_id, pro_member) values (v_uid, true)
    on conflict (user_id) do update set pro_member = true;
  select * into r from public.claim_newbie_quota('training','smoke-prem-1');
  raise notice 'PREMIUM training    -> success=% used=% limit=%   [erwartet t / 0 / 2147483647]', r.success, r.used, r."limit";
  select * into r from public.claim_newbie_quota('track','smoke-prem-2');
  raise notice 'PREMIUM track       -> success=% used=% limit=%   [erwartet t / 0 / 2147483647]', r.success, r.used, r."limit";

  -- Founder Lifecycle (rollt zurück → 11-Kapazität unberührt)
  select * into r from public.claim_founder_slot(v_uid);
  raise notice 'Founder claim       -> success=% used=% remaining=%   [erwartet t]', r.success, r.slots_used, r.slots_remaining;
  select * into r from public.claim_founder_slot(v_uid);
  raise notice 'Founder claim retry -> success=% used=% remaining=%   [erwartet t, KEIN neuer Slot]', r.success, r.slots_used, r.slots_remaining;
  perform public.lapse_founder_slot(v_uid);
  raise notice 'Founder nach lapse  -> status=%                        [erwartet lapsed, Zeile bleibt]',
    (select status from public.founder_slots where user_id = v_uid);
  select * into r from public.restore_founder_slot(v_uid);
  raise notice 'Founder restore     -> success=%  status=%             [erwartet t / active]',
    r.success, (select status from public.founder_slots where user_id = v_uid);

  raise exception '__SMOKE_ROLLBACK__';   -- erzwingt Rollback aller Testdaten
exception
  when others then
    if sqlerrm = '__SMOKE_ROLLBACK__' then
      raise notice '==> Smoke-Tests fertig. Alle Testdaten wurden zurueckgerollt (nichts persistiert).';
    else
      raise notice '==> SMOKE-FEHLER (Testdaten zurueckgerollt): %', sqlerrm;
    end if;
end $$;
