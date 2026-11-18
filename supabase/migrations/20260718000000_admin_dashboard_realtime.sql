-- MIGRATION: Add service_providers and category_suggestions to the supabase_realtime publication
-- Target Platform: PostgreSQL (Supabase / Postgres 15+)
-- Date: 2026-07-18
--
-- AdminDashboard's ID-verification queue and category-suggestions queue now subscribe to
-- postgres_changes INSERT events on these two tables (see supabaseService.subscribeToPendingProviders
-- / subscribeToCategorySuggestions in src/lib/supabase.ts) so a new pending provider or a new
-- category suggestion appears automatically without a manual refresh. This mirrors the existing
-- chat_messages realtime wiring from 20260715020000_chat_realtime_and_ratings.sql. Guarded so
-- re-running this migration is a no-op if either table was already added (e.g. via the dashboard UI).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'service_providers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.service_providers;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'category_suggestions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.category_suggestions;
  END IF;
END $$;
