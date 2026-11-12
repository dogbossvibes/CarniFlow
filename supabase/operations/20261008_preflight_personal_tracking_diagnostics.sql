-- Read only. Minimal target-account and schema checks; no account UUIDs or secrets returned.
select 'target_matches' as check_name, count(*)::text as result
  from auth.users where lower(email) = 'einfachich503@gmail.com'
union all
select 'confirmed_matches', count(*)::text from auth.users
  where lower(email) = 'einfachich503@gmail.com' and email_confirmed_at is not null
union all
select 'profile_matches', count(*)::text from public.profiles p join auth.users u on u.id=p.id
  where lower(u.email) = 'einfachich503@gmail.com'
union all
select 'profiles_rls', relrowsecurity::text from pg_class where oid='public.profiles'::regclass
union all
select 'profiles_policy_count', count(*)::text from pg_policies where schemaname='public' and tablename='profiles'
union all
select 'own_policies', coalesce(string_agg(policyname || ':' || cmd || ':' || roles::text || ':' || coalesce(qual,with_check), ' / ' order by policyname),'none')
  from pg_policies where schemaname='public' and tablename='profiles'
union all
select 'capability_column', coalesce((select data_type || '/nullable=' || is_nullable || '/default=' || column_default
  from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='can_use_internal_tracking_diagnostics'),'absent')
union all
select 'target_capability', coalesce(to_jsonb(p)->>'can_use_internal_tracking_diagnostics','absent')
  from public.profiles p join auth.users u on u.id=p.id where lower(u.email)='einfachich503@gmail.com'
union all
select 'profile_triggers', coalesce(string_agg(tgname || ':' || tgenabled::text || ':' || tgfoid::regprocedure::text,' / ' order by tgname),'none')
  from pg_trigger where tgrelid='public.profiles'::regclass and not tgisinternal;
