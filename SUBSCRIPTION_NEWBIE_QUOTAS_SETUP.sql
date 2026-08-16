-- ============================================================================
-- SUBSCRIPTION_NEWBIE_QUOTAS_SETUP.sql
-- Serverautoritative NEWBIE-Quotas:
--   • 1 Hund (Ist-Bestand, all-time)
--   • 2 neue Trainingsdokumentationen pro Kalendermonat (UTC)
--   • 1 neue Fährte pro Kalendermonat (UTC)
-- Premium (ACTIVE/FOUNDER/TRAINER, pro_member=true) → unbegrenzt.
--
-- ADDITIV · IDEMPOTENT · NICHT destruktiv. Löscht/benennt KEINE Tabelle um,
-- verändert KEINE RevenueCat-/Store-Daten.
-- NICHT automatisch gegen Produktion ausführen — erst Staging + Verifikation
-- (das Repository besitzt keinen Migration-Runner; siehe supabase/migrations/README.md).
-- Client spiegelt die Limits in features/subscription/plans.ts (NEWBIE_QUOTA).
-- ============================================================================
begin;

-- Finaler Plan-Vertrag für Subscription P0.
-- Ersetzt nur den Check-Constraint, schreibt keine Row-Werte um. Falls unerwartete
-- Planwerte existieren, schlägt das ADD CONSTRAINT fehl und die Transaktion rollt zurück.
alter table public.subscriptions
  drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions
  add constraint subscriptions_plan_check
  check (
    plan is null or plan = any (
      array[
        'beginner_trial',
        'newbie',
        'founder_active',
        'active',
        'trainer'
      ]
    )
  );

-- Append-only Claims (nur training/track; monatlich). Das Löschen eines Trainings/
-- einer Fährte gibt die Quota NICHT zurück (Missbrauchsschutz). Idempotenz über
-- ref_id (client-generierte, stabile UUID) → Offline-Sync/Mehrfachspeichern sicher.
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

-- Limits: einzige serverseitige Quelle der Wahrheit.
-- track = 0: NEWBIE hat keine Fährtenfunktion (Pro-only). Der Claim-Check bleibt als
-- Defense-in-Depth erhalten und verweigert NEWBIE jede Fährte serverseitig (used >= 0).
create or replace function public.newbie_quota_limit(p_kind text)
returns int language sql immutable as $$
  select case p_kind when 'dog' then 1 when 'training' then 2 when 'track' then 0 else 0 end
$$;
-- Finaler produktiver Wert (training = 2) wird über die additive Migration
-- 20260816130000_newbie_training_quota_two.sql gesetzt. Diese Setup-Datei spiegelt
-- den finalen Stand dokumentarisch (single source of truth): dog=1, training=2, track=0.

-- Premium-Erkennung (ACTIVE/FOUNDER/TRAINER). Setzt CAPABILITY_MODEL_SETUP.sql voraus.
create or replace function public.is_pro_member(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select pro_member from public.user_capabilities where user_id = p_user_id), false)
$$;

-- Atomarer, idempotenter Claim für training/track. Rückgabe: (success, used, "limit").
-- SECURITY DEFINER: es wird AUSSCHLIESSLICH auth.uid() des Aufrufers verwendet →
-- kein Fremd-User-Zugriff. pg_advisory_xact_lock serialisiert parallele Requests.
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
grant execute on function public.claim_newbie_quota(text, text) to authenticated;

-- Status/Restkontingent (Anzeige). Dog = Ist-Bestand aus dogs, sonst Monats-Claims.
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
    select count(*) into v_used from public.dogs where owner_id = v_uid;   -- dogs.owner_id (verifiziert)
  else
    select count(*) into v_used from newbie_quota_claims
      where user_id = v_uid and kind = p_kind and period = v_period;
  end if;
  return query select v_used, newbie_quota_limit(p_kind);
end; $$;
grant execute on function public.newbie_quota_status(text) to authenticated;

commit;

-- ============================================================================
-- HINWEISE / DEPLOYMENT
--  * NICHT automatisch ausführen (kein Migration-Runner im Repo). Erst Staging.
--  * Dog-Limit = Ist-Bestand (public.dogs.owner_id) → Löschen eines Hunds gibt frei
--    (korrekt: „max. 1 Hund gleichzeitig").
--  * training/track = append-only Claims (kein Refund bei Löschen im selben Monat).
--  * „Fährte beim Start beanspruchen": Client ruft claim_newbie_quota('track', <trackId>)
--    beim START der Fährte. Der Claim ist idempotent auf <trackId>, d. h. der
--    gestartete, erlaubte Track darf den kompletten Workflow (Speichern → Liegezeit
--    → Absuchen → Doku) abschließen, ohne erneut zu zählen. Analog training beim
--    Erstellen der Trainingsdokumentation.
--  * Voraussetzung: public.user_capabilities(user_id, pro_member) (CAPABILITY_MODEL_SETUP.sql).
-- ============================================================================
