-- MIGRATION: Wire real Supabase bookings — completion-confirmation columns, status-transition
-- rules, self-booking guard, and RLS covering client/provider/admin access.
-- Target Platform: PostgreSQL (Supabase / Postgres 15+)
-- Date: 2026-07-15
-- Does not modify any earlier migration file — the `bookings` table itself was created in
-- 20260709000000_init_schema.sql.
--
-- CONTEXT: BookingModal now inserts directly into `bookings` via the Supabase client instead of
-- the old /api/bookings in-memory endpoint, and the client/provider dashboards read and update
-- real rows. This migration adds what that flow needs: two-sided completion confirmation columns,
-- a guard against a provider booking their own profile, and a trigger enforcing exactly which
-- columns each side (client / provider / admin) may change and which status transitions are legal
-- — RLS alone is row-level and can't express "the client may only flip their own confirmation
-- flag" or "a provider can move requested -> accepted but not requested -> completed".

----------------------------------------------------------------------------------
-- 1. NEW COLUMNS: two-sided completion confirmation
----------------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS client_confirmed_complete BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS provider_confirmed_complete BOOLEAN NOT NULL DEFAULT FALSE;

----------------------------------------------------------------------------------
-- 2. SELF-BOOKING GUARD
----------------------------------------------------------------------------------
-- A provider account can never book their own provider profile, whether or not client_id happens
-- to also carry the 'provider' role. Enforced as a hard table constraint (not just RLS) so it
-- holds regardless of which policy path an insert goes through.
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_client_not_provider CHECK (client_id <> provider_id);

----------------------------------------------------------------------------------
-- 3. TRIGGER FUNCTION: enforce who may change which columns, and which status
--    transitions are legal.
----------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_booking_update_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin BOOLEAN;
  is_client BOOLEAN;
  is_provider BOOLEAN;
BEGIN
  SELECT (profiles.role = 'admin') INTO is_admin FROM public.profiles WHERE profiles.id = auth.uid();
  is_client := (auth.uid() = OLD.client_id);
  is_provider := (auth.uid() = OLD.provider_id);

  -- Admins (dispute intervention) may change anything on any booking.
  IF is_admin THEN
    RETURN NEW;
  END IF;

  IF NOT is_client AND NOT is_provider THEN
    RAISE EXCEPTION 'Only the client, the provider, or an admin may update this booking.'
      USING ERRCODE = '42501';
  END IF;

  -- Immutable end states: nobody but an admin can touch a finished/cancelled booking.
  IF OLD.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'This booking is already % and can no longer be modified.', OLD.status
      USING ERRCODE = '42501';
  END IF;

  -- Booking terms (who/what/when/how much) are set at creation and are admin-only to change
  -- afterwards — neither party can quietly alter price, schedule, or re-target the booking.
  IF NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
     OR NEW.category_id IS DISTINCT FROM OLD.category_id
     OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
     OR NEW.agreed_price IS DISTINCT FROM OLD.agreed_price
     OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
     OR NEW.description IS DISTINCT FROM OLD.description
  THEN
    RAISE EXCEPTION 'Only an admin can change booking terms after creation.'
      USING ERRCODE = '42501';
  END IF;

  IF is_client THEN
    IF NEW.provider_confirmed_complete IS DISTINCT FROM OLD.provider_confirmed_complete THEN
      RAISE EXCEPTION 'Clients cannot set the provider completion flag.'
        USING ERRCODE = '42501';
    END IF;
    -- The only status change a client may make directly is accepted -> in_progress; every other
    -- transition (accept/cancel/complete) belongs to the provider or is server-computed below.
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'accepted' AND NEW.status = 'in_progress') THEN
      RAISE EXCEPTION 'Clients can only move a booking from accepted to in_progress; all other status changes are provider- or admin-only.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.client_confirmed_complete AND OLD.status NOT IN ('accepted', 'in_progress') THEN
      RAISE EXCEPTION 'Completion can only be confirmed once the booking has been accepted.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF is_provider THEN
    IF NEW.client_confirmed_complete IS DISTINCT FROM OLD.client_confirmed_complete THEN
      RAISE EXCEPTION 'Providers cannot set the client completion flag.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        (OLD.status = 'requested' AND NEW.status IN ('accepted', 'cancelled'))
        OR (OLD.status = 'accepted' AND NEW.status IN ('in_progress', 'cancelled'))
      ) THEN
        RAISE EXCEPTION 'Illegal status transition for a provider: % -> %', OLD.status, NEW.status
          USING ERRCODE = '42501';
      END IF;
    END IF;
    IF NEW.provider_confirmed_complete AND OLD.status NOT IN ('accepted', 'in_progress') THEN
      RAISE EXCEPTION 'Completion can only be confirmed once the booking has been accepted.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Server-computed: status only ever flips to 'completed' once BOTH sides have confirmed — never
  -- settable directly by either party, regardless of who triggered this particular update.
  IF NEW.client_confirmed_complete AND NEW.provider_confirmed_complete THEN
    NEW.status := 'completed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_booking_update_rules ON public.bookings;

CREATE TRIGGER trg_enforce_booking_update_rules
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_booking_update_rules();

----------------------------------------------------------------------------------
-- 4. RLS — re-declare INSERT/UPDATE policies, add admin SELECT
----------------------------------------------------------------------------------
-- The existing "Clients can read their own bookings" / "Providers can read bookings assigned to
-- them" SELECT policies (20260709000000) already guarantee neither party can see a booking that
-- isn't theirs — left untouched. Admins currently have no SELECT access at all (they aren't
-- necessarily client_id or provider_id on a row), which is added here.
CREATE POLICY "Admins can read all bookings" ON public.bookings
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- INSERT: tightened so a booking can only be created against a currently-approved provider. The
-- client_id = auth.uid() check prevents booking on someone else's behalf; the self-booking check
-- is handled by the CHECK constraint above regardless of policy path.
DROP POLICY IF EXISTS "Clients can insert their own bookings" ON public.bookings;

CREATE POLICY "Clients can insert bookings for approved providers" ON public.bookings
    FOR INSERT WITH CHECK (
        auth.uid() = client_id
        AND EXISTS (
            SELECT 1 FROM public.service_providers sp
            WHERE sp.user_id = provider_id AND sp.verification_status = 'approved'
        )
    );

-- UPDATE: row-level gate widened to admins (the trigger above enforces the actual column/status
-- rules on top of this).
DROP POLICY IF EXISTS "Involved parties can update bookings" ON public.bookings;

CREATE POLICY "Involved parties or admins can update bookings" ON public.bookings
    FOR UPDATE USING (
        auth.uid() = client_id
        OR auth.uid() = provider_id
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );
