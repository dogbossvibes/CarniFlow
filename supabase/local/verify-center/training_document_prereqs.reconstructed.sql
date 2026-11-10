-- ============================================================================
-- ANYVO LOCAL VERIFY-CENTER ONLY — DO NOT APPLY TO STAGING OR PRODUCTION.
--
-- Schemabasierte LOKALE Rekonstruktion von Production-Objekten, die nicht im
-- Repository versioniert sind, aber von public.training_document_v1 benötigt
-- werden. Quelle der Annahmen (keine Live-Abfrage durch dieses Werkzeug):
--   * training_exercises: Production-Schema-Snapshot aa40c4e0 (2026-08-26,
--     supabase/production_public_schema_snapshot.sql auf feat/track-module-rewrite)
--     plus die später additiv ergänzten Spalten discipline_key /
--     exercise_identity_id (aus RPC-Definition und types/trainingUnit.ts).
--   * td_request / td_snapshot / td_payload: Verhalten wie im Review vom
--     2026-11-09 dokumentiert (Kopf von
--     supabase/drafts/20261109190000_training_exercises_rating_scale.sql):
--       td_request(r, keys)  unbekannte Schlüssel → 'INVALID_REQUEST'
--       td_snapshot(u)       to_jsonb(e) je Übung (neue Spalten kommen automatisch mit)
--   * Übrige Objekte: minimal, nur so weit die getesteten Pfade sie berühren.
--     training_exercise_identity_v1 / training_focus_v1 sind bewusst NICHT
--     nachgebaut (Aufruf → 'NOT_RECONSTRUCTED_LOCALLY'), damit kein Test still
--     ein erfundenes Verhalten bestätigt.
--
-- Grenzen: Exakte Token-Werte, Feldreihenfolge im Snapshot und Fehlertexte
-- von Production können abweichen. Aussagen über "Token ändert sich" beruhen
-- auf der dokumentierten to_jsonb(e)-Eigenschaft, nicht auf Production selbst.
-- ============================================================================

create table if not exists public.training_exercises (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.training_units(id) on delete cascade,
  discipline text not null,
  exercise_name text not null,
  rating smallint,
  notes text,
  duration_sec integer,
  seq_index integer default 0 not null,
  created_at timestamptz default now() not null,
  discipline_key text,
  exercise_identity_id uuid,
  constraint training_exercises_rating_check check (rating >= 1 and rating <= 5)
);
create index if not exists idx_training_exercises_unit on public.training_exercises(unit_id, seq_index);
alter table public.training_exercises enable row level security;
drop policy if exists owner_training_exercises on public.training_exercises;
create policy owner_training_exercises on public.training_exercises
  using (exists (select 1 from public.training_units tu where tu.id = training_exercises.unit_id and tu.owner_id = auth.uid()))
  with check (exists (select 1 from public.training_units tu where tu.id = training_exercises.unit_id and tu.owner_id = auth.uid()));
grant all on public.training_exercises to authenticated, service_role;

create table if not exists public.training_exercise_identities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  discipline_key text not null,
  display_name text not null,
  revision integer default 1 not null,
  created_at timestamptz default now() not null
);
alter table public.training_exercise_identities enable row level security;

-- Positionsgebundener INSERT im RPC: (owner_id, request_id, operation, payload_hash, response).
create table if not exists public.training_document_receipts (
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  operation text not null,
  payload_hash text not null,
  response jsonb not null,
  created_at timestamptz default now() not null,
  primary key (owner_id, request_id)
);
alter table public.training_document_receipts enable row level security;

create table if not exists public.training_document_epochs (
  unit_id uuid primary key,
  epoch bigint default 0 not null,
  deleted boolean default false not null
);
alter table public.training_document_epochs enable row level security;

create or replace function public.td_request(r jsonb, keys text[])
returns void language plpgsql immutable set search_path to '' as $$
begin
  if r is null or jsonb_typeof(r) <> 'object' then raise exception 'INVALID_REQUEST'; end if;
  if exists (select 1 from jsonb_object_keys(r) k where not (k = any(keys))) then
    raise exception 'INVALID_REQUEST';
  end if;
end $$;

create or replace function public.td_snapshot(u uuid)
returns jsonb language sql stable set search_path to '' as $$
  select jsonb_build_object(
    'unit', (select to_jsonb(t) from public.training_units t where t.id = u),
    'exercises', coalesce((select jsonb_agg(to_jsonb(e) order by e.seq_index, e.id)
                           from public.training_exercises e where e.unit_id = u), '[]'::jsonb),
    'epoch', coalesce((select ep.epoch from public.training_document_epochs ep where ep.unit_id = u), 0));
$$;

create or replace function public.td_payload(r jsonb)
returns text language sql immutable set search_path to '' as $$ select md5(r::text) $$;

create or replace function public.td_discipline(k text, o uuid)
returns void language plpgsql stable set search_path to '' as $$
begin
  if k is null or length(btrim(k)) not between 1 and 100 then raise exception 'INVALID_DISCIPLINE'; end if;
end $$;

create or replace function public.training_exercise_identity_v1(p_action text, p_request jsonb)
returns jsonb language plpgsql set search_path to '' as $$
begin raise exception 'NOT_RECONSTRUCTED_LOCALLY'; end $$;

create or replace function public.training_focus_v1(p_action text, p_request jsonb)
returns jsonb language plpgsql set search_path to '' as $$
begin raise exception 'NOT_RECONSTRUCTED_LOCALLY'; end $$;

revoke all on function public.td_request(jsonb, text[]), public.td_snapshot(uuid), public.td_payload(jsonb),
  public.td_discipline(text, uuid) from public, anon, authenticated;
