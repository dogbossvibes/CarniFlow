-- One read-only snapshot of T115 Stage B metadata and the exact QA storage path.
-- No customer row payloads, DML, DDL, permission changes, or broad storage listing.
with checks as (
  select
    clock_timestamp() at time zone 'utc' as checked_at_utc,
    current_database() as database_name,
    (select c.relrowsecurity from pg_class c where c.oid='public.dog_health_entries'::regclass) as health_rls,
    (select c.relacl::text from pg_class c where c.oid='public.dog_health_entries'::regclass) as health_table_acl,
    (select count(*) from pg_policy p where p.polrelid='public.dog_health_entries'::regclass and p.polcmd in ('r','*')) as health_select_policy_count,
    (select jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',
      (select jsonb_agg(case when role_oid=0 then 'PUBLIC' else pg_get_userbyid(role_oid) end order by role_oid)
       from unnest(p.polroles) as roles(role_oid)),'using',pg_get_expr(p.polqual,p.polrelid)) order by p.polname)
       from pg_policy p where p.polrelid='public.dog_health_entries'::regclass and p.polcmd in ('r','*')) as health_read_policies,
    (select jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',
      (select jsonb_agg(case when role_oid=0 then 'PUBLIC' else pg_get_userbyid(role_oid) end order by role_oid)
       from unnest(p.polroles) as roles(role_oid)),'using',pg_get_expr(p.polqual,p.polrelid),'with_check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname)
       from pg_policy p where p.polrelid='public.dog_health_entries'::regclass and p.polcmd in ('a','w','d')) as health_write_policies,
    (select count(*) from pg_trigger t where t.tgrelid='public.dog_health_entries'::regclass and not t.tgisinternal) as health_custom_trigger_count,
    (select jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid,true)) order by k.conname)
       from pg_constraint k where k.conrelid='public.dog_health_entries'::regclass and k.contype='f') as health_foreign_keys,
    (select count(*) from public.dog_health_entries h left join public.dogs d on d.id=h.dog_id where d.id is null or d.owner_id is distinct from h.owner_id) as health_owner_dog_mismatch_count,
    (select count(*) from public.dog_health_entries) as health_row_count,
    (select count(*) from public.dogs where id='b4991851-e569-51fc-a0af-4e0172f2bc63'::uuid and owner_id='68910959-e849-4860-b408-ebc234fec611'::uuid) as exact_owner_dog_count,
    (select count(*) from public.dogs where id='b4991851-e569-51fc-a0af-4e0172f2bc63'::uuid and owner_id='0327d914-99e4-4e6e-b89e-3b642586a3b8'::uuid) as recipient_owns_exact_dog_count,
    (select count(*) from public.connections where owner_user_id='68910959-e849-4860-b408-ebc234fec611'::uuid and connected_user_id='0327d914-99e4-4e6e-b89e-3b642586a3b8'::uuid and status='accepted') as exact_accepted_connection_count,
    (select jsonb_build_object('owner',pg_get_userbyid(p.proowner),'body_md5',md5(p.prosrc),'security_definer',p.prosecdef,'volatility',p.provolatile,'returns_set',p.proretset,'config',p.proconfig,'acl',p.proacl::text,'result',pg_get_function_result(p.oid))
       from pg_proc p where p.oid='public.list_shared_dog_weights(uuid)'::regprocedure) as weight_rpc,
    has_function_privilege('authenticated','public.list_shared_dog_weights(uuid)','EXECUTE') as weight_rpc_auth_execute,
    has_function_privilege('anon','public.list_shared_dog_weights(uuid)','EXECUTE') as weight_rpc_anon_execute,
    (select exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
      where acl.grantee=0 and acl.privilege_type='EXECUTE')
      from pg_proc p where p.oid='public.list_shared_dog_weights(uuid)'::regprocedure) as weight_rpc_public_execute,
    (select jsonb_build_object('owner',pg_get_userbyid(p.proowner),'body_md5',md5(p.prosrc),'security_definer',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,'acl',p.proacl::text)
       from pg_proc p where p.oid='public.health_dog_owner_matches(uuid,uuid)'::regprocedure) as owner_match_helper,
    (select count(*) from public.dog_health_vaccinations where id in ('2be7deb1-5685-4fca-a004-e3bec741386a'::uuid,'d1fd060b-f509-4d42-9460-b88f32757ba1'::uuid)) as dog_health_vaccinations_new_id_collision_count,
    (select count(*) from public.dog_deworming_entries where id in ('2000a155-ed10-41d6-a416-3ce7fb06d2bd'::uuid,'83197e8a-4b0d-4366-bebf-74fe6203d1b0'::uuid)) as dog_deworming_entries_new_id_collision_count,
    (select count(*) from public.dog_health_medications where id in ('396618ff-a9fb-43ce-b82d-f19796df208f'::uuid,'d09cfc35-a1f6-4afa-98bf-ee75069e6ec4'::uuid)) as dog_health_medications_new_id_collision_count,
    (select count(*) from public.dog_health_conditions where id in ('6e049910-31f8-43d4-8f79-82f45871ab99'::uuid,'8400f33d-1e4e-4c4a-8e74-a47a8dd48f0d'::uuid,'1fb7b7b0-8cd0-49cc-baf4-fe94579e50fe'::uuid,'a08280ff-19f0-4ca6-b1ac-64bb418f023b'::uuid)) as dog_health_conditions_new_id_collision_count,
    (select count(*) from public.dog_vet_appointments where id in ('5ac155d7-16a2-4c0e-b784-bfe4f30dfd8f'::uuid,'656aac2e-1858-4ff8-b281-c9fce1f206d4'::uuid)) as dog_vet_appointments_new_id_collision_count,
    (select count(*) from public.dog_documents where id in ('d1e343ec-6c88-41ec-aa96-21af3ad870b0'::uuid,'7a2e4018-f0fc-4616-aade-4a55d674438e'::uuid,'4b8c5e40-6f6b-4213-94f8-0e6dfbede06d'::uuid,'b3658ffb-88e9-416b-acc5-665d46270277'::uuid)) as dog_documents_new_id_collision_count,
    (select count(*) from public.dog_health_entries where id='98a2a0ad-5da0-497c-a9df-fab4e220440e'::uuid) as stage_b_row_new_id_collision_count,
    (select count(*) from public.dog_health_access_grants where id in ('c0f83512-e9f4-452e-94fd-5ba0a81bee3a'::uuid,'e65d9ac1-5f69-4aef-ac7f-788aa4554120'::uuid)) as new_grant_id_collision_count,
    (select count(*) from public.dog_health_access_grants where id in ('33a9ee49-9eaa-41ac-87cd-b74629cec4db'::uuid,'9a6ef3f7-adf1-4835-99a8-b0cc7be85368'::uuid,'15d25b20-49a7-4c3b-8706-039b37ca3c5d'::uuid,'ce59ad68-02d0-4543-89fc-56bebb11e7e5'::uuid) and revoked_at is null and (expires_at is null or expires_at > now())) as prior_qa_grants_active_count,
    ((select count(*) from public.dog_health_vaccinations where id in ('d525fd6b-94a0-4044-9a99-bd0adea68443'::uuid,'47a363b8-a2aa-49f6-9959-5f605b77f4d5'::uuid)) + (select count(*) from public.dog_deworming_entries where id in ('8dca8fc8-aa03-4de0-9a49-9d2aeeab6c5c'::uuid,'bcf4e213-3322-4aa8-8981-95973f956b9f'::uuid)) + (select count(*) from public.dog_health_medications where id in ('b92e07a6-5012-4d3f-ad31-279ca3f01332'::uuid,'b5d9e30b-dbad-4505-bdea-b3f2576adc01'::uuid)) + (select count(*) from public.dog_health_conditions where id in ('6b7f460c-583d-402e-b84a-fd01f3d6352f'::uuid,'ad482cff-f23a-404a-8af3-fdfb5ab56029'::uuid,'51bfe45d-2ab1-4693-bcc2-436894875240'::uuid,'a3e4c65e-4bd9-4525-837f-e734bf370cdb'::uuid)) + (select count(*) from public.dog_vet_appointments where id in ('280cfd37-492d-4e5e-9831-dd867ddf0f95'::uuid,'4ca28b29-c509-4907-8e9b-456a71519435'::uuid)) + (select count(*) from public.dog_documents where id in ('4cf382c6-b315-4dfb-b175-eb6b3ebcfa52'::uuid,'e166858d-d94b-4367-835a-2fd3f2adc82d'::uuid,'fb3a60b5-338d-4c48-bfd3-7f862de25f82'::uuid,'2d170f88-d7a7-489c-a9cf-f7db2cec6d2d'::uuid)) + (select count(*) from public.dog_health_entries where id='4b9f52c0-6d1d-46d7-91a7-29d978fc8d9d'::uuid) + (select count(*) from storage.objects where bucket_id='dog-documents' and name='68910959-e849-4860-b408-ebc234fec611/b4991851-e569-51fc-a0af-4e0172f2bc63/t115-health-4cf382c6-b315-4dfb-b175-eb6b3ebcfa52.png')) as prior_qa_fixture_or_file_remaining_count,
    (select count(*) from public.dog_health_access_grants where dog_id='b4991851-e569-51fc-a0af-4e0172f2bc63'::uuid and owner_id='68910959-e849-4860-b408-ebc234fec611'::uuid and grantee_user_id='0327d914-99e4-4e6e-b89e-3b642586a3b8'::uuid and revoked_at is null and (expires_at is null or expires_at > now())) as exact_scope_active_grants_count,
    (select count(*) from storage.objects o where o.bucket_id='dog-documents'
       and o.name='68910959-e849-4860-b408-ebc234fec611/b4991851-e569-51fc-a0af-4e0172f2bc63/t115-health-d1e343ec-6c88-41ec-aa96-21af3ad870b0.png') as exact_storage_object_count,
    (select jsonb_build_object('name',b.name,'public',b.public,'file_size_limit',b.file_size_limit,'allowed_mime_types',b.allowed_mime_types)
       from storage.buckets b where b.id='dog-documents') as document_bucket,
    (select jsonb_agg(jsonb_build_object('name',p.policyname,'command',p.cmd,'permissive',p.permissive,'roles',p.roles,'using',p.qual,'with_check',p.with_check) order by p.policyname)
       from pg_policies p where p.schemaname='storage' and p.tablename='objects') as all_storage_policies,
    (select jsonb_agg(jsonb_build_object('name',p.policyname,'command',p.cmd,'permissive',p.permissive,'roles',p.roles,'using',p.qual,'with_check',p.with_check) order by p.policyname)
       from pg_policies p where p.schemaname='public' and p.tablename='dog_documents') as all_document_policies,
    (select jsonb_build_object('rls_enabled',c.relrowsecurity,'rls_forced',c.relforcerowsecurity,'acl',c.relacl::text)
       from pg_class c where c.oid='public.dog_documents'::regclass) as document_table_security,
    (select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid,true),'function',p.oid::regprocedure::text,'function_body_md5',md5(p.prosrc)) order by t.tgname)
       from pg_trigger t join pg_proc p on p.oid=t.tgfoid
       where t.tgrelid='public.dog_documents'::regclass and not t.tgisinternal) as document_custom_triggers,
    (select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'body_md5',md5(p.prosrc),'security_definer',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,'acl',p.proacl::text)
       order by p.oid::regprocedure::text)
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname in ('can_view_dog_health','can_view_dog_document','can_read_dog_document_path','health_grant_connection_valid','can_view_legacy_dog_document')) as document_related_helpers
)
select * from checks;
