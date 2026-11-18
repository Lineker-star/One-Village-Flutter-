-- MIGRATION: Fix infinite RLS recursion between job_postings and job_applications that broke
-- EVERY operation on both tables (not just job posting submission — plain SELECTs on either table
-- fail too), confirmed live via a read-only diagnostic query returning Postgres error 42P17
-- ("infinite recursion detected in policy for relation ...").
-- Target Platform: PostgreSQL (Supabase / Postgres 15+)
-- Date: 2026-07-23
--
-- ROOT CAUSE: 20260719020000_professional_network_foundation.sql gave job_applications' SELECT
-- and UPDATE policies an EXISTS subquery into job_postings (to let a job's poster see/manage
-- applications to their own postings). Later, 20260721000000_job_postings_applicant_visibility.sql
-- replaced job_postings' SELECT policy to ALSO add an EXISTS subquery into job_applications (to let
-- an applicant keep seeing a job after its poster closed it). Neither migration was wrong in
-- isolation, but together they form a cycle: evaluating job_postings' SELECT policy requires
-- evaluating job_applications' SELECT policy, which requires evaluating job_postings' SELECT
-- policy again, forever — Postgres detects this and rejects the query outright, on either table,
-- regardless of which one is queried first. This is why job posting submission stopped working:
-- createJobPosting()'s `.insert(...).select("id")` inserts fine but then fails on the trailing
-- SELECT-back, aborting the whole transaction.
--
-- FIX: two small SECURITY DEFINER helper functions. A SECURITY DEFINER function runs with the
-- privileges of its owner and does NOT re-trigger RLS policy evaluation on the table it queries
-- internally, which breaks the cycle in both directions at once. The rewritten policies are
-- otherwise IDENTICAL in behavior to what they replace — same access rules, same rows visible to
-- the same people, just expressed through a function call instead of an inline EXISTS subquery.
CREATE OR REPLACE FUNCTION public.is_poster_of_job(p_job_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.job_postings WHERE id = p_job_id AND posted_by = p_user_id
    );
$$;

CREATE OR REPLACE FUNCTION public.has_applied_to_job(p_job_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.job_applications WHERE job_id = p_job_id AND applicant_id = p_user_id
    );
$$;

-- job_postings SELECT: same rule as 20260721000000 (open jobs to everyone, own postings to the
-- poster, everything to admins, plus a closed job stays visible to someone who applied to it) —
-- just via has_applied_to_job() instead of the raw EXISTS-into-job_applications that caused the cycle.
DROP POLICY IF EXISTS "Open job postings are readable by everyone" ON public.job_postings;

CREATE POLICY "Open job postings are readable by everyone" ON public.job_postings
    FOR SELECT USING (
        status = 'open'
        OR auth.uid() = posted_by
        OR public.has_applied_to_job(id, auth.uid())
        OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

-- job_applications SELECT/UPDATE: same rules as 20260719020000 — just via is_poster_of_job()
-- instead of the raw EXISTS-into-job_postings on the other side of the same cycle.
DROP POLICY IF EXISTS "Applicants and job posters can read relevant applications" ON public.job_applications;

CREATE POLICY "Applicants and job posters can read relevant applications" ON public.job_applications
    FOR SELECT USING (
        auth.uid() = applicant_id
        OR public.is_poster_of_job(job_id, auth.uid())
        OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

DROP POLICY IF EXISTS "Job posters can update applications to their own postings" ON public.job_applications;

CREATE POLICY "Job posters can update applications to their own postings" ON public.job_applications
    FOR UPDATE USING (
        public.is_poster_of_job(job_id, auth.uid())
        OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );
