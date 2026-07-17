-- MIGRATION: Fix "null value in column 'role_confirmed' of relation 'profiles' violates not-null
-- constraint" — firing on every Google OAuth sign-in, confirmed via Supabase's Postgres logs.
-- Target Platform: PostgreSQL (Supabase / Postgres 15+)
-- Date: 2026-07-25
-- Does not modify any earlier migration file, does not touch the role_confirmed column's type or
-- constraint (both were already correct) — only replaces handle_new_user()'s function body.
--
-- ROOT CAUSE: 20260724000000_google_oauth_role_confirmation.sql computed role_confirmed as
-- `requested_role IN ('client', 'provider')`, where requested_role := NEW.raw_user_meta_data ->>
-- 'role'. For email+password signup, raw_user_meta_data genuinely has a 'role' key (our own
-- signUp() call supplies it), so requested_role is a real string and the IN check returns a real
-- boolean. For Google OAuth, raw_user_meta_data has NO 'role' key at all (Google's OIDC claims
-- don't know about our client/provider distinction) — Postgres's ->> operator returns SQL NULL,
-- not an empty string, when a JSONB key is absent. That makes requested_role NULL, and
-- `NULL IN ('client', 'provider')` evaluates to NULL, not FALSE, under SQL's three-valued logic
-- (NULL = 'client' is "unknown", not "false", and NULL OR NULL is still NULL). That NULL was then
-- inserted as an EXPLICIT value for role_confirmed — which does NOT fall back to the column's
-- DEFAULT TRUE (defaults only apply when a column is omitted from the INSERT entirely, never when
-- a value, including NULL, is explicitly supplied) — violating the NOT NULL constraint and rolling
-- back the entire auth.users insert for every single Google sign-in.
--
-- FIX: compute role_confirmed from `raw_user_meta_data ? 'role'` — the JSONB "key exists" operator
-- — instead of comparing the (possibly-null) dereferenced value. `?` always returns a genuine
-- boolean (TRUE/FALSE), never NULL, for a non-null jsonb operand; the object itself is additionally
-- guarded with COALESCE(..., '{}'::jsonb) in case it's ever null. A second COALESCE(..., FALSE) is
-- then applied directly in the INSERT's VALUES list as a defensive backstop, so even if some future
-- edit to this function reintroduces a NULL-producing expression, the column fails safe to FALSE
-- (shows the one-time role-confirmation screen) instead of erupting into a hard constraint error
-- that blocks sign-in entirely.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_role TEXT;
  safe_role public.user_role;
  role_key_present BOOLEAN;
BEGIN
  requested_role := NEW.raw_user_meta_data ->> 'role';
  IF requested_role IN ('client', 'provider') THEN
    safe_role := requested_role::public.user_role;
  ELSE
    safe_role := 'client';
  END IF;

  -- Key-existence check, not a value comparison: this is what actually distinguishes "our signup
  -- form supplied role metadata" (email+password) from "no such metadata exists at all"
  -- (Google/OAuth/any future provider) without ever risking NULL. COALESCE'd jsonb operand means
  -- this is TRUE or FALSE even if raw_user_meta_data itself were somehow null.
  role_key_present := (COALESCE(NEW.raw_user_meta_data, '{}'::jsonb) ? 'role');

  INSERT INTO public.profiles (id, role, full_name, phone, preferred_language, role_confirmed)
  VALUES (
    NEW.id,
    safe_role,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', ''),
    NEW.raw_user_meta_data ->> 'phone',
    COALESCE(NEW.raw_user_meta_data ->> 'preferred_language', 'fr'),
    -- Defensive backstop, independent of role_key_present's own correctness above: this column can
    -- now never receive NULL again, regardless of any future edit to the logic that feeds it.
    COALESCE(role_key_present, FALSE)
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Trigger itself is unchanged (still AFTER INSERT ON auth.users, still fires for every provider) —
-- re-asserted here only so this migration remains self-contained/idempotent on its own.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
