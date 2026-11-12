-- Separate personal QA capability; existing tester/subscription authority is unchanged.
alter table public.profiles
  add column if not exists can_use_internal_tracking_diagnostics boolean not null default false;

do $$
begin
  if not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'can_use_internal_tracking_diagnostics'
      and data_type = 'boolean' and is_nullable = 'NO' and column_default = 'false') then
    raise exception 'STOP: existing diagnostic capability column has unexpected semantics';
  end if;
end $$;

create or replace function public.protect_internal_tracking_diagnostics_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then
    if tg_op = 'INSERT' then
      new.can_use_internal_tracking_diagnostics := false;
    else
      new.can_use_internal_tracking_diagnostics := old.can_use_internal_tracking_diagnostics;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.protect_internal_tracking_diagnostics_access() from public, anon, authenticated;
drop trigger if exists trg_protect_internal_tracking_diagnostics_access on public.profiles;
create trigger trg_protect_internal_tracking_diagnostics_access
  before insert or update on public.profiles for each row
  execute function public.protect_internal_tracking_diagnostics_access();

-- At most one account can hold the personal capability. No account is granted by migration.
create unique index if not exists profiles_single_internal_tracking_diagnostics
  on public.profiles (can_use_internal_tracking_diagnostics)
  where can_use_internal_tracking_diagnostics = true;
