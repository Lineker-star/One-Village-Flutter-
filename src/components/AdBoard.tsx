/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion } from "motion/react";
import { ServiceProvider, UserProfile } from "../types.ts";
import { BERTOUA_NEIGHBORHOODS } from "../data/bertouaData.ts";
import { toTitleCase } from "../lib/textFormat.ts";
import { supabaseService } from "../lib/supabase.ts";
import ChatInterface from "./ChatInterface.tsx";
import {
  PlusCircle,
  Megaphone,
  MapPin,
  Tag,
  DollarSign,
  Clock,
  AlertTriangle,
  X,
  Loader2,
  MessageCircle,
  Pencil,
  Trash2,
} from "lucide-react";

type CommunityAdRow = Awaited<ReturnType<typeof supabaseService.getCommunityAds>>[number];

const URGENCY_STYLES: Record<string, string> = {
  high: "bg-rose-50 text-rose-700 border-rose-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

interface AdBoardProps {
  lang: "fr" | "en";
  currentUser: UserProfile | null;
}

export default function AdBoard({ lang, currentUser }: AdBoardProps) {
  const [ads, setAds] = useState<CommunityAdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Array<{ id: number; slug: string; nameFr: string; nameEn: string }>>([]);
  const [showClosedAds, setShowClosedAds] = useState(false);

  const [showPostModal, setShowPostModal] = useState(false);
  const [editingAd, setEditingAd] = useState<CommunityAdRow | null>(null);

  // Post/edit form state
  // categorySlug (not the numeric category_id) is what backs the edit form, and is resolved to the
  // real id only at submit time — see the "Part B bug fix" note on openEditModal for why.
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categorySlug, setCategorySlug] = useState<string>("");
  const [neighborhoodId, setNeighborhoodId] = useState("mokolo");
  const [useFreeTextNeighborhood, setUseFreeTextNeighborhood] = useState(false);
  const [neighborhoodFreeText, setNeighborhoodFreeText] = useState("");
  const [budgetProposed, setBudgetProposed] = useState("");
  const [urgency, setUrgency] = useState<"low" | "medium" | "high">("medium");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Item 1 fix: the post/edit modal wraps its title+description fields in their OWN inner
  // `overflow-y-auto` container nested inside the outer modal backdrop's scroller — exactly the
  // doubly-nested scroll situation where native `required` validation's scroll-into-view is
  // unreliable. Replaced with manual validation + scrollIntoView (which correctly walks every
  // scrollable ancestor, nested or not) plus an inline error under the actual invalid field.
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; description?: string }>({});
  const titleFieldRef = useRef<HTMLInputElement>(null);
  const descriptionFieldRef = useRef<HTMLTextAreaElement>(null);

  const focusInvalidAdField = (ref: React.RefObject<HTMLElement>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    (ref.current as HTMLInputElement | HTMLTextAreaElement | null)?.focus({ preventScroll: true });
  };

  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeChatWithPoster, setActiveChatWithPoster] = useState<ServiceProvider | null>(null);

  const t = {
    fr: {
      boardTitle: "Annonces d'Entraide Communautaire",
      boardDesc: "Découvrez les besoins urgents des habitants de Bertoua ou postez votre propre demande de coup de main.",
      postBtn: "Poster une annonce d'entraide",
      signInPrompt: "Connectez-vous pour poster une annonce.",
      showClosed: "Afficher les annonces fermées",
      neighborhood: "Quartier",
      budget: "Budget proposé",
      postedBy: "Proposé par",
      modalTitleCreate: "Publier un besoin d'entraide",
      modalTitleEdit: "Modifier votre annonce",
      modalDesc: "Décrivez précisément ce dont vous avez besoin pour que la communauté de l'Est puisse vous répondre.",
      titleLabel: "Titre de votre besoin",
      descLabel: "Description détaillée",
      categoryLabel: "Catégorie associée (optionnel)",
      neighborhoodLabel: "Quartier de l'annonce",
      budgetLabel: "Budget disponible (FCFA, optionnel)",
      urgencySelect: "Niveau d'urgence",
      submitBtn: "Publier sur le tableau",
      saveBtn: "Enregistrer",
      cancel: "Annuler",
      noAds: "Aucune annonce pour le moment.",
    },
    en: {
      boardTitle: "Community Help Ads",
      boardDesc: "Discover urgent needs from Bertoua residents or post your own request for assistance.",
      postBtn: "Post a Help Request",
      signInPrompt: "Sign in to post an ad.",
      showClosed: "Show closed ads",
      neighborhood: "Neighborhood",
      budget: "Proposed Budget",
      postedBy: "Posted by",
      modalTitleCreate: "Post a Help Request",
      modalTitleEdit: "Edit Your Ad",
      modalDesc: "Describe precisely what you need so the East Region community can respond.",
      titleLabel: "Title of your need",
      descLabel: "Detailed description",
      categoryLabel: "Related category (optional)",
      neighborhoodLabel: "Neighborhood of the ad",
      budgetLabel: "Available Budget (FCFA, optional)",
      urgencySelect: "Urgency level",
      submitBtn: "Publish on Board",
      saveBtn: "Save",
      cancel: "Cancel",
      noAds: "No ads yet.",
    }
  }[lang];

  const fetchAds = () => {
    setLoading(true);
    supabaseService.getCommunityAds().then((list) => {
      setAds(list);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchAds();
    supabaseService.getAllServiceCategories().then(setCategories);
  }, []);

  const visibleAds = useMemo(() => ads.filter((ad) => (showClosedAds ? true : ad.status === "open")), [ads, showClosedAds]);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setCategorySlug("");
    setNeighborhoodId("mokolo");
    setUseFreeTextNeighborhood(false);
    setNeighborhoodFreeText("");
    setBudgetProposed("");
    setUrgency("medium");
    setFormError("");
    setFieldErrors({});
  };

  const openCreateModal = () => {
    resetForm();
    setEditingAd(null);
    setShowPostModal(true);
  };

  // Part B bug fix: previously resolved ad.categorySlug -> a numeric category_id by looking it up
  // in the `categories` list right here, at modal-open time. If that list hadn't finished loading
  // yet (a real, if narrow, race since it's fetched in a separate parallel request from the ad
  // list), the lookup silently failed to "" (no category), and an unchanged save would have wiped
  // the ad's real category. Now the form just carries the slug (already known directly from the ad
  // row, no lookup needed) and resolves it to an id at submit time instead, once `categories` has
  // had the entire time-to-open-and-review-the-form to load.
  const openEditModal = (ad: CommunityAdRow) => {
    setTitle(ad.title);
    setDescription(ad.description);
    setCategorySlug(ad.categorySlug || "");
    const knownNeighborhood = BERTOUA_NEIGHBORHOODS.some((n) => n.id === ad.neighborhoodId);
    if (ad.neighborhoodId && !knownNeighborhood) {
      setUseFreeTextNeighborhood(true);
      setNeighborhoodFreeText(ad.neighborhoodId);
    } else {
      setUseFreeTextNeighborhood(false);
      setNeighborhoodId(ad.neighborhoodId || "mokolo");
    }
    setBudgetProposed(ad.budgetProposed != null ? String(ad.budgetProposed) : "");
    setUrgency(ad.urgency);
    setFormError("");
    setEditingAd(ad);
    setShowPostModal(true);
  };

  const handlePostAdSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const errors: { title?: string; description?: string } = {};
    if (!title.trim()) {
      errors.title = lang === "fr" ? "Le titre est obligatoire." : "Title is required.";
    }
    if (!description.trim()) {
      errors.description = lang === "fr" ? "La description est obligatoire." : "Description is required.";
    }
    setFieldErrors(errors);
    if (errors.title) {
      focusInvalidAdField(titleFieldRef);
      return;
    }
    if (errors.description) {
      focusInvalidAdField(descriptionFieldRef);
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      const input = {
        title: title.trim(),
        description: description.trim(),
        categoryId: categorySlug ? categories.find((c) => c.slug === categorySlug)?.id ?? null : null,
        neighborhoodId: useFreeTextNeighborhood ? neighborhoodFreeText.trim() : neighborhoodId,
        budgetProposed: budgetProposed.trim() ? Number(budgetProposed) : null,
        urgency,
      };

      if (editingAd) {
        await supabaseService.updateCommunityAd(editingAd.id, input);
      } else {
        await supabaseService.createCommunityAd(currentUser.id, input);
      }

      setShowPostModal(false);
      resetForm();
      setEditingAd(null);
      fetchAds();
    } catch (err: any) {
      console.error("Community ad save error:", err);
      setFormError(err.message || (lang === "fr" ? "Erreur lors de la publication." : "Error publishing ad."));
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (adId: string, status: "open" | "fulfilled" | "closed") => {
    setStatusUpdatingId(adId);
    try {
      await supabaseService.setCommunityAdStatus(adId, status);
      setAds((prev) => prev.map((a) => (a.id === adId ? { ...a, status } : a)));
    } catch (err: any) {
      // Part B bug fix: this previously failed silently — the <select> would just snap back to its
      // old value on the next render with zero indication anything went wrong.
      console.error("Community ad status update error:", err);
      alert(
        lang === "fr"
          ? `Erreur lors du changement de statut : ${err?.message || err}`
          : `Error changing status: ${err?.message || err}`
      );
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleDelete = async (ad: CommunityAdRow) => {
    const confirmMsg = lang === "fr" ? `Supprimer définitivement l'annonce "${ad.title}" ?` : `Permanently delete the "${ad.title}" ad?`;
    if (!window.confirm(confirmMsg)) return;
    setDeletingId(ad.id);
    try {
      await supabaseService.deleteCommunityAd(ad.id);
      setAds((prev) => prev.filter((a) => a.id !== ad.id));
    } catch (err: any) {
      // Part B bug fix: same silent-failure issue as handleStatusChange above.
      console.error("Community ad delete error:", err);
      alert(
        lang === "fr"
          ? `Erreur lors de la suppression : ${err?.message || err}`
          : `Error deleting the ad: ${err?.message || err}`
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleOpenChat = (ad: CommunityAdRow) => {
    // Reuses ChatInterface (built around ServiceProvider) with a minimal stub built from the ad's
    // real poster identity — getOrCreateChat() no longer requires the other party to be a
    // registered service provider (see 20260719010000_generalize_chat_participants.sql), so this
    // works for any two real accounts.
    const posterAsProvider: ServiceProvider = {
      id: ad.posterId,
      name: ad.posterName || (lang === "fr" ? "Habitant de Bertoua" : "Bertoua resident"),
      phone: ad.posterPhone,
      whatsappNumber: ad.posterWhatsapp,
      category: ad.categorySlug || "",
      neighborhoodId: ad.neighborhoodId || "",
      rateFCFA: 0,
      rateUnit: "",
      description: "",
      languages: [],
      rating: 0,
      reviewCount: 0,
      verified: false,
      available: true,
    };
    setActiveChatWithPoster(posterAsProvider);
  };

  const getUrgencyBadge = (level: string) => {
    const styles = URGENCY_STYLES[level] || URGENCY_STYLES.medium;
    const label = {
      fr: { high: "Urgent", medium: "Modéré", low: "Souple" },
      en: { high: "Urgent", medium: "Moderate", low: "Flexible" },
    }[lang][level] || level;

    return (
      <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border ${styles} flex items-center gap-1 shrink-0`}>
        {level === "high" && <AlertTriangle className="w-3 h-3" />}
        {label}
      </span>
    );
  };

  const buildWhatsAppUrl = (ad: CommunityAdRow) => {
    const phone = ad.posterWhatsapp.replace(/[\s+]/g, "");
    const message =
      lang === "fr"
        ? `Bonjour, je vous contacte au sujet de votre annonce : ${ad.title}`
        : `Hello, I'm contacting you about your ad: ${ad.title}`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  };

  if (activeChatWithPoster && currentUser) {
    return (
      <div className="animate-fade-in">
        <ChatInterface
          provider={activeChatWithPoster}
          currentUser={currentUser}
          lang={lang}
          onBack={() => setActiveChatWithPoster(null)}
        />
      </div>
    );
  }

  return (
    <div id="community-ads-section" className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-amber-50/50 p-6 rounded-2xl border border-amber-200/50">
        <div>
          <h3 className="text-lg font-bold text-amber-950 flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-amber-800" />
            {t.boardTitle}
          </h3>
          <p className="text-xs text-amber-800 mt-1 max-w-xl">{t.boardDesc}</p>
        </div>
        {currentUser ? (
          <button
            onClick={openCreateModal}
            id="btn-post-ad"
            className="bg-[#E3A23D] hover:bg-[#F2B355] text-[#241611] font-black text-xs px-4 py-3 rounded-xl flex items-center gap-2 transition-colors cursor-pointer shadow-sm shrink-0"
          >
            <PlusCircle className="w-4 h-4" />
            {t.postBtn}
          </button>
        ) : (
          <p className="text-xs text-amber-800 font-serif italic">{t.signInPrompt}</p>
        )}
      </div>

      {/* Item 6: open/closed toggle */}
      <label className="flex items-center gap-2 text-xs font-bold text-amber-900 cursor-pointer w-max">
        <input
          type="checkbox"
          checked={showClosedAds}
          onChange={(e) => setShowClosedAds(e.target.checked)}
          className="w-4 h-4 rounded border-amber-300 text-[#245C46] focus:ring-[#245C46]"
        />
        {t.showClosed}
      </label>

      {/* Ads Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-amber-800 text-xs gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      ) : visibleAds.length === 0 ? (
        <div className="text-center py-16 text-xs font-serif text-amber-800 border border-dashed border-amber-200 rounded-2xl bg-amber-50/10">
          {t.noAds}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleAds.map((ad, idx) => {
            const nh = ad.neighborhoodId ? BERTOUA_NEIGHBORHOODS.find((n) => n.id === ad.neighborhoodId) : null;
            const isOwnAd = !!currentUser && ad.posterId === currentUser.id;
            return (
              <motion.div
                key={ad.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.3, delay: Math.min(idx, 5) * 0.05 }}
                className={`bg-white border p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden ${
                  ad.status !== "open" ? "border-neutral-200 opacity-70" : "border-amber-100/80"
                }`}
              >
                <div className="space-y-3.5">
                  <div className="flex justify-between items-start gap-4">
                    <h4 className="font-bold text-amber-950 text-sm leading-snug">{ad.title}</h4>
                    <div className="flex flex-col items-end gap-1.5">
                      {getUrgencyBadge(ad.urgency)}
                      {ad.status !== "open" && (
                        <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full bg-neutral-100 text-neutral-700 border border-neutral-200">
                          {ad.status === "fulfilled" ? (lang === "fr" ? "Comblée" : "Fulfilled") : (lang === "fr" ? "Fermée" : "Closed")}
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-amber-900/80 leading-relaxed font-serif">{ad.description}</p>

                  {/* Part C fix: was an unconditional 2-column grid — a long category or
                      neighborhood name (e.g. "Aide à domicile & Ménage") got squeezed into half the
                      card's width on a 375px screen. Full-width rows on mobile, 2 columns from sm+. */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] text-amber-800 font-medium">
                    {ad.neighborhoodId && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span>{t.neighborhood}: <strong className="text-amber-950 font-semibold">{nh ? nh.name : toTitleCase(ad.neighborhoodId)}</strong></span>
                      </div>
                    )}
                    {ad.categoryNameFr && (
                      <div className="flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span>{lang === "fr" ? ad.categoryNameFr : ad.categoryNameEn}</span>
                      </div>
                    )}
                    {ad.budgetProposed != null && (
                      <div className="flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span>{t.budget}: <strong className="text-amber-950 font-bold">{ad.budgetProposed.toLocaleString()} FCFA</strong></span>
                      </div>
                    )}
                  </div>

                  {isOwnAd ? (
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      <select
                        value={ad.status}
                        disabled={statusUpdatingId === ad.id}
                        onChange={(e) => handleStatusChange(ad.id, e.target.value as "open" | "fulfilled" | "closed")}
                        className="bg-[#FAF8F5] border border-amber-200 rounded-lg px-2.5 py-2 text-[11px] font-bold text-amber-950 focus:outline-none cursor-pointer disabled:opacity-50"
                      >
                        <option value="open">{lang === "fr" ? "Ouverte" : "Open"}</option>
                        <option value="fulfilled">{lang === "fr" ? "Comblée" : "Fulfilled"}</option>
                        <option value="closed">{lang === "fr" ? "Fermée" : "Closed"}</option>
                      </select>
                      <button
                        onClick={() => openEditModal(ad)}
                        className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100/60 border border-amber-200/50 text-amber-900 text-[11px] font-bold px-3 py-2 rounded-lg cursor-pointer transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        {lang === "fr" ? "Modifier" : "Edit"}
                      </button>
                      <button
                        onClick={() => handleDelete(ad)}
                        disabled={deletingId === ad.id}
                        className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100/60 border border-red-200/50 text-red-800 text-[11px] font-bold px-3 py-2 rounded-lg cursor-pointer transition-colors disabled:opacity-50"
                      >
                        {deletingId === ad.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        {lang === "fr" ? "Supprimer" : "Delete"}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 pt-1">
                      {currentUser && (
                        <button
                          onClick={() => handleOpenChat(ad)}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl transition-colors cursor-pointer"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          {lang === "fr" ? "Discuter" : "Chat"}
                        </button>
                      )}
                      {/* Part B bug fix: previously always rendered even with no phone on file,
                          producing a dead wa.me/ link with no number. */}
                      {ad.posterWhatsapp && (
                        <a
                          href={buildWhatsAppUrl(ad)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 flex items-center justify-center gap-1.5 bg-[#3E8467] hover:bg-[#245C46] text-white text-xs font-bold px-3.5 py-2.5 rounded-xl transition-colors cursor-pointer"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          WhatsApp
                        </a>
                      )}
                    </div>
                  )}
                </div>

                <div className="border-t border-amber-50 mt-4 pt-3 flex items-center justify-between text-[10px] text-amber-800/70">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(ad.createdAt).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}
                  </span>
                  <span>
                    {t.postedBy}: <strong className="text-amber-900">{ad.posterName}</strong>
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Post/Edit Modal */}
      {showPostModal && currentUser && (
        <div className="fixed inset-0 bg-amber-950/40 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl border border-amber-100 overflow-hidden relative my-6">
            <button
              onClick={() => setShowPostModal(false)}
              className="absolute top-4 right-4 p-2 text-amber-900/60 hover:text-amber-950 hover:bg-amber-50 rounded-full transition-colors cursor-pointer z-10"
            >
              <X className="w-5 h-5" />
            </button>

            <form onSubmit={handlePostAdSubmit} noValidate className="p-6 space-y-4">
              <div>
                <h3 className="text-base font-bold text-amber-950">{editingAd ? t.modalTitleEdit : t.modalTitleCreate}</h3>
                <p className="text-xs text-amber-800 mt-1">{t.modalDesc}</p>
              </div>

              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3 text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="space-y-3 pt-2 max-h-[60vh] overflow-y-auto px-1">
                <div>
                  <label className="block text-xs font-semibold text-amber-900 mb-1">{t.titleLabel}</label>
                  <input
                    ref={titleFieldRef}
                    type="text"
                    value={title}
                    onChange={(e) => { setTitle(e.target.value); if (fieldErrors.title) setFieldErrors((prev) => ({ ...prev, title: undefined })); }}
                    placeholder="ex: Recherche labour à Ndouan"
                    className={`w-full bg-amber-50/50 border rounded-xl p-3 text-sm text-amber-950 focus:outline-none focus:ring-1 ${
                      fieldErrors.title ? "border-red-300 focus:ring-red-400" : "border-amber-200 focus:ring-[#E3A23D]"
                    }`}
                  />
                  {fieldErrors.title && <p className="text-[11px] text-red-700 font-bold mt-1">{fieldErrors.title}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-amber-900 mb-1">{t.descLabel}</label>
                  <textarea
                    ref={descriptionFieldRef}
                    value={description}
                    onChange={(e) => { setDescription(e.target.value); if (fieldErrors.description) setFieldErrors((prev) => ({ ...prev, description: undefined })); }}
                    placeholder="Expliquez ce qu'il y a à faire..."
                    className={`w-full min-h-[80px] max-h-[140px] bg-amber-50/50 border rounded-xl p-3 text-sm text-amber-950 focus:outline-none focus:ring-1 ${
                      fieldErrors.description ? "border-red-300 focus:ring-red-400" : "border-amber-200 focus:ring-[#E3A23D]"
                    }`}
                  />
                  {fieldErrors.description && <p className="text-[11px] text-red-700 font-bold mt-1">{fieldErrors.description}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-amber-900 mb-1">{t.categoryLabel}</label>
                    <select
                      value={categorySlug}
                      onChange={(e) => setCategorySlug(e.target.value)}
                      className="w-full bg-amber-50/50 border border-amber-200 rounded-xl p-3 text-sm text-amber-950 focus:outline-none"
                    >
                      <option value="">{lang === "fr" ? "Aucune" : "None"}</option>
                      {categories.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {lang === "fr" ? c.nameFr : c.nameEn}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-amber-900 mb-1">{t.neighborhoodLabel}</label>
                    <select
                      value={useFreeTextNeighborhood ? "OTHER" : neighborhoodId}
                      onChange={(e) => {
                        if (e.target.value === "OTHER") {
                          setUseFreeTextNeighborhood(true);
                        } else {
                          setUseFreeTextNeighborhood(false);
                          setNeighborhoodId(e.target.value);
                        }
                      }}
                      className="w-full bg-amber-50/50 border border-amber-200 rounded-xl p-3 text-sm text-amber-950 focus:outline-none"
                    >
                      {BERTOUA_NEIGHBORHOODS.map((nh) => (
                        <option key={nh.id} value={nh.id}>
                          {nh.name}
                        </option>
                      ))}
                      <option value="OTHER">{lang === "fr" ? "Autre — préciser" : "Other — specify"}</option>
                    </select>
                    {useFreeTextNeighborhood && (
                      <input
                        type="text"
                        value={neighborhoodFreeText}
                        onChange={(e) => setNeighborhoodFreeText(e.target.value)}
                        placeholder={lang === "fr" ? "Nom du quartier" : "Neighborhood name"}
                        className="w-full bg-amber-50/50 border border-amber-200 rounded-xl p-3 text-sm text-amber-950 focus:outline-none mt-2"
                      />
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-amber-900 mb-1">{t.budgetLabel}</label>
                  <input
                    type="number"
                    value={budgetProposed}
                    onChange={(e) => setBudgetProposed(e.target.value)}
                    placeholder="ex: 15000"
                    className="w-full bg-amber-50/50 border border-amber-200 rounded-xl p-3 text-sm text-amber-950 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-amber-900 mb-1">{t.urgencySelect}</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["low", "medium", "high"] as const).map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setUrgency(level)}
                        className={`px-3 py-2.5 rounded-xl border text-[11px] font-bold cursor-pointer transition-all text-center ${
                          urgency === level ? "bg-[#E3A23D] border-[#E3A23D] text-[#241611]" : "bg-amber-50/50 border-amber-200/60 text-amber-950 hover:bg-amber-100/30"
                        }`}
                      >
                        {lang === "fr"
                          ? { low: "Souple", medium: "Modéré", high: "Urgent" }[level]
                          : { low: "Flexible", medium: "Moderate", high: "Urgent" }[level]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowPostModal(false)}
                  className="flex-1 py-3 border border-amber-200 text-amber-900 hover:bg-amber-50 font-medium rounded-xl text-sm transition-colors cursor-pointer"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  id="btn-submit-ad"
                  className="flex-1 bg-[#E3A23D] hover:bg-[#F2B355] text-[#241611] font-black rounded-xl text-sm py-3 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : (editingAd ? t.saveBtn : t.submitBtn)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
