-- HEALTH PHASE 2 staging smoke test — run only against ANYVO Staging.
--
-- Uses the existing staging auth user, creates one disposable dog, exercises
-- CRUD under authenticated JWT claims, and removes all test data before return.
-- A random foreign JWT subject is sufficient for RLS verification because the
-- policies depend solely on auth.uid(); no second auth user is persisted.

create or replace function pg_temp.health_deworming_smoke()
returns table(step text, actual text, expected text, ok boolean)
language plpgsql
as $$
declare
  v_owner uuid;
  v_foreign uuid := gen_random_uuid();
  v_dog uuid;
  v_entry uuid;
  v_rows integer;
  v_foreign_insert_denied boolean := false;
  v_own_insert boolean := false;
  v_own_read boolean := false;
  v_own_update boolean := false;
  v_foreign_read boolean := false;
  v_foreign_update boolean := false;
  v_foreign_delete boolean := false;
  v_own_delete boolean := false;
begin
  select id into v_owner from auth.users order by created_at asc limit 1;
  if v_owner is null then
    raise exception 'No staging auth user is available for Health Phase 2 smoke testing';
  end if;

  insert into public.dogs(name, owner_id)
  values ('__health_phase2_smoke__', v_owner)
  returning id into v_dog;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  insert into public.dog_deworming_entries(owner_id, dog_id, treatment_date, product, next_due_date)
  values (v_owner, v_dog, current_date, 'Smoke product', current_date + 1)
  returning id into v_entry;
  v_own_insert := v_entry is not null;

  select count(*) into v_rows from public.dog_deworming_entries where id = v_entry;
  v_own_read := v_rows = 1;

  update public.dog_deworming_entries set product = 'Updated smoke product' where id = v_entry;
  get diagnostics v_rows = row_count;
  v_own_update := v_rows = 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_foreign, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_foreign::text, true);

  select count(*) into v_rows from public.dog_deworming_entries where id = v_entry;
  v_foreign_read := v_rows = 0;

  update public.dog_deworming_entries set product = 'Foreign write' where id = v_entry;
  get diagnostics v_rows = row_count;
  v_foreign_update := v_rows = 0;

  delete from public.dog_deworming_entries where id = v_entry;
  get diagnostics v_rows = row_count;
  v_foreign_delete := v_rows = 0;

  begin
    insert into public.dog_deworming_entries(owner_id, dog_id, treatment_date)
    values (v_foreign, v_dog, current_date);
  exception when insufficient_privilege then
    v_foreign_insert_denied := true;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  delete from public.dog_deworming_entries where id = v_entry;
  get diagnostics v_rows = row_count;
  v_own_delete := v_rows = 1;

  execute 'reset role';
  delete from public.dogs where id = v_dog;

  return query values
    ('owner insert', coalesce(v_own_insert, false)::text, 'true', coalesce(v_own_insert, false)),
    ('owner select', coalesce(v_own_read, false)::text, 'true', coalesce(v_own_read, false)),
    ('owner update', coalesce(v_own_update, false)::text, 'true', coalesce(v_own_update, false)),
    ('foreign select', coalesce(v_foreign_read, false)::text, 'true (0 rows)', coalesce(v_foreign_read, false)),
    ('foreign update', coalesce(v_foreign_update, false)::text, 'true (0 rows)', coalesce(v_foreign_update, false)),
    ('foreign delete', coalesce(v_foreign_delete, false)::text, 'true (0 rows)', coalesce(v_foreign_delete, false)),
    ('foreign insert', coalesce(v_foreign_insert_denied, false)::text, 'true (RLS denied)', coalesce(v_foreign_insert_denied, false)),
    ('owner delete', coalesce(v_own_delete, false)::text, 'true', coalesce(v_own_delete, false));
exception when others then
  begin
    execute 'reset role';
    if v_dog is not null then delete from public.dogs where id = v_dog; end if;
  exception when others then
    null;
  end;
  raise;
end;
$$;

select * from pg_temp.health_deworming_smoke();
