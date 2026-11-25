-- ============================================================================
-- 20261125180000_newbie_mantrail_quota.sql
-- Mantrailing (Spec docs/specs/phase2/02-mantrailing.md, PR B1): eigenes NEWBIE-
-- Kontingent «1 Trail pro Kalendermonat», ZUSÄTZLICH zur 1 Fährte (Entscheid der
-- Nutzerin 2026-11-24). Premium (is_pro_member) bleibt unbegrenzt.
--
-- Rein additiv:
--   1) newbie_quota_claims.kind erlaubt zusätzlich 'mantrail' (bestehende Werte
--      'training'/'track' bleiben erlaubt; keine Zeile wird verändert oder gelöscht).
--   2) newbie_quota_limit: 'mantrail' = 1 (dog/training/track unverändert).
--   3) claim_newbie_quota: akzeptiert zusätzlich 'mantrail'; sonst wortgleich zur
--      Definition in SUBSCRIPTION_NEWBIE_QUOTAS_SETUP.sql (gleiche Sperre, gleiche
--      Idempotenz über ref_id, gleicher Monatszeitraum UTC).
-- Keine Policy-, RLS-, Tabellen- oder Datenänderung an Trainings/Fährten.
-- release_newbie_quota bleibt unverändert (nur 'track'); ein abgebrochener Trail
-- gibt sein Kontingent in V1 nicht zurück.
--
-- Ohne diese Migration lehnt der Server 'mantrail' ab (claim → success=false):
-- NEWBIE kann dann keinen Mantrail mit GPS starten (fail-closed), Premium ist
-- nicht betroffen (der Client fragt für Premium kein Kontingent an).
--
-- Anwendung: zuerst Staging; Production NUR mit ausdrücklicher Freigabe.
-- ============================================================================

-- 1) CHECK auf kind erweitern. Der Name der Inline-Regel kann je Umgebung abweichen;
--    deshalb jede CHECK-Regel der Tabelle ersetzen, die genau kind einschränkt.
do $$
declare r record;
begin
  for r in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.newbie_quota_claims'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%kind%'
  loop
    execute format('alter table public.newbie_quota_claims drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.newbie_quota_claims
  add constraint newbie_quota_claims_kind_check
  check (kind in ('training', 'track', 'mantrail'));

-- 2) Limits (single source of truth): dog = 1 · training = 2 · track = 1 · mantrail = 1
create or replace function public.newbie_quota_limit(p_kind text)
returns int language sql immutable as $$
  select case p_kind when 'dog' then 1 when 'training' then 2 when 'track' then 1 when 'mantrail' then 1 else 0 end
$$;

-- 3) Atomarer, idempotenter Claim für training/track/mantrail.
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
  if p_kind not in ('training','track','mantrail') then return query select false, 0, v_limit; return; end if;

  -- Premium → unbegrenzt; nichts zählen, nichts einfügen.
  if is_pro_member(v_uid) then return query select true, 0, 2147483647; return; end if;

  perform pg_advisory_xact_lock(hashtext(v_uid::text || ':' || p_kind));

  -- Idempotent: dieselbe ref_id bereits beansprucht → erlauben (Offline/Retry/Sync).
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

-- Rechte wie bisher (create or replace lässt sie unverändert); Grant zur Sicherheit wiederholt.
grant execute on function public.claim_newbie_quota(text, text) to authenticated;
