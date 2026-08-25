-- ============================================================================
-- staging_p0_smoke_verify.sql — P0-Smoke als ERGEBNIS-TABELLE (Supabase-Editor)
-- ----------------------------------------------------------------------------
-- Anders als Teil 3 (RAISE NOTICE → im Web-Editor unsichtbar) gibt diese Abfrage
-- die Ergebnisse als ROWS zurück, damit sie im Editor sichtbar sind.
-- Selbst-Rollback: alle Testdaten (Claims, Premium-Flag, Founder-Slot) werden in
-- einer Sub-Transaktion zurückgerollt; die gesammelten TEXT-Ergebnisse (PL/pgSQL-
-- Variablen) überleben. Es bleibt nur eine SESSION-temporäre Funktion (auto-drop).
-- NUR gegen STAGING (cbhrxkjclakzlvajyvfn) ausführen. Nichts an Production.
-- ============================================================================

create or replace function pg_temp.p0_smoke_verify(p_uid uuid)
returns table(step text, actual text, expected text, ok boolean)
language plpgsql
as $$
declare
  r   record;
  res text[] := '{}';
  s1  int;
begin
  begin  -- Sub-Transaktion (Savepoint): DML hier wird am Ende zurückgerollt
    perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
    perform set_config('request.jwt.claim.sub', p_uid::text, true);
    delete from public.user_capabilities where user_id = p_uid;   -- Ausgangslage: NEWBIE

    -- NEWBIE Training (Limit 2)
    select * into r from public.claim_newbie_quota('training','sv-A');
    res := res || format('Training A|success=%s used=%s limit=%s|t/1/2|%s',        r.success,r.used,r."limit", (r.success and r.used=1 and r."limit"=2));
    select * into r from public.claim_newbie_quota('training','sv-A');
    res := res || format('Training A retry|success=%s used=%s limit=%s|t/1/2 idemp|%s', r.success,r.used,r."limit", (r.success and r.used=1));
    select * into r from public.claim_newbie_quota('training','sv-B');
    res := res || format('Training B|success=%s used=%s limit=%s|t/2/2|%s',        r.success,r.used,r."limit", (r.success and r.used=2));
    select * into r from public.claim_newbie_quota('training','sv-C');
    res := res || format('Training C|success=%s used=%s limit=%s|f/2/2 exceeded|%s', r.success,r.used,r."limit", ((not r.success) and r.used=2));
    select * into r from public.newbie_quota_status('training');
    res := res || format('Status training|used=%s limit=%s|2/2|%s',               r.used,r."limit", (r.used=2 and r."limit"=2));

    -- NEWBIE Fährte (Limit 1)
    select * into r from public.claim_newbie_quota('track','sv-TA');
    res := res || format('Track A|success=%s used=%s limit=%s|t/1/1|%s',           r.success,r.used,r."limit", (r.success and r.used=1 and r."limit"=1));
    select * into r from public.claim_newbie_quota('track','sv-TA');
    res := res || format('Track A retry|success=%s used=%s limit=%s|t/1/1 idemp|%s', r.success,r.used,r."limit", (r.success and r.used=1));
    select * into r from public.claim_newbie_quota('track','sv-TB');
    res := res || format('Track B|success=%s used=%s limit=%s|f/1/1 exceeded|%s',  r.success,r.used,r."limit", ((not r.success) and r.used=1));

    -- Dog-Status
    select * into r from public.newbie_quota_status('dog');
    res := res || format('Status dog|used=%s limit=%s|used=#dogs / limit=1|%s',    r.used,r."limit", (r."limit"=1));

    -- Premium-Bypass
    insert into public.user_capabilities(user_id, pro_member) values (p_uid, true)
      on conflict (user_id) do update set pro_member = true;
    select * into r from public.claim_newbie_quota('training','sv-P1');
    res := res || format('Premium training|success=%s used=%s limit=%s|t/0/2147483647|%s', r.success,r.used,r."limit", (r.success and r."limit"=2147483647));
    select * into r from public.claim_newbie_quota('track','sv-P2');
    res := res || format('Premium track|success=%s used=%s limit=%s|t/0/2147483647|%s',    r.success,r.used,r."limit", (r.success and r."limit"=2147483647));

    -- Founder Lifecycle
    select * into r from public.claim_founder_slot(p_uid);
    s1 := r.slots_used;
    res := res || format('Founder claim|success=%s used=%s|t|%s',                  r.success,r.slots_used, r.success);
    select * into r from public.claim_founder_slot(p_uid);
    res := res || format('Founder claim retry|success=%s used=%s|t + kein neuer Slot|%s', r.success,r.slots_used, (r.success and r.slots_used=s1));
    perform public.lapse_founder_slot(p_uid);
    res := res || format('Founder lapse|status=%s|lapsed (Zeile bleibt)|%s',
      (select status from public.founder_slots where user_id=p_uid),
      ((select status from public.founder_slots where user_id=p_uid)='lapsed'));
    select * into r from public.restore_founder_slot(p_uid);
    res := res || format('Founder restore|success=%s status=%s|t/active|%s',
      r.success, (select status from public.founder_slots where user_id=p_uid),
      (r.success and (select status from public.founder_slots where user_id=p_uid)='active'));

    raise exception 'ROLLBACK_SMOKE';   -- rollt die Sub-Transaktion (alle DML) zurück
  exception when others then
    if sqlerrm <> 'ROLLBACK_SMOKE' then
      res := res || format('ERROR|%s||false', sqlerrm);
    end if;
  end;

  return query
    select split_part(x,'|',1), split_part(x,'|',2), split_part(x,'|',3), split_part(x,'|',4)::boolean
    from unnest(res) with ordinality as u(x, ord)
    order by ord;
end $$;

-- UUID = dein Staging-Test-User (bereits eingetragen):
select * from pg_temp.p0_smoke_verify('24bcf5f9-1f14-4152-b294-d92da6163e87'::uuid);
