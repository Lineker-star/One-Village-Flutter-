import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { UserProfile, ServiceProvider, ServiceCategory } from "../types.ts";

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
// Relies on the DB trigger (see supabase/migrations for the auth-profile-trigger migration) having
// already created the row when the auth.users record was inserted.
async function fetchProfile(authUser: { id: string; email?: string | null }): Promise<UserProfile> {
  if (!supabaseClient) throw new Error("Supabase n'est pas configuré.");
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", authUser.id)
    .single();
  if (error || !data) {
    throw new Error("Profil introuvable. Veuillez réessayer ou contacter le support.");
  }
  return mapDbProfileToUserProfile(data, authUser.email);
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

  async verifyProvider(id: string, approve: boolean, rejectionReason?: string): Promise<ServiceProvider> {
    if (supabaseClient) {
      const status = approve ? "approved" : "rejected";
      const { data, error } = await supabaseClient
        .from("providers")
        .update({ status, verified: approve, rejectionReason: rejectionReason || null })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as ServiceProvider;
    }
    return mockSupabase.adminApproveProvider(id, approve, rejectionReason);
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
    if (profile.phone !== undefined) dbPatch.phone = profile.phone;
    if (profile.whatsappNumber !== undefined) dbPatch.whatsapp_number = profile.whatsappNumber;
    if (profile.preferredLanguage !== undefined) dbPatch.preferred_language = profile.preferredLanguage;
    if (profile.avatarUrl !== undefined) dbPatch.avatar_url = profile.avatarUrl;
    if (profile.role !== undefined) dbPatch.role = profile.role;

    if (Object.keys(dbPatch).length > 0) {
      const { error } = await supabaseClient.from("profiles").update(dbPatch).eq("id", user.id);
      if (error) throw error;
    }

    if (profile.onboarding_completed !== undefined) {
      localStorage.setItem(`onevillage_onboarded_${user.id}`, String(profile.onboarding_completed));
    }

    return fetchProfile(user);
  },

  async registerProvider(providerData: any): Promise<ServiceProvider> {
    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from("providers")
        .upsert(providerData)
        .select()
        .single();
      if (error) throw error;
      return data as ServiceProvider;
    }
    return mockSupabase.submitProviderRegistration(providerData);
  },

  async uploadFile(bucket: string, file: File): Promise<string> {
    if (supabaseClient) {
      const compressedBase64 = await mockSupabase.compressAndUpload(file, bucket);
      const res = await fetch(compressedBase64);
      const blob = await res.blob();
      const fileName = `${Date.now()}_${file.name}`;
      
      const { data, error } = await supabaseClient.storage
        .from(bucket)
        .upload(fileName, blob, {
          contentType: "image/jpeg",
        });

      if (error) throw error;
      
      const { data: { publicUrl } } = supabaseClient.storage
        .from(bucket)
        .getPublicUrl(fileName);

      return publicUrl;
    }
    return mockSupabase.compressAndUpload(file, bucket);
  },

  async loadAllProviders(): Promise<ServiceProvider[]> {
    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from("providers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ServiceProvider[];
    }
    return mockSupabase.getProviders();
  },

  async deleteProvider(id: string): Promise<boolean> {
    if (supabaseClient) {
      const { error } = await supabaseClient
        .from("providers")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return true;
    }
    return mockSupabase.deleteProvider(id);
  },

  async updateProvider(id: string, updates: Partial<ServiceProvider>): Promise<ServiceProvider> {
    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from("providers")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as ServiceProvider;
    }
    return mockSupabase.updateProvider(id, updates);
  }
};
