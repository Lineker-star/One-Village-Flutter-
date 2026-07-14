-- MIGRATION: One Village Base Schema & Row-Level Security (Supabase)
-- Target Platform: PostgreSQL (Supabase / Postgres 15+)
-- Date: 2026-07-09

-- Enable PostGIS extension for geo-location tracking
CREATE EXTENSION IF NOT EXISTS postgis;

-- Enable pgcrypto for encryption if needed
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create custom schemas or domain enums
CREATE TYPE user_role AS ENUM ('client', 'provider', 'admin');
CREATE TYPE verification_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE booking_status AS ENUM ('requested', 'accepted', 'in_progress', 'completed', 'cancelled');
CREATE TYPE payment_method_type AS ENUM ('mobile_money', 'cash');
CREATE TYPE momo_provider_type AS ENUM ('mtn_momo', 'orange_money');
CREATE TYPE chat_message_type AS ENUM ('text', 'image', 'voice', 'system');

----------------------------------------
-- 1. PROFILES TABLE
----------------------------------------
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    role user_role NOT NULL DEFAULT 'client',
    full_name TEXT NOT NULL,
    phone TEXT,
    whatsapp_number TEXT,
    preferred_language TEXT DEFAULT 'fr',
    avatar_url TEXT,
    referral_code TEXT UNIQUE,
    referred_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

