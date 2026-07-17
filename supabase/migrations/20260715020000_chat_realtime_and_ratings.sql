-- MIGRATION: Wire real Supabase chat (Realtime) and ratings — missing chats INSERT policy, the
-- Realtime publication for chat_messages, provider review responses, cached rating aggregates, and
-- abuse-protection triggers.
-- Target Platform: PostgreSQL (Supabase / Postgres 15+)
-- Date: 2026-07-15
-- Does not modify any earlier migration file — `chats`/`chat_messages`/`ratings` were created in
-- 20260709000000_init_schema.sql.

----------------------------------------------------------------------------------
-- 1. CHATS — missing INSERT policy
----------------------------------------------------------------------------------
-- The init migration only ever added a SELECT policy for `chats` (plus INSERT/SELECT on
-- `chat_messages`) — there was no way for a client to create a new chat thread at all. Chat
-- threads are client-initiated in the current UI (ServiceCard / ProviderProfile / Dashboard "chat"
-- buttons all belong to the client side), so only the client side can create one for now.
CREATE POLICY "Clients can create their own chats" ON public.chats
    FOR INSERT WITH CHECK (auth.uid() = client_id);

----------------------------------------------------------------------------------
-- 2. REALTIME — add chat_messages to the supabase_realtime publication
----------------------------------------------------------------------------------
-- ChatInterface subscribes to postgres_changes INSERT events on chat_messages; that only fires if
-- the table is part of this publication. Guarded so re-running this migration doesn't error if
-- it's already been added (e.g. via the dashboard).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
END $$;

----------------------------------------------------------------------------------
-- 3. RATINGS — provider response column
----------------------------------------------------------------------------------
ALTER TABLE public.ratings
  ADD COLUMN IF NOT EXISTS response TEXT;

----------------------------------------------------------------------------------
-- 4. RATINGS — tightened INSERT policy: only for the client's own COMPLETED booking
----------------------------------------------------------------------------------
-- The original policy only checked auth.uid() = client_id, meaning a client could insert a rating
-- against ANY booking_id/provider_id pair regardless of whether that booking was theirs or even
-- completed. Tightened to require the referenced booking to belong to this client, target this
-- provider, and already be 'completed'.
DROP POLICY IF EXISTS "Clients can write ratings for their own bookings" ON public.ratings;

CREATE POLICY "Clients can rate their own completed bookings" ON public.ratings
    FOR INSERT WITH CHECK (
        auth.uid() = client_id
        AND EXISTS (
            SELECT 1 FROM public.bookings b
            WHERE b.id = booking_id
              AND b.client_id = auth.uid()
              AND b.provider_id = ratings.provider_id
              AND b.status = 'completed'
        )
    );

