-- MIGRATION: Support Google OAuth sign-in alongside the existing email+password signup, plus a
-- narrow but genuinely serious RLS fix found while auditing this.
-- Target Platform: PostgreSQL (Supabase / Postgres 15+)
-- Date: 2026-07-24
-- Does not modify any earlier migration file, does not touch existing data beyond the new column's
-- default backfill (see below).

----------------------------------------------------------------------------------
-- 1. role_confirmed — distinguishes "role was explicitly chosen at signup" (email+password, where
--    the signup form's client/provider toggle is always passed as metadata) from "role was
--    DEFAULTED by the trigger because no metadata was available" (Google/OAuth — Google has no
--    concept of our client/provider distinction). The app uses this to show a one-time "which are
--    you?" screen to a first-time Google user, without ever showing it again once confirmed, and
--    without ever showing it to an email+password user (whose role was already explicit).
----------------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role_confirmed BOOLEAN NOT NULL DEFAULT TRUE;

----------------------------------------------------------------------------------
-- 2. handle_new_user() — same trigger as 20260714050000, now also setting role_confirmed based on
--    whether role metadata was actually present, and reading full_name OR name (Google's OAuth
--    metadata has historically been observed under either key depending on scope/account type; the
--    original COALESCE only checked full_name).
----------------------------------------------------------------------------------
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
  requested_role := NEW.raw_user_meta_data ->> 'role';
  IF requested_role IN ('client', 'provider') THEN
    safe_role := requested_role::public.user_role;
  ELSE
    safe_role := 'client';
  END IF;

  INSERT INTO public.profiles (id, role, full_name, phone, preferred_language, role_confirmed)
  VALUES (
    NEW.id,
    safe_role,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', ''),
    NEW.raw_user_meta_data ->> 'phone',
    COALESCE(NEW.raw_user_meta_data ->> 'preferred_language', 'fr'),
    requested_role IN ('client', 'provider') -- true only when the signup form actually supplied one
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Trigger itself is unchanged (still AFTER INSERT ON auth.users, still fires for every provider —
-- see the accompanying report for how this was verified) — re-asserted here only because
-- CREATE OR REPLACE above requires the function to already exist with a compatible signature, and
-- for this migration to remain self-contained/idempotent on its own.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

----------------------------------------------------------------------------------
-- 3. SECURITY FIX (found while auditing this, unrelated to Google sign-in itself): the existing
--    "Users can update their own profile" policy (20260709000000_init_schema.sql) has a USING
--    clause but no WITH CHECK — USING alone restricts which ROW a user can touch (their own), but
--    places no restriction on what VALUES they write to it. As written, any authenticated user
--    could currently run `.from('profiles').update({ role: 'admin' }).eq('id', <their own id>)`
--    directly via the client and self-promote to admin. This migration is also what makes the new
--    "confirm your role after Google sign-in" update (client/provider only, see supabaseService.
--    confirmUserRole) safe to run as a plain client-side update in the first place.
----------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id AND role IN ('client', 'provider'));
