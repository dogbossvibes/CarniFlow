-- ANYVO — Sprachmemos (voice_notes). Idempotent, additiv.
-- Verknüpft mit Track-Session (training_sessions) ODER Einheit (training_units),
-- optional mit Marker. Audio liegt im bestehenden media-audio-Bucket.
create table if not exists public.voice_notes (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  training_session_id uuid references public.training_sessions(id) on delete cascade,
  training_unit_id    uuid references public.training_units(id) on delete cascade,
  dog_id              uuid references public.dogs(id) on delete set null,
  marker_id           uuid,
  coach_feedback_id   uuid,
  context             text not null check (context in (
                        'training_note','exercise_note','track_marker','coach_feedback','general_note')),
  audio_url           text not null,
  duration_seconds    integer,
  transcript          text,
  transcript_status   text default 'pending' check (transcript_status in (
                        'pending','processing','completed','failed','disabled')),
  metadata            jsonb default '{}'::jsonb,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create index if not exists voice_notes_user_idx    on public.voice_notes (user_id);
create index if not exists voice_notes_session_idx on public.voice_notes (training_session_id);
create index if not exists voice_notes_unit_idx    on public.voice_notes (training_unit_id);

drop trigger if exists trg_voice_notes_updated_at on public.voice_notes;
create trigger trg_voice_notes_updated_at
  before update on public.voice_notes
  for each row execute function public.set_updated_at();

alter table public.voice_notes enable row level security;

drop policy if exists "own voice_notes select" on public.voice_notes;
create policy "own voice_notes select" on public.voice_notes
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "own voice_notes insert" on public.voice_notes;
create policy "own voice_notes insert" on public.voice_notes
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "own voice_notes update" on public.voice_notes;
create policy "own voice_notes update" on public.voice_notes
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own voice_notes delete" on public.voice_notes;
create policy "own voice_notes delete" on public.voice_notes
  for delete to authenticated using (user_id = auth.uid());

-- Trainer-Lesezugriff über bestehendes Connections-/Capability-Modell
-- (can_view prüft akzeptierte Verbindung + view_trainings). Greift nur, wenn
-- can_view existiert. KEIN coach_relationships/visibility (existiert hier nicht).
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname='public' and p.proname='can_view') then
    execute $p$
      drop policy if exists "trainer views client voice_notes" on public.voice_notes;
      create policy "trainer views client voice_notes" on public.voice_notes
        for select to authenticated
        using (public.can_view(auth.uid(), user_id, 'view_trainings'));
    $p$;
  end if;
end $$;
