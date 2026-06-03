-- ============================================================
-- Canisflow — Media Setup
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Add image_urls column to training_sessions
ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';

-- 2. Add missing media columns if not already present
ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS video_url TEXT;

ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS audio_urls TEXT[] DEFAULT '{}';

ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS title TEXT;

ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS training_type TEXT DEFAULT 'privat'
    CHECK (training_type IN ('privat', 'trainer'));

ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS trainer_name TEXT;

-- 3. Create training-photos storage bucket (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('training-photos', 'training-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Storage RLS policies for training-photos
DO $$
BEGIN
  -- Upload: authenticated users can upload to own folder
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'training-photos: upload own'
  ) THEN
    CREATE POLICY "training-photos: upload own"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'training-photos'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;

  -- Read: public access
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'training-photos: public read'
  ) THEN
    CREATE POLICY "training-photos: public read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'training-photos');
  END IF;

  -- Delete: authenticated users can delete own files
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'training-photos: delete own'
  ) THEN
    CREATE POLICY "training-photos: delete own"
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'training-photos'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;

  -- Update: authenticated users can update own files
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'training-photos: update own'
  ) THEN
    CREATE POLICY "training-photos: update own"
      ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'training-photos'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;
END
$$;
