-- MIGRATION: Fix a job_postings RLS gap found during the Steps 8a-8e audit — an applicant loses
-- the ability to view a job posting entirely (and therefore see their own application's status,
-- an explicit requirement from the original job postings/applications step) the moment its poster
-- marks it "closed".
-- Target Platform: PostgreSQL (Supabase / Postgres 15+)
-- Date: 2026-07-21
-- Does not touch any table's data, only replaces one SELECT policy on job_postings.
--
-- ROOT CAUSE: "Open job postings are readable by everyone" only covers status = 'open', the
-- poster themselves, or an admin. An applicant is none of those once the job they applied to is
-- closed — src/components/JobDetailPage.tsx's getJobPostingDetail() call comes back null (RLS
-- silently filters the row out), so the whole page renders "Offre introuvable" (job not found)
-- instead of showing their application and its current status.
DROP POLICY IF EXISTS "Open job postings are readable by everyone" ON public.job_postings;

CREATE POLICY "Open job postings are readable by everyone" ON public.job_postings
    FOR SELECT USING (
        status = 'open'
        OR auth.uid() = posted_by
        OR EXISTS (
            SELECT 1 FROM public.job_applications ja
            WHERE ja.job_id = job_postings.id AND ja.applicant_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );
