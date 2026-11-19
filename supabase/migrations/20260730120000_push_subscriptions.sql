-- MIGRATION: Push notification subscriptions (Web Push / FCM)
-- Stores browser PushSubscription endpoints so the server (or FCM via web-push) can target a
-- device. Replaces the previous in-memory store in server.ts. RLS: a user can only read/write
-- their own subscriptions; the server uses the service-role key (bypasses RLS) to broadcast.
-- Target Platform: Supabase (Postgres + RLS)
-- Date: 2026-07-30

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint     text NOT NULL UNIQUE,
  p256dh       text,
  auth         text,
  user_id      text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON public.push_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_updated_at
  ON public.push_subscriptions (updated_at DESC);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- A user may manage only their own subscriptions (identified by user_id = auth.uid()).
CREATE POLICY "Users can view own push subscriptions"
  ON public.push_subscriptions FOR SELECT
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid()::text);

CREATE POLICY "Users can insert own push subscriptions"
  ON public.push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid()::text);

CREATE POLICY "Users can update own push subscriptions"
  ON public.push_subscriptions FOR UPDATE
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid()::text)
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid()::text);

CREATE POLICY "Users can delete own push subscriptions"
  ON public.push_subscriptions FOR DELETE
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid()::text);

-- Realtime is not required for this table; the server reads via the service role.

-- Keep updated_at fresh on updates.
CREATE OR REPLACE FUNCTION public.touch_push_subscription_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_push_subscription_updated_at ON public.push_subscriptions;
CREATE TRIGGER trg_touch_push_subscription_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_push_subscription_updated_at();