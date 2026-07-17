-- MIGRATION: Generalize public.chats from a fixed client/provider pair (provider_id hard-FK'd to
-- service_providers, blocking any thread where neither party is a registered provider) into a
-- generic two-participant thread between any two profiles, with optional nullable context
-- references to a booking or a community ad. Schema only, no UI wiring in this step.
-- Target Platform: PostgreSQL (Supabase / Postgres 15+)
-- Date: 2026-07-19
-- Depends on 20260719000000_community_ads_table.sql (community_ad_id references it). Does not
-- touch chat_messages' own columns (chat_id/sender_id/content/...) — only chat_messages' RLS
-- policies change, since they reference chats.client_id/provider_id by name.
--
-- COMPATIBILITY: every existing chat row is backfilled into the new columns before the old ones are
-- dropped, so already-in-use booking-based provider chat threads keep their id, their messages, and
-- keep resolving to the same two people — nothing is deleted. supabaseService.getOrCreateChat() in
-- src/lib/supabase.ts is updated in this same step to read/write the new columns internally while
-- keeping its external (clientId, providerId) signature unchanged, so ChatInterface.tsx needs no
-- changes at all.

----------------------------------------------------------------------------------
-- 1. ADD the new generic columns (nullable for now, backfilled below)
----------------------------------------------------------------------------------
ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS participant_one_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS participant_two_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS community_ad_id UUID REFERENCES public.community_ads(id) ON DELETE SET NULL;

----------------------------------------------------------------------------------
-- 2. BACKFILL existing rows
----------------------------------------------------------------------------------
-- provider_id references service_providers(user_id), which is itself a profiles(id) FK — so every
-- existing provider_id value is already a valid profiles.id and can move across unchanged. Ordered
-- with LEAST/GREATEST (not a plain copy) so every row already satisfies the canonical-ordering CHECK
-- constraint added in step 4, matching how the app will always normalize the pair going forward.
UPDATE public.chats
SET participant_one_id = LEAST(client_id, provider_id),
    participant_two_id = GREATEST(client_id, provider_id)
WHERE participant_one_id IS NULL;

----------------------------------------------------------------------------------
-- 3. DROP old policies that reference client_id/provider_id (must happen before those columns are
--    dropped in step 5, since a policy expression referencing a column blocks DROP COLUMN)
----------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Involved parties can read chats" ON public.chats;
DROP POLICY IF EXISTS "Clients can create their own chats" ON public.chats;
DROP POLICY IF EXISTS "Involved parties can write messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Involved parties can read chat messages" ON public.chat_messages;

----------------------------------------------------------------------------------
-- 4. Enforce NOT NULL + canonical ordering on the new columns
----------------------------------------------------------------------------------
ALTER TABLE public.chats
  ALTER COLUMN participant_one_id SET NOT NULL,
  ALTER COLUMN participant_two_id SET NOT NULL;

-- Also guarantees the two participants are distinct (a < b rules out a = b). The app always
-- normalizes the pair into this same ascending order before insert/lookup (see getOrCreateChat), so
-- this single constraint is what makes "one thread per pair" work without a functional index.
ALTER TABLE public.chats
  ADD CONSTRAINT chats_participants_ordered CHECK (participant_one_id < participant_two_id);

----------------------------------------------------------------------------------
-- 5. DROP the old client/provider-specific columns and their unique constraint
----------------------------------------------------------------------------------
ALTER TABLE public.chats DROP CONSTRAINT IF EXISTS chats_client_id_provider_id_key;
ALTER TABLE public.chats DROP COLUMN IF EXISTS client_id;
ALTER TABLE public.chats DROP COLUMN IF EXISTS provider_id;

ALTER TABLE public.chats
  ADD CONSTRAINT chats_participants_unique UNIQUE (participant_one_id, participant_two_id);

----------------------------------------------------------------------------------
-- 6. NEW RLS — either participant can read; either participant can initiate (previously only the
--    "client" side could, which doesn't make sense once neither party has a fixed client/provider
--    role — e.g. two people messaging about a community ad).
----------------------------------------------------------------------------------
CREATE POLICY "Participants can read their own chats" ON public.chats
    FOR SELECT USING (auth.uid() = participant_one_id OR auth.uid() = participant_two_id);

CREATE POLICY "Either participant can create a chat" ON public.chats
    FOR INSERT WITH CHECK (auth.uid() = participant_one_id OR auth.uid() = participant_two_id);

CREATE POLICY "Participants can write messages in their own chat" ON public.chat_messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.chats
            WHERE chats.id = chat_messages.chat_id
              AND (chats.participant_one_id = auth.uid() OR chats.participant_two_id = auth.uid())
        )
    );

CREATE POLICY "Participants can read messages in their own chat" ON public.chat_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.chats
            WHERE chats.id = chat_messages.chat_id
              AND (chats.participant_one_id = auth.uid() OR chats.participant_two_id = auth.uid())
        )
    );
