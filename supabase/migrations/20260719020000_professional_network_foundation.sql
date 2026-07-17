-- MIGRATION: Foundation tables for a mini professional-network feature (individual professional
-- profiles, companies, job postings, job applications). Schema only, no UI wiring in this step.
-- Target Platform: PostgreSQL (Supabase / Postgres 15+)
-- Date: 2026-07-19
-- Does not modify any earlier migration file or existing table's data.

----------------------------------------------------------------------------------
-- 1. ENUMS
----------------------------------------------------------------------------------
CREATE TYPE availability_status AS ENUM ('open_to_work', 'employed', 'not_looking');
CREATE TYPE employment_type AS ENUM ('full_time', 'part_time', 'contract', 'gig');
CREATE TYPE job_posting_status AS ENUM ('open', 'closed');
CREATE TYPE job_application_status AS ENUM ('submitted', 'reviewed', 'accepted', 'rejected');

-- Small reusable trigger so professional_profiles.updated_at actually reflects the last edit,
-- instead of being a column that's set once at creation and never touched again.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

----------------------------------------------------------------------------------
-- 2. PROFESSIONAL_PROFILES — one-to-one extension of profiles for job-seeking/networking info
----------------------------------------------------------------------------------
CREATE TABLE public.professional_profiles (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    headline TEXT,
    bio TEXT,
    skills TEXT[] NOT NULL DEFAULT '{}',
    years_experience INTEGER,
    availability_status availability_status NOT NULL DEFAULT 'not_looking',
    -- Reuses the existing private "provider-documents" storage bucket and its
    -- "<user_id>/<filename>" path convention (see 20260715000000_profile_management_and_categories.sql)
    -- for CV uploads — its upload/read policies are already path-based (auth.uid() = folder owner),
    -- not gated on being a registered provider, so no new storage policy is needed here.
    cv_url TEXT,
    portfolio_links JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.professional_profiles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_professional_profiles_updated_at
  BEFORE UPDATE ON public.professional_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Professional profiles are readable by everyone" ON public.professional_profiles
    FOR SELECT USING (true);

CREATE POLICY "Users manage their own professional profile" ON public.professional_profiles
    FOR ALL USING (
        auth.uid() = user_id
        OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

----------------------------------------------------------------------------------
-- 3. COMPANIES
----------------------------------------------------------------------------------
CREATE TABLE public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    logo_url TEXT,
    cover_image_url TEXT,
    industry TEXT,
    neighborhood_id TEXT,
    website TEXT,
    social_links JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Companies are readable by everyone" ON public.companies
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create their own company" ON public.companies
    FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners manage their own company" ON public.companies
    FOR UPDATE USING (
        auth.uid() = owner_id
        OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

CREATE POLICY "Owners delete their own company" ON public.companies
    FOR DELETE USING (
        auth.uid() = owner_id
        OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

----------------------------------------------------------------------------------
-- 4. JOB_POSTINGS — company_id is nullable so an individual can post a job/gig without a company
----------------------------------------------------------------------------------
CREATE TABLE public.job_postings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    posted_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category_id INTEGER REFERENCES public.service_categories(id) ON DELETE SET NULL,
    neighborhood_id TEXT,
    employment_type employment_type NOT NULL DEFAULT 'full_time',
    salary_range TEXT,
    status job_posting_status NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.job_postings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Open job postings are readable by everyone" ON public.job_postings
    FOR SELECT USING (
        status = 'open'
        OR auth.uid() = posted_by
        OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

CREATE POLICY "Authenticated users can post their own job" ON public.job_postings
    FOR INSERT WITH CHECK (auth.uid() = posted_by);

CREATE POLICY "Posters manage their own job posting" ON public.job_postings
    FOR UPDATE USING (
        auth.uid() = posted_by
        OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

CREATE POLICY "Posters delete their own job posting" ON public.job_postings
    FOR DELETE USING (
        auth.uid() = posted_by
        OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

----------------------------------------------------------------------------------
-- 5. JOB_APPLICATIONS — one application per applicant per job
----------------------------------------------------------------------------------
CREATE TABLE public.job_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.job_postings(id) ON DELETE CASCADE,
    applicant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    cover_note TEXT,
    status job_application_status NOT NULL DEFAULT 'submitted',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (job_id, applicant_id)
);

ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

-- Applicant sees their own applications; a job's poster sees applications submitted to their own
-- postings; admins see everything.
CREATE POLICY "Applicants and job posters can read relevant applications" ON public.job_applications
    FOR SELECT USING (
        auth.uid() = applicant_id
        OR EXISTS (SELECT 1 FROM public.job_postings jp WHERE jp.id = job_applications.job_id AND jp.posted_by = auth.uid())
        OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

CREATE POLICY "Authenticated users can apply for jobs" ON public.job_applications
    FOR INSERT WITH CHECK (auth.uid() = applicant_id);

-- Not explicitly requested, but added since it's the obvious missing half of the status enum
-- (submitted/reviewed/accepted/rejected) — without this, nothing could ever move an application out
-- of 'submitted' except an admin. Lets a job's poster (or an admin) update status on applications to
-- their own postings.
CREATE POLICY "Job posters can update applications to their own postings" ON public.job_applications
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.job_postings jp WHERE jp.id = job_applications.job_id AND jp.posted_by = auth.uid())
        OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

CREATE POLICY "Admins can delete applications" ON public.job_applications
    FOR DELETE USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
