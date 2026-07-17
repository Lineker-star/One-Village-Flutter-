import React, { useState, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line,
} from "recharts";
import {
  Users,
  FolderTree,
  BookOpen,
  AlertTriangle,
  ShieldCheck,
  Trash2,
  Check,
  X,
  RefreshCw,
  Search,
  Plus,
  Shuffle,
  ShieldAlert,
  Megaphone,
  Sparkles,
  LayoutDashboard,
  Table2,
  ChevronUp,
  ChevronDown,
  Star,
  Briefcase,
  UserCheck,
  Download,
} from "lucide-react";
import { ServiceProvider } from "../types.ts";
import { BERTOUA_NEIGHBORHOODS } from "../data/bertouaData.ts";
import { supabaseService } from "../lib/supabase.ts";
import { toTitleCase } from "../lib/textFormat.ts";

interface AdminDashboardProps {
  lang: "fr" | "en";
  currentUser: any;
  providers: ServiceProvider[];
  onRefreshProviders: () => void;
  onOpenWizard: () => void;
}

type AdminTab = "overview" | "directory" | "accounts" | "categories" | "category_suggestions" | "bookings" | "moderation" | "id_approvals" | "promoted_ads" | "job_postings" | "professional_profiles";

// Item 3: donut/bar chart colors — status semantics (amber=pending, forest green=approved,
// terracotta-red=rejected) plus a general rotating palette for multi-series bar charts.
const STATUS_COLORS: Record<string, string> = {
  pending: "#E3A23D",
  approved: "#245C46",
  rejected: "#B8492E",
};
const CHART_COLORS = ["#E3A23D", "#245C46", "#7A3420", "#3E8467", "#F2B355", "#B8492E"];

