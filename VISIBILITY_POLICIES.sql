-- ANYVO — Trainings-Sichtbarkeit über Connections (Phase C)
-- NACH CAPABILITY_MODEL_SETUP.sql ausführen. Idempotent.
-- Fügt ZUSÄTZLICHE SELECT-Policies hinzu (kombinieren per OR mit den
-- bestehenden Owner-Policies): ein Trainer (connected_user) darf Daten einer
-- verbundenen Kund:in (owner) sehen, sofern can_view() das Flag bestätigt.

-- ── Trainings ───────────────────────────────────────────────
drop policy if exists "trainer views client trainings" on public.training_units;
create policy "trainer views client trainings" on public.training_units for select to authenticated
  using (public.can_view(auth.uid(), owner_id, 'view_trainings'));

-- Übungen erben die Sichtbarkeit der Einheit.
drop policy if exists "trainer views client exercises" on public.training_exercises;
create policy "trainer views client exercises" on public.training_exercises for select to authenticated
  using (exists (
    select 1 from public.training_units u
    where u.id = unit_id and public.can_view(auth.uid(), u.owner_id, 'view_trainings')
  ));

-- Kommentare an sichtbaren Einheiten.
drop policy if exists "trainer views client comments" on public.training_comments;
create policy "trainer views client comments" on public.training_comments for select to authenticated
  using (exists (
    select 1 from public.training_units u
    where u.id = unit_id and public.can_view(auth.uid(), u.owner_id, 'view_trainings')
  ));

-- ── Hunde ───────────────────────────────────────────────────
drop policy if exists "trainer views client dogs" on public.dogs;
create policy "trainer views client dogs" on public.dogs for select to authenticated
  using (public.can_view(auth.uid(), owner_id, 'view_dogs'));

-- ── Termine ─────────────────────────────────────────────────
drop policy if exists "trainer views client appointments" on public.calendar_events;
create policy "trainer views client appointments" on public.calendar_events for select to authenticated
  using (public.can_view(auth.uid(), owner_id, 'view_appointments'));
