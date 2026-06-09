-- ANYVO — Migration Rollen/Abo → Capability-/Connection-Modell (einmalig)
-- NACH CAPABILITY_MODEL_SETUP.sql ausführen. Idempotent (on conflict do nothing).

-- ── 1. Capabilities aus plan + is_trainer ableiten ──────────
insert into public.user_capabilities (user_id, pro_member, trainer_module)
select
  p.id,
  (p.plan = 'premium' and (p.plan_expires_at is null or p.plan_expires_at > now())) as pro_member,
  (p.is_trainer is true) as trainer_module
from public.profiles p
on conflict (user_id) do update
  set pro_member     = excluded.pro_member,
      trainer_module = excluded.trainer_module,
      updated_at     = now();

-- ── 2. Connections aus coach_relationships ──────────────────
-- owner = Kunde (client_id), connected = Trainer (trainer_id).
insert into public.connections (owner_user_id, connected_user_id, status, created_by, connection_type, created_at)
select
  cr.client_id,
  cr.trainer_id,
  case cr.status
    when 'active'  then 'accepted'
    when 'blocked' then 'blocked'
    else 'pending'
  end,
  'owner',
  'trainer_client',
  cr.created_at
from public.coach_relationships cr
on conflict (owner_user_id, connected_user_id, connection_type) do nothing;

-- ── 3. Default-Permissions je Connection ────────────────────
insert into public.connection_permissions (connection_id)
select c.id
from public.connections c
left join public.connection_permissions cp on cp.connection_id = c.id
where cp.id is null;

-- ── 4. Invites aus bestehenden Trainer-Codes ────────────────
-- Bestehende CANIS-XXXX-Codes funktionieren als unbegrenzte Invites weiter.
insert into public.connection_invites (code, trainer_id, expires_at, max_uses, uses)
select upper(tp.code), tp.user_id, null, null, 0
from public.trainer_profiles tp
where tp.code is not null
on conflict (code) do nothing;
