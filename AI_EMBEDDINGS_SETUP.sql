-- ANYVO — KI-/Semantik-System (pgvector). Idempotent, in dieser Reihenfolge ausführen.
-- Konvention wie die übrigen *_SETUP.sql: im Supabase SQL-Editor ausführen.
--
-- DIMENSION: Default = 384 (Supabase Edge "gte-small", KEIN externer API-Key nötig).
-- Wird stattdessen OpenAI text-embedding-3-small genutzt → überall vector(384) auf
-- vector(1536) ändern (Tabelle + RPC + Index). NICHT mischen: alle Embeddings müssen
-- aus demselben Modell stammen, sonst ist die Ähnlichkeit bedeutungslos.

-- ════════════════════════════════════════════════════════════
-- 1 · EXTENSION
-- ════════════════════════════════════════════════════════════
create extension if not exists vector;

-- ════════════════════════════════════════════════════════════
-- 2 · TABELLE training_embeddings
-- ════════════════════════════════════════════════════════════
create table if not exists public.training_embeddings (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  -- Verknüpfung zur (Track-/Legacy-)Trainingseinheit; Unit-Inhalte nutzen source_id.
  training_session_id uuid references public.training_sessions(id) on delete cascade,
  source_type         text not null check (source_type in (
                        'training_notes','exercise_notes','coach_feedback',
                        'voice_transcript','media_description','track_summary')),
  source_id           uuid,
  content             text not null,
  content_summary     text,
  embedding           vector(384),
  metadata            jsonb default '{}'::jsonb,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- Doppelte Embeddings für dieselbe Quelle vermeiden (Re-Embedding = Update).
create unique index if not exists training_embeddings_source_uidx
  on public.training_embeddings (user_id, source_type, source_id)
  where source_id is not null;

-- ════════════════════════════════════════════════════════════
-- 3 · INDEXE
-- ════════════════════════════════════════════════════════════
-- Vektor-Index (Cosine). ivfflat braucht Daten für gute Trefferqualität; bei sehr
-- wenigen Zeilen ist seq scan ohnehin schnell. lists=100 ist ein guter Startwert.
create index if not exists training_embeddings_embedding_idx
  on public.training_embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index if not exists training_embeddings_user_id_idx     on public.training_embeddings (user_id);
create index if not exists training_embeddings_session_id_idx  on public.training_embeddings (training_session_id);
create index if not exists training_embeddings_source_type_idx on public.training_embeddings (source_type);

-- ════════════════════════════════════════════════════════════
-- 4 · updated_at-Trigger
-- ════════════════════════════════════════════════════════════
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_training_embeddings_updated_at on public.training_embeddings;
create trigger trg_training_embeddings_updated_at
  before update on public.training_embeddings
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════
-- 5 · RLS
-- ════════════════════════════════════════════════════════════
alter table public.training_embeddings enable row level security;

-- Eigene Embeddings: volle CRUD-Rechte.
drop policy if exists "own embeddings select" on public.training_embeddings;
create policy "own embeddings select" on public.training_embeddings
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "own embeddings insert" on public.training_embeddings;
create policy "own embeddings insert" on public.training_embeddings
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "own embeddings update" on public.training_embeddings;
create policy "own embeddings update" on public.training_embeddings
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own embeddings delete" on public.training_embeddings;
create policy "own embeddings delete" on public.training_embeddings
  for delete to authenticated using (user_id = auth.uid());

-- Trainer:innen dürfen Embeddings verbundener Kund:innen LESEN — über das
-- bestehende Connections-/Capability-Modell (can_view prüft status='accepted'
-- + view_trainings). Greift nur, wenn can_view existiert (Capability-Setup).
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'can_view'
  ) then
    execute $p$
      drop policy if exists "trainer views client embeddings" on public.training_embeddings;
      create policy "trainer views client embeddings" on public.training_embeddings
        for select to authenticated
        using (public.can_view(auth.uid(), user_id, 'view_trainings'));
    $p$;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
-- 6 · RPC: semantische Suche
-- ════════════════════════════════════════════════════════════
-- NICHT security definer → RLS der aufrufenden Person greift. Eine Trainer:in
-- kann mit filter_user_id = Kund:innen-ID suchen; geliefert wird nur, was die
-- RLS-Policy "trainer views client embeddings" zulässt. Kein Datenleck.
create or replace function public.match_training_embeddings(
  query_embedding vector(384),
  match_threshold float,
  match_count int,
  filter_user_id uuid,
  filter_dog_id uuid default null,
  filter_category text default null
)
returns table (
  id uuid,
  training_session_id uuid,
  source_type text,
  content text,
  content_summary text,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    te.id,
    te.training_session_id,
    te.source_type,
    te.content,
    te.content_summary,
    te.metadata,
    1 - (te.embedding <=> query_embedding) as similarity
  from public.training_embeddings te
  where te.user_id = filter_user_id
    and te.embedding is not null
    and 1 - (te.embedding <=> query_embedding) > match_threshold
    and (filter_dog_id is null or te.metadata->>'dog_id' = filter_dog_id::text)
    and (filter_category is null or te.metadata->>'category' = filter_category)
  order by te.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_training_embeddings(vector, float, int, uuid, uuid, text) to authenticated;
