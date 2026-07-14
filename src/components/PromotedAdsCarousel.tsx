import React, { useState, useEffect, useRef } from "react";
import { ServiceProvider } from "../types.ts";
import { Megaphone, ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";

interface PromotedAd {
  id: string;
  providerId: string;
  providerName: string;
  providerPhone: string;
  mediaUrl: string;
  mediaType: string;
  placement: string;
  budgetFCFA: number;
  startDate: string;
  endDate: string;
  status: string;
  impressions: number;
  clicks: number;
  paymentMethod?: string;
  paymentPhone?: string;
  momoTransactionId?: string;
  createdAt: string;
  rejectionReason?: string;
}

interface PromotedAdsCarouselProps {
  lang: "fr" | "en";
  selectedCategory: string; // "ALL" or specific category key
  providers: ServiceProvider[];
  onViewProviderProfile: (provider: ServiceProvider) => void;
}

export default function PromotedAdsCarousel({
  lang,
  selectedCategory,
  providers,
  onViewProviderProfile,
}: PromotedAdsCarouselProps) {
  const [ads, setAds] = useState<PromotedAd[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  
  // Track which ad IDs we have already recorded an impression for during this mount
  const recordedImpressions = useRef<Set<string>>(new Set());

  // Fetch approved ads
  useEffect(() => {
    let isMounted = true;
    const fetchAds = async () => {
      setLoading(true);
      try {
        const url = `/api/promoted-ads?placement=${selectedCategory}`;
        const res = await fetch(url);
        if (res.ok && isMounted) {
          const data: PromotedAd[] = await res.json();
          // Filter to only include active/approved ones
          setAds(data);
          setCurrentIndex(0);
        }
      } catch (err) {
        console.error("Error fetching promoted ads in carousel:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchAds();
    return () => {
      isMounted = false;
    };
  }, [selectedCategory]);

  // Track impression on active ad change
  useEffect(() => {
    if (ads.length === 0) return;
    const activeAd = ads[currentIndex];
    if (!activeAd) return;

    // Track once per ad ID during this specific viewing cycle
    if (!recordedImpressions.current.has(activeAd.id)) {
      recordedImpressions.current.add(activeAd.id);
      
      // Fire-and-forget API call to increment impressions on the backend
      fetch(`/api/promoted-ads/${activeAd.id}/track-impression`, {
        method: "POST",
      })
        .then((r) => r.json())
        .then((data) => {
          console.log(`[Ad Impression] Logged view for ${activeAd.id}:`, data);
        })
        .catch((e) => console.error("Failed to log ad impression:", e));
    }
  }, [currentIndex, ads]);

  // Auto-advance ads every 6 seconds
  useEffect(() => {
    if (ads.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % ads.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [ads]);

  if (loading) {
    return (
      <div className="w-full bg-amber-50/20 border border-amber-100 rounded-3xl p-6 h-40 flex items-center justify-center text-xs font-serif text-amber-800 italic animate-pulse">
        {lang === "fr" ? "Chargement des annonces sponsors..." : "Loading sponsored promotions..."}
      </div>
    );
  }

  if (ads.length === 0) {
    return null; // Return nothing if no active approved promotions are available
  }

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % ads.length);
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + ads.length) % ads.length);
  };

  const handleAdClick = async (ad: PromotedAd) => {
    // 1. Log click to backend
    try {
      await fetch(`/api/promoted-ads/${ad.id}/track-click`, {
        method: "POST",
      });
      console.log(`[Ad Click] Logged click for ${ad.id}`);
    } catch (err) {
      console.error("Failed to log ad click:", err);
    }

    // 2. Open provider profile if they are listed in our provider directory
    const provider = providers.find((p) => p.id === ad.providerId);
    if (provider) {
      onViewProviderProfile(provider);
    } else {
      alert(
        lang === "fr"
          ? `Publicité de ${ad.providerName}. Contactez-les directement au ${ad.providerPhone}.`
          : `Advertisement from ${ad.providerName}. Contact them directly at ${ad.providerPhone}.`
      );
    }
  };

  const activeAd = ads[currentIndex];

  return (
    <div 
      id={`promoted-ad-card-${activeAd.id}`}
      className="relative bg-amber-950 text-white rounded-3xl overflow-hidden shadow-lg border border-amber-800 hover:shadow-xl transition-all duration-300 group cursor-pointer"
      onClick={() => handleAdClick(activeAd)}
    >
      {/* Visual Header / Sponsored Badge */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 bg-yellow-400 text-black px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-md">
        <Megaphone className="w-3.5 h-3.5" />
        <span>{lang === "fr" ? "Sponsorisé" : "Sponsored"}</span>
      </div>

      <div className="absolute top-4 right-4 z-10 flex items-center gap-1 bg-black/50 text-white px-2 py-1 rounded-full text-[9px] font-mono">
        <span>{currentIndex + 1} / {ads.length}</span>
      </div>

      {/* Ad Image / Visual Banner */}
      <div className="relative w-full h-56 sm:h-64 overflow-hidden bg-amber-900/30">
        <img
          src={activeAd.mediaUrl}
          alt={`Promoted ad by ${activeAd.providerName}`}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-amber-950 via-amber-950/40 to-transparent" />
      </div>

      {/* Ad Content Box */}
      <div className="absolute bottom-0 inset-x-0 p-5 sm:p-6 space-y-2 text-left">
        <div className="flex justify-between items-end">
          <div className="space-y-0.5">
            <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wider block font-mono">
              {lang === "fr" ? "PRESTATAIRE RECOMMANDÉ" : "FEATURED MERCHANT"}
            </span>
            <h4 className="text-base sm:text-lg font-black text-white leading-tight flex items-center gap-1.5">
              {activeAd.providerName}
              <span className="inline-block bg-white/20 hover:bg-white/30 p-1 rounded-full text-white transition-colors">
                <ExternalLink className="w-3 h-3" />
              </span>
            </h4>
          </div>
          <div className="text-right">
            <span className="text-xs bg-amber-800 border border-amber-700 text-amber-50 px-3 py-1.5 rounded-xl font-bold font-mono">
              {activeAd.providerPhone}
            </span>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-amber-100 font-serif leading-relaxed line-clamp-2">
          {lang === "fr"
            ? `Découvrez les services exceptionnels et tarifs compétitifs de ${activeAd.providerName} à Bertoua. Cliquez pour consulter son profil complet et réserver !`
            : `Discover top quality local services and competitive rates by ${activeAd.providerName} in Bertoua. Click to view full profile and book now!`}
        </p>
      </div>

      {/* Navigation Arrows (Large tap targets) */}
      {ads.length > 1 && (
        <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-3 pointer-events-none">
          <button
            onClick={handlePrev}
            className="w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-all cursor-pointer pointer-events-auto border border-white/10 active:scale-95"
            aria-label="Previous Ad"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={handleNext}
            className="w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-all cursor-pointer pointer-events-auto border border-white/10 active:scale-95"
            aria-label="Next Ad"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