export default function AdminDashboard({ 
  lang, 
  currentUser, 
  providers, 
  onRefreshProviders,
  onOpenWizard
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");

  // Data lists
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [bookingsList, setBookingsList] = useState<any[]>([]);
  const [flaggedReviews, setFlaggedReviews] = useState<any[]>([]);
  const [promotedAdsList, setPromotedAdsList] = useState<any[]>([]);
  const [pendingProviders, setPendingProviders] = useState<any[]>([]);
  const [categorySuggestions, setCategorySuggestions] = useState<any[]>([]);

  // Item 3: Vue d'Ensemble live stats
  const [overviewStats, setOverviewStats] = useState<any | null>(null);

  // Item 1: Répertoire des Services directory
  const [directoryProviders, setDirectoryProviders] = useState<any[]>([]);
  const [directoryCategories, setDirectoryCategories] = useState<Array<{ id: number; slug: string; nameFr: string; nameEn: string }>>([]);
  const [dirFilterCategory, setDirFilterCategory] = useState("ALL");
  const [dirFilterNeighborhood, setDirFilterNeighborhood] = useState("ALL");
  const [dirFilterStatus, setDirFilterStatus] = useState("ALL");
  const [dirDateFrom, setDirDateFrom] = useState("");
  const [dirDateTo, setDirDateTo] = useState("");
  const [dirSortField, setDirSortField] = useState<"name" | "createdAt" | "rating">("createdAt");
  const [dirSortDir, setDirSortDir] = useState<"asc" | "desc">("desc");

  // Item 2: Répertoire detail panel
  const [selectedDirectoryId, setSelectedDirectoryId] = useState<string | null>(null);
  const [directoryDetail, setDirectoryDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // "Offres d'Emploi" admin tab
  const [jobPostingsAdmin, setJobPostingsAdmin] = useState<any[]>([]);
  const [jobFilterStatus, setJobFilterStatus] = useState("ALL");
  const [jobFilterCategory, setJobFilterCategory] = useState("ALL");
  const [jobFilterEmploymentType, setJobFilterEmploymentType] = useState("ALL");
  const [jobSortField, setJobSortField] = useState<"title" | "createdAt" | "applicationCount">("createdAt");
  const [jobSortDir, setJobSortDir] = useState<"asc" | "desc">("desc");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobDetail, setJobDetail] = useState<any | null>(null);
  const [jobDetailLoading, setJobDetailLoading] = useState(false);
  const [jobActionBusy, setJobActionBusy] = useState(false);

  // "Profils Professionnels" admin tab
  const [professionalProfilesAdmin, setProfessionalProfilesAdmin] = useState<any[]>([]);
  const [profFilterAvailability, setProfFilterAvailability] = useState("ALL");
  const [selectedProfUserId, setSelectedProfUserId] = useState<string | null>(null);
  const [profDetail, setProfDetail] = useState<any | null>(null);
  const [profDetailLoading, setProfDetailLoading] = useState(false);
  const [profActionBusy, setProfActionBusy] = useState(false);

  // Loading & Action states
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  
  // Forms states
  const [newCatNameFR, setNewCatNameFR] = useState("");
  const [newCatNameEN, setNewCatNameEN] = useState("");
  const [newCatSlug, setNewCatSlug] = useState("");
  const [newCatIcon, setNewCatIcon] = useState("");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  
  // Category Merge states
  const [sourceSlug, setSourceSlug] = useState("");
  const [targetSlug, setTargetSlug] = useState("");
  const [mergeError, setMergeError] = useState("");
  const [mergeSuccess, setMergeSuccess] = useState("");

  // Provider Edit state
  const [editingProvider, setEditingProvider] = useState<any | null>(null);
  const [editName, setEditName] = useState("");
  const [editBusinessName, setEditBusinessName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editNeighborhood, setEditNeighborhood] = useState("");
  const [editRate, setEditRate] = useState(0);
  const [editRateUnit, setEditRateUnit] = useState("jour");
  const [editDescription, setEditDescription] = useState("");
  const [editLanguages, setEditLanguages] = useState<string[]>([]);
  const [editVerified, setEditVerified] = useState(false);

  // Sends the current Supabase session's JWT so server.ts's requireAdmin middleware can verify it
  // server-side (via the service role key) and look up the caller's role in profiles — replaces the
  // old client-trusted "x-user-role" header.
  const getAdminHeaders = async (): Promise<Record<string, string>> => {
    const token = await supabaseService.getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // Load section-specific data on tab switch
  const fetchData = async () => {
    setLoading(prev => ({ ...prev, [activeTab]: true }));
    try {
      if (activeTab === "overview") {
        setOverviewStats(await supabaseService.getAdminOverviewStats());
      } else if (activeTab === "directory") {
        const [dirData, cats] = await Promise.all([
          supabaseService.getAllProvidersDirectory(),
          supabaseService.getAllServiceCategories(),
        ]);
        setDirectoryProviders(dirData);
        setDirectoryCategories(cats);
      } else if (activeTab === "id_approvals") {
        setPendingProviders(await supabaseService.getPendingProviders());
      } else if (activeTab === "category_suggestions") {
        setCategorySuggestions(await supabaseService.getCategorySuggestions());
      } else if (activeTab === "accounts") {
        const res = await fetch("/api/admin/accounts", { headers: await getAdminHeaders() });
        if (res.ok) setAccounts(await res.json());
      } else if (activeTab === "categories") {
        const res = await fetch("/api/admin/categories", { headers: await getAdminHeaders() });
        if (res.ok) {
          const data = await res.json();
          setCategories(Array.isArray(data) ? data : (data.categories || []));
        }
      } else if (activeTab === "bookings") {
        const res = await fetch("/api/admin/bookings", { headers: await getAdminHeaders() });
        if (res.ok) setBookingsList(await res.json());
      } else if (activeTab === "moderation") {
        const res = await fetch("/api/admin/moderation", { headers: await getAdminHeaders() });
        if (res.ok) {
          const data = await res.json();
          setFlaggedReviews(Array.isArray(data) ? data : (data.flaggedReviews || []));
        }
      } else if (activeTab === "promoted_ads") {
        const res = await fetch("/api/admin/promoted-ads", { headers: await getAdminHeaders() });
        if (res.ok) setPromotedAdsList(await res.json());
      } else if (activeTab === "job_postings") {
        const [jobs, cats] = await Promise.all([
          supabaseService.getAllJobPostingsAdmin(),
          supabaseService.getAllServiceCategories(),
        ]);
        setJobPostingsAdmin(jobs);
        setDirectoryCategories((prev) => (prev.length ? prev : cats));
      } else if (activeTab === "professional_profiles") {
        setProfessionalProfilesAdmin(await supabaseService.getAllProfessionalProfilesAdmin());
      }
    } catch (err) {
      console.error("Admin data fetch error:", err);
    } finally {
      setLoading(prev => ({ ...prev, [activeTab]: false }));
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  // Item 3: lightweight auto-refresh for the Overview tab while it's open — a simple interval, not
  // a realtime subscription, per the task's explicit ask to keep this tab lightweight.
  useEffect(() => {
    if (activeTab !== "overview") return;
    const interval = setInterval(() => {
      supabaseService.getAdminOverviewStats().then(setOverviewStats);
    }, 60000);
    return () => clearInterval(interval);
  }, [activeTab]);

  // Item 4: realtime — a new pending provider or category suggestion refreshes its queue
  // automatically regardless of which tab is currently open, so switching to either tab always
  // shows the latest without a manual refresh. Requires service_providers/category_suggestions in
  // the supabase_realtime publication — see 20260718000000_admin_dashboard_realtime.sql.
  useEffect(() => {
    const unsubscribeProviders = supabaseService.subscribeToPendingProviders(() => {
      supabaseService.getPendingProviders().then(setPendingProviders);
    });
    const unsubscribeSuggestions = supabaseService.subscribeToCategorySuggestions(() => {
      supabaseService.getCategorySuggestions().then(setCategorySuggestions);
    });
    return () => {
      unsubscribeProviders();
      unsubscribeSuggestions();
    };
  }, []);

  // Répertoire detail panel — pulls the full real record for one provider (Item 2).
  const handleOpenDirectoryDetail = async (id: string) => {
    setSelectedDirectoryId(id);
    setDetailLoading(true);
    setDirectoryDetail(null);
    try {
      const detail = await supabaseService.getProviderAdminDetail(id);
      setDirectoryDetail(detail);
    } catch (err) {
      console.error("Error loading provider detail:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSortClick = (field: "name" | "createdAt" | "rating") => {
    if (dirSortField === field) {
      setDirSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setDirSortField(field);
      setDirSortDir(field === "name" ? "asc" : "desc");
    }
  };

  const filteredDirectory = useMemo(() => {
    let list = directoryProviders.filter((p) => {
      if (dirFilterCategory !== "ALL" && !(p.categorySlugs || []).includes(dirFilterCategory)) return false;
      if (dirFilterNeighborhood !== "ALL" && p.neighborhoodId !== dirFilterNeighborhood) return false;
      if (dirFilterStatus !== "ALL" && p.verificationStatus !== dirFilterStatus) return false;
      if (dirDateFrom && p.createdAt.slice(0, 10) < dirDateFrom) return false;
      if (dirDateTo && p.createdAt.slice(0, 10) > dirDateTo) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const haystack = `${p.name} ${p.businessName || ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (dirSortField === "name") cmp = (a.businessName || a.name || "").localeCompare(b.businessName || b.name || "");
      else if (dirSortField === "createdAt") cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      else if (dirSortField === "rating") cmp = a.averageRating - b.averageRating;
      return dirSortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [directoryProviders, dirFilterCategory, dirFilterNeighborhood, dirFilterStatus, dirDateFrom, dirDateTo, searchQuery, dirSortField, dirSortDir]);

  const handleRefreshOverview = () => {
    setLoading(prev => ({ ...prev, overview: true }));
    supabaseService.getAdminOverviewStats().then((stats) => {
      setOverviewStats(stats);
      setLoading(prev => ({ ...prev, overview: false }));
    });
  };

  // "Offres d'Emploi" admin tab — filters, sort, detail panel, moderation actions.
  const handleOpenJobDetail = async (id: string) => {
    setSelectedJobId(id);
    setJobDetailLoading(true);
    setJobDetail(null);
    try {
      setJobDetail(await supabaseService.getJobPostingAdminDetail(id));
    } catch (err) {
      console.error("Error loading job posting detail:", err);
    } finally {
      setJobDetailLoading(false);
    }
  };

  const handleJobSortClick = (field: "title" | "createdAt" | "applicationCount") => {
    if (jobSortField === field) {
      setJobSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setJobSortField(field);
      setJobSortDir(field === "title" ? "asc" : "desc");
    }
  };

  const handleAdminToggleJobStatus = async (jobId: string, currentStatus: "open" | "closed") => {
    setJobActionBusy(true);
    try {
      const nextStatus = currentStatus === "open" ? "closed" : "open";
      await supabaseService.setJobPostingStatus(jobId, nextStatus);
      setJobPostingsAdmin((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: nextStatus } : j)));
      setJobDetail((prev: any) => (prev ? { ...prev, status: nextStatus } : prev));
    } catch (err: any) {
      alert(lang === "fr" ? `Erreur : ${err?.message || err}` : `Error: ${err?.message || err}`);
    } finally {
      setJobActionBusy(false);
    }
  };

  const handleAdminDeleteJob = async (jobId: string) => {
    const confirmMsg = lang === "fr" ? "Supprimer définitivement cette offre d'emploi ?" : "Permanently delete this job posting?";
    if (!window.confirm(confirmMsg)) return;
    setJobActionBusy(true);
    try {
      await supabaseService.deleteJobPosting(jobId);
      setJobPostingsAdmin((prev) => prev.filter((j) => j.id !== jobId));
      setSelectedJobId(null);
      setJobDetail(null);
    } catch (err: any) {
      alert(lang === "fr" ? `Erreur : ${err?.message || err}` : `Error: ${err?.message || err}`);
    } finally {
      setJobActionBusy(false);
    }
  };

  const filteredJobPostings = useMemo(() => {
    let list = jobPostingsAdmin.filter((j) => {
      if (jobFilterStatus !== "ALL" && j.status !== jobFilterStatus) return false;
      if (jobFilterCategory !== "ALL" && j.categorySlug !== jobFilterCategory) return false;
      if (jobFilterEmploymentType !== "ALL" && j.employmentType !== jobFilterEmploymentType) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const haystack = `${j.title} ${j.posterName} ${j.companyName || ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (jobSortField === "title") cmp = a.title.localeCompare(b.title);
      else if (jobSortField === "createdAt") cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      else if (jobSortField === "applicationCount") cmp = a.applicationCount - b.applicationCount;
      return jobSortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [jobPostingsAdmin, jobFilterStatus, jobFilterCategory, jobFilterEmploymentType, searchQuery, jobSortField, jobSortDir]);

  // "Profils Professionnels" admin tab — filter, detail panel, moderation action.
  const handleOpenProfDetail = async (userId: string) => {
    setSelectedProfUserId(userId);
    setProfDetailLoading(true);
    setProfDetail(null);
    try {
      setProfDetail(await supabaseService.getProfessionalProfileAdminDetail(userId));
    } catch (err) {
      console.error("Error loading professional profile detail:", err);
    } finally {
      setProfDetailLoading(false);
    }
  };

  const handleAdminDeleteProfile = async (userId: string) => {
    const confirmMsg = lang === "fr"
      ? "Supprimer définitivement ce profil professionnel ?"
      : "Permanently delete this professional profile?";
    if (!window.confirm(confirmMsg)) return;
    setProfActionBusy(true);
    try {
      await supabaseService.deleteProfessionalProfile(userId);
      setProfessionalProfilesAdmin((prev) => prev.filter((p) => p.userId !== userId));
      setSelectedProfUserId(null);
      setProfDetail(null);
    } catch (err: any) {
      alert(lang === "fr" ? `Erreur : ${err?.message || err}` : `Error: ${err?.message || err}`);
    } finally {
      setProfActionBusy(false);
    }
  };

  const filteredProfessionalProfiles = useMemo(() => {
    return professionalProfilesAdmin.filter((p) => {
      if (profFilterAvailability !== "ALL" && p.availabilityStatus !== profFilterAvailability) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!`${p.fullName} ${p.headline}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [professionalProfilesAdmin, profFilterAvailability, searchQuery]);

  // Account operations
  const handleToggleSuspension = async (userId: string, isSuspended: boolean) => {
    try {
      const res = await fetch(`/api/admin/accounts/${userId}/suspend`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAdminHeaders()) },
        body: JSON.stringify({ suspend: !isSuspended }),
      });
      if (res.ok) {
        setAccounts(prev => prev.map(acc => acc.id === userId ? { ...acc, isSuspended: !isSuspended } : acc));
        onRefreshProviders();
      }
    } catch (err) {
      console.error("Error toggling suspension:", err);
    }
  };

  const handleMakeAdmin = async (userId: string) => {
    if (!window.confirm("Rendre cet utilisateur Administrateur ?")) return;
    try {
      const res = await fetch(`/api/admin/accounts/${userId}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAdminHeaders()) },
        body: JSON.stringify({ role: "admin" }),
      });
      if (res.ok) {
        setAccounts(prev => prev.map(acc => acc.id === userId ? { ...acc, role: "admin" } : acc));
      }
    } catch (err) {
      console.error("Error setting admin role:", err);
    }
  };

  // Provider Custom Editing & Deleting
  const handleStartEdit = (acc: any) => {
    const prov = providers.find(p => p.id === acc.id);
    if (prov) {
      setEditingProvider(prov);
      setEditName(prov.name);
      setEditBusinessName(prov.businessName || "");
      setEditPhone(prov.phone);
      setEditCategory(prov.category);
      setEditNeighborhood(prov.neighborhoodId);
      setEditRate(prov.rateFCFA);
      setEditRateUnit(prov.rateUnit || "jour");
      setEditDescription(prov.description);
      setEditLanguages(prov.languages || ["FR"]);
      setEditVerified(!!prov.verified);
    } else {
      alert(lang === "fr" ? "Cet utilisateur n'est pas répertorié comme prestataire." : "This user is not registered as a provider.");
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProvider) return;
    try {
      // Item 2 fix: this used to also call supabaseService.updateProvider(), which targeted a
      // table literally named "providers" that was never created (404 every time). Since it threw
      // BEFORE the real API call below, every provider edit through this dashboard failed with a
      // generic "Erreur réseau" and never actually reached /api/admin/providers/:id/edit at all.
      // Removed — this endpoint is the real, working update path.
      const res = await fetch(`/api/admin/providers/${editingProvider.id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAdminHeaders()) },
        body: JSON.stringify({
          name: editName.trim(),
          businessName: editBusinessName.trim(),
          phone: editPhone.trim(),
          category: editCategory,
          neighborhoodId: editNeighborhood,
          rateFCFA: editRate,
          rateUnit: editRateUnit,
          description: editDescription.trim(),
          languages: editLanguages,
          verified: editVerified
        }),
      });
      if (res.ok) {
        setEditingProvider(null);
        alert(lang === "fr" ? "Prestataire modifié avec succès !" : "Provider updated successfully!");
        onRefreshProviders();
        fetchData();
      } else {
        alert("Erreur lors de la modification");
      }
    } catch (err) {
      console.error(err);
      alert("Erreur réseau");
    }
  };

  const handleDeleteProvider = async (providerId: string) => {
    if (!window.confirm(lang === "fr" ? "Voulez-vous vraiment supprimer ce prestataire définitivement ?" : "Are you sure you want to delete this provider permanently?")) return;
    try {
      // Item 2 fix: this used to also call supabaseService.deleteProvider(), targeting the same
      // nonexistent "providers" table (see handleSaveEdit above) — every delete failed with
      // "Erreur réseau" before ever reaching the real endpoint below. Removed.
      const res = await fetch(`/api/admin/providers/${providerId}`, {
        method: "DELETE",
        headers: await getAdminHeaders(),
      });
      if (res.ok) {
        alert(lang === "fr" ? "Prestataire supprimé avec succès !" : "Provider deleted successfully!");
        onRefreshProviders();
        fetchData();
      } else {
        alert("Erreur lors de la suppression");
      }
    } catch (err) {
      console.error(err);
      alert("Erreur réseau");
    }
  };

  // Category operations
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");
    if (!newCatNameFR.trim() || !newCatNameEN.trim() || !newCatSlug.trim()) {
      setFormError("Veuillez remplir tous les champs.");
      return;
    }
    try {
      const res = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAdminHeaders()) },
        body: JSON.stringify({
          nameFR: newCatNameFR.trim(),
          nameEN: newCatNameEN.trim(),
          slug: newCatSlug.trim(),
          icon: newCatIcon.trim() || "Sprout"
        }),
      });
      if (res.ok) {
        const updatedCats = await res.json();
        setCategories(updatedCats);
        setFormSuccess("Catégorie créée avec succès !");
        setNewCatNameFR("");
        setNewCatNameEN("");
        setNewCatSlug("");
        setNewCatIcon("");
        onRefreshProviders();
      } else {
        const data = await res.json();
        setFormError(data.error || "Une erreur est survenue.");
      }
    } catch (err) {
      console.error(err);
      setFormError("Impossible de se connecter au serveur.");
    }
  };

  const handleMergeCategories = async (e: React.FormEvent) => {
    e.preventDefault();
    setMergeError("");
    setMergeSuccess("");
    if (!sourceSlug || !targetSlug) {
      setMergeError("Sélectionnez la catégorie source et la catégorie cible.");
      return;
    }
    if (sourceSlug === targetSlug) {
      setMergeError("La catégorie cible doit être différente de la source.");
      return;
    }
    if (!window.confirm(`Êtes-vous sûr de vouloir fusionner ${sourceSlug} vers ${targetSlug} ? Tous les prestataires seront ré-assignés.`)) {
      return;
    }

    try {
      const res = await fetch("/api/admin/categories/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAdminHeaders()) },
        body: JSON.stringify({ sourceSlug, targetSlug }),
      });
      if (res.ok) {
        const data = await res.json();
        setMergeSuccess(data.message || "Catégories fusionnées !");
        fetchData();
        onRefreshProviders();
      } else {
        const data = await res.json();
        setMergeError(data.error || "Échec de la fusion.");
      }
    } catch (err) {
      console.error(err);
      setMergeError("Erreur réseau lors de la fusion.");
    }
  };

  // Booking operations
  const handleForceBookingStatus = async (bookingId: string, status: "COMPLETED" | "CANCELLED") => {
    const actionLabel = status === "COMPLETED" ? "Terminer de force" : "Annuler de force";
    if (!window.confirm(`${actionLabel} cette réservation ?`)) return;

    try {
      const endpoint = status === "COMPLETED" 
        ? `/api/bookings/${bookingId}/confirm-completion` 
        : `/api/bookings/${bookingId}/status`;
        
      const body = status === "COMPLETED"
        ? { role: "admin" }
        : { status: "CANCELLED" };

      const res = await fetch(endpoint, {
        method: status === "COMPLETED" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setBookingsList(prev => prev.map(b => b.id === bookingId ? { ...b, status } : b));
        alert("Action appliquée avec succès !");
      }
    } catch (err) {
      console.error("Error updating dispute status:", err);
    }
  };

  // Moderation operations
  const handleModerateReview = async (reviewId: string, action: "keep" | "delete") => {
    if (!window.confirm(`Voulez-vous vraiment ${action === "delete" ? "supprimer" : "conserver"} cet avis ?`)) return;

    try {
      const res = await fetch(`/api/reviews/${reviewId}/moderation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setFlaggedReviews(prev => prev.filter(r => r.id !== reviewId));
        alert("Avis modéré avec succès.");
      }
    } catch (err) {
      console.error("Error moderating review:", err);
    }
  };

  // ID Approval operations — writes directly to service_providers.verification_status/is_verified
  // via Supabase (see supabaseService.verifyProvider), gated by the "Admins can update any service
  // provider" RLS policy. No longer syncs to the legacy in-memory /api/providers/:id/verify route.
  const handleAdminApprove = async (providerId: string) => {
    try {
      await supabaseService.verifyProvider(providerId, true);
      setPendingProviders(prev => prev.filter(p => p.id !== providerId));
      onRefreshProviders();
    } catch (err) {
      console.error("Error approving provider:", err);
    }
  };

  const handleAdminReject = async (providerId: string, reason: string) => {
    try {
      await supabaseService.verifyProvider(providerId, false, reason);
      setPendingProviders(prev => prev.filter(p => p.id !== providerId));
      onRefreshProviders();
    } catch (err) {
      console.error("Error rejecting provider:", err);
    }
  };

  // Category suggestion operations — approving creates a real service_categories row and links
  // the originally-submitting provider to it; rejecting just closes the suggestion out.
  const handleReviewSuggestion = async (suggestion: any, approve: boolean) => {
    const confirmMsg = approve
      ? (lang === "fr" ? `Créer la catégorie "${suggestion.categoryName}" et l'attribuer au prestataire ?` : `Create category "${suggestion.categoryName}" and assign it to the provider?`)
      : (lang === "fr" ? "Rejeter cette suggestion de catégorie ?" : "Reject this category suggestion?");
    if (!window.confirm(confirmMsg)) return;

    try {
      await supabaseService.reviewCategorySuggestion(suggestion.id, approve, {
        categoryName: suggestion.categoryName,
        providerId: suggestion.providerId,
      });
      setCategorySuggestions(prev => prev.filter(s => s.id !== suggestion.id));
      onRefreshProviders();
    } catch (err: any) {
      // Surfaces the real Postgrest/Supabase error (which step failed + message/code/details/hint —
      // see reviewCategorySuggestion's describeError) instead of a one-size-fits-all alert that
      // hides what actually broke.
      console.error("Error reviewing category suggestion:", err);
      const detail = err?.message || String(err);
      alert(
        lang === "fr"
          ? `Erreur lors du traitement de la suggestion : ${detail}`
          : `Error processing the suggestion: ${detail}`
      );
    }
  };

  const handleModerateAd = async (adId: string, action: "approve" | "reject") => {
    let reason = "";
    if (action === "reject") {
      const input = prompt(lang === "fr" ? "Raison du rejet de la publicité ?" : "Reason for ad campaign rejection?");
      if (input === null) return; // cancelled
      reason = input || "Le contenu de la publicité ne respecte pas nos critères d'approbation.";
    } else {
      if (!window.confirm(lang === "fr" ? "Approuver cette publicité pour mise en ligne ?" : "Approve this ad and launch the campaign live?")) return;
    }

    try {
      const res = await fetch(`/api/admin/promoted-ads/${adId}/moderate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAdminHeaders()) },
        body: JSON.stringify({ action, reason }),
      });
      if (res.ok) {
        alert(lang === "fr" ? "Campagne publicitaire mise à jour !" : "Ad campaign updated!");
        const updated = await fetch("/api/admin/promoted-ads", { headers: await getAdminHeaders() });
        if (updated.ok) setPromotedAdsList(await updated.json());
      } else {
        alert("Erreur lors de la mise à jour");
      }
    } catch (err) {
      console.error("Error moderating ad:", err);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Admin Title / Hero banner */}
      <div className="bg-gradient-to-br from-[#241611] via-[#7A3420] to-[#241611] text-amber-50 rounded-3xl p-6 sm:p-8 border border-[#7A3420]/40 shadow-md space-y-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#E3A23D]/15 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-28 h-28 bg-[#3E8467]/15 rounded-full blur-3xl -ml-10 -mb-10 pointer-events-none" />
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-[#F2B355]" />
              <h2 className="text-lg font-black uppercase tracking-wider text-[#F2B355]">
                {lang === "fr" ? "Console de Supervision Globale — Bertoua" : "Global Supervision Console — Bertoua"}
              </h2>
            </div>
            <p className="text-xs font-serif text-amber-100/90 max-w-2xl">
              {lang === "fr"
                ? "Gérez les validations d'identité, la modération de commentaires abusifs, la résolution de litiges et l'architecture des métiers de Bertoua."
                : "Manage merchant identity compliance, moderation of reported abusive reviews, settlement of trade disputes, and trade category architectures."}
            </p>
          </div>

          <button
            onClick={onOpenWizard}
            className="bg-[#E3A23D] hover:bg-[#F2B355] text-[#241611] font-black text-xs px-4 py-3 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors w-full sm:w-auto text-center justify-center"
          >
            <Plus className="w-4 h-4" />
            <span>{lang === "fr" ? "Enregistrer un Prestataire Hors-Ligne" : "Add Offline Provider"}</span>
          </button>
        </div>
      </div>

      {/* Tabs navigation menu */}
      <div className="flex overflow-x-auto gap-1 bg-amber-50/50 p-1 border border-amber-100 rounded-2xl">
        {[
          { id: "overview", labelFr: "Vue d'Ensemble", labelEn: "Overview", icon: LayoutDashboard },
          { id: "directory", labelFr: "Répertoire des Services", labelEn: "Services Directory", icon: Table2 },
          { id: "job_postings", labelFr: "Offres d'Emploi", labelEn: "Job Postings", icon: Briefcase },
          { id: "professional_profiles", labelFr: "Profils Professionnels", labelEn: "Professional Profiles", icon: UserCheck },
          { id: "id_approvals", labelFr: "Pièces d'Identité", labelEn: "ID Approvals", icon: ShieldCheck },
          { id: "accounts", labelFr: "Comptes Utilisateurs", labelEn: "User Accounts", icon: Users },
          { id: "categories", labelFr: "Métiers & Fusion", labelEn: "Categories & Merge", icon: FolderTree },
          { id: "category_suggestions", labelFr: "Suggestions de Métiers", labelEn: "Category Suggestions", icon: Sparkles },
          { id: "bookings", labelFr: "Litiges Réservations", labelEn: "Dispute Bookings", icon: BookOpen },
          { id: "moderation", labelFr: "Sécurité & Abus", labelEn: "Abuse Moderation", icon: AlertTriangle },
          { id: "promoted_ads", labelFr: "Sponsoring & Pubs", labelEn: "Sponsored Ads", icon: Megaphone },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as AdminTab)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer transition-colors whitespace-nowrap ${
                isActive
                  ? "bg-[#E3A23D] text-[#241611] shadow-sm"
                  : "text-amber-900 hover:bg-amber-100/60"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{lang === "fr" ? tab.labelFr : tab.labelEn}</span>
            </button>
          );
        })}
      </div>

      {/* SEARCH BAR / GLOBAL FILTER (except for tabs with their own filter UI) */}
      {activeTab !== "categories" && activeTab !== "moderation" && activeTab !== "category_suggestions" && activeTab !== "overview" && (
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={lang === "fr" ? "Filtrer par nom, téléphone, ID..." : "Filter by name, phone, ID..."}
            className="w-full bg-white border border-amber-200 rounded-2xl pl-11 pr-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-[#E3A23D]"
          />
          <Search className="w-4 h-4 text-amber-700 absolute left-4 top-1/2 -translate-y-1/2" />
        </div>
      )}

      {/* TAB CONTENTS */}

      {/* 0. VUE D'ENSEMBLE / OVERVIEW (Item 3) */}
      {activeTab === "overview" && (
        <motion.div key="overview" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-6">
          <div className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-black text-amber-950 text-sm uppercase">
                  {lang === "fr" ? "Vue d'Ensemble de la Plateforme" : "Platform Overview"}
                </h3>
                <p className="text-[11px] text-amber-800 font-serif">
                  {lang === "fr" ? "Statistiques en direct — actualisation automatique toutes les 60 secondes." : "Live statistics — auto-refreshes every 60 seconds."}
                </p>
              </div>
              <button
                onClick={handleRefreshOverview}
                disabled={loading["overview"]}
                className="flex items-center gap-1.5 bg-[#245C46] hover:bg-[#3E8467] text-white font-black text-[10px] uppercase px-3.5 py-2.5 rounded-xl transition-colors cursor-pointer disabled:opacity-50 shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading["overview"] ? "animate-spin" : ""}`} />
                <span>{lang === "fr" ? "Actualiser" : "Refresh"}</span>
              </button>
            </div>
          </div>

          {loading["overview"] && !overviewStats ? (
            <div className="text-center py-12 text-xs font-serif text-amber-800 flex items-center justify-center gap-1.5 bg-white border border-amber-100 rounded-3xl">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Chargement...</span>
            </div>
          ) : !overviewStats ? (
            <div className="text-center py-12 text-xs font-serif text-amber-800 border border-dashed border-amber-200 rounded-3xl bg-[#FAF8F5]">
              {lang === "fr" ? "Aucune donnée disponible (Supabase non configuré ?)." : "No data available (Supabase not configured?)."}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow">
                  <h4 className="font-black text-amber-950 text-xs uppercase mb-4">
                    {lang === "fr" ? "Prestataires par statut" : "Providers by Verification Status"}
                  </h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={[
                          { key: "pending", name: lang === "fr" ? "En attente" : "Pending", value: overviewStats.providersByStatus.pending },
                          { key: "approved", name: lang === "fr" ? "Approuvé" : "Approved", value: overviewStats.providersByStatus.approved },
                          { key: "rejected", name: lang === "fr" ? "Rejeté" : "Rejected", value: overviewStats.providersByStatus.rejected },
                        ]}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={2}
                      >
                        {["pending", "approved", "rejected"].map((key) => (
                          <Cell key={key} fill={STATUS_COLORS[key]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: "10px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow">
                  <h4 className="font-black text-amber-950 text-xs uppercase mb-4">
                    {lang === "fr" ? "Prestataires par métier" : "Providers per Category"}
                  </h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={overviewStats.providersByCategory.map((c: any) => ({ name: lang === "fr" ? c.nameFr : c.nameEn, count: c.count }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3E4C8" />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-25} textAnchor="end" height={60} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#E3A23D" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow lg:col-span-2">
                  <h4 className="font-black text-amber-950 text-xs uppercase mb-4">
                    {lang === "fr" ? "Nouvelles inscriptions (30 derniers jours)" : "New Registrations (Last 30 Days)"}
                  </h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={overviewStats.registrationsLast30Days.map((d: any) => ({ ...d, label: d.date.slice(5) }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3E4C8" />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={2} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="count" stroke="#245C46" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow">
                  <h4 className="font-black text-amber-950 text-xs uppercase mb-4">
                    {lang === "fr" ? "Réservations par statut" : "Bookings by Status"}
                  </h4>
                  {overviewStats.bookingsByStatus.length === 0 ? (
                    <div className="h-[220px] flex items-center justify-center text-xs text-amber-800/60 italic font-serif">
                      {lang === "fr" ? "Aucune réservation enregistrée." : "No bookings recorded yet."}
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={overviewStats.bookingsByStatus}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F3E4C8" />
                        <XAxis dataKey="status" tick={{ fontSize: 9 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {overviewStats.bookingsByStatus.map((entry: any, idx: number) => (
                            <Cell key={entry.status} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow">
                  <h4 className="font-black text-amber-950 text-xs uppercase mb-4">
                    {lang === "fr" ? "Distribution des notes (1-5 étoiles)" : "Rating Distribution (1-5 Stars)"}
                  </h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={overviewStats.ratingDistribution.map((r: any) => ({ name: `${r.stars}★`, count: r.count }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3E4C8" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#3E8467" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm space-y-3">
                  <h4 className="font-black text-amber-950 text-xs uppercase">
                    {lang === "fr" ? "Top 5 — Réservations" : "Top 5 — Bookings"}
                  </h4>
                  {overviewStats.topByBookings.length === 0 ? (
                    <p className="text-xs text-amber-800/60 italic font-serif">{lang === "fr" ? "Pas encore de données." : "No data yet."}</p>
                  ) : (
                    <ol className="space-y-2">
                      {overviewStats.topByBookings.map((p: any, idx: number) => (
                        <li key={p.id} className="flex items-center justify-between bg-[#FAF8F5] border border-amber-100 rounded-xl px-3.5 py-2.5 hover:bg-amber-50/60 transition-colors">
                          <span className="flex items-center gap-2.5 text-xs font-bold text-amber-950">
                            <span className="w-5 h-5 rounded-full bg-[#E3A23D] text-[#241611] text-[10px] font-black flex items-center justify-center shrink-0">{idx + 1}</span>
                            {p.businessName || p.name}
                          </span>
                          <span className="text-[11px] font-black text-amber-800 font-mono">{p.bookingsCount} {lang === "fr" ? "résa." : "bookings"}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                <div className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm space-y-3">
                  <h4 className="font-black text-amber-950 text-xs uppercase">
                    {lang === "fr" ? "Top 5 — Mieux notés" : "Top 5 — Highest Rated"}
                  </h4>
                  {overviewStats.topByRating.length === 0 ? (
                    <p className="text-xs text-amber-800/60 italic font-serif">{lang === "fr" ? "Pas encore d'avis." : "No reviews yet."}</p>
                  ) : (
                    <ol className="space-y-2">
                      {overviewStats.topByRating.map((p: any, idx: number) => (
                        <li key={p.id} className="flex items-center justify-between bg-[#FAF8F5] border border-amber-100 rounded-xl px-3.5 py-2.5 hover:bg-amber-50/60 transition-colors">
                          <span className="flex items-center gap-2.5 text-xs font-bold text-amber-950">
                            <span className="w-5 h-5 rounded-full bg-[#245C46] text-white text-[10px] font-black flex items-center justify-center shrink-0">{idx + 1}</span>
                            {p.businessName || p.name}
                          </span>
                          <span className="text-[11px] font-black text-amber-800 font-mono flex items-center gap-1">
                            <Star className="w-3 h-3 fill-[#E3A23D] text-[#E3A23D]" />
                            {p.averageRating.toFixed(1)} ({p.reviewCount})
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            </>
          )}
        </motion.div>
      )}

      {/* 0b. RÉPERTOIRE DES SERVICES (Item 1) */}
      {activeTab === "directory" && (
        <motion.div key="directory" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm space-y-5">
          <div>
            <h3 className="font-black text-amber-950 text-sm uppercase">
              {lang === "fr" ? "Répertoire des Services" : "Services Directory"}
            </h3>
            <p className="text-[11px] text-amber-800 font-serif">
              {lang === "fr" ? "Tous les prestataires enregistrés, quel que soit leur statut de vérification." : "Every registered provider, regardless of verification status."}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Catégorie" : "Category"}</label>
              <select
                value={dirFilterCategory}
                onChange={(e) => setDirFilterCategory(e.target.value)}
                className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-2.5 py-2 text-[11px] text-amber-950 focus:outline-none"
              >
                <option value="ALL">{lang === "fr" ? "Toutes" : "All"}</option>
                {directoryCategories.map((c) => (
                  <option key={c.slug} value={c.slug}>{lang === "fr" ? c.nameFr : c.nameEn}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Quartier" : "Neighborhood"}</label>
              <select
                value={dirFilterNeighborhood}
                onChange={(e) => setDirFilterNeighborhood(e.target.value)}
                className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-2.5 py-2 text-[11px] text-amber-950 focus:outline-none"
              >
                <option value="ALL">{lang === "fr" ? "Tous" : "All"}</option>
                {BERTOUA_NEIGHBORHOODS.map((n) => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Statut" : "Status"}</label>
              <select
                value={dirFilterStatus}
                onChange={(e) => setDirFilterStatus(e.target.value)}
                className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-2.5 py-2 text-[11px] text-amber-950 focus:outline-none"
              >
                <option value="ALL">{lang === "fr" ? "Tous" : "All"}</option>
                <option value="approved">{lang === "fr" ? "Approuvé" : "Approved"}</option>
                <option value="pending">{lang === "fr" ? "En attente" : "Pending"}</option>
                <option value="rejected">{lang === "fr" ? "Rejeté" : "Rejected"}</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Depuis le" : "From"}</label>
              <input
                type="date"
                value={dirDateFrom}
                onChange={(e) => setDirDateFrom(e.target.value)}
                className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-2.5 py-2 text-[11px] text-amber-950 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Jusqu'au" : "To"}</label>
              <input
                type="date"
                value={dirDateTo}
                onChange={(e) => setDirDateTo(e.target.value)}
                className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-2.5 py-2 text-[11px] text-amber-950 focus:outline-none"
              />
            </div>
          </div>

          {loading["directory"] ? (
            <div className="text-center py-12 text-xs font-serif text-amber-800 flex items-center justify-center gap-1.5">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Chargement...</span>
            </div>
          ) : filteredDirectory.length === 0 ? (
            <div className="text-center py-12 text-xs font-serif text-amber-800 border border-dashed border-amber-200 rounded-2xl bg-[#FAF8F5]">
              {lang === "fr" ? "Aucun prestataire ne correspond à ces filtres." : "No provider matches these filters."}
            </div>
          ) : (
            <div className="overflow-x-auto border border-amber-100 rounded-2xl">
              <table className="w-full text-left text-xs divide-y divide-amber-100">
                <thead className="bg-[#FAF8F5] text-amber-950 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3 cursor-pointer select-none" onClick={() => handleSortClick("name")}>
                      <span className="flex items-center gap-1">
                        {lang === "fr" ? "Nom de l'activité" : "Business Name"}
                        {dirSortField === "name" && (dirSortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </span>
                    </th>
                    <th className="px-4 py-3">{lang === "fr" ? "Catégorie" : "Category"}</th>
                    <th className="px-4 py-3">{lang === "fr" ? "Sous-métier" : "Subcategory"}</th>
                    <th className="px-4 py-3">{lang === "fr" ? "Quartier" : "Neighborhood"}</th>
                    <th className="px-4 py-3">{lang === "fr" ? "Ville" : "City"}</th>
                    <th className="px-4 py-3">{lang === "fr" ? "Statut" : "Status"}</th>
                    <th className="px-4 py-3 cursor-pointer select-none" onClick={() => handleSortClick("createdAt")}>
                      <span className="flex items-center gap-1">
                        {lang === "fr" ? "Créé le" : "Created"}
                        {dirSortField === "createdAt" && (dirSortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </span>
                    </th>
                    <th className="px-4 py-3 cursor-pointer select-none" onClick={() => handleSortClick("rating")}>
                      <span className="flex items-center gap-1">
                        {lang === "fr" ? "Note" : "Rating"}
                        {dirSortField === "rating" && (dirSortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-50">
                  {filteredDirectory.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => handleOpenDirectoryDetail(p.id)}
                      className="cursor-pointer hover:bg-amber-50/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-bold text-amber-950">{p.businessName || p.name}</td>
                      <td className="px-4 py-3 text-amber-900">{p.categoryDisplay || "—"}</td>
                      <td className="px-4 py-3 text-amber-800/80">{p.subcategoryDisplay || "—"}</td>
                      <td className="px-4 py-3 text-amber-900">{BERTOUA_NEIGHBORHOODS.find((n) => n.id === p.neighborhoodId)?.name || toTitleCase(p.neighborhoodId) || "—"}</td>
                      <td className="px-4 py-3 text-amber-900">{p.city}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          p.verificationStatus === "approved"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            : p.verificationStatus === "rejected"
                              ? "bg-rose-100 text-rose-800 border border-rose-200"
                              : "bg-amber-100 text-amber-800 border border-amber-200"
                        }`}>
                          {p.verificationStatus === "approved" ? (lang === "fr" ? "Approuvé" : "Approved")
                            : p.verificationStatus === "rejected" ? (lang === "fr" ? "Rejeté" : "Rejected")
                            : (lang === "fr" ? "En attente" : "Pending")}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-amber-800">{new Date(p.createdAt).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}</td>
                      <td className="px-4 py-3 font-mono text-amber-900">
                        <span className="flex items-center gap-1">
                          <Star className="w-3 h-3 fill-[#E3A23D] text-[#E3A23D]" />
                          {p.averageRating.toFixed(1)} <span className="text-amber-800/50">({p.reviewCount})</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}

      {/* 0c. OFFRES D'EMPLOI (Item 4) */}
      {activeTab === "job_postings" && (
        <motion.div key="job_postings" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm space-y-5">
          <div>
            <h3 className="font-black text-amber-950 text-sm uppercase">
              {lang === "fr" ? "Offres d'Emploi" : "Job Postings"}
            </h3>
            <p className="text-[11px] text-amber-800 font-serif">
              {lang === "fr" ? "Toutes les offres d'emploi, quel que soit leur statut." : "Every job posting, regardless of status."}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Statut" : "Status"}</label>
              <select
                value={jobFilterStatus}
                onChange={(e) => setJobFilterStatus(e.target.value)}
                className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-2.5 py-2 text-[11px] text-amber-950 focus:outline-none"
              >
                <option value="ALL">{lang === "fr" ? "Tous" : "All"}</option>
                <option value="open">{lang === "fr" ? "Ouverte" : "Open"}</option>
                <option value="closed">{lang === "fr" ? "Fermée" : "Closed"}</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Catégorie" : "Category"}</label>
              <select
                value={jobFilterCategory}
                onChange={(e) => setJobFilterCategory(e.target.value)}
                className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-2.5 py-2 text-[11px] text-amber-950 focus:outline-none"
              >
                <option value="ALL">{lang === "fr" ? "Toutes" : "All"}</option>
                {directoryCategories.map((c) => (
                  <option key={c.slug} value={c.slug}>{lang === "fr" ? c.nameFr : c.nameEn}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Type de contrat" : "Employment Type"}</label>
              <select
                value={jobFilterEmploymentType}
                onChange={(e) => setJobFilterEmploymentType(e.target.value)}
                className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-2.5 py-2 text-[11px] text-amber-950 focus:outline-none"
              >
                <option value="ALL">{lang === "fr" ? "Tous" : "All"}</option>
                <option value="full_time">{lang === "fr" ? "Temps plein" : "Full-time"}</option>
                <option value="part_time">{lang === "fr" ? "Temps partiel" : "Part-time"}</option>
                <option value="contract">{lang === "fr" ? "Contrat" : "Contract"}</option>
                <option value="gig">{lang === "fr" ? "Mission ponctuelle" : "Gig"}</option>
              </select>
            </div>
          </div>

          {loading["job_postings"] ? (
            <div className="text-center py-12 text-xs font-serif text-amber-800 flex items-center justify-center gap-1.5">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Chargement...</span>
            </div>
          ) : filteredJobPostings.length === 0 ? (
            <div className="text-center py-12 text-xs font-serif text-amber-800 border border-dashed border-amber-200 rounded-2xl bg-[#FAF8F5]">
              {lang === "fr" ? "Aucune offre ne correspond à ces filtres." : "No job posting matches these filters."}
            </div>
          ) : (
            <div className="overflow-x-auto border border-amber-100 rounded-2xl">
              <table className="w-full text-left text-xs divide-y divide-amber-100">
                <thead className="bg-[#FAF8F5] text-amber-950 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3 cursor-pointer select-none" onClick={() => handleJobSortClick("title")}>
                      <span className="flex items-center gap-1">
                        {lang === "fr" ? "Titre" : "Title"}
                        {jobSortField === "title" && (jobSortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </span>
                    </th>
                    <th className="px-4 py-3">{lang === "fr" ? "Publié par" : "Posted by"}</th>
                    <th className="px-4 py-3">{lang === "fr" ? "Catégorie" : "Category"}</th>
                    <th className="px-4 py-3">{lang === "fr" ? "Statut" : "Status"}</th>
                    <th className="px-4 py-3 cursor-pointer select-none" onClick={() => handleJobSortClick("applicationCount")}>
                      <span className="flex items-center gap-1">
                        {lang === "fr" ? "Candidatures" : "Applications"}
                        {jobSortField === "applicationCount" && (jobSortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </span>
                    </th>
                    <th className="px-4 py-3 cursor-pointer select-none" onClick={() => handleJobSortClick("createdAt")}>
                      <span className="flex items-center gap-1">
                        {lang === "fr" ? "Créée le" : "Created"}
                        {jobSortField === "createdAt" && (jobSortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-50">
                  {filteredJobPostings.map((j) => (
                    <tr key={j.id} onClick={() => handleOpenJobDetail(j.id)} className="cursor-pointer hover:bg-amber-50/50 transition-colors">
                      <td className="px-4 py-3 font-bold text-amber-950">{j.title}</td>
                      <td className="px-4 py-3 text-amber-900">{j.companyName || j.posterName || "—"}</td>
                      <td className="px-4 py-3 text-amber-800/80">
                        {j.categoryNameFr ? (lang === "fr" ? j.categoryNameFr : j.categoryNameEn) : (j.customCategory || "—")}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          j.status === "open"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            : "bg-neutral-100 text-neutral-700 border border-neutral-200"
                        }`}>
                          {j.status === "open" ? (lang === "fr" ? "Ouverte" : "Open") : (lang === "fr" ? "Fermée" : "Closed")}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-amber-900">{j.applicationCount}</td>
                      <td className="px-4 py-3 font-mono text-amber-800">{new Date(j.createdAt).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}

      {/* 0d. PROFILS PROFESSIONNELS (Item 4) */}
      {activeTab === "professional_profiles" && (
        <motion.div key="professional_profiles" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm space-y-5">
          <div>
            <h3 className="font-black text-amber-950 text-sm uppercase">
              {lang === "fr" ? "Profils Professionnels" : "Professional Profiles"}
            </h3>
            <p className="text-[11px] text-amber-800 font-serif">
              {lang === "fr" ? "Tous les profils, y compris ceux incomplets ou non publiés publiquement." : "Every profile, including incomplete ones not yet publicly visible."}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Disponibilité" : "Availability"}</label>
              <select
                value={profFilterAvailability}
                onChange={(e) => setProfFilterAvailability(e.target.value)}
                className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-2.5 py-2 text-[11px] text-amber-950 focus:outline-none"
              >
                <option value="ALL">{lang === "fr" ? "Toutes" : "All"}</option>
                <option value="open_to_work">{lang === "fr" ? "Ouvert aux opportunités" : "Open to work"}</option>
                <option value="employed">{lang === "fr" ? "En poste" : "Employed"}</option>
                <option value="not_looking">{lang === "fr" ? "Ne cherche pas" : "Not looking"}</option>
              </select>
            </div>
          </div>

          {loading["professional_profiles"] ? (
            <div className="text-center py-12 text-xs font-serif text-amber-800 flex items-center justify-center gap-1.5">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Chargement...</span>
            </div>
          ) : filteredProfessionalProfiles.length === 0 ? (
            <div className="text-center py-12 text-xs font-serif text-amber-800 border border-dashed border-amber-200 rounded-2xl bg-[#FAF8F5]">
              {lang === "fr" ? "Aucun profil ne correspond à ces filtres." : "No profile matches these filters."}
            </div>
          ) : (
            <div className="overflow-x-auto border border-amber-100 rounded-2xl">
              <table className="w-full text-left text-xs divide-y divide-amber-100">
                <thead className="bg-[#FAF8F5] text-amber-950 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">{lang === "fr" ? "Nom" : "Name"}</th>
                    <th className="px-4 py-3">{lang === "fr" ? "Titre" : "Headline"}</th>
                    <th className="px-4 py-3">{lang === "fr" ? "Disponibilité" : "Availability"}</th>
                    <th className="px-4 py-3">{lang === "fr" ? "CV" : "CV"}</th>
                    <th className="px-4 py-3">{lang === "fr" ? "Visible au public" : "Publicly visible"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-50">
                  {filteredProfessionalProfiles.map((p) => (
                    <tr key={p.userId} onClick={() => handleOpenProfDetail(p.userId)} className="cursor-pointer hover:bg-amber-50/50 transition-colors">
                      <td className="px-4 py-3 font-bold text-amber-950">{p.fullName || "—"}</td>
                      <td className="px-4 py-3 text-amber-900">{p.headline || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          p.availabilityStatus === "open_to_work"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            : p.availabilityStatus === "employed"
                              ? "bg-amber-100 text-amber-800 border border-amber-200"
                              : "bg-neutral-100 text-neutral-700 border border-neutral-200"
                        }`}>
                          {p.availabilityStatus === "open_to_work" ? (lang === "fr" ? "Ouvert" : "Open")
                            : p.availabilityStatus === "employed" ? (lang === "fr" ? "En poste" : "Employed")
                            : (lang === "fr" ? "Ne cherche pas" : "Not looking")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-amber-800/80">{p.hasCv ? (lang === "fr" ? "Oui" : "Yes") : "—"}</td>
                      <td className="px-4 py-3">
                        {p.isComplete ? (
                          <span className="text-emerald-800 text-[9px] font-black uppercase">{lang === "fr" ? "Oui" : "Yes"}</span>
                        ) : (
                          <span className="text-amber-800/60 text-[9px] font-black uppercase italic">{lang === "fr" ? "Incomplet" : "Incomplete"}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}

      {/* 1. ID APPROVALS QUEUE */}
      {activeTab === "id_approvals" && (
        <motion.div key="id_approvals" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm space-y-6">
          <div className="flex justify-between items-center border-b border-amber-50 pb-3">
            <div>
              <h3 className="font-black text-amber-950 text-sm uppercase">
                {lang === "fr" ? "File d'attente de conformité ID" : "ID Card Compliance Verification"}
              </h3>
              <p className="text-[11px] text-amber-800 font-serif">
                {lang === "fr" ? "Examinez les pièces d'identité nationales des marchands de Bertoua" : "Inspect national identity cards to verify local merchants"}
              </p>
            </div>
            <span className="bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1 rounded-full text-xs font-black font-mono">
              {pendingProviders.length} {lang === "fr" ? "En attente" : "Pending"}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingProviders.length === 0 ? (
              <div className="col-span-full text-center py-12 text-xs font-serif text-amber-800 border border-dashed border-amber-200 rounded-2xl bg-[#FAF8F5]">
                🎉 {lang === "fr" ? "Aucune pièce d'identité en attente de vérification !" : "No profiles pending identity validation!"}
              </div>
            ) : (
              pendingProviders
                .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.phone.includes(searchQuery))
                .map((p) => (
                  <div key={p.id} className="border border-amber-100 rounded-2xl p-4 bg-[#FAF8F5]/40 space-y-4 hover:shadow-md hover:border-amber-200 transition-all">
                    <div className="flex flex-wrap justify-between items-start gap-4">
                      <div className="space-y-1">
                        <h4 className="font-black text-amber-950 text-sm">{p.name}</h4>
                        <p className="text-[11px] text-amber-800 font-mono">WhatsApp/Phone: {p.phone}</p>
                        <p className="text-[11px] text-amber-800">
                          Quartier: <strong className="text-amber-950">{BERTOUA_NEIGHBORHOODS.find((n) => n.id === p.neighborhoodId)?.name || toTitleCase(p.neighborhoodId)}</strong>
                        </p>
                        {p.idNumber && (
                          <p className="text-[10px] font-mono bg-amber-100/70 text-amber-900 px-2.5 py-0.5 rounded inline-block border border-amber-200/50">
                            CNI N°: {p.idNumber}
                          </p>
                        )}
                        {p.created_by_admin && (
                          <span className="text-[9px] font-bold text-red-800 bg-red-50 px-1.5 py-0.5 rounded border border-red-100 ml-2">
                            Offline (Créé par l'Admin)
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] bg-amber-800 text-white font-bold px-2 py-1 rounded uppercase">
                          {p.category}
                        </span>
                        <p className="text-xs font-black text-amber-950 mt-1.5 font-mono">
                          {p.rateFCFA} F / {p.rateUnit}
                        </p>
                      </div>
                    </div>

                    <div className="border-t border-amber-100 pt-3 space-y-2">
                      <span className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
                        {lang === "fr" ? "Photos de la CNI Soumise :" : "National ID Image Validation :"}
                      </span>
                      
                      <div className="grid grid-cols-2 gap-3">
                        {p.idCardFrontUrl ? (
                          <div className="space-y-1">
                            <span className="text-[9px] text-amber-800 font-serif font-semibold">Recto (Devant)</span>
                            <img
                              src={p.idCardFrontUrl}
                              alt="ID Front"
                              className="w-full h-24 object-cover rounded-xl border border-amber-200 shadow-inner bg-white hover:scale-[1.02] transition-transform cursor-pointer"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        ) : (
                          <div className="h-24 bg-amber-100/40 rounded-xl flex items-center justify-center text-[10px] font-medium text-amber-800 italic">No Front Image</div>
                        )}

                        {p.idCardBackUrl ? (
                          <div className="space-y-1">
                            <span className="text-[9px] text-amber-800 font-serif font-semibold">Verso (Derrière)</span>
                            <img
                              src={p.idCardBackUrl}
                              alt="ID Back"
                              className="w-full h-24 object-cover rounded-xl border border-amber-200 shadow-inner bg-white hover:scale-[1.02] transition-transform cursor-pointer"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        ) : (
                          <div className="h-24 bg-amber-100/40 rounded-xl flex items-center justify-center text-[10px] font-medium text-amber-800 italic">No Back Image</div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2.5 pt-2">
                      <button
                        onClick={() => handleAdminApprove(p.id)}
                        className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs py-2.5 rounded-xl transition-all cursor-pointer shadow-sm text-center"
                      >
                        {lang === "fr" ? "Approuver (Rendre Public)" : "Approve & Verify Merchant"}
                      </button>
                      <button
                        onClick={() => {
                          const reason = prompt(lang === "fr" ? "Raison du rejet (obligatoire) ?" : "Rejection reason (required)?");
                          if (reason === null) return; // cancelled
                          if (!reason.trim()) {
                            alert(lang === "fr" ? "Une raison de rejet est requise." : "A rejection reason is required.");
                            return;
                          }
                          handleAdminReject(p.id, reason.trim());
                        }}
                        className="px-4 py-2.5 border border-red-200 text-red-800 hover:bg-red-50 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                      >
                        {lang === "fr" ? "Rejeter" : "Reject"}
                      </button>
                    </div>
                  </div>
                ))
            )}
          </div>
        </motion.div>
      )}

      {/* 2. USER ACCOUNTS MANAGEMENT */}
      {activeTab === "accounts" && (
        <motion.div key="accounts" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm space-y-4">
          <h3 className="font-black text-amber-950 text-sm uppercase">
            {lang === "fr" ? "Annuaire des membres inscrits" : "Directory of Registered Members"}
          </h3>

          {loading["accounts"] ? (
            <div className="text-center py-12 text-xs font-serif text-amber-800 flex items-center justify-center gap-1.5">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Chargement...</span>
            </div>
          ) : (
            <div className="overflow-x-auto border border-amber-100 rounded-2xl">
              <table className="w-full text-left text-xs divide-y divide-amber-100">
                <thead className="bg-[#FAF8F5] text-amber-950 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Utilisateur</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Rôle</th>
                    <th className="px-4 py-3">Statut CNI / Vérif.</th>
                    <th className="px-4 py-3">Code Parrainage</th>
                    <th className="px-4 py-3">Solde MoMo</th>
                    <th className="px-4 py-3 text-right">Actions de modération</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-50">
                  {accounts
                    .filter(acc => 
                      acc.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                      acc.phone?.includes(searchQuery) || 
                      acc.email?.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map((acc) => {
                      const pObj = providers.find(p => p.id === acc.id);
                      return (
                        <tr key={acc.id} className={`hover:bg-amber-50/40 transition-colors ${acc.isSuspended ? "bg-rose-50/40" : ""}`}>
                          <td className="px-4 py-3">
                            <div className="font-bold text-amber-950 flex items-center gap-1.5">
                              {acc.fullName || <span className="italic text-amber-800/50">Non renseigné</span>}
                              {acc.isSuspended && (
                                <span className="bg-rose-100 text-rose-800 text-[8px] font-bold uppercase px-1 py-0.5 rounded">Suspendu</span>
                              )}
                            </div>
                            <span className="text-[10px] text-amber-800/60 block font-mono">UID: {acc.id}</span>
                          </td>
                          <td className="px-4 py-3 font-mono space-y-0.5">
                            {acc.phone && <div className="text-amber-950">{acc.phone}</div>}
                            {acc.email && <div className="text-amber-800/80">{acc.email}</div>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                              acc.role === "admin"
                                ? "bg-[#245C46]/10 text-[#245C46]"
                                : acc.role === "provider"
                                  ? "bg-amber-100 text-amber-900"
                                  : "bg-neutral-100 text-neutral-800"
                            }`}>
                              {acc.role}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {acc.role === "provider" && pObj ? (
                              <div className="flex flex-col gap-1">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase text-center w-max ${
                                  pObj.verified 
                                    ? "bg-emerald-100 text-emerald-800 border border-emerald-200" 
                                    : pObj.status === "rejected"
                                      ? "bg-rose-100 text-rose-800 border border-rose-200"
                                      : "bg-amber-100 text-amber-800 border border-amber-200"
                                }`}>
                                  {pObj.verified 
                                    ? (lang === "fr" ? "Vérifié" : "Verified")
                                    : pObj.status === "rejected"
                                      ? (lang === "fr" ? "Rejeté" : "Rejected")
                                      : (lang === "fr" ? "En attente" : "Pending")}
                                </span>
                                {pObj.status === "rejected" && pObj.rejectionReason && (
                                  <span className="text-[9px] text-red-700 italic font-serif">
                                    {pObj.rejectionReason}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-amber-800/40 font-mono">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-amber-950 font-bold">{acc.referralCode || "—"}</td>
                          <td className="px-4 py-3 font-mono font-black text-amber-900">{acc.rewardsCredit || 0} F</td>
                          <td className="px-4 py-3 text-right space-x-2">
                            {acc.role === "provider" && (
                              <>
                                <button
                                  onClick={() => handleStartEdit(acc)}
                                  className="px-2 py-1 text-[10px] font-black bg-blue-50 border border-blue-200 text-blue-900 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
                                >
                                  {lang === "fr" ? "Modifier" : "Edit"}
                                </button>
                                <button
                                  onClick={() => handleDeleteProvider(acc.id)}
                                  className="px-2 py-1 text-[10px] font-black bg-rose-50 border border-rose-200 text-rose-900 rounded-lg hover:bg-rose-100 transition-colors cursor-pointer"
                                >
                                  {lang === "fr" ? "Supprimer" : "Delete"}
                                </button>
                                {pObj && (
                                  <a
                                    href={`https://wa.me/${(pObj.whatsappNumber || pObj.phone).replace(/[\s+]/g, "")}?text=${encodeURIComponent(
                                      lang === "fr"
                                        ? `Bonjour ${pObj.name}, je suis l'administrateur de la plateforme One Village Bertoua. Je vous contacte concernant votre compte prestataire.`
                                        : `Hello ${pObj.name}, I am the administrator of the One Village Bertoua platform. I am contacting you regarding your provider account.`
                                    )}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center px-2 py-1 text-[10px] font-black bg-emerald-100 border border-emerald-300 text-emerald-950 rounded-lg hover:bg-emerald-200 transition-colors"
                                  >
                                    WhatsApp
                                  </a>
                                )}
                                {pObj && !pObj.verified && (
                                  <button
                                    onClick={() => handleAdminApprove(acc.id)}
                                    className="px-2 py-1 text-[10px] font-black bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer"
                                  >
                                    {lang === "fr" ? "Approuver" : "Approve"}
                                  </button>
                                )}
                                {pObj && pObj.status !== "rejected" && (
                                  <button
                                    onClick={() => {
                                      const reason = prompt(lang === "fr" ? "Raison du rejet ?" : "Rejection reason?");
                                      if (reason !== null) {
                                        handleAdminReject(acc.id, reason || "Documents incorrects");
                                      }
                                    }}
                                    className="px-2 py-1 text-[10px] font-black bg-red-50 border border-red-200 text-red-900 rounded-lg hover:bg-red-100 transition-colors cursor-pointer"
                                  >
                                    {lang === "fr" ? "Rejeter" : "Reject"}
                                  </button>
                                )}
                              </>
                            )}
                            {acc.role !== "admin" && (
                              <button
                                onClick={() => handleMakeAdmin(acc.id)}
                                className="px-2 py-1 text-[10px] font-black bg-amber-50 border border-amber-200 text-amber-900 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer"
                              >
                                Rendre Admin
                              </button>
                            )}
                            <button
                              onClick={() => handleToggleSuspension(acc.id, !!acc.isSuspended)}
                              className={`px-2.5 py-1 text-[10px] font-black rounded-lg transition-colors cursor-pointer ${
                                acc.isSuspended 
                                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100" 
                                  : "bg-red-50 text-red-800 border border-red-200 hover:bg-red-100"
                              }`}
                            >
                              {acc.isSuspended ? "Débloquer" : "Suspendre"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}

      {/* 3. CATEGORY MANAGEMENT & MERGING */}
      {activeTab === "categories" && (
        <motion.div key="categories" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Add Category Form */}
          <div className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm space-y-4">
            <h3 className="font-black text-amber-950 text-sm uppercase">
              {lang === "fr" ? "Créer un nouveau métier local" : "Add New Service Category"}
            </h3>

            {formError && <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-xl text-xs font-bold">{formError}</div>}
            {formSuccess && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-xs font-bold">{formSuccess}</div>}

            <form onSubmit={handleAddCategory} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-amber-950 uppercase block">Nom en Français</label>
                <input
                  type="text"
                  required
                  value={newCatNameFR}
                  onChange={(e) => setNewCatNameFR(e.target.value)}
                  placeholder="ex: Coiffure & Beauté"
                  className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-950 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-amber-950 uppercase block">Nom en Anglais (English)</label>
                <input
                  type="text"
                  required
                  value={newCatNameEN}
                  onChange={(e) => setNewCatNameEN(e.target.value)}
                  placeholder="ex: Hairdressing & Beauty"
                  className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-950 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-amber-950 uppercase block">Identifiant unique (Slug)</label>
                  <input
                    type="text"
                    required
                    value={newCatSlug}
                    onChange={(e) => setNewCatSlug(e.target.value)}
                    placeholder="ex: hair"
                    className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-2.5 text-xs font-mono text-amber-950 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-amber-950 uppercase block">Nom de l'icône Lucide</label>
                  <input
                    type="text"
                    value={newCatIcon}
                    onChange={(e) => setNewCatIcon(e.target.value)}
                    placeholder="ex: Scissors"
                    className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-950 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-[#E3A23D] hover:bg-[#F2B355] text-[#241611] font-black text-xs py-3 rounded-xl cursor-pointer transition-colors"
              >
                Créer la catégorie
              </button>
            </form>
          </div>

          {/* Merge & Architecture Clean Up */}
          <div className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm space-y-4">
            <h3 className="font-black text-amber-950 text-sm uppercase">
              {lang === "fr" ? "Fusionner et réorganiser les catégories" : "Category Consolidation & Merging"}
            </h3>
            <p className="text-[11px] text-amber-800 font-serif leading-relaxed">
              {lang === "fr"
                ? "Si les villageois de Bertoua créent des catégories redondantes (ex: 'Moto-taxi' et 'Transport'), utilisez cet outil pour fusionner la source vers la cible. Tous les prestataires correspondants seront automatiquement migrés."
                : "Consolidate duplicate categories. All associated service providers and statistics will automatically be reassigned to the target category."}
            </p>

            {mergeError && <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-xl text-xs font-bold">{mergeError}</div>}
            {mergeSuccess && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-xs font-bold">{mergeSuccess}</div>}

            <form onSubmit={handleMergeCategories} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-amber-950 uppercase block">Catégorie SOURCE (À supprimer)</label>
                  <select
                    value={sourceSlug}
                    onChange={(e) => setSourceSlug(e.target.value)}
                    className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-950 focus:outline-none"
                  >
                    <option value="">-- Choisir --</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.slug}>{cat.nameFR} ({cat.slug})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-amber-950 uppercase block">Catégorie CIBLE (Conserver)</label>
                  <select
                    value={targetSlug}
                    onChange={(e) => setTargetSlug(e.target.value)}
                    className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-950 focus:outline-none"
                  >
                    <option value="">-- Choisir --</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.slug}>{cat.nameFR} ({cat.slug})</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-[#245C46] hover:bg-[#3E8467] text-white font-black text-xs py-3 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <Shuffle className="w-4 h-4" />
                <span>Exécuter la fusion solidaire</span>
              </button>
            </form>
          </div>

          {/* Current Category tree list */}
          <div className="col-span-full bg-white border border-amber-100 rounded-3xl p-6 shadow-sm space-y-4">
            <h3 className="font-black text-amber-950 text-sm uppercase">
              {lang === "fr" ? "Arborescence actuelle des métiers" : "Current Active Services Grid"}
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {categories.map((cat) => (
                <div key={cat.id} className="border border-amber-100 bg-[#FAF8F5]/50 p-3 rounded-xl flex items-center justify-between hover:border-amber-200 hover:shadow-sm transition-all">
                  <div className="space-y-0.5">
                    <span className="font-bold text-amber-950 text-xs">{cat.nameFR}</span>
                    <span className="text-[9px] text-amber-800/70 block font-mono">Slug: {cat.slug}</span>
                  </div>
                  {cat.isSuggested && (
                    <span className="bg-amber-100 text-amber-900 border border-amber-200 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded">Sug</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* 3b. CATEGORY SUGGESTIONS REVIEW QUEUE */}
      {activeTab === "category_suggestions" && (
        <motion.div key="category_suggestions" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="space-y-1">
            <h3 className="font-black text-amber-950 text-sm uppercase">
              {lang === "fr" ? "Suggestions de nouveaux métiers" : "New Category Suggestions"}
            </h3>
            <p className="text-[11px] text-amber-800 font-serif leading-relaxed">
              {lang === "fr"
                ? "Ces catégories ont été proposées par des prestataires lors de leur inscription (option « Autre »). Approuver crée le métier et l'attribue automatiquement au prestataire concerné."
                : "These categories were suggested by providers who picked \"Other\" during registration. Approving creates the category and links it back to that provider automatically."}
            </p>
          </div>

          {loading["category_suggestions"] ? (
            <div className="text-center py-12 text-xs font-serif text-amber-800 flex items-center justify-center gap-1.5">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Chargement...</span>
            </div>
          ) : categorySuggestions.length === 0 ? (
            <div className="text-center py-12 text-xs font-serif text-emerald-800 border border-dashed border-emerald-200 rounded-2xl bg-emerald-50/20">
              ✓ {lang === "fr" ? "Aucune suggestion en attente !" : "No pending suggestions!"}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {categorySuggestions.map((s) => (
                <div key={s.id} className="border border-amber-100 rounded-2xl p-4 bg-[#FAF8F5]/40 space-y-3 hover:shadow-md hover:border-amber-200 transition-all">
                  <div>
                    <h4 className="font-black text-amber-950 text-sm">{s.categoryName}</h4>
                    <p className="text-[11px] text-amber-800 font-serif mt-1">{s.description}</p>
                    <p className="text-[10px] text-amber-700 font-mono mt-1.5">
                      {lang === "fr" ? "Proposé par" : "Suggested by"}: {s.submitterName || "—"}
                    </p>
                  </div>
                  <div className="flex gap-2.5">
                    <button
                      onClick={() => handleReviewSuggestion(s, true)}
                      className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs py-2.5 rounded-xl transition-all cursor-pointer shadow-sm text-center"
                    >
                      {lang === "fr" ? "Approuver & Créer" : "Approve & Create"}
                    </button>
                    <button
                      onClick={() => handleReviewSuggestion(s, false)}
                      className="px-4 py-2.5 border border-red-200 text-red-800 hover:bg-red-50 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                    >
                      {lang === "fr" ? "Rejeter" : "Reject"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* 4. BOOKINGS MANAGEMENT & DISPUTES */}
      {activeTab === "bookings" && (
        <motion.div key="bookings" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="space-y-1">
            <h3 className="font-black text-amber-950 text-sm uppercase">
              {lang === "fr" ? "Supervision des réservations & Litiges" : "Booking Arbitration & Dispute Settlement"}
            </h3>
            <p className="text-[11px] text-amber-800 font-serif leading-relaxed">
              {lang === "fr"
                ? "En cas de désaccord entre le prestataire et le client sur l'état d'avancement d'un chantier à Bertoua, l'administrateur peut trancher le litige en forçant soit la complétion de la prestation (ce qui débloque les fonds Mobile Money), soit son annulation."
                : "Arbitrate disputes between clients and merchants. Admin has powers to force-complete a trade (disbursing Mobile Money escrow to merchant) or force-cancel."}
            </p>
          </div>

          {loading["bookings"] ? (
            <div className="text-center py-12 text-xs font-serif text-amber-800 flex items-center justify-center gap-1.5">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Chargement des réservations...</span>
            </div>
          ) : bookingsList.length === 0 ? (
            <div className="text-center py-12 text-xs font-serif text-amber-800 border border-dashed border-amber-200 rounded-2xl bg-[#FAF8F5]">
              Aucune réservation enregistrée dans le système.
            </div>
          ) : (
            <div className="space-y-3">
              {bookingsList
                .filter(b => 
                  b.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  b.providerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  b.id.includes(searchQuery)
                )
                .map((b) => (
                  <div key={b.id} className="border border-amber-100 rounded-2xl p-4 bg-[#FAF8F5]/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:shadow-md hover:border-amber-200 transition-all">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-amber-950 text-xs">Commande #{b.id}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                          b.status === "COMPLETED" 
                            ? "bg-neutral-100 text-neutral-800" 
                            : b.status === "PAID" 
                              ? "bg-emerald-100 text-emerald-800 animate-pulse border border-emerald-200" 
                              : "bg-amber-100 text-amber-800 border border-amber-200"
                        }`}>
                          {b.status}
                        </span>
                      </div>
                      <p className="text-xs text-amber-900 font-serif">
                        Client: <strong>{b.customerName}</strong> ({b.customerPhone}) → Prestataire: <strong>{b.providerName}</strong>
                      </p>
                      <p className="text-[10px] text-amber-800 font-mono">
                        Date: {b.scheduledDate} • Montant: <strong className="text-amber-950">{b.agreedRateFCFA || b.rateFCFA} F</strong>
                      </p>
                    </div>

                    <div className="flex gap-2 w-full md:w-auto">
                      {b.status === "PAID" && (
                        <>
                          <button
                            onClick={() => handleForceBookingStatus(b.id, "COMPLETED")}
                            className="flex-1 md:flex-none bg-emerald-700 hover:bg-emerald-800 text-white text-[10px] font-black uppercase px-3 py-2 rounded-xl cursor-pointer"
                          >
                            Forcer la complétion (Arbitrer en faveur du Prestataire)
                          </button>
                          <button
                            onClick={() => handleForceBookingStatus(b.id, "CANCELLED")}
                            className="flex-1 md:flex-none bg-red-800 hover:bg-red-900 text-white text-[10px] font-black uppercase px-3 py-2 rounded-xl cursor-pointer"
                          >
                            Forcer l'annulation (Arbitrer en faveur du Client)
                          </button>
                        </>
                      )}
                      
                      {b.status !== "PAID" && (
                        <span className="text-[10px] text-amber-800 italic">{lang === "fr" ? "Aucun litige d'engagement (Non payé par MoMo)" : "No escrow active"}</span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </motion.div>
      )}

      {/* 5. ABUSE MODERATION QUEUE */}
      {activeTab === "moderation" && (
        <motion.div key="moderation" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="space-y-1">
            <h3 className="font-black text-amber-950 text-sm uppercase">
              {lang === "fr" ? "File de modération des avis" : "Abuse & Profanity Moderation Queue"}
            </h3>
            <p className="text-[11px] text-amber-800 font-serif leading-relaxed">
              {lang === "fr"
                ? "Examinez les commentaires signalés automatiquement par notre filtre anti-abus ou nos dictionnaires de mots vulgaires. Vous pouvez supprimer un avis s'il viole la charte ou le valider pour le rendre visible."
                : "Audit public reviews that triggered profanity filters or was reported for abuse. Keep review if constructive, or permanently delete."}
            </p>
          </div>

          {loading["moderation"] ? (
            <div className="text-center py-12 text-xs font-serif text-amber-800 flex items-center justify-center gap-1.5">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Chargement de la modération...</span>
            </div>
          ) : flaggedReviews.length === 0 ? (
            <div className="text-center py-12 text-xs font-serif text-emerald-800 border border-dashed border-emerald-200 rounded-2xl bg-emerald-50/20">
              ✓ {lang === "fr" ? "Aucun commentaire suspect en attente de modération !" : "Compliance queue is fully clean! No flagged items."}
            </div>
          ) : (
            <div className="space-y-3">
              {flaggedReviews.map((rev) => (
                <div key={rev.id} className="border border-red-100 bg-red-50/10 rounded-2xl p-4 space-y-3 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start flex-wrap gap-2">
                    <div>
                      <span className="font-bold text-amber-950 text-xs">{rev.reviewerName}</span>
                      <span className="text-[10px] text-red-800 block font-mono">ID de l'avis: {rev.id}</span>
                    </div>

                    <div className="flex items-center gap-1 text-[10px] text-red-800 font-black uppercase bg-red-100/50 px-2.5 py-0.5 rounded border border-red-200/50">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{rev.flaggedReason || "Contenu Suspect / Profanité"}</span>
                    </div>
                  </div>

                  <p className="text-xs text-amber-950 bg-white/70 border border-amber-100 p-3.5 rounded-xl font-serif italic">
                    "{rev.text}"
                  </p>

                  <div className="flex gap-2 pt-1 justify-end">
                    <button
                      onClick={() => handleModerateReview(rev.id, "keep")}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white text-[10px] font-black uppercase px-3 py-2 rounded-xl cursor-pointer flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Autoriser l'avis (Valider)</span>
                    </button>
                    <button
                      onClick={() => handleModerateReview(rev.id, "delete")}
                      className="bg-red-800 hover:bg-red-900 text-white text-[10px] font-black uppercase px-3 py-2 rounded-xl cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Supprimer définitivement</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* 6. PROMOTED ADS / SPONSORING */}
      {activeTab === "promoted_ads" && (
        <motion.div key="promoted_ads" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm space-y-6">
          <div className="space-y-1">
            <h3 className="font-black text-amber-950 text-sm uppercase">
              {lang === "fr" ? "Modération & Suivi des Publicités Sponsors" : "Sponsorship & Promoted Ads Management"}
            </h3>
            <p className="text-[11px] text-amber-800 font-serif leading-relaxed">
              {lang === "fr"
                ? "Examinez les campagnes de promotion soumises par les prestataires de Bertoua. Après paiement Mobile Money, approuvez-les pour diffusion sur l'accueil ou les catégories."
                : "Approve or reject paid advertisement banners submitted by service providers. Once approved, ads go live in designated carousels."}
            </p>
          </div>

          {loading["promoted_ads"] ? (
            <div className="text-center py-12 text-xs font-serif text-amber-800 flex items-center justify-center gap-1.5">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Chargement des campagnes...</span>
            </div>
          ) : promotedAdsList.length === 0 ? (
            <div className="text-center py-12 text-xs font-serif text-amber-800 border border-dashed border-amber-200 rounded-2xl bg-amber-50/10">
              {lang === "fr" ? "Aucune campagne publicitaire enregistrée." : "No advertising campaigns submitted yet."}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Filter subheadings */}
              <div>
                <h4 className="text-xs font-bold text-amber-900 border-b border-amber-100 pb-1 uppercase mb-3 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  {lang === "fr" ? "Demandes de Sponsoring" : "Ad Campaign Submissions"}
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {promotedAdsList.map((ad) => (
                    <div key={ad.id} className="border border-amber-100 rounded-2xl bg-amber-50/10 p-4 flex flex-col justify-between space-y-4 hover:shadow-md hover:border-amber-200 transition-all">
                      <div className="space-y-3">
                        <div className="flex justify-between items-start flex-wrap gap-2">
                          <div>
                            <h5 className="font-black text-amber-950 text-xs">{ad.providerName}</h5>
                            <p className="text-[10px] text-amber-700 font-mono">Tél: {ad.providerPhone}</p>
                          </div>
                          
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${
                            ad.status === "approved" ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
                            ad.status === "pending_approval" ? "bg-amber-100 text-amber-800 border-amber-200" :
                            ad.status === "rejected" ? "bg-red-100 text-red-800 border-red-200" :
                            "bg-gray-100 text-gray-800 border-gray-200"
                          }`}>
                            {ad.status === "approved" ? (lang === "fr" ? "Actif / Diffusé" : "Live / Active") :
                             ad.status === "pending_approval" ? (lang === "fr" ? "Payé - En attente" : "Paid - Review") :
                             ad.status === "rejected" ? (lang === "fr" ? "Rejeté" : "Rejected") :
                             (lang === "fr" ? "En attente paiement" : "Unpaid / Draft")}
                          </span>
                        </div>

                        {/* Ad details */}
                        <div className="grid grid-cols-2 gap-2 text-[10px] bg-white border border-amber-100 p-2.5 rounded-xl font-mono">
                          <div>
                            <span className="text-amber-800 block">Placement:</span>
                            <span className="font-bold text-amber-950 uppercase">{ad.placement === "home" ? "Accueil (Carousel)" : ad.placement}</span>
                          </div>
                          <div>
                            <span className="text-amber-800 block">Budget Spend:</span>
                            <span className="font-bold text-red-800">{ad.budgetFCFA?.toLocaleString()} FCFA</span>
                          </div>
                          <div>
                            <span className="text-amber-800 block">Période:</span>
                            <span className="font-bold text-amber-950">{ad.startDate} / {ad.endDate}</span>
                          </div>
                          <div>
                            <span className="text-amber-800 block">Transaction MoMo:</span>
                            <span className="font-bold text-amber-950 text-[9px] truncate block" title={ad.momoTransactionId || "N/A"}>
                              {ad.momoTransactionId || "N/A"}
                            </span>
                          </div>
                        </div>

                        {/* Performance metrics */}
                        {ad.status === "approved" && (
                          <div className="grid grid-cols-2 gap-2 text-center text-[10px] bg-amber-50 border border-amber-200 p-2.5 rounded-xl font-mono">
                            <div>
                              <span className="text-amber-800 block">Impression/Vues</span>
                              <span className="font-bold text-amber-950 text-xs">{ad.impressions || 0}</span>
                            </div>
                            <div>
                              <span className="text-amber-800 block">Clics / Leads</span>
                              <span className="font-bold text-amber-950 text-xs">{ad.clicks || 0}</span>
                            </div>
                          </div>
                        )}

                        {/* Rejection comment */}
                        {ad.status === "rejected" && ad.rejectionReason && (
                          <p className="text-[10px] text-red-800 bg-red-50 border border-red-100 p-2 rounded-xl">
                            <strong>Motif du rejet:</strong> {ad.rejectionReason}
                          </p>
                        )}

                        {/* Image preview */}
                        <div className="border border-amber-100 rounded-xl overflow-hidden bg-amber-100/30">
                          <img 
                            src={ad.mediaUrl} 
                            alt="Preview Sponsor" 
                            className="w-full h-32 object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      </div>

                      {/* Admin moderation buttons */}
                      {ad.status === "pending_approval" && (
                        <div className="flex gap-2 pt-2 border-t border-amber-100">
                          <button
                            onClick={() => handleModerateAd(ad.id, "approve")}
                            className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white text-[10px] font-black uppercase py-2 rounded-xl cursor-pointer flex items-center justify-center gap-1 shadow-sm transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Approuver</span>
                          </button>
                          <button
                            onClick={() => handleModerateAd(ad.id, "reject")}
                            className="flex-1 bg-red-800 hover:bg-red-900 text-white text-[10px] font-black uppercase py-2 rounded-xl cursor-pointer flex items-center justify-center gap-1 shadow-sm transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Rejeter</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* DYNAMIC EDIT PROVIDER MODAL OVERLAY */}
      {editingProvider && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[999] overflow-y-auto animate-fade-in p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 border border-amber-100 shadow-2xl mx-auto my-8 space-y-6">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-amber-50 pb-4">
              <div>
                <h3 className="font-black text-amber-950 text-sm uppercase">
                  {lang === "fr" ? "Modifier la Fiche du Prestataire" : "Edit Provider Details"}
                </h3>
                <p className="text-[11px] text-amber-800 font-serif mt-1">
                  {lang === "fr" 
                    ? "Mettez à jour les coordonnées et les informations de service affichées dans l'application."
                    : "Update details and service criteria displayed inside the application."}
                </p>
              </div>
              <button
                onClick={() => setEditingProvider(null)}
                className="text-amber-800 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveEdit} className="space-y-5">
              
              {/* Name & Business Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-amber-950 uppercase block">
                    {lang === "fr" ? "Nom Complet" : "Full Name"}
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-amber-950 uppercase block">
                    {lang === "fr" ? "Nom de l'activité / Commerce" : "Business Name"}
                  </label>
                  <input
                    type="text"
                    value={editBusinessName}
                    onChange={(e) => setEditBusinessName(e.target.value)}
                    placeholder={lang === "fr" ? "ex: Coiffure de l'Est" : "ex: Hair Styling East"}
                    className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Phone & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-amber-950 uppercase block">
                    {lang === "fr" ? "Numéro de Téléphone (WhatsApp)" : "Phone (WhatsApp)"}
                  </label>
                  <input
                    type="text"
                    required
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-2.5 text-xs font-mono text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-amber-950 uppercase block">
                    {lang === "fr" ? "Métier / Catégorie Principale" : "Main Category"}
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.nameFR}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Neighborhood & Rate */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1 sm:col-span-1">
                  <label className="text-[10px] font-black text-amber-950 uppercase block">
                    {lang === "fr" ? "Quartier de Bertoua" : "Bertoua Neighborhood"}
                  </label>
                  <select
                    value={editNeighborhood}
                    onChange={(e) => setEditNeighborhood(e.target.value)}
                    className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    {BERTOUA_NEIGHBORHOODS.map((nh) => (
                      <option key={nh.id} value={nh.id}>
                        {nh.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-amber-950 uppercase block">
                    {lang === "fr" ? "Tarif Journalier (FCFA)" : "Daily Rate (FCFA)"}
                  </label>
                  <input
                    type="number"
                    value={editRate}
                    onChange={(e) => setEditRate(Number(e.target.value))}
                    className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-2.5 text-xs font-mono text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-amber-950 uppercase block">
                    {lang === "fr" ? "Unité du Tarif" : "Rate Unit"}
                  </label>
                  <select
                    value={editRateUnit}
                    onChange={(e) => setEditRateUnit(e.target.value)}
                    className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="jour">{lang === "fr" ? "Par jour" : "Per day"}</option>
                    <option value="heure">{lang === "fr" ? "Par heure" : "Per hour"}</option>
                    <option value="prestation">{lang === "fr" ? "Par prestation" : "Per service"}</option>
                  </select>
                </div>
              </div>

              {/* Description / Bio */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-amber-950 uppercase block">
                  {lang === "fr" ? "Description & Compétences" : "Description & Bio"}
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-500 font-serif"
                />
              </div>

              {/* Status and Verification checkbox */}
              <div className="flex items-center gap-2 bg-[#FAF8F5] border border-amber-100 p-4 rounded-2xl">
                <input
                  type="checkbox"
                  id="editVerifiedCheckbox"
                  checked={editVerified}
                  onChange={(e) => setEditVerified(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 border-amber-300 rounded focus:ring-emerald-500"
                />
                <label htmlFor="editVerifiedCheckbox" className="text-xs font-bold text-amber-950 cursor-pointer">
                  {lang === "fr" 
                    ? "Prestataire officiellement Vérifié par l'Administration (Affiche le badge doré)" 
                    : "Officially Verified Provider by Admin (Displays the golden badge)"}
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-3 border-t border-amber-50">
                <button
                  type="button"
                  onClick={() => setEditingProvider(null)}
                  className="flex-1 py-3 border border-amber-200 text-amber-900 font-bold text-xs rounded-xl hover:bg-amber-50 transition-colors cursor-pointer"
                >
                  {lang === "fr" ? "Annuler" : "Cancel"}
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-[#E3A23D] hover:bg-[#F2B355] text-[#241611] font-black text-xs rounded-xl shadow-md transition-colors cursor-pointer"
                >
                  {lang === "fr" ? "Enregistrer les modifications" : "Save Changes"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* PROVIDER DETAIL MODAL — Répertoire des Services row click (Item 2). Pulls only real
          columns from service_providers/profiles (see supabaseService.getProviderAdminDetail) — no
          "gender" field is shown because it doesn't exist anywhere in the schema or registration
          wizard; nothing here is fabricated. */}
      {selectedDirectoryId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[999] overflow-y-auto animate-fade-in p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 border border-amber-100 shadow-2xl mx-auto my-8 space-y-6"
          >
            <div className="flex justify-between items-start border-b border-amber-50 pb-4">
              <div>
                <h3 className="font-black text-amber-950 text-sm uppercase">
                  {lang === "fr" ? "Fiche Prestataire Complète" : "Full Provider Record"}
                </h3>
                {directoryDetail && (
                  <p className="text-[11px] text-amber-800 font-serif mt-1">
                    {directoryDetail.businessName || directoryDetail.name}
                  </p>
                )}
              </div>
              <button
                onClick={() => { setSelectedDirectoryId(null); setDirectoryDetail(null); }}
                className="text-amber-800 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>

            {detailLoading ? (
              <div className="text-center py-12 text-xs font-serif text-amber-800 flex items-center justify-center gap-1.5">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Chargement...</span>
              </div>
            ) : !directoryDetail ? (
              <div className="text-center py-12 text-xs font-serif text-red-800">
                {lang === "fr" ? "Impossible de charger la fiche de ce prestataire." : "Could not load this provider's record."}
              </div>
            ) : (
              <div className="space-y-5">
                {/* Status + quick actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-[#FAF8F5] border border-amber-100 rounded-2xl p-4">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    directoryDetail.verificationStatus === "approved"
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                      : directoryDetail.verificationStatus === "rejected"
                        ? "bg-rose-100 text-rose-800 border border-rose-200"
                        : "bg-amber-100 text-amber-800 border border-amber-200"
                  }`}>
                    {directoryDetail.verificationStatus === "approved" ? (lang === "fr" ? "Approuvé" : "Approved")
                      : directoryDetail.verificationStatus === "rejected" ? (lang === "fr" ? "Rejeté" : "Rejected")
                      : (lang === "fr" ? "En attente" : "Pending")}
                  </span>
                  <div className="flex gap-2">
                    {directoryDetail.verificationStatus !== "approved" && (
                      <button
                        onClick={async () => {
                          await handleAdminApprove(directoryDetail.id);
                          setSelectedDirectoryId(null);
                          setDirectoryDetail(null);
                          fetchData();
                        }}
                        className="bg-emerald-700 hover:bg-emerald-800 text-white font-black text-[10px] uppercase px-3 py-2 rounded-xl transition-colors cursor-pointer"
                      >
                        {lang === "fr" ? "Approuver" : "Approve"}
                      </button>
                    )}
                    {directoryDetail.verificationStatus !== "rejected" && (
                      <button
                        onClick={() => {
                          const reason = prompt(lang === "fr" ? "Raison du rejet ?" : "Rejection reason?");
                          if (reason === null) return;
                          handleAdminReject(directoryDetail.id, reason || "Documents incorrects");
                          setSelectedDirectoryId(null);
                          setDirectoryDetail(null);
                          fetchData();
                        }}
                        className="border border-red-200 text-red-800 hover:bg-red-50 font-bold text-[10px] uppercase px-3 py-2 rounded-xl transition-colors cursor-pointer"
                      >
                        {lang === "fr" ? "Rejeter" : "Reject"}
                      </button>
                    )}
                    {directoryDetail.whatsappNumber && (
                      <a
                        href={`https://wa.me/${directoryDetail.whatsappNumber.replace(/[\s+]/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-emerald-100 border border-emerald-300 text-emerald-950 font-black text-[10px] uppercase px-3 py-2 rounded-xl hover:bg-emerald-200 transition-colors"
                      >
                        WhatsApp
                      </a>
                    )}
                  </div>
                </div>

                {/* Contact / basic info — real columns only */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Nom complet" : "Full Name"}</span>
                    <p className="text-amber-900">{directoryDetail.name || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Téléphone" : "Phone"}</span>
                    <p className="text-amber-900 font-mono">{directoryDetail.phone || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-amber-950 uppercase block">WhatsApp</span>
                    <p className="text-amber-900 font-mono">{directoryDetail.whatsappNumber || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Langues parlées" : "Languages"}</span>
                    <p className="text-amber-900">{directoryDetail.languages?.length ? directoryDetail.languages.join(", ") : "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Ville / Quartier" : "City / Neighborhood"}</span>
                    <p className="text-amber-900">
                      {directoryDetail.city}, {BERTOUA_NEIGHBORHOODS.find((n) => n.id === directoryDetail.neighborhoodId)?.name || toTitleCase(directoryDetail.neighborhoodId)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Tarification" : "Pricing"}</span>
                    <p className="text-amber-900 font-mono">
                      {directoryDetail.hasFixedPricing
                        ? `${directoryDetail.basePrice?.toLocaleString()} ${directoryDetail.currency || "XAF"} / ${directoryDetail.rateUnit || "—"}`
                        : (lang === "fr" ? "Prix sur devis" : "Quote on request")}
                    </p>
                  </div>
                </div>

                {/* Categories */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Métiers déclarés" : "Declared Trades"}</span>
                  {directoryDetail.categories.length === 0 ? (
                    <p className="text-xs text-amber-800/60 italic font-serif">{lang === "fr" ? "Aucun (suggestion en attente probable)" : "None (likely a pending suggestion)"}</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {directoryDetail.categories.map((c: any, idx: number) => (
                        <span key={idx} className="bg-amber-50 border border-amber-200 text-amber-900 text-[10px] font-bold px-2.5 py-1 rounded-full">
                          {lang === "fr" ? c.nameFr : c.nameEn}{c.subcategory ? ` · ${c.subcategory}` : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bio / Description */}
                {directoryDetail.bio && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Bio (profil utilisateur)" : "Bio (user profile)"}</span>
                    <p className="text-xs text-amber-900 font-serif italic bg-[#FAF8F5] border border-amber-100 rounded-xl p-3">{directoryDetail.bio}</p>
                  </div>
                )}
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Description du service" : "Service Description"}</span>
                  <p className="text-xs text-amber-900 font-serif bg-[#FAF8F5] border border-amber-100 rounded-xl p-3">
                    {directoryDetail.descriptionFr || directoryDetail.descriptionEn || "—"}
                  </p>
                </div>

                {/* Rating summary */}
                <div className="flex items-center gap-2 text-xs">
                  <Star className="w-4 h-4 fill-[#E3A23D] text-[#E3A23D]" />
                  <span className="font-black text-amber-950">{directoryDetail.averageRating.toFixed(1)} / 5</span>
                  <span className="text-amber-800/60">({directoryDetail.reviewCount} {lang === "fr" ? "avis" : "reviews"})</span>
                  <span className="text-amber-800/40 ml-auto font-mono text-[10px]">
                    {lang === "fr" ? "Inscrit le" : "Registered on"} {new Date(directoryDetail.createdAt).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}
                  </span>
                </div>

                {/* Rejection reason if applicable */}
                {directoryDetail.rejectionReason && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl text-xs">
                    <strong>{lang === "fr" ? "Motif du rejet :" : "Rejection reason:"}</strong> {directoryDetail.rejectionReason}
                  </div>
                )}

                {/* ID Verification */}
                <div className="border-t border-amber-100 pt-4 space-y-2">
                  <span className="text-[10px] font-black text-amber-950 uppercase block">
                    {lang === "fr" ? "Vérification d'identité" : "ID Verification"}
                  </span>
                  {directoryDetail.idNumber && (
                    <p className="text-[10px] font-mono bg-amber-100/70 text-amber-900 px-2.5 py-0.5 rounded inline-block border border-amber-200/50">
                      CNI N°: {directoryDetail.idNumber}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    {directoryDetail.idCardFrontUrl ? (
                      <div className="space-y-1">
                        <span className="text-[9px] text-amber-800 font-serif font-semibold">Recto</span>
                        <img src={directoryDetail.idCardFrontUrl} alt="ID Front" className="w-full h-28 object-cover rounded-xl border border-amber-200 shadow-inner bg-white" referrerPolicy="no-referrer" />
                      </div>
                    ) : (
                      <div className="h-28 bg-amber-100/40 rounded-xl flex items-center justify-center text-[10px] font-medium text-amber-800 italic">
                        {lang === "fr" ? "Pas d'image" : "No Image"}
                      </div>
                    )}
                    {directoryDetail.idCardBackUrl ? (
                      <div className="space-y-1">
                        <span className="text-[9px] text-amber-800 font-serif font-semibold">Verso</span>
                        <img src={directoryDetail.idCardBackUrl} alt="ID Back" className="w-full h-28 object-cover rounded-xl border border-amber-200 shadow-inner bg-white" referrerPolicy="no-referrer" />
                      </div>
                    ) : (
                      <div className="h-28 bg-amber-100/40 rounded-xl flex items-center justify-center text-[10px] font-medium text-amber-800 italic">
                        {lang === "fr" ? "Pas d'image" : "No Image"}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* JOB POSTING DETAIL MODAL — "Offres d'Emploi" admin tab row click (Item 4). */}
      {selectedJobId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[999] overflow-y-auto animate-fade-in p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 border border-amber-100 shadow-2xl mx-auto my-8 space-y-5"
          >
            <div className="flex justify-between items-start border-b border-amber-50 pb-4">
              <div>
                <h3 className="font-black text-amber-950 text-sm uppercase">
                  {lang === "fr" ? "Détail de l'Offre d'Emploi" : "Job Posting Detail"}
                </h3>
                {jobDetail && <p className="text-[11px] text-amber-800 font-serif mt-1">{jobDetail.title}</p>}
              </div>
              <button
                onClick={() => { setSelectedJobId(null); setJobDetail(null); }}
                className="text-amber-800 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>

            {jobDetailLoading ? (
              <div className="text-center py-12 text-xs font-serif text-amber-800 flex items-center justify-center gap-1.5">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Chargement...</span>
              </div>
            ) : !jobDetail ? (
              <div className="text-center py-12 text-xs font-serif text-red-800">
                {lang === "fr" ? "Impossible de charger cette offre." : "Could not load this job posting."}
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 bg-[#FAF8F5] border border-amber-100 rounded-2xl p-4">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    jobDetail.status === "open"
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                      : "bg-neutral-100 text-neutral-700 border border-neutral-200"
                  }`}>
                    {jobDetail.status === "open" ? (lang === "fr" ? "Ouverte" : "Open") : (lang === "fr" ? "Fermée" : "Closed")}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAdminToggleJobStatus(jobDetail.id, jobDetail.status)}
                      disabled={jobActionBusy}
                      className="bg-amber-800 hover:bg-amber-900 text-white font-black text-[10px] uppercase px-3 py-2 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {jobDetail.status === "open" ? (lang === "fr" ? "Fermer" : "Close") : (lang === "fr" ? "Rouvrir" : "Reopen")}
                    </button>
                    <button
                      onClick={() => handleAdminDeleteJob(jobDetail.id)}
                      disabled={jobActionBusy}
                      className="border border-red-200 text-red-800 hover:bg-red-50 font-bold text-[10px] uppercase px-3 py-2 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {lang === "fr" ? "Supprimer" : "Delete"}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Publié par" : "Posted by"}</span>
                    <p className="text-amber-900">{jobDetail.posterName || "—"}{jobDetail.posterPhone ? ` · ${jobDetail.posterPhone}` : ""}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Entreprise" : "Company"}</span>
                    <p className="text-amber-900">{jobDetail.companyName || (lang === "fr" ? "Particulier" : "Individual")}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Catégorie" : "Category"}</span>
                    <p className="text-amber-900">
                      {jobDetail.categoryNameFr ? (lang === "fr" ? jobDetail.categoryNameFr : jobDetail.categoryNameEn) : (jobDetail.customCategory || "—")}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Type de contrat" : "Employment Type"}</span>
                    <p className="text-amber-900">{jobDetail.employmentType}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Quartier" : "Neighborhood"}</span>
                    <p className="text-amber-900">{jobDetail.neighborhoodId ? (BERTOUA_NEIGHBORHOODS.find((n) => n.id === jobDetail.neighborhoodId)?.name || toTitleCase(jobDetail.neighborhoodId)) : "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Salaire" : "Salary"}</span>
                    <p className="text-amber-900 font-mono">{jobDetail.salaryRange || "—"}</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Description" : "Description"}</span>
                  <p className="text-xs text-amber-900 font-serif bg-[#FAF8F5] border border-amber-100 rounded-xl p-3 whitespace-pre-line break-words">{jobDetail.description}</p>
                </div>

                <div className="flex items-center justify-between text-[10px] text-amber-800/70 font-mono">
                  <span>{jobDetail.applicationCount} {lang === "fr" ? "candidature(s)" : "application(s)"}</span>
                  <span>{lang === "fr" ? "Publiée le" : "Posted on"} {new Date(jobDetail.createdAt).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}</span>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* PROFESSIONAL PROFILE DETAIL MODAL — "Profils Professionnels" admin tab row click (Item 4). */}
      {selectedProfUserId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[999] overflow-y-auto animate-fade-in p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 border border-amber-100 shadow-2xl mx-auto my-8 space-y-5"
          >
            <div className="flex justify-between items-start border-b border-amber-50 pb-4">
              <div>
                <h3 className="font-black text-amber-950 text-sm uppercase">
                  {lang === "fr" ? "Détail du Profil Professionnel" : "Professional Profile Detail"}
                </h3>
                {profDetail && <p className="text-[11px] text-amber-800 font-serif mt-1">{profDetail.fullName}</p>}
              </div>
              <button
                onClick={() => { setSelectedProfUserId(null); setProfDetail(null); }}
                className="text-amber-800 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>

            {profDetailLoading ? (
              <div className="text-center py-12 text-xs font-serif text-amber-800 flex items-center justify-center gap-1.5">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Chargement...</span>
              </div>
            ) : !profDetail ? (
              <div className="text-center py-12 text-xs font-serif text-red-800">
                {lang === "fr" ? "Impossible de charger ce profil." : "Could not load this profile."}
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 bg-[#FAF8F5] border border-amber-100 rounded-2xl p-4">
                  <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
                    {profDetail.availabilityStatus === "open_to_work" ? (lang === "fr" ? "Ouvert aux opportunités" : "Open to work")
                      : profDetail.availabilityStatus === "employed" ? (lang === "fr" ? "En poste" : "Employed")
                      : (lang === "fr" ? "Ne cherche pas" : "Not looking")}
                  </span>
                  <div className="flex gap-2">
                    {profDetail.cvSignedUrl && (
                      <a
                        href={profDetail.cvSignedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 bg-[#245C46] hover:bg-[#3E8467] text-white font-black text-[10px] uppercase px-3 py-2 rounded-xl transition-colors cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        CV
                      </a>
                    )}
                    <button
                      onClick={() => handleAdminDeleteProfile(profDetail.userId)}
                      disabled={profActionBusy}
                      className="border border-red-200 text-red-800 hover:bg-red-50 font-bold text-[10px] uppercase px-3 py-2 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {lang === "fr" ? "Supprimer" : "Delete"}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Nom complet" : "Full Name"}</span>
                    <p className="text-amber-900">{profDetail.fullName || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Téléphone" : "Phone"}</span>
                    <p className="text-amber-900 font-mono">{profDetail.phone || "—"}</p>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <span className="text-[10px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Titre" : "Headline"}</span>
                    <p className="text-amber-900">{profDetail.headline || "—"}</p>
                  </div>
                  {profDetail.yearsExperience != null && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Expérience" : "Experience"}</span>
                      <p className="text-amber-900">{profDetail.yearsExperience} {lang === "fr" ? "an(s)" : "year(s)"}</p>
                    </div>
                  )}
                </div>

                {profDetail.skills.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Compétences" : "Skills"}</span>
                    <div className="flex flex-wrap gap-2">
                      {profDetail.skills.map((s: string) => (
                        <span key={s} className="bg-amber-50 border border-amber-200 text-amber-900 text-[10px] font-bold px-2.5 py-1 rounded-full">{s}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <span className="text-[10px] font-black text-amber-950 uppercase block">{lang === "fr" ? "Bio" : "Bio"}</span>
                  <p className="text-xs text-amber-900 font-serif bg-[#FAF8F5] border border-amber-100 rounded-xl p-3 whitespace-pre-line break-words">{profDetail.bio || "—"}</p>
                </div>

                <p className="text-[10px] text-amber-800/70 font-mono">
                  {lang === "fr" ? "Créé le" : "Created on"} {new Date(profDetail.createdAt).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}
                </p>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
