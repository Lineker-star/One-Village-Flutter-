-- MIGRATION: Real community_ads table, replacing the in-memory mock (server.ts's `ads` array +
-- /api/ads endpoints). Posting now requires a real logged-in profile — schema only, no UI wiring
-- in this step.
-- Target Platform: PostgreSQL (Supabase / Postgres 15+)
-- Date: 2026-07-19
-- Does not modify any earlier migration file or existing table's data.

----------------------------------------------------------------------------------
-- 1. ENUMS
----------------------------------------------------------------------------------
-- Matches AdBoard.tsx's existing three-level urgency scheme (LOW/MEDIUM/HIGH) rather than a plain
-- urgent/normal binary, so a future real-data migration of that UI doesn't need to remap values.
CREATE TYPE community_ad_urgency AS ENUM ('low', 'medium', 'high');
CREATE TYPE community_ad_status AS ENUM ('open', 'fulfilled', 'closed');

----------------------------------------------------------------------------------
-- 2. TABLE
----------------------------------------------------------------------------------
CREATE TABLE public.community_ads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poster_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category_id INTEGER REFERENCES public.service_categories(id) ON DELETE SET NULL,
    neighborhood_id TEXT,
    budget_proposed NUMERIC,
    urgency community_ad_urgency NOT NULL DEFAULT 'medium',
    status community_ad_status NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.community_ads ENABLE ROW LEVEL SECURITY;

----------------------------------------------------------------------------------
-- 3. RLS
----------------------------------------------------------------------------------
-- Anyone (anon + authenticated) can read open ads; the poster can also always see their own
-- regardless of status (e.g. after they close/fulfill it), and admins can see everything for
-- moderation.
CREATE POLICY "Open ads are readable by everyone" ON public.community_ads
    FOR SELECT USING (
        status = 'open'
        OR auth.uid() = poster_id
        OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

-- Posting requires login, and only as yourself (no posting on someone else's behalf).
CREATE POLICY "Authenticated users can post their own ad" ON public.community_ads
    FOR INSERT WITH CHECK (auth.uid() = poster_id);

-- Only the poster (or an admin, for moderation) can edit or remove an ad.
CREATE POLICY "Posters can update their own ad" ON public.community_ads
    FOR UPDATE USING (
        auth.uid() = poster_id
        OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

CREATE POLICY "Posters can delete their own ad" ON public.community_ads
    FOR DELETE USING (
        auth.uid() = poster_id
        OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

GRANT SELECT ON public.community_ads TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.community_ads TO authenticated;
