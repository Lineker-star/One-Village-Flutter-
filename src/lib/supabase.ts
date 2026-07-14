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

// In-memory or localStorage-backed simulation for testing if Supabase is not connected yet
class MockSupabaseService {
  private usersKey = "onevillage_users";
  private currentUserIdKey = "onevillage_current_user_id";
  private providersKey = "onevillage_providers";
  private activeOTPCode: { [phone: string]: string } = {};

  constructor() {
    // Seed initial providers if empty in localStorage
    if (!localStorage.getItem(this.providersKey)) {
      localStorage.setItem(this.providersKey, JSON.stringify([]));
    }
    // Seed standard dummy users
    if (!localStorage.getItem(this.usersKey)) {
      localStorage.setItem(
        this.usersKey,
        JSON.stringify([
          {
            id: "admin_123",
            role: "admin",
            fullName: "Admin One Village",
            phone: "+237 600 00 00 00",
            preferredLanguage: "fr",
            onboarding_completed: true,
          },
        ])
      );
    }
  }

  // --- Auth & OTP ---
  async sendPhoneOTP(phone: string): Promise<{ success: boolean; code?: string; message: string }> {
    if (!phone.match(/^\+?[0-9\s-]{8,20}$/)) {
      return { success: false, message: "Format de téléphone invalide / Invalid phone format" };
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    this.activeOTPCode[phone] = code;
    console.log(`[One Village SIMULATED SMS] OTP sent to ${phone}: ${code}`);
    return {
      success: true,
      code,
      message: `Code envoyé avec succès à ${phone}. (SIMULATION: Le code est ${code})`,
    };
  }

  async verifyPhoneOTP(phone: string, code: string): Promise<{ success: boolean; user?: UserProfile; message: string }> {
    const savedCode = this.activeOTPCode[phone];
    if (savedCode && code === savedCode) {
      const users = this.getUsers();
      let user = users.find((u) => u.phone === phone);
      
      if (!user) {
        user = {
          id: `u_${Date.now()}`,
          role: "client",
          fullName: "",
          phone,
          preferredLanguage: "fr",
          referralCode: `OV-${Math.floor(100 + Math.random() * 900)}`,
          rewardsCredit: 0,
          onboarding_completed: false,
        };
        users.push(user);
        this.saveUsers(users);
      }
      
      localStorage.setItem(this.currentUserIdKey, user.id);
      return { success: true, user, message: "Authentifié avec succès" };
    }
    return { success: false, message: "Code OTP incorrect. Veuillez réessayer." };
  }

  async signInWithEmail(email: string): Promise<{ success: boolean; code?: string; message: string }> {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const phoneSim = `email_${email.replace(/[@.]/g, "_")}`;
    this.activeOTPCode[phoneSim] = code;
    console.log(`[One Village SIMULATED EMAIL] OTP sent to ${email}: ${code}`);
    return {
      success: true,
      code,
      message: `Code envoyé avec succès par email à ${email}. (SIMULATION: Le code est ${code})`,
    };
  }

  async verifyEmailOTP(email: string, code: string): Promise<{ success: boolean; user?: UserProfile; message: string }> {
    const phoneSim = `email_${email.replace(/[@.]/g, "_")}`;
    const savedCode = this.activeOTPCode[phoneSim];
    if (savedCode && code === savedCode) {
      const users = this.getUsers();
      let user = users.find((u) => u.email === email);
      
      if (!user) {
        user = {
          id: `u_${Date.now()}`,
          role: "client",
          fullName: "",
          email,
          phone: "",
          preferredLanguage: "fr",
          referralCode: `OV-${Math.floor(100 + Math.random() * 900)}`,
          rewardsCredit: 0,
          onboarding_completed: false,
        };
        users.push(user);
        this.saveUsers(users);
      }
      
      localStorage.setItem(this.currentUserIdKey, user.id);
      return { success: true, user, message: "Authentifié avec succès" };
    }
    return { success: false, message: "Code OTP incorrect. Veuillez réessayer." };
  }

  // --- Profile operations ---
  getCurrentUser(): UserProfile | null {
    const id = localStorage.getItem(this.currentUserIdKey);
    if (!id) return null;
    const users = this.getUsers();
    return users.find((u) => u.id === id) || null;
  }

  logout() {
    localStorage.removeItem(this.currentUserIdKey);
  }

  getUsers(): UserProfile[] {
    const data = localStorage.getItem(this.usersKey);
    return data ? JSON.parse(data) : [];
  }

  saveUsers(users: UserProfile[]) {
    localStorage.setItem(this.usersKey, JSON.stringify(users));
  }

  async updateUserProfile(profile: Partial<UserProfile>): Promise<UserProfile> {
    const users = this.getUsers();
    const currentId = localStorage.getItem(this.currentUserIdKey);
    if (!currentId) throw new Error("No authenticated user session.");

    const index = users.findIndex((u) => u.id === currentId);
    if (index === -1) {
      throw new Error("User profile not found.");
    }

    const updated = { ...users[index], ...profile };
    
    // Customize referral code if a name is provided and code is currently generic
    if (updated.fullName && (!updated.referralCode || updated.referralCode.startsWith("OV-"))) {
      const prefix = updated.fullName.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
      updated.referralCode = `${prefix || "OV"}-${Math.floor(100 + Math.random() * 900)}`;
    }
    if (updated.rewardsCredit === undefined) {
      updated.rewardsCredit = 0;
    }
    
    users[index] = updated;
    this.saveUsers(users);
    return updated;
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

  getCurrentUser(): UserProfile | null {
    return mockSupabase.getCurrentUser();
  },

  logout() {
    mockSupabase.logout();
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

  async sendOTP(phone: string): Promise<{ success: boolean; code?: string; message: string }> {
    if (supabaseClient) {
      try {
        const { error } = await supabaseClient.auth.signInWithOtp({ phone });
        if (error) throw error;
        return { success: true, message: "Code OTP envoyé par SMS." };
      } catch (err: any) {
        console.error("Supabase phone OTP error:", err);
        return { success: false, message: err.message };
      }
    }
    return mockSupabase.sendPhoneOTP(phone);
  },

  async verifyOTP(phone: string, token: string): Promise<{ success: boolean; user?: UserProfile; message: string }> {
    if (supabaseClient) {
      try {
        const { data, error } = await supabaseClient.auth.verifyOtp({
          phone,
          token,
          type: "sms",
        });
        if (error) throw error;
        
        const { data: profile, error: pErr } = await supabaseClient
          .from("profiles")
          .select("*")
          .eq("id", data.user?.id)
          .single();

        let userProfile: UserProfile;
        if (pErr || !profile) {
          const newProfile = {
            id: data.user?.id || `u_${Date.now()}`,
            role: "client",
            fullName: "",
            phone,
            preferredLanguage: "fr",
            onboarding_completed: false,
          };
          await supabaseClient.from("profiles").upsert(newProfile);
          userProfile = newProfile as UserProfile;
        } else {
          userProfile = profile as UserProfile;
        }

        return { success: true, user: userProfile, message: "Connecté avec succès !" };
      } catch (err: any) {
        console.error("Supabase verify OTP error:", err);
        return { success: false, message: err.message };
      }
    }
    return mockSupabase.verifyPhoneOTP(phone, token);
  },

  async sendEmailOTP(email: string): Promise<{ success: boolean; code?: string; message: string }> {
    if (supabaseClient) {
      try {
        const { error } = await supabaseClient.auth.signInWithOtp({ email });
        if (error) throw error;
        return { success: true, message: "Lien magique / OTP envoyé par email." };
      } catch (err: any) {
        console.error("Supabase email OTP error:", err);
        return { success: false, message: err.message };
      }
    }
    return mockSupabase.signInWithEmail(email);
  },

  async verifyEmailOTP(email: string, token: string): Promise<{ success: boolean; user?: UserProfile; message: string }> {
    if (supabaseClient) {
      try {
        const { data, error } = await supabaseClient.auth.verifyOtp({
          email,
          token,
          type: "magiclink",
        });
        if (error) throw error;

        const { data: profile, error: pErr } = await supabaseClient
          .from("profiles")
          .select("*")
          .eq("id", data.user?.id)
          .single();

        let userProfile: UserProfile;
        if (pErr || !profile) {
          const newProfile = {
            id: data.user?.id || `u_${Date.now()}`,
            role: "client",
            fullName: "",
            email,
            phone: "",
            preferredLanguage: "fr",
            onboarding_completed: false,
          };
          await supabaseClient.from("profiles").upsert(newProfile);
          userProfile = newProfile as UserProfile;
        } else {
          userProfile = profile as UserProfile;
        }

        return { success: true, user: userProfile, message: "Connecté !" };
      } catch (err: any) {
        console.error("Supabase verify email OTP error:", err);
        return { success: false, message: err.message };
      }
    }
    return mockSupabase.verifyEmailOTP(email, token);
  },

  async updateUserProfile(profile: Partial<UserProfile>): Promise<UserProfile> {
    if (supabaseClient) {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) throw new Error("Non connecté.");

      const { data, error } = await supabaseClient
        .from("profiles")
        .update(profile)
        .eq("id", user.id)
        .select()
        .single();

      if (error) throw error;
      return data as UserProfile;
    }
    return mockSupabase.updateUserProfile(profile);
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
