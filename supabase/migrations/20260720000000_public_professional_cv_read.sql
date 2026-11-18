-- MIGRATION: Allow the public professional-profile view to actually show a working CV download
-- link for visitors (not just the owner/an admin).
-- Target Platform: PostgreSQL (Supabase / Postgres 15+)
-- Date: 2026-07-20
-- Does not touch the professional_profiles table's schema (only adds a storage.objects RLS policy)
-- and does not modify any existing table's data.
--
-- WHY THIS IS NEEDED: professional_profiles.cv_url reuses the "provider-documents" bucket, which is
-- otherwise fully private — only "Users can read their own provider documents" (path-based,
-- auth.uid() = folder owner) and "Admins can read any provider document" exist (see
-- 20260715000000_profile_management_and_categories.sql). Without this, supabaseService's signed-URL
-- generation for a professional profile's CV silently fails for anyone except the owner, so the
-- public view's "CV download link" requirement wouldn't actually work for a visitor.
--
-- SCOPE: only grants read on a file that IS registered as someone's professional_profiles.cv_url
-- AND whose profile clears the same completeness bar used for public visibility (headline + bio
-- both filled in) — mirrors supabaseService.getPublicProfessionalProfile()'s own check, so a CV
-- can't be fetched for a still-incomplete/private profile. This does not loosen read access to any
-- other file in the bucket (e.g. a provider's own business CV uploaded under a different filename).
CREATE POLICY "Public professional CVs readable by everyone" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'provider-documents'
        AND EXISTS (
            SELECT 1 FROM public.professional_profiles pp
            WHERE pp.cv_url = storage.objects.name
              AND COALESCE(pp.headline, '') <> ''
              AND COALESCE(pp.bio, '') <> ''
        )
    );
