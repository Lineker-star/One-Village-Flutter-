-- MIGRATION: Column-level protection for service_providers verification fields.
-- Target Platform: PostgreSQL (Supabase / Postgres 15+)
-- Date: 2026-07-14
-- Does not modify any earlier migration file.
--
-- GAP BEING FIXED: RLS is row-level, not column-level. The existing "Providers can update their
-- own entry" policy (FOR UPDATE USING (auth.uid() = user_id)) lets a provider update ANY column on
-- their own row — including is_verified, verification_status, and rejection_reason — completely
-- bypassing the admin approval flow. A BEFORE UPDATE trigger is required to actually restrict which
-- COLUMNS can change, since RLS policies alone cannot express that.

----------------------------------------------------------------------------------
-- 1. TRIGGER FUNCTION: block changes to verification columns unless the caller is an admin
----------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_service_provider_verification_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin BOOLEAN;
BEGIN
  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
     OR NEW.verification_status IS DISTINCT FROM OLD.verification_status
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
  THEN
    SELECT (profiles.role = 'admin') INTO is_admin
    FROM public.profiles
    WHERE profiles.id = auth.uid();

    IF is_admin IS NOT TRUE THEN
      RAISE EXCEPTION 'Only admins can change verification status, is_verified, or rejection_reason.'
        USING ERRCODE = '42501'; -- insufficient_privilege
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_service_provider_verification_columns ON public.service_providers;

CREATE TRIGGER trg_protect_service_provider_verification_columns
  BEFORE UPDATE ON public.service_providers
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_service_provider_verification_columns();

----------------------------------------------------------------------------------
-- 2. RE-DECLARE THE "OWN ROW" UPDATE POLICY
----------------------------------------------------------------------------------
-- The row-level condition itself doesn't need to change (a provider should still be able to
-- update their own row's non-verification columns, e.g. business_name/description/pricing) — the
-- trigger above is what now actually enforces the verification-column restriction. Re-declaring it
-- here (drop + recreate, identical definition) so this migration is the single source of truth for
-- the fix, per the request not to edit the migration that originally created it.
DROP POLICY IF EXISTS "Providers can update their own entry" ON public.service_providers;

CREATE POLICY "Providers can update their own entry" ON public.service_providers
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Note: the "Admins can update any service provider" policy from 20260714010000 is unaffected and
-- still grants admins row-level access to any row; the trigger above is what lets their writes to
-- the three protected columns actually go through (profiles.role = 'admin' for their auth.uid()).
