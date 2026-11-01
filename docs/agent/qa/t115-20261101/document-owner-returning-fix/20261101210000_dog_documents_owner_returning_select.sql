-- REVIEW CANDIDATE ONLY. Production execution requires the user's exact approval.
-- Fix owner INSERT ... RETURNING without changing stored-row recipient access.
-- No row DML, grants, helper-function changes, Storage changes or RLS disabling.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = pg_catalog, public;
lock table public.dog_documents in share row exclusive mode;
do $guard$
declare
  table_oid oid := 'public.dog_documents'::regclass;
  auth_oid oid := 'authenticated'::regrole;
  table_acl_before text;
  other_policies_before text;
  helper_security_before text;
  desired text := '(((owner_id = auth.uid()) AND health_dog_owner_matches(dog_id, owner_id)) OR can_view_dog_document(id))';
begin
  if not exists(select 1 from pg_class where oid=table_oid and relrowsecurity and not relforcerowsecurity) then
    raise exception 'STOP_DOCUMENT_RLS_BASELINE_DRIFT';
  end if;
  if (select count(*) from pg_policy where polrelid=table_oid and polcmd in ('r','*')) <> 1
     or not exists(select 1 from pg_policy where polrelid=table_oid and polname='dog_documents_select'
       and polcmd='r' and polpermissive and polroles=array[0::oid]
       and pg_get_expr(polqual,polrelid)='can_view_dog_document(id)') then
    raise exception 'STOP_DOCUMENT_SELECT_POLICY_BASELINE_DRIFT';
  end if;
  if not exists(select 1 from pg_policy where polrelid=table_oid and polname='dog_documents_insert'
       and polcmd='a' and polpermissive and polroles=array[0::oid]
       and pg_get_expr(polwithcheck,polrelid)='((owner_id = auth.uid()) AND health_dog_owner_matches(dog_id, owner_id))') then
    raise exception 'STOP_DOCUMENT_INSERT_POLICY_BASELINE_DRIFT';
  end if;
  if exists(select 1 from pg_trigger where tgrelid=table_oid and not tgisinternal) then
    raise exception 'STOP_UNEXPECTED_DOCUMENT_CUSTOM_TRIGGER';
  end if;
  if not (has_table_privilege('authenticated',table_oid,'SELECT')
      and has_table_privilege('authenticated',table_oid,'INSERT')
      and has_table_privilege('authenticated',table_oid,'UPDATE')
      and has_table_privilege('authenticated',table_oid,'DELETE')) then
    raise exception 'STOP_DOCUMENT_AUTHENTICATED_TABLE_PRIVILEGE_DRIFT';
  end if;
  if not exists(select 1 from pg_proc where oid='public.can_view_dog_document(uuid)'::regprocedure
       and md5(prosrc)='caf0b0f5a099bd5ef356f36333b37f7b' and provolatile='s' and prosecdef
       and proowner='postgres'::regrole and proconfig=array['search_path=pg_catalog, public'])
     or not exists(select 1 from pg_proc where oid='public.health_dog_owner_matches(uuid,uuid)'::regprocedure
       and md5(prosrc)='608febdba1b74dc18708cd45fae80ec8' and provolatile='s' and prosecdef
       and proowner='postgres'::regrole and proconfig=array['search_path=pg_catalog, public']) then
    raise exception 'STOP_DOCUMENT_HELPER_BASELINE_DRIFT';
  end if;
  if exists(select 1 from pg_proc p where p.oid in ('public.can_view_dog_document(uuid)'::regprocedure,
       'public.health_dog_owner_matches(uuid,uuid)'::regprocedure)
       and (not has_function_privilege('authenticated',p.oid,'EXECUTE')
         or has_function_privilege('anon',p.oid,'EXECUTE')
         or has_function_privilege('public',p.oid,'EXECUTE')
         or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
                   where a.privilege_type='EXECUTE' and a.grantee not in (p.proowner,auth_oid)))) then
    raise exception 'STOP_DOCUMENT_HELPER_EXECUTION_SCOPE_DRIFT';
  end if;
  select coalesce(relacl::text,'<null>') into table_acl_before from pg_class where oid=table_oid;
  select md5(coalesce(string_agg(concat_ws('|',polname,polcmd::text,polpermissive::text,polroles::text,
         coalesce(pg_get_expr(polqual,polrelid),'<null>'),coalesce(pg_get_expr(polwithcheck,polrelid),'<null>')),
         E'\n' order by polname),'')) into other_policies_before
    from pg_policy where polrelid=table_oid and polname<>'dog_documents_select';
  select md5(string_agg(concat_ws('|',oid::text,prosrc,provolatile::text,prosecdef::text,proowner::text,
          coalesce(proconfig::text,'<null>'),coalesce(proacl::text,'<null>')),E'\n' order by oid)) into helper_security_before
    from pg_proc where oid in ('public.can_view_dog_document(uuid)'::regprocedure,
                              'public.health_dog_owner_matches(uuid,uuid)'::regprocedure);

  alter policy dog_documents_select on public.dog_documents
    using ((owner_id = auth.uid() and public.health_dog_owner_matches(dog_id,owner_id))
           or public.can_view_dog_document(id));

  if not exists(select 1 from pg_policy where polrelid=table_oid and polname='dog_documents_select'
       and polcmd='r' and polpermissive and polroles=array[0::oid]
       and pg_get_expr(polqual,polrelid)=desired)
     or not exists(select 1 from pg_class where oid=table_oid and relrowsecurity and not relforcerowsecurity
       and coalesce(relacl::text,'<null>')=table_acl_before)
     or (select md5(coalesce(string_agg(concat_ws('|',polname,polcmd::text,polpermissive::text,polroles::text,
          coalesce(pg_get_expr(polqual,polrelid),'<null>'),coalesce(pg_get_expr(polwithcheck,polrelid),'<null>')),
          E'\n' order by polname),'')) from pg_policy where polrelid=table_oid and polname<>'dog_documents_select')
          is distinct from other_policies_before
     or (select md5(string_agg(concat_ws('|',oid::text,prosrc,provolatile::text,prosecdef::text,proowner::text,
          coalesce(proconfig::text,'<null>'),coalesce(proacl::text,'<null>')),E'\n' order by oid))
         from pg_proc where oid in ('public.can_view_dog_document(uuid)'::regprocedure,
                                   'public.health_dog_owner_matches(uuid,uuid)'::regprocedure))
          is distinct from helper_security_before then
    raise exception 'STOP_DOCUMENT_OWNER_RETURNING_POSTCONDITION_FAILED';
  end if;
end
$guard$;
commit;
-- Verify separately read-only after execution. No automatic broad policy restore.
