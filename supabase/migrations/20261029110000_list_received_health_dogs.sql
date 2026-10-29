-- Recipient-only display bridge for dog-specific Health Sharing.
-- A health grant does not grant SELECT on the complete dogs/profiles rows.
create or replace function public.list_received_health_dogs(p_dog_id uuid default null)
returns table (
  grant_id uuid,
  dog_id uuid,
  dog_name text,
  owner_display_name text,
  starts_at timestamptz,
  expires_at timestamptz,
  permissions text[]
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    g.id,
    g.dog_id,
    d.name::text,
    p.full_name::text,
    g.starts_at,
    g.expires_at,
    array_remove(array[
      case when g.can_view_health_summary then 'can_view_health_summary' end,
      case when g.can_view_weight then 'can_view_weight' end,
      case when g.can_view_vaccinations then 'can_view_vaccinations' end,
      case when g.can_view_parasite_treatments then 'can_view_parasite_treatments' end,
      case when g.can_view_medications then 'can_view_medications' end,
      case when g.can_view_diagnoses then 'can_view_diagnoses' end,
      case when g.can_view_allergies then 'can_view_allergies' end,
      case when g.can_view_vet_visits then 'can_view_vet_visits' end,
      case when g.can_view_vet_reports then 'can_view_vet_reports' end,
      case when g.can_view_lab_results then 'can_view_lab_results' end,
      case when g.can_view_health_documents then 'can_view_health_documents' end,
      case when g.can_view_emergency_info then 'can_view_emergency_info' end
    ]::text[], null::text)
  from public.dog_health_access_grants g
  join public.dogs d on d.id = g.dog_id and d.owner_id = g.owner_id
  left join public.profiles p on p.id = g.owner_id
  where auth.uid() is not null
    and g.grantee_user_id = auth.uid()
    and (p_dog_id is null or g.dog_id = p_dog_id)
    and g.revoked_at is null
    and g.starts_at <= now()
    and (g.expires_at is null or g.expires_at > now())
    and public.health_grant_connection_valid(g.connection_id, g.owner_id, g.grantee_user_id)
    and (
      g.can_view_health_summary or g.can_view_weight or g.can_view_vaccinations
      or g.can_view_parasite_treatments or g.can_view_medications
      or g.can_view_diagnoses or g.can_view_allergies or g.can_view_vet_visits
      or g.can_view_vet_reports or g.can_view_lab_results
      or g.can_view_health_documents or g.can_view_emergency_info
    )
  order by d.name, g.id;
$function$;

revoke all on function public.list_received_health_dogs(uuid) from public, anon;
grant execute on function public.list_received_health_dogs(uuid) to authenticated;
