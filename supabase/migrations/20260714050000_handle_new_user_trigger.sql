-- MIGRATION: handle_new_user() — SECURITY DEFINER trigger that creates a profiles row on signup.
-- Target Platform: PostgreSQL (Supabase / Postgres 15+)
-- Date: 2026-07-14
-- Does not modify any earlier migration file.
--
-- ROOT CAUSE OF "new row violates row-level security policy for table profiles": the client-side
-- fallback in src/lib/supabase.ts (ensureProfile) was doing a `.from("profiles").insert(...)` when
-- no row was found. That insert runs as the newly-authenticated user's own session, so it is fully
-- subject to RLS — exactly what threw this error. That client-side insert has now been removed
-- entirely (see src/lib/supabase.ts). Profile creation is handled ONLY by this SECURITY DEFINER
-- trigger from now on, which bypasses RLS entirely and is unaffected by future RLS policy changes.
--
-- This migration is self-contained and re-declares handle_new_user() and its trigger from scratch
-- (CREATE OR REPLACE / DROP+CREATE TRIGGER are idempotent), so running it is enough on its own —
-- you do not need to also re-run 20260714000000 or 20260714040000's copies of this same function.
--
-- signUp() in src/lib/supabase.ts calls supabase.auth.signUp() with:
--   options.data = {
--     full_name: params.fullName,
--     phone: params.phone || null,
--     role: params.role,                 -- "client" | "provider" (never "admin" from signup)
--     preferred_language: params.preferredLanguage,
--   }
-- Supabase Auth stores that object as auth.users.raw_user_meta_data. The trigger below reads it
-- back out with the exact same key names.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_role TEXT;
  safe_role public.user_role;
BEGIN
  -- Sanitize the role: only 'client'/'provider' can come from self-signup. Anything else
  -- (including a crafted 'admin') is coerced to 'client' — admin accounts can only be created
  -- directly in the database, never through this trigger.
  requested_role := NEW.raw_user_meta_data ->> 'role';
  IF requested_role IN ('client', 'provider') THEN
    safe_role := requested_role::public.user_role;
  ELSE
    safe_role := 'client';
  END IF;

  INSERT INTO public.profiles (id, role, full_name, phone, preferred_language)
  VALUES (
    NEW.id,
    safe_role,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.raw_user_meta_data ->> 'phone',
    COALESCE(NEW.raw_user_meta_data ->> 'preferred_language', 'fr')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

----------------------------------------------------------------------------------
-- CONFIRM: existing SELECT/UPDATE policies on profiles (unchanged, just verifying they exist)
----------------------------------------------------------------------------------
-- These were created in 20260709000000_init_schema.sql and are NOT modified here — reproduced
-- below only as documentation so you can diff them against what's actually in your database:
--
--   CREATE POLICY "Public profiles are readable by everyone" ON public.profiles
--       FOR SELECT USING (true);
--
--   CREATE POLICY "Users can update their own profile" ON public.profiles
--       FOR UPDATE USING (auth.uid() = id);
--
-- Both are separate from INSERT and are untouched by this migration. If either is missing from
-- your live database, run this to restore them (safe to run even if they already exist):
DROP POLICY IF EXISTS "Public profiles are readable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are readable by everyone" ON public.profiles
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

----------------------------------------------------------------------------------
-- CLEANUP: drop the now-unused client-side-insert fallback policy
----------------------------------------------------------------------------------
-- 20260714040000_reinforce_profile_creation.sql added an INSERT policy solely to support the
-- client-side fallback insert in ensureProfile(). That insert is now removed from the codebase, so
-- this policy is dead weight — harmless (still scoped to own row + non-admin role only) but no
-- longer serves any code path, and this is the safest place to retire it now that everything runs
-- through the SECURITY DEFINER trigger above instead.
DROP POLICY IF EXISTS "Users can insert their own non-admin profile" ON public.profiles;