----------------------------------------------------------------------------------
-- 5. RATINGS — provider response UPDATE policy + column-level enforcement trigger
----------------------------------------------------------------------------------
-- No UPDATE policy existed on ratings at all. This adds one (row-level gate), with a trigger doing
-- the actual column-level enforcement: only the reviewed provider (or an admin) may update a
-- rating, and only to set `response` once — not to edit stars/comment/etc, and not to overwrite an
-- existing response.
CREATE POLICY "Providers can respond to their own ratings" ON public.ratings
    FOR UPDATE USING (
        auth.uid() = provider_id
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

CREATE OR REPLACE FUNCTION public.enforce_rating_response_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin BOOLEAN;
BEGIN
  SELECT (profiles.role = 'admin') INTO is_admin FROM public.profiles WHERE profiles.id = auth.uid();
  IF is_admin THEN
    RETURN NEW;
  END IF;

  IF auth.uid() <> OLD.provider_id THEN
    RAISE EXCEPTION 'Only the reviewed provider can respond to this rating.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.stars IS DISTINCT FROM OLD.stars
     OR NEW.comment IS DISTINCT FROM OLD.comment
     OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
     OR NEW.booking_id IS DISTINCT FROM OLD.booking_id
  THEN
    RAISE EXCEPTION 'Providers can only set their response text, not edit the review itself.'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.response IS NOT NULL AND NEW.response IS DISTINCT FROM OLD.response THEN
    RAISE EXCEPTION 'A response has already been submitted for this rating and cannot be edited.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_rating_response_rules ON public.ratings;

CREATE TRIGGER trg_enforce_rating_response_rules
  BEFORE UPDATE ON public.ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_rating_response_rules();

----------------------------------------------------------------------------------
-- 6. RATINGS — basic wordlist profanity filter on comment (defense in depth; the client also
--    checks this before submitting, but a direct API call must not be able to bypass it)
----------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_rating_comment_profanity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  banned TEXT[] := ARRAY[
    'merde', 'putain', 'connard', 'connasse', 'salope', 'encul', 'nique', 'niquer',
    'batard', 'bâtard', 'pute', 'pd', 'negre', 'nègre',
    'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'cunt', 'whore', 'slut'
  ];
  word TEXT;
BEGIN
  IF NEW.comment IS NOT NULL THEN
    FOREACH word IN ARRAY banned LOOP
      IF NEW.comment ILIKE '%' || word || '%' THEN
        RAISE EXCEPTION 'Ce commentaire contient un langage inapproprié et ne peut pas être publié.'
          USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_rating_comment_profanity ON public.ratings;

CREATE TRIGGER trg_check_rating_comment_profanity
  BEFORE INSERT ON public.ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.check_rating_comment_profanity();

----------------------------------------------------------------------------------
-- 7. SERVICE_PROVIDERS — cached average_rating / review_count + recompute trigger
----------------------------------------------------------------------------------
-- Matches the original schema design intent: read from cached columns instead of aggregating the
-- ratings table on every browse/search query.
ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS average_rating NUMERIC NOT NULL DEFAULT 5.0,
  ADD COLUMN IF NOT EXISTS review_count INTEGER NOT NULL DEFAULT 0;

-- One-time backfill in case any ratings already existed before this migration ran (the trigger
-- below only fires on new inserts going forward).
UPDATE public.service_providers sp
SET average_rating = COALESCE((SELECT AVG(stars) FROM public.ratings WHERE provider_id = sp.user_id), 5.0),
    review_count = (SELECT COUNT(*) FROM public.ratings WHERE provider_id = sp.user_id);

CREATE OR REPLACE FUNCTION public.recompute_provider_rating_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_provider UUID := NEW.provider_id;
BEGIN
  UPDATE public.service_providers sp
  SET average_rating = COALESCE((SELECT AVG(stars) FROM public.ratings WHERE provider_id = target_provider), 5.0),
      review_count = (SELECT COUNT(*) FROM public.ratings WHERE provider_id = target_provider)
  WHERE sp.user_id = target_provider;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_provider_rating_stats ON public.ratings;

CREATE TRIGGER trg_recompute_provider_rating_stats
  AFTER INSERT ON public.ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.recompute_provider_rating_stats();

----------------------------------------------------------------------------------
-- 8. PUBLIC_PROVIDER_CARDS VIEW — read cached columns instead of the on-the-fly ratings join
----------------------------------------------------------------------------------
-- Same column names/positions as the current view (20260714020000), but the TYPE of review_count
-- changes: it used to be COALESCE(COUNT(*), 0), i.e. bigint, and is now sp.review_count, an
-- integer. CREATE OR REPLACE VIEW rejects that ("cannot change data type of view column
-- review_count from bigint to integer") — same restriction category as the rename issue fixed in
-- 20260714010000/20260714020000, just triggered by a type change instead of a reorder/rename. Drop
-- and recreate fresh to pick up the new type.
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
    sp.average_rating,
    sp.review_count,
    COALESCE(cat.category_slugs, ARRAY[]::TEXT[]) AS category_slugs
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