----------------------------------------
-- 2. SERVICE CATEGORIES TABLE
----------------------------------------
CREATE TABLE public.service_categories (
    id SERIAL PRIMARY KEY,
    name_fr TEXT NOT NULL,
    name_en TEXT NOT NULL,
    icon TEXT,
    parent_category_id INTEGER REFERENCES public.service_categories(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on service_categories
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;

----------------------------------------
-- 3. SERVICE PROVIDERS TABLE
----------------------------------------
CREATE TABLE public.service_providers (
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
    business_name TEXT NOT NULL,
    description_fr TEXT NOT NULL,
    description_en TEXT NOT NULL,
    banner_url TEXT, -- Flyer
    location GEOMETRY(POINT, 4326), -- PostGIS Point
    address_text TEXT NOT NULL,
    city TEXT NOT NULL DEFAULT 'Bertoua',
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verification_status verification_status NOT NULL DEFAULT 'pending',
    id_card_front_url TEXT,
    id_card_back_url TEXT,
    id_card_number TEXT, -- In production, use pg_sodium or vaults; here we represent it as encrypted text
    social_links JSONB DEFAULT '{}'::jsonb,
    has_fixed_pricing BOOLEAN NOT NULL DEFAULT FALSE,
    base_price NUMERIC,
    currency TEXT NOT NULL DEFAULT 'XAF',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on service_providers
ALTER TABLE public.service_providers ENABLE ROW LEVEL SECURITY;

----------------------------------------
-- 4. PROVIDER SERVICES (MANY-TO-MANY)
----------------------------------------
CREATE TABLE public.provider_services (
    provider_id UUID REFERENCES public.service_providers(user_id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES public.service_categories(id) ON DELETE CASCADE,
    custom_description TEXT,
    PRIMARY KEY (provider_id, category_id)
);

-- Enable RLS on provider_services
ALTER TABLE public.provider_services ENABLE ROW LEVEL SECURITY;

----------------------------------------
-- 5. BOOKINGS TABLE
----------------------------------------
CREATE TABLE public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    provider_id UUID REFERENCES public.service_providers(user_id) ON DELETE CASCADE NOT NULL,
    category_id INTEGER REFERENCES public.service_categories(id) ON DELETE SET NULL,
    status booking_status NOT NULL DEFAULT 'requested',
    payment_method payment_method_type NOT NULL DEFAULT 'mobile_money',
    agreed_price NUMERIC NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on bookings
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

----------------------------------------
-- 6. TRANSACTIONS TABLE
----------------------------------------
CREATE TABLE public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
    provider_id UUID REFERENCES public.service_providers(user_id) ON DELETE CASCADE NOT NULL,
    amount NUMERIC NOT NULL,
    mobile_money_provider momo_provider_type,
    status TEXT NOT NULL, -- e.g. 'pending', 'success', 'failed'
    external_reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on transactions
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

----------------------------------------
-- 7. CHATS & CHAT MESSAGES
----------------------------------------
CREATE TABLE public.chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    provider_id UUID REFERENCES public.service_providers(user_id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(client_id, provider_id)
);

CREATE TABLE public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE NOT NULL,
    sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    message_type chat_message_type NOT NULL DEFAULT 'text',
    content TEXT NOT NULL,
    media_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on chats & chat_messages
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

----------------------------------------
-- 8. RATINGS TABLE
----------------------------------------
CREATE TABLE public.ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL UNIQUE, -- enforce one rating per completed booking
    client_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    provider_id UUID REFERENCES public.service_providers(user_id) ON DELETE CASCADE NOT NULL,
    stars INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on ratings
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

----------------------------------------
-- 9. REFERRALS TABLE
----------------------------------------
CREATE TABLE public.referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    referred_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
    reward_status TEXT NOT NULL DEFAULT 'pending', -- e.g. 'pending', 'credited'
    reward_amount_or_credit NUMERIC NOT NULL DEFAULT 100, -- e.g. 100 trust points
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on referrals
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

----------------------------------------
-- 10. COMMUNITY ADS TABLE
----------------------------------------
CREATE TABLE public.ads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID REFERENCES public.service_providers(user_id) ON DELETE CASCADE NOT NULL,
    media_url TEXT,
    target_category INTEGER REFERENCES public.service_categories(id) ON DELETE SET NULL,
    budget NUMERIC NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'paused', 'completed'
    impressions INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on ads
ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;

----------------------------------------
-- 11. SERVICE POPULARITY (MATERIALIZED VIEW & POPULARITY TRENDS)
----------------------------------------
-- Creates aggregated metrics to compute trending providers and categories over day/week/month windows.
CREATE MATERIALIZED VIEW public.service_popularity AS
SELECT 
    sc.id AS category_id,
    sc.name_fr AS category_name_fr,
    sc.name_en AS category_name_en,
    COUNT(b.id) AS total_bookings,
    COALESCE(SUM(b.agreed_price), 0) AS total_revenue,
    NOW() AS last_updated_at
FROM public.service_categories sc
LEFT JOIN public.bookings b ON b.category_id = sc.id AND b.created_at >= NOW() - INTERVAL '30 days'
GROUP BY sc.id, sc.name_fr, sc.name_en;

CREATE UNIQUE INDEX idx_service_popularity_cat_id ON public.service_popularity(category_id);

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION public.refresh_service_popularity()
RETURNS trigger AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.service_popularity;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to refresh on booking updates
CREATE TRIGGER trg_refresh_service_popularity
AFTER INSERT OR UPDATE OR DELETE ON public.bookings
FOR EACH STATEMENT EXECUTE FUNCTION public.refresh_service_popularity();


--------------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
--------------------------------------------------------------------------------

-- 1. Profiles Policies
CREATE POLICY "Public profiles are readable by everyone" ON public.profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- 2. Service Categories Policies
CREATE POLICY "Categories are readable by everyone" ON public.service_categories
    FOR SELECT USING (true);

CREATE POLICY "Only admins can manage categories" ON public.service_categories
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- 3. Service Providers Policies
CREATE POLICY "Providers can create their own entry" ON public.service_providers
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Providers can update their own entry" ON public.service_providers
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Full provider details are readable by authenticated users" ON public.service_providers
    FOR SELECT USING (auth.role() = 'authenticated');

-- 4. Provider Services Policies
CREATE POLICY "Provider services are readable by everyone" ON public.provider_services
    FOR SELECT USING (true);

CREATE POLICY "Providers can update their own category links" ON public.provider_services
    FOR ALL USING (auth.uid() = provider_id);

-- 5. Bookings Policies
CREATE POLICY "Clients can read their own bookings" ON public.bookings
    FOR SELECT USING (auth.uid() = client_id);

CREATE POLICY "Providers can read bookings assigned to them" ON public.bookings
    FOR SELECT USING (auth.uid() = provider_id);

CREATE POLICY "Clients can insert their own bookings" ON public.bookings
    FOR INSERT WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Involved parties can update bookings" ON public.bookings
    FOR UPDATE USING (auth.uid() = client_id OR auth.uid() = provider_id);

-- 6. Transactions Policies
CREATE POLICY "Clients can view their booking transactions" ON public.transactions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.bookings
            WHERE bookings.id = transactions.booking_id AND bookings.client_id = auth.uid()
        )
    );

CREATE POLICY "Providers can view transactions linked to them" ON public.transactions
    FOR SELECT USING (auth.uid() = provider_id);

-- 7. Chats & Chat Messages Policies
CREATE POLICY "Involved parties can read chats" ON public.chats
    FOR SELECT USING (auth.uid() = client_id OR auth.uid() = provider_id);

CREATE POLICY "Involved parties can write messages" ON public.chat_messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.chats
            WHERE chats.id = chat_messages.chat_id AND (chats.client_id = auth.uid() OR chats.provider_id = auth.uid())
        )
    );

