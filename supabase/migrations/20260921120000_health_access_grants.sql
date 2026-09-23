-- ANYVO Health Foundation: granular, server-enforced health access.
-- Existing connections remain the relationship layer; grants are per dog.

create table if not exists public.dog_health_access_grants (
  id                          uuid primary key default gen_random_uuid(),
  dog_id                      uuid not null references public.dogs(id) on delete cascade,
  owner_id                    uuid not null references auth.users(id) on delete cascade,
  connection_id               uuid references public.connections(id) on delete cascade,
  grantee_user_id             uuid not null references auth.users(id) on delete cascade,
  role_preset                 text not null default 'custom',
  starts_at                   timestamptz not null default now(),
  expires_at                  timestamptz,
  revoked_at                  timestamptz,
  can_view_health_summary     boolean not null default false,
  can_view_weight             boolean not null default false,
  can_view_vaccinations       boolean not null default false,
  can_view_parasite_treatments boolean not null default false,
  can_view_medications        boolean not null default false,
  can_view_diagnoses          boolean not null default false,
  can_view_allergies          boolean not null default false,
  can_view_vet_visits         boolean not null default false,
  can_view_vet_reports        boolean not null default false,
  can_view_lab_results        boolean not null default false,
  can_view_health_documents   boolean not null default false,
  can_view_emergency_info     boolean not null default false,
  can_edit_health             boolean not null default false,
  can_add_vet_notes           boolean not null default false,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint dog_health_access_grants_role_check
    check (role_preset in ('trainer', 'vet', 'family', 'caregiver', 'guest', 'custom')),
  constraint dog_health_access_grants_date_check
    check (expires_at is null or expires_at > starts_at),
  constraint dog_health_access_grants_not_self_check
    check (grantee_user_id <> owner_id)
);

create index if not exists dog_health_access_grants_dog_grantee_idx
  on public.dog_health_access_grants (dog_id, grantee_user_id);

create index if not exists dog_health_access_grants_active_idx
  on public.dog_health_access_grants (grantee_user_id, revoked_at, starts_at, expires_at);

create or replace function public.health_dog_owner_matches(p_dog_id uuid, p_owner_id uuid)
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.dogs d
    where d.id = p_dog_id and d.owner_id = p_owner_id
  );
$$;

create or replace function public.health_grant_connection_valid(
  p_connection_id uuid,
  p_owner_id uuid,
  p_grantee_user_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select p_connection_id is null or exists (
    select 1 from public.connections c
    where c.id = p_connection_id
      and c.owner_user_id = p_owner_id
      and c.connected_user_id = p_grantee_user_id
      and c.status = 'accepted'
  );
$$;

create or replace function public.can_view_dog_health(p_dog_id uuid, p_permission text)
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.dogs d
    where d.id = p_dog_id
      and (
        d.owner_id = auth.uid()
        or exists (
          select 1
          from public.dog_health_access_grants g
          where g.dog_id = d.id
            and g.owner_id = d.owner_id
            and g.grantee_user_id = auth.uid()
            and g.revoked_at is null
            and g.starts_at <= now()
            and (g.expires_at is null or g.expires_at > now())
            and public.health_grant_connection_valid(g.connection_id, g.owner_id, g.grantee_user_id)
            and case p_permission
              when 'can_view_health_summary' then g.can_view_health_summary
              when 'can_view_weight' then g.can_view_weight
              when 'can_view_vaccinations' then g.can_view_vaccinations
              when 'can_view_parasite_treatments' then g.can_view_parasite_treatments
              when 'can_view_medications' then g.can_view_medications
              when 'can_view_diagnoses' then g.can_view_diagnoses
              when 'can_view_allergies' then g.can_view_allergies
              when 'can_view_vet_visits' then g.can_view_vet_visits
              when 'can_view_vet_reports' then g.can_view_vet_reports
              when 'can_view_lab_results' then g.can_view_lab_results
              when 'can_view_health_documents' then g.can_view_health_documents
              when 'can_view_emergency_info' then g.can_view_emergency_info
              when 'can_edit_health' then g.can_edit_health
              when 'can_add_vet_notes' then g.can_add_vet_notes
              else false
            end
        )
      )
  );
$$;

-- Preserve the pre-existing non-health document sharing behavior without
-- allowing it to become an implicit health grant.
create or replace function public.can_view_legacy_dog_document(p_dog_id uuid)
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.dogs d
    join public.connections c on c.owner_user_id = d.owner_id
    where d.id = p_dog_id
      and c.connected_user_id = auth.uid()
      and c.status = 'accepted'
  );
$$;

create or replace function public.can_view_dog_document(p_document_id uuid)
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.dog_documents doc
    where doc.id = p_document_id
      and (
        doc.owner_id = auth.uid()
        or (
          case
            when doc.category is not null then doc.category
            when doc.kind in ('impfpass', 'hd_ed', 'gesundheit', 'tierarzt') then 'health'
            when doc.kind in ('stammbaum', 'zucht') then 'breeding'
            when doc.kind in ('pruefung', 'sport') then 'sport'
            when doc.kind = 'versicherung' then 'insurance'
            else 'other'
          end = 'health'
          and public.can_view_dog_health(
            doc.dog_id,
            case
              when coalesce(doc.subtype, case when doc.kind = 'impfpass' then 'vaccination' when doc.kind = 'hd_ed' then 'imaging' when doc.kind = 'tierarzt' then 'vet_report' else 'other' end) = 'lab' then 'can_view_lab_results'
              when coalesce(doc.subtype, case when doc.kind = 'tierarzt' then 'vet_report' else 'other' end) = 'vet_report' then 'can_view_vet_reports'
              else 'can_view_health_documents'
            end
          )
        )
        or (
          case
            when doc.category is not null then doc.category
            when doc.kind in ('impfpass', 'hd_ed', 'gesundheit', 'tierarzt') then 'health'
            when doc.kind in ('stammbaum', 'zucht') then 'breeding'
            when doc.kind in ('pruefung', 'sport') then 'sport'
            when doc.kind = 'versicherung' then 'insurance'
            else 'other'
          end <> 'health'
          and public.can_view_legacy_dog_document(doc.dog_id)
        )
      )
  );
$$;

create or replace function public.can_read_dog_document_path(p_path text)
returns boolean
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  v_owner_id uuid;
  v_dog_id uuid;
  v_document_id uuid;
begin
  if p_path !~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}/' then
    return false;
  end if;

  v_owner_id := split_part(p_path, '/', 1)::uuid;
  v_dog_id := split_part(p_path, '/', 2)::uuid;

  select doc.id into v_document_id
  from public.dog_documents doc
  where doc.owner_id = v_owner_id
    and doc.dog_id = v_dog_id
    and doc.file_url = p_path
  limit 1;

  return v_document_id is not null and public.can_view_dog_document(v_document_id);
exception
  when invalid_text_representation then
    return false;
end;
$$;

revoke all on function public.health_dog_owner_matches(uuid, uuid) from public;
revoke all on function public.health_grant_connection_valid(uuid, uuid, uuid) from public;
revoke all on function public.can_view_dog_health(uuid, text) from public;
revoke all on function public.can_view_legacy_dog_document(uuid) from public;
revoke all on function public.can_view_dog_document(uuid) from public;
revoke all on function public.can_read_dog_document_path(text) from public;

grant execute on function public.health_dog_owner_matches(uuid, uuid) to authenticated;
grant execute on function public.health_grant_connection_valid(uuid, uuid, uuid) to authenticated;
grant execute on function public.can_view_dog_health(uuid, text) to authenticated;
grant execute on function public.can_view_legacy_dog_document(uuid) to authenticated;
grant execute on function public.can_view_dog_document(uuid) to authenticated;
grant execute on function public.can_read_dog_document_path(text) to authenticated;

alter table public.dog_health_access_grants enable row level security;
drop policy if exists dog_health_access_grants_select on public.dog_health_access_grants;
create policy dog_health_access_grants_select on public.dog_health_access_grants
  for select using (owner_id = auth.uid() or grantee_user_id = auth.uid());

