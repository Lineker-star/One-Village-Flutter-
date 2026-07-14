/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { ServiceProvider, ServiceCategory, UserProfile } from "./types.ts";
import { BERTOUA_NEIGHBORHOODS, CATEGORY_DETAILS } from "./data/bertouaData.ts";
import ServiceCard from "./components/ServiceCard.tsx";
import AIGuide from "./components/AIGuide.tsx";
import BookingModal from "./components/BookingModal.tsx";
import ProviderWizard from "./components/ProviderWizard.tsx";
import OnboardingFlow from "./components/OnboardingFlow.tsx";
import ChatInterface from "./components/ChatInterface.tsx";
import AdBoard from "./components/AdBoard.tsx";
import Dashboard from "./components/Dashboard.tsx";
import ProviderProfile from "./components/ProviderProfile.tsx";
import AdminDashboard from "./components/AdminDashboard.tsx";
import PromotedAdsCarousel from "./components/PromotedAdsCarousel.tsx";
import { supabaseService } from "./lib/supabase.ts";
import brandLogo from "./assets/images/one_village_logo_1784027088635.jpg";

import {
  Search,
  PlusCircle,
  MapPin,
  User,
  Globe,
  Sprout,
  Bike,
  Home,
  Baby,
  Hammer,
  Scissors,
  GraduationCap,
  HeartPulse,
  Menu,
  X,
  ShieldCheck,
  CheckCircle,
  XCircle,
  HelpCircle,
  RefreshCw,
  Phone,
  Mail,
  Send,
  AlertTriangle,
} from "lucide-react";

