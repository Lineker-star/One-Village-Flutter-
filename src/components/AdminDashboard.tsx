import React, { useState, useEffect } from "react";
import { 
  Users, 
  FolderTree, 
  BookOpen, 
  AlertTriangle, 
  ShieldCheck, 
  Trash2, 
  Check, 
  X, 
  Lock, 
  Unlock, 
  RefreshCw, 
  Search, 
  Plus, 
  Shuffle, 
  ExternalLink,
  ShieldAlert,
  MapPin,
  MessageSquare,
  Megaphone
} from "lucide-react";
import { ServiceProvider } from "../types.ts";
import { BERTOUA_NEIGHBORHOODS } from "../data/bertouaData.ts";
import { supabaseService } from "../lib/supabase.ts";

interface AdminDashboardProps {
  lang: "fr" | "en";
  currentUser: any;
  providers: ServiceProvider[];
  onRefreshProviders: () => void;
  onOpenWizard: () => void;
}

type AdminTab = "accounts" | "categories" | "bookings" | "moderation" | "id_approvals" | "promoted_ads";

export default function AdminDashboard({ 
  lang, 
  currentUser, 
  providers, 
  onRefreshProviders,
  onOpenWizard
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>("id_approvals");
  
  // Data lists
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [bookingsList, setBookingsList] = useState<any[]>([]);
  const [flaggedReviews, setFlaggedReviews] = useState<any[]>([]);
  const [promotedAdsList, setPromotedAdsList] = useState<any[]>([]);
  
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

  // Interim admin auth header until real Supabase auth/JWT verification is wired up (see server.ts requireAdmin)
  const adminHeaders = { "x-user-role": currentUser?.role || "" };

  // Load section-specific data on tab switch
  const fetchData = async () => {
    setLoading(prev => ({ ...prev, [activeTab]: true }));
    try {
      if (activeTab === "accounts") {
        const res = await fetch("/api/admin/accounts", { headers: adminHeaders });
        if (res.ok) setAccounts(await res.json());
      } else if (activeTab === "categories") {
        const res = await fetch("/api/admin/categories", { headers: adminHeaders });
        if (res.ok) {
          const data = await res.json();
          setCategories(Array.isArray(data) ? data : (data.categories || []));
        }
      } else if (activeTab === "bookings") {
        const res = await fetch("/api/admin/bookings", { headers: adminHeaders });
        if (res.ok) setBookingsList(await res.json());
      } else if (activeTab === "moderation") {
        const res = await fetch("/api/admin/moderation", { headers: adminHeaders });
        if (res.ok) {
          const data = await res.json();
          setFlaggedReviews(Array.isArray(data) ? data : (data.flaggedReviews || []));
        }
      } else if (activeTab === "promoted_ads") {
        const res = await fetch("/api/admin/promoted-ads", { headers: adminHeaders });
        if (res.ok) setPromotedAdsList(await res.json());
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

  // Account operations
  const handleToggleSuspension = async (userId: string, isSuspended: boolean) => {
    try {
      const res = await fetch(`/api/admin/accounts/${userId}/suspend`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders },
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
        headers: { "Content-Type": "application/json", ...adminHeaders },
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
      // 1. Update in Supabase Directly
      await supabaseService.updateProvider(editingProvider.id, {
        name: editName.trim(),
        businessName: editBusinessName.trim(),
        phone: editPhone.trim(),
        category: editCategory as any,
        neighborhoodId: editNeighborhood,
        rateFCFA: editRate,
        rateUnit: editRateUnit,
        description: editDescription.trim(),
        languages: editLanguages,
        verified: editVerified,
        status: editVerified ? "approved" : "pending"
      });

      // 2. Synchronize memory state
      const res = await fetch(`/api/admin/providers/${editingProvider.id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders },
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
      // 1. Delete in Supabase Directly
      await supabaseService.deleteProvider(providerId);

      // 2. Synchronize memory state
      const res = await fetch(`/api/admin/providers/${providerId}`, {
        method: "DELETE",
        headers: adminHeaders,
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
        headers: { "Content-Type": "application/json", ...adminHeaders },
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
        headers: { "Content-Type": "application/json", ...adminHeaders },
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

  // ID Approval operations
  const handleAdminApprove = async (providerId: string) => {
    try {
      // 1. Update in Supabase Directly
      await supabaseService.verifyProvider(providerId, true);

      // 2. Sync to local memory
      const res = await fetch(`/api/providers/${providerId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve: true }),
      });
      if (res.ok) {
        onRefreshProviders();
      }
    } catch (err) {
      console.error("Error approving provider:", err);
    }
  };

  const handleAdminReject = async (providerId: string, reason: string) => {
    try {
      // 1. Update in Supabase Directly
      await supabaseService.verifyProvider(providerId, false, reason);

      // 2. Sync to local memory
      const res = await fetch(`/api/providers/${providerId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve: false, reason }),
      });
      if (res.ok) {
        onRefreshProviders();
      }
    } catch (err) {
      console.error("Error rejecting provider:", err);
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
        headers: { "Content-Type": "application/json", ...adminHeaders },
        body: JSON.stringify({ action, reason }),
      });
      if (res.ok) {
        alert(lang === "fr" ? "Campagne publicitaire mise à jour !" : "Ad campaign updated!");
        const updated = await fetch("/api/admin/promoted-ads", { headers: adminHeaders });
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
      <div className="bg-red-950 text-red-50 rounded-3xl p-6 sm:p-8 border border-red-900 shadow-md space-y-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-red-800/20 rounded-full blur-2xl -mr-10 -mt-10" />
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-red-400" />
              <h2 className="text-lg font-black uppercase tracking-wider text-red-300">
                {lang === "fr" ? "Console de Supervision Globale — Bertoua" : "Global Supervision Console — Bertoua"}
              </h2>
            </div>
            <p className="text-xs font-serif text-red-100/90 max-w-2xl">
              {lang === "fr"
                ? "Gérez les validations d'identité, la modération de commentaires abusifs, la résolution de litiges et l'architecture des métiers de Bertoua."
                : "Manage merchant identity compliance, moderation of reported abusive reviews, settlement of trade disputes, and trade category architectures."}
            </p>
          </div>
          
          <button
            onClick={onOpenWizard}
            className="bg-red-800 hover:bg-red-900 border border-red-700 text-white font-black text-xs px-4 py-3 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors w-full sm:w-auto text-center justify-center"
          >
            <Plus className="w-4 h-4" />
            <span>{lang === "fr" ? "Enregistrer un Prestataire Hors-Ligne" : "Add Offline Provider"}</span>
          </button>
        </div>
      </div>

      {/* Tabs navigation menu */}
      <div className="flex overflow-x-auto gap-1 bg-amber-50/50 p-1 border border-amber-100 rounded-2xl">
        {[
          { id: "id_approvals", labelFr: "Pièces d'Identité", labelEn: "ID Approvals", icon: ShieldCheck },
          { id: "accounts", labelFr: "Comptes Utilisateurs", labelEn: "User Accounts", icon: Users },
          { id: "categories", labelFr: "Métiers & Fusion", labelEn: "Categories & Merge", icon: FolderTree },
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
                  ? "bg-red-800 text-white shadow-sm" 
                  : "text-amber-900 hover:bg-amber-100/60"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{lang === "fr" ? tab.labelFr : tab.labelEn}</span>
            </button>
          );
        })}
      </div>

      {/* SEARCH BAR / GLOBAL FILTER (except for categories) */}
      {activeTab !== "categories" && activeTab !== "moderation" && (
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={lang === "fr" ? "Filtrer par nom, téléphone, ID..." : "Filter by name, phone, ID..."}
            className="w-full bg-white border border-amber-200 rounded-2xl pl-11 pr-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-red-800"
          />
          <Search className="w-4 h-4 text-amber-700 absolute left-4 top-1/2 -translate-y-1/2" />
        </div>
      )}

      {/* TAB CONTENTS */}

      {/* 1. ID APPROVALS QUEUE */}
      {activeTab === "id_approvals" && (
        <div className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm space-y-6">
          <div className="flex justify-between items-center border-b border-amber-50 pb-3">
            <div>
              <h3 className="font-black text-amber-950 text-sm uppercase">
                {lang === "fr" ? "File d'attente de conformité ID" : "ID Card Compliance Verification"}
              </h3>
              <p className="text-[11px] text-amber-800 font-serif">
                {lang === "fr" ? "Examinez les pièces d'identité nationales des marchands de Bertoua" : "Inspect national identity cards to verify local merchants"}
              </p>
            </div>
            <span className="bg-red-50 text-red-800 border border-red-200 px-3 py-1 rounded-full text-xs font-black font-mono">
              {providers.filter(p => !p.verified && p.status === "pending").length} {lang === "fr" ? "En attente" : "Pending"}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {providers.filter(p => !p.verified && p.status === "pending").length === 0 ? (
              <div className="col-span-full text-center py-12 text-xs font-serif text-amber-800 border border-dashed border-amber-200 rounded-2xl bg-[#FAF8F5]">
                🎉 {lang === "fr" ? "Aucune pièce d'identité en attente de vérification !" : "No profiles pending identity validation!"}
              </div>
            ) : (
              providers
                .filter(p => !p.verified && p.status === "pending")
                .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.phone.includes(searchQuery))
                .map((p) => (
                  <div key={p.id} className="border border-amber-100 rounded-2xl p-4 bg-[#FAF8F5]/40 space-y-4">
                    <div className="flex flex-wrap justify-between items-start gap-4">
                      <div className="space-y-1">
                        <h4 className="font-black text-amber-950 text-sm">{p.name}</h4>
                        <p className="text-[11px] text-amber-800 font-mono">WhatsApp/Phone: {p.phone}</p>
                        <p className="text-[11px] text-amber-800">
                          Quartier: <strong className="text-amber-950">{p.neighborhoodId}</strong>
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
                          const reason = prompt(lang === "fr" ? "Raison du rejet ?" : "Rejection reason?");
                          if (reason) handleAdminReject(p.id, reason);
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
        </div>
      )}

      {/* 2. USER ACCOUNTS MANAGEMENT */}
      {activeTab === "accounts" && (
        <div className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm space-y-4">
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
                        <tr key={acc.id} className={acc.isSuspended ? "bg-red-50/40" : ""}>
                          <td className="px-4 py-3">
                            <div className="font-bold text-amber-950 flex items-center gap-1.5">
                              {acc.fullName || <span className="italic text-amber-800/50">Non renseigné</span>}
                              {acc.isSuspended && (
                                <span className="bg-red-100 text-red-800 text-[8px] font-bold uppercase px-1 py-0.5 rounded">Suspendu</span>
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
                                ? "bg-red-100 text-red-800" 
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
        </div>
      )}

      {/* 3. CATEGORY MANAGEMENT & MERGING */}
      {activeTab === "categories" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
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
                className="w-full bg-red-800 hover:bg-red-900 text-white font-black text-xs py-3 rounded-xl cursor-pointer"
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
                className="w-full bg-amber-900 hover:bg-amber-950 text-white font-black text-xs py-3 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
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
                <div key={cat.id} className="border border-amber-100 bg-[#FAF8F5]/50 p-3 rounded-xl flex items-center justify-between">
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
        </div>
      )}

      {/* 4. BOOKINGS MANAGEMENT & DISPUTES */}
      {activeTab === "bookings" && (
        <div className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm space-y-4">
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
                  <div key={b.id} className="border border-amber-100 rounded-2xl p-4 bg-[#FAF8F5]/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
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
        </div>
      )}

      {/* 5. ABUSE MODERATION QUEUE */}
      {activeTab === "moderation" && (
        <div className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm space-y-4">
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
                <div key={rev.id} className="border border-red-100 bg-red-50/10 rounded-2xl p-4 space-y-3">
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
        </div>
      )}

      {/* 6. PROMOTED ADS / SPONSORING */}
      {activeTab === "promoted_ads" && (
        <div className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm space-y-6">
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
                    <div key={ad.id} className="border border-amber-100 rounded-2xl bg-amber-50/10 p-4 flex flex-col justify-between space-y-4">
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
        </div>
      )}

      {/* DYNAMIC EDIT PROVIDER MODAL OVERLAY */}
      {editingProvider && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[999] overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 border border-amber-100 shadow-2xl my-8 space-y-6">
            
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
                  className="flex-1 py-3 bg-red-800 hover:bg-red-900 text-white font-black text-xs rounded-xl shadow-md transition-colors cursor-pointer"
                >
                  {lang === "fr" ? "Enregistrer les modifications" : "Save Changes"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}
