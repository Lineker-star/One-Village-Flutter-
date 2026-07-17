import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { UserProfile, ServiceProvider, ServiceCategory, RealBooking, RealBookingStatus, RealPaymentMethod, ChatMessage, Review } from "../types.ts";

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || "";

let supabaseClient: SupabaseClient | null = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (error) {
    console.error("Failed to initialize Supabase client:", error);
  }
}

// Maps a public.profiles row (see supabase/migrations/20260709000000_init_schema.sql) to the app's UserProfile shape.
// Note: the profiles table has no onboarding_completed, email, or rewards_credit columns yet, so those are
// filled in from the auth user / a local per-user flag rather than persisted server-side (see updateUserProfile).
function mapDbProfileToUserProfile(row: any, email?: string | null): UserProfile {
  const onboardedLocally = localStorage.getItem(`onevillage_onboarded_${row.id}`) === "true";
  return {
    id: row.id,
    role: row.role,
    fullName: row.full_name || "",
    bio: row.bio || undefined,
    phone: row.phone || undefined,
    whatsappNumber: row.whatsapp_number || undefined,
    preferredLanguage: (row.preferred_language as "fr" | "en") || "fr",
    avatarUrl: row.avatar_url || undefined,
    referralCode: row.referral_code || undefined,
    referredBy: row.referred_by || undefined,
    rewardsCredit: 0,
    onboarding_completed: row.role !== "provider" || onboardedLocally,
    email: email || undefined,
  };
}

// Fetches the profiles row for an authenticated Supabase user and maps it to a UserProfile.
// The row is created entirely server-side by the handle_new_user trigger on auth.users (see
// supabase/migrations/20260714050000_handle_new_user_trigger.sql) — there is deliberately no
// client-side insert here. A client-side insert would run as the newly-authenticated user and is
// subject to RLS, which is exactly what caused "new row violates row-level security policy for
// table profiles" on signup; a SECURITY DEFINER trigger bypasses RLS entirely and is the only
// reliable place to do this. If this throws, the trigger didn't run — check that the migration
// above was actually applied to the database.
async function fetchProfile(authUser: { id: string; email?: string | null }): Promise<UserProfile> {
  if (!supabaseClient) throw new Error("Supabase n'est pas configuré.");
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", authUser.id)
    .single();
  if (error || !data) {
    throw new Error(
      "Profil introuvable. Le déclencheur handle_new_user n'a peut-être pas été exécuté sur cette base — contactez le support."
    );
  }
  return mapDbProfileToUserProfile(data, authUser.email);
}

// Maps a public.public_provider_cards row to the app's ServiceProvider shape. This view never
// carries phone/whatsapp/full-address (public-safe by design), but does carry the real rate_unit
// and languages columns now.
function mapCardRowToServiceProvider(row: any): ServiceProvider {
  const categories = (row.category_slugs || []) as string[];
  return {
    id: row.provider_id,
    name: row.provider_name || "",
    businessName: row.business_name || undefined,
    phone: "",
    whatsappNumber: "",
    category: categories[0] || ServiceCategory.HOME_HELP,
    categories,
    neighborhoodId: row.neighborhood_id || "",
    city: row.city || "Bertoua",
    rateFCFA: row.has_fixed_pricing ? Number(row.base_price) || 0 : 0,
    rateUnit: row.rate_unit || "jour",
    description: row.description_fr || row.description_en || "",
    languages: row.languages || [],
    bannerUrl: row.banner_url || undefined,
    rating: Number(row.average_rating) || 5.0,
    reviewCount: Number(row.review_count) || 0,
    verified: !!row.is_verified,
    status: "approved",
    available: true,
    createdAt: row.created_at || undefined,
    subcategories: row.subcategories || undefined,
    customDescriptions: row.custom_descriptions || undefined,
  };
}

// Maps a bookings row (joined with the client's profile, the provider's business name, and the
// category — see getMyBookingsAsClient/getMyBookingsAsProvider) to the app's RealBooking shape.
function mapBookingRow(row: any): RealBooking {
  const clientProfile = Array.isArray(row.client_profile) ? row.client_profile[0] : row.client_profile;
  const providerInfo = Array.isArray(row.provider_info) ? row.provider_info[0] : row.provider_info;
  const category = Array.isArray(row.category) ? row.category[0] : row.category;
  return {
    id: row.id,
    clientId: row.client_id,
    providerId: row.provider_id,
    categoryId: row.category_id ?? null,
    status: row.status,
    paymentMethod: row.payment_method,
    agreedPrice: Number(row.agreed_price) || 0,
    scheduledAt: row.scheduled_at,
    description: row.description || undefined,
    clientConfirmedComplete: !!row.client_confirmed_complete,
    providerConfirmedComplete: !!row.provider_confirmed_complete,
    createdAt: row.created_at,
    clientName: clientProfile?.full_name || undefined,
    clientPhone: clientProfile?.phone || clientProfile?.whatsapp_number || undefined,
    providerBusinessName: providerInfo?.business_name || undefined,
    categoryNameFR: category?.name_fr || undefined,
    categoryNameEN: category?.name_en || undefined,
  };
}

// Maps a chat_messages row to the app's ChatMessage shape. `sender` here is reinterpreted as
// "mine" (rendered right-aligned, reusing the "customer" literal) vs "theirs" ("provider") relative
// to whichever user is viewing — not a literal client/provider role — since ChatInterface is only
// ever opened from the client side in the current app (see App.tsx's onChat wiring).
function mapChatMessageRow(row: any, viewerId: string): ChatMessage {
  const isMine = row.sender_id === viewerId;
  return {
    id: row.id,
    sender: isMine ? "customer" : "provider",
    text: row.message_type === "text" ? row.content || "" : row.content || "",
    imageUrl: row.message_type === "image" ? row.media_url || undefined : undefined,
    audioUrl: row.message_type === "voice" ? row.media_url || undefined : undefined,
    status: "sent",
    createdAt: row.created_at,
  };
}

// Basic wordlist-based profanity filter — a client-side pre-check for instant UX feedback. The
// authoritative enforcement is the check_rating_comment_profanity DB trigger (see
// 20260715020000_chat_realtime_and_ratings.sql), which a direct API call can't bypass.
const BASIC_PROFANITY_WORDLIST = [
  "merde", "putain", "connard", "connasse", "salope", "encul", "nique", "niquer",
  "batard", "bâtard", "pute",
  "fuck", "shit", "bitch", "asshole", "bastard", "cunt", "whore", "slut",
];
function containsProfanity(text: string): boolean {
  const lower = text.toLowerCase();
  return BASIC_PROFANITY_WORDLIST.some((word) => lower.includes(word));
}

// Maps a ratings row (optionally joined with the reviewing client's profile) to the app's Review
// shape.
function mapRatingRow(row: any): Review {
  const clientProfile = Array.isArray(row.client_profile) ? row.client_profile[0] : row.client_profile;
  return {
    id: row.id,
    providerId: row.provider_id,
    bookingId: row.booking_id,
    rating: row.stars,
    text: row.comment || undefined,
    reviewerName: clientProfile?.full_name || "Client de Bertoua",
    createdAt: row.created_at,
    response: row.response || undefined,
  };
}

// In-memory or localStorage-backed simulation of provider data for testing if Supabase is not connected yet.
// Auth is handled entirely by real Supabase (see supabaseService below) and has no mock fallback.
class MockSupabaseService {
  private providersKey = "onevillage_providers";

  constructor() {
    // Seed initial providers if empty in localStorage
    if (!localStorage.getItem(this.providersKey)) {
      localStorage.setItem(this.providersKey, JSON.stringify([]));
    }
  }

  // --- Provider Operations ---
  getProviders(): ServiceProvider[] {
    const data = localStorage.getItem(this.providersKey);
    return data ? JSON.parse(data) : [];
  }

  saveProviders(providers: ServiceProvider[]) {
    localStorage.setItem(this.providersKey, JSON.stringify(providers));
  }

  async submitProviderRegistration(providerData: any): Promise<ServiceProvider> {
    const providers = this.getProviders();
    const existingIndex = providers.findIndex((p) => p.id === providerData.id || p.phone === providerData.phone);
    
    const newProvider: ServiceProvider = {
      id: providerData.id || `p_${Date.now()}`,
      name: providerData.name,
      businessName: providerData.businessName,
      phone: providerData.phone,
      whatsappNumber: providerData.whatsappNumber || providerData.phone,
      category: providerData.category,
      categories: providerData.categories || [providerData.category],
      neighborhoodId: providerData.neighborhoodId,
      city: providerData.city || "Bertoua",
      rateFCFA: Number(providerData.rateFCFA) || 0,
      rateUnit: providerData.rateUnit || "jour",
      description: providerData.description,
      languages: providerData.languages || ["FR"],
      avatarUrl: providerData.avatarUrl || "",
      bannerUrl: providerData.bannerUrl || "",
      idNumber: providerData.idNumber || "",
      idCardFrontUrl: providerData.idCardFrontUrl || "",
      idCardBackUrl: providerData.idCardBackUrl || "",
      status: "pending",
      verified: false,
      available: true,
      rating: 5.0,
      reviewCount: 0,
      bookingsCount: 0,
      created_by_admin: providerData.created_by_admin || false,
    };

    if (existingIndex !== -1) {
      const old = providers[existingIndex];
      const isMaterialChange = 
        old.businessName !== newProvider.businessName || 
        JSON.stringify(old.categories) !== JSON.stringify(newProvider.categories) ||
        old.idNumber !== newProvider.idNumber;
      
      const updatedProvider: ServiceProvider = {
        ...old,
        ...newProvider,
        status: isMaterialChange ? "pending" : old.status,
        verified: isMaterialChange ? false : old.verified,
        rating: old.rating,
        reviewCount: old.reviewCount,
        bookingsCount: old.bookingsCount,
      };
      providers[existingIndex] = updatedProvider;
      this.saveProviders(providers);
      return updatedProvider;
    } else {
      providers.unshift(newProvider);
      this.saveProviders(providers);
      return newProvider;
    }
  }

  async adminApproveProvider(id: string, approve: boolean, rejectionReason?: string): Promise<ServiceProvider> {
    const providers = this.getProviders();
    const index = providers.findIndex((p) => p.id === id);
    if (index === -1) throw new Error("Provider not found");

    providers[index].status = approve ? "approved" : "rejected";
    providers[index].verified = approve;
    if (!approve && rejectionReason) {
      providers[index].rejectionReason = rejectionReason;
    }

    this.saveProviders(providers);
    return providers[index];
  }

  async deleteProvider(id: string): Promise<boolean> {
    const providers = this.getProviders();
    const filtered = providers.filter((p) => p.id !== id);
    this.saveProviders(filtered);
    return true;
  }

  async updateProvider(id: string, updates: Partial<ServiceProvider>): Promise<ServiceProvider> {
    const providers = this.getProviders();
    const index = providers.findIndex((p) => p.id === id);
    if (index === -1) {
      // If it doesn't exist in local simulation but we are modifying it, let's create it
      const newProv: ServiceProvider = {
        id,
        name: updates.name || "",
        phone: updates.phone || "",
        whatsappNumber: updates.whatsappNumber || updates.phone || "",
        category: updates.category || "" as any,
        neighborhoodId: updates.neighborhoodId || "",
        city: updates.city || "Bertoua",
        rateFCFA: updates.rateFCFA || 0,
        rateUnit: updates.rateUnit || "jour",
        description: updates.description || "",
        languages: updates.languages || ["FR"],
        status: updates.status || "approved",
        verified: !!updates.verified,
        available: updates.available !== undefined ? updates.available : true,
        rating: 5.0,
        reviewCount: 0,
        bookingsCount: 0,
      };
      providers.push(newProv);
      this.saveProviders(providers);
      return newProv;
    }

    providers[index] = { ...providers[index], ...updates };
    this.saveProviders(providers);
    return providers[index];
  }

  async compressAndUpload(file: File, bucket: string): Promise<string> {
    const compressedBase64 = await this.compressImage(file);
    console.log(`[One Village SIMULATED STORAGE] Uploaded to bucket ${bucket}: ${file.name}`);
    return compressedBase64;
  }

