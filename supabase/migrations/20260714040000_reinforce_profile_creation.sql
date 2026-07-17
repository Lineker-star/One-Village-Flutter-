-- MIGRATION: Reinforce profiles-row creation on signup.
-- Target Platform: PostgreSQL (Supabase / Postgres 15+)
-- Date: 2026-07-14
-- Does not modify any earlier migration file.
--
-- ROOT CAUSE: profiles was ending up empty after signups. handle_new_user() and its trigger on
-- auth.users (20260714000000_auth_profile_trigger.sql) were reviewed and are logically correct —
-- SECURITY DEFINER, correct search_path, correct column list, ON CONFLICT DO NOTHING. The far more
-- likely explanation is that this migration (like the others written in this project) was never
-- actually applied to the connected Supabase project — every attempt to run these migrations from
-- this environment has been blocked by a lack of a service-role key / DB password / linked Supabase
-- CLI (flagged repeatedly in prior steps). A trigger that was never created cannot fire, which
-- matches the symptom exactly: auth.users gets a row (Supabase Auth itself doesn't depend on this
-- trigger), profiles doesn't.
--
-- THIS MIGRATION MUST ACTUALLY BE APPLIED (SQL Editor or `supabase db push`) FOR THE FIX TO TAKE
-- EFFECT — re-writing the trigger in a migration file that also never gets run would reproduce the
-- exact same bug.
--
-- Two things done here:
--   1. Re-assert handle_new_user() and its trigger (byte-for-byte the same logic as
--      20260714000000) — idempotent, harmless if it was already applied, and the actual fix if it
--      wasn't.
--   2. Add a narrowly-scoped INSERT policy on profiles so the client-side fallback in
--      src/lib/supabase.ts's ensureProfile() has a legal path to create its own row if the trigger
--      ever fails to fire again in the future (RLS still blocks inserting for anyone else, or with
--      role = 'admin' — self-promotion stays impossible).

----------------------------------------------------------------------------------
-- 1. RE-ASSERT handle_new_user() TRIGGER
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
-- 2. NEW POLICY: safe client-side fallback insert
----------------------------------------------------------------------------------
-- FLAG FOR REVIEW: this is a new INSERT policy on public.profiles (there was deliberately none
-- before — see 20260714000000's comments on why a trigger was chosen over a client-side insert).
-- It's scoped tightly enough to preserve that reasoning: a user may only insert a row for their own
-- auth.uid(), and only with role client/provider — never 'admin'. This exists purely as a backstop
-- for ensureProfile() in src/lib/supabase.ts; the trigger above remains the primary mechanism.
CREATE POLICY "Users can insert their own non-admin profile" ON public.profiles
    FOR INSERT WITH CHECK (
        auth.uid() = id
        AND role IN ('client', 'provider')
    );
