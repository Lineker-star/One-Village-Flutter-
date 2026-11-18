-- MIGRATION: Provider registration & public discovery wiring
-- Target Platform: PostgreSQL (Supabase / Postgres 15+)
-- Date: 2026-07-14
--
-- Adds the columns/storage buckets needed for real provider registration + browse/search,
-- and tightens/extends RLS so:
--   - anon/public can read service_categories and public_provider_cards (unchanged, already existed)
--   - authenticated users get full service_providers read only on APPROVED rows (was previously
--     ANY row regardless of status — see "Full provider details..." policy below, flagged for review)
--   - admins (profiles.role = 'admin') can read/update ANY service_providers row, so the admin
--     verification queue can operate directly against Supabase instead of the in-memory server.

----------------------------------------------------------------------------------
-- 1. NEIGHBORHOOD + CATEGORY SLUG COLUMNS
----------------------------------------------------------------------------------
-- The app's browse/search UI filters by a static neighborhood id (see src/data/bertouaData.ts)
-- and by the ServiceCategory string enum (AGRICULTURE, TRANSPORT, ...). Neither concept existed
-- in the original schema (service_providers only had a PostGIS location point + free-text
-- address_text; service_categories only had a serial int id + name_fr/name_en). Both columns
-- added here are additive/nullable so they don't break any existing data.

ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS neighborhood_id TEXT;

ALTER TABLE public.service_categories
  ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Seed/backfill the 8 categories the app already knows about (service_categories had no seed
-- data at all in the init migration). Slug values match src/types.ts's ServiceCategory enum
-- exactly so provider_services can be joined/filtered using the same strings used everywhere
-- else in the app.
INSERT INTO public.service_categories (name_fr, name_en, slug) VALUES
  ('Agriculture & Labour', 'Agriculture & Farm Labor', 'AGRICULTURE'),
  ('Transport & Moto-Taxi', 'Transport & Moto-Taxi', 'TRANSPORT'),
  ('Aide Ménagère', 'Home Help', 'HOME_HELP'),
  ('Garde d''enfants (Nounou)', 'Childcare & Babysitting', 'CHILDCARE'),
  ('Maçonnerie & Construction', 'Masonry & Construction', 'CONSTRUCTION'),
  ('Couture & Mode', 'Tailoring & Fashion', 'TAILORING'),
  ('Répétiteur & Enseignement', 'Tutoring & Education', 'EDUCATION'),
  ('Santé & Soins à domicile', 'Health & Home Care', 'HEALTH')
ON CONFLICT (slug) DO NOTHING;

----------------------------------------------------------------------------------
-- 2. PUBLIC_PROVIDER_CARDS VIEW — extended with neighborhood_id + category_slugs
----------------------------------------------------------------------------------
-- The view already existed (see 20260709000000_init_schema.sql) and already excluded ID card
-- fields, phone, and full address — matching the public-safe spec. It's extended here (not
-- recreated from scratch) to also expose neighborhood_id and category_slugs, which the browse
-- screen needs for filtering. Rewritten to aggregate ratings and categories in subqueries instead
-- of direct JOINs, because the original direct-JOIN version would fan out (a provider with both
-- multiple ratings AND multiple categories would get a cartesian product of rows, inflating
-- average_rating/review_count) — flagging this fix alongside the new columns.
--
-- Uses DROP + CREATE rather than CREATE OR REPLACE: the original view (init migration) has
-- has_fixed_pricing as its 8th column, and this version inserts neighborhood_id before it — Postgres
-- only allows CREATE OR REPLACE VIEW to append trailing columns, not insert/reorder existing ones,
-- and rejects that with "cannot change name of view column ... to ...". Since a failed statement
-- aborts the whole pasted script as one transaction, that error was also rolling back the
-- ADD COLUMN slug / seed INSERT above, which is why a later migration referencing sc.slug failed
-- with "column sc.slug does not exist" — this fixes both symptoms at once.
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
GRANT SELECT ON public.service_categories TO anon, authenticated;

----------------------------------------------------------------------------------
-- 3. SERVICE_PROVIDERS RLS — tightened SELECT, new admin UPDATE policy
----------------------------------------------------------------------------------
-- FLAG FOR REVIEW: the original "Full provider details are readable by authenticated users"
-- policy used `USING (auth.role() = 'authenticated')` with no status check, meaning ANY logged-in
-- user could read ANY service_providers row via direct Supabase queries — including other
-- people's pending/rejected rows, and their id_card_front_url/id_card_back_url/id_card_number.
-- That's tightened here to only expose full rows for: approved providers (any authenticated
-- user), the provider's own row (any status), or an admin (any status/any row).
DROP POLICY IF EXISTS "Full provider details are readable by authenticated users" ON public.service_providers;

CREATE POLICY "Approved providers readable by authenticated users, own/admin rows always" ON public.service_providers
    FOR SELECT USING (
        verification_status = 'approved'
        OR auth.uid() = user_id
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- NEW POLICY: lets admins update verification_status/is_verified on any provider (needed for the
-- admin approval queue to write directly to Supabase instead of the in-memory server).
CREATE POLICY "Admins can update any service provider" ON public.service_providers
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

----------------------------------------------------------------------------------
-- 4. STORAGE BUCKETS — provider-media (public) and id-verification (private)
----------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('provider-media', 'provider-media', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('id-verification', 'id-verification', false)
ON CONFLICT (id) DO NOTHING;

-- provider-media: public read (banners/avatars are meant to be publicly visible), but only the
-- owning user can upload/update their own files. Upload paths are expected as "<user_id>/<file>".
CREATE POLICY "Provider media is publicly readable" ON storage.objects
    FOR SELECT USING (bucket_id = 'provider-media');

CREATE POLICY "Users can upload their own provider media" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'provider-media' AND auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can update their own provider media" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'provider-media' AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- id-verification: private. Only the owning user (to upload their own ID) and admins (to review)
-- can read; only the owning user can upload. No public read at all.
CREATE POLICY "Users can upload their own ID verification files" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'id-verification' AND auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can read their own ID verification files" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'id-verification' AND auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Admins can read any ID verification file" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'id-verification'
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );
