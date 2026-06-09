-- ANYVO — Phase D: Trainer-Feedback an Kunden-Einheiten (Kommentar/Sprach/Video)
-- NACH CAPABILITY_MODEL_SETUP.sql + VISIBILITY_POLICIES.sql ausführen. Idempotent.

-- Ein verbundener Trainer (view_trainings) darf Kommentare an sichtbaren
-- Kunden-Einheiten anlegen. Kombiniert per OR mit bestehenden Insert-Policies.
drop policy if exists "trainer comments on client trainings" on public.training_comments;
create policy "trainer comments on client trainings" on public.training_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.training_units u
      where u.id = unit_id and public.can_view(auth.uid(), u.owner_id, 'view_trainings')
    )
  );
