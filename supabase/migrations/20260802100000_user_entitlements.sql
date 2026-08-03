-- ANYVO user entitlements.
-- Additive migration only. Apply with the Supabase migration workflow; do not run
-- from the mobile client. Administrative writes must use service_role/Admin SQL.

create table public.user_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement text not null,
  granted_by uuid null references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz null,
  revoked_at timestamptz null,
  notes text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_entitlements_entitlement_chk
    check (entitlement in ('lifetime', 'beta_tester', 'ambassador', 'staff'))
);

create index user_entitlements_user_active_idx
  on public.user_entitlements (user_id, entitlement, expires_at)
  where revoked_at is null;

create unique index user_entitlements_one_non_revoked_per_user_type_idx
  on public.user_entitlements (user_id, entitlement)
  where revoked_at is null;

create trigger trg_user_entitlements_updated_at
  before update on public.user_entitlements
  for each row execute function public.set_updated_at();

alter table public.user_entitlements enable row level security;

create policy "read own active entitlements"
  on public.user_entitlements
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  );

grant select on public.user_entitlements to authenticated;
grant all on public.user_entitlements to service_role;
