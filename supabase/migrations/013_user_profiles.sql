-- Migration 013: user_profiles table
-- Stores per-user profile information (display name, phone, mobile, notes).
-- Separate from auth.users so it can be extended without touching Supabase Auth.

CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id     uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  phone       text,
  mobile      text,
  notes       text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Keep updated_at current automatically.
-- Reuses the existing update_updated_at() function defined in schema.sql /
-- migration 001 so we don't create a duplicate trigger function.
DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS: each user can only read and write their own row
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_profiles_select_own" ON public.user_profiles;
CREATE POLICY "user_profiles_select_own"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_profiles_insert_own" ON public.user_profiles;
CREATE POLICY "user_profiles_insert_own"
  ON public.user_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_profiles_update_own" ON public.user_profiles;
CREATE POLICY "user_profiles_update_own"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = user_id);
