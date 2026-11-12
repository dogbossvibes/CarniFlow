-- ANYVO — Test der Schutz-Migration (T-182), vollständig ohne bleibende Änderung.
-- Ausführen mit psql aus supabase/local/ gegen eine lokale oder Staging-DB (nie Production).
-- Ablauf: BEGIN → Migration → synthetische Test-Konten → Angriffs- und Legit-Fälle
-- → am Ende bewusst ein Fehler mit der Ergebnisliste → die ganze Transaktion wird
-- verworfen (kein COMMIT im Skript). Nie gegen Production ausführen.
-- Keine echten Kundendaten: nur synthetische UUIDs.

begin;

\ir ../migrations/20261109120000_guard_entitlement_columns.sql

do $test$
declare
  u1 uuid := '00000000-0000-4000-8000-0000000a0001';  -- NEWBIE
  u2 uuid := '00000000-0000-4000-8000-0000000a0002';  -- bezahlt ACTIVE
  results text := '';
  ok boolean;

begin
  -- Setup als Datenbank-Owner (nicht Client).
  insert into auth.users(id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values (u1, 'authenticated', 'authenticated', 'guard-test-1@example.invalid', now(), now(), now()),
         (u2, 'authenticated', 'authenticated', 'guard-test-2@example.invalid', now(), now(), now())
  on conflict (id) do nothing;
  insert into public.profiles(id, plan, plan_expires_at, is_trainer) values (u1, 'free', null, false), (u2, 'premium', now() + interval '20 days', false)
  on conflict (id) do update set plan = excluded.plan, plan_expires_at = excluded.plan_expires_at, is_trainer = excluded.is_trainer;
  insert into public.subscriptions(user_id, plan, status, tier) values (u1, 'newbie', 'active', 'pro')
  on conflict (user_id) do update set plan = 'newbie', status = 'active', trial_ends_at = null, current_period_ends_at = null;
  insert into public.subscriptions(user_id, plan, status, tier, product_id, provider, store, current_period_ends_at, expires_at)
  values (u2, 'active', 'active', 'pro', 'anyvo_active_monthly_10', 'app_store', 'app_store', now() + interval '20 days', now() + interval '20 days')
  on conflict (user_id) do update set plan = 'active', status = 'active', current_period_ends_at = excluded.current_period_ends_at, expires_at = excluded.expires_at;
  insert into public.user_capabilities(user_id, pro_member, trainer_module) values (u1, false, false), (u2, true, false)
  on conflict (user_id) do update set pro_member = excluded.pro_member, trainer_module = excluded.trainer_module;

  -- Hilfsblock: als Client u ausführen, erwartetes Ergebnis prüfen.
  -- expect_block = true → muss mit ENTITLEMENT_SERVER_ONLY scheitern.
  -- (inline wiederholt, da DO-Blöcke keine Unterfunktionen kennen)

  -- A1 NEWBIE setzt pro_member = true
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u1::text, true);
    update public.user_capabilities set pro_member = true where user_id = u1;
    results := results || 'A1 ' || case when found then 'FAIL (nicht blockiert)' else 'UNGUELTIG (0 Zeilen)' end || '; ';
  exception when others then results := results || 'A1 ' || case when sqlerrm = 'ENTITLEMENT_SERVER_ONLY' then 'PASS' else 'FAIL ' || sqlerrm end || '; ';
  end;
  perform set_config('role', 'none', true);

  -- A2 NEWBIE setzt trainer_module = true
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u1::text, true);
    update public.user_capabilities set trainer_module = true where user_id = u1;
    results := results || 'A2 ' || case when found then 'FAIL (nicht blockiert)' else 'UNGUELTIG (0 Zeilen)' end || '; ';
  exception when others then results := results || 'A2 ' || case when sqlerrm = 'ENTITLEMENT_SERVER_ONLY' then 'PASS' else 'FAIL ' || sqlerrm end || '; ';
  end;
  perform set_config('role', 'none', true);

  -- A3 NEWBIE löscht Capability-Zeile und legt sie mit pro_member = true neu an
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u1::text, true);
    delete from public.user_capabilities where user_id = u1;
    insert into public.user_capabilities(user_id, pro_member, trainer_module) values (u1, true, false);
    results := results || 'A3 ' || case when found then 'FAIL (nicht blockiert)' else 'UNGUELTIG (0 Zeilen)' end || '; ';
  exception when others then results := results || 'A3 ' || case when sqlerrm = 'ENTITLEMENT_SERVER_ONLY' then 'PASS' else 'FAIL ' || sqlerrm end || '; ';
  end;
  perform set_config('role', 'none', true);

  -- A4 NEWBIE setzt subscriptions.plan = active
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u1::text, true);
    update public.subscriptions set plan = 'active', current_period_ends_at = now() + interval '1 year' where user_id = u1;
    results := results || 'A4 ' || case when found then 'FAIL (nicht blockiert)' else 'UNGUELTIG (0 Zeilen)' end || '; ';
  exception when others then results := results || 'A4 ' || case when sqlerrm = 'ENTITLEMENT_SERVER_ONLY' then 'PASS' else 'FAIL ' || sqlerrm end || '; ';
  end;
  perform set_config('role', 'none', true);

  -- A5 NEWBIE startet sich selbst einen Trial
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u1::text, true);
    update public.subscriptions set status = 'trialing', trial_ends_at = now() + interval '30 days' where user_id = u1;
    results := results || 'A5 ' || case when found then 'FAIL (nicht blockiert)' else 'UNGUELTIG (0 Zeilen)' end || '; ';
  exception when others then results := results || 'A5 ' || case when sqlerrm = 'ENTITLEMENT_SERVER_ONLY' then 'PASS' else 'FAIL ' || sqlerrm end || '; ';
  end;
  perform set_config('role', 'none', true);

  -- A6 NEWBIE setzt profiles.plan = premium
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u1::text, true);
    update public.profiles set plan = 'premium', plan_expires_at = now() + interval '1 year' where id = u1;
    results := results || 'A6 ' || case when found then 'FAIL (nicht blockiert)' else 'UNGUELTIG (0 Zeilen)' end || '; ';
  exception when others then results := results || 'A6 ' || case when sqlerrm = 'ENTITLEMENT_SERVER_ONLY' then 'PASS' else 'FAIL ' || sqlerrm end || '; ';
  end;
  perform set_config('role', 'none', true);

  -- A7 NEWBIE setzt profiles.is_trainer = true
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u1::text, true);
    update public.profiles set is_trainer = true where id = u1;
    results := results || 'A7 ' || case when found then 'FAIL (nicht blockiert)' else 'UNGUELTIG (0 Zeilen)' end || '; ';
  exception when others then results := results || 'A7 ' || case when sqlerrm = 'ENTITLEMENT_SERVER_ONLY' then 'PASS' else 'FAIL ' || sqlerrm end || '; ';
  end;
  perform set_config('role', 'none', true);

  -- A8 bezahlter Nutzer verlängert sein Abo selbst
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u2::text, true);
    update public.subscriptions set current_period_ends_at = now() + interval '10 years', expires_at = now() + interval '10 years' where user_id = u2;
    results := results || 'A8 ' || case when found then 'FAIL (nicht blockiert)' else 'UNGUELTIG (0 Zeilen)' end || '; ';
  exception when others then results := results || 'A8 ' || case when sqlerrm = 'ENTITLEMENT_SERVER_ONLY' then 'PASS' else 'FAIL ' || sqlerrm end || '; ';
  end;
  perform set_config('role', 'none', true);

  -- A9 bezahlter Nutzer verlängert profiles.plan_expires_at
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u2::text, true);
    update public.profiles set plan_expires_at = now() + interval '10 years' where id = u2;
    results := results || 'A9 ' || case when found then 'FAIL (nicht blockiert)' else 'UNGUELTIG (0 Zeilen)' end || '; ';
  exception when others then results := results || 'A9 ' || case when sqlerrm = 'ENTITLEMENT_SERVER_ONLY' then 'PASS' else 'FAIL ' || sqlerrm end || '; ';
  end;
  perform set_config('role', 'none', true);

  -- L1 NEWBIE-Aktivierung wie Live-Client (activatePlan newbie)
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u1::text, true);
    insert into public.subscriptions(user_id, plan, status, tier, product_id, provider, store, provider_product_id, trial_ends_at, current_period_ends_at, expires_at, updated_at)
    values (u1, 'newbie', 'active', 'pro', 'anyvo_newbie_monthly_0', 'app_store', 'app_store', 'anyvo_newbie_monthly_0', null, null, null, now())
    on conflict (user_id) do update set plan = excluded.plan, status = excluded.status, tier = excluded.tier, product_id = excluded.product_id,
      provider = excluded.provider, store = excluded.store, provider_product_id = excluded.provider_product_id, trial_ends_at = null,
      current_period_ends_at = null, expires_at = null, updated_at = excluded.updated_at;
    insert into public.user_capabilities(user_id, pro_member, trainer_module) values (u1, false, false)
    on conflict (user_id) do update set pro_member = false, trainer_module = false;
    update public.profiles set plan = 'free', plan_expires_at = null, trial_used = true, is_trainer = false where id = u1;
    results := results || 'L1 PASS; ';
  exception when others then results := results || 'L1 FAIL ' || sqlerrm || '; ';
  end;
  perform set_config('role', 'none', true);

  -- L2 Trial-Angebot markieren (markActiveTrialOffered) und Profilfelder ändern
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u1::text, true);
    insert into public.subscriptions(user_id, active_trial_offered_at, active_trial_offer_count, updated_at)
    values (u1, now(), 1, now())
    on conflict (user_id) do update set active_trial_offered_at = excluded.active_trial_offered_at, active_trial_offer_count = excluded.active_trial_offer_count, updated_at = excluded.updated_at;
    update public.profiles set locale = 'de-CH', push_token = 'test-token' where id = u1;
    results := results || 'L2 PASS; ';
  exception when others then results := results || 'L2 FAIL ' || sqlerrm || '; ';
  end;
  perform set_config('role', 'none', true);

  -- L3 bezahlter Nutzer: Profil ändern, Trial-Marker, Kündigungsmarker
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u2::text, true);
    update public.profiles set locale = 'fr-CH', push_token = 'test-token-2' where id = u2;
    update public.subscriptions set active_trial_started_at = now(), active_trial_platform = 'ios', cancel_at_period_end = true, updated_at = now() where user_id = u2;
    update public.user_capabilities set updated_at = now() where user_id = u2;
    results := results || 'L3 PASS; ';
  exception when others then results := results || 'L3 FAIL ' || sqlerrm || '; ';
  end;
  perform set_config('role', 'none', true);

  -- L4 bezahlter Nutzer wählt selbst NEWBIE (Herabstufung bleibt erlaubt, wie heute)
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u2::text, true);
    update public.user_capabilities set pro_member = false where user_id = u2;
    results := results || 'L4 PASS; ';
  exception when others then results := results || 'L4 FAIL ' || sqlerrm || '; ';
  end;
  perform set_config('role', 'none', true);

  -- L5 Server (Service-Role, wie Webhook) schaltet NEWBIE frei
  begin
    perform set_config('role', 'service_role', true);
    update public.subscriptions set plan = 'active', status = 'active', current_period_ends_at = now() + interval '30 days' where user_id = u1;
    update public.user_capabilities set pro_member = true where user_id = u1;
    update public.profiles set plan = 'premium', plan_expires_at = now() + interval '30 days' where id = u1;
    results := results || 'L5 PASS; ';
  exception when others then results := results || 'L5 FAIL ' || sqlerrm || '; ';
  end;
  perform set_config('role', 'none', true);

  -- L6 SECURITY-DEFINER-RPC als Client (subscription_client_v1 'init'), falls vorhanden
  begin
    if to_regprocedure('public.subscription_client_v1(text)') is null then
      results := results || 'L6 SKIP (RPC fehlt auf dieser DB); ';
    else
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u2::text, true);
      perform public.subscription_client_v1('init');
      results := results || 'L6 PASS; ';
    end if;
  exception when others then results := results || 'L6 FAIL ' || sqlerrm || '; ';
  end;
  perform set_config('role', 'none', true);

  -- L7 SECURITY-DEFINER-RPC legt für einen neuen Nutzer die NEWBIE-Zeilen an
  begin
    if to_regprocedure('public.subscription_client_v1(text)') is null then
      results := results || 'L7 SKIP (RPC fehlt auf dieser DB); ';
    else
      insert into auth.users(id, aud, role, email, email_confirmed_at, created_at, updated_at)
      values ('00000000-0000-4000-8000-0000000a0003', 'authenticated', 'authenticated', 'guard-test-3@example.invalid', now(), now(), now())
      on conflict (id) do nothing;
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000a0003', 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000a0003', true);
      perform public.subscription_client_v1('init');
      perform set_config('role', 'none', true);
      if exists (select 1 from public.subscriptions where user_id = '00000000-0000-4000-8000-0000000a0003' and plan = 'newbie')
         and exists (select 1 from public.user_capabilities where user_id = '00000000-0000-4000-8000-0000000a0003' and not pro_member) then
        results := results || 'L7 PASS; ';
      else
        results := results || 'L7 FAIL (Zeilen fehlen); ';
      end if;
    end if;
  exception when others then results := results || 'L7 FAIL ' || sqlerrm || '; ';
  end;
  perform set_config('role', 'none', true);

  -- Ergebnis ausgeben UND alles verwerfen.
  raise exception 'ANYVO_GUARD_TEST_RESULTS: %', results;
end
$test$;

rollback;
