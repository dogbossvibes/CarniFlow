-- T115 stage A: additive, narrow shared-weight read contract.
-- Review only until separately approved for Production. This does not alter
-- dog_health_entries RLS; stage B must restrict direct recipient SELECT.
begin;

do $collision_guard$
begin
  if exists (
    select 1 from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname = 'list_shared_dog_weights'
  ) then raise exception 'STOP_T115_WEIGHT_RPC_NAME_COLLISION'; end if;
end
$collision_guard$;

create function public.list_shared_dog_weights(p_dog_id uuid)
returns table (
  id uuid,
  dog_id uuid,
  entry_date date,
  weight_kg numeric,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select e.id, e.dog_id, e.entry_date, e.weight_kg, e.created_at
  from public.dog_health_entries e
  join public.dogs d on d.id = e.dog_id and d.owner_id = e.owner_id
  where auth.uid() is not null
    and p_dog_id is not null
    and e.dog_id = p_dog_id
    and e.weight_kg is not null
    and public.can_view_dog_health(p_dog_id, 'can_view_weight')
  order by e.entry_date desc, e.created_at desc, e.id desc
  limit 121;
$function$;

revoke all on function public.list_shared_dog_weights(uuid) from public, anon;
grant execute on function public.list_shared_dog_weights(uuid) to authenticated;

do $postcheck$
declare v_count integer;
begin
  select count(*) into v_count
  from pg_proc p
  where p.oid = to_regprocedure('public.list_shared_dog_weights(uuid)')
    and pg_get_userbyid(p.proowner) = 'postgres'
    and p.prolang = (select oid from pg_language where lanname = 'sql')
    and p.provolatile = 's' and p.prosecdef and p.proretset
    and p.proargnames = array['p_dog_id','id','dog_id','entry_date','weight_kg','created_at']::text[]
    and p.proargmodes = array['i','t','t','t','t','t']::"char"[]
    and p.proallargtypes = array[
      'uuid'::regtype::oid, 'uuid'::regtype::oid, 'uuid'::regtype::oid,
      'date'::regtype::oid, 'numeric'::regtype::oid,
      'timestamp with time zone'::regtype::oid
    ]::oid[]
    and p.proconfig = array['search_path=""']::text[];
  if v_count <> 1 then raise exception 'STOP_T115_WEIGHT_RPC_CONTRACT_POSTCHECK'; end if;

  if not has_function_privilege('authenticated',
       'public.list_shared_dog_weights(uuid)', 'EXECUTE')
     or has_function_privilege('anon',
       'public.list_shared_dog_weights(uuid)', 'EXECUTE')
     or exists (
       select 1 from pg_proc p
       cross join lateral aclexplode(p.proacl) acl
       where p.oid = to_regprocedure('public.list_shared_dog_weights(uuid)')
         and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
     )
  then raise exception 'STOP_T115_WEIGHT_RPC_ACL_POSTCHECK'; end if;
end
$postcheck$;

commit;
