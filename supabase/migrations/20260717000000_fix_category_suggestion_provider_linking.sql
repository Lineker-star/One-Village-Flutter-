-- MIGRATION: Fix the broken provider<->category linking step in the category-suggestion approval
-- flow (root cause of the "MEGA J TECH" case — provider registered under an "Autre / Other"
-- suggestion, the suggestion's category got created, but the provider was never actually linked to
-- it, so it never appears in search/filters).
-- Target Platform: PostgreSQL (Supabase / Postgres 15+)
-- Date: 2026-07-17
-- Does not modify any earlier migration file.
--
-- ROOT CAUSE: supabaseService.reviewCategorySuggestion() (src/lib/supabase.ts) runs as the ADMIN's
-- own session. It correctly creates the new service_categories row (admins already have an "ALL"
-- policy there — see 20260709000000_init_schema.sql's "Only admins can manage categories"), but it
-- then tries to upsert into provider_services with provider_id = the ORIGINAL PROVIDER's id, not
-- the admin's own auth.uid(). The only policy ever added on provider_services is "Providers can
-- update their own category links" (FOR ALL USING (auth.uid() = provider_id)) — there has never
-- been an admin-scoped policy on this table. So that upsert is silently rejected by RLS, the
-- function throws before it ever reaches the final "mark suggestion approved" update, and the
-- suggestion is left stuck in 'pending' — with the category already created from the failed
-- attempt, ready to hit a duplicate-slug error on a second try.

----------------------------------------------------------------------------------
-- 1. PROVIDER_SERVICES — add the missing admin policy
----------------------------------------------------------------------------------
CREATE POLICY "Admins can manage any provider service link" ON public.provider_services
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

----------------------------------------------------------------------------------
-- 2. SELF-HEALING BACKFILL — repair any suggestion stuck in this exact broken state
----------------------------------------------------------------------------------
-- For every category_suggestion whose derived slug matches an existing service_categories row but
-- has no matching provider_services row yet, create the missing link and mark the suggestion
-- approved. Mirrors the exact slug derivation used in reviewCategorySuggestion() (NFD-normalize via
-- unaccent, uppercase, non-alphanumeric runs -> underscore, trim leading/trailing underscores).
CREATE EXTENSION IF NOT EXISTS unaccent;

DO $$
DECLARE
  rec RECORD;
  derived_slug TEXT;
  target_category_id INTEGER;
BEGIN
  FOR rec IN
    SELECT id, category_name, provider_id, status
    FROM public.category_suggestions
    WHERE provider_id IS NOT NULL
      AND status IN ('pending', 'approved') -- never touch 'rejected' — that was a deliberate admin decision
  LOOP
    derived_slug := trim(both '_' from regexp_replace(upper(unaccent(rec.category_name)), '[^A-Z0-9]+', '_', 'g'));

    SELECT sc.id INTO target_category_id
    FROM public.service_categories sc
    WHERE sc.slug = derived_slug;

    IF target_category_id IS NOT NULL THEN
      INSERT INTO public.provider_services (provider_id, category_id)
      VALUES (rec.provider_id, target_category_id)
      ON CONFLICT (provider_id, category_id) DO NOTHING;

      IF rec.status = 'pending' THEN
        UPDATE public.category_suggestions SET status = 'approved' WHERE id = rec.id;
      END IF;
    END IF;
  END LOOP;
END $$;

----------------------------------------------------------------------------------
-- 3. PUBLIC_PROVIDER_CARDS VIEW — expose subcategory/custom_description for full-text search
----------------------------------------------------------------------------------
-- The home page search box only ever matched name/description; it had no way to match a provider's
-- specific trade (provider_services.subcategory, e.g. "Développement de sites web") or their
-- "Autre" free-text note (custom_description). Both are brand new TRAILING columns (aggregated
-- arrays, same pattern as category_slugs), so CREATE OR REPLACE VIEW is safe here.
CREATE OR REPLACE VIEW public.public_provider_cards AS
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
    sp.average_rating,
    sp.review_count,
    COALESCE(cat.category_slugs, ARRAY[]::TEXT[]) AS category_slugs,
    sp.created_at,
    COALESCE(cat.subcategories, ARRAY[]::TEXT[]) AS subcategories,
    COALESCE(cat.custom_descriptions, ARRAY[]::TEXT[]) AS custom_descriptions
FROM public.service_providers sp
JOIN public.profiles p ON p.id = sp.user_id
LEFT JOIN (
    SELECT
        ps.provider_id,
        array_agg(DISTINCT sc.slug) FILTER (WHERE sc.slug IS NOT NULL) AS category_slugs,
        array_agg(DISTINCT ps.subcategory) FILTER (WHERE ps.subcategory IS NOT NULL) AS subcategories,
        array_agg(DISTINCT ps.custom_description) FILTER (WHERE ps.custom_description IS NOT NULL) AS custom_descriptions
    FROM public.provider_services ps
    JOIN public.service_categories sc ON sc.id = ps.category_id
    GROUP BY ps.provider_id
) cat ON cat.provider_id = sp.user_id
WHERE sp.is_verified = TRUE OR sp.verification_status = 'approved';

GRANT SELECT ON public.public_provider_cards TO anon, authenticated;
