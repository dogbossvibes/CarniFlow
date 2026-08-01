-- ============================================================================
-- FOUNDER_SLOT_LIFECYCLE_SETUP.sql
-- Founder-Limit: MAXIMAL 11 JEMALS vergebene Plätze (nicht 11 gleichzeitig aktive).
-- Ein einmal beanspruchter Slot wird bei Ablauf/Kündigung NICHT freigegeben,
-- sondern nur als 'lapsed' markiert. Derselbe Nutzer kann seinen eigenen Slot
-- reaktivieren; ein anderer Nutzer übernimmt ihn NIE.
--
-- ADDITIV · IDEMPOTENT · NICHT destruktiv. Bestehende founder_slots-Zeilen bleiben.
-- NICHT automatisch gegen Produktion ausführen — erst Staging + Verifikation.
-- Baut auf SUBSCRIPTION_V2_SETUP.sql auf (founder_slots, founder_slot_limit=11,
-- claim_founder_slot). Ersetzt die Delete-Semantik von FOUNDER_WEBHOOK_SETUP.sql.
-- ============================================================================
begin;

-- Lifecycle-Spalten (idempotent).
alter table public.founder_slots add column if not exists status     text        not null default 'active';
alter table public.founder_slots add column if not exists claimed_at timestamptz not null default now();
alter table public.founder_slots add column if not exists updated_at timestamptz not null default now();
alter table public.founder_slots alter column claimed_at set default now();
do $$
begin
  if exists (select 1 from public.founder_slots where claimed_at is null) then
    raise exception 'founder_slots.claimed_at contains null values; aborting NOT NULL hardening';
  end if;
end $$;
alter table public.founder_slots alter column claimed_at set not null;
alter table public.founder_slots drop constraint if exists founder_slots_status_check;
alter table public.founder_slots add constraint founder_slots_status_check
  check (status in ('active','lapsed','cancelled','refunded'));

-- Claim zählt ALLE jemals vergebenen Zeilen (Status egal) → max. 11 JEMALS.
-- Bestehender Founder reaktiviert seinen Slot (verbraucht KEINEN neuen).
create or replace function public.claim_founder_slot(p_user_id uuid)
returns table(success boolean, slots_used int, slots_remaining int)
language plpgsql security definer set search_path = public as $$
declare v_count int; v_existing int; v_limit int := founder_slot_limit();
begin
  perform pg_advisory_xact_lock(770077);   -- serialisiert konkurrierende Claims

  select count(*) into v_existing from founder_slots where user_id = p_user_id;
  if v_existing > 0 then
    update founder_slots set status = 'active', updated_at = now() where user_id = p_user_id;
    select count(*) into v_count from founder_slots;                 -- historisch
    return query select true, v_count, greatest(0, v_limit - v_count); return;
  end if;

  select count(*) into v_count from founder_slots;                   -- historisch (inkl. lapsed)
  if v_count >= v_limit then
    return query select false, v_count, 0; return;
  end if;

  insert into founder_slots(user_id, status) values (p_user_id, 'active');
  v_count := v_count + 1;
  return query select true, v_count, greatest(0, v_limit - v_count);
end; $$;
grant execute on function public.claim_founder_slot(uuid) to authenticated, service_role;

-- Slot als 'lapsed' markieren (Ablauf/Kündigung) — NICHT löschen, KEIN Reissue.
create or replace function public.lapse_founder_slot(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.founder_slots set status = 'lapsed', updated_at = now()
   where user_id = p_user_id and status <> 'lapsed';
end; $$;
grant execute on function public.lapse_founder_slot(uuid) to service_role;

-- Kompat: alter Webhook-Aufruf release_founder_slot → jetzt = lapse (kein Delete).
create or replace function public.release_founder_slot(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.lapse_founder_slot(p_user_id);
end; $$;
grant execute on function public.release_founder_slot(uuid) to service_role;

-- Eigenen Slot reaktivieren (Restore/Repurchase durch DENSELBEN Nutzer).
create or replace function public.restore_founder_slot(p_user_id uuid)
returns table(success boolean)
language plpgsql security definer set search_path = public as $$
begin
  update public.founder_slots set status = 'active', updated_at = now() where user_id = p_user_id;
  return query select exists(select 1 from founder_slots where user_id = p_user_id);
end; $$;
grant execute on function public.restore_founder_slot(uuid) to authenticated, service_role;

-- Paywall-Status: historisch belegte Slots (verbleibend = 11 - jemals vergeben).
create or replace function public.founder_slots_status()
returns table(slots_used int, slots_remaining int)
language sql security definer set search_path = public stable as $$
  select count(*)::int, greatest(0, founder_slot_limit() - count(*))::int from founder_slots;
$$;
grant execute on function public.founder_slots_status() to authenticated;

commit;

-- ============================================================================
-- SEMANTIK (konservativ; siehe Auftrag §13):
--  * cancellation / expiration / billing issue / grace → status='lapsed'
--    (Slot bleibt historisch belegt, kein Reissue).
--  * refund → DEFAULT KEIN Reissue (zählt weiter zu den 11). Nur Admin/manuell.
--  * restore / repurchase durch DENSELBEN Nutzer → reaktiviert eigenen Slot,
--    verbraucht KEINEN neuen (claim_founder_slot erkennt bestehende Zeile).
--  * anderer Nutzer kann einen belegten Slot NIE übernehmen.
--  * founder_slots-Zeilen werden NIE gelöscht → count(*) ist monoton steigend →
--    globale Zahl jemals vergebener Founder-Plätze <= 11 (race-sicher via
--    pg_advisory_xact_lock). Der (11+1)-te Claim liefert success=false.
-- NICHT automatisch ausführen. Bestehende Founder-Daten bleiben unverändert.
-- ============================================================================