CREATE POLICY "Involved parties can read chat messages" ON public.chat_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.chats
            WHERE chats.id = chat_messages.chat_id AND (chats.client_id = auth.uid() OR chats.provider_id = auth.uid())
        )
    );

-- 8. Ratings Policies
CREATE POLICY "Anyone can read ratings" ON public.ratings
    FOR SELECT USING (true);

CREATE POLICY "Clients can write ratings for their own bookings" ON public.ratings
    FOR INSERT WITH CHECK (auth.uid() = client_id);

-- 9. Referrals Policies
CREATE POLICY "Users can see referrals they initiated or were referred by" ON public.referrals
    FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- 10. Ads Policies
CREATE POLICY "Anyone can read active ads" ON public.ads
    FOR SELECT USING (status = 'active');

CREATE POLICY "Providers can manage their own ads" ON public.ads
    FOR ALL USING (auth.uid() = provider_id);


--------------------------------------------------------------------------------
-- 12. GUEST-SAFE PUBLIC VIEW (public_provider_cards)
--------------------------------------------------------------------------------
-- Emulates a database view to show provider search results to logged-out/guest users.
-- Excludes sensitive fields like id_card_front_url, id_card_back_url, phone, and detailed address_text.
-- Only approved/verified providers or those marked is_verified are shown.
CREATE OR REPLACE VIEW public.public_provider_cards AS
SELECT 
    sp.user_id AS provider_id,
    p.full_name AS provider_name,
    sp.business_name,
    sp.description_fr,
    sp.description_en,
    sp.banner_url,
    sp.city,
    sp.has_fixed_pricing,
    sp.base_price,
    sp.currency,
    sp.is_verified,
    COALESCE(AVG(r.stars), 5.0) AS average_rating,
    COUNT(r.id) AS review_count
FROM public.service_providers sp
JOIN public.profiles p ON p.id = sp.user_id
LEFT JOIN public.ratings r ON r.provider_id = sp.user_id
WHERE sp.is_verified = TRUE OR sp.verification_status = 'approved'
GROUP BY sp.user_id, p.full_name, sp.business_name, sp.description_fr, sp.description_en, sp.banner_url, sp.city, sp.has_fixed_pricing, sp.base_price, sp.currency, sp.is_verified;

-- Grant permissions
GRANT SELECT ON public.public_provider_cards TO anon, authenticated;
GRANT SELECT ON public.service_categories TO anon, authenticated;
