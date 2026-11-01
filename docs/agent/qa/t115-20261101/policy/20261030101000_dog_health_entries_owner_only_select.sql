-- T115 stage B: remove direct recipient SELECT of the whole Health entry.
-- Review only until separately approved for Production with client RPC adapter.
-- Old shared clients that still SELECT the table receive no weight rows.
begin;

do $guard$
declare v_count integer;
begin
  if not exists (
    select 1 from pg_class c
    where c.oid = to_regclass('public.dog_health_entries')
      and c.relkind in ('r', 'p') and c.relrowsecurity
  ) then raise exception 'STOP_T115_HEALTH_TABLE_OR_RLS_DRIFT'; end if;

  select count(*) into v_count from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'dog_health_entries'
    and p.policyname = 'dog_health_entries_select' and p.cmd = 'SELECT'
    and p.permissive = 'PERMISSIVE' and p.roles = array['public']::name[]
    and p.qual = 'can_view_dog_health(dog_id, ''can_view_weight''::text)';
  if v_count <> 1 then raise exception 'STOP_T115_SELECT_POLICY_DRIFT'; end if;
  select count(*) into v_count from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'dog_health_entries'
    and p.cmd in ('SELECT', 'ALL');
  if v_count <> 1 then raise exception 'STOP_T115_OTHER_READ_POLICY_DRIFT'; end if;

  if to_regprocedure('public.list_shared_dog_weights(uuid)') is null
     or not has_function_privilege('authenticated',
         'public.list_shared_dog_weights(uuid)', 'EXECUTE')
     or has_function_privilege('anon',
         'public.list_shared_dog_weights(uuid)', 'EXECUTE')
  then raise exception 'STOP_T115_NARROW_RPC_MISSING_OR_EXPOSED'; end if;
end
$guard$;

drop policy dog_health_entries_select on public.dog_health_entries;
create policy dog_health_entries_select on public.dog_health_entries
  for select to authenticated
  using (
    owner_id = auth.uid()
    and public.health_dog_owner_matches(dog_id, owner_id)
  );

do $postcheck$
begin
  if not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'dog_health_entries'
      and p.policyname = 'dog_health_entries_select' and p.cmd = 'SELECT'
      and p.roles = array['authenticated']::name[]
      and p.qual = '((owner_id = auth.uid()) AND health_dog_owner_matches(dog_id, owner_id))'
  ) then raise exception 'STOP_T115_OWNER_ONLY_POSTCHECK'; end if;
end
$postcheck$;

commit;
