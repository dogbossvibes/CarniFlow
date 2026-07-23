-- ANYVO — Trainer-Code-Flow vereinheitlichen
-- NICHT automatisch remote ausführen. Erst in Staging prüfen.
--
-- Ziel:
--   trainer_profiles.code ist die einzige kanonische Code-Quelle.
--   Code-Einlösung erstellt atomar eine trainer_client-Verbindung.

create extension if not exists pgcrypto;

-- Ein Trainerprofil pro User. Falls Altbestand Duplikate enthält, vorher
-- manuell prüfen; dieser Index schlägt dann bewusst fehl und löscht keine Daten.
create unique index if not exists trainer_profiles_user_uidx
  on public.trainer_profiles (user_id);

-- Code eindeutig und case-insensitive. Bestehende Codes bleiben erhalten.
create unique index if not exists trainer_profiles_code_norm_uidx
  on public.trainer_profiles (upper(trim(code)))
  where code is not null;

create or replace function public.redeem_trainer_code(p_code text)
returns table(status text, connection_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner   uuid := auth.uid();
  v_trainer uuid;
  v_conn    uuid;
  v_code    text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Z0-9]', '', 'g'));
begin
  if v_owner is null then
    return query select 'forbidden'::text, null::uuid;
    return;
  end if;

  if left(v_code, 5) = 'CANIS' then
    v_code := substring(v_code from 6 for 4);
  else
    v_code := substring(v_code from 1 for 4);
  end if;
  if v_code = '' then
    return query select 'invalid_code'::text, null::uuid;
    return;
  end if;
  v_code := 'CANIS-' || v_code;

  select tp.user_id into v_trainer
  from public.trainer_profiles tp
  where upper(trim(tp.code)) = v_code
  order by tp.created_at asc
  limit 1;

  if v_trainer is null then
    return query select 'invalid_code'::text, null::uuid;
    return;
  end if;

  if v_trainer = v_owner then
    return query select 'self_connection'::text, null::uuid;
    return;
  end if;

  select c.id into v_conn
  from public.connections c
  where c.owner_user_id = v_owner
    and c.connected_user_id = v_trainer
    and c.connection_type = 'trainer_client'
  limit 1;

  if v_conn is not null then
    return query select 'already_connected'::text, v_conn;
    return;
  end if;

  insert into public.connections (owner_user_id, connected_user_id, status, created_by, connection_type)
  values (v_owner, v_trainer, 'accepted', 'owner', 'trainer_client')
  returning id into v_conn;

  insert into public.connection_permissions (connection_id)
  values (v_conn)
  on conflict (connection_id) do nothing;

  return query select 'success'::text, v_conn;
exception
  when insufficient_privilege then
    return query select 'forbidden'::text, null::uuid;
  when unique_violation then
    return query select 'already_connected'::text, null::uuid;
  when others then
    return query select 'server_error'::text, null::uuid;
end;
$$;

grant execute on function public.redeem_trainer_code(text) to authenticated;
