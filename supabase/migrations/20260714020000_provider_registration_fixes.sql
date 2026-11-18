-- MIGRATION: Fixes for gaps flagged after wiring provider registration/discovery to Supabase.
-- Target Platform: PostgreSQL (Supabase / Postgres 15+)
-- Date: 2026-07-14
-- Does not modify any earlier migration file — purely additive columns/trigger/view update.

----------------------------------------------------------------------------------
-- 1. GPS LOCATION: plain lat/lng columns + trigger keeping the PostGIS `location` in sync
----------------------------------------------------------------------------------
-- The client can't reliably construct WKT/GeoJSON for the geometry(Point,4326) `location` column,
-- so it writes plain numeric latitude/longitude instead, and this trigger derives `location` from
-- them server-side on every insert/update.
ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS latitude NUMERIC,
  ADD COLUMN IF NOT EXISTS longitude NUMERIC;

CREATE OR REPLACE FUNCTION public.sync_service_provider_location()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_service_provider_location ON public.service_providers;

CREATE TRIGGER trg_sync_service_provider_location
  BEFORE INSERT OR UPDATE ON public.service_providers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_service_provider_location();

----------------------------------------------------------------------------------
-- 2. RATE UNIT + LANGUAGES
----------------------------------------------------------------------------------
ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS rate_unit TEXT,
  ADD COLUMN IF NOT EXISTS languages TEXT[] NOT NULL DEFAULT '{}';

----------------------------------------------------------------------------------
-- 3. REJECTION REASON
----------------------------------------------------------------------------------
ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- FLAG FOR REVIEW (not fixed here, out of this migration's scope): the existing "Providers can
-- update their own entry" policy is `FOR UPDATE USING (auth.uid() = user_id)` with no column
-- restriction, so RLS alone doesn't stop a provider from writing to their own is_verified,
-- verification_status, or (now) rejection_reason columns directly. Locking that down would need
-- either a BEFORE UPDATE trigger that rejects changes to those columns from non-admins, or
-- splitting them into an admin-only table. Worth a follow-up migration.

----------------------------------------------------------------------------------
-- 4. PROVIDER_SERVICES SUBCATEGORY
----------------------------------------------------------------------------------
ALTER TABLE public.provider_services
  ADD COLUMN IF NOT EXISTS subcategory TEXT;

----------------------------------------------------------------------------------
-- 5. PUBLIC_PROVIDER_CARDS VIEW — extended with rate_unit + languages
----------------------------------------------------------------------------------
-- Re-declares the view (see 20260714010000_provider_discovery_updates.sql for the prior version)
-- to also expose the two new public-safe columns so browse/search cards stop defaulting them.
--
-- Uses DROP + CREATE rather than CREATE OR REPLACE: this version inserts rate_unit/languages
-- before is_verified, which existed at an earlier position in 20260714010000's view — Postgres's
-- CREATE OR REPLACE VIEW only allows appending trailing columns, not inserting/reordering existing
-- ones, and would reject this the same way it rejected 20260714010000's own replace attempt.
DROP VIEW IF EXISTS public.public_provider_cards;

CREATE VIEW public.public_provider_cards AS
SELECT
    sp.user_id AS provider_id,
    p.full_name AS provider_name,
    sp.business_name,
    sp.description_fr,
    sp.description_en,
    sp.banner_url,
    sp.city,
    sp.neighborhood_id,
    sp.has_fixed_pricing,
    sp.base_price,
    sp.currency,
    sp.rate_unit,
    sp.languages,
    sp.is_verified,
    COALESCE(rt.average_rating, 5.0) AS average_rating,
    COALESCE(rt.review_count, 0) AS review_count,
    COALESCE(cat.category_slugs, ARRAY[]::TEXT[]) AS category_slugs
FROM public.service_providers sp
JOIN public.profiles p ON p.id = sp.user_id
LEFT JOIN (
    SELECT provider_id, AVG(stars) AS average_rating, COUNT(*) AS review_count
    FROM public.ratings
    GROUP BY provider_id
) rt ON rt.provider_id = sp.user_id
LEFT JOIN (
    SELECT ps.provider_id, array_agg(DISTINCT sc.slug) FILTER (WHERE sc.slug IS NOT NULL) AS category_slugs
    FROM public.provider_services ps
    JOIN public.service_categories sc ON sc.id = ps.category_id
    GROUP BY ps.provider_id
) cat ON cat.provider_id = sp.user_id
WHERE sp.is_verified = TRUE OR sp.verification_status = 'approved';

GRANT SELECT ON public.public_provider_cards TO anon, authenticated;
