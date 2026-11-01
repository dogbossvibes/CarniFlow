-- Local-only synthetic cluster bootstraps as qa_local_admin, not postgres.
-- The production-like object owner is a separate NOSUPERUSER/BYPASSRLS role.
create role postgres login nosuperuser bypassrls;
create role authenticated noinherit;
create role anon noinherit;
create role service_role noinherit bypassrls;
grant create on database postgres to postgres;
grant usage,create on schema public to postgres;
set role postgres;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth,public to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
create table public.dogs(id uuid primary key,owner_id uuid not null);
create table public.connections(id uuid primary key, owner_user_id uuid,connected_user_id uuid,status text);
create table public.dog_health_access_grants(id uuid primary key,dog_id uuid,owner_id uuid,connection_id uuid,grantee_user_id uuid,starts_at timestamptz,expires_at timestamptz,revoked_at timestamptz,can_view_health_summary boolean default false,can_view_weight boolean default false,can_view_vaccinations boolean default false,can_view_parasite_treatments boolean default false,can_view_medications boolean default false,can_view_diagnoses boolean default false,can_view_allergies boolean default false,can_view_vet_visits boolean default false,can_view_vet_reports boolean default false,can_view_lab_results boolean default false,can_view_health_documents boolean default false,can_view_emergency_info boolean default false,can_edit_health boolean default false,can_add_vet_notes boolean default false);
create table public.dog_documents(id uuid primary key,owner_id uuid not null,dog_id uuid not null,kind text not null,category text,subtype text,title text,file_url text);
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
alter table public.dog_documents enable row level security;
grant select,insert,update,delete on public.dog_documents to authenticated,anon;
create policy dog_documents_select on public.dog_documents for select using (public.can_view_dog_document(id));
create policy dog_documents_insert on public.dog_documents for insert with check(owner_id=auth.uid() and public.health_dog_owner_matches(dog_id,owner_id));
create policy dog_documents_update on public.dog_documents for update using(owner_id=auth.uid() and public.health_dog_owner_matches(dog_id,owner_id)) with check(owner_id=auth.uid() and public.health_dog_owner_matches(dog_id,owner_id));
create policy dog_documents_delete on public.dog_documents for delete using(owner_id=auth.uid() and public.health_dog_owner_matches(dog_id,owner_id));
insert into public.dogs values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');

-- Local-only administrator: preserve the exact Production postgres role flags below.
-- Role flags are adjusted in a separate qa_local_admin session by the controller.
