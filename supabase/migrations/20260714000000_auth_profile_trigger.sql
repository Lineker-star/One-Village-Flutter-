-- MIGRATION: Auto-create a public.profiles row whenever a new auth.users row is inserted.
-- Target Platform: PostgreSQL (Supabase / Postgres 15+)
-- Date: 2026-07-14

-- WHY A TRIGGER INSTEAD OF A CLIENT-SIDE INSERT:
-- public.profiles only has RLS policies for SELECT (public) and UPDATE (own row) — see
-- 20260709000000_init_schema.sql. There is deliberately no INSERT policy, so an authenticated
-- client can never insert its own profile row directly. Two ways to close that gap:
--   1. Add an INSERT policy such as `WITH CHECK (auth.uid() = id)` and let the client insert
--      the row itself after auth.signUp() succeeds.
--   2. Use a SECURITY DEFINER trigger on auth.users that inserts the row on the server.
-- Option 2 was chosen because:
--   - It guarantees a profile always exists for every auth user, even if the client-side signup
--     flow is interrupted right after auth.signUp() returns but before a manual insert would run.
--   - It gives us one server-side choke point to sanitize the requested role. An INSERT policy
--     checking only `auth.uid() = id` would still let a client pass role: 'admin' in the insert
--     payload and self-promote to admin — the trigger reads the role from signup metadata and
--     coerces anything other than 'client'/'provider' to 'client', so admin accounts can only ever
--     be created directly in the database, never through self-signup.

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
