-- MIGRATION: Expose service_providers.created_at on public_provider_cards so the browse page can
-- offer a real "Newest" sort option (average_rating/base_price were already exposed for the
-- "Top rated"/"Price" sort options).
-- Target Platform: PostgreSQL (Supabase / Postgres 15+)
-- Date: 2026-07-16
-- Does not modify any earlier migration file.
--
-- Safe to use CREATE OR REPLACE VIEW here: created_at is a brand new TRAILING column, and none of
-- the existing columns are being reordered, renamed, or retyped (that's the only case that forces
-- the DROP VIEW + CREATE VIEW dance, as hit in earlier migrations).
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
    sp.created_at
FROM public.service_providers sp
JOIN public.profiles p ON p.id = sp.user_id
LEFT JOIN (
    SELECT ps.provider_id, array_agg(DISTINCT sc.slug) FILTER (WHERE sc.slug IS NOT NULL) AS category_slugs
    FROM public.provider_services ps
    JOIN public.service_categories sc ON sc.id = ps.category_id
    GROUP BY ps.provider_id
) cat ON cat.provider_id = sp.user_id
WHERE sp.is_verified = TRUE OR sp.verification_status = 'approved';

GRANT SELECT ON public.public_provider_cards TO anon, authenticated;
