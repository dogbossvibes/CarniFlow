-- FOUNDER_WEBHOOK_SETUP.sql · VORSCHLAG zur Freigabe — NICHT automatisch ausgeführt.
-- Ergänzt die Founder-Slot-Logik um eine Freigabe-RPC (Slot bei Abo-Ablauf
-- zurückgeben) und gibt der Service-Role Ausführungsrechte für den RevenueCat-
-- Webhook. In Supabase → SQL-Editor ausführen (nach Review). Idempotent.

-- Slot freigeben (bei EXPIRATION). No-op, wenn kein Slot existiert.
create or replace function public.release_founder_slot(p_user_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.founder_slots where user_id = p_user_id;
$$;

-- Der Webhook läuft mit der Service-Role → Ausführungsrechte erteilen.
grant execute on function public.claim_founder_slot(uuid)   to service_role;
grant execute on function public.founder_slots_status()      to service_role;
grant execute on function public.release_founder_slot(uuid) to service_role;