drop policy if exists dog_health_access_grants_insert on public.dog_health_access_grants;
create policy dog_health_access_grants_insert on public.dog_health_access_grants
  for insert with check (
    owner_id = auth.uid()
    and public.health_dog_owner_matches(dog_id, owner_id)
    and public.health_grant_connection_valid(connection_id, owner_id, grantee_user_id)
  );

drop policy if exists dog_health_access_grants_update on public.dog_health_access_grants;
create policy dog_health_access_grants_update on public.dog_health_access_grants
  for update using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and public.health_dog_owner_matches(dog_id, owner_id)
    and public.health_grant_connection_valid(connection_id, owner_id, grantee_user_id)
  );

drop policy if exists dog_health_access_grants_delete on public.dog_health_access_grants;
create policy dog_health_access_grants_delete on public.dog_health_access_grants
  for delete using (owner_id = auth.uid());

-- Replace the old accepted-connection-only health policies. Non-owner writes
-- remain disabled; can_edit_health and can_add_vet_notes are prepared only.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'dog_health_entries',
    'dog_deworming_entries',
    'dog_vet_appointments',
    'dog_documents'
  ] loop
    execute format('drop policy if exists %I_select on public.%I;', table_name, table_name);
    execute format('drop policy if exists %I_insert on public.%I;', table_name, table_name);
    execute format('drop policy if exists %I_update on public.%I;', table_name, table_name);
    execute format('drop policy if exists %I_delete on public.%I;', table_name, table_name);
    execute format('alter table public.%I enable row level security;', table_name);
  end loop;

  foreach table_name in array array[
    'dog_health_vaccinations',
    'dog_health_medications',
    'dog_health_conditions'
  ] loop
    execute format('drop policy if exists %I_owner_select on public.%I;', table_name, table_name);
    execute format('drop policy if exists %I_owner_insert on public.%I;', table_name, table_name);
    execute format('drop policy if exists %I_owner_update on public.%I;', table_name, table_name);
    execute format('drop policy if exists %I_owner_delete on public.%I;', table_name, table_name);
  end loop;
end $$;

create policy dog_health_vaccinations_select on public.dog_health_vaccinations
  for select using (public.can_view_dog_health(dog_id, 'can_view_vaccinations'));
create policy dog_health_vaccinations_insert on public.dog_health_vaccinations
  for insert with check (
    owner_id = auth.uid()
    and public.health_dog_owner_matches(dog_id, owner_id)
    and (document_id is null or exists (
      select 1 from public.dog_documents doc
      where doc.id = document_id and doc.owner_id = auth.uid() and doc.dog_id = dog_health_vaccinations.dog_id
    ))
  );
create policy dog_health_vaccinations_update on public.dog_health_vaccinations
  for update using (owner_id = auth.uid() and public.health_dog_owner_matches(dog_id, owner_id))
  with check (owner_id = auth.uid() and public.health_dog_owner_matches(dog_id, owner_id));
create policy dog_health_vaccinations_delete on public.dog_health_vaccinations
  for delete using (owner_id = auth.uid() and public.health_dog_owner_matches(dog_id, owner_id));

create policy dog_health_medications_select on public.dog_health_medications
  for select using (public.can_view_dog_health(dog_id, 'can_view_medications'));
create policy dog_health_medications_insert on public.dog_health_medications
  for insert with check (owner_id = auth.uid() and public.health_dog_owner_matches(dog_id, owner_id));
create policy dog_health_medications_update on public.dog_health_medications
  for update using (owner_id = auth.uid() and public.health_dog_owner_matches(dog_id, owner_id))
  with check (owner_id = auth.uid() and public.health_dog_owner_matches(dog_id, owner_id));
create policy dog_health_medications_delete on public.dog_health_medications
  for delete using (owner_id = auth.uid() and public.health_dog_owner_matches(dog_id, owner_id));

create policy dog_health_conditions_select on public.dog_health_conditions
  for select using (
    public.can_view_dog_health(
      dog_id,
      case when kind = 'diagnosis' then 'can_view_diagnoses' else 'can_view_allergies' end
    )
  );
create policy dog_health_conditions_insert on public.dog_health_conditions
  for insert with check (owner_id = auth.uid() and public.health_dog_owner_matches(dog_id, owner_id));
