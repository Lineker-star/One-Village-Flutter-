/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Booking, ServiceProvider, BookingStatus, ServiceCategory, RealBooking, RealBookingStatus } from "../types.ts";
import { BookOpen, User, Gift, MapPin, Calendar, Clock, DollarSign, MessageSquare, Check, RefreshCw, Award, Copy, Share2, X, Megaphone, Info } from "lucide-react";
import { supabaseService } from "../lib/supabase.ts";

interface DashboardProps {
  lang: "fr" | "en";
  activeChatProvider: ServiceProvider | null;
  setActiveChatProvider: (p: ServiceProvider | null) => void;
  currentUser?: any;
  setCurrentUser?: (u: any) => void;
}

export default function Dashboard({ lang, activeChatProvider, setActiveChatProvider, currentUser, setCurrentUser }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<"bookings" | "provider" | "referral" | "advertising">("bookings");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isProviderMode, setIsProviderMode] = useState(false);
  const [copied, setCopied] = useState(false);

  // Real Supabase verification status for the signed-in provider's own listing (pending/approved/
  // rejected + reason). Only fetched when actually viewing your own real provider portal, not the
  // "p1" demo simulation.
  const [myProviderStatus, setMyProviderStatus] = useState<ServiceProvider | null>(null);

  useEffect(() => {
    if (activeTab === "provider" && !isProviderMode && currentUser?.role === "provider") {
      supabaseService.getProviderFullRecord(currentUser.id).then(setMyProviderStatus).catch(() => setMyProviderStatus(null));
    }
  }, [activeTab, isProviderMode, currentUser]);

  // Real Supabase-backed bookings (see supabase/migrations/20260715010000_bookings_realtime_and_status_rules.sql).
  // Distinct from the legacy mock `bookings` state below, which still backs the provider-mode demo
  // simulator, chat auto-booking, and admin dispute panel — none of those moved to Supabase yet.
  const [realClientBookings, setRealClientBookings] = useState<RealBooking[]>([]);
  const [loadingClientBookings, setLoadingClientBookings] = useState(false);
  const [realProviderBookings, setRealProviderBookings] = useState<RealBooking[]>([]);
  const [loadingProviderBookings, setLoadingProviderBookings] = useState(false);
  const [bookingActionError, setBookingActionError] = useState("");

  const fetchRealClientBookings = async () => {
    if (!currentUser) return;
    setLoadingClientBookings(true);
    try {
      const [bookingsData, ratedIds] = await Promise.all([
        supabaseService.getMyBookingsAsClient(currentUser.id),
        supabaseService.getRatedBookingIds(currentUser.id),
      ]);
      setRealClientBookings(bookingsData);
      setRatedBookings(Object.fromEntries(Array.from(ratedIds).map((id) => [id, true])));
    } finally {
      setLoadingClientBookings(false);
    }
  };

  const fetchRealProviderBookings = async () => {
    if (!currentUser || currentUser.role !== "provider") return;
    setLoadingProviderBookings(true);
    try {
      setRealProviderBookings(await supabaseService.getMyBookingsAsProvider(currentUser.id));
    } finally {
      setLoadingProviderBookings(false);
    }
  };

  useEffect(() => {
    if (activeTab === "bookings") fetchRealClientBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentUser?.id]);

  useEffect(() => {
    if (activeTab === "provider" && !isProviderMode) fetchRealProviderBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isProviderMode, currentUser?.id]);

  const handleRealProviderStatusChange = async (bookingId: string, status: RealBookingStatus) => {
    setBookingActionError("");
    try {
      await supabaseService.updateBookingStatus(bookingId, status);
      await fetchRealProviderBookings();
    } catch (err: any) {
      setBookingActionError(err.message || (lang === "fr" ? "Erreur lors de la mise à jour du statut." : "Error updating status."));
    }
  };

  const handleRealConfirmCompletion = async (bookingId: string, role: "client" | "provider") => {
    setBookingActionError("");
    try {
      await supabaseService.confirmBookingCompletion(bookingId, role);
      if (role === "client") await fetchRealClientBookings();
      else await fetchRealProviderBookings();
    } catch (err: any) {
      setBookingActionError(err.message || (lang === "fr" ? "Erreur lors de la confirmation." : "Error confirming completion."));
    }
  };

  const REAL_STATUS_STYLES: Record<RealBookingStatus, string> = {
    requested: "bg-amber-100 text-amber-800 border-amber-200",
    accepted: "bg-blue-50 text-blue-700 border-blue-200",
    in_progress: "bg-purple-50 text-purple-700 border-purple-200",
    completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
    cancelled: "bg-rose-50 text-rose-700 border-rose-200",
  };
  const REAL_STATUS_LABELS: Record<"fr" | "en", Record<RealBookingStatus, string>> = {
    fr: { requested: "Demandée", accepted: "Acceptée", in_progress: "En cours", completed: "Terminée", cancelled: "Annulée" },
    en: { requested: "Requested", accepted: "Accepted", in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled" },
  };
  const getRealStatusBadge = (status: RealBookingStatus) => (
    <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-bold tracking-wide uppercase ${REAL_STATUS_STYLES[status]}`}>
      {REAL_STATUS_LABELS[lang][status]}
    </span>
  );

  // Minimal ServiceProvider stub built from a RealBooking's denormalized fields, just enough for
  // the mock ChatInterface (chat itself hasn't moved to Supabase yet) to open a conversation.
  const bookingToProviderStub = (b: RealBooking): ServiceProvider => ({
    id: b.providerId,
    name: b.providerBusinessName || "Prestataire",
    businessName: b.providerBusinessName,
    phone: "",
    whatsappNumber: "",
    category: ServiceCategory.HOME_HELP,
    neighborhoodId: "",
    rateFCFA: b.agreedPrice,
    rateUnit: "jour",
    description: "",
    languages: [],
    rating: 5,
    reviewCount: 0,
    verified: true,
    available: true,
  });

  // Rating and review states
  const [ratingBooking, setRatingBooking] = useState<any>(null);
  const [rateStars, setRateStars] = useState(5);
  const [rateComment, setRateComment] = useState("");
  const [rateSubmitting, setRateSubmitting] = useState(false);
  const [rateErrorMsg, setRateErrorMsg] = useState("");
  const [ratedBookings, setRatedBookings] = useState<Record<string, boolean>>({});

  // Dynamic Referral states
  const [referralsList, setReferralsList] = useState<any[]>([]);
  const [loadingReferrals, setLoadingReferrals] = useState(false);

  // Phase 13 Provider Advertising state
  const [providerAds, setProviderAds] = useState<any[]>([]);
  const [loadingAds, setLoadingAds] = useState(false);
  const [payingAd, setPayingAd] = useState<any>(null);
  const [adPaymentPhone, setAdPaymentPhone] = useState("");
  const [adPaymentMethod, setAdPaymentMethod] = useState<"MTN_MOMO" | "ORANGE_MONEY">("MTN_MOMO");
  const [adPaymentSubmitting, setAdPaymentSubmitting] = useState(false);

  // New Ad Campaign submission states
  const [newAdPlacement, setNewAdPlacement] = useState("home");
  const [newAdBudget, setNewAdBudget] = useState(10000);
  const [newAdMediaUrl, setNewAdMediaUrl] = useState("https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&w=600&q=80");
  const [newAdStartDate, setNewAdStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [newAdEndDate, setNewAdEndDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);
  const [createAdSubmitting, setCreateAdSubmitting] = useState(false);

  const fetchProviderAds = async () => {
    const activeProviderId = isProviderMode ? "p1" : (currentUser?.id || "p1");
    setLoadingAds(true);
    try {
      const res = await fetch(`/api/promoted-ads/provider/${activeProviderId}`);
      if (res.ok) {
        setProviderAds(await res.json());
      }
    } catch (err) {
      console.error("Error fetching provider ads:", err);
    } finally {
      setLoadingAds(false);
    }
  };

  useEffect(() => {
    if (activeTab === "advertising") {
      fetchProviderAds();
    }
  }, [activeTab, isProviderMode, currentUser]);

  const handleCreateAd = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeProviderId = isProviderMode ? "p1" : (currentUser?.id || "p1");
    setCreateAdSubmitting(true);
    try {
      const res = await fetch("/api/promoted-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: activeProviderId,
          mediaUrl: newAdMediaUrl,
          mediaType: "image",
          placement: newAdPlacement,
          budgetFCFA: Number(newAdBudget),
          startDate: newAdStartDate,
          endDate: newAdEndDate,
        }),
      });
      if (res.ok) {
        const createdAd = await res.json();
        alert(lang === "fr" ? "Campagne publicitaire créée avec succès ! Veuillez effectuer le paiement Mobile Money." : "Promotion created successfully! Please make the Mobile Money payment.");
        setPayingAd(createdAd);
        setAdPaymentPhone(currentUser?.phone || "+237 671 22 33 44");
        fetchProviderAds();
      } else {
        alert("Erreur lors de la création de la publicité.");
      }
    } catch (err) {
      console.error("Error creating ad:", err);
    } finally {
      setCreateAdSubmitting(false);
    }
  };

  const handlePayAd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingAd) return;
    setAdPaymentSubmitting(true);
    try {
      const res = await fetch(`/api/promoted-ads/${payingAd.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod: adPaymentMethod,
          paymentPhone: adPaymentPhone,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        alert(data.message || (lang === "fr" ? "Paiement validé avec succès !" : "Payment validated successfully!"));
        setPayingAd(null);
        fetchProviderAds();
      } else {
        alert("Erreur lors du traitement du paiement.");
      }
    } catch (err) {
      console.error("Error paying ad:", err);
    } finally {
      setAdPaymentSubmitting(false);
    }
  };

  const fetchReferrals = async () => {
    if (!currentUser) return;
    setLoadingReferrals(true);
    try {
      const res = await fetch("/api/referrals");
      if (res.ok) {
        const data = await res.json();
        // Filter referrals initiated by this user
        const filtered = data.filter((r: any) => r.referrerId === currentUser.id || r.referrerName === currentUser.fullName || r.referrerId === "p1");
        setReferralsList(filtered);
      }
    } catch (err) {
      console.error("Error fetching referrals:", err);
    } finally {
      setLoadingReferrals(false);
    }
  };

  useEffect(() => {
    if (activeTab === "referral") {
      fetchReferrals();
    }
  }, [activeTab, currentUser]);

  const handleCopyCode = () => {
    const code = currentUser?.referralCode || "ONE-VILLAGE-237";
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const t = {
    fr: {
      bookingsTab: "Mes Commandes (Client)",
      providerTab: "Espace Prestataire",
      referralTab: "Parrainage",
      providerSim: "Simuler en tant que Prestataire : Jean-Pierre Ndouan",
      providerSimDesc: "Activez ce mode pour voir le tableau de bord de Jean-Pierre Ndouan (Agriculture, Ndouan) et gérer ses demandes de travaux.",
      noBookings: "Aucune réservation trouvée. Explorez les catégories pour réserver votre premier service !",
      clientPhone: "Téléphone",
      status: "Statut",
      action: "Actions",
      payNow: "Payer en MoMo",
      chat: "Discuter",
      complete: "Terminer",
      accept: "Accepter",
      earnings: "Gains totaux",
      jobs: "Travaux terminés",
      rating: "Note moyenne",
      referralTitle: "Parrainez vos voisins à Bertoua",
      referralDesc: "Partagez votre code de recommandation. Lorsque vos amis effectuent leur premier paiement Mobile Money sur One Village, vous gagnez 100 points de confiance et un badge communautaire !",
      shareCode: "Votre Code de Parrainage",
      copyBtn: "Copier le code",
      copied: "Copié !",
      statsShares: "Partages réussis",
      statsPoints: "Points accumulés",
      badgesTitle: "Vos Badges de Confiance Communautaire",
      badgePioneer: "Pionnier de Bertoua",
      badgePioneerDesc: "Rejoint les premiers membres du village.",
      badgeSage: "Sage Solidaire",
      badgeSageDesc: "A parrainé au moins 3 personnes.",
      badgeElder: "Ancien Honoré",
      badgeElderDesc: "A parrainé 10 personnes ou complété 5 travaux.",
    },
    en: {
      bookingsTab: "My Orders (Customer)",
      providerTab: "Provider Portal",
      referralTab: "Referral Program",
      providerSim: "Simulate as Provider: Jean-Pierre Ndouan",
      providerSimDesc: "Turn this on to view the dashboard of Jean-Pierre Ndouan (Agriculture, Ndouan) and manage work requests.",
      noBookings: "No bookings found. Browse categories to book your first service!",
      clientPhone: "Phone",
      status: "Status",
      action: "Actions",
      payNow: "Pay with MoMo",
      chat: "Chat",
      complete: "Complete",
      accept: "Accept",
      earnings: "Total earnings",
      jobs: "Jobs completed",
      rating: "Average rating",
      referralTitle: "Refer your neighbors in Bertoua",
      referralDesc: "Share your recommendation code. When your friends make their first Mobile Money payment on One Village, you earn 100 trust points and a community badge!",
      shareCode: "Your Referral Code",
      copyBtn: "Copy code",
      copied: "Copied!",
      statsShares: "Successful shares",
      statsPoints: "Points accumulated",
      badgesTitle: "Your Community Trust Badges",
      badgePioneer: "Bertoua Pioneer",
      badgePioneerDesc: "Joined the very first members of the village.",
      badgeSage: "Solidarity Sage",
      badgeSageDesc: "Referred at least 3 people.",
      badgeElder: "Honored Elder",
      badgeElderDesc: "Referred 10 people or completed 5 service jobs.",
    }
  }[lang];

  const fetchBookings = async () => {
    try {
      const res = await fetch("/api/bookings");
      if (res.ok) {
        const data = await res.json();
        setBookings(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchBookings();
    const interval = setInterval(fetchBookings, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleProviderAction = async (bookingId: string, action: "ACCEPTED" | "COMPLETED") => {
    try {
      const res = await fetch(`/api/bookings/${bookingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action }),
      });
      if (res.ok) {
        fetchBookings();
      }
    } catch (err) {
      console.error("Error updating status:", err);
    }
  };

  const handleConfirmCompletion = async (bookingId: string, role: "client" | "provider") => {
    try {
      const res = await fetch(`/api/bookings/${bookingId}/confirm-completion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        fetchBookings();
      }
    } catch (err) {
      console.error("Error confirming completion:", err);
    }
  };

  const handleRateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ratingBooking || !currentUser) return;
    setRateSubmitting(true);
    setRateErrorMsg("");
    try {
      await supabaseService.submitRating({
        bookingId: ratingBooking.id,
        clientId: currentUser.id,
        providerId: ratingBooking.providerId,
        stars: rateStars,
        comment: rateComment.trim() || undefined,
      });
      setRatedBookings(prev => ({ ...prev, [ratingBooking.id]: true }));
      setRatingBooking(null);
      setRateComment("");
      setRateStars(5);
      fetchRealClientBookings();
    } catch (err: any) {
      console.error("Error submitting review:", err);
      setRateErrorMsg(err.message || (lang === "fr" ? "Erreur lors de l'envoi de votre avis." : "Error submitting your review."));
    } finally {
      setRateSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      PENDING: "bg-amber-100 text-amber-800 border-amber-200",
      ACCEPTED: "bg-blue-50 text-blue-700 border-blue-200",
      PAID: "bg-emerald-100 text-emerald-800 border-emerald-200 font-bold animate-pulse",
      COMPLETED: "bg-neutral-100 text-neutral-800 border-neutral-200",
      CANCELLED: "bg-rose-50 text-rose-700 border-rose-200",
    }[status] || "bg-amber-50 text-amber-700 border-amber-200";

    const labels = {
      fr: { PENDING: "En attente", ACCEPTED: "Accepté", PAID: "Payé (MoMo)", COMPLETED: "Terminé", CANCELLED: "Annulé" },
      en: { PENDING: "Pending", ACCEPTED: "Accepted", PAID: "Paid (MoMo)", COMPLETED: "Completed", CANCELLED: "Cancelled" },
    }[lang][status] || status;

    return (
      <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-bold tracking-wide uppercase ${styles}`}>
        {labels}
      </span>
    );
  };

  return (
    <div id="dashboard-container" className="space-y-6">
      {/* Tab bar */}
      <div className="flex overflow-x-auto gap-1 bg-amber-100/40 p-1.5 rounded-2xl border border-amber-200/45 max-w-xl">
        <button
          onClick={() => setActiveTab("bookings")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "bookings"
              ? "bg-amber-800 text-white shadow-md"
              : "text-amber-900 hover:bg-amber-100/50"
          }`}
        >
          <BookOpen className="w-4 h-4 shrink-0" />
          <span>{t.bookingsTab}</span>
        </button>
        <button
          onClick={() => setActiveTab("provider")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "provider"
              ? "bg-amber-800 text-white shadow-md"
              : "text-amber-900 hover:bg-amber-100/50"
          }`}
        >
          <User className="w-4 h-4 shrink-0" />
          <span>{t.providerTab}</span>
        </button>
        <button
          onClick={() => setActiveTab("referral")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "referral"
              ? "bg-amber-800 text-white shadow-md"
              : "text-amber-900 hover:bg-amber-100/50"
          }`}
        >
          <Gift className="w-4 h-4 shrink-0" />
          <span>{t.referralTab}</span>
        </button>
        <button
          onClick={() => setActiveTab("advertising")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "advertising"
              ? "bg-amber-800 text-white shadow-md"
              : "text-amber-900 hover:bg-amber-100/50"
          }`}
        >
          <Megaphone className="w-4 h-4 shrink-0" />
          <span>{lang === "fr" ? "Sponsoring & Pub" : "Sponsoring"}</span>
        </button>
      </div>

      {/* Bookings View */}
      {activeTab === "bookings" && (
        <div className="space-y-4">
          {bookingActionError && (
            <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3 text-xs font-bold">
              {bookingActionError}
            </div>
          )}
          {loadingClientBookings ? (
            <div className="text-center py-10 text-xs font-serif text-amber-800 flex items-center justify-center gap-1.5">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>{lang === "fr" ? "Chargement de vos réservations..." : "Loading your bookings..."}</span>
            </div>
          ) : realClientBookings.length === 0 ? (
            <div className="bg-amber-50/20 border border-dashed border-amber-200 rounded-2xl p-12 text-center text-sm text-amber-900">
              {t.noBookings}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {realClientBookings.map((b) => (
                <div
                  key={b.id}
                  className="bg-white border border-amber-100/80 p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:border-amber-200 transition-colors"
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <h4 className="font-bold text-amber-950 text-sm">{b.providerBusinessName || "Prestataire"}</h4>
                        {b.categoryNameFR && (
                          <span className="text-[10px] text-amber-800 font-medium">
                            {lang === "fr" ? b.categoryNameFR : (b.categoryNameEN || b.categoryNameFR)}
                          </span>
                        )}
                      </div>
                      {getRealStatusBadge(b.status)}
                    </div>

                    <p className="text-xs text-amber-900/80 italic font-serif">"{b.description || "Aucune description fournie"}"</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] text-amber-800/80 pt-2 border-t border-amber-50">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-amber-700" />
                        {new Date(b.scheduledAt).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-amber-700" />
                        {new Date(b.scheduledAt).toLocaleTimeString(lang === "fr" ? "fr-FR" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-3.5 h-3.5 text-amber-700" />
                        <strong className="text-amber-950 font-bold">{b.agreedPrice} FCFA</strong>
                      </span>
                    </div>

                    {b.paymentMethod === "mobile_money" && (
                      <div className="bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 text-[9px] text-amber-800 flex items-start gap-1.5">
                        <Info className="w-3 h-3 shrink-0 mt-0.5" />
                        <span>
                          {lang === "fr"
                            ? "Mobile Money : intégration à venir — confirmation manuelle avec le prestataire."
                            : "Mobile Money: integration coming soon — confirming manually with the provider."}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 mt-4 pt-3 border-t border-amber-50">
                    {b.status === "requested" && (
                      <span className="text-[10px] text-amber-800 bg-amber-50 border border-amber-100 px-2 py-1.5 rounded text-center font-medium">
                        {lang === "fr" ? "En attente de la réponse du prestataire..." : "Waiting for the provider to respond..."}
                      </span>
                    )}

                    {(b.status === "accepted" || b.status === "in_progress") && (
                      <div className="flex flex-col gap-1.5">
                        {!b.clientConfirmedComplete ? (
                          <button
                            onClick={() => handleRealConfirmCompletion(b.id, "client")}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 rounded-xl transition-colors cursor-pointer text-center"
                          >
                            {lang === "fr" ? "🤝 Marquer comme accompli (Confirmer)" : "🤝 Mark Job Completed (Confirm)"}
                          </button>
                        ) : (
                          <span className="text-[10px] text-emerald-800 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded text-center font-medium">
                            {lang === "fr" ? "✓ Vous avez validé la fin du travail. En attente du prestataire..." : "✓ You confirmed completion. Waiting for provider..."}
                          </span>
                        )}
                        {b.providerConfirmedComplete && !b.clientConfirmedComplete && (
                          <span className="text-[9px] text-blue-800 bg-blue-50 border border-blue-100 px-2 py-1 rounded text-center font-medium">
                            {lang === "fr" ? "Le prestataire a déjà confirmé — à vous de jouer !" : "The provider already confirmed — your turn!"}
                          </span>
                        )}
                      </div>
                    )}

                    {b.status === "completed" && (
                      <div className="w-full">
                        {ratedBookings[b.id] ? (
                          <span className="block text-center text-[10px] text-amber-900 bg-amber-50 border border-amber-200/50 py-1.5 rounded font-black uppercase tracking-wider">
                            ★ Évalué avec succès / Rated successfully!
                          </span>
                        ) : (
                          <button
                            onClick={() => setRatingBooking({ id: b.id, providerId: b.providerId, providerName: b.providerBusinessName || "Prestataire" })}
                            className="w-full bg-amber-800 hover:bg-amber-900 text-white font-black text-xs py-2 rounded-xl transition-colors cursor-pointer text-center"
                          >
                            {lang === "fr" ? "★ Noter le prestataire" : "★ Rate the Service"}
                          </button>
                        )}
                      </div>
                    )}

                    {b.status === "cancelled" && (
                      <span className="text-[10px] text-rose-800 bg-rose-50 border border-rose-100 px-2 py-1.5 rounded text-center font-medium block">
                        {lang === "fr" ? "Réservation annulée" : "Booking cancelled"}
                      </span>
                    )}

                    <button
                      onClick={() => setActiveChatProvider(bookingToProviderStub(b))}
                      className="w-full border border-amber-200 text-amber-950 hover:bg-amber-50 font-semibold text-xs py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      {t.chat}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Provider Portal View */}
      {activeTab === "provider" && (
        <div className="space-y-6">
          {/* Simulator Toggle */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="font-bold text-amber-950 text-sm">{t.providerSim}</h4>
                <p className="text-xs text-amber-800 mt-1">{t.providerSimDesc}</p>
              </div>
              <button
                onClick={() => setIsProviderMode(!isProviderMode)}
                className={`w-12 h-6 rounded-full p-1 transition-colors cursor-pointer shrink-0 ${
                  isProviderMode ? "bg-amber-800" : "bg-amber-200"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    isProviderMode ? "translate-x-6" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          {!isProviderMode && currentUser?.role === "provider" && myProviderStatus && myProviderStatus.status !== "approved" && (
            <div
              className={`rounded-2xl p-4 border space-y-1 ${
                myProviderStatus.status === "rejected" ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"
              }`}
            >
              <h4 className={`font-bold text-sm ${myProviderStatus.status === "rejected" ? "text-red-800" : "text-amber-900"}`}>
                {myProviderStatus.status === "rejected"
                  ? (lang === "fr" ? "Profil rejeté" : "Profile rejected")
                  : (lang === "fr" ? "Profil en attente de vérification" : "Profile pending verification")}
              </h4>
              {myProviderStatus.status === "rejected" && (
                <p className="text-xs text-red-800/90 font-serif">
                  {myProviderStatus.rejectionReason ||
                    (lang === "fr"
                      ? "Aucun motif fourni. Contactez l'administration pour plus de détails."
                      : "No reason provided. Contact the administration for details.")}
                </p>
              )}
            </div>
          )}

          {!isProviderMode && currentUser?.role === "provider" && (
            <div className="space-y-3">
              <h4 className="font-bold text-amber-950 text-sm">
                {lang === "fr" ? "Vos demandes de réservation" : "Your booking requests"}
              </h4>

              {bookingActionError && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3 text-xs font-bold">
                  {bookingActionError}
                </div>
              )}

              {loadingProviderBookings ? (
                <div className="text-center py-8 text-xs font-serif text-amber-800 flex items-center justify-center gap-1.5">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{lang === "fr" ? "Chargement..." : "Loading..."}</span>
                </div>
              ) : realProviderBookings.length === 0 ? (
                <p className="text-xs text-amber-800/80">
                  {lang === "fr" ? "Aucune demande reçue pour l'instant." : "No requests received yet."}
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {realProviderBookings.map((b) => (
                    <div key={b.id} className="bg-white border border-amber-100 p-4 rounded-xl shadow-sm space-y-3">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <h5 className="font-bold text-amber-950 text-xs">{b.clientName || (lang === "fr" ? "Client" : "Client")}</h5>
                          {b.clientPhone && <span className="text-[9px] text-amber-800 font-mono block">{b.clientPhone}</span>}
                        </div>
                        {getRealStatusBadge(b.status)}
                      </div>

                      {b.categoryNameFR && (
                        <span className="text-[9px] text-amber-700 font-medium block">
                          {lang === "fr" ? b.categoryNameFR : (b.categoryNameEN || b.categoryNameFR)}
                        </span>
                      )}

                      {b.description && <p className="text-xs text-amber-900">"{b.description}"</p>}

                      <div className="flex items-center justify-between text-[10px] text-amber-800/80 pt-2 border-t border-amber-50">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-amber-700" />
                          {new Date(b.scheduledAt).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}
                        </span>
                        <span className="font-bold text-amber-950 font-mono">{b.agreedPrice} FCFA</span>
                      </div>

                      {b.paymentMethod === "mobile_money" && (
                        <div className="bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 text-[9px] text-amber-800 flex items-start gap-1.5">
                          <Info className="w-3 h-3 shrink-0 mt-0.5" />
                          <span>
                            {lang === "fr"
                              ? "Mobile Money : intégration à venir — confirmation manuelle."
                              : "Mobile Money: integration coming soon — confirming manually."}
                          </span>
                        </div>
                      )}

                      <div className="flex gap-2 pt-2 border-t border-amber-50 w-full">
                        {b.status === "requested" && (
                          <>
                            <button
                              onClick={() => handleRealProviderStatusChange(b.id, "accepted")}
                              className="flex-1 bg-amber-800 hover:bg-amber-900 text-white text-[10px] font-bold py-2 rounded-lg cursor-pointer"
                            >
                              {t.accept}
                            </button>
                            <button
                              onClick={() => handleRealProviderStatusChange(b.id, "cancelled")}
                              className="flex-1 border border-red-200 text-red-800 hover:bg-red-50 text-[10px] font-bold py-2 rounded-lg cursor-pointer"
                            >
                              {lang === "fr" ? "Refuser" : "Decline"}
                            </button>
                          </>
                        )}

                        {(b.status === "accepted" || b.status === "in_progress") && (
                          <div className="flex-1 flex flex-col gap-1.5">
                            {b.status === "accepted" && (
                              <button
                                onClick={() => handleRealProviderStatusChange(b.id, "in_progress")}
                                className="w-full border border-amber-200 text-amber-900 hover:bg-amber-50 text-[10px] font-bold py-2 rounded-lg cursor-pointer"
                              >
                                {lang === "fr" ? "Marquer en cours" : "Mark in progress"}
                              </button>
                            )}
                            {!b.providerConfirmedComplete ? (
                              <button
                                onClick={() => handleRealConfirmCompletion(b.id, "provider")}
                                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white text-[10px] font-bold py-2 rounded-lg cursor-pointer flex items-center justify-center gap-1"
                              >
                                <Check className="w-3 h-3" />
                                {t.complete}
                              </button>
                            ) : (
                              <span className="block text-center text-[10px] text-emerald-800 bg-emerald-50 border border-emerald-100 py-1.5 rounded font-medium">
                                {lang === "fr" ? "✓ Travail validé. En attente du client..." : "✓ Completion confirmed. Waiting for client..."}
                              </span>
                            )}
                            {b.clientConfirmedComplete && !b.providerConfirmedComplete && (
                              <span className="block text-center text-[9px] text-blue-800 bg-blue-50 border border-blue-100 py-1 rounded font-medium">
                                {lang === "fr" ? "Le client a déjà confirmé — à vous de jouer !" : "The client already confirmed — your turn!"}
                              </span>
                            )}
                          </div>
                        )}

                        {b.status === "cancelled" && (
                          <span className="flex-1 text-[10px] text-rose-800 bg-rose-50 border border-rose-100 py-1.5 rounded text-center font-medium">
                            {lang === "fr" ? "Annulée" : "Cancelled"}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {isProviderMode && (
            <div className="space-y-6 animate-fade-in">
              {/* Provider Stats */}
              <div className="grid grid-cols-3 gap-3.5">
                <div className="bg-white border border-amber-100 p-4 rounded-xl shadow-sm text-center">
                  <div className="text-[10px] uppercase font-bold text-amber-800">{t.earnings}</div>
                  <div className="text-lg font-black text-amber-950 mt-1 font-mono">15 000 F</div>
                </div>
                <div className="bg-white border border-amber-100 p-4 rounded-xl shadow-sm text-center">
                  <div className="text-[10px] uppercase font-bold text-amber-800">{t.jobs}</div>
                  <div className="text-lg font-black text-amber-950 mt-1 font-mono">3</div>
                </div>
                <div className="bg-white border border-amber-100 p-4 rounded-xl shadow-sm text-center">
                  <div className="text-[10px] uppercase font-bold text-amber-800">{t.rating}</div>
                  <div className="text-lg font-black text-amber-950 mt-1 font-mono">4.8 ★</div>
                </div>
              </div>

              {/* Incoming Work Requests */}
              <div className="space-y-3">
                <h4 className="font-bold text-amber-950 text-sm">Demandes de travaux reçues</h4>
                {bookings.filter((b) => b.providerId === "p1").length === 0 ? (
                  <p className="text-xs text-amber-800/80">Aucune demande reçue pour l'instant.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {bookings
                      .filter((b) => b.providerId === "p1")
                      .map((b) => (
                        <div key={b.id} className="bg-white border border-amber-100 p-4 rounded-xl shadow-sm space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <h5 className="font-bold text-amber-950 text-xs">{b.customerName}</h5>
                              <span className="text-[9px] text-amber-800 font-mono">{b.customerPhone}</span>
                            </div>
                            {getStatusBadge(b.status)}
                          </div>
                          <p className="text-xs text-amber-900">"{b.description}"</p>

                          <div className="flex gap-2 pt-2 border-t border-amber-50 w-full">
                            {b.status === "PENDING" && (
                              <button
                                onClick={() => handleProviderAction(b.id, "ACCEPTED")}
                                className="flex-1 bg-amber-800 hover:bg-amber-900 text-white text-[10px] font-bold py-2 rounded-lg cursor-pointer"
                              >
                                {t.accept}
                              </button>
                            )}
                            {(b.status === "PAID" || b.status === "ACCEPTED") && (
                              <div className="flex-1">
                                {!b.providerCompleted ? (
                                  <button
                                    onClick={() => handleConfirmCompletion(b.id, "provider")}
                                    className="w-full bg-emerald-700 hover:bg-emerald-800 text-white text-[10px] font-bold py-2 rounded-lg cursor-pointer flex items-center justify-center gap-1"
                                  >
                                    <Check className="w-3 h-3" />
                                    {t.complete}
                                  </button>
                                ) : (
                                  <span className="block text-center text-[10px] text-emerald-800 bg-emerald-50 border border-emerald-100 py-1.5 rounded font-medium">
                                    {lang === "fr" ? "✓ Travail validé. En attente du client..." : "✓ Completion confirmed. Waiting for client..."}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Referral Program */}
      {activeTab === "referral" && (
        <div className="space-y-6">
          <div className="bg-white border border-amber-100 p-6 rounded-3xl shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="space-y-1">
                <h4 className="font-bold text-amber-950 text-base flex items-center gap-2">
                  <Gift className="w-5 h-5 text-amber-800" />
                  {lang === "fr" ? "Parrainez vos voisins à Bertoua" : "Refer your neighbors in Bertoua"}
                </h4>
                <p className="text-xs text-amber-800 font-serif leading-relaxed">
                  {lang === "fr" 
                    ? "Partagez votre code de recommandation unique. Lorsque vos filleuls valident leur première prestation, vous gagnez chacun 1 000 FCFA de crédit Mobile Money !" 
                    : "Share your unique referral code. When your invited neighbors complete their first booking, you both earn 1,000 FCFA in Mobile Money credits!"}
                </p>
              </div>

              {/* Wallet indicator */}
              <div className="bg-amber-100/50 border border-amber-200 rounded-2xl px-4 py-2.5 shrink-0 text-center w-full sm:w-auto">
                <span className="text-[9px] uppercase font-bold text-amber-800 tracking-wider block">{lang === "fr" ? "Crédit Récompenses" : "Rewards Wallet"}</span>
                <span className="text-sm font-black text-amber-950 font-mono">
                  {(currentUser?.rewardsCredit || 0) + (referralsList.filter(r => r.status === "completed").length * 1000)} FCFA
                </span>
              </div>
            </div>

            {/* Code copying utility & WhatsApp Share */}
            <div className="bg-[#FAF8F5] border border-amber-200/60 rounded-2xl p-4 space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-center sm:text-left">
                  <div className="text-[10px] uppercase font-bold text-amber-800">{t.shareCode}</div>
                  <div className="text-lg font-black text-amber-950 tracking-wider font-mono mt-1">
                    {currentUser?.referralCode || "ONE-VILLAGE-237"}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto shrink-0">
                  <button
                    onClick={handleCopyCode}
                    className="flex-1 sm:flex-none bg-amber-800 hover:bg-amber-900 text-white font-black text-xs px-4 py-3 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4 shrink-0" />}
                    <span>{copied ? t.copied : t.copyBtn}</span>
                  </button>
                  
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(
                      lang === "fr" 
                        ? `Salut ! Rejoins-moi sur One Village à Bertoua pour trouver des prestataires de confiance ou proposer tes services. Utilise mon code de parrainage lors de ton inscription : ${currentUser?.referralCode || "ONE-VILLAGE-237"} pour recevoir 1 000 FCFA de crédit !` 
                        : `Hi! Join me on One Village in Bertoua to find trusted local services or offer your skills. Enter my referral code when onboarding: ${currentUser?.referralCode || "ONE-VILLAGE-237"} to receive 1,000 FCFA credit!`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 sm:flex-none bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs px-4 py-3 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-colors text-center"
                  >
                    <Share2 className="w-4 h-4 shrink-0" />
                    <span>{lang === "fr" ? "Partager sur WhatsApp" : "Share on WhatsApp"}</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-amber-50/20 border border-amber-100 p-4 rounded-2xl text-center">
                <span className="text-[10px] font-bold text-amber-800 uppercase block">{lang === "fr" ? "Voisins invités" : "Neighbors invited"}</span>
                <span className="text-xl font-black text-amber-950 block mt-1 font-mono">{referralsList.length}</span>
              </div>
              <div className="bg-amber-50/20 border border-amber-100 p-4 rounded-2xl text-center">
                <span className="text-[10px] font-bold text-amber-800 uppercase block">{lang === "fr" ? "Parrainages réussis" : "Successful referrals"}</span>
                <span className="text-xl font-black text-amber-950 block mt-1 font-mono text-emerald-800">
                  {referralsList.filter(r => r.status === "completed").length}
                </span>
              </div>
            </div>
          </div>

          {/* List of Referred Users */}
          <div className="bg-white border border-amber-100 p-6 rounded-3xl shadow-sm space-y-4">
            <h4 className="font-bold text-amber-950 text-sm uppercase tracking-wide">
              {lang === "fr" ? "Suivi de vos invitations" : "Your Referral Status Tracker"}
            </h4>

            {loadingReferrals ? (
              <div className="text-center py-6 text-xs font-serif text-amber-800 flex items-center justify-center gap-1.5">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{lang === "fr" ? "Chargement des parrainages..." : "Loading referrals..."}</span>
              </div>
            ) : referralsList.length === 0 ? (
              <div className="text-center py-8 text-xs font-serif text-amber-800 border border-dashed border-amber-200 rounded-2xl bg-[#FAF8F5]">
                {lang === "fr" 
                  ? "Vous n'avez pas encore invité de voisins. Partagez votre code pour commencer !" 
                  : "You haven't invited any neighbors yet. Share your code to get started!"}
              </div>
            ) : (
              <div className="divide-y divide-amber-50">
                {referralsList.map((ref) => (
                  <div key={ref.id} className="py-3 flex justify-between items-center text-xs">
                    <div className="space-y-0.5">
                      <span className="font-bold text-amber-950">{ref.referredName}</span>
                      <span className="text-[9px] text-amber-800 block font-mono">
                        {ref.createdAt ? new Date(ref.createdAt).toLocaleDateString() : ""}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                        ref.status === "completed" 
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-100" 
                          : "bg-amber-50 text-amber-800 border border-amber-100"
                      }`}>
                        {ref.status === "completed" 
                          ? (lang === "fr" ? "Prestation validée" : "Completed") 
                          : (lang === "fr" ? "En attente de paiement" : "Pending booking")}
                      </span>

                      <span className="font-mono font-black text-amber-950">
                        {ref.status === "completed" ? "+1 000 F" : "0 F"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Trusted Reviewer / Badge status card */}
          {(() => {
            const clientCompleted = bookings.filter(b => b.customerPhone === currentUser?.phone && b.status === "COMPLETED").length;
            const hasReviews = Object.keys(ratedBookings).length >= 1 || referralsList.length > 0; // Fallback or active review check
            const earnsTrustedBadge = clientCompleted >= 1;

            return (
              <div className="bg-gradient-to-br from-amber-50 to-[#FAF8F5] border border-amber-200/80 p-5 rounded-3xl space-y-3.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-amber-950 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-amber-700" />
                    {lang === "fr" ? "Statut de Membre de Confiance" : "Verified Community Trust Status"}
                  </h4>
                  {earnsTrustedBadge ? (
                    <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase px-2.5 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      {lang === "fr" ? "Actif" : "Active Badge"}
                    </span>
                  ) : (
                    <span className="bg-amber-100 text-amber-800 text-[9px] font-bold uppercase px-2 py-0.5 rounded border border-amber-200">
                      {lang === "fr" ? "En attente" : "Pending"}
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-amber-900 leading-relaxed font-serif">
                  {lang === "fr" 
                    ? "Pour garantir la fiabilité des avis sur One Village Bertoua, nous décernons un badge 'Évaluateur de Confiance' aux membres ayant effectué au moins une prestation réelle. Ce badge est affiché automatiquement à côté de tous vos commentaires publics !" 
                    : "To ensure review reliability on One Village Bertoua, we award a 'Trusted Reviewer' badge to members with at least one completed real booking. This badge is displayed automatically next to all your public feedback comments!"}
                </p>

                <div className="border-t border-amber-200/60 pt-3.5 flex justify-between items-center text-[10px] font-mono text-amber-900/80">
                  <span>{lang === "fr" ? "Vos prestations terminées :" : "Your completed bookings :"} <strong>{clientCompleted} / 1</strong></span>
                  <span>{lang === "fr" ? "Statut du badge :" : "Badge status :"} <strong className={earnsTrustedBadge ? "text-emerald-700" : "text-amber-800"}>{earnsTrustedBadge ? (lang === "fr" ? "DÉBLOQUÉ" : "EARNED") : (lang === "fr" ? "BLOQUÉ" : "LOCKED")}</strong></span>
                </div>
              </div>
            );
          })()}

          {/* Badges and milestones */}
          <div className="space-y-3">
            <h4 className="font-bold text-amber-950 text-sm flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-800" />
              {t.badgesTitle}
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Badge 1 */}
              <div className="bg-white border border-amber-100 p-4 rounded-xl flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-lg shrink-0">
                  🥉
                </div>
                <div>
                  <h5 className="font-bold text-amber-950 text-xs">{t.badgePioneer}</h5>
                  <p className="text-[10px] text-amber-800/80 mt-0.5 leading-snug">{t.badgePioneerDesc}</p>
                </div>
              </div>

              {/* Badge 2 */}
              {(() => {
                const completedCount = referralsList.filter(r => r.status === "completed").length;
                const earned = completedCount >= 3;
                return (
                  <div className={`bg-white border border-amber-100 p-4 rounded-xl flex items-start gap-3 transition-opacity ${earned ? "" : "opacity-50"}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0 border ${
                      earned ? "bg-yellow-50 border-yellow-300" : "bg-neutral-100 border-neutral-300 filter grayscale"
                    }`}>
                      🥈
                    </div>
                    <div>
                      <h5 className="font-bold text-amber-950 text-xs flex items-center gap-1.5">
                        <span>{t.badgeSage}</span>
                        {!earned && <span className="text-[8px] bg-amber-50 text-amber-800 px-1 py-0.5 rounded font-normal font-mono">({completedCount}/3)</span>}
                      </h5>
                      <p className="text-[10px] text-amber-800/80 mt-0.5 leading-snug">{t.badgeSageDesc}</p>
                    </div>
                  </div>
                );
              })()}

              {/* Badge 3 */}
              {(() => {
                const completedCount = referralsList.filter(r => r.status === "completed").length;
                const providerCompletedCount = bookings.filter(b => b.status === "COMPLETED").length;
                const earned = completedCount >= 10 || providerCompletedCount >= 5;
                return (
                  <div className={`bg-white border border-amber-100 p-4 rounded-xl flex items-start gap-3 transition-opacity ${earned ? "" : "opacity-50"}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0 border ${
                      earned ? "bg-amber-100 border-amber-400" : "bg-neutral-100 border-neutral-200 filter grayscale"
                    }`}>
                      🥇
                    </div>
                    <div>
                      <h5 className="font-bold text-amber-950 text-xs flex items-center gap-1">
                        <span>{t.badgeElder}</span>
                        {!earned && <span className="text-[8px] bg-amber-50 text-amber-800 px-1 py-0.5 rounded font-normal font-mono">Bloqué</span>}
                      </h5>
                      <p className="text-[10px] text-amber-800/80 mt-0.5 leading-snug">{t.badgeElderDesc}</p>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Advertising / Sponsoring Portal View */}
      {activeTab === "advertising" && (
        <div className="space-y-6">
          <div className="bg-amber-950 text-amber-50 rounded-3xl p-6 sm:p-8 border border-amber-900 shadow-md space-y-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-800/20 rounded-full blur-2xl -mr-10 -mt-10" />
            <div className="space-y-1.5">
              <h2 className="text-lg font-black uppercase tracking-wider text-amber-300 flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-amber-400 shrink-0" />
                <span>{lang === "fr" ? "Sponsoring & Publicités — Bertoua" : "Sponsorship & Promoted Ads"}</span>
              </h2>
              <p className="text-xs font-serif text-amber-100/90 max-w-2xl">
                {lang === "fr"
                  ? "Propulsez vos services en tête de liste ! Créez des bannières sponsorisées visibles par tout Bertoua sur la page d'accueil ou dans votre catégorie. Payez facilement via Mobile Money."
                  : "Boost your visual reach! Launch sponsor banners pinned on the Home page or inside specific categories. Track real impressions and pay via Mobile Money."}
              </p>
            </div>
          </div>

          {/* 1. Bento Box Performance Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white border border-amber-100 p-4 rounded-2xl text-center">
              <span className="text-[10px] text-amber-700 font-bold uppercase block">Impressions</span>
              <span className="text-lg sm:text-2xl font-black text-amber-950 font-mono mt-1 block">
                {providerAds.reduce((acc, curr) => acc + (curr.impressions || 0), 0)}
              </span>
              <span className="text-[9px] text-amber-500/80 block mt-0.5">{lang === "fr" ? "Vues bannières" : "Banner views"}</span>
            </div>
            <div className="bg-white border border-amber-100 p-4 rounded-2xl text-center">
              <span className="text-[10px] text-amber-700 font-bold uppercase block">Clics</span>
              <span className="text-lg sm:text-2xl font-black text-amber-950 font-mono mt-1 block">
                {providerAds.reduce((acc, curr) => acc + (curr.clicks || 0), 0)}
              </span>
              <span className="text-[9px] text-amber-500/80 block mt-0.5">{lang === "fr" ? "Visites profil" : "Profile visits"}</span>
            </div>
            <div className="bg-white border border-amber-100 p-4 rounded-2xl text-center">
              <span className="text-[10px] text-amber-700 font-bold uppercase block">Investi</span>
              <span className="text-lg sm:text-2xl font-black text-red-800 font-mono mt-1 block">
                {providerAds.reduce((acc, curr) => acc + (curr.budgetFCFA || 0), 0).toLocaleString()}
              </span>
              <span className="text-[9px] text-amber-500/80 block mt-0.5">FCFA</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* 2. New Ad Form */}
            <div className="lg:col-span-5 bg-white border border-amber-100 p-5 rounded-3xl shadow-sm space-y-4">
              <div>
                <h3 className="font-black text-amber-950 text-xs uppercase tracking-wider">
                  {lang === "fr" ? "Créer une Publicité Sponsorisée" : "Launch New Campaign"}
                </h3>
                <p className="text-[10px] text-amber-700 font-serif leading-relaxed mt-0.5">
                  {lang === "fr" ? "Saisissez les détails pour planifier votre diffusion." : "Enter requirements to launch your sponsor flyer."}
                </p>
              </div>

              <form onSubmit={handleCreateAd} className="space-y-4">
                {/* Placement */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-amber-900 uppercase">
                    {lang === "fr" ? "Emplacement de la Publicité" : "Ad Placement / Targeting"}
                  </label>
                  <select
                    value={newAdPlacement}
                    onChange={(e) => setNewAdPlacement(e.target.value)}
                    className="w-full bg-amber-50/20 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-800"
                  >
                    <option value="home">{lang === "fr" ? "Page d'accueil (Carousel Sponsoring)" : "Home Screen (Top Carousel)"}</option>
                    <option value="AGRICULTURE">Agriculture & Labour</option>
                    <option value="TRANSPORT">Transport & Moto-Taxi</option>
                    <option value="TAILORING">Couture & Mode</option>
                    <option value="CONSTRUCTION">Maçonnerie & Construction</option>
                    <option value="HOME_HELP">Aide Ménagère</option>
                    <option value="CHILDCARE">Nounou & Garde</option>
                  </select>
                </div>

                {/* Budget selector */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-amber-900 uppercase">
                    {lang === "fr" ? "Budget Publicitaire (FCFA)" : "Budget (FCFA)"}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[5000, 10000, 20000].map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setNewAdBudget(b)}
                        className={`py-2 text-xs rounded-xl border transition-colors font-mono font-bold cursor-pointer text-center ${
                          newAdBudget === b
                            ? "bg-amber-800 text-white border-amber-800"
                            : "bg-amber-50/20 border-amber-200 text-amber-950 hover:bg-amber-50"
                        }`}
                      >
                        {b.toLocaleString()}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    value={newAdBudget}
                    onChange={(e) => setNewAdBudget(Number(e.target.value))}
                    min="1000"
                    placeholder="Montant personnalisé"
                    className="w-full bg-amber-50/20 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-800 mt-2 font-mono"
                  />
                </div>

                {/* Date range */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-amber-900 uppercase">
                      {lang === "fr" ? "Début" : "Start Date"}
                    </label>
                    <input
                      type="date"
                      value={newAdStartDate}
                      onChange={(e) => setNewAdStartDate(e.target.value)}
                      className="w-full bg-amber-50/20 border border-amber-200 rounded-xl p-2 text-xs text-amber-950 font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-amber-900 uppercase">
                      {lang === "fr" ? "Fin" : "End Date"}
                    </label>
                    <input
                      type="date"
                      value={newAdEndDate}
                      onChange={(e) => setNewAdEndDate(e.target.value)}
                      className="w-full bg-amber-50/20 border border-amber-200 rounded-xl p-2 text-xs text-amber-950 font-mono"
                    />
                  </div>
                </div>

                {/* Preset Flyers & custom input */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-amber-900 uppercase">
                    {lang === "fr" ? "Visuel de l'annonce (Image Flyer)" : "Flyer Visual (Image URL)"}
                  </label>
                  
                  {/* Visual presets */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { name: "Agro", url: "https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&w=600&q=80" },
                      { name: "Moto", url: "https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=600&q=80" },
                      { name: "Couture", url: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=600&q=80" },
                      { name: "Maçon", url: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=600&q=80" }
                    ].map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setNewAdMediaUrl(preset.url)}
                        className={`border rounded-lg overflow-hidden h-10 cursor-pointer relative group transition-transform ${
                          newAdMediaUrl === preset.url ? "ring-2 ring-amber-800" : "border-amber-200"
                        }`}
                        title={preset.name}
                      >
                        <img src={preset.url} alt={preset.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        <span className="absolute inset-0 bg-black/40 text-[8px] text-white flex items-center justify-center font-bold">
                          {preset.name}
                        </span>
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    value={newAdMediaUrl}
                    onChange={(e) => setNewAdMediaUrl(e.target.value)}
                    placeholder="URL de l'image personnalisée"
                    className="w-full bg-amber-50/20 border border-amber-200 rounded-xl p-2 text-[10px] text-amber-950 font-mono focus:outline-none focus:ring-1 focus:ring-amber-800"
                  />
                </div>

                {/* Form Submit */}
                <button
                  type="submit"
                  disabled={createAdSubmitting}
                  className="w-full bg-amber-800 hover:bg-amber-900 text-white font-bold rounded-xl text-xs py-3 shadow-sm cursor-pointer transition-all text-center flex items-center justify-center gap-1.5"
                >
                  {createAdSubmitting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <Megaphone className="w-4 h-4 shrink-0" />
                      <span>{lang === "fr" ? "Planifier & Payer (MoMo)" : "Schedule & Pay (MoMo)"}</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* 3. Campaign list */}
            <div className="lg:col-span-7 bg-white border border-amber-100 p-5 rounded-3xl shadow-sm space-y-4">
              <div>
                <h3 className="font-black text-amber-950 text-xs uppercase tracking-wider">
                  {lang === "fr" ? "Vos Campagnes Publicitaires" : "Your Promotion History"}
                </h3>
                <p className="text-[10px] text-amber-700 font-serif leading-relaxed mt-0.5">
                  {lang === "fr" ? "Suivez les performances de vos bannières actives à Bertoua." : "Monitor results and payments of your promotions."}
                </p>
              </div>

              {loadingAds ? (
                <div className="text-center py-12 text-xs font-serif text-amber-800 flex items-center justify-center gap-1.5">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{lang === "fr" ? "Chargement des campagnes..." : "Loading campaigns..."}</span>
                </div>
              ) : providerAds.length === 0 ? (
                <div className="text-center py-12 text-xs font-serif text-amber-800 border border-dashed border-amber-200 bg-amber-50/10 rounded-2xl">
                  {lang === "fr" ? "Aucune publicité sponsorisée créée pour le moment." : "No promotional banners registered yet."}
                </div>
              ) : (
                <div className="space-y-4">
                  {providerAds.map((ad) => (
                    <div key={ad.id} className="border border-amber-100 rounded-2xl p-4 bg-amber-50/10 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                      <div className="w-24 h-24 rounded-xl overflow-hidden border border-amber-100 shrink-0 bg-amber-100/30">
                        <img src={ad.mediaUrl} alt="Flyer" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>

                      <div className="flex-1 space-y-2.5 w-full">
                        <div className="flex justify-between items-start flex-wrap gap-2">
                          <div>
                            <span className="text-[10px] font-mono text-amber-800">CAMPAGNE: {ad.id}</span>
                            <h4 className="text-xs font-bold text-amber-950">
                              {lang === "fr" ? "Ciblage :" : "Targeting:"} <span className="uppercase text-amber-900">{ad.placement === "home" ? "Accueil (Carousel)" : ad.placement}</span>
                            </h4>
                          </div>

                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                            ad.status === "approved" ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
                            ad.status === "pending_approval" ? "bg-amber-100 text-amber-800 border-amber-200" :
                            ad.status === "rejected" ? "bg-red-100 text-red-800 border-red-200" :
                            "bg-gray-100 text-gray-800 border-gray-200"
                          }`}>
                            {ad.status === "approved" ? (lang === "fr" ? "Actif / Diffusé" : "Live / Active") :
                             ad.status === "pending_approval" ? (lang === "fr" ? "En attente admin" : "Review") :
                             ad.status === "rejected" ? (lang === "fr" ? "Rejeté" : "Rejected") :
                             (lang === "fr" ? "Non Payé" : "Unpaid / Draft")}
                          </span>
                        </div>

                        {/* Details grid */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[9px] font-mono text-amber-900">
                          <div>
                            <strong>Budget:</strong> <span className="font-bold text-red-800">{ad.budgetFCFA?.toLocaleString()} FCFA</span>
                          </div>
                          <div>
                            <strong>Période:</strong> <span>{ad.startDate} / {ad.endDate}</span>
                          </div>
                          {ad.status === "approved" ? (
                            <>
                              <div className="text-emerald-800 font-bold">
                                <strong>Vues:</strong> <span>{ad.impressions || 0}</span>
                              </div>
                              <div className="text-emerald-800 font-bold">
                                <strong>Clics:</strong> <span>{ad.clicks || 0}</span>
                              </div>
                            </>
                          ) : (
                            <div className="col-span-2">
                              <strong>Transaction:</strong> <span className="font-mono text-amber-950 text-[8px]">{ad.momoTransactionId || "N/A"}</span>
                            </div>
                          )}
                        </div>

                        {/* Rejection alert */}
                        {ad.status === "rejected" && ad.rejectionReason && (
                          <div className="bg-red-50 border border-red-100 rounded-lg p-2 text-[9px] text-red-800 font-serif">
                            <strong>{lang === "fr" ? "Motif de refus :" : "Refusal motive:"}</strong> {ad.rejectionReason}
                          </div>
                        )}

                        {/* Pay campaign button */}
                        {ad.status === "pending_payment" && (
                          <button
                            onClick={() => {
                              setPayingAd(ad);
                              setAdPaymentPhone(currentUser?.phone || "+237 671 22 33 44");
                            }}
                            className="bg-red-800 hover:bg-red-900 text-white font-black text-[10px] px-3.5 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer w-full justify-center transition-colors shadow-sm"
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                            <span>{lang === "fr" ? "Payer le budget via Mobile Money" : "Pay with Mobile Money"}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Money Ad Spend Payment Simulation Modal */}
      {payingAd && (
        <div className="fixed inset-0 bg-amber-950/40 backdrop-blur-xs z-50 overflow-y-auto p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-xl border border-amber-100 space-y-4 relative mx-auto my-6 sm:my-10">
            <button
              onClick={() => setPayingAd(null)}
              className="absolute top-4 right-4 p-2 text-amber-900/60 hover:text-amber-950 rounded-full cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-1.5">
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto text-xl text-amber-800 font-black">
                💸
              </div>
              <h3 className="text-md font-black uppercase tracking-wider text-amber-950">
                {lang === "fr" ? "Paiement de Sponsoring" : "Ad Spend Payment"}
              </h3>
              <p className="text-xs text-amber-800 font-serif leading-relaxed max-w-sm mx-auto">
                {lang === "fr"
                  ? `Simulez le paiement Mobile Money de ${payingAd.budgetFCFA?.toLocaleString()} FCFA pour la diffusion à Bertoua.`
                  : `Simulate the Mobile Money ad campaign payment of ${payingAd.budgetFCFA?.toLocaleString()} FCFA.`}
              </p>
            </div>

            <form onSubmit={handlePayAd} className="space-y-4 pt-1">
              {/* Payment Method Selector */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-amber-900 uppercase">
                  {lang === "fr" ? "Opérateur de Paiement" : "Payment Operator"}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setAdPaymentMethod("MTN_MOMO")}
                    className={`p-3 rounded-xl border flex flex-col items-center gap-1 cursor-pointer text-center transition-all ${
                      adPaymentMethod === "MTN_MOMO"
                        ? "border-amber-800 bg-amber-50/50"
                        : "border-amber-100 hover:border-amber-200"
                    }`}
                  >
                    <span className="w-3 h-3 rounded-full bg-amber-500 border border-amber-600 block shrink-0" />
                    <span className="text-xs font-black text-amber-950">MTN MoMo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdPaymentMethod("ORANGE_MONEY")}
                    className={`p-3 rounded-xl border flex flex-col items-center gap-1 cursor-pointer text-center transition-all ${
                      adPaymentMethod === "ORANGE_MONEY"
                        ? "border-orange-500 bg-orange-50/20"
                        : "border-amber-100 hover:border-amber-200"
                    }`}
                  >
                    <span className="w-3 h-3 rounded-full bg-orange-500 border border-orange-600 block shrink-0" />
                    <span className="text-xs font-black text-amber-950">Orange Money</span>
                  </button>
                </div>
              </div>

              {/* Phone number */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-amber-900 uppercase">
                  {lang === "fr" ? "Numéro de Téléphone (+237)" : "Phone Number (+237)"}
                </label>
                <input
                  required
                  type="text"
                  value={adPaymentPhone}
                  onChange={(e) => setAdPaymentPhone(e.target.value)}
                  placeholder="ex: +237 677 89 45 12"
                  className="w-full bg-amber-50/20 border border-amber-200 rounded-xl p-3 text-xs font-mono text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-800"
                />
              </div>

              {/* Submit Payment button */}
              <button
                type="submit"
                disabled={adPaymentSubmitting}
                className="w-full bg-amber-800 hover:bg-amber-900 text-white font-black rounded-xl text-xs py-3.5 transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
              >
                {adPaymentSubmitting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>
                      {lang === "fr" 
                        ? `Valider le paiement (${payingAd.budgetFCFA?.toLocaleString()} FCFA)` 
                        : `Confirm Payment (${payingAd.budgetFCFA?.toLocaleString()} FCFA)`}
                    </span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Interactive Rating & Review Modal (Phase 9 Integration) */}
      {ratingBooking && (
        <div id="rating-modal-overlay" className="fixed inset-0 bg-amber-950/40 backdrop-blur-xs z-50 overflow-y-auto p-4">
          <div id="rating-modal" className="bg-white rounded-3xl p-6 w-full max-w-md shadow-xl border border-amber-100 space-y-4 relative animate-fade-in mx-auto my-6 sm:my-10">
            <button
              onClick={() => { setRatingBooking(null); setRateErrorMsg(""); }}
              className="absolute top-4 right-4 p-2 text-amber-900/60 hover:text-amber-950 rounded-full cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-2">
              <span className="text-4xl">🎉</span>
              <h3 className="text-lg font-bold text-amber-950">
                {lang === "fr" ? "Évaluez le service !" : "Rate the Service!"}
              </h3>
              <p className="text-xs text-amber-800 leading-relaxed font-serif">
                {lang === "fr" 
                  ? `Votre avis sur ${ratingBooking.providerName} aide la communauté de Bertoua à grandir en toute confiance !` 
                  : `Your review of ${ratingBooking.providerName} helps the Bertoua community grow in trust!`}
              </p>
            </div>

            <form onSubmit={handleRateSubmit} className="space-y-4">
              {rateErrorMsg && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3 text-xs font-bold">
                  {rateErrorMsg}
                </div>
              )}

              {/* Stars selector */}
              <div className="flex justify-center gap-2 py-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRateStars(star)}
                    className="text-3xl hover:scale-110 transition-transform cursor-pointer focus:outline-none"
                  >
                    <span className={star <= rateStars ? "text-amber-500 font-bold" : "text-amber-200"}>★</span>
                  </button>
                ))}
              </div>

              {/* Comment field */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-amber-900">
                  {lang === "fr" ? "Votre commentaire" : "Your comment"}
                </label>
                <textarea
                  rows={3}
                  value={rateComment}
                  onChange={(e) => setRateComment(e.target.value)}
                  placeholder={lang === "fr" ? "ex: Très ponctuel et travail propre, je recommande vivement ! (optionnel)" : "ex: Very punctual and clean work, highly recommended! (optional)"}
                  className="w-full bg-amber-50/30 border border-amber-200 rounded-xl p-3 text-sm text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                />
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setRatingBooking(null); setRateErrorMsg(""); }}
                  className="flex-1 py-3 border border-amber-200 text-amber-900 hover:bg-amber-50 font-medium rounded-xl text-xs transition-colors cursor-pointer"
                >
                  {lang === "fr" ? "Annuler" : "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={rateSubmitting}
                  className="flex-1 bg-amber-800 hover:bg-amber-900 text-white font-bold rounded-xl text-xs py-3 transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {rateSubmitting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    lang === "fr" ? "Envoyer la note" : "Submit Rating"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
