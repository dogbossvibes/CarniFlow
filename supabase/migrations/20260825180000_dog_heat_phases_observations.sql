-- Dog Heat Phases & Observations
-- Adds separate tables for phases and observations within a heat cycle.
-- Also adds a `status` column to the existing `dog_heat_cycles` table.
-- Phases are sub-records of dog_heat_cycles; each heat cycle owns its phases.
-- Observations are flexible, date-stamped records within a heat cycle.
-- RLS: owner only (same pattern as dog_heat_cycles).

-- ── Extend existing table ───────────────────────────────────────────────────
-- Add status column if not present (backward compatible)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dog_heat_cycles' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.dog_heat_cycles
      ADD COLUMN status text NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'completed'));
  END IF;
END $$;

-- Backfill: existing cycles with an end_date are completed, not active.
UPDATE public.dog_heat_cycles
SET status = 'completed'
WHERE end_date IS NOT NULL
  AND status = 'active';

-- ── Phases ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dog_heat_phases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dog_id        uuid NOT NULL REFERENCES public.dogs(id) ON DELETE CASCADE,
  heat_cycle_id uuid NOT NULL REFERENCES public.dog_heat_cycles(id) ON DELETE CASCADE,
  phase_type    text NOT NULL,
  start_date    date NOT NULL,
  end_date      date,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dog_heat_phases_cycle ON public.dog_heat_phases (heat_cycle_id, start_date ASC);

-- ── Observations ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dog_heat_observations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dog_id        uuid NOT NULL REFERENCES public.dogs(id) ON DELETE CASCADE,
  heat_cycle_id uuid NOT NULL REFERENCES public.dog_heat_cycles(id) ON DELETE CASCADE,
  date          date NOT NULL,
  type          text NOT NULL,
  value         text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dog_heat_obs_cycle ON public.dog_heat_observations (heat_cycle_id, date ASC);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.dog_heat_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dog_heat_observations ENABLE ROW LEVEL SECURITY;

-- Phases: owner full access, connected trainer read
CREATE POLICY "hp_select" ON public.dog_heat_phases FOR SELECT USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.connections c
    WHERE c.owner_user_id = dog_heat_phases.owner_id
      AND c.connected_user_id = auth.uid()
      AND c.status = 'accepted'
  )
);
CREATE POLICY "hp_insert" ON public.dog_heat_phases FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "hp_update" ON public.dog_heat_phases FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "hp_delete" ON public.dog_heat_phases FOR DELETE USING (owner_id = auth.uid());

-- Observations: owner full access, connected trainer read
CREATE POLICY "ho_select" ON public.dog_heat_observations FOR SELECT USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.connections c
    WHERE c.owner_user_id = dog_heat_observations.owner_id
      AND c.connected_user_id = auth.uid()
      AND c.status = 'accepted'
  )
);
CREATE POLICY "ho_insert" ON public.dog_heat_observations FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "ho_update" ON public.dog_heat_observations FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "ho_delete" ON public.dog_heat_observations FOR DELETE USING (owner_id = auth.uid());