create policy dog_health_conditions_update on public.dog_health_conditions
  for update using (owner_id = auth.uid() and public.health_dog_owner_matches(dog_id, owner_id))
  with check (owner_id = auth.uid() and public.health_dog_owner_matches(dog_id, owner_id));
create policy dog_health_conditions_delete on public.dog_health_conditions
  for delete using (owner_id = auth.uid() and public.health_dog_owner_matches(dog_id, owner_id));

create policy dog_health_entries_select on public.dog_health_entries
  for select using (
    public.can_view_dog_health(dog_id, 'can_view_weight')
  );
create policy dog_health_entries_insert on public.dog_health_entries
  for insert with check (owner_id = auth.uid() and public.health_dog_owner_matches(dog_id, owner_id));
create policy dog_health_entries_update on public.dog_health_entries
  for update using (owner_id = auth.uid() and public.health_dog_owner_matches(dog_id, owner_id))
  with check (owner_id = auth.uid() and public.health_dog_owner_matches(dog_id, owner_id));
create policy dog_health_entries_delete on public.dog_health_entries
  for delete using (owner_id = auth.uid() and public.health_dog_owner_matches(dog_id, owner_id));

create policy dog_deworming_entries_select on public.dog_deworming_entries
  for select using (public.can_view_dog_health(dog_id, 'can_view_parasite_treatments'));
create policy dog_deworming_entries_insert on public.dog_deworming_entries
  for insert with check (owner_id = auth.uid() and public.health_dog_owner_matches(dog_id, owner_id));
create policy dog_deworming_entries_update on public.dog_deworming_entries
  for update using (owner_id = auth.uid() and public.health_dog_owner_matches(dog_id, owner_id))
  with check (owner_id = auth.uid() and public.health_dog_owner_matches(dog_id, owner_id));
create policy dog_deworming_entries_delete on public.dog_deworming_entries
  for delete using (owner_id = auth.uid() and public.health_dog_owner_matches(dog_id, owner_id));

create policy dog_vet_appointments_select on public.dog_vet_appointments
  for select using (public.can_view_dog_health(dog_id, 'can_view_vet_visits'));
create policy dog_vet_appointments_insert on public.dog_vet_appointments
  for insert with check (
    owner_id = auth.uid()
    and public.health_dog_owner_matches(dog_id, owner_id)
    and (document_id is null or exists (
      select 1 from public.dog_documents doc
      where doc.id = document_id and doc.owner_id = auth.uid() and doc.dog_id = dog_vet_appointments.dog_id
    ))
  );
create policy dog_vet_appointments_update on public.dog_vet_appointments
  for update using (owner_id = auth.uid() and public.health_dog_owner_matches(dog_id, owner_id))
  with check (
    owner_id = auth.uid()
    and public.health_dog_owner_matches(dog_id, owner_id)
    and (document_id is null or exists (
      select 1 from public.dog_documents doc
      where doc.id = document_id and doc.owner_id = auth.uid() and doc.dog_id = dog_vet_appointments.dog_id
    ))
  );
create policy dog_vet_appointments_delete on public.dog_vet_appointments
  for delete using (owner_id = auth.uid() and public.health_dog_owner_matches(dog_id, owner_id));

create policy dog_documents_select on public.dog_documents
  for select using (public.can_view_dog_document(id));
create policy dog_documents_insert on public.dog_documents
  for insert with check (owner_id = auth.uid() and public.health_dog_owner_matches(dog_id, owner_id));
create policy dog_documents_update on public.dog_documents
  for update using (owner_id = auth.uid() and public.health_dog_owner_matches(dog_id, owner_id))
  with check (owner_id = auth.uid() and public.health_dog_owner_matches(dog_id, owner_id));
create policy dog_documents_delete on public.dog_documents
  for delete using (owner_id = auth.uid() and public.health_dog_owner_matches(dog_id, owner_id));

-- Replace the broad bucket read policy. Upload/update/delete remain owner-only.
drop policy if exists dog_docs_read on storage.objects;
create policy dog_docs_read on storage.objects for select to authenticated
  using (bucket_id = 'dog-documents' and public.can_read_dog_document_path(name));
