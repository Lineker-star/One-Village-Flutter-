/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { ServiceProvider, ServiceCategory, UserProfile } from "./types.ts";
import { BERTOUA_NEIGHBORHOODS, CATEGORY_DETAILS, SUB_CATEGORIES } from "./data/bertouaData.ts";
import ServiceCard from "./components/ServiceCard.tsx";
import InstallAppButton from "./components/InstallAppButton.tsx";
import PwaUpdateBanner from "./components/PwaUpdateBanner.tsx";
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
import ProfileSettings from "./components/ProfileSettings.tsx";
import LandingPage from "./components/LandingPage.tsx";
import PublicProfessionalProfile from "./components/PublicProfessionalProfile.tsx";
import PublicCompanyPage from "./components/PublicCompanyPage.tsx";
import JobsBrowsePage from "./components/JobsBrowsePage.tsx";
import JobDetailPage from "./components/JobDetailPage.tsx";
import ProfessionalDirectoryPage from "./components/ProfessionalDirectoryPage.tsx";
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
  Send,
  AlertTriangle,
  Compass,
  Eye,
  EyeOff,
  Loader2,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Briefcase,
  ClipboardList,
  Settings,
  LogOut,
  UserPlus,
} from "lucide-react";

export default function App() {
  const [lang, setLang] = useState<"fr" | "en">("fr");
  const [activeView, setActiveView] = useState<"browse" | "ads" | "jobs" | "professionals" | "dashboard" | "admin">("browse");

  // Public professional-profile route: a plain "/pro/<userId>" path check, not a full router (this
  // app has none) — computed once from the URL at first render. See the early return further down
  // that renders PublicProfessionalProfile standalone when this is set.
  const [proProfileUserId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const match = window.location.pathname.match(/^\/pro\/([^/]+)\/?$/);
    return match ? decodeURIComponent(match[1]) : null;
  });

  // Public company-page route: "/company/<id>", same plain path-check approach as above. Unlike
  // the professional-profile route, this one needs to know currentUser (to show owner-only
  // edit/delete controls), so its early return sits after the session check instead of before it.
  const [companyPageId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const match = window.location.pathname.match(/^\/company\/([^/]+)\/?$/);
    return match ? decodeURIComponent(match[1]) : null;
  });

  // Public job-posting route: "/job/<id>" — same approach as companyPageId (needs currentUser to
  // know if the viewer is the poster or has already applied).
  const [jobPageId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const match = window.location.pathname.match(/^\/job\/([^/]+)\/?$/);
    return match ? decodeURIComponent(match[1]) : null;
  });

  // Auth state
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authTab, setAuthTab] = useState<"signin" | "signup">("signin");

  // Sign In / Sign Up form states
  const [authRole, setAuthRole] = useState<"client" | "provider">("client");
  const [authName, setAuthName] = useState("");
  const [authPhone, setAuthPhone] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Email OTP verification gate (Step: signup email verification). pendingOtpEmail being non-null
  // is what switches the auth modal from the signin/signup tabs to the "enter your code" screen —
  // set right after a fresh signup that needs confirming, or when a sign-in attempt bounces off an
  // unconfirmed account.
  const [pendingOtpEmail, setPendingOtpEmail] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);

  useEffect(() => {
    if (otpResendCooldown <= 0) return;
    const timer = setTimeout(() => setOtpResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [otpResendCooldown]);

  // Intended action storage for authentication funnel
  const [pendingAction, setPendingAction] = useState<{ type: "book" | "chat" | "add_service" | "professional_profile"; provider?: ServiceProvider } | null>(null);

  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState("");
  // A plain string (category slug) rather than the ServiceCategory enum: a provider can belong to
  // an admin-approved DB-only category (e.g. an approved "Autre" suggestion) that has no
  // corresponding enum member — see allCategories below, the live source of truth.
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string>("ALL");
  // Specific trade (see SUB_CATEGORIES) selected via the "show more trades" pill row. Narrows
  // results by keyword-matching the trade's label against name/description/business
  // name/subcategory/custom_description (see matchesSubcategory below).
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  // Every category that actually exists in service_categories — the 8 "built-in" ones plus any
  // later admin-approved suggestions — fetched live so a newly-approved category (like "Informatique
  // (TIC)") shows up in the filter pills/dropdown without a rebuild. See Item 2 of the
  // service/category sync fixes.
  const [allCategories, setAllCategories] = useState<Array<{ id: number; slug: string; nameFr: string; nameEn: string }>>([]);

  useEffect(() => {
    supabaseService.getAllServiceCategories().then(setAllCategories);
  }, []);

  // Part 1, Item 1: unified search — professional profiles and open job postings, fetched once
  // (same "fetch full list, filter client-side" pattern used by the directory/browse pages) and
  // filtered by searchQuery below alongside filteredProviders, so they can render as their own
  // clearly-labeled result groups rather than merging into the provider list.
  const [allProfessionalProfilesForSearch, setAllProfessionalProfilesForSearch] = useState<Awaited<ReturnType<typeof supabaseService.getAllPublicProfessionalProfiles>>>([]);
  const [allOpenJobsForSearch, setAllOpenJobsForSearch] = useState<Awaited<ReturnType<typeof supabaseService.getOpenJobPostings>>>([]);

  useEffect(() => {
    supabaseService.getAllPublicProfessionalProfiles().then(setAllProfessionalProfilesForSearch);
    supabaseService.getOpenJobPostings().then(setAllOpenJobsForSearch);
  }, []);

  const [showAllTrades, setShowAllTrades] = useState(false);
  const [sortOption, setSortOption] = useState<"relevance" | "rating" | "newest" | "price_asc" | "price_desc">("relevance");
  // Browse mode: "filtered" is the existing single flat grid (respects the category pill/dropdown);
  // "byCategory" (Item 4) instead groups every approved provider under its category heading, still
  // respecting search/neighborhood but ignoring the single-category pill so all categories show at
  // once.
  const [browseMode, setBrowseMode] = useState<"filtered" | "byCategory">("filtered");

  // AI Search box ("What do you need?")
  const [aiSearchQuery, setAiSearchQuery] = useState("");
  const [aiSearchResult, setAiSearchResult] = useState<{ category: string; explanation: string } | null>(null);
  const [aiSearchError, setAiSearchError] = useState("");
  const [aiSearching, setAiSearching] = useState(false);

  // Providers & DB state
  // `providers`: legacy mock/in-memory feed (server.ts + Supabase-simulation localStorage) — still
  // powers the Discovery Dashboard trending/most-rated sections and promoted ads, since those are
  // derived from booking/chat activity that hasn't moved to Supabase yet (a later step).
  const [providers, setProviders] = useState<ServiceProvider[]>([]);
  // `realProviders`: real Supabase-backed public discovery feed (public_provider_cards view) —
  // powers the main searchable/filterable directory grid.
  const [realProviders, setRealProviders] = useState<ServiceProvider[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals / Interventions
  const [activeBookingProvider, setActiveBookingProvider] = useState<ServiceProvider | null>(null);
  const [activeChatProvider, setActiveChatProvider] = useState<ServiceProvider | null>(null);
  const [showAddServiceModal, setShowAddServiceModal] = useState(false);
  const [adminCreatingProvider, setAdminCreatingProvider] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  // Item 2: lets "Créer un Profil Professionnel" CTAs (Explorer menu, directory page) open
  // ProfileSettings directly on its "professional" tab instead of always landing on "personal".
  const [profileSettingsInitialTab, setProfileSettingsInitialTab] = useState<"personal" | "professional" | "companies" | "jobs">("personal");
  const [selectedProviderForProfile, setSelectedProviderForProfile] = useState<ServiceProvider | null>(null);
  const [selectedFilterSection, setSelectedFilterSection] = useState<"none" | "most-rated" | "trending-today" | "trending-week" | "trending-month">("none");

  // Mobile responsiveness
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Header redesign (Item 5): desktop dropdowns — "Explorer" groups the four browse/discovery
  // destinations, and the user/settings menu groups language + compact-view + account actions, so
  // the top level only ever shows 1-2 primary actions plus these two dropdown triggers.
  const [exploreMenuOpen, setExploreMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const exploreMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close either dropdown on an outside click — a mousedown listener (not a full-screen backdrop)
  // so a single click on another header button both closes the menu AND still activates that button.
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (exploreMenuRef.current && !exploreMenuRef.current.contains(e.target as Node)) setExploreMenuOpen(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Compact view: lets logged-in users (any role) collapse the marketing/discovery sections
  // (nav browse/ads tabs, promoted ads carousel, Discovery Dashboard trending blocks) so their own
  // account content is front and center. Persisted across sessions; irrelevant while logged out.
  const [compactView, setCompactView] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("ov_compact_view") !== "false";
  });

  useEffect(() => {
    window.localStorage.setItem("ov_compact_view", String(compactView));
  }, [compactView]);

  // Public landing page: session-based, not "shown once ever". Shown whenever there is no
  // authenticated session (fresh visit, logged-out browsing, or after logout/session expiry) —
  // see the getSession()/onAuthStateChange effect below, which flips this to false the moment a
  // real session is confirmed and back to true the moment the user logs out. Defaults to true so
  // a guest sees it first; `sessionChecked` gates the initial render so an already-logged-in
  // returning visitor doesn't flash the landing page while the session check is in flight.
  const [showLandingPage, setShowLandingPage] = useState(true);
  const [sessionChecked, setSessionChecked] = useState(false);

  const handleLandingGetStarted = () => {
    setShowLandingPage(false);
    if (!currentUser) {
      setAuthTab("signup");
      setErrorMsg("");
      setSuccessMsg("");
      setShowAuthModal(true);
    }
  };

  // Pagination (Phase 14 requirement)
  const [currentPage, setCurrentPage] = useState(1);
  const providersPerPage = 6;

  // Reset pagination on filter/search change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, selectedNeighborhood, selectedSubcategory, searchQuery, selectedFilterSection, sortOption]);

  // Load the real Supabase session on mount, then keep currentUser in sync with it
  // (covers page refresh, login/logout in another tab, and token expiry) instead of localStorage.
  // Also drives showLandingPage: a confirmed session hides it, and it's what onAuthStateChange
  // uses below to bring it back the moment the user logs out.
  useEffect(() => {
    let active = true;

    supabaseService.getSession().then((user) => {
      if (!active) return;
      setSessionChecked(true);
      if (!user) return;
      setCurrentUser(user);
      setShowLandingPage(false);
      if (user.role === "admin") {
        setActiveView("admin");
      }
    });

    const unsubscribe = supabaseService.onAuthStateChange((user) => {
      if (!active) return;
      setCurrentUser(user);
      if (user?.role === "admin") {
        setActiveView("admin");
      } else if (!user) {
        setActiveView("browse");
      }
      // Session-based landing page visibility (see the state declaration above): logging in
      // dismisses it for the rest of the session, logging out brings it back immediately.
      setShowLandingPage(!user);
    });

    return () => {
      active = false;
      unsubscribe();
    };
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
      navJobs: "Offres d'Emploi",
      navProfessionals: "Profils Professionnels",
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
      navJobs: "Job Opportunities",
      navProfessionals: "Professional Profiles",
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

      // Item 2 fix: this used to also call supabaseService.loadAllProviders(), which queried a
      // table literally named "providers" that was never actually created (the real table is
      // service_providers, with a normalized schema that doesn't match this flat ServiceProvider
      // shape at all) — every single call 404'd, and since it threw, it silently aborted this
      // whole try block BEFORE setProviders(merged) below ever ran, forcing every load to fall
      // back to a stale localStorage cache (or nothing, on a first visit) instead of the freshly
      // fetched staticList. Removed entirely; staticList from /api/providers is the real data.
      const merged = staticList;

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

  // Fetch the real Supabase-backed public discovery feed for the main browse/search grid.
  const fetchRealProviders = async () => {
    try {
      const cards = await supabaseService.getPublicProviderCards();
      // The public view only ever returns approved rows, so a provider awaiting approval won't see
      // their own pending listing there — fetch and prepend it so they can preview their card.
      if (currentUser?.role === "provider" && !cards.some((p) => p.id === currentUser.id)) {
        const own = await supabaseService.getProviderFullRecord(currentUser.id);
        if (own) cards.unshift(own);
      }
      setRealProviders(cards);
    } catch (err) {
      console.error("Error fetching real providers:", err);
    }
  };

  useEffect(() => {
    fetchRealProviders();
  }, [currentUser]);

  // Connects a public professional profile's "view service provider profile" link
  // (/?providerId=<id>) back into the app: once realProviders has loaded, open that provider's
  // profile directly. Guarded with a ref so it only ever fires once per page load, not every time
  // realProviders refreshes for unrelated reasons (e.g. after a booking).
  const consumedProviderIdParam = useRef(false);
  useEffect(() => {
    if (consumedProviderIdParam.current || realProviders.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const providerId = params.get("providerId");
    if (!providerId) return;
    const match = realProviders.find((p) => p.id === providerId);
    if (match) {
      setSelectedProviderForProfile(match);
      setActiveView("browse");
      consumedProviderIdParam.current = true;
      // Drop the param from the URL so a later refresh/share of the link doesn't re-trigger this.
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [realProviders]);

  // Handle AI Search category match
  const handleAISearch = async () => {
    if (!aiSearchQuery.trim()) return;
    setAiSearching(true);
    setAiSearchResult(null);
    setAiSearchError("");
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
        if (data.category) {
          setAiSearchResult({
            category: data.category,
            explanation: data.explanation,
          });
          setSelectedCategory(data.category);
        } else {
          setAiSearchError(
            lang === "fr"
              ? "Aucune catégorie précise trouvée pour cette recherche — essayez de reformuler ou parcourez toutes les catégories ci-dessous."
              : "No specific category found for that search — try rephrasing, or browse all categories below."
          );
        }
      } else {
        setAiSearchError(
          lang === "fr"
            ? "L'assistant n'a pas pu répondre pour le moment. Réessayez dans un instant."
            : "The assistant couldn't respond right now. Please try again in a moment."
        );
      }
    } catch (err) {
      console.error("AI Search failed:", err);
      setAiSearchError(
        lang === "fr"
          ? "Impossible de contacter l'assistant. Vérifiez votre connexion et réessayez."
          : "Couldn't reach the assistant. Check your connection and try again."
      );
    } finally {
      setAiSearching(false);
    }
  };

  // Auth gate function
  const triggerAuthFunnel = (type: "book" | "chat" | "add_service" | "professional_profile", provider?: ServiceProvider) => {
    setPendingAction({ type, provider });
    setAuthTab("signin");
    setErrorMsg("");
    setSuccessMsg("");
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
    } else if (pendingAction.type === "professional_profile") {
      setProfileSettingsInitialTab("professional");
      setShowProfileSettings(true);
    }
    setPendingAction(null);
  };

  // Sign up with real Supabase email + password auth. Phone is collected here too, but only
  // ever stored as profile data — never used as a login credential (no SMS provider is set up).
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!authName.trim() || !authEmail.trim() || !authPassword) {
      setErrorMsg(lang === "fr" ? "Veuillez remplir tous les champs requis." : "Please fill in all required fields.");
      return;
    }

    setAuthSubmitting(true);
    try {
      const signupEmail = authEmail.trim();
      const res = await supabaseService.signUp({
        email: signupEmail,
        password: authPassword,
        fullName: authName.trim(),
        phone: authPhone.trim() || undefined,
        role: authRole,
        preferredLanguage: lang,
      });
      if (!res.success) throw new Error(res.message);

      if (res.needsVerification || !res.user) {
        // Email OTP verification required before a session exists yet — switch the modal to the
        // code-entry screen instead of treating this as "done".
        setAuthPassword("");
        setPendingOtpEmail(signupEmail);
        setOtpResendCooldown(45);
        setErrorMsg("");
        setSuccessMsg("");
        return;
      }

      setCurrentUser(res.user);
      setShowAuthModal(false);
      setAuthPassword("");

      if (res.user.role === "admin") {
        setActiveView("admin");
      } else if (!res.user.onboarding_completed) {
        // Shown onboarding flow automatically by layout
      } else {
        executePendingAction(res.user);
      }
    } catch (err: any) {
      setErrorMsg(err.message || (lang === "fr" ? "Erreur d'inscription." : "Sign-up error."));
    } finally {
      setAuthSubmitting(false);
    }
  };

  // Sign in with real Supabase email + password auth
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!authEmail.trim() || !authPassword) {
      setErrorMsg(lang === "fr" ? "Veuillez remplir tous les champs." : "Please fill in all fields.");
      return;
    }

    setAuthSubmitting(true);
    try {
      const res = await supabaseService.signIn(authEmail.trim(), authPassword);
      if (!res.success || !res.user) throw new Error(res.message);

      setCurrentUser(res.user);
      setShowAuthModal(false);
      setAuthPassword("");

      // Route based on role
      if (res.user.role === "admin") {
        setActiveView("admin");
      } else if (!res.user.onboarding_completed) {
        // Shown onboarding flow automatically by layout
      } else {
        executePendingAction(res.user);
      }
    } catch (err: any) {
      const msg = String(err.message || "");
      if (/not confirmed/i.test(msg)) {
        // Account exists but never completed OTP verification (e.g. they closed the tab after
        // signing up) — route them back into the code-entry screen instead of a dead-end error.
        setPendingOtpEmail(authEmail.trim());
        setAuthPassword("");
        setErrorMsg(
          lang === "fr"
            ? "Votre e-mail n'est pas encore vérifié. Entrez le code envoyé par e-mail."
            : "Your email isn't verified yet. Enter the code sent to your email."
        );
      } else {
        setErrorMsg(msg || (lang === "fr" ? "Email ou mot de passe incorrect." : "Incorrect email or password."));
      }
    } finally {
      setAuthSubmitting(false);
    }
  };

  // Verifies the 6-digit code emailed for signup confirmation (see supabaseService.verifySignupOtp
  // — Supabase's auth.verifyOtp with type "signup", not a passwordless flow; email+password from
  // handleSignUp remains the actual credential, this only confirms the address).
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingOtpEmail) return;
    setErrorMsg("");
    setSuccessMsg("");

    if (otpCode.trim().length !== 6) {
      setErrorMsg(lang === "fr" ? "Veuillez saisir le code à 6 chiffres." : "Please enter the 6-digit code.");
      return;
    }

    setOtpSubmitting(true);
    try {
      const res = await supabaseService.verifySignupOtp(pendingOtpEmail, otpCode.trim());
      if (!res.success || !res.user) throw new Error(res.message);

      setCurrentUser(res.user);
      setShowAuthModal(false);
      setPendingOtpEmail(null);
      setOtpCode("");

      if (res.user.role === "admin") {
        setActiveView("admin");
      } else if (!res.user.onboarding_completed) {
        // Shown onboarding flow automatically by layout
      } else {
        executePendingAction(res.user);
      }
    } catch (err: any) {
      const msg = String(err.message || "");
      if (/expired/i.test(msg)) {
        setErrorMsg(lang === "fr" ? "Ce code a expiré. Demandez-en un nouveau ci-dessous." : "This code has expired. Request a new one below.");
      } else if (/rate limit|too many/i.test(msg)) {
        setErrorMsg(lang === "fr" ? "Trop de tentatives. Réessayez dans quelques instants." : "Too many attempts. Please try again shortly.");
      } else {
        setErrorMsg(lang === "fr" ? "Code incorrect. Veuillez réessayer." : "Incorrect code. Please try again.");
      }
    } finally {
      setOtpSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    if (!pendingOtpEmail || otpResendCooldown > 0) return;
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await supabaseService.resendSignupOtp(pendingOtpEmail);
      if (!res.success) throw new Error(res.message);
      setSuccessMsg(lang === "fr" ? "Un nouveau code a été envoyé à votre e-mail." : "A new code has been sent to your email.");
      setOtpResendCooldown(45);
    } catch (err: any) {
      const msg = String(err.message || "");
      if (/rate limit|too many|seconds/i.test(msg)) {
        setErrorMsg(lang === "fr" ? "Veuillez patienter avant de redemander un code." : "Please wait before requesting another code.");
      } else {
        setErrorMsg(msg || (lang === "fr" ? "Erreur lors du renvoi du code." : "Error resending code."));
      }
    }
  };

  const handleCancelOtp = () => {
    setPendingOtpEmail(null);
    setOtpCode("");
    setOtpResendCooldown(0);
    setErrorMsg("");
    setSuccessMsg("");
    setAuthTab("signin");
  };

  // Logout
  const handleLogout = async () => {
    await supabaseService.signOut();
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

  // Item 2: routes straight to the Step 8b professional profile creation form (ProfileSettings'
  // "professional" tab, which renders ProfessionalProfileEditor) from the Explorer menu, the
  // Professional Directory page's CTA, or anywhere else that needs it.
  const openProfessionalProfileCreation = () => {
    if (!currentUser) {
      triggerAuthFunnel("professional_profile");
      return;
    }
    setProfileSettingsInitialTab("professional");
    setShowProfileSettings(true);
  };

  // Filter logic: Only show approved providers, OR if the current user is that provider themselves.
  // Sourced from the real Supabase-backed `realProviders` feed (public_provider_cards), not the
  // legacy mock `providers` array.
  const filteredProviders = realProviders.filter((p) => {
    const isApproved = p.verified || p.status === "approved";
    const isMine = currentUser && p.id === currentUser.id;
    const isAdmin = currentUser && currentUser.role === "admin";

    // Unverified providers are hidden from guests and other clients
    if (!isApproved && !isMine && !isAdmin) {
      return false;
    }

    const query = searchQuery.trim().toLowerCase();
    // Matches business name, description (FR/EN already merged into p.description), category name
    // (all assigned categories, both languages, live built-in OR DB-only), subcategory, and
    // custom_description ("Autre" free text) — see the 20260717000000 migration, which exposes
    // subcategories/custom_descriptions on public_provider_cards for exactly this.
    const assignedCategories = (p.categories && p.categories.length > 0 ? p.categories : [p.category]);
    const categoryNameHaystack = assignedCategories
      .map((c) => {
        const builtIn = CATEGORY_DETAILS[c as ServiceCategory] as { nameFR: string; nameEN: string } | undefined;
        const live = allCategories.find((ac) => ac.slug === c);
        return `${builtIn?.nameFR || live?.nameFr || ""} ${builtIn?.nameEN || live?.nameEn || ""}`;
      })
      .join(" ")
      .toLowerCase();
    const subcategoryHaystack = (p.subcategories || []).join(" ").toLowerCase();
    const customDescHaystack = (p.customDescriptions || []).join(" ").toLowerCase();
    const matchesSearch =
      query === "" ||
      p.name.toLowerCase().includes(query) ||
      p.description.toLowerCase().includes(query) ||
      (p.businessName && p.businessName.toLowerCase().includes(query)) ||
      categoryNameHaystack.includes(query) ||
      subcategoryHaystack.includes(query) ||
      customDescHaystack.includes(query);

    const matchesCategory =
      selectedCategory === "ALL" ||
      p.category === selectedCategory ||
      (p.categories || []).includes(selectedCategory);
    const matchesNeighborhood = selectedNeighborhood === "ALL" || p.neighborhoodId === selectedNeighborhood;

    // Trade-level refinement (see selectedSubcategory state comment above). Checks the real
    // provider_services.subcategory tokens first (exact match), falling back to a keyword guess
    // against name/description/business name for providers registered before that data was tracked.
    let matchesSubcategory = true;
    if (selectedSubcategory) {
      const sub = SUB_CATEGORIES.find((s) => s.id === selectedSubcategory);
      if (sub) {
        const subcategoryTokens = (p.subcategories || []).flatMap((s) => s.split(",").map((x) => x.trim()));
        if (subcategoryTokens.includes(sub.id)) {
          matchesSubcategory = true;
        } else {
          const keywords = sub.labelFR
            .replace(/[^\p{L}\s]/gu, "")
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length > 3);
          const haystack = `${p.name} ${p.businessName || ""} ${p.description}`.toLowerCase();
          matchesSubcategory = keywords.length === 0 || keywords.some((k) => haystack.includes(k));
        }
      }
    }

    return matchesSearch && matchesCategory && matchesNeighborhood && matchesSubcategory;
  });

  // Part 1, Item 1: unified search groups — professional profiles (by headline/bio/skills) and
  // open job postings (by title/description/category), shown as their own labeled sections
  // alongside filteredProviders rather than merged into one list. Empty when there's no active
  // search, so these sections simply don't render.
  const searchQueryTrimmed = searchQuery.trim().toLowerCase();
  const matchingProfessionalProfiles =
    searchQueryTrimmed === ""
      ? []
      : allProfessionalProfilesForSearch.filter((p) => {
          const haystack = `${p.headline} ${p.bio} ${(p.skills || []).join(" ")}`.toLowerCase();
          return haystack.includes(searchQueryTrimmed);
        });
  const matchingJobPostings =
    searchQueryTrimmed === ""
      ? []
      : allOpenJobsForSearch.filter((j) => {
          const haystack = `${j.title} ${j.description} ${j.categoryNameFr || ""} ${j.categoryNameEn || ""}`.toLowerCase();
          return haystack.includes(searchQueryTrimmed);
        });

  // Category-grouped browse view (Item 4): every approved provider grouped under its category
  // heading, using the live allCategories list so a newly-approved category gets its own section
  // automatically. Respects search + neighborhood filters but deliberately ignores the single
  // selectedCategory pill/selectedSubcategory, since the entire point of this view is to see every
  // category's providers at once rather than one at a time.
  const groupedByCategory = allCategories
    .map((cat) => {
      const items = realProviders.filter((p) => {
        const isApproved = p.verified || p.status === "approved";
        const isMine = currentUser && p.id === currentUser.id;
        const isAdmin = currentUser && currentUser.role === "admin";
        if (!isApproved && !isMine && !isAdmin) return false;

        const assignedCategories = (p.categories && p.categories.length > 0 ? p.categories : [p.category]);
        if (!assignedCategories.includes(cat.slug)) return false;

        const query = searchQuery.trim().toLowerCase();
        const matchesSearch =
          query === "" ||
          p.name.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query) ||
          (p.businessName && p.businessName.toLowerCase().includes(query)) ||
          (p.subcategories || []).join(" ").toLowerCase().includes(query) ||
          (p.customDescriptions || []).join(" ").toLowerCase().includes(query);
        const matchesNeighborhood = selectedNeighborhood === "ALL" || p.neighborhoodId === selectedNeighborhood;

        return matchesSearch && matchesNeighborhood;
      });
      return { cat, items };
    })
    .filter((g) => g.items.length > 0);

  // Sort logic. An explicit sort choice (Item 3: real "Top rated"/"Newest"/"Price" control) always
  // takes priority over the Discovery Dashboard's blended/trending scores below.
  if (sortOption === "rating") {
    filteredProviders.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  } else if (sortOption === "newest") {
    filteredProviders.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  } else if (sortOption === "price_asc") {
    filteredProviders.sort((a, b) => (a.rateFCFA || 0) - (b.rateFCFA || 0));
  } else if (sortOption === "price_desc") {
    filteredProviders.sort((a, b) => (b.rateFCFA || 0) - (a.rateFCFA || 0));
  } else if (selectedCategory !== "ALL") {
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
  const getCategoryIcon = (category: string) => {
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

  // Public professional-profile route — a plain path check since this app has no routing library,
  // computed once from the URL at first render (see proProfileUserId above). Renders standalone,
  // bypassing the session check and landing page entirely, since this page must be viewable by
  // anyone with the link, logged in or not.
  if (proProfileUserId) {
    return <PublicProfessionalProfile userId={proProfileUserId} lang={lang} />;
  }

  // Brief blank frame while the initial session check is in flight, so an already-logged-in
  // returning visitor never flashes the landing page before we know they have a valid session.
  if (!sessionChecked) {
    return <div className="min-h-screen bg-[#FBF7F0]" />;
  }

  // Public company page — rendered after the session check (unlike the professional-profile route)
  // so currentUser is resolved and owner-only edit/delete controls show correctly, but still bypasses
  // the landing-page gate so a logged-out visitor can view it directly.
  if (companyPageId) {
    return <PublicCompanyPage companyId={companyPageId} lang={lang} currentUserId={currentUser?.id || null} />;
  }

  // Public job-posting page — same reasoning as companyPageId above (needs currentUser resolved
  // for the apply flow / poster tools, but still bypasses the landing-page gate for guests).
  if (jobPageId) {
    return <JobDetailPage jobId={jobPageId} lang={lang} currentUserId={currentUser?.id || null} />;
  }

  if (showLandingPage) {
    return (
      <>
        <PwaUpdateBanner lang={lang} />
        <LandingPage lang={lang} setLang={setLang} onGetStarted={handleLandingGetStarted} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#FBF7F0] text-[#241611] font-sans antialiased selection:bg-[#E3A23D]/30 pb-16 overflow-x-hidden">
      <PwaUpdateBanner lang={lang} />

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

            {/* Desktop Nav Actions — Item 5 redesign: one "Explorer" dropdown groups the four
                browse/discovery destinations instead of listing them all as separate top-level
                links. */}
            <nav className="hidden md:flex items-center gap-2 text-sm font-semibold text-amber-900/80">
              <div className="relative" ref={exploreMenuRef}>
                <button
                  onClick={() => { setExploreMenuOpen((v) => !v); setUserMenuOpen(false); }}
                  className={`flex items-center gap-1.5 py-2 px-3 rounded-xl transition-colors cursor-pointer ${
                    ["browse", "ads", "jobs", "professionals"].includes(activeView)
                      ? "bg-amber-50 text-amber-950"
                      : "hover:bg-amber-50/60 hover:text-amber-950"
                  }`}
                >
                  <Compass className="w-4 h-4" />
                  {lang === "fr" ? "Explorer" : "Explore"}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${exploreMenuOpen ? "rotate-180" : ""}`} />
                </button>
                {exploreMenuOpen && (
                  <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-amber-100 rounded-2xl shadow-xl z-50 p-1.5 space-y-0.5 animate-fade-in">
                    <button
                      onClick={() => { setActiveView("browse"); setCompactView(false); setActiveChatProvider(null); setExploreMenuOpen(false); }}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                        activeView === "browse" ? "bg-amber-50 text-amber-950" : "text-amber-900 hover:bg-amber-50/70"
                      }`}
                    >
                      {t.navBrowse}
                    </button>
                    <button
                      onClick={() => { setActiveView("ads"); setActiveChatProvider(null); setExploreMenuOpen(false); }}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                        activeView === "ads" ? "bg-amber-50 text-amber-950" : "text-amber-900 hover:bg-amber-50/70"
                      }`}
                    >
                      {t.navAds}
                    </button>
                    <button
                      onClick={() => { setActiveView("jobs"); setActiveChatProvider(null); setExploreMenuOpen(false); }}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                        activeView === "jobs" ? "bg-amber-50 text-amber-950" : "text-amber-900 hover:bg-amber-50/70"
                      }`}
                    >
                      {t.navJobs}
                    </button>
                    <div className={`flex items-center gap-1 rounded-xl ${activeView === "professionals" ? "bg-amber-50" : ""}`}>
                      <button
                        onClick={() => { setActiveView("professionals"); setActiveChatProvider(null); setExploreMenuOpen(false); }}
                        className={`flex-1 text-left px-3 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                          activeView === "professionals" ? "text-amber-950" : "text-amber-900 hover:bg-amber-50/70"
                        }`}
                      >
                        {t.navProfessionals}
                      </button>
                      <button
                        onClick={() => { openProfessionalProfileCreation(); setExploreMenuOpen(false); }}
                        title={lang === "fr" ? "Créer mon Profil Professionnel" : "Create my Professional Profile"}
                        className="p-2 mr-1 rounded-lg text-amber-700 hover:bg-amber-100/70 hover:text-amber-900 transition-colors cursor-pointer shrink-0"
                      >
                        <UserPlus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </nav>

            {/* User/settings menu + primary CTA — language toggle, compact view, profile settings,
                and dashboard/admin links now live inside the user dropdown instead of sitting at
                the top level. */}
            <div className="hidden md:flex items-center gap-3">
              {currentUser ? (
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => { setUserMenuOpen((v) => !v); setExploreMenuOpen(false); }}
                    className="flex items-center gap-2 bg-amber-50 hover:bg-amber-100/60 border border-amber-100 px-3 py-2 rounded-xl text-xs font-bold text-amber-900 transition-colors cursor-pointer"
                  >
                    <User className="w-4 h-4 text-amber-700" />
                    <span>{currentUser.fullName || currentUser.phone}</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${userMenuOpen ? "rotate-180" : ""}`} />
                  </button>
                  {userMenuOpen && (
                    <div className="absolute top-full right-0 mt-2 w-72 bg-white border border-amber-100 rounded-2xl shadow-xl z-50 p-1.5 space-y-0.5 animate-fade-in">
                      {currentUser.onboarding_completed && (
                        <button
                          onClick={() => { setActiveView("dashboard"); setActiveChatProvider(null); setUserMenuOpen(false); }}
                          className={`w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                            activeView === "dashboard" ? "bg-amber-50 text-amber-950" : "text-amber-900 hover:bg-amber-50/70"
                          }`}
                        >
                          {t.navDashboard}
                        </button>
                      )}
                      {currentUser.role === "admin" && (
                        <button
                          onClick={() => { setActiveView("admin"); setActiveChatProvider(null); setUserMenuOpen(false); }}
                          className={`w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                            activeView === "admin" ? "bg-red-50 text-red-950" : "text-red-800 hover:bg-red-50/70"
                          }`}
                        >
                          <ShieldCheck className="w-4 h-4" />
                          {t.navAdmin}
                        </button>
                      )}
                      <button
                        onClick={() => { setShowProfileSettings(true); setUserMenuOpen(false); }}
                        className="w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold text-amber-900 hover:bg-amber-50/70 transition-colors cursor-pointer"
                      >
                        <Settings className="w-4 h-4 text-amber-700" />
                        {lang === "fr" ? "Paramètres du profil" : "Profile settings"}
                      </button>
                      <button
                        onClick={() => setCompactView((v) => !v)}
                        className="w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold text-amber-900 hover:bg-amber-50/70 transition-colors cursor-pointer"
                      >
                        {compactView ? <Eye className="w-4 h-4 text-amber-700" /> : <EyeOff className="w-4 h-4 text-amber-700" />}
                        {compactView ? (lang === "fr" ? "Vue compacte (activée)" : "Compact view (on)") : (lang === "fr" ? "Vue complète (activée)" : "Full view (on)")}
                      </button>
                      <button
                        onClick={() => setLang(lang === "fr" ? "en" : "fr")}
                        className="w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold text-amber-900 hover:bg-amber-50/70 transition-colors cursor-pointer"
                      >
                        <Globe className="w-4 h-4 text-amber-700" />
                        {lang === "fr" ? "English" : "Français"}
                      </button>
                      <div className="border-t border-amber-50 my-1" />
                      <button
                        onClick={() => { handleLogout(); setUserMenuOpen(false); }}
                        className="w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        {t.logout}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setLang(lang === "fr" ? "en" : "fr")}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-amber-900 bg-amber-50 rounded-xl border border-amber-200/50 hover:bg-amber-100/60 transition-colors cursor-pointer"
                  >
                    <Globe className="w-4 h-4 text-amber-700" />
                    <span>{lang === "fr" ? "English" : "Français"}</span>
                  </button>
                  <button
                    onClick={() => { setAuthTab("signin"); setErrorMsg(""); setSuccessMsg(""); setShowAuthModal(true); }}
                    className="text-xs font-bold text-amber-900 bg-amber-50 border border-amber-200/50 hover:bg-amber-100 px-4 py-2.5 rounded-xl transition-colors cursor-pointer"
                  >
                    {t.signIn}
                  </button>
                </>
              )}

              <InstallAppButton lang={lang} variant="compact" />

              <button
                onClick={handleAppBarGetService}
                id="btn-nav-become-provider"
                className="bg-[#E3A23D] hover:bg-[#F2B355] text-[#241611] font-black text-xs px-4 py-3 rounded-xl flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                {currentUser?.role === "provider" ? t.navDashboard : t.becomeProviderBtn}
              </button>
            </div>

            {/* Mobile Hamburger menu — language toggle now lives inside the menu itself (Item 5),
                so only the single hamburger trigger sits at the top level on mobile. */}
            <div className="flex items-center gap-3 md:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 text-amber-900 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu view — Item 5 redesign: same "Explorer" vs "Compte" grouping as desktop,
            with section labels instead of one flat list of every destination. */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-amber-100 bg-white px-4 pt-4 pb-6 space-y-4 shadow-lg absolute w-full left-0 animate-fade-in max-h-[calc(100vh-4.5rem)] overflow-y-auto">
            <div className="space-y-1.5">
              <p className="text-[10px] font-black text-amber-800/60 uppercase tracking-wider px-3">
                {lang === "fr" ? "Explorer" : "Explore"}
              </p>
              <nav className="flex flex-col gap-1 font-semibold text-amber-900/80">
                <button
                  onClick={() => { setActiveView("browse"); setCompactView(false); setActiveChatProvider(null); setMobileMenuOpen(false); }}
                  className={`py-2.5 px-3 text-left rounded-xl text-sm ${
                    activeView === "browse" ? "text-amber-950 font-bold bg-amber-50/70" : ""
                  }`}
                >
                  {t.navBrowse}
                </button>
                <button
                  onClick={() => { setActiveView("ads"); setActiveChatProvider(null); setMobileMenuOpen(false); }}
                  className={`py-2.5 px-3 text-left rounded-xl text-sm ${
                    activeView === "ads" ? "text-amber-950 font-bold bg-amber-50/70" : ""
                  }`}
                >
                  {t.navAds}
                </button>
                <button
                  onClick={() => { setActiveView("jobs"); setActiveChatProvider(null); setMobileMenuOpen(false); }}
                  className={`py-2.5 px-3 text-left rounded-xl text-sm ${
                    activeView === "jobs" ? "text-amber-950 font-bold bg-amber-50/70" : ""
                  }`}
                >
                  {t.navJobs}
                </button>
                <div className={`flex items-center gap-1 rounded-xl ${activeView === "professionals" ? "bg-amber-50/70" : ""}`}>
                  <button
                    onClick={() => { setActiveView("professionals"); setActiveChatProvider(null); setMobileMenuOpen(false); }}
                    className={`flex-1 py-2.5 px-3 text-left rounded-xl text-sm ${
                      activeView === "professionals" ? "text-amber-950 font-bold" : ""
                    }`}
                  >
                    {t.navProfessionals}
                  </button>
                  <button
                    onClick={() => { openProfessionalProfileCreation(); setMobileMenuOpen(false); }}
                    title={lang === "fr" ? "Créer mon Profil Professionnel" : "Create my Professional Profile"}
                    className="p-2 mr-1 rounded-lg text-amber-700 hover:bg-amber-100/70 transition-colors cursor-pointer shrink-0"
                  >
                    <UserPlus className="w-4 h-4" />
                  </button>
                </div>
              </nav>
            </div>

            {currentUser ? (
              <div className="space-y-1.5 pt-3 border-t border-amber-100">
                <p className="text-[10px] font-black text-amber-800/60 uppercase tracking-wider px-3">
                  {currentUser.fullName || currentUser.phone}
                </p>
                <div className="flex flex-col gap-1">
                  {currentUser.onboarding_completed && (
                    <button
                      onClick={() => { setActiveView("dashboard"); setActiveChatProvider(null); setMobileMenuOpen(false); }}
                      className={`py-2.5 px-3 text-left rounded-xl text-sm font-semibold ${
                        activeView === "dashboard" ? "text-amber-950 font-bold bg-amber-50/70" : "text-amber-900/80"
                      }`}
                    >
                      {t.navDashboard}
                    </button>
                  )}
                  {currentUser.role === "admin" && (
                    <button
                      onClick={() => { setActiveView("admin"); setActiveChatProvider(null); setMobileMenuOpen(false); }}
                      className={`py-2.5 px-3 text-left rounded-xl text-sm font-semibold text-red-800 ${
                        activeView === "admin" ? "font-bold bg-red-50/70" : ""
                      }`}
                    >
                      {t.navAdmin}
                    </button>
                  )}
                  <button
                    onClick={() => { setShowProfileSettings(true); setMobileMenuOpen(false); }}
                    className="flex items-center gap-2 py-2.5 px-3 text-left rounded-xl text-sm font-semibold text-amber-900/80 cursor-pointer"
                  >
                    <Settings className="w-4 h-4 text-amber-700 shrink-0" />
                    {lang === "fr" ? "Paramètres du profil" : "Profile settings"}
                  </button>
                  <button
                    onClick={() => setCompactView((v) => !v)}
                    className="flex items-center gap-2 py-2.5 px-3 text-left rounded-xl text-sm font-semibold text-amber-900/80 cursor-pointer"
                  >
                    {compactView ? <Eye className="w-4 h-4 text-amber-700 shrink-0" /> : <EyeOff className="w-4 h-4 text-amber-700 shrink-0" />}
                    <span>{compactView ? (lang === "fr" ? "Vue compacte (activée)" : "Compact view (on)") : (lang === "fr" ? "Vue complète (activée)" : "Full view (on)")}</span>
                  </button>
                  <button
                    onClick={() => setLang(lang === "fr" ? "en" : "fr")}
                    className="flex items-center gap-2 py-2.5 px-3 text-left rounded-xl text-sm font-semibold text-amber-900/80 cursor-pointer"
                  >
                    <Globe className="w-4 h-4 text-amber-700 shrink-0" />
                    {lang === "fr" ? "English" : "Français"}
                  </button>
                  <button
                    onClick={() => { handleLogout(); setMobileMenuOpen(false); }}
                    className="flex items-center gap-2 py-2.5 px-3 text-left rounded-xl text-sm font-semibold text-red-700 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 shrink-0" />
                    {t.logout}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 pt-3 border-t border-amber-100">
                <button
                  onClick={() => setLang(lang === "fr" ? "en" : "fr")}
                  className="w-full flex items-center justify-center gap-2 text-xs font-bold text-amber-900 bg-amber-50 border border-amber-200/50 py-2.5 rounded-xl cursor-pointer"
                >
                  <Globe className="w-4 h-4 text-amber-700" />
                  {lang === "fr" ? "English" : "Français"}
                </button>
                <button
                  onClick={() => { setAuthTab("signin"); setErrorMsg(""); setSuccessMsg(""); setShowAuthModal(true); setMobileMenuOpen(false); }}
                  className="w-full text-xs font-bold text-amber-900 bg-amber-50 border border-amber-200/50 py-2.5 rounded-xl cursor-pointer text-center"
                >
                  {t.signIn}
                </button>
              </div>
            )}

            <div className="pt-3 border-t border-amber-100 flex justify-center">
              <InstallAppButton lang={lang} variant="compact" />
            </div>

            <button
              onClick={() => {
                handleAppBarGetService();
                setMobileMenuOpen(false);
              }}
              className="w-full bg-[#E3A23D] hover:bg-[#F2B355] text-[#241611] font-bold text-xs py-3 rounded-xl flex items-center justify-center gap-2 shadow-sm cursor-pointer"
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
                fetchRealProviders();
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
                  compactView ? (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-amber-50/60 border border-amber-100 rounded-2xl px-4 sm:px-6 py-3 sm:py-4">
                      <p className="text-xs text-amber-800/80 font-serif">
                        {lang === "fr"
                          ? "Vue compacte activée — le contenu promotionnel et les tendances sont masqués."
                          : "Compact view is on — promotional content and trending picks are hidden."}
                      </p>
                      <button
                        onClick={() => setCompactView(false)}
                        className="shrink-0 text-xs font-bold text-[#241611] bg-[#E3A23D] hover:bg-[#F2B355] px-3 py-2 rounded-xl transition-colors cursor-pointer"
                      >
                        {lang === "fr" ? "Tout explorer" : "Explore everything"}
                      </button>
                    </div>
                  ) : (
                  selectedCategory === "ALL" && selectedNeighborhood === "ALL" && searchQuery === "" && selectedFilterSection === "none" && !selectedProviderForProfile && !activeChatProvider && (
                    <div className="space-y-8 bg-[#FBF7F0] border border-amber-200/40 rounded-3xl p-6 sm:p-8 shadow-sm">
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
                  )
                ) : (
                  /* Guest Hero Trending Card */
                  <motion.div
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.2 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="relative bg-gradient-to-r from-[#FBF7F0] to-[#F5E6D3] border border-amber-100 rounded-3xl p-6 sm:p-8 shadow-sm overflow-hidden"
                  >
                    <div className="absolute -top-16 -right-16 w-56 h-56 bg-[#E3A23D]/15 rounded-full blur-3xl pointer-events-none" />
                    <div className="relative flex items-center gap-2 mb-1">
                      <span className="text-xl">🔥</span>
                      <h3 className="text-base sm:text-lg font-black text-amber-950 uppercase tracking-tight">
                        {t.trendingTitle}
                      </h3>
                    </div>
                    <p className="relative text-xs text-amber-800/80 mb-6 max-w-2xl font-serif">
                      {t.trendingSubtitle}
                    </p>

                    <div className="relative grid grid-cols-1 md:grid-cols-3 gap-4">
                      {trendingProviders.map((p) => {
                        const catObj = CATEGORY_DETAILS[p.category];
                        const IconComp = getCategoryIcon(p.category);
                        return (
                          <motion.div
                            key={`trending-${p.id}`}
                            whileHover={{ y: -4, scale: 1.015 }}
                            transition={{ duration: 0.18 }}
                            className="bg-white border border-amber-200/50 rounded-2xl p-4 flex flex-col justify-between hover:shadow-lg hover:shadow-amber-900/5 transition-shadow group"
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
                                className="text-[10px] bg-[#E3A23D] hover:bg-[#F2B355] text-[#241611] font-bold px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                              >
                                {lang === "fr" ? "Contacter" : "Contact"}
                              </button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                  {/* Left/Middle Column: Services Browser */}
                  <div className="lg:col-span-8 space-y-6">

                    {/* Promoted Ads Carousel (Phase 13 requirement) — hidden in compact view */}
                    {!compactView && (
                      <PromotedAdsCarousel
                        lang={lang}
                        selectedCategory={selectedCategory}
                        providers={providers}
                        realProviders={realProviders}
                        onViewProviderProfile={(prov) => setSelectedProviderForProfile(prov)}
                      />
                    )}

                    {/* Express AI Guide Search Box — the browse page's own "hero" banner (Item 7):
                        dark navy overlay instead of the terracotta/ink tone used for other dark
                        sections, matching the landing page's overlay treatment for text readability. */}
                    <motion.div
                      initial={{ opacity: 0, y: 24 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.3 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="bg-gradient-to-br from-[#0F1B2E] via-[#16243D] to-[#1A2942] text-amber-50 rounded-3xl p-6 shadow-md space-y-4 relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-40 h-40 bg-[#E3A23D]/15 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
                      <div className="absolute bottom-0 left-0 w-32 h-32 bg-[#3E8467]/15 rounded-full blur-3xl -ml-10 -mb-10 pointer-events-none" />
                      <h4 className="font-black text-xs uppercase tracking-wider text-[#F2B355] flex items-center gap-2 relative z-10">
                        {t.aiSearchTitle}
                      </h4>
                      <div className="flex flex-col sm:flex-row gap-2 relative z-10">
                        <input
                          type="text"
                          value={aiSearchQuery}
                          onChange={(e) => setAiSearchQuery(e.target.value)}
                          placeholder={t.aiSearchPlaceholder}
                          className="flex-1 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl py-3 px-4 text-xs text-white placeholder-amber-200/50 focus:outline-none focus:ring-1 focus:ring-[#F2B355]"
                          onKeyDown={(e) => { if (e.key === "Enter") handleAISearch(); }}
                        />
                        <motion.button
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          transition={{ duration: 0.15 }}
                          onClick={handleAISearch}
                          disabled={aiSearching}
                          className="bg-[#E3A23D] hover:bg-[#F2B355] text-[#241611] font-black text-xs px-5 py-3 rounded-xl shadow-sm cursor-pointer disabled:opacity-50 shrink-0 flex items-center justify-center gap-1.5"
                        >
                          {aiSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                          {aiSearching ? (lang === "fr" ? "Réflexion..." : "Thinking...") : t.aiSearchBtn}
                        </motion.button>
                      </div>

                      {aiSearching && (
                        <div className="flex items-center gap-2 text-xs text-amber-200/80 animate-fade-in relative z-10">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>{lang === "fr" ? "L'assistant réfléchit..." : "The assistant is thinking..."}</span>
                        </div>
                      )}

                      {!aiSearching && aiSearchError && (
                        <div className="bg-red-950/40 border border-red-800/50 rounded-2xl p-4 flex items-start gap-2.5 animate-fade-in text-xs leading-relaxed relative z-10">
                          <AlertTriangle className="w-4 h-4 text-red-300 shrink-0 mt-0.5" />
                          <p className="text-red-100">{aiSearchError}</p>
                        </div>
                      )}

                      {!aiSearching && aiSearchResult && (
                        <div className="bg-amber-900/30 border border-amber-800/50 rounded-2xl p-4 space-y-2 animate-fade-in text-xs leading-relaxed relative z-10">
                          <p className="font-bold text-amber-300">
                            ✨ {t.aiSearchSuccess} {lang === "fr" ? CATEGORY_DETAILS[aiSearchResult.category as ServiceCategory]?.nameFR : CATEGORY_DETAILS[aiSearchResult.category as ServiceCategory]?.nameEN}
                          </p>
                          <p className="text-amber-100/90 font-serif">
                            {aiSearchResult.explanation}
                          </p>
                        </div>
                      )}
                    </motion.div>

                    {/* Category Icon Grid — mobile-first primary navigation. Pulls live from
                        allCategories (same source as the filter dropdown/pills below — no
                        hardcoded/duplicated category list) and reuses the existing
                        selectedCategory/selectedSubcategory state, so tapping a tile is exactly
                        equivalent to picking that category from the dropdown or pills row. */}
                    <motion.div
                      initial={{ opacity: 0, y: 16 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.3 }}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                      className="bg-white border border-amber-100 rounded-3xl p-5 sm:p-4 shadow-sm"
                    >
                      <h3 className="text-xs font-black text-amber-950 uppercase tracking-wide mb-3 sm:mb-2.5">
                        {lang === "fr" ? "Parcourir par catégorie" : "Browse by Category"}
                      </h3>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 sm:gap-2">
                        {allCategories.map((cat) => {
                          // Curated icon/color for the 8 built-in categories; generic fallback icon
                          // for anything DB-only (e.g. a newly-approved suggestion) with no
                          // hand-picked metadata yet — same fallback pattern as the pills row below.
                          const catObj = CATEGORY_DETAILS[cat.slug as ServiceCategory] as { nameFR: string; nameEN: string } | undefined;
                          const Icon = getCategoryIcon(cat.slug);
                          const isSelected = selectedCategory === cat.slug && !selectedSubcategory;
                          return (
                            <motion.button
                              key={cat.slug}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => { setSelectedCategory(cat.slug); setSelectedSubcategory(null); }}
                              className={`flex flex-col items-center justify-center gap-1.5 sm:gap-1 py-4 sm:py-2.5 px-2 rounded-2xl border transition-colors cursor-pointer ${
                                isSelected
                                  ? "bg-[#E3A23D] border-[#E3A23D] text-[#241611]"
                                  : "bg-[#FBF7F0] border-amber-200/50 text-amber-900 hover:bg-amber-100/50 hover:border-amber-300/60"
                              }`}
                            >
                              <Icon className="w-6 h-6 sm:w-4 sm:h-4 shrink-0" />
                              <span className="text-[11px] sm:text-[9px] font-bold text-center leading-tight line-clamp-2">
                                {lang === "fr" ? (catObj?.nameFR || cat.nameFr) : (catObj?.nameEN || cat.nameEn)}
                              </span>
                            </motion.button>
                          );
                        })}
                      </div>
                    </motion.div>

                    {/* Filter / Search dashboard */}
                    <div className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm space-y-4">
                      <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-800/60 w-5 h-5" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder={t.searchPlaceholder}
                          className="w-full bg-[#FBF7F0] border border-amber-200/80 rounded-2xl py-3.5 pl-12 pr-4 text-sm text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-800/40"
                        />
                      </div>

                      {/* Filter selects */}
                      <div className="flex flex-col sm:flex-row gap-3">
                        <div className="flex-1 relative">
                          <select
                            value={selectedSubcategory ? `sub:${selectedSubcategory}` : selectedCategory}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val.startsWith("sub:")) {
                                const subId = val.slice(4);
                                const sub = SUB_CATEGORIES.find((s) => s.id === subId);
                                setSelectedSubcategory(subId);
                                if (sub) setSelectedCategory(sub.cat);
                              } else {
                                setSelectedSubcategory(null);
                                setSelectedCategory(val);
                              }
                            }}
                            className="w-full bg-[#FBF7F0] border border-amber-200/80 rounded-xl py-3 px-3.5 text-xs font-semibold text-amber-950 focus:outline-none cursor-pointer"
                          >
                            <option value="ALL">{t.allCategories}</option>
                            {/* Live from service_categories — includes the 8 built-in categories AND
                                any later admin-approved suggestions (e.g. "Informatique (TIC)"),
                                never a hardcoded/static list. */}
                            <optgroup label={lang === "fr" ? "Catégories" : "Categories"}>
                              {allCategories.map((cat) => (
                                <option key={cat.slug} value={cat.slug}>
                                  {lang === "fr" ? cat.nameFr : cat.nameEn}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label={lang === "fr" ? "Métiers spécifiques" : "Specific trades"}>
                              {SUB_CATEGORIES.map((sub) => (
                                <option key={sub.id} value={`sub:${sub.id}`}>
                                  {lang === "fr" ? sub.labelFR : sub.labelEN}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </div>

                        <div className="flex-1 relative">
                          <select
                            value={selectedNeighborhood}
                            onChange={(e) => setSelectedNeighborhood(e.target.value)}
                            className="w-full bg-[#FBF7F0] border border-amber-200/80 rounded-xl py-3 px-3.5 text-xs font-semibold text-amber-950 focus:outline-none cursor-pointer"
                          >
                            <option value="ALL">{t.allNeighborhoods}</option>
                            {BERTOUA_NEIGHBORHOODS.map((nh) => (
                              <option key={nh.id} value={nh.id}>
                                {nh.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex-1 relative">
                          <select
                            value={sortOption}
                            onChange={(e) => setSortOption(e.target.value as typeof sortOption)}
                            className="w-full bg-[#FBF7F0] border border-amber-200/80 rounded-xl py-3 pl-3.5 pr-3.5 text-xs font-semibold text-amber-950 focus:outline-none cursor-pointer"
                          >
                            <option value="relevance">{lang === "fr" ? "Pertinence" : "Relevance"}</option>
                            <option value="rating">{lang === "fr" ? "Les mieux notés" : "Top rated"}</option>
                            <option value="newest">{lang === "fr" ? "Les plus récents" : "Newest"}</option>
                            <option value="price_asc">{lang === "fr" ? "Prix croissant" : "Price: low to high"}</option>
                            <option value="price_desc">{lang === "fr" ? "Prix décroissant" : "Price: high to low"}</option>
                          </select>
                        </div>
                      </div>

                      {/* Quick categories pills */}
                      <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.5 }}
                        transition={{ duration: 0.35, ease: "easeOut" }}
                        className="flex gap-2 overflow-x-auto pt-2 pb-1 scrollbar-thin"
                      >
                        <button
                          onClick={() => { setSelectedCategory("ALL"); setSelectedSubcategory(null); }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer hover:scale-105 active:scale-95 ${
                            selectedCategory === "ALL" && !selectedSubcategory
                              ? "bg-[#E3A23D] text-[#241611]"
                              : "bg-amber-50 text-amber-900 border border-amber-200/40 hover:bg-amber-100/40"
                          }`}
                        >
                          🚀 Tout / All
                        </button>
                        {allCategories.map((cat) => {
                          // Curated icon/color for the 8 built-in categories; a generic fallback
                          // icon for anything DB-only (e.g. a newly-approved suggestion) that has no
                          // hand-picked metadata yet.
                          const catObj = CATEGORY_DETAILS[cat.slug as ServiceCategory] as { nameFR: string; nameEN: string } | undefined;
                          const Icon = getCategoryIcon(cat.slug);
                          const isSelected = selectedCategory === cat.slug && !selectedSubcategory;
                          return (
                            <button
                              key={cat.slug}
                              onClick={() => { setSelectedCategory(cat.slug); setSelectedSubcategory(null); }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer hover:scale-105 active:scale-95 ${
                                isSelected
                                  ? "bg-[#E3A23D] text-[#241611]"
                                  : "bg-amber-50 text-amber-900 border border-amber-200/40 hover:bg-amber-100/40"
                              }`}
                            >
                              <Icon className="w-3.5 h-3.5" />
                              {lang === "fr" ? (catObj?.nameFR || cat.nameFr) : (catObj?.nameEN || cat.nameEn)}
                            </button>
                          );
                        })}
                        <button
                          onClick={() => setShowAllTrades((v) => !v)}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all shrink-0 cursor-pointer hover:scale-105 active:scale-95 bg-white border border-amber-300 text-amber-900 hover:bg-amber-50"
                        >
                          {lang === "fr" ? `Plus de métiers (${SUB_CATEGORIES.length})` : `More trades (${SUB_CATEGORIES.length})`}
                          {showAllTrades ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </motion.div>

                      {/* Full trade list (Item 1: every category/sub-category that exists, not just
                          the 8 top-level ones) — collapsed by default given there are 30+. */}
                      {showAllTrades && (
                        <div className="flex flex-wrap gap-2 pt-1 pb-1 animate-fade-in border-t border-amber-50 mt-1">
                          {SUB_CATEGORIES.map((sub) => {
                            const isSelected = selectedSubcategory === sub.id;
                            return (
                              <button
                                key={sub.id}
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedSubcategory(null);
                                  } else {
                                    setSelectedSubcategory(sub.id);
                                    setSelectedCategory(sub.cat);
                                  }
                                }}
                                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer hover:scale-105 active:scale-95 ${
                                  isSelected
                                    ? "bg-[#E3A23D] text-[#241611]"
                                    : "bg-amber-50 text-amber-900 border border-amber-200/40 hover:bg-amber-100/40"
                                }`}
                              >
                                {lang === "fr" ? sub.labelFR : sub.labelEN}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Dedicated AI Chat Launcher Banner (Phase 6 requirement) */}
                    <motion.div
                      initial={{ opacity: 0, y: 24 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.3 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="bg-gradient-to-br from-[#7A3420] to-[#241611] text-white rounded-3xl p-6 shadow-sm relative overflow-hidden group border border-[#7A3420]/30"
                    >
                      <div className="absolute -right-8 -bottom-8 w-36 h-36 bg-[#E3A23D]/15 rounded-full blur-3xl group-hover:scale-110 transition-transform duration-500" />
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
                            <h4 className="font-black text-xs uppercase tracking-wide text-[#F2B355] flex items-center gap-1.5">
                              {lang === "fr" ? "Assistant One Village" : "One Village Assistant"}
                            </h4>
                            <p className="text-xs text-amber-100/95 leading-relaxed font-serif mt-1 max-w-lg">
                              {lang === "fr"
                                ? "Discutez avec notre assistant pour traduire vos phrases en Gbaya/Makaa/Fulfulde, ou estimer un prix juste à Bertoua."
                                : "Chat with our assistant to translate to local dialects or estimate a fair trade rate in Bertoua."}
                            </p>
                          </div>
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.04 }}
                          whileTap={{ scale: 0.96 }}
                          transition={{ duration: 0.15 }}
                          onClick={() => {
                            const widget = document.getElementById("ai-guide-widget");
                            if (widget) {
                              widget.scrollIntoView({ behavior: "smooth" });
                              widget.classList.add("ring-4", "ring-[#E3A23D]", "ring-opacity-50");
                              // Also focus input
                              const aiInput = widget.querySelector("input");
                              if (aiInput) aiInput.focus();
                              setTimeout(() => {
                                widget.classList.remove("ring-4", "ring-[#E3A23D]", "ring-opacity-50");
                              }, 2000);
                            }
                          }}
                          className="bg-[#E3A23D] hover:bg-[#F2B355] text-[#241611] font-black text-xs px-5 py-3 rounded-xl shadow-sm cursor-pointer whitespace-nowrap self-stretch sm:self-auto text-center"
                        >
                          {lang === "fr" ? "Discuter avec l'Assistant" : "Chat with the Assistant"}
                        </motion.button>
                      </div>
                    </motion.div>

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
                          {browseMode === "filtered"
                            ? `${t.browseTitle} (${filteredProviders.length})`
                            : `${lang === "fr" ? "Parcourir par catégorie" : "Browse by category"} (${groupedByCategory.reduce((sum, g) => sum + g.items.length, 0)})`}
                        </h2>
                        <div className="flex items-center gap-2 shrink-0">
                          {selectedCategory !== "ALL" && browseMode === "filtered" && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full flex items-center gap-1">
                              ✨ {lang === "fr" ? "Trié par score de qualité (Avis × Récence × Volume)" : "Sorted by quality score (Reviews × Recency × Volume)"}
                            </span>
                          )}
                          {/* Item 4: toggle between the single filtered grid and a section-per-category
                              browse view — both read from the same live realProviders/allCategories data. */}
                          <div className="flex items-center bg-amber-50 border border-amber-200 rounded-xl p-0.5 text-[10px] font-bold">
                            <button
                              onClick={() => setBrowseMode("filtered")}
                              className={`px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer ${browseMode === "filtered" ? "bg-[#E3A23D] text-[#241611]" : "text-amber-900 hover:bg-amber-100/60"}`}
                            >
                              {lang === "fr" ? "Liste" : "List"}
                            </button>
                            <button
                              onClick={() => setBrowseMode("byCategory")}
                              className={`px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer ${browseMode === "byCategory" ? "bg-[#E3A23D] text-[#241611]" : "text-amber-900 hover:bg-amber-100/60"}`}
                            >
                              {lang === "fr" ? "Par catégorie" : "By Category"}
                            </button>
                          </div>
                        </div>
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
                    ) : activeChatProvider && currentUser ? (
                      <div className="animate-fade-in">
                        <ChatInterface
                          provider={activeChatProvider}
                          currentUser={currentUser}
                          lang={lang}
                          onBack={() => setActiveChatProvider(null)}
                        />
                      </div>
                    ) : browseMode === "byCategory" ? (
                      /* Category-Grouped Browse View (Item 4) */
                      <div className="space-y-8 animate-fade-in">
                        {groupedByCategory.length === 0 ? (
                          <div className="bg-white border border-dashed border-amber-200 rounded-3xl p-16 text-center text-xs text-amber-900">
                            {t.noProviders}
                          </div>
                        ) : (
                          <>
                            {/* Jump-to-category nav chips */}
                            <div className="flex flex-wrap gap-2">
                              {groupedByCategory.map(({ cat, items }) => {
                                const builtIn = CATEGORY_DETAILS[cat.slug as ServiceCategory] as { nameFR: string; nameEN: string } | undefined;
                                return (
                                  <button
                                    key={`jump-${cat.slug}`}
                                    onClick={() => {
                                      const el = document.getElementById(`cat-section-${cat.slug}`);
                                      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                                    }}
                                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-200/40 hover:bg-amber-100/40 transition-all cursor-pointer"
                                  >
                                    {lang === "fr" ? (builtIn?.nameFR || cat.nameFr) : (builtIn?.nameEN || cat.nameEn)} ({items.length})
                                  </button>
                                );
                              })}
                            </div>

                            {groupedByCategory.map(({ cat, items }) => {
                              const builtIn = CATEGORY_DETAILS[cat.slug as ServiceCategory] as { nameFR: string; nameEN: string; color: string } | undefined;
                              const Icon = getCategoryIcon(cat.slug);
                              const color = builtIn?.color || "amber";
                              return (
                                <div key={cat.slug} id={`cat-section-${cat.slug}`} className="space-y-3 scroll-mt-24">
                                  <div className="flex items-center gap-2 px-1">
                                    <span className={`w-8 h-8 rounded-xl flex items-center justify-center bg-${color}-50 text-${color}-700 border border-${color}-100 shrink-0`}>
                                      <Icon className="w-4 h-4" />
                                    </span>
                                    <h3 className="text-sm font-black text-amber-950 uppercase tracking-wide">
                                      {lang === "fr" ? (builtIn?.nameFR || cat.nameFr) : (builtIn?.nameEN || cat.nameEn)}
                                    </h3>
                                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                                      {items.length}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {items.map((p) => (
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
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </>
                        )}
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
                              .map((p, index) => (
                                <motion.div
                                  key={p.id}
                                  initial={{ opacity: 0, y: 20 }}
                                  whileInView={{ opacity: 1, y: 0 }}
                                  viewport={{ once: true, amount: 0.2 }}
                                  transition={{ duration: 0.35, ease: "easeOut", delay: Math.min(index, 5) * 0.05 }}
                                >
                                  <ServiceCard
                                    provider={p}
                                    lang={lang}
                                    isLoggedIn={!!currentUser}
                                    onGetService={() => triggerAuthFunnel("book", p)}
                                    onBook={() => currentUser ? setActiveBookingProvider(p) : triggerAuthFunnel("book", p)}
                                    onChat={() => currentUser ? setActiveChatProvider(p) : triggerAuthFunnel("chat", p)}
                                    onViewProfile={() => setSelectedProviderForProfile(p)}
                                  />
                                </motion.div>
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
                                    ? "bg-[#E3A23D] text-[#241611]"
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

                        {/* Part 1, Item 1: unified search — professional profiles and open job
                            postings as their own clearly-labeled groups, distinct from the
                            "Prestataires de services" grid above. Only appear while a search is
                            active and something actually matches. */}
                        {matchingProfessionalProfiles.length > 0 && (
                          <div className="space-y-3 pt-2">
                            <h3 className="text-sm font-black text-amber-950 uppercase tracking-wide flex items-center gap-2">
                              <Briefcase className="w-4 h-4 text-[#245C46]" />
                              {lang === "fr" ? "Profils Professionnels" : "Professional Profiles"} ({matchingProfessionalProfiles.length})
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {matchingProfessionalProfiles.slice(0, 6).map((p) => (
                                <a
                                  key={p.userId}
                                  href={`/pro/${p.userId}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="bg-white border border-amber-100 rounded-2xl p-4 hover:shadow-md hover:border-amber-200 transition-all flex items-center gap-3"
                                >
                                  <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-200 overflow-hidden flex items-center justify-center shrink-0">
                                    {p.avatarUrl ? (
                                      <img src={p.avatarUrl} alt={p.fullName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    ) : (
                                      <User className="w-5 h-5 text-amber-800/40" />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-bold text-amber-950 text-xs truncate">{p.fullName}</p>
                                    <p className="text-[10px] text-amber-800/80 truncate">{p.headline}</p>
                                  </div>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {matchingJobPostings.length > 0 && (
                          <div className="space-y-3 pt-2">
                            <h3 className="text-sm font-black text-amber-950 uppercase tracking-wide flex items-center gap-2">
                              <ClipboardList className="w-4 h-4 text-[#7A3420]" />
                              {lang === "fr" ? "Offres d'Emploi" : "Job Postings"} ({matchingJobPostings.length})
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {matchingJobPostings.slice(0, 6).map((j) => (
                                <a
                                  key={j.id}
                                  href={`/job/${j.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="bg-white border border-amber-100 rounded-2xl p-4 hover:shadow-md hover:border-amber-200 transition-all"
                                >
                                  <p className="font-bold text-amber-950 text-xs truncate">{j.title}</p>
                                  <p className="text-[10px] text-amber-800/80 mt-0.5">{j.companyName || (lang === "fr" ? "Particulier" : "Individual")}</p>
                                </a>
                              ))}
                            </div>
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
                <AdBoard lang={lang} currentUser={currentUser} />
              </div>
            )}

            {/* VIEW 2b: JOB POSTINGS BROWSE */}
            {activeView === "jobs" && (
              <div className="animate-fade-in">
                <JobsBrowsePage lang={lang} currentUserId={currentUser?.id || null} />
              </div>
            )}

            {/* VIEW 2c: PROFESSIONAL PROFILES DIRECTORY */}
            {activeView === "professionals" && (
              <div className="animate-fade-in">
                <ProfessionalDirectoryPage
                  lang={lang}
                  currentUserId={currentUser?.id || null}
                  onCreateProfile={openProfessionalProfileCreation}
                />
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
                  onRefreshProviders={() => { fetchProviders(); fetchRealProviders(); }}
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
          <button
            onClick={() => setShowLandingPage(true)}
            className="text-amber-800 hover:text-amber-950 hover:underline font-bold cursor-pointer"
          >
            {lang === "fr" ? "Revoir la page d'accueil" : "Revisit the welcome page"}
          </button>
        </div>
      </footer>

      {/* ADMIN ASSISTED SETUP OVERLAY */}
      {adminCreatingProvider && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 overflow-y-auto p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 border border-amber-100 shadow-xl space-y-4 mx-auto my-8">
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-fade-in overflow-y-auto p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 border border-amber-100 shadow-xl space-y-5 relative mx-auto my-6 sm:my-10">
            <button
              onClick={() => {
                setShowAuthModal(false);
                setPendingAction(null);
                setPendingOtpEmail(null);
                setOtpCode("");
                setErrorMsg("");
                setSuccessMsg("");
              }}
              className="absolute top-4 right-4 text-amber-800/80 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 p-2 rounded-xl transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Custom Tab selectors — hidden while the OTP code-entry screen is showing */}
            {!pendingOtpEmail && (
              <div className="flex border-b border-amber-100 pb-1">
                <button
                  onClick={() => { setAuthTab("signin"); setErrorMsg(""); setSuccessMsg(""); }}
                  className={`flex-1 py-2.5 text-center text-xs font-black uppercase tracking-wider cursor-pointer border-b-2 transition-all ${
                    authTab === "signin"
                      ? "border-[#E3A23D] text-amber-950"
                      : "border-transparent text-amber-800/60 hover:text-amber-950"
                  }`}
                >
                  {lang === "fr" ? "Connexion" : "Sign In"}
                </button>
                <button
                  onClick={() => { setAuthTab("signup"); setErrorMsg(""); setSuccessMsg(""); }}
                  className={`flex-1 py-2.5 text-center text-xs font-black uppercase tracking-wider cursor-pointer border-b-2 transition-all ${
                    authTab === "signup"
                      ? "border-[#E3A23D] text-amber-950"
                      : "border-transparent text-amber-800/60 hover:text-amber-950"
                  }`}
                >
                  {lang === "fr" ? "S'inscrire (Nouveau)" : "Sign Up"}
                </button>
              </div>
            )}

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

            {pendingOtpEmail ? (
              <div className="space-y-4">
                <div className="text-center space-y-1.5">
                  <h3 className="text-sm font-black text-amber-950">
                    {lang === "fr" ? "Vérifiez votre e-mail" : "Check your email"}
                  </h3>
                  <p className="text-xs text-amber-800 font-serif">
                    {lang === "fr" ? "Entrez le code à 6 chiffres envoyé à " : "Enter the 6-digit code sent to "}
                    <strong className="text-amber-950">{pendingOtpEmail}</strong>.
                  </p>
                </div>

                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    autoFocus
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="w-full text-center tracking-[0.6em] text-lg font-mono bg-[#FBF7F0] border border-amber-200 rounded-xl px-4 py-3 text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-800"
                  />
                  <button
                    type="submit"
                    disabled={otpSubmitting || otpCode.length !== 6}
                    className="w-full py-3 bg-[#E3A23D] hover:bg-[#F2B355] text-[#241611] text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {otpSubmitting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle className="w-3.5 h-3.5" />
                    )}
                    {lang === "fr" ? "Vérifier" : "Verify"}
                  </button>
                </form>

                <div className="flex items-center justify-between text-xs pt-1">
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={otpResendCooldown > 0}
                    className="font-bold text-amber-900 hover:text-amber-950 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {otpResendCooldown > 0
                      ? (lang === "fr" ? `Renvoyer le code (${otpResendCooldown}s)` : `Resend code (${otpResendCooldown}s)`)
                      : (lang === "fr" ? "Renvoyer le code" : "Resend code")}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelOtp}
                    className="font-bold text-amber-800/70 hover:text-amber-950 cursor-pointer"
                  >
                    {lang === "fr" ? "Retour" : "Back"}
                  </button>
                </div>
              </div>
            ) : authTab === "signup" ? (
              <form onSubmit={handleSignUp} className="space-y-4">
                {/* Role selector */}
                <div className="flex bg-amber-50 p-1 rounded-xl border border-amber-100">
                  <button
                    type="button"
                    onClick={() => setAuthRole("client")}
                    className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider text-center cursor-pointer transition-all ${
                      authRole === "client" ? "bg-amber-800 text-white shadow-sm" : "text-amber-900"
                    }`}
                  >
                    {lang === "fr" ? "Je cherche un service" : "I'm looking for services"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthRole("provider")}
                    className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider text-center cursor-pointer transition-all ${
                      authRole === "provider" ? "bg-amber-800 text-white shadow-sm" : "text-amber-900"
                    }`}
                  >
                    {lang === "fr" ? "Je propose un service" : "I offer services"}
                  </button>
                </div>

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
                    className="w-full bg-[#FBF7F0] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-amber-900 uppercase tracking-wider block">
                    {lang === "fr" ? "Numéro WhatsApp / Téléphone Mobile (+237)" : "Cameroon Mobile Phone (+237)"}
                  </label>
                  <input
                    type="tel"
                    value={authPhone}
                    onChange={(e) => setAuthPhone(e.target.value)}
                    placeholder="e.g. +237 677 88 99 00"
                    className="w-full bg-[#FBF7F0] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-800 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-amber-900 uppercase tracking-wider block">
                    {lang === "fr" ? "Adresse E-mail" : "Email Address"}
                  </label>
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="e.g. mon_email@yahoo.fr"
                    className="w-full bg-[#FBF7F0] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-800 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-amber-900 uppercase tracking-wider block">
                    {lang === "fr" ? "Mot de passe" : "Password"}
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder={lang === "fr" ? "6 caractères minimum" : "Minimum 6 characters"}
                    className="w-full bg-[#FBF7F0] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-800 font-mono"
                  />
                </div>

                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="w-full py-3 bg-[#E3A23D] hover:bg-[#F2B355] text-[#241611] text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {lang === "fr" ? "Créer mon compte" : "Create My Account"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-amber-900 uppercase tracking-wider block">
                    {lang === "fr" ? "Adresse E-mail" : "Email Address"}
                  </label>
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="e.g. mon_email@yahoo.fr"
                    className="w-full bg-[#FBF7F0] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-800 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-amber-900 uppercase tracking-wider block">
                    {lang === "fr" ? "Mot de passe" : "Password"}
                  </label>
                  <input
                    type="password"
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#FBF7F0] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-800 font-mono"
                  />
                </div>

                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="w-full py-3 bg-[#E3A23D] hover:bg-[#F2B355] text-[#241611] text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {lang === "fr" ? "Se connecter" : "Sign In"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Booking Modal Overlay */}
      {activeBookingProvider && currentUser && (
        <BookingModal
          provider={activeBookingProvider}
          currentUser={currentUser}
          lang={lang}
          onClose={() => setActiveBookingProvider(null)}
          onBookingSuccess={() => {
            fetchProviders();
            setActiveView("dashboard");
          }}
        />
      )}

      {/* My Profile Settings Overlay */}
      {showProfileSettings && currentUser && (
        <ProfileSettings
          lang={lang}
          currentUser={currentUser}
          initialTab={profileSettingsInitialTab}
          onClose={() => { setShowProfileSettings(false); setProfileSettingsInitialTab("personal"); }}
          onUpdated={(updated) => {
            setCurrentUser(updated);
            fetchRealProviders();
          }}
        />
      )}
    </div>
  );
}
