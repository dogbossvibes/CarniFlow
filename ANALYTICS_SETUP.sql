-- ============================================================
-- CANISFLOW — Analytics System Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Extend training_sessions with metric columns
ALTER TABLE training_sessions
  ADD COLUMN IF NOT EXISTS motivation      smallint CHECK (motivation      BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS konzentration   smallint CHECK (konzentration   BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS praezision      smallint CHECK (praezision      BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS ausdauer        smallint CHECK (ausdauer        BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS trieblage       smallint CHECK (trieblage       BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS impulskontrolle smallint CHECK (impulskontrolle BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS belastung       smallint CHECK (belastung       BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS ort             text,
  ADD COLUMN IF NOT EXISTS wetter          text;

-- 2. Training Analysis table (generated after each session)
CREATE TABLE IF NOT EXISTS training_analysis (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id       uuid REFERENCES training_sessions(id) ON DELETE CASCADE NOT NULL,
  user_id          uuid REFERENCES auth.users(id)        ON DELETE CASCADE NOT NULL,
  dog_id           uuid REFERENCES dogs(id)              ON DELETE CASCADE NOT NULL,
  gesamtscore      numeric(5,2),
  zusammenfassung  text,
  positives        text[]  DEFAULT '{}',
  schwaechen       text[]  DEFAULT '{}',
  empfehlungen     text[]  DEFAULT '{}',
  coach_message    text,
  created_at       timestamptz DEFAULT now()
);

-- 3. Training Recommendations table (persistent per dog)
CREATE TABLE IF NOT EXISTS training_recommendations (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  dog_id        uuid REFERENCES dogs(id)       ON DELETE CASCADE NOT NULL,
  typ           text NOT NULL,   -- 'fokus' | 'warnung' | 'tipp'
  titel         text NOT NULL,
  beschreibung  text NOT NULL,
  prioritaet    smallint DEFAULT 1,
  aktiv         boolean  DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- 4. RLS Policies
ALTER TABLE training_analysis        ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_analysis"         ON training_analysis;
DROP POLICY IF EXISTS "own_recommendations"  ON training_recommendations;

CREATE POLICY "own_analysis"
  ON training_analysis FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "own_recommendations"
  ON training_recommendations FOR ALL
  USING (auth.uid() = user_id);

-- 5. Index for fast trend queries
CREATE INDEX IF NOT EXISTS idx_training_sessions_dog_date
  ON training_sessions(dog_id, session_date DESC);

CREATE INDEX IF NOT EXISTS idx_training_analysis_dog
  ON training_analysis(dog_id, created_at DESC);