  private compressImage(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          
          let width = img.width;
          let height = img.height;
          const maxDim = 800;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          ctx?.drawImage(img, 0, 0, width, height);
          
          const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
          resolve(dataUrl);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }
}

export const mockSupabase = new MockSupabaseService();

// Unified service API matching the real / mock capabilities seamlessly
export const supabaseService = {
  isRealConnected(): boolean {
    return supabaseClient !== null;
  },

  // Real Supabase email + password sign-up. Phone is stored as profile data only, never as a
  // login credential (no SMS OTP provider is configured). The role passed here is only ever
  // "client" or "provider" — "admin" cannot be self-assigned at signup (enforced again server-side
  // by the profiles-creation trigger, which is the actual security boundary).
  async signUp(params: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    role: "client" | "provider";
    preferredLanguage: "fr" | "en";
  }): Promise<{ success: boolean; user?: UserProfile; message: string }> {
    if (!supabaseClient) {
      return { success: false, message: "Supabase n'est pas configuré. Contactez l'administrateur." };
    }
    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email: params.email,
        password: params.password,
        options: {
          data: {
            full_name: params.fullName,
            phone: params.phone || null,
            role: params.role,
            preferred_language: params.preferredLanguage,
          },
        },
      });
      if (error) throw error;
      if (!data.user) {
        return { success: false, message: "Inscription impossible. Veuillez réessayer." };
      }
      if (!data.session) {
        // Email confirmation is required before a session (and profile) can be fetched.
        return {
          success: true,
          message: "Compte créé ! Vérifiez votre boîte e-mail pour confirmer votre adresse avant de vous connecter.",
        };
      }
      const user = await fetchProfile(data.user);
      return { success: true, user, message: "Compte créé avec succès !" };
    } catch (err: any) {
      console.error("Supabase sign-up error:", err);
      return { success: false, message: err.message || "Erreur d'inscription." };
    }
  },

  async signIn(email: string, password: string): Promise<{ success: boolean; user?: UserProfile; message: string }> {
    if (!supabaseClient) {
      return { success: false, message: "Supabase n'est pas configuré." };
    }
    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.user) throw new Error("Connexion impossible.");
      const user = await fetchProfile(data.user);
      return { success: true, user, message: "Connecté avec succès !" };
    } catch (err: any) {
      console.error("Supabase sign-in error:", err);
      return { success: false, message: err.message || "Email ou mot de passe incorrect." };
    }
  },

  async signOut(): Promise<void> {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
  },

  // Returns the current session's raw JWT, sent as a Bearer token to server.ts's /api/admin/* routes
  // so requireAdmin can verify it server-side instead of trusting a client-supplied role header.
  async getAccessToken(): Promise<string | null> {
    if (!supabaseClient) return null;
    const { data: { session } } = await supabaseClient.auth.getSession();
    return session?.access_token || null;
  },

  // Resolves the current real Supabase session (if any) into a UserProfile. Used on app mount so a
  // page refresh restores the logged-in state from Supabase, not from localStorage.
  async getSession(): Promise<UserProfile | null> {
    if (!supabaseClient) return null;
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session?.user) return null;
    try {
      return await fetchProfile(session.user);
    } catch (err) {
      console.error("Failed to load profile for active session:", err);
      return null;
    }
  },

  // Subscribes to real Supabase auth state changes (sign in, sign out, token refresh) and returns
  // an unsubscribe function. Fires once immediately with the current state.
  onAuthStateChange(callback: (user: UserProfile | null) => void): () => void {
    if (!supabaseClient) return () => {};
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        callback(null);
        return;
      }
      try {
        callback(await fetchProfile(session.user));
      } catch (err) {
        console.error("Failed to load profile on auth state change:", err);
        callback(null);
      }
    });
    return () => subscription.unsubscribe();
  },

  // Runs as the currently-authenticated admin's own session (only ever called from
  // AdminDashboard.tsx's verification queue). Writing to is_verified/verification_status/
  // rejection_reason is now also gated by a BEFORE UPDATE trigger on service_providers (see
  // 20260714030000_protect_verification_columns.sql) that raises an exception unless
  // profiles.role = 'admin' for auth.uid() — this call satisfies that since it's admin-only,
  // no change needed here beyond this note.
  async verifyProvider(id: string, approve: boolean, rejectionReason?: string): Promise<ServiceProvider> {
    if (supabaseClient) {
      const status = approve ? "approved" : "rejected";
      const { data, error } = await supabaseClient
        .from("service_providers")
        .update({
          verification_status: status,
          is_verified: approve,
          rejection_reason: approve ? null : rejectionReason || null,
        })
        .eq("user_id", id)
        .select()
        .single();
      if (error) throw error;
      return data as ServiceProvider;
    }
    return mockSupabase.adminApproveProvider(id, approve, rejectionReason);
  },

  // Real Supabase read of the public-safe browse/search feed (see public_provider_cards view).
  async getPublicProviderCards(): Promise<ServiceProvider[]> {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient.from("public_provider_cards").select("*");
    if (error) {
      console.error("Failed to load public provider cards:", error);
      return [];
    }
    return (data || []).map(mapCardRowToServiceProvider);
  },

  // Fetches the full provider record for a single provider profile page. Tries the authenticated,
  // RLS-scoped service_providers query first (works for: any authenticated user on an approved
  // provider, the provider's own row regardless of status, or an admin on any row). Falls back to
  // the public_provider_cards view for anonymous/guest visitors browsing an approved provider.
  async getProviderFullRecord(id: string): Promise<ServiceProvider | null> {
    if (!supabaseClient) return null;

    const { data, error } = await supabaseClient
      .from("service_providers")
      .select(`
        user_id, business_name, description_fr, description_en, banner_url, city, neighborhood_id,
        is_verified, verification_status, has_fixed_pricing, base_price, rate_unit, languages,
        rejection_reason, cv_url, average_rating, review_count,
        profiles ( full_name, phone, whatsapp_number, avatar_url ),
        provider_services ( service_categories ( slug ) )
      `)
      .eq("user_id", id)
      .maybeSingle();

    if (error || !data) {
      const { data: cardData, error: cardError } = await supabaseClient
        .from("public_provider_cards")
        .select("*")
        .eq("provider_id", id)
        .maybeSingle();
      if (cardError || !cardData) return null;
      return mapCardRowToServiceProvider(cardData);
    }

    const profile: any = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;
    const categories = ((data.provider_services || []) as any[])
      .map((ps) => ps.service_categories?.slug)
      .filter(Boolean) as ServiceCategory[];

    // If this provider has no confirmed category yet, check for a pending "Autre / Other"
    // suggestion they submitted at registration so the profile can show "pending review" instead
    // of silently showing nothing.
    let pendingCategoryName: string | undefined;
    if (categories.length === 0) {
      const { data: suggestion } = await supabaseClient
        .from("category_suggestions")
        .select("category_name")
        .eq("provider_id", id)
        .eq("status", "pending")
        .maybeSingle();
      pendingCategoryName = suggestion?.category_name || undefined;
    }

    return {
      id: data.user_id,
      name: profile?.full_name || "",
      businessName: data.business_name || undefined,
      phone: profile?.phone || "",
      whatsappNumber: profile?.whatsapp_number || profile?.phone || "",
      category: categories[0] || ServiceCategory.HOME_HELP,
      categories,
      neighborhoodId: data.neighborhood_id || "",
      city: data.city || "Bertoua",
      rateFCFA: data.has_fixed_pricing ? Number(data.base_price) || 0 : 0,
      rateUnit: data.rate_unit || "jour",
      description: data.description_fr || data.description_en || "",
      languages: data.languages || [],
      avatarUrl: profile?.avatar_url || undefined,
      bannerUrl: data.banner_url || undefined,
      rating: Number(data.average_rating) || 5.0,
      reviewCount: Number(data.review_count) || 0,
      verified: !!data.is_verified,
      status: data.verification_status,
      rejectionReason: data.rejection_reason || undefined,
      cvUrl: data.cv_url || undefined,
      pendingCategoryName,
      available: true,
    };
  },

  // Admin-only: pending service_providers rows awaiting ID verification, joined with the owner's
  // profile and category, with signed (short-lived) URLs resolved for the private ID card images.
  // Requires the "Admins can update any service provider" / admin SELECT RLS policy (see migration).
  async getPendingProviders(): Promise<Array<{
    id: string;
    name: string;
    phone: string;
    businessName?: string;
    neighborhoodId: string;
    idNumber: string;
    idCardFrontUrl: string | null;
    idCardBackUrl: string | null;
    category: string;
    rateFCFA: number;
    rateUnit: string;
  }>> {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient
      .from("service_providers")
      .select(`
        user_id, business_name, neighborhood_id, id_card_number, id_card_front_url, id_card_back_url,
        base_price, has_fixed_pricing,
        profiles ( full_name, phone ),
        provider_services ( service_categories ( slug ) )
      `)
      .eq("verification_status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load pending providers:", error);
      return [];
    }

    return Promise.all(
      (data || []).map(async (row: any) => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        const [frontUrl, backUrl] = await Promise.all([
          row.id_card_front_url ? supabaseService.getIdVerificationSignedUrl(row.id_card_front_url) : null,
          row.id_card_back_url ? supabaseService.getIdVerificationSignedUrl(row.id_card_back_url) : null,
        ]);
        return {
          id: row.user_id,
          name: profile?.full_name || "",
          phone: profile?.phone || "",
          businessName: row.business_name || undefined,
          neighborhoodId: row.neighborhood_id || "",
          idNumber: row.id_card_number || "",
          idCardFrontUrl: frontUrl,
          idCardBackUrl: backUrl,
          category: row.provider_services?.[0]?.service_categories?.slug || "",
          rateFCFA: row.has_fixed_pricing ? Number(row.base_price) || 0 : 0,
          rateUnit: "jour",
        };
      })
    );
  },

  // Resolves a private id-verification storage path into a short-lived signed URL for display.
  async getIdVerificationSignedUrl(path: string): Promise<string | null> {
    if (!supabaseClient || !path) return null;
    const { data, error } = await supabaseClient.storage.from("id-verification").createSignedUrl(path, 300);
    if (error) {
      console.error("Failed to sign ID verification file:", error);
      return null;
    }
    return data.signedUrl;
  },

  // Admin-only: every registered provider (any verification status) for the "Répertoire des
  // Services" directory table — unlike getPendingProviders() (pending only) or
  // getPublicProviderCards() (approved only, public-safe fields only). One row per provider, with
  // ALL of that provider's categories/subcategories joined and flattened into display strings plus
  // a raw slug array for filtering.
  async getAllProvidersDirectory(): Promise<Array<{
    id: string;
    name: string;
    businessName?: string;
    categorySlugs: string[];
    categoryDisplay: string;
    subcategoryDisplay: string;
    neighborhoodId: string;
    city: string;
    verificationStatus: "pending" | "approved" | "rejected";
    createdAt: string;
    averageRating: number;
    reviewCount: number;
  }>> {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient
      .from("service_providers")
      .select(`
        user_id, business_name, city, neighborhood_id, verification_status, created_at,
        average_rating, review_count,
        profiles ( full_name ),
        provider_services ( subcategory, service_categories ( slug, name_fr, name_en ) )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load provider directory:", error);
      return [];
    }

    return (data || []).map((row: any) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      const services: any[] = Array.isArray(row.provider_services) ? row.provider_services : (row.provider_services ? [row.provider_services] : []);
      const categorySlugs = services.map((ps) => ps.service_categories?.slug).filter(Boolean);
      const categoryDisplay = services.map((ps) => ps.service_categories?.name_fr).filter(Boolean).join(", ");
      const subcategoryDisplay = services.map((ps) => ps.subcategory).filter(Boolean).join(", ");
      return {
        id: row.user_id,
        name: profile?.full_name || "",
        businessName: row.business_name || undefined,
        categorySlugs,
        categoryDisplay,
        subcategoryDisplay,
        neighborhoodId: row.neighborhood_id || "",
        city: row.city || "Bertoua",
        verificationStatus: row.verification_status,
        createdAt: row.created_at,
        averageRating: Number(row.average_rating) || 0,
        reviewCount: Number(row.review_count) || 0,
      };
    });
  },

  // Admin-only: everything real that's been collected about a single provider, for the "Répertoire"
  // detail panel — pulls only columns that actually exist on service_providers/profiles (no
  // invented fields; e.g. there is no "gender" column anywhere in the schema or registration wizard,
  // so it's simply absent here rather than faked).
  async getProviderAdminDetail(id: string): Promise<{
    id: string;
    name: string;
    businessName?: string;
    phone: string;
    whatsappNumber?: string;
    bio?: string;
    languages: string[];
    city: string;
    neighborhoodId: string;
    descriptionFr?: string;
    descriptionEn?: string;
    hasFixedPricing: boolean;
    basePrice?: number;
    currency?: string;
    rateUnit?: string;
    idNumber?: string;
    idCardFrontUrl: string | null;
    idCardBackUrl: string | null;
    verificationStatus: "pending" | "approved" | "rejected";
    isVerified: boolean;
    rejectionReason?: string;
    averageRating: number;
    reviewCount: number;
    createdAt: string;
    categories: Array<{ slug: string; nameFr: string; nameEn: string; subcategory?: string; customDescription?: string }>;
  } | null> {
    if (!supabaseClient) return null;

    const { data, error } = await supabaseClient
      .from("service_providers")
      .select(`
        user_id, business_name, description_fr, description_en, city, neighborhood_id,
        is_verified, verification_status, rejection_reason, has_fixed_pricing, base_price, currency,
        rate_unit, languages, id_card_number, id_card_front_url, id_card_back_url,
        average_rating, review_count, created_at,
        profiles ( full_name, phone, whatsapp_number, bio ),
        provider_services ( subcategory, custom_description, service_categories ( slug, name_fr, name_en ) )
      `)
      .eq("user_id", id)
      .maybeSingle();

    if (error || !data) {
      console.error("Failed to load provider admin detail:", error);
      return null;
    }

    const profile: any = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;
    const [idCardFrontUrl, idCardBackUrl] = await Promise.all([
      data.id_card_front_url ? supabaseService.getIdVerificationSignedUrl(data.id_card_front_url) : null,
      data.id_card_back_url ? supabaseService.getIdVerificationSignedUrl(data.id_card_back_url) : null,
    ]);
    const services: any[] = Array.isArray(data.provider_services) ? data.provider_services : (data.provider_services ? [data.provider_services] : []);

    return {
      id: data.user_id,
      name: profile?.full_name || "",
      businessName: data.business_name || undefined,
      phone: profile?.phone || "",
      whatsappNumber: profile?.whatsapp_number || undefined,
      bio: profile?.bio || undefined,
      languages: data.languages || [],
      city: data.city || "Bertoua",
      neighborhoodId: data.neighborhood_id || "",
      descriptionFr: data.description_fr || undefined,
      descriptionEn: data.description_en || undefined,
      hasFixedPricing: !!data.has_fixed_pricing,
      basePrice: data.base_price != null ? Number(data.base_price) : undefined,
      currency: data.currency || undefined,
      rateUnit: data.rate_unit || undefined,
      idNumber: data.id_card_number || undefined,
      idCardFrontUrl,
      idCardBackUrl,
      verificationStatus: data.verification_status,
      isVerified: !!data.is_verified,
      rejectionReason: data.rejection_reason || undefined,
      averageRating: Number(data.average_rating) || 0,
      reviewCount: Number(data.review_count) || 0,
      createdAt: data.created_at,
      categories: services.map((ps) => ({
        slug: ps.service_categories?.slug || "",
        nameFr: ps.service_categories?.name_fr || "",
        nameEn: ps.service_categories?.name_en || "",
        subcategory: ps.subcategory || undefined,
        customDescription: ps.custom_description || undefined,
      })),
    };
  },

  // Admin-only: live counts/aggregates for the "Vue d'Ensemble" overview tab. Computed client-side
  // from a handful of full-table reads (this app's scale makes that entirely fine — no new view or
  // column was needed) rather than a dedicated SQL aggregate, since every RLS policy already allows
  // an admin session to read all of service_providers/bookings/ratings.
  async getAdminOverviewStats(): Promise<{
    providersByStatus: { pending: number; approved: number; rejected: number };
    providersByCategory: Array<{ slug: string; nameFr: string; nameEn: string; count: number }>;
    registrationsLast30Days: Array<{ date: string; count: number }>;
    bookingsByStatus: Array<{ status: string; count: number }>;
    ratingDistribution: Array<{ stars: number; count: number }>;
    topByBookings: Array<{ id: string; name: string; businessName?: string; bookingsCount: number }>;
    topByRating: Array<{ id: string; name: string; businessName?: string; averageRating: number; reviewCount: number }>;
  } | null> {
    if (!supabaseClient) return null;

    const [providersRes, bookingsRes, ratingsRes] = await Promise.all([
      supabaseClient.from("service_providers").select(`
        user_id, business_name, verification_status, created_at, average_rating, review_count,
        profiles ( full_name ),
        provider_services ( service_categories ( slug, name_fr, name_en ) )
      `),
      supabaseClient.from("bookings").select("provider_id, status"),
      supabaseClient.from("ratings").select("stars"),
    ]);

    if (providersRes.error) {
      console.error("Failed to load overview stats:", providersRes.error);
      return null;
    }
    const providerRows = providersRes.data || [];
    const bookingRows = bookingsRes.data || [];
    const ratingRows = ratingsRes.data || [];

    const providersByStatus = { pending: 0, approved: 0, rejected: 0 };
    providerRows.forEach((p: any) => {
      const s = p.verification_status as "pending" | "approved" | "rejected";
      if (s in providersByStatus) providersByStatus[s]++;
    });

    const catMap = new Map<string, { slug: string; nameFr: string; nameEn: string; count: number }>();
    providerRows.forEach((p: any) => {
      const services: any[] = Array.isArray(p.provider_services) ? p.provider_services : (p.provider_services ? [p.provider_services] : []);
      services.forEach((ps) => {
        const cat = ps.service_categories;
        if (!cat?.slug) return;
        const existing = catMap.get(cat.slug);
        if (existing) existing.count++;
        else catMap.set(cat.slug, { slug: cat.slug, nameFr: cat.name_fr, nameEn: cat.name_en, count: 1 });
      });
    });
    const providersByCategory = Array.from(catMap.values()).sort((a, b) => b.count - a.count);

    // Full 30-day date range built up front so days with zero registrations still show as 0 on the
    // line chart instead of silently disappearing from the x-axis.
    const dayMap = new Map<string, number>();
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dayMap.set(d.toISOString().slice(0, 10), 0);
    }
    providerRows.forEach((p: any) => {
      const day = (p.created_at || "").slice(0, 10);
      if (dayMap.has(day)) dayMap.set(day, (dayMap.get(day) || 0) + 1);
    });
    const registrationsLast30Days = Array.from(dayMap.entries()).map(([date, count]) => ({ date, count }));

    const bookingStatusMap = new Map<string, number>();
    bookingRows.forEach((b: any) => {
      bookingStatusMap.set(b.status, (bookingStatusMap.get(b.status) || 0) + 1);
    });
    const bookingsByStatus = Array.from(bookingStatusMap.entries()).map(([status, count]) => ({ status, count }));

    const starMap = new Map<number, number>([[1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]);
    ratingRows.forEach((r: any) => {
      const s = Math.round(r.stars);
      if (starMap.has(s)) starMap.set(s, (starMap.get(s) || 0) + 1);
    });
    const ratingDistribution = Array.from(starMap.entries()).map(([stars, count]) => ({ stars, count }));

    const bookingCountByProvider = new Map<string, number>();
    bookingRows.forEach((b: any) => {
      bookingCountByProvider.set(b.provider_id, (bookingCountByProvider.get(b.provider_id) || 0) + 1);
    });
    const topByBookings = providerRows
      .map((p: any) => {
        const profile = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
        return {
          id: p.user_id,
          name: profile?.full_name || "",
          businessName: p.business_name || undefined,
          bookingsCount: bookingCountByProvider.get(p.user_id) || 0,
        };
      })
      .filter((p: any) => p.bookingsCount > 0)
      .sort((a: any, b: any) => b.bookingsCount - a.bookingsCount)
      .slice(0, 5);

    // Only providers with at least one real review — a provider with 0 reviews still defaults to
    // 5.0, which isn't a meaningful "top rated" signal and would otherwise crowd out real ratings.
    const topByRating = providerRows
      .map((p: any) => {
        const profile = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
        return {
          id: p.user_id,
          name: profile?.full_name || "",
          businessName: p.business_name || undefined,
          averageRating: Number(p.average_rating) || 0,
          reviewCount: Number(p.review_count) || 0,
        };
      })
      .filter((p: any) => p.reviewCount > 0)
      .sort((a: any, b: any) => b.averageRating - a.averageRating || b.reviewCount - a.reviewCount)
      .slice(0, 5);

    return {
      providersByStatus,
      providersByCategory,
      registrationsLast30Days,
      bookingsByStatus,
      ratingDistribution,
      topByBookings,
      topByRating,
    };
  },

  // Persists the subset of Partial<UserProfile> that has real columns on public.profiles.
  // onboarding_completed, email and rewardsCredit have no column there yet: onboarding_completed is
  // tracked with a local per-user flag (see mapDbProfileToUserProfile), email lives on auth.users
  // already, and rewardsCredit/referral wiring is left for the referrals feature work, not this step.
  async updateUserProfile(profile: Partial<UserProfile>): Promise<UserProfile> {
    if (!supabaseClient) {
      throw new Error("Supabase n'est pas configuré.");
    }
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("Non connecté.");

    const dbPatch: Record<string, any> = {};
    if (profile.fullName !== undefined) dbPatch.full_name = profile.fullName;
    if (profile.bio !== undefined) dbPatch.bio = profile.bio;
    if (profile.phone !== undefined) dbPatch.phone = profile.phone;
    if (profile.whatsappNumber !== undefined) dbPatch.whatsapp_number = profile.whatsappNumber;
    if (profile.preferredLanguage !== undefined) dbPatch.preferred_language = profile.preferredLanguage;
    if (profile.avatarUrl !== undefined) dbPatch.avatar_url = profile.avatarUrl;
    if (profile.role !== undefined) dbPatch.role = profile.role;

    // profile.referredBy holds the short referral CODE the caller typed in (e.g. "OV-123"), not a
    // UUID — referred_by is a FK to another profile's id, so it must be resolved first. Throws
    // instead of silently dropping it so a mistyped code surfaces as an error, not a no-op.
    if (profile.referredBy) {
      const { data: referrer, error: referrerError } = await supabaseClient
        .from("profiles")
        .select("id")
        .eq("referral_code", profile.referredBy)
        .maybeSingle();
      if (referrerError || !referrer) {
        throw new Error("Code de parrainage invalide. Vérifiez le code et réessayez.");
      }
      if (referrer.id === user.id) {
        throw new Error("Vous ne pouvez pas utiliser votre propre code de parrainage.");
      }
      dbPatch.referred_by = referrer.id;
    }

    if (Object.keys(dbPatch).length > 0) {
      const { error } = await supabaseClient.from("profiles").update(dbPatch).eq("id", user.id);
      if (error) throw error;
    }

    if (profile.onboarding_completed !== undefined) {
      localStorage.setItem(`onevillage_onboarded_${user.id}`, String(profile.onboarding_completed));
    }

    return fetchProfile(user);
  },

  // Uploads a provider media file to a Supabase Storage bucket at "<userId>/<filename>" (required
  // for the storage RLS folder-ownership policies — see migrations). "provider-media" is public
  // (avatars/banners) and returns a public URL; "id-verification"/"provider-documents" are private
  // and return just the storage path, which must be resolved via a signed URL to actually view it.
  // Non-image documents (e.g. a PDF CV) skip the client-side image compression step.
  async uploadProviderMedia(
    bucket: "provider-media" | "id-verification" | "provider-documents",
    userId: string,
    file: File,
    filename: string
  ): Promise<string> {
    const isImage = file.type.startsWith("image/");
    if (!supabaseClient) {
      return isImage ? mockSupabase.compressAndUpload(file, bucket) : `${userId}/${filename}`;
    }

    const path = `${userId}/${filename}`;
    let blob: Blob = file;
    if (isImage) {
      const compressedBase64 = await mockSupabase.compressAndUpload(file, bucket);
      const res = await fetch(compressedBase64);
      blob = await res.blob();
    }

    const { error } = await supabaseClient.storage.from(bucket).upload(path, blob, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });
    if (error) throw error;

    if (bucket === "id-verification" || bucket === "provider-documents") {
      return path;
    }

    const { data: { publicUrl } } = supabaseClient.storage.from(bucket).getPublicUrl(path);
    return publicUrl;
  },

  // Removes a previously-uploaded file from storage and (optionally) clears the caller-supplied DB
  // reference. Used by ProfileSettings.tsx for the "remove" side of avatar/ID card/CV management.
  async removeStorageFile(bucket: "provider-media" | "id-verification" | "provider-documents", path: string): Promise<void> {
    if (!supabaseClient || !path) return;
    const { error } = await supabaseClient.storage.from(bucket).remove([path]);
    if (error) throw error;
  },

  // Resolves a private storage path (ID card or CV) into a short-lived signed URL for display.
  async getPrivateFileSignedUrl(bucket: "id-verification" | "provider-documents", path: string): Promise<string | null> {
    if (!supabaseClient || !path) return null;
    const { data, error } = await supabaseClient.storage.from(bucket).createSignedUrl(path, 300);
    if (error) {
      console.error("Failed to sign private file:", error);
      return null;
    }
    return data.signedUrl;
  },

  // Own-profile-only fetch used by ProfileSettings.tsx: includes ID card / CV paths (resolved to
  // signed URLs) that getProviderFullRecord deliberately omits, since that function's result can be
  // shown to OTHER authenticated users viewing an approved provider's public profile — exposing ID
  // document links there would leak PII broadly. This must only ever be called with the caller's
  // own userId.
  async getMyServiceProviderForEditing(userId: string): Promise<{
    businessName: string;
    descriptionFR: string;
    descriptionEN: string;
    rateUnit: string;
    basePrice: number;
    hasFixedPricing: boolean;
    languages: string[];
    bannerUrl: string | null;
    idCardFrontPath: string | null;
    idCardBackPath: string | null;
    cvPath: string | null;
    idCardFrontSignedUrl: string | null;
    idCardBackSignedUrl: string | null;
    cvSignedUrl: string | null;
  } | null> {
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient
      .from("service_providers")
      .select(
        "business_name, description_fr, description_en, rate_unit, base_price, has_fixed_pricing, languages, banner_url, id_card_front_url, id_card_back_url, cv_url"
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;

    const [idCardFrontSignedUrl, idCardBackSignedUrl, cvSignedUrl] = await Promise.all([
      data.id_card_front_url ? supabaseService.getPrivateFileSignedUrl("id-verification", data.id_card_front_url) : null,
      data.id_card_back_url ? supabaseService.getPrivateFileSignedUrl("id-verification", data.id_card_back_url) : null,
      data.cv_url ? supabaseService.getPrivateFileSignedUrl("provider-documents", data.cv_url) : null,
    ]);

    return {
      businessName: data.business_name || "",
      descriptionFR: data.description_fr || "",
      descriptionEN: data.description_en || "",
      rateUnit: data.rate_unit || "jour",
      basePrice: Number(data.base_price) || 0,
      hasFixedPricing: !!data.has_fixed_pricing,
      languages: data.languages || [],
      bannerUrl: data.banner_url || null,
      idCardFrontPath: data.id_card_front_url || null,
      idCardBackPath: data.id_card_back_url || null,
      cvPath: data.cv_url || null,
      idCardFrontSignedUrl,
      idCardBackSignedUrl,
      cvSignedUrl,
    };
  },

  // ─── PROFESSIONAL PROFILES (real Supabase — see
  // 20260719020000_professional_network_foundation.sql). Any logged-in user can have one,
  // regardless of client/provider role. ───

  // Own-profile-only fetch for the editor — includes the raw cv_url storage path resolved to a
  // signed URL, same pattern as getMyServiceProviderForEditing. Returns null if this user hasn't
  // created one yet (not an error — the editor uses this to show the "create yours" prompt).
  async getMyProfessionalProfile(userId: string): Promise<{
    headline: string;
    bio: string;
    skills: string[];
    yearsExperience: number | null;
    availabilityStatus: "open_to_work" | "employed" | "not_looking";
    cvPath: string | null;
    cvSignedUrl: string | null;
    portfolioLinks: Array<{ label: string; url: string }>;
  } | null> {
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient
      .from("professional_profiles")
      .select("headline, bio, skills, years_experience, availability_status, cv_url, portfolio_links")
      .eq("user_id", userId)
      .maybeSingle();
    // Part B bug fix: a real fetch error must NOT look identical to "no profile yet" — the editor
    // uses a null return to show the "create your profile" prompt, so silently returning null here
    // on a transient error risked the user creating a fresh (blank) profile that then overwrites
    // their real one on save. Only a genuinely missing row (no error, no data) returns null now.
    if (error) {
      console.error("Failed to load own professional profile:", error);
      throw error;
    }
    if (!data) return null;

    const cvSignedUrl = data.cv_url ? await supabaseService.getPrivateFileSignedUrl("provider-documents", data.cv_url) : null;

    return {
      headline: data.headline || "",
      bio: data.bio || "",
      skills: data.skills || [],
      yearsExperience: data.years_experience,
      availabilityStatus: data.availability_status,
      cvPath: data.cv_url || null,
      cvSignedUrl,
      portfolioLinks: Array.isArray(data.portfolio_links) ? data.portfolio_links : [],
    };
  },

  // Creates or updates the caller's own professional profile — user_id is the table's primary key
  // (one row per person), so this is a plain upsert rather than separate insert/update paths.
  // cvPath: omit the key entirely to leave the stored CV unchanged, pass null to clear it, or a
  // storage path string to set/replace it.
  async upsertProfessionalProfile(
    userId: string,
    input: {
      headline: string;
      bio: string;
      skills: string[];
      yearsExperience: number | null;
      availabilityStatus: "open_to_work" | "employed" | "not_looking";
      cvPath?: string | null;
      portfolioLinks: Array<{ label: string; url: string }>;
    }
  ): Promise<void> {
    if (!supabaseClient) throw new Error("Supabase n'est pas configuré.");
    const payload: Record<string, any> = {
      user_id: userId,
      headline: input.headline || null,
      bio: input.bio || null,
      skills: input.skills,
      years_experience: input.yearsExperience,
      availability_status: input.availabilityStatus,
      portfolio_links: input.portfolioLinks,
    };
    if (input.cvPath !== undefined) payload.cv_url = input.cvPath;

    const { error } = await supabaseClient.from("professional_profiles").upsert(payload, { onConflict: "user_id" });
    if (error) throw error;
  },

  // Deletes the caller's own professional profile row entirely. Does not remove the linked CV file
  // from storage — same division of responsibility as provider CV removal (ProfileSettings.tsx
  // calls removeStorageFile separately when the caller wants that too).
  async deleteProfessionalProfile(userId: string): Promise<void> {
    if (!supabaseClient) throw new Error("Supabase n'est pas configuré.");
    const { error } = await supabaseClient.from("professional_profiles").delete().eq("user_id", userId);
    if (error) throw error;
  },

  // Admin-only: every professional profile regardless of completeness — "Professional profiles are
  // readable by everyone" is USING (true) at the RLS layer (see
  // 20260719020000_professional_network_foundation.sql), so an admin already sees incomplete/
  // draft profiles here that getAllPublicProfessionalProfiles()/getPublicProfessionalProfile()
  // deliberately hide from ordinary visitors behind the headline+bio completeness bar.
  async getAllProfessionalProfilesAdmin(): Promise<Array<{
    userId: string;
    fullName: string;
    avatarUrl: string | null;
    headline: string;
    availabilityStatus: "open_to_work" | "employed" | "not_looking";
    hasCv: boolean;
    isComplete: boolean;
    createdAt: string;
  }>> {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient
      .from("professional_profiles")
      .select("user_id, headline, bio, availability_status, cv_url, created_at, profiles ( full_name, avatar_url )")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Failed to load admin professional profiles list:", error);
      return [];
    }
    return (data || []).map((row: any) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        userId: row.user_id,
        fullName: profile?.full_name || "",
        avatarUrl: profile?.avatar_url || null,
        headline: row.headline || "",
        availabilityStatus: row.availability_status,
        hasCv: !!row.cv_url,
        isComplete: !!(row.headline?.trim() && row.bio?.trim()),
        createdAt: row.created_at,
      };
    });
  },

  // Admin-only full detail — same data as the public view (see getPublicProfessionalProfile) but
  // bypasses the headline+bio completeness gate and adds contact info, since an admin needs to see
  // an INCOMPLETE profile to moderate it and may need to reach out to the person.
  async getProfessionalProfileAdminDetail(userId: string): Promise<{
    userId: string;
    fullName: string;
    phone: string | null;
    avatarUrl: string | null;
    headline: string;
    bio: string;
    skills: string[];
    yearsExperience: number | null;
    availabilityStatus: "open_to_work" | "employed" | "not_looking";
    cvSignedUrl: string | null;
    portfolioLinks: Array<{ label: string; url: string }>;
    createdAt: string;
  } | null> {
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient
      .from("professional_profiles")
      .select("headline, bio, skills, years_experience, availability_status, cv_url, portfolio_links, created_at, profiles ( full_name, phone, avatar_url )")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) {
      if (error) console.error("Failed to load admin professional profile detail:", error);
      return null;
    }
    const profile: any = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;
    const cvSignedUrl = data.cv_url ? await supabaseService.getPrivateFileSignedUrl("provider-documents", data.cv_url) : null;
    return {
      userId,
      fullName: profile?.full_name || "",
      phone: profile?.phone || null,
      avatarUrl: profile?.avatar_url || null,
      headline: data.headline || "",
      bio: data.bio || "",
      skills: data.skills || [],
      yearsExperience: data.years_experience,
      availabilityStatus: data.availability_status,
      cvSignedUrl,
      portfolioLinks: Array.isArray(data.portfolio_links) ? data.portfolio_links : [],
      createdAt: data.created_at,
    };
  },

  // Public view fetch. Only returns a profile that clears the minimum completeness bar — headline
  // AND bio both filled in (see Item 3: a deliberate choice over a separate published/draft flag,
  // since professional_profiles' schema isn't touched in this step and a completeness check needs
  // no new column). Also reports whether this person is ALSO a registered service provider — that
  // lookup naturally respects the existing service_providers RLS, so an unapproved provider's
  // identity isn't exposed to a random visitor, only to the owner or an admin.
  async getPublicProfessionalProfile(userId: string): Promise<{
    fullName: string;
    avatarUrl: string | null;
    headline: string;
    bio: string;
    skills: string[];
    yearsExperience: number | null;
    availabilityStatus: "open_to_work" | "employed" | "not_looking";
    cvSignedUrl: string | null;
    portfolioLinks: Array<{ label: string; url: string }>;
    isServiceProvider: boolean;
  } | null> {
    if (!supabaseClient) return null;

    const { data, error } = await supabaseClient
      .from("professional_profiles")
      .select("headline, bio, skills, years_experience, availability_status, cv_url, portfolio_links, profiles ( full_name, avatar_url )")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;

    if (!data.headline?.trim() || !data.bio?.trim()) return null;

    const profile: any = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;
    const cvSignedUrl = data.cv_url ? await supabaseService.getPrivateFileSignedUrl("provider-documents", data.cv_url) : null;

    const { data: providerRow } = await supabaseClient
      .from("service_providers")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    return {
      fullName: profile?.full_name || "",
      avatarUrl: profile?.avatar_url || null,
      headline: data.headline,
      bio: data.bio,
      skills: data.skills || [],
      yearsExperience: data.years_experience,
      availabilityStatus: data.availability_status,
      cvSignedUrl,
      portfolioLinks: Array.isArray(data.portfolio_links) ? data.portfolio_links : [],
      isServiceProvider: !!providerRow,
    };
  },

  // ─── COMPANIES (real Supabase — see 20260719020000_professional_network_foundation.sql). Any
  // logged-in user may own one or more company pages — no one-per-user limit. ───

  // Lightweight list for the "Pages Entreprise" management tab — just enough to render a picker
  // (logo/name/industry) plus a link into the full editor/public page.
  async getMyCompanies(ownerId: string): Promise<Array<{ id: string; name: string; industry: string | null; logoUrl: string | null }>> {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient
      .from("companies")
      .select("id, name, industry, logo_url")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Failed to load owned companies:", error);
      return [];
    }
    return (data || []).map((row: any) => ({ id: row.id, name: row.name, industry: row.industry, logoUrl: row.logo_url }));
  },

  // Full record for the editor (create form re-uses the same shape with empty defaults).
  async getCompanyForEditing(companyId: string): Promise<{
    id: string;
    ownerId: string;
    name: string;
    description: string;
    logoUrl: string | null;
    coverImageUrl: string | null;
    industry: string;
    neighborhoodId: string;
    website: string;
    socialLinks: Array<{ label: string; url: string }>;
  } | null> {
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient
      .from("companies")
      .select("id, owner_id, name, description, logo_url, cover_image_url, industry, neighborhood_id, website, social_links")
      .eq("id", companyId)
      .maybeSingle();
    // Part B bug fix: distinguish a real fetch error (thrown, caught by the editor) from a
    // genuinely-missing row (null) — previously both collapsed to null, and the editor rendered an
    // empty, save-ready form for either case, risking a blank overwrite of a real company's data.
    if (error) {
      console.error("Failed to load company for editing:", error);
      throw error;
    }
    if (!data) return null;
    return {
      id: data.id,
      ownerId: data.owner_id,
      name: data.name,
      description: data.description || "",
      logoUrl: data.logo_url,
      coverImageUrl: data.cover_image_url,
      industry: data.industry || "",
      neighborhoodId: data.neighborhood_id || "",
      website: data.website || "",
      socialLinks: Array.isArray(data.social_links) ? data.social_links : [],
    };
  },

  async createCompany(
    ownerId: string,
    input: {
      name: string;
      description: string;
      industry: string;
      neighborhoodId: string;
      website: string;
      logoUrl?: string | null;
      coverImageUrl?: string | null;
      socialLinks: Array<{ label: string; url: string }>;
    }
  ): Promise<string> {
    if (!supabaseClient) throw new Error("Supabase n'est pas configuré.");
    const { data, error } = await supabaseClient
      .from("companies")
      .insert({
        owner_id: ownerId,
        name: input.name,
        description: input.description || null,
        industry: input.industry || null,
        neighborhood_id: input.neighborhoodId || null,
        website: input.website || null,
        logo_url: input.logoUrl || null,
        cover_image_url: input.coverImageUrl || null,
        social_links: input.socialLinks,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  },

  // logoUrl/coverImageUrl: omit to leave unchanged, null to clear, a URL string to replace.
  async updateCompany(
    companyId: string,
    input: {
      name: string;
      description: string;
      industry: string;
      neighborhoodId: string;
      website: string;
      logoUrl?: string | null;
      coverImageUrl?: string | null;
      socialLinks: Array<{ label: string; url: string }>;
    }
  ): Promise<void> {
    if (!supabaseClient) throw new Error("Supabase n'est pas configuré.");
    const payload: Record<string, any> = {
      name: input.name,
      description: input.description || null,
      industry: input.industry || null,
      neighborhood_id: input.neighborhoodId || null,
      website: input.website || null,
      social_links: input.socialLinks,
    };
    if (input.logoUrl !== undefined) payload.logo_url = input.logoUrl;
    if (input.coverImageUrl !== undefined) payload.cover_image_url = input.coverImageUrl;

    const { error } = await supabaseClient.from("companies").update(payload).eq("id", companyId);
    if (error) throw error;
  },

  async deleteCompany(companyId: string): Promise<void> {
    if (!supabaseClient) throw new Error("Supabase n'est pas configuré.");
    const { error } = await supabaseClient.from("companies").delete().eq("id", companyId);
    if (error) throw error;
  },

  // Public view fetch — companies have no completeness/visibility gate (unlike professional
  // profiles), matching the "Companies are readable by everyone" RLS policy as-is. Also resolves
  // the count of OPEN job postings for the "Offres d'emploi" placeholder section (Item 3): this
  // queries the real job_postings table, so once job-posting creation ships (a later step) this
  // count starts reflecting real openings automatically — no further change to this page needed.
  async getPublicCompany(companyId: string): Promise<{
    id: string;
    ownerId: string;
    name: string;
    description: string;
    logoUrl: string | null;
    coverImageUrl: string | null;
    industry: string;
    neighborhoodId: string;
    website: string;
    socialLinks: Array<{ label: string; url: string }>;
    openJobCount: number;
  } | null> {
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient
      .from("companies")
      .select("id, owner_id, name, description, logo_url, cover_image_url, industry, neighborhood_id, website, social_links")
      .eq("id", companyId)
      .maybeSingle();
    if (error || !data) return null;

    const { count } = await supabaseClient
      .from("job_postings")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "open");

    return {
      id: data.id,
      ownerId: data.owner_id,
      name: data.name,
      description: data.description || "",
      logoUrl: data.logo_url,
      coverImageUrl: data.cover_image_url,
      industry: data.industry || "",
      neighborhoodId: data.neighborhood_id || "",
      website: data.website || "",
      socialLinks: Array.isArray(data.social_links) ? data.social_links : [],
      openJobCount: count || 0,
    };
  },

  // ─── JOB POSTINGS & APPLICATIONS (real Supabase — see
  // 20260719020000_professional_network_foundation.sql). ───

  // Every OPEN job posting, joined with company/category names, for the browse listing. Filtered
  // and sorted client-side (same pattern as the admin provider directory) given this app's modest
  // regional scale.
  async getOpenJobPostings(): Promise<Array<{
    id: string;
    title: string;
    description: string;
    companyName: string | null;
    companyLogoUrl: string | null;
    postedBy: string;
    categorySlug: string | null;
    categoryNameFr: string | null;
    categoryNameEn: string | null;
    customCategory: string | null;
    neighborhoodId: string | null;
    employmentType: "full_time" | "part_time" | "contract" | "gig";
    salaryRange: string | null;
    createdAt: string;
  }>> {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient
      .from("job_postings")
      .select(`
        id, title, description, posted_by, neighborhood_id, employment_type, salary_range, created_at,
        custom_category,
        companies ( name, logo_url ),
        service_categories ( slug, name_fr, name_en )
      `)
      .eq("status", "open")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Failed to load open job postings:", error);
      return [];
    }
    return (data || []).map((row: any) => {
      const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
      const category = Array.isArray(row.service_categories) ? row.service_categories[0] : row.service_categories;
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        companyName: company?.name || null,
        companyLogoUrl: company?.logo_url || null,
        postedBy: row.posted_by,
        categorySlug: category?.slug || null,
        categoryNameFr: category?.name_fr || null,
        categoryNameEn: category?.name_en || null,
        customCategory: row.custom_category || null,
        neighborhoodId: row.neighborhood_id,
        employmentType: row.employment_type,
        salaryRange: row.salary_range,
        createdAt: row.created_at,
      };
    });
  },

  // Unified directory fetch (Part 1, Item 2) — every professional profile that clears the
  // completeness bar (headline + bio both filled in — same rule as getPublicProfessionalProfile),
  // for the "Profils Professionnels" browse page and the home page's unified search.
  async getAllPublicProfessionalProfiles(): Promise<Array<{
    userId: string;
    fullName: string;
    avatarUrl: string | null;
    headline: string;
    bio: string;
    skills: string[];
    availabilityStatus: "open_to_work" | "employed" | "not_looking";
    yearsExperience: number | null;
  }>> {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient
      .from("professional_profiles")
      .select("user_id, headline, bio, skills, availability_status, years_experience, profiles ( full_name, avatar_url )")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Failed to load professional profiles directory:", error);
      return [];
    }
    return (data || [])
      .filter((row: any) => row.headline?.trim() && row.bio?.trim())
      .map((row: any) => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        return {
          userId: row.user_id,
          fullName: profile?.full_name || "",
          avatarUrl: profile?.avatar_url || null,
          headline: row.headline,
          bio: row.bio,
          skills: row.skills || [],
          availabilityStatus: row.availability_status,
          yearsExperience: row.years_experience,
        };
      });
  },

  // Full detail for the /job/:id page — includes description, poster name, company, category.
  async getJobPostingDetail(jobId: string): Promise<{
    id: string;
    title: string;
    description: string;
    postedBy: string;
    posterName: string;
    companyId: string | null;
    companyName: string | null;
    companyLogoUrl: string | null;
    categorySlug: string | null;
    categoryNameFr: string | null;
    categoryNameEn: string | null;
    customCategory: string | null;
    neighborhoodId: string | null;
    employmentType: "full_time" | "part_time" | "contract" | "gig";
    salaryRange: string | null;
    status: "open" | "closed";
    createdAt: string;
  } | null> {
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient
      .from("job_postings")
      .select(`
        id, title, description, posted_by, company_id, neighborhood_id, employment_type,
        salary_range, status, created_at, custom_category,
        profiles ( full_name ),
        companies ( name, logo_url ),
        service_categories ( slug, name_fr, name_en )
      `)
      .eq("id", jobId)
      .maybeSingle();
    if (error || !data) return null;

    const poster: any = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;
    const company: any = Array.isArray(data.companies) ? data.companies[0] : data.companies;
    const category: any = Array.isArray(data.service_categories) ? data.service_categories[0] : data.service_categories;

    return {
      id: data.id,
      title: data.title,
      description: data.description,
      postedBy: data.posted_by,
      posterName: poster?.full_name || "",
      companyId: data.company_id,
      companyName: company?.name || null,
      companyLogoUrl: company?.logo_url || null,
      categorySlug: category?.slug || null,
      categoryNameFr: category?.name_fr || null,
      categoryNameEn: category?.name_en || null,
      customCategory: data.custom_category || null,
      neighborhoodId: data.neighborhood_id,
      employmentType: data.employment_type,
      salaryRange: data.salary_range,
      status: data.status,
      createdAt: data.created_at,
    };
  },

  // Raw editable fields for the create/edit form (create mode just uses empty defaults).
  async getJobPostingForEditing(jobId: string): Promise<{
    id: string;
    title: string;
    description: string;
    companyId: string | null;
    categoryId: number | null;
    customCategory: string | null;
    neighborhoodId: string;
    employmentType: "full_time" | "part_time" | "contract" | "gig";
    salaryRange: string;
    status: "open" | "closed";
  } | null> {
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient
      .from("job_postings")
      .select("id, title, description, company_id, category_id, custom_category, neighborhood_id, employment_type, salary_range, status")
      .eq("id", jobId)
      .maybeSingle();
    // Part B bug fix: same distinction as getCompanyForEditing/getMyProfessionalProfile — a real
    // error must throw (caught by the editor) rather than look like "not found", which previously
    // let the editor render an empty form ready to overwrite a real job posting with blank fields.
    if (error) {
      console.error("Failed to load job posting for editing:", error);
      throw error;
    }
    if (!data) return null;
    return {
      id: data.id,
      title: data.title,
      description: data.description,
      companyId: data.company_id,
      categoryId: data.category_id,
      customCategory: data.custom_category || null,
      neighborhoodId: data.neighborhood_id || "",
      employmentType: data.employment_type,
      salaryRange: data.salary_range || "",
      status: data.status,
    };
  },

  // Management list for "Mes Offres d'Emploi" — includes application counts. The nested
  // job_applications select is only ever called with the caller's OWN userId, so its RLS check
  // (poster of the parent job_postings row) always resolves for every row returned here.
  async getMyJobPostings(userId: string): Promise<Array<{
    id: string;
    title: string;
    status: "open" | "closed";
    companyName: string | null;
    applicationCount: number;
    createdAt: string;
  }>> {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient
      .from("job_postings")
      .select("id, title, status, created_at, companies ( name ), job_applications ( id )")
      .eq("posted_by", userId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Failed to load my job postings:", error);
      return [];
    }
    return (data || []).map((row: any) => {
      const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
      const apps = Array.isArray(row.job_applications) ? row.job_applications : (row.job_applications ? [row.job_applications] : []);
      return {
        id: row.id,
        title: row.title,
        status: row.status,
        companyName: company?.name || null,
        applicationCount: apps.length,
        createdAt: row.created_at,
      };
    });
  },

  async createJobPosting(
    postedBy: string,
    input: {
      title: string;
      description: string;
      companyId: string | null;
      categoryId: number | null;
      customCategory?: string | null;
      neighborhoodId: string;
      employmentType: "full_time" | "part_time" | "contract" | "gig";
      salaryRange: string;
    }
  ): Promise<string> {
    if (!supabaseClient) throw new Error("Supabase n'est pas configuré.");
    const { data, error } = await supabaseClient
      .from("job_postings")
      .insert({
        posted_by: postedBy,
        company_id: input.companyId,
        title: input.title,
        description: input.description,
        category_id: input.categoryId,
        custom_category: input.customCategory || null,
        neighborhood_id: input.neighborhoodId || null,
        employment_type: input.employmentType,
        salary_range: input.salaryRange || null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  },

  async updateJobPosting(
    jobId: string,
    input: {
      title: string;
      description: string;
      companyId: string | null;
      categoryId: number | null;
      customCategory?: string | null;
      neighborhoodId: string;
      employmentType: "full_time" | "part_time" | "contract" | "gig";
      salaryRange: string;
    }
  ): Promise<void> {
    if (!supabaseClient) throw new Error("Supabase n'est pas configuré.");
    const { error } = await supabaseClient
      .from("job_postings")
      .update({
        company_id: input.companyId,
        title: input.title,
        description: input.description,
        category_id: input.categoryId,
        custom_category: input.customCategory || null,
        neighborhood_id: input.neighborhoodId || null,
        employment_type: input.employmentType,
        salary_range: input.salaryRange || null,
      })
      .eq("id", jobId);
    if (error) throw error;
  },

  async setJobPostingStatus(jobId: string, status: "open" | "closed"): Promise<void> {
    if (!supabaseClient) throw new Error("Supabase n'est pas configuré.");
    const { error } = await supabaseClient.from("job_postings").update({ status }).eq("id", jobId);
    if (error) throw error;
  },

  async getJobApplicationCount(jobId: string): Promise<number> {
    if (!supabaseClient) return 0;
    const { count } = await supabaseClient.from("job_applications").select("id", { count: "exact", head: true }).eq("job_id", jobId);
    return count || 0;
  },

  // Callers must check getJobApplicationCount() === 0 first (Item 1: "don't allow deletion of a job
  // with existing applications, just closing it") — not re-enforced here since job_postings' DELETE
  // RLS policy has no such condition built in.
  async deleteJobPosting(jobId: string): Promise<void> {
    if (!supabaseClient) throw new Error("Supabase n'est pas configuré.");
    const { error } = await supabaseClient.from("job_postings").delete().eq("id", jobId);
    if (error) throw error;
  },

  // Admin-only: every job posting regardless of status — the "Open job postings are readable by
  // everyone" SELECT policy already grants admins unrestricted read (see the EXISTS(...role='admin')
  // clause added in 20260721000000_job_postings_applicant_visibility.sql), so no new RLS is needed.
  async getAllJobPostingsAdmin(): Promise<Array<{
    id: string;
    title: string;
    status: "open" | "closed";
    posterName: string;
    companyName: string | null;
    categorySlug: string | null;
    categoryNameFr: string | null;
    categoryNameEn: string | null;
    customCategory: string | null;
    employmentType: "full_time" | "part_time" | "contract" | "gig";
    applicationCount: number;
    createdAt: string;
  }>> {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient
      .from("job_postings")
      .select(`
        id, title, status, employment_type, created_at, custom_category,
        profiles ( full_name ),
        companies ( name ),
        service_categories ( slug, name_fr, name_en ),
        job_applications ( id )
      `)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Failed to load admin job postings list:", error);
      return [];
    }
    return (data || []).map((row: any) => {
      const poster = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
      const category = Array.isArray(row.service_categories) ? row.service_categories[0] : row.service_categories;
      const apps = Array.isArray(row.job_applications) ? row.job_applications : (row.job_applications ? [row.job_applications] : []);
      return {
        id: row.id,
        title: row.title,
        status: row.status,
        posterName: poster?.full_name || "",
        companyName: company?.name || null,
        categorySlug: category?.slug || null,
        categoryNameFr: category?.name_fr || null,
        categoryNameEn: category?.name_en || null,
        customCategory: row.custom_category || null,
        employmentType: row.employment_type,
        applicationCount: apps.length,
        createdAt: row.created_at,
      };
    });
  },

  // Admin-only: full detail for the job moderation panel — same shape as getJobPostingDetail() plus
  // the poster's contact info, since an admin reviewing a flagged posting may need to reach out.
  async getJobPostingAdminDetail(jobId: string): Promise<{
    id: string;
    title: string;
    description: string;
    posterName: string;
    posterPhone: string | null;
    companyName: string | null;
    categoryNameFr: string | null;
    categoryNameEn: string | null;
    customCategory: string | null;
    neighborhoodId: string | null;
    employmentType: "full_time" | "part_time" | "contract" | "gig";
    salaryRange: string | null;
    status: "open" | "closed";
    applicationCount: number;
    createdAt: string;
  } | null> {
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient
      .from("job_postings")
      .select(`
        id, title, description, neighborhood_id, employment_type, salary_range, status, created_at,
        custom_category,
        profiles ( full_name, phone ),
        companies ( name ),
        service_categories ( name_fr, name_en ),
        job_applications ( id )
      `)
      .eq("id", jobId)
      .maybeSingle();
    if (error || !data) {
      if (error) console.error("Failed to load admin job posting detail:", error);
      return null;
    }
    const poster: any = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;
    const company: any = Array.isArray(data.companies) ? data.companies[0] : data.companies;
    const category: any = Array.isArray(data.service_categories) ? data.service_categories[0] : data.service_categories;
    const apps = Array.isArray(data.job_applications) ? data.job_applications : (data.job_applications ? [data.job_applications] : []);
    return {
      id: data.id,
      title: data.title,
      description: data.description,
      posterName: poster?.full_name || "",
      posterPhone: poster?.phone || null,
      companyName: company?.name || null,
      categoryNameFr: category?.name_fr || null,
      categoryNameEn: category?.name_en || null,
      customCategory: data.custom_category || null,
      neighborhoodId: data.neighborhood_id,
      employmentType: data.employment_type,
      salaryRange: data.salary_range,
      status: data.status,
      applicationCount: apps.length,
      createdAt: data.created_at,
    };
  },

  // Wraps the job_applications UNIQUE(job_id, applicant_id) violation with a specific `.code` so
  // the caller can show a friendly "you already applied" message instead of a raw Postgrest error.
  async applyToJob(jobId: string, applicantId: string, coverNote: string): Promise<void> {
    if (!supabaseClient) throw new Error("Supabase n'est pas configuré.");
    const { error } = await supabaseClient.from("job_applications").insert({
      job_id: jobId,
      applicant_id: applicantId,
      cover_note: coverNote || null,
    });
    if (error) {
      if (error.code === "23505") {
        const alreadyApplied = new Error("Already applied");
        (alreadyApplied as any).code = "ALREADY_APPLIED";
        throw alreadyApplied;
      }
      throw error;
    }
  },

  // So the applicant can see their own application's current status when they revisit the job.
  async getMyApplicationForJob(
    jobId: string,
    applicantId: string
  ): Promise<{ status: "submitted" | "reviewed" | "accepted" | "rejected"; coverNote: string | null; createdAt: string } | null> {
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient
      .from("job_applications")
      .select("status, cover_note, created_at")
      .eq("job_id", jobId)
      .eq("applicant_id", applicantId)
      .maybeSingle();
    if (error || !data) return null;
    return { status: data.status, coverNote: data.cover_note, createdAt: data.created_at };
  },

  // Poster-only applicant list — also resolves whether each applicant has a COMPLETE (i.e.
  // publicly-visible, per 8b's headline+bio completeness rule) professional profile, so the poster
  // can be given a working /pro/<id> link rather than one that 404s.
  async getJobApplicants(jobId: string): Promise<Array<{
    id: string;
    applicantId: string;
    applicantName: string;
    coverNote: string | null;
    status: "submitted" | "reviewed" | "accepted" | "rejected";
    createdAt: string;
    hasProfessionalProfile: boolean;
  }>> {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient
      .from("job_applications")
      .select("id, applicant_id, cover_note, status, created_at, profiles ( full_name )")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("Failed to load job applicants:", error);
      return [];
    }

    const applicantIds = (data || []).map((row: any) => row.applicant_id);
    const professionalProfileOwners = new Set<string>();
    if (applicantIds.length > 0) {
      const { data: proRows } = await supabaseClient
        .from("professional_profiles")
        .select("user_id, headline, bio")
        .in("user_id", applicantIds);
      (proRows || []).forEach((r: any) => {
        if (r.headline?.trim() && r.bio?.trim()) professionalProfileOwners.add(r.user_id);
      });
    }

    return (data || []).map((row: any) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        id: row.id,
        applicantId: row.applicant_id,
        applicantName: profile?.full_name || "",
        coverNote: row.cover_note,
        status: row.status,
        createdAt: row.created_at,
        hasProfessionalProfile: professionalProfileOwners.has(row.applicant_id),
      };
    });
  },

  async updateJobApplicationStatus(applicationId: string, status: "submitted" | "reviewed" | "accepted" | "rejected"): Promise<void> {
    if (!supabaseClient) throw new Error("Supabase n'est pas configuré.");
    const { error } = await supabaseClient.from("job_applications").update({ status }).eq("id", applicationId);
    if (error) throw error;
  },

  // Item 5: real open-postings list for a company page (replaces the earlier count-only
  // placeholder in getPublicCompany).
  async getCompanyOpenJobPostings(companyId: string): Promise<Array<{
    id: string;
    title: string;
    employmentType: "full_time" | "part_time" | "contract" | "gig";
    neighborhoodId: string | null;
    salaryRange: string | null;
    createdAt: string;
  }>> {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient
      .from("job_postings")
      .select("id, title, employment_type, neighborhood_id, salary_range, created_at")
      .eq("company_id", companyId)
      .eq("status", "open")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Failed to load company job postings:", error);
      return [];
    }
    return (data || []).map((row: any) => ({
      id: row.id,
      title: row.title,
      employmentType: row.employment_type,
      neighborhoodId: row.neighborhood_id,
      salaryRange: row.salary_range,
      createdAt: row.created_at,
    }));
  },

  // ─── COMMUNITY ADS (real Supabase — see 20260719000000_community_ads_table.sql). Replaces the
  // old in-memory /api/ads mock (Part 2). No hard status filter here: RLS itself already limits a
  // non-owner to seeing only 'open' ads (plus their own regardless of status, plus everything for an
  // admin) — see "Open ads are readable by everyone" — so a plain unfiltered select naturally
  // returns exactly what the current viewer is allowed to see, and "show closed ads" is purely a
  // client-side toggle over whatever came back. ───
  async getCommunityAds(): Promise<Array<{
    id: string;
    posterId: string;
    posterName: string;
    posterPhone: string;
    posterWhatsapp: string;
    title: string;
    description: string;
    categorySlug: string | null;
    categoryNameFr: string | null;
    categoryNameEn: string | null;
    neighborhoodId: string | null;
    budgetProposed: number | null;
    urgency: "low" | "medium" | "high";
    status: "open" | "fulfilled" | "closed";
    createdAt: string;
  }>> {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient
      .from("community_ads")
      .select(`
        id, poster_id, title, description, neighborhood_id, budget_proposed, urgency, status, created_at,
        profiles ( full_name, phone, whatsapp_number ),
        service_categories ( slug, name_fr, name_en )
      `)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Failed to load community ads:", error);
      return [];
    }
    return (data || []).map((row: any) => {
      const poster = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      const category = Array.isArray(row.service_categories) ? row.service_categories[0] : row.service_categories;
      return {
        id: row.id,
        posterId: row.poster_id,
        posterName: poster?.full_name || "",
        posterPhone: poster?.phone || "",
        posterWhatsapp: poster?.whatsapp_number || poster?.phone || "",
        title: row.title,
        description: row.description,
        categorySlug: category?.slug || null,
        categoryNameFr: category?.name_fr || null,
        categoryNameEn: category?.name_en || null,
        neighborhoodId: row.neighborhood_id,
        budgetProposed: row.budget_proposed != null ? Number(row.budget_proposed) : null,
        urgency: row.urgency,
        status: row.status,
        createdAt: row.created_at,
      };
    });
  },

  async createCommunityAd(
    posterId: string,
    input: {
      title: string;
      description: string;
      categoryId: number | null;
      neighborhoodId: string;
      budgetProposed: number | null;
      urgency: "low" | "medium" | "high";
    }
  ): Promise<string> {
    if (!supabaseClient) throw new Error("Supabase n'est pas configuré.");
    const { data, error } = await supabaseClient
      .from("community_ads")
      .insert({
        poster_id: posterId,
        title: input.title,
        description: input.description,
        category_id: input.categoryId,
        neighborhood_id: input.neighborhoodId || null,
        budget_proposed: input.budgetProposed,
        urgency: input.urgency,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  },

  async updateCommunityAd(
    adId: string,
    input: {
      title: string;
      description: string;
      categoryId: number | null;
      neighborhoodId: string;
      budgetProposed: number | null;
      urgency: "low" | "medium" | "high";
    }
  ): Promise<void> {
    if (!supabaseClient) throw new Error("Supabase n'est pas configuré.");
    const { error } = await supabaseClient
      .from("community_ads")
      .update({
        title: input.title,
        description: input.description,
        category_id: input.categoryId,
        neighborhood_id: input.neighborhoodId || null,
        budget_proposed: input.budgetProposed,
        urgency: input.urgency,
      })
      .eq("id", adId);
    if (error) throw error;
  },

  async setCommunityAdStatus(adId: string, status: "open" | "fulfilled" | "closed"): Promise<void> {
    if (!supabaseClient) throw new Error("Supabase n'est pas configuré.");
    const { error } = await supabaseClient.from("community_ads").update({ status }).eq("id", adId);
    if (error) throw error;
  },

  async deleteCommunityAd(adId: string): Promise<void> {
    if (!supabaseClient) throw new Error("Supabase n'est pas configuré.");
    const { error } = await supabaseClient.from("community_ads").delete().eq("id", adId);
    if (error) throw error;
  },

  // Inserts/updates the real service_providers + provider_services rows for a new registration.
  // Always sets verification_status: "pending" — approval happens later via the admin queue.
  async registerServiceProvider(payload: {
    userId: string;
    businessName: string;
    descriptionFR: string;
    descriptionEN: string;
    bannerUrl?: string;
    addressText: string;
    city: string;
    neighborhoodId: string;
    latitude?: number;
    longitude?: number;
    hasFixedPricing: boolean;
    basePrice: number;
    currency?: string;
    rateUnit: string;
    languages: string[];
    idCardNumber: string;
    idCardFrontPath?: string;
    idCardBackPath?: string;
    facebook?: string;
    linkedin?: string;
    // Exactly one of mainCategorySlug / pendingCategorySuggestion is set: a real category picked
    // from the dropdown, or a provider-authored "Autre / Other" suggestion awaiting admin review.
    mainCategorySlug?: string;
    subcategory?: string;
    customDescription?: string;
    pendingCategorySuggestion?: { categoryName: string; description: string };
  }): Promise<void> {
    if (!supabaseClient) {
      await mockSupabase.submitProviderRegistration({
        id: payload.userId,
        name: payload.businessName,
        businessName: payload.businessName,
        phone: "",
        category: payload.mainCategorySlug,
        neighborhoodId: payload.neighborhoodId,
        city: payload.city,
        rateFCFA: payload.basePrice,
        rateUnit: payload.rateUnit,
        description: payload.descriptionFR,
        languages: payload.languages,
        bannerUrl: payload.bannerUrl,
        idNumber: payload.idCardNumber,
        idCardFrontUrl: payload.idCardFrontPath,
        idCardBackUrl: payload.idCardBackPath,
      });
      return;
    }

    // latitude/longitude are written as plain numeric columns — the DB trigger
    // sync_service_provider_location() derives the PostGIS `location` point from them, so the
    // client never has to construct WKT/GeoJSON itself.
    const { error: spError } = await supabaseClient.from("service_providers").upsert({
      user_id: payload.userId,
      business_name: payload.businessName,
      description_fr: payload.descriptionFR,
      description_en: payload.descriptionEN,
      banner_url: payload.bannerUrl || null,
      address_text: payload.addressText,
      city: payload.city || "Bertoua",
      neighborhood_id: payload.neighborhoodId,
      latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null,
      is_verified: false,
      verification_status: "pending",
      id_card_front_url: payload.idCardFrontPath || null,
      id_card_back_url: payload.idCardBackPath || null,
      id_card_number: payload.idCardNumber,
      social_links: { facebook: payload.facebook || null, linkedin: payload.linkedin || null },
      has_fixed_pricing: payload.hasFixedPricing,
      base_price: payload.hasFixedPricing ? payload.basePrice : null,
      currency: payload.currency || "XAF",
      rate_unit: payload.rateUnit,
      languages: payload.languages,
    });
    if (spError) throw spError;

    if (payload.mainCategorySlug) {
      const { data: categoryRow, error: catError } = await supabaseClient
        .from("service_categories")
        .select("id")
        .eq("slug", payload.mainCategorySlug)
        .maybeSingle();
      if (catError) throw catError;

      if (categoryRow) {
        const { error: psError } = await supabaseClient.from("provider_services").upsert(
          {
            provider_id: payload.userId,
            category_id: categoryRow.id,
            subcategory: payload.subcategory || null,
            custom_description: payload.customDescription || null,
          },
          { onConflict: "provider_id,category_id" }
        );
        if (psError) throw psError;
      }
    }

    // "Autre / Other" was picked instead of a real category: record the suggestion for admin
    // review rather than blocking registration. provider_id lets approval retroactively link this
    // provider to the category once (if) it gets created — see reviewCategorySuggestion().
    if (payload.pendingCategorySuggestion) {
      const { error: sugError } = await supabaseClient.from("category_suggestions").insert({
        category_name: payload.pendingCategorySuggestion.categoryName,
        description: payload.pendingCategorySuggestion.description,
        submitted_by: payload.userId,
        provider_id: payload.userId,
      });
      if (sugError) throw sugError;
    }
  },

  // Live list of every category that actually exists in the database — the 8 "built-in" ones
  // seeded at launch AND any later admin-approved suggestions (e.g. "Informatique (TIC)"). This is
  // the single source of truth for category filter pills/dropdowns; nothing should read a
  // hardcoded/static category list instead, or a newly-approved category won't show up anywhere
  // until a rebuild.
  async getAllServiceCategories(): Promise<Array<{ id: number; slug: string; nameFr: string; nameEn: string }>> {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient
      .from("service_categories")
      .select("id, slug, name_fr, name_en")
      .order("name_fr", { ascending: true });
    if (error) {
      console.error("Failed to load service categories:", error);
      return [];
    }
    return (data || [])
      .filter((row: any) => !!row.slug)
      .map((row: any) => ({ id: row.id, slug: row.slug, nameFr: row.name_fr, nameEn: row.name_en }));
  },

  // Admin-only: pending "Autre / Other" category suggestions submitted at registration.
  async getCategorySuggestions(): Promise<Array<{
    id: string;
    categoryName: string;
    description: string;
    submitterName: string;
    providerId: string | null;
    status: string;
    createdAt: string;
  }>> {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient
      .from("category_suggestions")
      .select("id, category_name, description, provider_id, status, created_at, profiles ( full_name )")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Failed to load category suggestions:", error);
      return [];
    }
    return (data || []).map((row: any) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        id: row.id,
        categoryName: row.category_name,
        description: row.description || "",
        submitterName: profile?.full_name || "",
        providerId: row.provider_id,
        status: row.status,
        createdAt: row.created_at,
      };
    });
  },

  // Admin-only: approves a suggestion by creating a real service_categories row (slug derived from
  // the suggested name) and linking the originally-submitting provider to it via provider_services,
  // or rejects it outright. Either way the suggestion's own status is updated so it drops off the
  // pending queue.
  async reviewCategorySuggestion(
    id: string,
    approve: boolean,
    suggestion: { categoryName: string; providerId: string | null }
  ): Promise<void> {
    if (!supabaseClient) throw new Error("Supabase n'est pas configuré.");

    // Wraps a Postgrest error with which step actually failed (category creation vs. lookup vs.
    // provider linking vs. status update) plus the real message/code/details/hint, instead of
    // letting the caller catch an opaque error and show a one-size-fits-all alert. Logged in full
    // here too, so the real cause is visible even if the caller's own catch block is generic.
    const describeError = (step: string, err: any): Error => {
      const parts = [err?.message || String(err)];
      if (err?.code) parts.push(`code: ${err.code}`);
      if (err?.details) parts.push(`details: ${err.details}`);
      if (err?.hint) parts.push(`hint: ${err.hint}`);
      const message = `[${step}] ${parts.join(" | ")}`;
      console.error(`reviewCategorySuggestion failed at step "${step}":`, err);
      const wrapped = new Error(message);
      (wrapped as any).step = step;
      (wrapped as any).original = err;
      return wrapped;
    };

    if (approve) {
      // Strip accents (NFD-decompose then drop combining marks U+0300-U+036F) so e.g. "Coiffure"
      // -> "COIFFURE" and "Élevage" -> "ELEVAGE" rather than leaving stray accented bytes in the slug.
      const combiningMarks = new RegExp("[̀-ͯ]", "g");
      const slug = suggestion.categoryName
        .normalize("NFD")
        .replace(combiningMarks, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");

      // Re-use an existing category if this slug was already created by an earlier approval
      // attempt (e.g. one that got this far but failed on the provider_services link below,
      // before the admin RLS policy fix — see 20260717000000) instead of trying to INSERT a
      // duplicate and failing on the UNIQUE constraint.
      let categoryId: number;
      const { data: existingCategory, error: lookupError } = await supabaseClient
        .from("service_categories")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (lookupError) throw describeError("category lookup", lookupError);

      if (existingCategory) {
        categoryId = existingCategory.id;
      } else {
        const { data: newCategory, error: catError } = await supabaseClient
          .from("service_categories")
          .insert({ name_fr: suggestion.categoryName, name_en: suggestion.categoryName, slug })
          .select("id")
          .single();
        if (catError) throw describeError("category creation", catError);
        categoryId = newCategory.id;
      }

      if (suggestion.providerId) {
        const { error: psError } = await supabaseClient.from("provider_services").upsert(
          { provider_id: suggestion.providerId, category_id: categoryId },
          { onConflict: "provider_id,category_id" }
        );
        if (psError) throw describeError("provider linking", psError);
      }
    }

    const { error: statusError } = await supabaseClient
      .from("category_suggestions")
      .update({ status: approve ? "approved" : "rejected" })
      .eq("id", id);
    if (statusError) throw describeError("suggestion status update", statusError);
  },

  // Self-service update of a provider's own business info/media/CV — never touches
  // is_verified/verification_status/rejection_reason (blocked for non-admins by a DB trigger
  // anyway; see 20260714030000_protect_verification_columns.sql).
  async updateServiceProviderProfile(
    userId: string,
    updates: {
      businessName?: string;
      descriptionFR?: string;
      descriptionEN?: string;
      rateUnit?: string;
      basePrice?: number;
      languages?: string[];
      bannerUrl?: string | null;
      idCardFrontPath?: string | null;
      idCardBackPath?: string | null;
      cvUrl?: string | null;
    }
  ): Promise<void> {
    if (!supabaseClient) throw new Error("Supabase n'est pas configuré.");

    const dbPatch: Record<string, any> = {};
    if (updates.businessName !== undefined) dbPatch.business_name = updates.businessName;
    if (updates.descriptionFR !== undefined) dbPatch.description_fr = updates.descriptionFR;
    if (updates.descriptionEN !== undefined) dbPatch.description_en = updates.descriptionEN;
    if (updates.rateUnit !== undefined) dbPatch.rate_unit = updates.rateUnit;
    if (updates.basePrice !== undefined) dbPatch.base_price = updates.basePrice;
    if (updates.languages !== undefined) dbPatch.languages = updates.languages;
    if (updates.bannerUrl !== undefined) dbPatch.banner_url = updates.bannerUrl;
    if (updates.idCardFrontPath !== undefined) dbPatch.id_card_front_url = updates.idCardFrontPath;
    if (updates.idCardBackPath !== undefined) dbPatch.id_card_back_url = updates.idCardBackPath;
    if (updates.cvUrl !== undefined) dbPatch.cv_url = updates.cvUrl;

    if (Object.keys(dbPatch).length === 0) return;

    const { error } = await supabaseClient.from("service_providers").update(dbPatch).eq("user_id", userId);
    if (error) throw error;
  },

  // ─── BOOKINGS (real Supabase-backed flow — see 20260715010000_bookings_realtime_and_status_rules.sql) ───

  // Creates a real booking. Validates client-side for a friendly error message (self-booking,
  // provider not approved) before attempting the insert — the DB CHECK constraint and the INSERT
  // RLS policy's WITH CHECK subquery are the actual enforcement boundary regardless of what the
  // client checks, so these are purely UX, not security.
  async createBooking(input: {
    clientId: string;
    providerId: string;
    categorySlug?: string;
    paymentMethod: RealPaymentMethod;
    agreedPrice: number;
    scheduledAt: string;
    description?: string;
  }): Promise<RealBooking> {
    if (!supabaseClient) throw new Error("Supabase n'est pas configuré.");
    if (input.clientId === input.providerId) {
      throw new Error("Vous ne pouvez pas réserver votre propre profil prestataire.");
    }

    const { data: providerRow, error: providerError } = await supabaseClient
      .from("service_providers")
      .select("verification_status")
      .eq("user_id", input.providerId)
      .maybeSingle();
    if (providerError || !providerRow || providerRow.verification_status !== "approved") {
      throw new Error("Ce prestataire n'est pas encore vérifié et ne peut pas recevoir de réservations pour le moment.");
    }

    let categoryId: number | null = null;
    if (input.categorySlug) {
      const { data: categoryRow } = await supabaseClient
        .from("service_categories")
        .select("id")
        .eq("slug", input.categorySlug)
        .maybeSingle();
      categoryId = categoryRow?.id ?? null;
    }

    const { data, error } = await supabaseClient
      .from("bookings")
      .insert({
        client_id: input.clientId,
        provider_id: input.providerId,
        category_id: categoryId,
        payment_method: input.paymentMethod,
        agreed_price: input.agreedPrice,
        scheduled_at: input.scheduledAt,
        description: input.description || null,
      })
      .select(
        "id, client_id, provider_id, category_id, status, payment_method, agreed_price, scheduled_at, description, created_at, client_confirmed_complete, provider_confirmed_complete"
      )
      .single();
    if (error) throw error;
    return mapBookingRow(data);
  },

  // Bookings where the given user is the client, newest first.
  async getMyBookingsAsClient(clientId: string): Promise<RealBooking[]> {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient
      .from("bookings")
      .select(`
        id, client_id, provider_id, category_id, status, payment_method, agreed_price, scheduled_at, description, created_at, client_confirmed_complete, provider_confirmed_complete,
        client_profile:profiles ( full_name, phone, whatsapp_number ),
        provider_info:service_providers ( business_name ),
        category:service_categories ( name_fr, name_en )
      `)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Failed to load client bookings:", error);
      return [];
    }
    return (data || []).map(mapBookingRow);
  },

  // Bookings where the given user is the provider, newest first.
  async getMyBookingsAsProvider(providerId: string): Promise<RealBooking[]> {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient
      .from("bookings")
      .select(`
        id, client_id, provider_id, category_id, status, payment_method, agreed_price, scheduled_at, description, created_at, client_confirmed_complete, provider_confirmed_complete,
        client_profile:profiles ( full_name, phone, whatsapp_number ),
        provider_info:service_providers ( business_name ),
        category:service_categories ( name_fr, name_en )
      `)
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Failed to load provider bookings:", error);
      return [];
    }
    return (data || []).map(mapBookingRow);
  },

  // Provider-side status transitions (requested -> accepted/cancelled, accepted -> in_progress/
  // cancelled), and the one client-side transition (accepted -> in_progress). The BEFORE UPDATE
  // trigger (see migration) is what actually enforces which caller may make which change — this
  // just performs the write and surfaces the trigger's exception message on failure.
  async updateBookingStatus(bookingId: string, status: RealBookingStatus): Promise<void> {
    if (!supabaseClient) throw new Error("Supabase n'est pas configuré.");
    const { error } = await supabaseClient.from("bookings").update({ status }).eq("id", bookingId);
    if (error) throw error;
  },

  // Two-sided completion confirmation. The trigger flips status to 'completed' automatically once
  // both flags are true — it is never settable directly by either party.
  async confirmBookingCompletion(bookingId: string, role: "client" | "provider"): Promise<void> {
    if (!supabaseClient) throw new Error("Supabase n'est pas configuré.");
    const patch = role === "client" ? { client_confirmed_complete: true } : { provider_confirmed_complete: true };
    const { error } = await supabaseClient.from("bookings").update(patch).eq("id", bookingId);
    if (error) throw error;
  },

  // ─── CHAT (real Supabase Realtime — see 20260715020000_chat_realtime_and_ratings.sql) ───

  // Finds the existing chat thread between these two people, or creates one. Named (clientId,
  // providerId) for backwards compatibility with its one call site (ChatInterface.tsx) — but
  // internally the chats table no longer has fixed client/provider roles (see
  // 20260719010000_generalize_chat_participants.sql): it stores an unordered pair of profiles under
  // participant_one_id/participant_two_id, normalized here into ascending order so the same two
  // people always land on the same row regardless of who's "clientId" vs "providerId" or who
  // initiated. Either side can now create a thread (was previously client-only).
  async getOrCreateChat(clientId: string, providerId: string): Promise<string> {
    if (!supabaseClient) throw new Error("Supabase n'est pas configuré.");

    const [participantOneId, participantTwoId] = [clientId, providerId].sort();

    const { data: existing } = await supabaseClient
      .from("chats")
      .select("id")
      .eq("participant_one_id", participantOneId)
      .eq("participant_two_id", participantTwoId)
      .maybeSingle();
    if (existing) return existing.id;

    const { data, error } = await supabaseClient
      .from("chats")
      .insert({ participant_one_id: participantOneId, participant_two_id: participantTwoId })
      .select("id")
      .single();

    if (error) {
      // Unique violation: another request created the same thread concurrently — just re-fetch it.
      if (error.code === "23505") {
        const { data: retry } = await supabaseClient
          .from("chats")
          .select("id")
          .eq("participant_one_id", participantOneId)
          .eq("participant_two_id", participantTwoId)
          .maybeSingle();
        if (retry) return retry.id;
      }
      throw error;
    }
    return data.id;
  },

  // Full message history for a chat thread, oldest first.
  async getChatMessages(chatId: string, viewerId: string): Promise<ChatMessage[]> {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient
      .from("chat_messages")
      .select("id, sender_id, message_type, content, media_url, created_at")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("Failed to load chat messages:", error);
      return [];
    }
    return (data || []).map((row: any) => mapChatMessageRow(row, viewerId));
  },

  // Text messages only for this pass — image/voice message_type values exist in the schema for
  // future use but nothing sends them yet (see ChatInterface.tsx).
  async sendChatMessage(chatId: string, senderId: string, content: string): Promise<void> {
    if (!supabaseClient) throw new Error("Supabase n'est pas configuré.");
    const { error } = await supabaseClient.from("chat_messages").insert({
      chat_id: chatId,
      sender_id: senderId,
      message_type: "text",
      content,
    });
    if (error) throw error;
  },

  // Subscribes to new messages in a chat thread via Supabase Realtime (requires chat_messages to
  // be in the supabase_realtime publication — see the migration). Returns an unsubscribe function.
  subscribeToChatMessages(chatId: string, viewerId: string, onMessage: (msg: ChatMessage) => void): () => void {
    if (!supabaseClient) return () => {};
    const client = supabaseClient;
    const channel = client
      .channel(`chat_messages:${chatId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `chat_id=eq.${chatId}` },
        (payload: any) => {
          onMessage(mapChatMessageRow(payload.new, viewerId));
        }
      )
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  },

  // Admin-only: fires on every new service_providers row (a fresh registration always starts
  // 'pending') so the ID-verification queue can refetch and show it without a manual refresh.
  // Requires service_providers in the supabase_realtime publication — see
  // 20260718000000_admin_dashboard_realtime.sql. Refetch-on-event rather than hand-patching state,
  // since reconstructing the joined profile/category/signed-URL shape here would duplicate
  // getPendingProviders()'s own logic.
  subscribeToPendingProviders(onChange: () => void): () => void {
    if (!supabaseClient) return () => {};
    const client = supabaseClient;
    const channel = client
      .channel("admin_pending_providers")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "service_providers" }, () => onChange())
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  },

  // Admin-only: fires on every new category_suggestions row so that queue refetches automatically.
  // Requires category_suggestions in the supabase_realtime publication — see
  // 20260718000000_admin_dashboard_realtime.sql.
  subscribeToCategorySuggestions(onChange: () => void): () => void {
    if (!supabaseClient) return () => {};
    const client = supabaseClient;
    const channel = client
      .channel("admin_category_suggestions")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "category_suggestions" }, () => onChange())
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  },

  // ─── RATINGS (real Supabase — see 20260715020000_chat_realtime_and_ratings.sql) ───

  // Submits a rating for a completed booking. The DB enforces one rating per booking (unique
  // constraint on bookings.id) and that the booking is actually the client's own completed booking
  // with this provider (INSERT policy) — this surfaces friendly errors for both instead of a raw
  // Postgres error, plus a client-side profanity pre-check (the DB trigger is the real backstop).
  async submitRating(input: { bookingId: string; clientId: string; providerId: string; stars: number; comment?: string }): Promise<Review> {
    if (!supabaseClient) throw new Error("Supabase n'est pas configuré.");
    if (input.comment && containsProfanity(input.comment)) {
      throw new Error("Votre commentaire contient un langage inapproprié. Veuillez le reformuler.");
    }

    const { data, error } = await supabaseClient
      .from("ratings")
      .insert({
        booking_id: input.bookingId,
        client_id: input.clientId,
        provider_id: input.providerId,
        stars: input.stars,
        comment: input.comment || null,
      })
      .select("id, booking_id, client_id, provider_id, stars, comment, response, created_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new Error("Vous avez déjà noté cette prestation.");
      }
      throw error;
    }
    return mapRatingRow(data);
  },

  // Booking ids the given client has already rated, so the UI can hide the "rate" prompt instead
  // of relying on purely local/in-session state.
  async getRatedBookingIds(clientId: string): Promise<Set<string>> {
    if (!supabaseClient) return new Set();
    const { data, error } = await supabaseClient.from("ratings").select("booking_id").eq("client_id", clientId);
    if (error) return new Set();
    return new Set((data || []).map((r: any) => r.booking_id as string));
  },

  // Public reviews for a provider's profile page, newest first, including any provider response.
  async getProviderRatings(providerId: string): Promise<Review[]> {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient
      .from("ratings")
      .select(`
        id, booking_id, client_id, provider_id, stars, comment, response, created_at,
        client_profile:profiles ( full_name )
      `)
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Failed to load provider ratings:", error);
      return [];
    }
    return (data || []).map(mapRatingRow);
  },

  // Provider-only: add a single response to one of their ratings. The DB trigger enforces this can
  // only be set once and only by the reviewed provider (see migration).
  async respondToRating(ratingId: string, response: string): Promise<void> {
    if (!supabaseClient) throw new Error("Supabase n'est pas configuré.");
    const { error } = await supabaseClient.from("ratings").update({ response }).eq("id", ratingId);
    if (error) throw error;
  },

};