export default function App() {
  const [lang, setLang] = useState<"fr" | "en">("fr");
  const [activeView, setActiveView] = useState<"browse" | "ads" | "dashboard" | "admin">("browse");
  
  // Auth state
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authTab, setAuthTab] = useState<"signin" | "signup">("signin");
  const [authMethod, setAuthMethod] = useState<"phone" | "email">("phone");
  
  // Sign In / Sign Up form states
  const [authName, setAuthName] = useState("");
  const [authPhone, setAuthPhone] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Simulated OTP Toast display
  const [simulatedCode, setSimulatedCode] = useState<string | null>(null);

  // Intended action storage for authentication funnel
  const [pendingAction, setPendingAction] = useState<{ type: "book" | "chat" | "add_service"; provider?: ServiceProvider } | null>(null);

  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<ServiceCategory | "ALL">("ALL");
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string>("ALL");

  // AI Search box ("What do you need?")
  const [aiSearchQuery, setAiSearchQuery] = useState("");
  const [aiSearchResult, setAiSearchResult] = useState<{ category: string; explanation: string } | null>(null);
  const [aiSearching, setAiSearching] = useState(false);

  // Providers & DB state
  const [providers, setProviders] = useState<ServiceProvider[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals / Interventions
  const [activeBookingProvider, setActiveBookingProvider] = useState<ServiceProvider | null>(null);
  const [activeChatProvider, setActiveChatProvider] = useState<ServiceProvider | null>(null);
  const [showAddServiceModal, setShowAddServiceModal] = useState(false);
  const [adminCreatingProvider, setAdminCreatingProvider] = useState(false);
  const [selectedProviderForProfile, setSelectedProviderForProfile] = useState<ServiceProvider | null>(null);
  const [selectedFilterSection, setSelectedFilterSection] = useState<"none" | "most-rated" | "trending-today" | "trending-week" | "trending-month">("none");

  // Mobile responsiveness
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Pagination (Phase 14 requirement)
  const [currentPage, setCurrentPage] = useState(1);
  const providersPerPage = 6;

  // Reset pagination on filter/search change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, selectedNeighborhood, searchQuery, selectedFilterSection]);

  // Load user session on mount
  useEffect(() => {
    const user = supabaseService.getCurrentUser();
    if (user) {
      setCurrentUser(user);
      if (user.role === "admin") {
        setActiveView("admin");
      }
    }
  }, []);

  const t = {
    fr: {
      appName: "ONE VILLAGE",
      appTagline: "Marché Communautaire de l'Est • Bertoua",
      searchPlaceholder: "Rechercher un maçon, moto-taxi, couturier...",
      allCategories: "Toutes les catégories",
      allNeighborhoods: "Tous les quartiers de Bertoua",
      becomeProviderBtn: "Proposer un Service",
      browseTitle: "Trouver un Prestataire de Confiance",
      noProviders: "Aucun prestataire ne correspond à vos filtres actuels dans Bertoua.",
      sidebarTitle: "Sagesse Locale AI",
      navBrowse: "Découvrir les Services",
      navAds: "Entraide & Annonces",
      navDashboard: "Mon Tableau de Bord",
      navAdmin: "Console Admin",
      getServiceAppBar: "Obtenir un Service",
      signIn: "Connexion",
      signUp: "S'inscrire",
      logout: "Se déconnecter",
      trendingTitle: "🔥 Populaire cette semaine",
      trendingSubtitle: "Les prestataires les plus actifs et sollicités à Bertoua en ce moment.",
      aiSearchTitle: "🔮 Guide AI Express : \"De quoi avez-vous besoin ?\"",
      aiSearchPlaceholder: "Décrivez votre panne ou besoin (ex: mon frigo ne refroidit plus)...",
      aiSearchBtn: "Analyse Locale AI",
      aiSearchSuccess: "Catégorie suggérée :",
    },
    en: {
      appName: "ONE VILLAGE",
      appTagline: "East Region Community Marketplace • Bertoua",
      searchPlaceholder: "Search for a mason, moto-taxi, tailor...",
      allCategories: "All categories",
      allNeighborhoods: "All neighborhoods in Bertoua",
      becomeProviderBtn: "Offer a Service",
      browseTitle: "Find a Trusted Provider",
      noProviders: "No service providers match your active filters in Bertoua.",
      sidebarTitle: "Local Wisdom AI",
      navBrowse: "Discover Services",
      navAds: "Community Ads",
      navDashboard: "My Dashboard",
      navAdmin: "Admin Console",
      getServiceAppBar: "Get Service",
      signIn: "Sign In",
      signUp: "Sign Up",
      logout: "Log Out",
      trendingTitle: "🔥 Trending This Week",
      trendingSubtitle: "The most requested active providers in Bertoua right now.",
      aiSearchTitle: "🔮 Express AI Guide: \"What do you need?\"",
      aiSearchPlaceholder: "Describe your trouble or need (e.g. my fridge is not cooling)...",
      aiSearchBtn: "Local AI Match",
      aiSearchSuccess: "Suggested Category:",
    }
  }[lang];

  // Fetch providers list (merging static pre-loaded database & local Supabase simulation database)
  const fetchProviders = async () => {
    setLoading(true);
    try {
      // 1. Get static list from the API
      const headers: any = {};
      if (currentUser) {
        headers["x-user-id"] = currentUser.id;
      }
      const url = `/api/providers${currentUser ? `?userId=${currentUser.id}` : ""}`;
      const res = await fetch(url, { headers });
      let staticList: ServiceProvider[] = [];
      if (res.ok) {
        staticList = await res.json();
      }

      // 2. Load dynamic simulations from Supabase simulation service
      const dynamicList = await supabaseService.loadAllProviders();

      // 3. Merge them prioritizing dynamic list by ID
      const mergedMap = new Map<string, ServiceProvider>();
      staticList.forEach((p) => mergedMap.set(p.id, p));
      dynamicList.forEach((p) => mergedMap.set(p.id, p));

      const merged = Array.from(mergedMap.values());

      // Save to local cache for offline/low-connectivity resilience (Phase 14 requirement)
      try {
        localStorage.setItem("onevillage_providers_cache", JSON.stringify(merged));
      } catch (cacheErr) {
        console.error("Failed to write to localStorage providers cache:", cacheErr);
      }

      setProviders(merged);
    } catch (err) {
      console.error("Error fetching providers, attempting to use offline cache:", err);
      try {
        const cached = localStorage.getItem("onevillage_providers_cache");
        if (cached) {
          setProviders(JSON.parse(cached));
        }
      } catch (cacheErr) {
        console.error("Failed to read from offline cache:", cacheErr);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, [currentUser]);

  // Handle AI Search category match
  const handleAISearch = async () => {
    if (!aiSearchQuery.trim()) return;
    setAiSearching(true);
    setAiSearchResult(null);
    try {
      const headers: any = { "Content-Type": "application/json" };
      if (currentUser) {
        headers["x-user-id"] = currentUser.id;
      }
      const res = await fetch(`/api/ai-search${currentUser ? `?userId=${currentUser.id}` : ""}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ query: aiSearchQuery }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiSearchResult({
          category: data.category,
          explanation: data.explanation,
        });
        if (data.category) {
          setSelectedCategory(data.category as ServiceCategory);
        }
      }
    } catch (err) {
      console.error("AI Search failed:", err);
    } finally {
      setAiSearching(false);
    }
  };

  // Auth gate function
  const triggerAuthFunnel = (type: "book" | "chat" | "add_service", provider?: ServiceProvider) => {
    setPendingAction({ type, provider });
    setAuthTab("signin");
    setOtpSent(false);
    setOtpCode("");
    setSimulatedCode(null);
    setErrorMsg("");
    setShowAuthModal(true);
  };

  // Complete pending action post-auth
  const executePendingAction = (user: UserProfile) => {
    if (!pendingAction) return;
    if (pendingAction.type === "book" && pendingAction.provider) {
      setActiveBookingProvider(pendingAction.provider);
    } else if (pendingAction.type === "chat" && pendingAction.provider) {
      setActiveChatProvider(pendingAction.provider);
    } else if (pendingAction.type === "add_service") {
      setShowAddServiceModal(true);
    }
    setPendingAction(null);
  };

  // Request Simulated SMS OTP / Email OTP
  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const target = authMethod === "phone" ? authPhone : authEmail;
    if (!target.trim()) {
      setErrorMsg(lang === "fr" ? "Veuillez remplir ce champ." : "Please fill in this field.");
      return;
    }

    try {
      let code = "";
      if (authMethod === "phone") {
        const res = await supabaseService.sendOTP(target);
        if (!res.success) throw new Error(res.message);
        code = res.code || "";
        setSuccessMsg(
          lang === "fr"
            ? "SMS envoyé ! Code d'accès généré."
            : "SMS Sent! Security access code generated."
        );
      } else {
        const res = await supabaseService.sendEmailOTP(target);
        if (!res.success) throw new Error(res.message);
        code = res.code || "";
        setSuccessMsg(
          lang === "fr"
            ? "E-mail envoyé ! Code de sécurité généré."
            : "Email Sent! Verification code generated."
        );
      }

      setSimulatedCode(code);
      setOtpSent(true);
    } catch (err: any) {
      setErrorMsg(err.message || "Error");
    }
  };

  // Verify Simulated OTP
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!otpCode.trim()) {
      setErrorMsg(lang === "fr" ? "Veuillez entrer le code." : "Please enter the code.");
      return;
    }

    try {
      const target = authMethod === "phone" ? authPhone : authEmail;
      let sessionUser: UserProfile | undefined;

      if (authMethod === "phone") {
        const res = await supabaseService.verifyOTP(target, otpCode);
        if (!res.success) throw new Error(res.message);
        sessionUser = res.user;
      } else {
        const res = await supabaseService.verifyEmailOTP(target, otpCode);
        if (!res.success) throw new Error(res.message);
        sessionUser = res.user;
      }

      if (!sessionUser) {
        throw new Error(lang === "fr" ? "Échec d'authentification." : "Failed to retrieve user session profile.");
      }

      // If sign up, we may apply name
      if (authTab === "signup" && authName.trim() && !sessionUser.fullName) {
        sessionUser = await supabaseService.updateUserProfile({
          fullName: authName.trim(),
        });
      }

      setCurrentUser(sessionUser);
      setShowAuthModal(false);
      setOtpSent(false);
      setOtpCode("");
      setSimulatedCode(null);

      // Route based on role
      if (sessionUser.role === "admin") {
        setActiveView("admin");
      } else if (!sessionUser.onboarding_completed) {
        // Shown onboarding flow automatically by layout
      } else {
        executePendingAction(sessionUser);
      }
    } catch (err: any) {
      setErrorMsg(err.message || (lang === "fr" ? "Code incorrect." : "Incorrect verification code."));
    }
  };

  // Logout
  const handleLogout = () => {
    supabaseService.logout();
    setCurrentUser(null);
    setActiveView("browse");
  };

  // App Bar CTA Get Service Tapping
  const handleAppBarGetService = () => {
    if (!currentUser) {
      triggerAuthFunnel("add_service");
    } else if (currentUser.role === "provider") {
      setActiveView("dashboard");
    } else {
      setActiveView("browse");
      setSelectedCategory("ALL");
      const el = document.getElementById("search-listings-container");
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Filter logic: Only show approved providers, OR if the current user is that provider themselves
  const filteredProviders = providers.filter((p) => {
    const isApproved = p.verified || p.status === "approved";
    const isMine = currentUser && p.id === currentUser.id;
    const isAdmin = currentUser && currentUser.role === "admin";
    
    // Unverified providers are hidden from guests and other clients
    if (!isApproved && !isMine && !isAdmin) {
      return false;
    }

    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.businessName && p.businessName.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = selectedCategory === "ALL" || p.category === selectedCategory;
    const matchesNeighborhood = selectedNeighborhood === "ALL" || p.neighborhoodId === selectedNeighborhood;

    return matchesSearch && matchesCategory && matchesNeighborhood;
  });

  // Sort logic for Discovery (Phase 10)
  if (selectedCategory !== "ALL") {
    // Category pages default-sort by a blended score (rating × recency × volume)
    filteredProviders.sort((a, b) => {
      const scoreA = (a.rating || 0) * ((a.bookingsCount || 0) + 1) * (a.recencyScore || 0.8);
      const scoreB = (b.rating || 0) * ((b.bookingsCount || 0) + 1) * (b.recencyScore || 0.8);
      return scoreB - scoreA;
    });
  } else if (selectedFilterSection === "most-rated") {
    filteredProviders.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));
  } else if (selectedFilterSection === "trending-today") {
    filteredProviders.sort((a, b) => {
      const scoreA = (a.popularityBookingsToday || 0) * 10 + (a.popularityChatsToday || 0) * 5 + (a.popularityViewsToday || 0);
      const scoreB = (b.popularityBookingsToday || 0) * 10 + (b.popularityChatsToday || 0) * 5 + (b.popularityViewsToday || 0);
      return scoreB - scoreA;
    });
  } else if (selectedFilterSection === "trending-week") {
    filteredProviders.sort((a, b) => {
      const scoreA = (a.popularityBookingsWeek || 0) * 10 + (a.popularityChatsWeek || 0) * 5 + (a.popularityViewsWeek || 0);
      const scoreB = (b.popularityBookingsWeek || 0) * 10 + (b.popularityChatsWeek || 0) * 5 + (b.popularityViewsWeek || 0);
      return scoreB - scoreA;
    });
  } else if (selectedFilterSection === "trending-month") {
    filteredProviders.sort((a, b) => {
      const scoreA = (a.popularityBookingsMonth || 0) * 10 + (a.popularityChatsMonth || 0) * 5 + (a.popularityViewsMonth || 0);
      const scoreB = (b.popularityBookingsMonth || 0) * 10 + (b.popularityChatsMonth || 0) * 5 + (b.popularityViewsMonth || 0);
      return scoreB - scoreA;
    });
  }

  // Calculate trending/most-rated lists (only approved ones)
  const trendingProviders = [...providers]
    .filter((p) => p.verified || p.status === "approved")
    .sort((a, b) => (b.bookingsCount || 0) - (a.bookingsCount || 0))
    .slice(0, 3);

  const mostRatedProvidersList = [...providers]
    .filter((p) => p.verified || p.status === "approved")
    .sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));

  const trendingTodayList = [...providers]
    .filter((p) => p.verified || p.status === "approved")
    .sort((a, b) => {
      const scoreA = (a.popularityBookingsToday || 0) * 10 + (a.popularityChatsToday || 0) * 5 + (a.popularityViewsToday || 0);
      const scoreB = (b.popularityBookingsToday || 0) * 10 + (b.popularityChatsToday || 0) * 5 + (b.popularityViewsToday || 0);
      return scoreB - scoreA;
    });

  const trendingWeekList = [...providers]
    .filter((p) => p.verified || p.status === "approved")
    .sort((a, b) => {
      const scoreA = (a.popularityBookingsWeek || 0) * 10 + (a.popularityChatsWeek || 0) * 5 + (a.popularityViewsWeek || 0);
      const scoreB = (b.popularityBookingsWeek || 0) * 10 + (b.popularityChatsWeek || 0) * 5 + (b.popularityViewsWeek || 0);
      return scoreB - scoreA;
    });

  const trendingMonthList = [...providers]
    .filter((p) => p.verified || p.status === "approved")
    .sort((a, b) => {
      const scoreA = (a.popularityBookingsMonth || 0) * 10 + (a.popularityChatsMonth || 0) * 5 + (a.popularityViewsMonth || 0);
      const scoreB = (b.popularityBookingsMonth || 0) * 10 + (b.popularityChatsMonth || 0) * 5 + (b.popularityViewsMonth || 0);
      return scoreB - scoreA;
    });

  // Resolve category icons dynamically
  const getCategoryIcon = (category: ServiceCategory) => {
    const icons = {
      [ServiceCategory.AGRICULTURE]: Sprout,
      [ServiceCategory.TRANSPORT]: Bike,
      [ServiceCategory.HOME_HELP]: Home,
      [ServiceCategory.CHILDCARE]: Baby,
      [ServiceCategory.CONSTRUCTION]: Hammer,
      [ServiceCategory.TAILORING]: Scissors,
      [ServiceCategory.EDUCATION]: GraduationCap,
      [ServiceCategory.HEALTH]: HeartPulse,
    };
    return icons[category] || HelpCircleIcon;
  };

  const HelpCircleIcon = (props: any) => <HelpCircle {...props} />;

  // Admin Approval Action
  const handleAdminApprove = async (providerId: string) => {
    await supabaseService.verifyProvider(providerId, true);
    fetchProviders();
  };

  // Admin Rejection Action
  const handleAdminReject = async (providerId: string, reason: string) => {
    await supabaseService.verifyProvider(providerId, false, reason);
    fetchProviders();
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#2C2520] font-sans antialiased selection:bg-amber-200/50 pb-16">
      
      {/* Simulated SMS/Email Notification Banner */}
      {simulatedCode && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-amber-900 border-2 border-amber-400 text-amber-50 rounded-2xl px-6 py-4 shadow-2xl z-50 max-w-sm w-11/12 animate-bounce space-y-2">
          <div className="flex items-center gap-2 border-b border-amber-800 pb-1.5">
            <span className="text-lg">📱</span>
            <span className="font-black text-xs uppercase tracking-wider text-amber-300">
              {authMethod === "phone" ? "Simulated SMS Received" : "Simulated Email Received"}
            </span>
          </div>
          <p className="text-xs font-serif text-amber-100">
            {authMethod === "phone"
              ? `[SMS MoMo-Network] Your One Village security validation OTP verification code is:`
              : `[E-Mail] Use this authorization code to secure your login:`}
          </p>
          <div className="bg-amber-950 rounded-xl py-2 px-4 text-center font-mono font-black text-lg tracking-widest text-amber-300 border border-amber-800 select-all">
            {simulatedCode}
          </div>
          <p className="text-[10px] text-amber-400/80 text-center font-medium">
            (Copy and enter the code below to complete sign-in)
          </p>
        </div>
      )}

      {/* Upper Navigation Bar */}
      <header className="bg-white border-b border-amber-100/80 sticky top-0 z-40 shadow-sm backdrop-blur-md bg-white/95">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <img
                src={brandLogo}
                alt="OneVillage Logo"
                className="w-12 h-12 object-contain rounded-xl shadow-sm border border-amber-100"
                referrerPolicy="no-referrer"
              />
              <div>
                <h1 className="font-extrabold text-amber-900 tracking-tight text-xl sm:text-2xl font-sans">
                  {t.appName}
                </h1>
                <p className="text-[10px] sm:text-xs font-semibold text-amber-800/80 uppercase tracking-wider">
                  {t.appTagline}
                </p>
              </div>
            </div>

            {/* Desktop Nav Actions */}
            <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-amber-900/80">
              <button
                onClick={() => { setActiveView("browse"); setActiveChatProvider(null); }}
                className={`transition-colors py-2 px-1 hover:text-amber-950 cursor-pointer border-b-2 ${
                  activeView === "browse" ? "border-amber-800 text-amber-950" : "border-transparent"
                }`}
              >
                {t.navBrowse}
              </button>
              <button
                onClick={() => { setActiveView("ads"); setActiveChatProvider(null); }}
                className={`transition-colors py-2 px-1 hover:text-amber-950 cursor-pointer border-b-2 ${
                  activeView === "ads" ? "border-amber-800 text-amber-950" : "border-transparent"
                }`}
              >
                {t.navAds}
              </button>
              
              {currentUser && currentUser.onboarding_completed && (
                <button
                  onClick={() => { setActiveView("dashboard"); setActiveChatProvider(null); }}
                  className={`transition-colors py-2 px-1 hover:text-amber-950 cursor-pointer border-b-2 ${
                    activeView === "dashboard" ? "border-amber-800 text-amber-950" : "border-transparent"
                  }`}
                >
                  {t.navDashboard}
                </button>
              )}

              {currentUser && currentUser.role === "admin" && (
                <button
                  onClick={() => { setActiveView("admin"); setActiveChatProvider(null); }}
                  className={`transition-colors py-2 px-1 text-red-800 hover:text-red-950 cursor-pointer border-b-2 flex items-center gap-1 ${
                    activeView === "admin" ? "border-red-800 text-red-950 font-black" : "border-transparent"
                  }`}
                >
                  <ShieldCheck className="w-4 h-4 text-red-700" />
                  {t.navAdmin}
                </button>
              )}
            </nav>

            {/* Language & Actions */}
            <div className="hidden md:flex items-center gap-4">
              <button
                onClick={() => setLang(lang === "fr" ? "en" : "fr")}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-amber-900 bg-amber-50 rounded-xl border border-amber-200/50 hover:bg-amber-100/60 transition-colors cursor-pointer"
              >
                <Globe className="w-4 h-4 text-amber-700" />
                <span>{lang === "fr" ? "English" : "Français"}</span>
              </button>

              {currentUser ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 px-3 py-2 rounded-xl text-xs font-bold text-amber-900">
                    <User className="w-4 h-4 text-amber-700" />
                    <span>{currentUser.fullName || currentUser.phone}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="text-xs font-bold text-red-700 hover:text-red-900 bg-red-50 border border-red-100 px-3 py-2 rounded-xl hover:bg-red-100 transition-colors cursor-pointer"
                  >
                    {t.logout}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setAuthTab("signin"); setOtpSent(false); setSimulatedCode(null); setShowAuthModal(true); }}
                  className="text-xs font-bold text-amber-900 bg-amber-50 border border-amber-200/50 hover:bg-amber-100 px-4 py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  {t.signIn}
                </button>
              )}

              <button
                onClick={handleAppBarGetService}
                id="btn-nav-become-provider"
                className="bg-amber-800 hover:bg-amber-900 text-white font-black text-xs px-4 py-3 rounded-xl flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                {currentUser?.role === "provider" ? t.navDashboard : t.becomeProviderBtn}
              </button>
            </div>

            {/* Mobile Hamburger menu */}
            <div className="flex items-center gap-3 md:hidden">
              <button
                onClick={() => setLang(lang === "fr" ? "en" : "fr")}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-amber-900 bg-amber-50 rounded-lg border border-amber-200/50 cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5 text-amber-700" />
                <span>{lang === "fr" ? "EN" : "FR"}</span>
              </button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 text-amber-900 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu view */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-amber-100 bg-white px-4 pt-4 pb-6 space-y-3.5 shadow-lg absolute w-full left-0 animate-fade-in">
            <nav className="flex flex-col gap-3 font-semibold text-amber-900/80">
              <button
                onClick={() => { setActiveView("browse"); setActiveChatProvider(null); setMobileMenuOpen(false); }}
                className={`py-2 text-left border-l-4 pl-3 ${
                  activeView === "browse" ? "border-amber-800 text-amber-950 font-bold bg-amber-50/50" : "border-transparent"
                }`}
              >
                {t.navBrowse}
              </button>
              <button
                onClick={() => { setActiveView("ads"); setActiveChatProvider(null); setMobileMenuOpen(false); }}
                className={`py-2 text-left border-l-4 pl-3 ${
                  activeView === "ads" ? "border-amber-800 text-amber-950 font-bold bg-amber-50/50" : "border-transparent"
                }`}
              >
                {t.navAds}
              </button>
              {currentUser && currentUser.onboarding_completed && (
                <button
                  onClick={() => { setActiveView("dashboard"); setActiveChatProvider(null); setMobileMenuOpen(false); }}
                  className={`py-2 text-left border-l-4 pl-3 ${
                    activeView === "dashboard" ? "border-amber-800 text-amber-950 font-bold bg-amber-50/50" : "border-transparent"
                  }`}
                >
                  {t.navDashboard}
                </button>
              )}
              {currentUser && currentUser.role === "admin" && (
                <button
                  onClick={() => { setActiveView("admin"); setActiveChatProvider(null); setMobileMenuOpen(false); }}
                  className={`py-2 text-left border-l-4 pl-3 text-red-800 ${
                    activeView === "admin" ? "border-red-800 text-red-950 font-bold bg-red-50/50" : "border-transparent"
                  }`}
                >
                  {t.navAdmin}
                </button>
              )}
            </nav>

            {currentUser ? (
              <div className="flex flex-col gap-2 pt-2 border-t border-amber-100">
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 px-3 py-2.5 rounded-xl text-xs font-bold text-amber-900">
                  <User className="w-4.5 h-4.5 text-amber-700" />
                  <span>{currentUser.fullName || currentUser.phone}</span>
                </div>
                <button
                  onClick={() => { handleLogout(); setMobileMenuOpen(false); }}
                  className="w-full text-xs font-bold text-red-700 hover:text-red-900 bg-red-50 border border-red-100 py-2.5 rounded-xl transition-colors cursor-pointer text-center"
                >
                  {t.logout}
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setAuthTab("signin"); setOtpSent(false); setSimulatedCode(null); setShowAuthModal(true); setMobileMenuOpen(false); }}
                className="w-full text-xs font-bold text-amber-900 bg-amber-50 border border-amber-200/50 py-2.5 rounded-xl cursor-pointer text-center"
              >
                {t.signIn}
              </button>
            )}

            <button
              onClick={() => {
                handleAppBarGetService();
                setMobileMenuOpen(false);
              }}
              className="w-full bg-amber-800 hover:bg-amber-900 text-white font-bold text-xs py-3 rounded-xl flex items-center justify-center gap-2 shadow-sm cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              {currentUser?.role === "provider" ? t.navDashboard : t.becomeProviderBtn}
            </button>
          </div>
        )}
      </header>

      {/* Main Body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* IF USER LOGGED IN BUT NOT COMPLETED ONBOARDING -> RENDER ONBOARDING FLOW EXCLUSIVELY */}
        {currentUser && !currentUser.onboarding_completed ? (
          <div className="animate-fade-in max-w-4xl mx-auto py-4">
            <OnboardingFlow
              lang={lang}
              setLang={setLang}
              userId={currentUser.id}
              userPhone={currentUser.phone}
              userEmail={currentUser.email}
              onComplete={(updated) => {
                setCurrentUser(updated);
                fetchProviders();
                setActiveView("browse");
              }}
            />
          </div>
        ) : (
          <>
            {/* VIEW 1: BROWSE DIRECTORY */}
            {activeView === "browse" && (
              <div className="space-y-8 animate-fade-in" id="search-listings-container">
                {/* Horizontal Scrolling Discover Feeds for Signed-in Users (Phase 10) vs Guest Hero */}
                {currentUser ? (
                  selectedCategory === "ALL" && selectedNeighborhood === "ALL" && searchQuery === "" && selectedFilterSection === "none" && !selectedProviderForProfile && !activeChatProvider && (
                    <div className="space-y-8 bg-[#FAF8F5] border border-amber-200/40 rounded-3xl p-6 sm:p-8 shadow-sm">
                      <div className="border-b border-amber-100 pb-3 flex items-center justify-between">
                        <div>
                          <h3 className="text-base sm:text-lg font-black text-amber-950 uppercase tracking-tight">
                            {lang === "fr" ? "✨ Tableau de Découverte" : "✨ Discovery Dashboard"}
                          </h3>
                          <p className="text-[11px] text-amber-800/80 font-serif">
                            {lang === "fr" 
                              ? "Recommandations et prestataires populaires mis à jour à Bertoua" 
                              : "Recommendations and trending providers updated daily in Bertoua"}
                          </p>
                        </div>
                        <span className="text-[9px] font-black uppercase bg-amber-800 text-amber-100 px-2.5 py-1 rounded-full">
                          {lang === "fr" ? "Flux Membre" : "Member Feed"}
                        </span>
                      </div>

                      {/* Section 1: Most Rated */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-base">⭐</span>
                            <h4 className="text-xs sm:text-sm font-black text-amber-950 uppercase tracking-wide">
                              {lang === "fr" ? "Prestataires les mieux notés" : "Most-Rated Providers"}
                            </h4>
                          </div>
                          <button
                            onClick={() => setSelectedFilterSection("most-rated")}
                            className="text-[10px] font-bold text-amber-800 hover:text-amber-950 hover:underline cursor-pointer flex items-center gap-1"
                          >
                            {lang === "fr" ? "Voir tout" : "View all"} &rarr;
                          </button>
                        </div>
                        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
                          {mostRatedProvidersList.slice(0, 6).map((p) => {
                            const catObj = CATEGORY_DETAILS[p.category];
                            return (
                              <div
                                key={`most-rated-${p.id}`}
                                className="bg-white border border-amber-100 rounded-2xl p-4 w-60 shrink-0 flex flex-col justify-between shadow-sm hover:border-amber-300 transition-all cursor-pointer group"
                                onClick={() => setSelectedProviderForProfile(p)}
                              >
                                <div>
                                  <div className="flex items-center justify-between gap-2 mb-2">
                                    <span className="text-[8px] bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded font-black font-mono">
                                      {p.reviewCount} {lang === "fr" ? "avis" : "reviews"}
                                    </span>
                                    <span className="text-[10px] text-amber-500 font-bold flex items-center gap-0.5">
                                      ★ {p.rating.toFixed(1)}
                                    </span>
                                  </div>
                                  <h4 className="font-bold text-amber-950 text-xs truncate group-hover:text-amber-800 transition-colors">{p.name}</h4>
                                  <p className="text-[10px] text-amber-800/80 mt-1 font-serif line-clamp-2">
                                    "{p.description}"
                                  </p>
                                </div>
                                <div className="mt-4 pt-2 border-t border-amber-50 flex items-center justify-between">
                                  <span className="font-bold text-[10px] text-amber-950 font-mono">
                                    {p.rateFCFA} F / {p.rateUnit}
                                  </span>
                                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide bg-${catObj?.color}-50 text-${catObj?.color}-700`}>
                                    {lang === "fr" ? catObj?.nameFR : catObj?.nameEN}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Section 2: Trending Today */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-base">⚡</span>
                            <h4 className="text-xs sm:text-sm font-black text-amber-950 uppercase tracking-wide">
                              {lang === "fr" ? "Tendances d'aujourd'hui" : "Trending Today"}
                            </h4>
                          </div>
                          <button
                            onClick={() => setSelectedFilterSection("trending-today")}
                            className="text-[10px] font-bold text-amber-800 hover:text-amber-950 hover:underline cursor-pointer flex items-center gap-1"
                          >
                            {lang === "fr" ? "Voir tout" : "View all"} &rarr;
                          </button>
                        </div>
                        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
                          {trendingTodayList.slice(0, 6).map((p) => {
                            const catObj = CATEGORY_DETAILS[p.category];
                            return (
                              <div
                                key={`trending-today-${p.id}`}
                                className="bg-white border border-amber-100 rounded-2xl p-4 w-60 shrink-0 flex flex-col justify-between shadow-sm hover:border-amber-300 transition-all cursor-pointer group"
                                onClick={() => setSelectedProviderForProfile(p)}
                              >
                                <div>
                                  <div className="flex items-center justify-between gap-2 mb-2">
                                    <span className="text-[8px] bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded font-black font-mono">
                                      {p.popularityViewsToday || 0} {lang === "fr" ? "vues" : "views"}
                                    </span>
                                    <span className="text-[10px] text-amber-500 font-bold flex items-center gap-0.5">
                                      ★ {p.rating.toFixed(1)}
                                    </span>
                                  </div>
                                  <h4 className="font-bold text-amber-950 text-xs truncate group-hover:text-amber-800 transition-colors">{p.name}</h4>
                                  <p className="text-[10px] text-amber-800/80 mt-1 font-serif line-clamp-2">
                                    "{p.description}"
                                  </p>
                                </div>
                                <div className="mt-4 pt-2 border-t border-amber-50 flex items-center justify-between">
                                  <span className="font-bold text-[10px] text-amber-950 font-mono">
                                    {p.rateFCFA} F / {p.rateUnit}
                                  </span>
                                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide bg-${catObj?.color}-50 text-${catObj?.color}-700`}>
                                    {lang === "fr" ? catObj?.nameFR : catObj?.nameEN}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Section 3: Trending This Week */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-base">🔥</span>
                            <h4 className="text-xs sm:text-sm font-black text-amber-950 uppercase tracking-wide">
                              {lang === "fr" ? "Tendances de la semaine" : "Trending This Week"}
                            </h4>
                          </div>
                          <button
                            onClick={() => setSelectedFilterSection("trending-week")}
                            className="text-[10px] font-bold text-amber-800 hover:text-amber-950 hover:underline cursor-pointer flex items-center gap-1"
                          >
                            {lang === "fr" ? "Voir tout" : "View all"} &rarr;
                          </button>
                        </div>
                        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
                          {trendingWeekList.slice(0, 6).map((p) => {
                            const catObj = CATEGORY_DETAILS[p.category];
                            return (
                              <div
                                key={`trending-week-${p.id}`}
                                className="bg-white border border-amber-100 rounded-2xl p-4 w-60 shrink-0 flex flex-col justify-between shadow-sm hover:border-amber-300 transition-all cursor-pointer group"
                                onClick={() => setSelectedProviderForProfile(p)}
                              >
                                <div>
                                  <div className="flex items-center justify-between gap-2 mb-2">
                                    <span className="text-[8px] bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded font-black font-mono">
                                      {p.popularityBookingsWeek || 0} {lang === "fr" ? "réserv." : "books"}
                                    </span>
                                    <span className="text-[10px] text-amber-500 font-bold flex items-center gap-0.5">
                                      ★ {p.rating.toFixed(1)}
                                    </span>
                                  </div>
                                  <h4 className="font-bold text-amber-950 text-xs truncate group-hover:text-amber-800 transition-colors">{p.name}</h4>
                                  <p className="text-[10px] text-amber-800/80 mt-1 font-serif line-clamp-2">
                                    "{p.description}"
                                  </p>
                                </div>
                                <div className="mt-4 pt-2 border-t border-amber-50 flex items-center justify-between">
                                  <span className="font-bold text-[10px] text-amber-950 font-mono">
                                    {p.rateFCFA} F / {p.rateUnit}
                                  </span>
                                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide bg-${catObj?.color}-50 text-${catObj?.color}-700`}>
                                    {lang === "fr" ? catObj?.nameFR : catObj?.nameEN}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Section 4: Trending This Month */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-base">📈</span>
                            <h4 className="text-xs sm:text-sm font-black text-amber-950 uppercase tracking-wide">
                              {lang === "fr" ? "Tendances du mois" : "Trending This Month"}
                            </h4>
                          </div>
                          <button
                            onClick={() => setSelectedFilterSection("trending-month")}
                            className="text-[10px] font-bold text-amber-800 hover:text-amber-950 hover:underline cursor-pointer flex items-center gap-1"
                          >
                            {lang === "fr" ? "Voir tout" : "View all"} &rarr;
                          </button>
                        </div>
                        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
                          {trendingMonthList.slice(0, 6).map((p) => {
                            const catObj = CATEGORY_DETAILS[p.category];
                            return (
                              <div
                                key={`trending-month-${p.id}`}
                                className="bg-white border border-amber-100 rounded-2xl p-4 w-60 shrink-0 flex flex-col justify-between shadow-sm hover:border-amber-300 transition-all cursor-pointer group"
                                onClick={() => setSelectedProviderForProfile(p)}
                              >
                                <div>
                                  <div className="flex items-center justify-between gap-2 mb-2">
                                    <span className="text-[8px] bg-purple-50 text-purple-800 px-1.5 py-0.5 rounded font-black font-mono">
                                      {p.popularityChatsMonth || 0} {lang === "fr" ? "chats" : "chats"}
                                    </span>
                                    <span className="text-[10px] text-amber-500 font-bold flex items-center gap-0.5">
                                      ★ {p.rating.toFixed(1)}
                                    </span>
                                  </div>
                                  <h4 className="font-bold text-amber-950 text-xs truncate group-hover:text-amber-800 transition-colors">{p.name}</h4>
                                  <p className="text-[10px] text-amber-800/80 mt-1 font-serif line-clamp-2">
                                    "{p.description}"
                                  </p>
                                </div>
                                <div className="mt-4 pt-2 border-t border-amber-50 flex items-center justify-between">
                                  <span className="font-bold text-[10px] text-amber-950 font-mono">
                                    {p.rateFCFA} F / {p.rateUnit}
                                  </span>
                                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide bg-${catObj?.color}-50 text-${catObj?.color}-700`}>
                                    {lang === "fr" ? catObj?.nameFR : catObj?.nameEN}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )
                ) : (
                  /* Guest Hero Trending Card */
                  <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100 rounded-3xl p-6 sm:p-8 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">🔥</span>
                      <h3 className="text-base sm:text-lg font-black text-amber-950 uppercase tracking-tight">
                        {t.trendingTitle}
                      </h3>
                    </div>
                    <p className="text-xs text-amber-800/80 mb-6 max-w-2xl font-serif">
                      {t.trendingSubtitle}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {trendingProviders.map((p) => {
                        const catObj = CATEGORY_DETAILS[p.category];
                        const IconComp = getCategoryIcon(p.category);
                        return (
                          <div
                            key={`trending-${p.id}`}
                            className="bg-white border border-amber-200/50 rounded-2xl p-4 flex flex-col justify-between hover:shadow-md transition-all group"
                          >
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-${catObj?.color}-50 text-${catObj?.color}-700 border border-${catObj?.color}-100 flex items-center gap-1`}>
                                  <IconComp className="w-2.5 h-2.5" />
                                  {lang === "fr" ? catObj?.nameFR : catObj?.nameEN}
                                </span>
                                <span className="text-[10px] font-black text-amber-800 bg-amber-50 px-2 py-0.5 rounded font-mono">
                                  {p.bookingsCount || 12} bookings
                                </span>
                              </div>
                              <h4 className="font-bold text-amber-950 text-sm group-hover:text-amber-800 transition-colors">
                                {p.name}
                              </h4>
                              <p className="text-[11px] text-amber-800/80 mt-1 font-serif line-clamp-2">
                                "{p.description}"
                              </p>
                            </div>

                            <div className="mt-4 pt-3 border-t border-amber-50 flex items-center justify-between">
                              <span className="font-bold text-xs text-amber-950 font-mono">
                                {p.rateFCFA} F / {p.rateUnit}
                              </span>
                              <button
                                onClick={() => {
                                  if (!currentUser) {
                                    triggerAuthFunnel("book", p);
                                  } else {
                                    setActiveBookingProvider(p);
                                  }
                                }}
                                className="text-[10px] bg-amber-800 hover:bg-amber-900 text-white font-bold px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                              >
                                {lang === "fr" ? "Contacter" : "Contact"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                  {/* Left/Middle Column: Services Browser */}
                  <div className="lg:col-span-8 space-y-6">

                    {/* Promoted Ads Carousel (Phase 13 requirement) */}
                    <PromotedAdsCarousel
                      lang={lang}
                      selectedCategory={selectedCategory}
                      providers={providers}
                      onViewProviderProfile={(prov) => setSelectedProviderForProfile(prov)}
                    />
                    
                    {/* Express AI Guide Search Box */}
                    <div className="bg-amber-950 text-amber-50 rounded-3xl p-6 shadow-md space-y-4 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-800/20 rounded-full blur-2xl -mr-10 -mt-10" />
                      <h4 className="font-black text-xs uppercase tracking-wider text-amber-300 flex items-center gap-2">
                        {t.aiSearchTitle}
                      </h4>
                      <div className="flex flex-col sm:flex-row gap-2 relative z-10">
                        <input
                          type="text"
                          value={aiSearchQuery}
                          onChange={(e) => setAiSearchQuery(e.target.value)}
                          placeholder={t.aiSearchPlaceholder}
                          className="flex-1 bg-amber-900/40 border border-amber-800/80 rounded-xl py-3 px-4 text-xs text-white placeholder-amber-200/50 focus:outline-none focus:ring-1 focus:ring-amber-400"
                          onKeyDown={(e) => { if (e.key === "Enter") handleAISearch(); }}
                        />
                        <button
                          onClick={handleAISearch}
                          disabled={aiSearching}
                          className="bg-amber-100 hover:bg-white text-amber-950 font-black text-xs px-5 py-3 rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50 shrink-0"
                        >
                          {aiSearching ? "..." : t.aiSearchBtn}
                        </button>
                      </div>

                      {aiSearchResult && (
                        <div className="bg-amber-900/30 border border-amber-800/50 rounded-2xl p-4 space-y-2 animate-fade-in text-xs leading-relaxed">
                          <p className="font-bold text-amber-300">
                            ✨ {t.aiSearchSuccess} {lang === "fr" ? CATEGORY_DETAILS[aiSearchResult.category as ServiceCategory]?.nameFR : CATEGORY_DETAILS[aiSearchResult.category as ServiceCategory]?.nameEN}
                          </p>
                          <p className="text-amber-100/90 font-serif">
                            {aiSearchResult.explanation}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Filter / Search dashboard */}
                    <div className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm space-y-4">
                      <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-800/60 w-5 h-5" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder={t.searchPlaceholder}
                          className="w-full bg-[#FAF8F5] border border-amber-200/80 rounded-2xl py-3.5 pl-12 pr-4 text-sm text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-800/40"
                        />
                      </div>

                      {/* Filter selects */}
                      <div className="flex flex-col sm:flex-row gap-3">
                        <div className="flex-1 relative">
                          <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value as ServiceCategory | "ALL")}
                            className="w-full bg-[#FAF8F5] border border-amber-200/80 rounded-xl py-3 px-3.5 text-xs font-semibold text-amber-950 focus:outline-none cursor-pointer"
                          >
                            <option value="ALL">{t.allCategories}</option>
                            {Object.keys(ServiceCategory).map((cat) => (
                              <option key={cat} value={cat}>
                                {lang === "fr" ? CATEGORY_DETAILS[cat as ServiceCategory]?.nameFR : CATEGORY_DETAILS[cat as ServiceCategory]?.nameEN}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex-1 relative">
                          <select
                            value={selectedNeighborhood}
                            onChange={(e) => setSelectedNeighborhood(e.target.value)}
                            className="w-full bg-[#FAF8F5] border border-amber-200/80 rounded-xl py-3 px-3.5 text-xs font-semibold text-amber-950 focus:outline-none cursor-pointer"
                          >
                            <option value="ALL">{t.allNeighborhoods}</option>
                            {BERTOUA_NEIGHBORHOODS.map((nh) => (
                              <option key={nh.id} value={nh.id}>
                                {nh.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Quick categories pills */}
                      <div className="flex gap-2 overflow-x-auto pt-2 pb-1 scrollbar-thin">
                        <button
                          onClick={() => setSelectedCategory("ALL")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                            selectedCategory === "ALL"
                              ? "bg-amber-800 text-white"
                              : "bg-amber-50 text-amber-900 border border-amber-200/40 hover:bg-amber-100/40"
                          }`}
                        >
                          🚀 Tout / All
                        </button>
                        {Object.keys(ServiceCategory).map((catKey) => {
                          const catObj = CATEGORY_DETAILS[catKey as ServiceCategory];
                          const Icon = getCategoryIcon(catKey as ServiceCategory);
                          const isSelected = selectedCategory === catKey;
                          return (
                            <button
                              key={catKey}
                              onClick={() => setSelectedCategory(catKey as ServiceCategory)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                                isSelected
                                  ? "bg-amber-800 text-white"
                                  : "bg-amber-50 text-amber-900 border border-amber-200/40 hover:bg-amber-100/40"
                              }`}
                            >
                              <Icon className="w-3.5 h-3.5" />
                              {lang === "fr" ? catObj.nameFR : catObj.nameEN}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Dedicated AI Chat Launcher Banner (Phase 6 requirement) */}
                    <div className="bg-gradient-to-br from-amber-800 to-amber-950 text-white rounded-3xl p-6 shadow-sm relative overflow-hidden group border border-amber-700/20">
                      <div className="absolute -right-8 -bottom-8 w-36 h-36 bg-amber-600/10 rounded-full blur-2xl group-hover:scale-110 transition-transform duration-500" />
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
                        <div className="flex items-center gap-4">
                          <span className="w-11 h-11 rounded-full bg-amber-100 flex items-center justify-center shadow-md border border-amber-200 select-none overflow-hidden">
                            <img
                              src={brandLogo}
                              alt="AI Guide Logo"
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </span>
                          <div>
                            <h4 className="font-black text-xs uppercase tracking-wide text-amber-200 flex items-center gap-1.5">
                              {lang === "fr" ? "Tonton l'Est — Guide IA" : "Tonton l'Est — AI Guide"}
                              <span className="bg-amber-100 text-amber-950 text-[9px] font-black px-2 py-0.5 rounded-full uppercase">
                                Phase 8
                              </span>
                            </h4>
                            <p className="text-xs text-amber-100/95 leading-relaxed font-serif mt-1 max-w-lg">
                              {lang === "fr" 
                                ? "Chuchotez avec notre guide pour traduire vos phrases en Gbaya/Makaa/Fulfulde, ou calculer des prix justes à Bertoua."
                                : "Chat with our local guide to translate to local dialects or estimate fair trade rates in Bertoua."}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const widget = document.getElementById("ai-guide-widget");
                            if (widget) {
                              widget.scrollIntoView({ behavior: "smooth" });
                              widget.classList.add("ring-4", "ring-amber-500", "ring-opacity-50");
                              // Also focus input
                              const aiInput = widget.querySelector("input");
                              if (aiInput) aiInput.focus();
                              setTimeout(() => {
                                widget.classList.remove("ring-4", "ring-amber-500", "ring-opacity-50");
                              }, 2000);
                            }
                          }}
                          className="bg-amber-100 hover:bg-white text-amber-950 font-black text-xs px-5 py-3 rounded-xl transition-all shadow-sm cursor-pointer whitespace-nowrap self-stretch sm:self-auto text-center"
                        >
                          {lang === "fr" ? "Discuter avec le Guide IA" : "Chat with AI Guide"}
                        </button>
                      </div>
                    </div>

                    {/* Browse Listings Title and discovery notices */}
                    <div className="space-y-3">
                      {selectedFilterSection !== "none" && (
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-4 animate-fade-in shadow-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-base">📌</span>
                            <span className="text-xs font-bold text-amber-950">
                              {selectedFilterSection === "most-rated" && (lang === "fr" ? "Affichage : Les mieux notés" : "Viewing: Most Rated")}
                              {selectedFilterSection === "trending-today" && (lang === "fr" ? "Affichage : Tendances aujourd'hui" : "Viewing: Trending Today")}
                              {selectedFilterSection === "trending-week" && (lang === "fr" ? "Affichage : Tendances cette semaine" : "Viewing: Trending This Week")}
                              {selectedFilterSection === "trending-month" && (lang === "fr" ? "Affichage : Tendances ce mois" : "Viewing: Trending This Month")}
                            </span>
                          </div>
                          <button
                            onClick={() => setSelectedFilterSection("none")}
                            className="text-[10px] bg-white hover:bg-amber-100 text-amber-900 border border-amber-200 px-2.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer shadow-sm"
                          >
                            &larr; {lang === "fr" ? "Réinitialiser" : "Clear Filter"}
                          </button>
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-2">
                        <h2 className="text-base font-extrabold text-amber-950 uppercase tracking-wide">
                          {t.browseTitle} ({filteredProviders.length})
                        </h2>
                        {selectedCategory !== "ALL" && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full flex items-center gap-1 shrink-0">
                            ✨ {lang === "fr" ? "Trié par score de qualité (Avis × Récence × Volume)" : "Sorted by quality score (Reviews × Recency × Volume)"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Detailed Profile View vs Chat Interface vs Listings Grid */}
                    {selectedProviderForProfile ? (
                      <div className="animate-fade-in">
                        <ProviderProfile
                          provider={selectedProviderForProfile}
                          lang={lang}
                          currentUser={currentUser}
                          isLoggedIn={!!currentUser}
                          onBack={() => setSelectedProviderForProfile(null)}
                          onBook={() => {
                            if (!currentUser) {
                              triggerAuthFunnel("book", selectedProviderForProfile);
                            } else {
                              setActiveBookingProvider(selectedProviderForProfile);
                            }
                          }}
                          onChat={() => {
                            if (!currentUser) {
                              triggerAuthFunnel("chat", selectedProviderForProfile);
                            } else {
                              setActiveChatProvider(selectedProviderForProfile);
                              setSelectedProviderForProfile(null);
                            }
                          }}
                        />
                      </div>
                    ) : activeChatProvider ? (
                      <div className="animate-fade-in">
                        <ChatInterface
                          provider={activeChatProvider}
                          lang={lang}
                          onBack={() => setActiveChatProvider(null)}
                        />
                      </div>
                    ) : (
                      /* Listings Grid with Pagination */
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {filteredProviders.length === 0 ? (
                            <div className="col-span-full bg-white border border-dashed border-amber-200 rounded-3xl p-16 text-center text-xs text-amber-900">
                              {t.noProviders}
                            </div>
                          ) : (
                            filteredProviders
                              .slice((currentPage - 1) * providersPerPage, currentPage * providersPerPage)
                              .map((p) => (
                                <ServiceCard
                                  key={p.id}
                                  provider={p}
                                  lang={lang}
                                  isLoggedIn={!!currentUser}
                                  onGetService={() => triggerAuthFunnel("book", p)}
                                  onBook={() => currentUser ? setActiveBookingProvider(p) : triggerAuthFunnel("book", p)}
                                  onChat={() => currentUser ? setActiveChatProvider(p) : triggerAuthFunnel("chat", p)}
                                  onViewProfile={() => setSelectedProviderForProfile(p)}
                                />
                              ))
                          )}
                        </div>

                        {/* Pagination Controls */}
                        {Math.ceil(filteredProviders.length / providersPerPage) > 1 && (
                          <div className="flex items-center justify-center gap-2 pt-4">
                            <button
                              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                              disabled={currentPage === 1}
                              className="px-3.5 py-2 rounded-xl text-xs font-bold border border-amber-200 bg-white text-amber-950 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-amber-50 cursor-pointer transition-colors"
                            >
                              &larr; {lang === "fr" ? "Précédent" : "Previous"}
                            </button>
                            
                            {Array.from({ length: Math.ceil(filteredProviders.length / providersPerPage) }, (_, i) => i + 1).map((page) => (
                              <button
                                key={page}
                                onClick={() => setCurrentPage(page)}
                                className={`w-9 h-9 rounded-xl text-xs font-black transition-colors cursor-pointer ${
                                  currentPage === page
                                    ? "bg-amber-800 text-white"
                                    : "bg-white border border-amber-200 text-amber-950 hover:bg-amber-50"
                                }`}
                              >
                                {page}
                              </button>
                            ))}

                            <button
                              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, Math.ceil(filteredProviders.length / providersPerPage)))}
                              disabled={currentPage === Math.ceil(filteredProviders.length / providersPerPage)}
                              className="px-3.5 py-2 rounded-xl text-xs font-bold border border-amber-200 bg-white text-amber-950 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-amber-50 cursor-pointer transition-colors"
                            >
                              {lang === "fr" ? "Suivant" : "Next"} &rarr;
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right Column: AI Guide */}
                  <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white border border-amber-100 rounded-3xl p-1.5 shadow-sm overflow-hidden">
                      <AIGuide
                        lang={lang}
                        onApplyPolishedDescription={(text) => {
                          console.log("Applied polished text:", text);
                        }}
                      />
                    </div>

                    {/* Bertoua Info box */}
                    <div className="bg-white border border-amber-100 rounded-2xl p-5 shadow-sm space-y-3.5">
                      <h4 className="font-bold text-amber-950 text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-amber-700" />
                        La Région de l'Est du Cameroun
                      </h4>
                      <p className="text-[11px] text-amber-900/80 leading-relaxed font-serif">
                        Bertoua est le chef-lieu de la région de l'Est, une zone d'une grande diversité culturelle et d'une richesse agricole remarquable (manioc, cacao, maïs). 
                        <strong> One Village</strong> rapproche les prestataires de Mokolo, Tigaza, Kano et Ndouan pour dynamiser l'économie locale solidaire et équitable.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 2: AD BOARD */}
            {activeView === "ads" && (
              <div className="animate-fade-in">
                <AdBoard lang={lang} />
              </div>
            )}

            {/* VIEW 3: USER/PROVIDER DASHBOARD */}
            {activeView === "dashboard" && (
              <div className="animate-fade-in max-w-4xl mx-auto">
                {currentUser ? (
                  <Dashboard
                    lang={lang}
                    activeChatProvider={activeChatProvider}
                    setActiveChatProvider={setActiveChatProvider}
                    allProviders={providers}
                    onPayBooking={(bookingId, prov) => {
                      setActiveBookingProvider(prov);
                    }}
                    currentUser={currentUser}
                    setCurrentUser={setCurrentUser}
                  />
                ) : (
                  <div className="text-center py-16 bg-white border border-amber-100 rounded-3xl p-8">
                    <p className="text-sm font-bold text-amber-950">Veuillez vous connecter pour accéder à votre tableau de bord.</p>
                  </div>
                )}
              </div>
            )}

            {/* VIEW 4: ADMIN CONSOLE */}
            {activeView === "admin" && (
              <div className="animate-fade-in max-w-5xl mx-auto">
                <AdminDashboard
                  lang={lang}
                  currentUser={currentUser}
                  providers={providers}
                  onRefreshProviders={fetchProviders}
                  onOpenWizard={() => setAdminCreatingProvider(true)}
                />
              </div>
            )}
          </>
        )}
      </main>

      {/* FOOTER */}
      <footer className="bg-white border-t border-amber-100/75 mt-16 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center space-y-2 text-xs text-amber-900/60 font-medium">
          <p>© 2026 ONE VILLAGE — Bertoua. Tous droits réservés.</p>
          <p className="font-serif italic">"Un village fort, une communauté prospère • On est ensemble."</p>
        </div>
      </footer>

      {/* ADMIN ASSISTED SETUP OVERLAY */}
      {adminCreatingProvider && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 border border-amber-100 shadow-xl space-y-4 my-8">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-black text-amber-950 text-sm uppercase">
                  {lang === "fr" ? "Enregistrement Prestataire Assisté" : "Admin-Assisted Provider Wizard"}
                </h3>
                <span className="text-[10px] text-red-800 bg-red-50 border border-red-100 px-2 py-0.5 rounded font-bold uppercase mt-1 inline-block">
                  Mode Administrateur (created_by_admin = true)
                </span>
              </div>
              <button
                onClick={() => setAdminCreatingProvider(false)}
                className="text-amber-800 hover:text-amber-950 bg-amber-50 p-2 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <ProviderWizard
              lang={lang}
              userId={`admin_setup_${Date.now()}`}
              fullName=""
              userPhone=""
              isAdminCreating={true}
              onSuccess={(pData) => {
                setAdminCreatingProvider(false);
                fetchProviders();
              }}
              onCancel={() => setAdminCreatingProvider(false)}
            />
          </div>
        </div>
      )}

      {/* Combined Sign In / Sign Up Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 border border-amber-100 shadow-xl space-y-5 relative">
            <button
              onClick={() => { setShowAuthModal(false); setPendingAction(null); }}
              className="absolute top-4 right-4 text-amber-800/80 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 p-2 rounded-xl transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Custom Tab selectors */}
            <div className="flex border-b border-amber-100 pb-1">
              <button
                onClick={() => { setAuthTab("signin"); setOtpSent(false); setSimulatedCode(null); setErrorMsg(""); }}
                className={`flex-1 py-2.5 text-center text-xs font-black uppercase tracking-wider cursor-pointer border-b-2 transition-all ${
                  authTab === "signin"
                    ? "border-amber-800 text-amber-950"
                    : "border-transparent text-amber-800/60 hover:text-amber-950"
                }`}
              >
                {lang === "fr" ? "Connexion" : "Sign In"}
              </button>
              <button
                onClick={() => { setAuthTab("signup"); setOtpSent(false); setSimulatedCode(null); setErrorMsg(""); }}
                className={`flex-1 py-2.5 text-center text-xs font-black uppercase tracking-wider cursor-pointer border-b-2 transition-all ${
                  authTab === "signup"
                    ? "border-amber-800 text-amber-950"
                    : "border-transparent text-amber-800/60 hover:text-amber-950"
                }`}
              >
                {lang === "fr" ? "S'inscrire (Nouveau)" : "Sign Up"}
              </button>
            </div>

            {/* Verification Method toggle (Phone vs Email) */}
            <div className="flex bg-amber-50 p-1 rounded-xl border border-amber-100">
              <button
                type="button"
                onClick={() => { setAuthMethod("phone"); setOtpSent(false); setSimulatedCode(null); }}
                className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider text-center cursor-pointer flex items-center justify-center gap-1.5 transition-all ${
                  authMethod === "phone" ? "bg-amber-800 text-white shadow-sm" : "text-amber-900"
                }`}
              >
                <Phone className="w-3.5 h-3.5" />
                {lang === "fr" ? "Numéro MTN/Orange" : "Mobile Phone"}
              </button>
              <button
                type="button"
                onClick={() => { setAuthMethod("email"); setOtpSent(false); setSimulatedCode(null); }}
                className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider text-center cursor-pointer flex items-center justify-center gap-1.5 transition-all ${
                  authMethod === "email" ? "bg-amber-800 text-white shadow-sm" : "text-amber-900"
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                {lang === "fr" ? "Adresse E-mail" : "Email Address"}
              </button>
            </div>

            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3 text-xs font-bold flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* FLOW STEP 1: SENDER OTP REQUEST */}
            {!otpSent ? (
              <form onSubmit={handleRequestOTP} className="space-y-4">
                {authTab === "signup" && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-amber-900 uppercase tracking-wider block">
                      {lang === "fr" ? "Nom Complet" : "Full Name"}
                    </label>
                    <input
                      type="text"
                      required
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      placeholder="e.g. Fidèle Ndembou"
                      className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-800"
                    />
                  </div>
                )}

                {authMethod === "phone" ? (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-amber-900 uppercase tracking-wider block">
                      {lang === "fr" ? "Numéro WhatsApp / Téléphone Mobile (+237)" : "Cameroon Mobile Phone (+237)"}
                    </label>
                    <div className="relative">
                      <input
                        type="tel"
                        required
                        value={authPhone}
                        onChange={(e) => setAuthPhone(e.target.value)}
                        placeholder="e.g. +237 677 88 99 00"
                        className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-800 font-mono"
                      />
                    </div>
                    <span className="text-[10px] text-amber-800/80 leading-relaxed font-serif block">
                      {lang === "fr"
                        ? "⚠️ Un code OTP de 6 chiffres sera simulé pour authentification."
                        : "⚠️ A 6-digit verification code will be simulated for fast secure login."}
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-amber-900 uppercase tracking-wider block">
                      {lang === "fr" ? "Adresse E-mail de Secours" : "Recovery Email Address"}
                    </label>
                    <input
                      type="email"
                      required
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="e.g. mon_email@yahoo.fr"
                      className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-800 font-mono"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-3 bg-amber-800 hover:bg-amber-900 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {lang === "fr" ? "Obtenir mon code d'accès" : "Request Verification Code"}
                </button>
              </form>
            ) : (
              /* FLOW STEP 2: VERIFY OTP */
              <form onSubmit={handleVerifyOTP} className="space-y-4 animate-fade-in">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-amber-900 uppercase tracking-wider block">
                    {lang === "fr" ? "Code de validation à 6 chiffres" : "6-Digit Validation Code"}
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="e.g. 123456"
                    className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3.5 text-center text-sm font-black text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-800/30 font-mono tracking-widest"
                  />
                </div>

                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => { setOtpSent(false); setOtpCode(""); setSimulatedCode(null); }}
                    className="px-4 py-3 border border-amber-200 text-amber-900 hover:bg-amber-50 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    {lang === "fr" ? "Retour" : "Back"}
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-amber-800 hover:bg-amber-900 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer text-center"
                  >
                    {lang === "fr" ? "Vérifier & Se Connecter" : "Verify & Sign In"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Booking Modal Overlay */}
      {activeBookingProvider && (
        <BookingModal
          provider={activeBookingProvider}
          lang={lang}
          onClose={() => setActiveBookingProvider(null)}
          onBookingSuccess={() => {
            fetchProviders();
            setActiveView("dashboard");
          }}
        />
      )}
    </div>
  );
}
