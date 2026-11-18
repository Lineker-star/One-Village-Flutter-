/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { ServiceProvider, ServiceCategory } from "../types.ts";
import { CATEGORY_DETAILS, BERTOUA_NEIGHBORHOODS } from "../data/bertouaData.ts";
import { supabaseService } from "../lib/supabase.ts";
import { toTitleCase } from "../lib/textFormat.ts";
import { 
  Star, 
  MapPin, 
  CheckCircle, 
  Languages, 
  MessageSquare, 
  Calendar, 
  ArrowLeft, 
  Phone, 
  ExternalLink, 
  Award, 
  Clock, 
  ShieldCheck, 
  Compass, 
  Check, 
  ThumbsUp, 
  Send,
  Lock,
  RefreshCw
} from "lucide-react";

interface ProviderProfileProps {
  provider: ServiceProvider;
  lang: "fr" | "en";
  onBack: () => void;
  onBook: () => void;
  onChat: () => void;
  isLoggedIn?: boolean;
  currentUser?: any;
  isProviderSimulated?: boolean;
}

export default function ProviderProfile({
  provider: initialProvider,
  lang,
  onBack,
  onBook,
  onChat,
  isLoggedIn = false,
  currentUser = null,
  isProviderSimulated = false
}: ProviderProfileProps) {
  // Fetches the real record from Supabase (respecting RLS: authenticated users get full details on
  // approved providers, anonymous users get the public_provider_cards-restricted view — see
  // supabaseService.getProviderFullRecord) and replaces the initial prop once it resolves. `provider`
  // is shadowed here so the rest of this component (which references `provider.*` throughout)
  // automatically uses the freshest data without needing any other changes.
  const [provider, setProvider] = useState<ServiceProvider>(initialProvider);

  useEffect(() => {
    setProvider(initialProvider);
    let active = true;
    supabaseService
      .getProviderFullRecord(initialProvider.id)
      .then((full) => {
        if (active && full) setProvider(full);
      })
      .catch((err) => console.error("Failed to load full provider record:", err));
    return () => {
      active = false;
    };
  }, [initialProvider.id]);

  const cat = CATEGORY_DETAILS[provider.category];
  const neighborhood = BERTOUA_NEIGHBORHOODS.find((n) => n.id === provider.neighborhoodId);
  const neighborhoodDisplay = neighborhood ? neighborhood.name : toTitleCase(provider.neighborhoodId);
  const [showFullPhone, setShowFullPhone] = useState(false);
  const [copied, setCopied] = useState(false);

  // Custom Interactive WhatsApp Booking Request states
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [waDate, setWaDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  });
  const [waTime, setWaTime] = useState("09:00");
  const [waDescription, setWaDescription] = useState(() => {
    return lang === "fr" 
      ? `Bonjour, je souhaiterais solliciter vos services de ${cat?.nameFR || "prestataire"} pour une intervention.`
      : `Hello, I would like to request your ${cat?.nameEN || "provider"} services for a task.`;
  });

  const handleOpenWhatsApp = () => {
    const fullMessage = lang === "fr"
      ? `Bonjour ${provider.name},

Je vous contacte depuis la plateforme One Village concernant vos services de ${cat?.nameFR || "prestataire"}.

Voici les détails de ma demande de réservation par WhatsApp :
- Date souhaitée : ${waDate}
- Heure souhaitée : ${waTime}
- Quartier d'intervention : ${neighborhoodDisplay}, Bertoua
- Description précise du besoin : ${waDescription}

Merci de me confirmer votre disponibilité et votre tarif !`
      : `Hello ${provider.name},

I am contacting you from the One Village platform regarding your ${cat?.nameEN || "provider"} services.

Here are the details of my WhatsApp booking request:
- Desired Date: ${waDate}
- Desired Time: ${waTime}
- Intervention Neighborhood: ${neighborhoodDisplay}, Bertoua
- Precise description of need: ${waDescription}

Thank you for confirming your availability and rate!`;

    const cleanPhone = (provider.whatsappNumber || provider.phone).replace(/[\s+]/g, "");
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(fullMessage)}`;

    // Log a real booking row for transparency and dispute management (same Supabase-backed flow
    // as BookingModal — see supabaseService.createBooking). Fire-and-forget: a failure here (e.g.
    // the provider isn't actually approved yet) shouldn't block opening WhatsApp.
    if (isLoggedIn && currentUser) {
      supabaseService
        .createBooking({
          clientId: currentUser.id,
          providerId: provider.id,
          categorySlug: provider.category,
          paymentMethod: "cash",
          agreedPrice: provider.rateFCFA || 0,
          scheduledAt: new Date(`${waDate}T${waTime || "09:00"}`).toISOString(),
          description: `[Demande via WhatsApp] ${waDescription}`,
        })
        .catch((err) => console.error("Error logging WhatsApp booking to Supabase:", err));
    }

    window.open(url, "_blank");
    setShowWhatsAppModal(false);
  };

  const [reviewsList, setReviewsList] = useState<any[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [responseTextMap, setResponseTextMap] = useState<Record<string, string>>({});
  const [submittingResponseMap, setSubmittingResponseMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Log profile view analytics on backend (still mock/legacy, unrelated to ratings)
    fetch(`/api/providers/${provider.id}/view`, { method: "POST" })
      .catch(err => console.error("Error logging profile view", err));

    if (isLoggedIn) {
      setLoadingReviews(true);
      supabaseService
        .getProviderRatings(provider.id)
        .then((data) => {
          setReviewsList(data);
          setLoadingReviews(false);
        })
        .catch((err) => {
          console.error("Error fetching reviews:", err);
          setLoadingReviews(false);
        });
    }
  }, [provider.id, isLoggedIn]);

  const handleResponseSubmit = async (reviewId: string) => {
    const text = responseTextMap[reviewId];
    if (!text || !text.trim()) return;

    setSubmittingResponseMap(prev => ({ ...prev, [reviewId]: true }));
    try {
      await supabaseService.respondToRating(reviewId, text.trim());
      setReviewsList(prev => prev.map(r => r.id === reviewId ? { ...r, response: text.trim() } : r));
      setResponseTextMap(prev => ({ ...prev, [reviewId]: "" }));
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Error submitting response");
    } finally {
      setSubmittingResponseMap(prev => ({ ...prev, [reviewId]: false }));
    }
  };

  const isOwnProfile = currentUser?.id === provider.id || (isProviderSimulated && provider.id === "p1");
  const canRespond = isLoggedIn && isOwnProfile;

  // Custom prefilled greetings for WhatsApp depending on language
  const prefilledGreeting = {
    fr: `Bonjour ${provider.name}, je vous contacte depuis la plateforme One Village concernant vos services de ${cat?.nameFR || "prestataire"}.`,
    en: `Hello ${provider.name}, I am contacting you from the One Village platform regarding your ${cat?.nameEN || "provider"} services.`
  }[lang];

  const whatsappUrl = `https://wa.me/${(provider.whatsappNumber || provider.phone).replace(/[\s+]/g, "")}?text=${encodeURIComponent(prefilledGreeting)}`;

  const t = {
    fr: {
      verified: "Prestataire Certifié",
      notVerified: "En cours de certification",
      about: "À propos de",
      experience: "Services proposés & Tarification",
      locationTitle: "Localisation & Quartier",
      ratingBreakdown: "Avis des villageois",
      recentReviews: "Commentaires récents",
      bookBtn: "Obtenir ce service",
      chatBtn: "Chat In-App",
      callBtn: "Appeler",
      whatsappBtn: "WhatsApp direct",
      pricingDetails: "Détails du tarif",
      languagesSpoken: "Langues parlées",
      avgRating: "Note moyenne",
      reviewsCount: "avis vérifiés",
      verifiedLocal: "Identité validée par One Village",
      backToList: "Retour aux prestataires",
      copySuccess: "Numéro copié !",
      socialLinks: "Réseaux Sociaux",
      noReviews: "Aucun commentaire pour le moment. Soyez le premier !",
      mapInstructions: "Situé à Bertoua. Cliquez pour ouvrir la navigation.",
      servicesProvided: "Services inclus",
      activeBooking: "Prendre rendez-vous",
      viewOnMap: "Ouvrir Google Maps"
    },
    en: {
      verified: "Certified Provider",
      notVerified: "Pending Certification",
      about: "About",
      experience: "Offered Services & Pricing",
      locationTitle: "Location & Neighborhood",
      ratingBreakdown: "Villagers' Feedback",
      recentReviews: "Recent Comments",
      bookBtn: "Get this service",
      chatBtn: "In-App Chat",
      callBtn: "Call Now",
      whatsappBtn: "Direct WhatsApp",
      pricingDetails: "Pricing Details",
      languagesSpoken: "Languages",
      avgRating: "Average Rating",
      reviewsCount: "verified reviews",
      verifiedLocal: "Identity validated by One Village",
      backToList: "Back to providers",
      copySuccess: "Number copied!",
      socialLinks: "Social Networks",
      noReviews: "No reviews yet. Be the first to review!",
      mapInstructions: "Located in Bertoua. Click to open navigation.",
      servicesProvided: "Services included",
      activeBooking: "Book Appointment",
      viewOnMap: "Open Google Maps"
    }
  }[lang];

  // Map representation with a custom high-quality coordinate tracker
  const mockCoordinates = {
    mokolo: { x: "42%", y: "45%" },
    tigaza: { x: "55%", y: "30%" },
    ndouan: { x: "25%", y: "65%" },
    enia: { x: "70%", y: "50%" },
    kano: { x: "48%", y: "25%" },
    gbazi: { x: "15%", y: "35%" },
    yademe: { x: "65%", y: "75%" },
    tengue: { x: "35%", y: "80%" }
  }[provider.neighborhoodId] || { x: "50%", y: "50%" };

  // Simulated professional past work gallery
  const galleryImages = {
    [ServiceCategory.AGRICULTURE]: [
      "https://images.unsplash.com/photo-1592417817098-8f3d6eb19675?auto=format&fit=crop&w=400&q=80",
      "https://images.unsplash.com/photo-1593113598332-cd288d649433?auto=format&fit=crop&w=400&q=80",
      "https://images.unsplash.com/photo-1595974482597-4b8da8879bc5?auto=format&fit=crop&w=400&q=80"
    ],
    [ServiceCategory.TRANSPORT]: [
      "https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=400&q=80",
      "https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=400&q=80",
      "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=400&q=80"
    ],
    [ServiceCategory.TAILORING]: [
      "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=400&q=80",
      "https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=400&q=80",
      "https://images.unsplash.com/photo-1617137968427-85924c800a22?auto=format&fit=crop&w=400&q=80"
    ],
    [ServiceCategory.CONSTRUCTION]: [
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=400&q=80",
      "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=400&q=80",
      "https://images.unsplash.com/photo-1590069261209-f8e9b8642343?auto=format&fit=crop&w=400&q=80"
    ],
    [ServiceCategory.CHILDCARE]: [
      "https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=400&q=80",
      "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=400&q=80",
      "https://images.unsplash.com/photo-1485546246426-74dc88dec4d9?auto=format&fit=crop&w=400&q=80"
    ],
    [ServiceCategory.HOME_HELP]: [
      "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=400&q=80",
      "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=400&q=80",
      "https://images.unsplash.com/photo-1563453392212-326f5e854473?auto=format&fit=crop&w=400&q=80"
    ],
    [ServiceCategory.EDUCATION]: [
      "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?auto=format&fit=crop&w=400&q=80",
      "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=400&q=80",
      "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=400&q=80"
    ],
    [ServiceCategory.HEALTH]: [
      "https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=400&q=80",
      "https://images.unsplash.com/photo-1584515901107-d1776ce354e8?auto=format&fit=crop&w=400&q=80",
      "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=400&q=80"
    ]
  }[provider.category] || [
    "https://images.unsplash.com/photo-1593113598332-cd288d649433?auto=format&fit=crop&w=400&q=80",
    "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=400&q=80"
  ];

  // Specific micro-services checklist based on category
  const servicesChecklist = {
    [ServiceCategory.AGRICULTURE]: [
      { fr: "Labour et buttage professionnels", en: "Professional tilling and hilling" },
      { fr: "Préparation des sols pour manioc & cacao", en: "Soil preparation for cassava & cocoa" },
      { fr: "Application d'engrais organiques locaux", en: "Local organic fertilizer application" },
      { fr: "Récolte rapide et mise en sacs", en: "Fast harvesting and bagging" }
    ],
    [ServiceCategory.TRANSPORT]: [
      { fr: "Transport rapide sécurisé (Bertoua centre & périphérie)", en: "Safe and fast transport (Bertoua center & outskirts)" },
      { fr: "Courses urgentes et livraison de colis", en: "Urgent runs and parcel deliveries" },
      { fr: "Transport régulier de marchandises de marché", en: "Regular transport of market goods" },
      { fr: "Disponibilité tôt le matin et tard le soir", en: "Early morning and late evening availability" }
    ],
    [ServiceCategory.TAILORING]: [
      { fr: "Confection de robes de mariage en pagne", en: "Pagne wedding dress tailoring" },
      { fr: "Tenues traditionnelles Gbaya et Makaa", en: "Traditional Gbaya & Makaa attires" },
      { fr: "Ajustements, ourlets et retouches rapides", en: "Quick alterations, hems and repairs" },
      { fr: "Création uniforme scolaire haut de gamme", en: "Premium school uniform creation" }
    ],
    [ServiceCategory.CONSTRUCTION]: [
      { fr: "Pose de briques de terre stabilisée", en: "Stabilized soil brick laying" },
      { fr: "Crépissage extérieur et finitions intérieures", en: "Exterior plastering and interior finishing" },
      { fr: "Fondations solides anti-humidité", en: "Solid damp-proof foundations" },
      { fr: "Petits travaux de plomberie et raccordements", en: "Minor plumbing and connections" }
    ],
    [ServiceCategory.CHILDCARE]: [
      { fr: "Garde après la sortie de l'école", en: "After-school pickup and care" },
      { fr: "Encadrement sécurisé et jeux éducatifs", en: "Safe supervision and educational games" },
      { fr: "Préparation de repas équilibrés pour enfants", en: "Nutritious meal preparation for children" },
      { fr: "Aide à l'apprentissage des langues de l'Est", en: "Introduction to Eastern local languages" }
    ],
    [ServiceCategory.HOME_HELP]: [
      { fr: "Lessive à la main et repassage méticuleux", en: "Hand-washing and meticulous ironing" },
      { fr: "Cuisine de mets traditionnels (Manioc, ndolé, etc.)", en: "Cooking traditional meals (Cassava, ndole, etc.)" },
      { fr: "Nettoyage en profondeur de résidences", en: "Deep residential cleaning" },
      { fr: "Aide aux courses hebdomadaires au marché", en: "Assistance with weekly market shopping" }
    ],
    [ServiceCategory.EDUCATION]: [
      { fr: "Répétitions intensives (Maths, Physiques, Chimie)", en: "Intensive tutoring (Math, Physics, Chemistry)" },
      { fr: "Préparation aux examens (BEPC, Probatoire, Bac)", en: "Exam preparation (BEPC, Probatoire, Bac)" },
      { fr: "Aide aux devoirs quotidienne rigoureuse", en: "Rigorous daily homework assistance" },
      { fr: "Méthodologie de travail personnalisée", en: "Customized study methodology" }
    ],
    [ServiceCategory.HEALTH]: [
      { fr: "Soins infirmiers de base à domicile", en: "Basic in-home nursing care" },
      { fr: "Massages traditionnels pour soulager le dos", en: "Traditional massages for back relief" },
      { fr: "Tisanes de plantes locales certifiées de l'Est", en: "Certified local herbal teas from the East" },
      { fr: "Suivi de tension et conseils bien-être", en: "Blood pressure monitoring & wellness advice" }
    ]
  }[provider.category] || [];

  const starRows = [5, 4, 3, 2, 1].map(star => {
    if (!isLoggedIn || loadingReviews || reviewsList.length === 0) {
      return { star, pct: "0%", count: 0 };
    }
    const count = reviewsList.filter(r => Math.round(r.rating) === star).length;
    const total = reviewsList.length;
    const pct = total > 0 ? `${Math.round((count / total) * 100)}%` : "0%";
    return { star, pct, count };
  });

  const handleCopyNumber = () => {
    navigator.clipboard.writeText(provider.phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const bannerImg = provider.bannerUrl || "https://images.unsplash.com/photo-1593113598332-cd288d649433?auto=format&fit=crop&w=1200&q=80";

  return (
    <div id={`profile-screen-${provider.id}`} className="space-y-6 animate-fade-in">
      {/* Back Button */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 py-2 px-4 rounded-xl text-xs font-bold text-amber-950 bg-white border border-amber-200/60 hover:bg-amber-50 shadow-sm transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-amber-800" />
          <span>{t.backToList}</span>
        </button>
        {provider.verified && (
          <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-full text-xs font-bold shadow-sm">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            {t.verified}
          </span>
        )}
      </div>

      {/* Hero Banner Section */}
      <div className="relative rounded-3xl overflow-hidden shadow-sm border border-amber-200/50 bg-white">
        {/* Banner Picture */}
        <div className="h-60 sm:h-72 w-full overflow-hidden relative">
          <img 
            src={bannerImg} 
            alt={provider.name} 
            className="w-full h-full object-cover object-center filter brightness-[0.85]"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-amber-950/80 via-transparent to-black/10" />
        </div>

        {/* Profile Info Overlay (Avatar overlaps banner on desktop) */}
        <div className="p-6 pt-16 sm:pt-6 relative flex flex-col sm:flex-row items-center sm:items-end gap-6 -mt-12 sm:mt-0">
          {/* Circular Avatar */}
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-white bg-amber-800 text-white font-extrabold text-3xl sm:text-4xl flex items-center justify-center shadow-lg shrink-0 sm:-translate-y-8">
            {provider.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
          </div>

          {/* Core metadata text */}
          <div className="text-center sm:text-left flex-1 space-y-2 sm:mb-2">
            <h2 className="text-xl sm:text-2xl font-black text-amber-950 sm:text-white drop-shadow-sm">
              {provider.name}
            </h2>
            {provider.businessName && (
              <p className="text-xs font-bold text-amber-800 sm:text-amber-200 uppercase tracking-widest">
                {provider.businessName}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs font-medium text-amber-900/90 sm:text-amber-100">
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/20 backdrop-blur-sm border border-white/30 text-amber-950 sm:text-white`}>
                {lang === "fr" ? cat?.nameFR : cat?.nameEN}
              </span>
              <div className="flex items-center gap-1">
                <MapPin className="w-4 h-4 text-amber-700 sm:text-amber-300" />
                <span>{neighborhoodDisplay}, Bertoua</span>
              </div>
              <a
                href="#reviews-section"
                className="flex items-center gap-1 font-bold hover:underline cursor-pointer"
                title={lang === "fr" ? "Voir les avis" : "See reviews"}
              >
                <Star className="w-4 h-4 fill-amber-500 text-amber-500 sm:fill-amber-400 sm:text-amber-400" />
                <span>{provider.rating.toFixed(1)}</span>
                <span className="text-[10px] font-normal opacity-80">({provider.reviewCount} {t.reviewsCount})</span>
              </a>
            </div>
          </div>

          {/* Pricing Box inside Banner Section */}
          <div className="bg-[#FAF8F5] sm:bg-white border border-amber-200/50 sm:border-transparent px-6 py-4 rounded-2xl text-center shadow-sm shrink-0 sm:mb-2 self-stretch sm:self-auto flex flex-col justify-center">
            <span className="text-[10px] text-amber-800/80 uppercase font-black tracking-wider block">
              {t.pricingDetails}
            </span>
            <span className="font-mono font-black text-amber-950 text-xl block mt-0.5">
              {provider.rateFCFA.toLocaleString("fr-FR")} FCFA
            </span>
            <span className="text-[11px] text-amber-800 font-medium">
              / {provider.rateUnit}
            </span>
          </div>
        </div>
      </div>

      {/* Prominent quick-actions bar (mobile/tablet only — on lg+ the sidebar card below is already
          visible alongside the content without scrolling). Ensures Chat/Book are never buried below
          the About/Services/Gallery/Ratings cards on a phone screen. */}
      <div className="lg:hidden flex gap-2.5">
        <button
          onClick={onChat}
          className="flex-1 bg-white border-2 border-amber-800 text-amber-950 font-bold text-xs py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-amber-50 transition-colors shadow-sm cursor-pointer"
        >
          <MessageSquare className="w-4 h-4" />
          {t.chatBtn}
        </button>
        <button
          onClick={onBook}
          className="flex-1 bg-amber-900 hover:bg-amber-950 text-white font-extrabold text-xs py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
        >
          <Calendar className="w-4 h-4" />
          {t.bookBtn}
        </button>
      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left main area (Info & details) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* About Section */}
          <div className="bg-white border border-amber-100 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
            <h3 className="font-black text-amber-950 text-sm uppercase tracking-wider flex items-center gap-2">
              <Compass className="w-4 h-4 text-amber-700" />
              {t.about} {provider.name}
            </h3>
            <p className="text-sm text-amber-900 leading-relaxed font-serif italic bg-amber-50/30 p-5 rounded-2xl border-l-4 border-amber-800">
              "{provider.description}"
            </p>

            {/* Language and certificates list */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="flex items-start gap-3">
                <Languages className="w-4.5 h-4.5 text-amber-700 mt-0.5 shrink-0" />
                <div>
                  <h4 className="font-bold text-amber-950 text-xs uppercase tracking-wider">
                    {t.languagesSpoken}
                  </h4>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {provider.languages.map((l) => (
                      <span key={l} className="bg-amber-100/50 border border-amber-200/30 text-amber-900 font-semibold text-[10px] px-2.5 py-1 rounded-lg">
                        {l}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <ShieldCheck className="w-4.5 h-4.5 text-emerald-700 mt-0.5 shrink-0" />
                <div>
                  <h4 className="font-bold text-amber-950 text-xs uppercase tracking-wider">
                    {lang === "fr" ? "Vérification locale" : "Local Verification"}
                  </h4>
                  <p className="text-[11px] text-emerald-800 font-medium mt-1">
                    ✓ {provider.verified ? t.verifiedLocal : t.notVerified}
                  </p>
                </div>
              </div>
            </div>

            {isOwnProfile && provider.status === "rejected" && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-1">
                <h4 className="font-bold text-red-800 text-xs uppercase tracking-wider">
                  {lang === "fr" ? "Profil rejeté" : "Profile rejected"}
                </h4>
                <p className="text-xs text-red-800/90 font-serif">
                  {provider.rejectionReason ||
                    (lang === "fr"
                      ? "Aucun motif fourni. Contactez l'administration pour plus de détails."
                      : "No reason provided. Contact the administration for details.")}
                </p>
              </div>
            )}
          </div>

          {/* Offred Services checklist (Aesthetics) */}
          <div className="bg-white border border-amber-100 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
            <h3 className="font-black text-amber-950 text-sm uppercase tracking-wider flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-700" />
              {t.experience}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {servicesChecklist.map((srv, index) => (
                <div key={index} className="flex items-start gap-2.5 bg-[#FAF8F5]/60 p-3.5 rounded-xl border border-amber-200/10">
                  <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-900 text-xs font-bold flex items-center justify-center shrink-0">
                    ✓
                  </span>
                  <p className="text-xs text-amber-950 font-medium font-sans">
                    {lang === "fr" ? srv.fr : srv.en}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Gallery Work Grid (Physicality) */}
          <div className="bg-white border border-amber-100 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
            <h3 className="font-black text-amber-950 text-sm uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-700" />
              {lang === "fr" ? "Galerie de réalisations" : "Past Work Gallery"}
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {galleryImages.map((img, idx) => (
                <div key={idx} className="h-24 sm:h-32 rounded-xl overflow-hidden border border-amber-100 relative group cursor-pointer shadow-sm">
                  <img 
                    src={img} 
                    alt={`work-${idx}`} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-black/5 group-hover:bg-transparent transition-colors" />
                </div>
              ))}
            </div>
          </div>

          {/* Ratings & Breakdown */}
          <div id="reviews-section" className="bg-white border border-amber-100 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 scroll-mt-24">
            <div className="flex justify-between items-center border-b border-amber-50 pb-3">
              <h3 className="font-black text-amber-950 text-sm uppercase tracking-wider flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-700 fill-amber-100" />
                {t.ratingBreakdown}
              </h3>
              <span className="bg-amber-50 text-amber-900 font-bold border border-amber-200/50 text-[10px] px-2.5 py-1 rounded-full uppercase">
                {provider.reviewCount} {lang === "fr" ? "avis" : "reviews"}
              </span>
            </div>

            {/* Star bar distribution breakdown */}
            <div className="flex flex-col sm:flex-row items-center gap-6 py-2">
              <div className="text-center sm:border-r sm:border-amber-100 sm:pr-8 shrink-0">
                <div className="text-4xl font-black text-amber-950 font-mono">
                  {provider.rating.toFixed(1)}
                </div>
                <div className="flex items-center justify-center gap-0.5 mt-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star 
                      key={s} 
                      className={`w-4 h-4 ${s <= Math.round(provider.rating) ? "fill-amber-500 text-amber-500" : "text-amber-200"}`} 
                    />
                  ))}
                </div>
                <p className="text-[10px] text-amber-800 font-medium mt-1.5 uppercase tracking-wide">
                  {t.avgRating}
                </p>
              </div>

              {/* Star Progress lines */}
              <div className="flex-1 w-full space-y-1.5">
                {starRows.map((row) => (
                  <div key={row.star} className="flex items-center gap-3 text-xs text-amber-900 font-mono">
                    <span className="w-2">{row.star}</span>
                    <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500 shrink-0" />
                    <div className="flex-1 h-2 bg-amber-50 rounded-full overflow-hidden border border-amber-100/55">
                      <div className="h-full bg-amber-800 rounded-full" style={{ width: row.pct }} />
                    </div>
                    <span className="w-10 text-right text-[10px] text-amber-800">{row.pct}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Comments block */}
            <div className="space-y-4 pt-4 border-t border-amber-50">
              <h4 className="font-bold text-amber-950 text-xs uppercase tracking-wider mb-2">
                {t.recentReviews}
              </h4>
              
              {!isLoggedIn ? (
                <div className="border border-amber-100 bg-amber-50/40 p-6 rounded-2xl text-center space-y-2">
                  <Lock className="w-5 h-5 mx-auto text-amber-800" />
                  <h5 className="font-bold text-amber-950 text-xs">
                    {lang === "fr" ? "Avis réservés aux membres" : "Member-Only Reviews"}
                  </h5>
                  <p className="text-[10px] text-amber-900 font-serif leading-relaxed">
                    {lang === "fr" 
                      ? "Connectez-vous pour lire les avis certifiés de la communauté de Bertoua." 
                      : "Please sign in to read certified reviews from the Bertoua community."}
                  </p>
                </div>
              ) : loadingReviews ? (
                <div className="flex flex-col items-center py-6 text-amber-800 text-xs gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{lang === "fr" ? "Chargement des avis..." : "Loading reviews..."}</span>
                </div>
              ) : reviewsList.length === 0 ? (
                <p className="text-xs text-amber-800/80 italic text-center py-4">
                  {lang === "fr" ? "Aucun avis pour l'instant." : "No reviews yet."}
                </p>
              ) : (
                <div className="space-y-4">
                  {reviewsList.map((rev) => (
                    <div key={rev.id} className="border border-amber-100 rounded-2xl p-4 bg-[#FAF8F5]/30 space-y-2">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-amber-950 text-xs">{rev.reviewerName}</span>
                            {rev.isTrustedReviewer && (
                              <span className="bg-amber-100 text-amber-900 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full border border-amber-200 flex items-center gap-0.5" title={lang === "fr" ? "Membre ayant complété des prestations réelles sur Bertoua" : "Member with completed real bookings in Bertoua"}>
                                <Award className="w-2.5 h-2.5 text-amber-800" />
                                {lang === "fr" ? "Évaluateur de Confiance" : "Trusted Reviewer"}
                              </span>
                            )}
                          </div>
                          <span className="text-[9px] text-amber-800/60 block">
                            {rev.createdAt ? new Date(rev.createdAt).toLocaleDateString() : (lang === "fr" ? "Récemment" : "Recently")}
                          </span>
                        </div>
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star 
                              key={s} 
                              className={`w-3 h-3 ${s <= Math.floor(rev.rating) ? "fill-amber-500 text-amber-500" : "text-amber-200"}`} 
                            />
                          ))}
                        </div>
                      </div>
                      
                      {rev.text && (
                        <p className="text-xs text-amber-900 leading-relaxed font-serif italic">
                          "{rev.text}"
                        </p>
                      )}

                      <div className="flex items-center gap-1 text-[10px] text-emerald-700 font-bold pt-1">
                        <Check className="w-3 h-3" />
                        <span>{lang === "fr" ? "Avis certifié suite à prestation" : "Verified review from completed booking"}</span>
                      </div>

                      {/* Display response if present */}
                      {rev.response && (
                        <div className="mt-3 bg-amber-50/50 border-l-2 border-amber-800 p-3 rounded-r-xl space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-amber-950 text-[10px] uppercase tracking-wide">
                              {lang === "fr" ? `Réponse de ${provider.name}` : `${provider.name}'s Response`}
                            </span>
                            {rev.responseCreatedAt && (
                              <span className="text-[8px] text-amber-800/60 font-mono">
                                {new Date(rev.responseCreatedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-amber-900 leading-relaxed font-serif italic">
                            "{rev.response}"
                          </p>
                        </div>
                      )}

                      {/* Inline Respond Form for provider themselves */}
                      {canRespond && !rev.response && (
                        <div className="mt-3 space-y-2 pt-2 border-t border-amber-100">
                          <label className="block text-[9px] uppercase font-bold text-amber-800 tracking-wider">
                            {lang === "fr" ? "Répondre à cet avis" : "Respond to this review"}
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder={lang === "fr" ? "Écrivez votre réponse..." : "Write your response..."}
                              value={responseTextMap[rev.id] || ""}
                              onChange={(e) => setResponseTextMap(prev => ({ ...prev, [rev.id]: e.target.value }))}
                              className="flex-1 bg-white border border-amber-200 rounded-xl px-3 py-1.5 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-600"
                            />
                            <button
                              onClick={() => handleResponseSubmit(rev.id)}
                              disabled={submittingResponseMap[rev.id]}
                              className="bg-amber-800 hover:bg-amber-900 text-white font-bold px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                            >
                              {submittingResponseMap[rev.id] ? "..." : (lang === "fr" ? "Envoyer" : "Send")}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right sidebars (Neighborhood Map & Quick booking Card) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Quick contact / direct bookings card */}
          <div className="bg-[#FAF8F5] border border-amber-200/70 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="text-center">
              <span className="inline-block px-3 py-1 bg-amber-100 border border-amber-200 text-amber-950 text-[10px] font-black uppercase rounded-full tracking-wider">
                {lang === "fr" ? "Réservation Directe" : "Direct Booking"}
              </span>
            </div>

            {/* Quick Pricing */}
            <div className="p-4 bg-white border border-amber-100 rounded-2xl text-center shadow-inner">
              <span className="text-xs text-amber-800 font-bold block">{t.pricingDetails}</span>
              <span className="font-mono text-2xl font-black text-amber-950 block mt-1">
                {provider.rateFCFA.toLocaleString("fr-FR")} FCFA
              </span>
              <span className="text-xs text-amber-800 block">/ {provider.rateUnit}</span>
            </div>

            {/* Call Buttons / Contacts (Phase 5) */}
            <div className="space-y-2.5 pt-2">
              <a 
                href={`tel:${provider.phone}`}
                className="w-full bg-amber-800 hover:bg-amber-900 text-white font-bold text-xs py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
              >
                <Phone className="w-4 h-4" />
                {t.callBtn} : {provider.phone}
              </a>

              <button 
                onClick={() => setShowWhatsAppModal(true)}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.964 9.964 0 0 0 1.333 4.993L2 22l5.233-1.371a9.918 9.918 0 0 0 4.777 1.22h.005c5.507 0 9.991-4.478 9.992-9.986A9.999 9.999 0 0 0 12.012 2zm5.835 14.12c-.256.717-1.5 1.305-2.059 1.365-.504.053-1.155.078-2.618-.518-1.874-.764-3.076-2.678-3.17-2.802-.093-.125-.81-.1.144-.81.65-.609.814-.143-.814-.306-.162-.163-.162-.326-.081-.489.081-.162.814-1.954.896-2.117.081-.162.162-.365.285-.488.122-.122.244-.244.366-.366.121-.122.203-.244.305-.407.102-.162.05-.325-.025-.487-.076-.162-.65-1.583-.896-2.152-.24-.57-.487-.487-.65-.487-.162 0-.365-.02-.57-.02-.203 0-.528.081-.813.407-.284.325-1.1.1-1.1 2.64 0 2.535 1.83 4.993 2.083 5.34.254.345 3.61 5.513 8.74 7.733 1.22.528 2.174.843 2.92 1.077 1.23.39 2.348.33 3.23.2.98-.146 2.06-.84 2.35-1.63.29-.79.29-1.464.2-1.605-.09-.14-.325-.224-.58-.35z"/>
                </svg>
                {t.whatsappBtn}
              </button>

              <button
                onClick={onChat}
                className="w-full bg-white border border-amber-200 text-amber-950 font-bold text-xs py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-amber-50 transition-colors shadow-xs cursor-pointer"
              >
                <MessageSquare className="w-4 h-4 text-amber-700" />
                {t.chatBtn}
              </button>

              <button
                onClick={onBook}
                className="w-full bg-amber-900 hover:bg-amber-950 text-white font-extrabold text-xs py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
              >
                <Calendar className="w-4 h-4" />
                {t.bookBtn}
              </button>
            </div>
          </div>

          {/* Neighborhood representation & Map */}
          <div className="bg-white border border-amber-100 rounded-3xl p-6 shadow-sm space-y-4">
            <div>
              <h3 className="font-black text-amber-950 text-xs uppercase tracking-wider flex items-center gap-2">
                <MapPin className="w-4 h-4 text-amber-700" />
                {t.locationTitle} : {neighborhoodDisplay}
              </h3>
              <p className="text-[11px] text-amber-800 mt-1 leading-normal font-serif">
                {neighborhood ? neighborhood.description : "Quartier accueillant et solidaire de Bertoua."}
              </p>
            </div>

            {/* Custom Interactive Map Representation */}
            <div 
              className="relative w-full h-48 bg-[#FAF8F5] border border-amber-200/75 rounded-2xl overflow-hidden shadow-inner group cursor-pointer"
              onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=Bertoua+${neighborhoodDisplay}`, "_blank")}
            >
              {/* Abstract layout lines imitating streets and sectors */}
              <div className="absolute inset-0 bg-[radial-gradient(#d97706_1px,transparent_1px)] [background-size:16px_16px] opacity-20" />
              <div className="absolute top-8 left-0 right-0 h-1 bg-amber-200/40 rotate-12" />
              <div className="absolute top-20 left-0 right-0 h-1 bg-amber-200/40 -rotate-6" />
              <div className="absolute bottom-12 left-0 right-0 h-1 bg-amber-200/40 rotate-45" />
              <div className="absolute top-0 bottom-0 left-20 w-1 bg-amber-200/40 rotate-12" />
              <div className="absolute top-0 bottom-0 right-24 w-1 bg-amber-200/40 -rotate-12" />

              {/* Central glowing indicator for neighborhood */}
              <div 
                className="absolute flex flex-col items-center justify-center -translate-x-1/2 -translate-y-1/2 group-hover:scale-105 transition-transform"
                style={{ top: mockCoordinates.y, left: mockCoordinates.x }}
              >
                {/* Locator Ring animation */}
                <span className="absolute w-8 h-8 rounded-full bg-amber-600/20 animate-ping" />
                <span className="w-4.5 h-4.5 rounded-full bg-amber-800 border-2 border-white flex items-center justify-center text-[8px] text-white font-bold shadow-md">
                  📍
                </span>
                <span className="mt-1 bg-amber-950/90 text-white text-[9px] font-bold px-2 py-0.5 rounded shadow-sm border border-amber-800">
                  {neighborhoodDisplay}
                </span>
              </div>

              {/* Map Footer overlay */}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-amber-950/80 to-transparent p-2.5 flex items-center justify-between text-white text-[10px]">
                <span className="font-serif font-medium">{t.mapInstructions}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </div>
            </div>

            <button
              onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=Bertoua+${neighborhoodDisplay}`, "_blank")}
              className="w-full py-2 bg-amber-50 hover:bg-amber-100/70 border border-amber-200/50 text-amber-950 font-bold text-[11px] rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t.viewOnMap}
            </button>
          </div>
        </div>
      </div>

      {/* CUSTOM INTERACTIVE WHATSAPP BOOKING TEMPLATE BUILDER MODAL */}
      {showWhatsAppModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] animate-fade-in overflow-y-auto p-4">
          <div className="bg-white rounded-3xl border border-amber-100 shadow-2xl max-w-md w-full p-6 sm:p-8 space-y-6 relative mx-auto my-6 sm:my-10">
            
            {/* Header */}
            <div className="flex justify-between items-center border-b border-amber-50 pb-3">
              <div>
                <h3 className="font-black text-amber-950 text-sm uppercase flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
                  {lang === "fr" ? "Demande Directe WhatsApp" : "Direct WhatsApp Booking Request"}
                </h3>
                <p className="text-[10px] text-amber-800 font-serif mt-1">
                  {lang === "fr" 
                    ? "Pré-remplissez votre demande de service pour le prestataire"
                    : "Pre-fill your booking request template for the provider"}
                </p>
              </div>
              <button 
                onClick={() => setShowWhatsAppModal(false)}
                className="text-amber-800 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 p-2 rounded-xl transition-all cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Inputs Body */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-amber-950 uppercase tracking-wide block">
                    {lang === "fr" ? "Date souhaitée" : "Desired Date"}
                  </label>
                  <input 
                    type="date"
                    value={waDate}
                    onChange={(e) => setWaDate(e.target.value)}
                    className="w-full bg-[#FAF8F5] border border-amber-200/80 rounded-xl px-3.5 py-2 text-xs font-mono text-amber-950 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-amber-950 uppercase tracking-wide block">
                    {lang === "fr" ? "Heure souhaitée" : "Desired Time"}
                  </label>
                  <input 
                    type="time"
                    value={waTime}
                    onChange={(e) => setWaTime(e.target.value)}
                    className="w-full bg-[#FAF8F5] border border-amber-200/80 rounded-xl px-3.5 py-2 text-xs font-mono text-amber-950 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-amber-950 uppercase tracking-wide block">
                  {lang === "fr" ? "Description précise du besoin" : "Description of need"}
                </label>
                <textarea
                  value={waDescription}
                  onChange={(e) => setWaDescription(e.target.value)}
                  rows={3}
                  className="w-full bg-[#FAF8F5] border border-amber-200/80 rounded-xl px-3.5 py-2 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-serif"
                  placeholder={lang === "fr" ? "Précisez votre demande..." : "Specify your task details..."}
                />
              </div>

              {/* Template Preview Panel */}
              <div className="bg-emerald-50/50 border border-emerald-100 p-3.5 rounded-2xl space-y-1.5">
                <span className="text-[9px] font-black text-emerald-800 uppercase tracking-widest block">
                  {lang === "fr" ? "Aperçu du message :" : "Message Template Preview :"}
                </span>
                <p className="text-[10px] text-amber-950/90 leading-relaxed font-mono whitespace-pre-line bg-white p-2.5 rounded-xl border border-emerald-200/30 max-h-36 overflow-y-auto">
                  {lang === "fr"
                    ? `Bonjour ${provider.name},\nJe vous contacte depuis One Village...\n- Date souhaitée : ${waDate}\n- Heure souhaitée : ${waTime}\n- Quartier : ${neighborhoodDisplay}\n- Description : ${waDescription}`
                    : `Hello ${provider.name},\nI am contacting you from One Village...\n- Date: ${waDate}\n- Time: ${waTime}\n- Neighborhood: ${neighborhoodDisplay}\n- Description: ${waDescription}`}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => setShowWhatsAppModal(false)}
                className="flex-1 py-3 border border-amber-200 text-amber-900 bg-white hover:bg-amber-50 font-bold text-xs rounded-xl transition-all cursor-pointer text-center"
              >
                {lang === "fr" ? "Modifier plus tard" : "Cancel"}
              </button>
              <button
                onClick={handleOpenWhatsApp}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.964 9.964 0 0 0 1.333 4.993L2 22l5.233-1.371a9.918 9.918 0 0 0 4.777 1.22h.005c5.507 0 9.991-4.478 9.992-9.986A9.999 9.999 0 0 0 12.012 2zm5.835 14.12c-.256.717-1.5 1.305-2.059 1.365-.504.053-1.155.078-2.618-.518-1.874-.764-3.076-2.678-3.17-2.802-.093-.125-.81-.1.144-.81.65-.609.814-.143-.814-.306-.162-.163-.162-.326-.081-.489.081-.162.814-1.954.896-2.117.081-.162.162-.365.285-.488.122-.122.244-.244.366-.366.121-.122.203-.244.305-.407.102-.162.05-.325-.025-.487-.076-.162-.65-1.583-.896-2.152-.24-.57-.487-.487-.65-.487-.162 0-.365-.02-.57-.02-.203 0-.528.081-.813.407-.284.325-1.1.1-1.1 2.64 0 2.535 1.83 4.993 2.083 5.34.254.345 3.61 5.513 8.74 7.733 1.22.528 2.174.843 2.92 1.077 1.23.39 2.348.33 3.23.2.98-.146 2.06-.84 2.35-1.63.29-.79.29-1.464.2-1.605-.09-.14-.325-.224-.58-.35z"/>
                </svg>
                <span>{lang === "fr" ? "Ouvrir WhatsApp" : "Open WhatsApp"}</span>
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
