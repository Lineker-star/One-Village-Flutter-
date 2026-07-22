-- MIGRATION: push_subscribers — tracks which users have opted into Median/OneSignal push
-- notifications from the Median-wrapped Android app.
-- Target Platform: PostgreSQL (Supabase / Postgres 15+)
-- Date: 2026-07-26
--
-- WHY NO DEVICE TOKEN COLUMN: Median's OneSignal integration is targeted by `external_id` (set via
-- median.onesignal.login(userId) client-side — see src/lib/push.ts), not by a device/player token
-- we'd otherwise have to capture and store ourselves. Median's own dashboard-configured OneSignal
-- app already owns the device-to-player-ID mapping; all this table needs to record is "this user
-- has granted push consent, as of when" so (a) the client can skip re-prompting a user who already
-- opted in, (b) the admin dashboard can show real subscriber counts, and (c) the server-side send
-- route (server.ts) has a list of external_ids known to actually be subscribed, rather than firing
-- OneSignal API calls for arbitrary user ids that were never registered.
CREATE TABLE public.push_subscribers (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    platform TEXT NOT NULL DEFAULT 'median-android',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.push_subscribers ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_push_subscribers_updated_at
  BEFORE UPDATE ON public.push_subscribers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at(); -- reuses the helper from 20260719020000_professional_network_foundation.sql

-- Same "own row + admin" shape used throughout this project (e.g. professional_profiles' FOR ALL
-- policy) — a user can only ever see/change their own subscription record; admins can see every
-- row (needed for the admin dashboard's subscriber-count / broadcast-targeting use, and for
-- server.ts's send route, which uses the service-role key and bypasses RLS entirely anyway, but the
-- policy is still here for defense-in-depth / any future direct-client admin read).
CREATE POLICY "Users manage their own push subscription" ON public.push_subscribers
    FOR ALL USING (
        auth.uid() = user_id
        OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    )
    WITH CHECK (
        auth.uid() = user_id
        OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );
