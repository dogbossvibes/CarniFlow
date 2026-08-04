-- ANYVO: fix the shared_trainings.training_id foreign key target.
--
-- Problem:
--   The app persists trainings in public.training_sessions (services/training.ts),
--   but shared_trainings.training_id still references the legacy public.trainings
--   table. Sharing a training_sessions row therefore violates the foreign key
--   (SQLSTATE 23503) and the share link can never be created — the ShareSheet
--   only ever shows "Link no nöd parat".
--
-- Fix:
--   Re-point the FK to public.training_sessions, the table the app actually uses.
--
-- Safety:
--   Corrective, additive migration. Apply ONLY via the Supabase migration workflow.
--   Do NOT run from the mobile client and do NOT run remotely from this environment.
--   The new constraint is added NOT VALID so any pre-existing legacy rows (that still
--   reference the old public.trainings table) are not re-checked and nothing is
--   deleted. The constraint is still fully enforced for all NEW inserts, which is
--   exactly what unblocks the sharing flow. Once any legacy rows are cleaned up, run
--   `alter table public.shared_trainings validate constraint shared_trainings_training_id_fkey;`.

alter table public.shared_trainings
  drop constraint if exists shared_trainings_training_id_fkey;

alter table public.shared_trainings
  add constraint shared_trainings_training_id_fkey
  foreign key (training_id) references public.training_sessions(id) on delete cascade
  not valid;
