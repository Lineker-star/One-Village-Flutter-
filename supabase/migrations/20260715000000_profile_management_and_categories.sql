-- MIGRATION: Category suggestions, profile bio, provider CV storage, and file-removal RLS.
-- Target Platform: PostgreSQL (Supabase / Postgres 15+)
-- Date: 2026-07-15
-- Does not modify any earlier migration file.

----------------------------------------------------------------------------------
-- 1. CATEGORY SUGGESTIONS
----------------------------------------------------------------------------------
-- When a provider picks "Autre / Other" in the registration wizard's category dropdown, their
-- registration still submits normally (service_providers row created), but with no
-- provider_services link yet, since provider_services.category_id is part of its primary key and
-- can't be null/point at a category that doesn't exist. Instead this row records the suggestion;
-- provider_id lets the admin approval flow retroactively link the ORIGINAL submitting provider to
-- the real category once one is created.
CREATE TABLE public.category_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_name TEXT NOT NULL,
    description TEXT,
    submitted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    provider_id UUID REFERENCES public.service_providers(user_id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.category_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own suggestions, admins view all" ON public.category_suggestions
    FOR SELECT USING (
        auth.uid() = submitted_by
        OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

CREATE POLICY "Users can submit their own suggestion" ON public.category_suggestions
    FOR INSERT WITH CHECK (auth.uid() = submitted_by);

CREATE POLICY "Admins can update suggestions" ON public.category_suggestions
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

----------------------------------------------------------------------------------
-- 2. PROFILE BIO
----------------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio TEXT;

----------------------------------------------------------------------------------
-- 3. PROVIDER CV / RESUME
----------------------------------------------------------------------------------
ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS cv_url TEXT;

----------------------------------------------------------------------------------
-- 4. NEW STORAGE BUCKET: provider-documents (private, for CV/resume uploads)
----------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('provider-documents', 'provider-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload their own provider documents" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'provider-documents' AND auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can read their own provider documents" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'provider-documents' AND auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Admins can read any provider document" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'provider-documents'
        AND EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

CREATE POLICY "Users can delete their own provider documents" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'provider-documents' AND auth.uid()::text = (storage.foldername(name))[1]
    );

----------------------------------------------------------------------------------
-- 5. FILE-REMOVAL SUPPORT: DELETE policies were missing on the two existing buckets
----------------------------------------------------------------------------------
-- 20260714010000_provider_discovery_updates.sql created provider-media and id-verification with
-- SELECT/INSERT/UPDATE policies but no DELETE policy, so a user could never actually remove their
-- own avatar/banner/ID card file from storage. Added here (new policies, that migration untouched).
CREATE POLICY "Users can delete their own provider media" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'provider-media' AND auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can delete their own ID verification files" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'id-verification' AND auth.uid()::text = (storage.foldername(name))[1]
    );
