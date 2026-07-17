import React from "react";
import { ServiceProvider } from "../types.ts";
import { CATEGORY_DETAILS, BERTOUA_NEIGHBORHOODS } from "../data/bertouaData.ts";
import { toTitleCase } from "../lib/textFormat.ts";
import { Star, MapPin, CheckCircle, Languages, MessageSquare, Calendar, Flame, Lock, ExternalLink } from "lucide-react";

interface ServiceCardProps {
  key?: string;
  provider: ServiceProvider;
  lang: "fr" | "en";
  onBook: () => void;
  onChat: () => void;
  onGetService: () => void;
  onViewProfile: () => void;
  isLoggedIn: boolean;
}

export default function ServiceCard({ provider, lang, onBook, onChat, onGetService, onViewProfile, isLoggedIn }: ServiceCardProps) {
  const cat = CATEGORY_DETAILS[provider.category];
  const neighborhood = BERTOUA_NEIGHBORHOODS.find((n) => n.id === provider.neighborhoodId);

  const t = {
    fr: {
      verified: "Vérifié",
      bookBtn: "Réserver",
      chatBtn: "Chatter",
      getServiceBtn: "Obtenir le Service",
      lockedText: "S'inscrire pour contacter",
      trending: "Populaire",
      viewProfileLink: "Voir le profil complet →",
    },
    en: {
      verified: "Verified",
      bookBtn: "Book Now",
      chatBtn: "Chat",
      getServiceBtn: "Get Service",
      lockedText: "Sign in to contact",
      trending: "Trending",
      viewProfileLink: "View full profile →",
    }
  }[lang];

  // Helper for generating initial avatar background
  const getAvatarBg = (name: string) => {
    const chars = name.charCodeAt(0) + (name.charCodeAt(1) || 0);
    const colors = [
      "bg-amber-700 text-white",
      "bg-orange-700 text-white",
      "bg-emerald-700 text-white",
      "bg-teal-700 text-white",
      "bg-rose-700 text-white",
      "bg-indigo-700 text-white",
    ];
    return colors[chars % colors.length];
  };

  const isTrending = (provider.bookingsCount || 0) > 30;

  return (
    <div
      id={`provider-card-${provider.id}`}
      className="bg-white border border-amber-100/80 rounded-2xl shadow-sm hover:shadow-lg hover:shadow-[#E3A23D]/10 hover:-translate-y-1 hover:scale-[1.01] transition-all duration-200 p-5 flex flex-col justify-between relative overflow-hidden"
    >
      {isTrending && (
        <div className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-black px-3 py-1 rounded-bl-xl flex items-center gap-1 uppercase tracking-wider animate-pulse">
          <Flame className="w-3 h-3" />
          {t.trending}
        </div>
      )}

      <div className="space-y-4">
        {/* Profile Header */}
        <div className="flex items-start justify-between gap-4">
          <div 
            className={`flex items-center gap-3 ${isLoggedIn ? "cursor-pointer group/header" : ""}`}
            onClick={isLoggedIn ? onViewProfile : onGetService}
          >
            <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-base shadow-inner shrink-0 group-hover/header:scale-105 transition-transform ${getAvatarBg(provider.name)}`}>
              {provider.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h4 className="font-bold text-amber-950 text-sm leading-snug flex items-center gap-1.5 flex-wrap group-hover/header:text-amber-800 transition-colors">
                {provider.name}
                {provider.verified && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] bg-[#245C46]/10 text-[#245C46] border border-[#245C46]/20 px-1.5 py-0.5 rounded-full font-bold">
                    <CheckCircle className="w-2.5 h-2.5 text-[#245C46] shrink-0" />
                    {t.verified}
                  </span>
                )}
              </h4>
              <div className="flex items-center gap-1.5 text-amber-800 mt-0.5 text-xs">
                <MapPin className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span className="font-medium">{neighborhood ? neighborhood.name : toTitleCase(provider.neighborhoodId)}</span>
              </div>
            </div>
          </div>

          <div className="text-right shrink-0 pr-12">
            <span className="font-black text-amber-950 text-sm block font-mono">{provider.rateFCFA} F</span>
            <span className="text-[10px] text-amber-800 font-medium lowercase">/ {provider.rateUnit}</span>
          </div>
        </div>

        {/* Business Name */}
        {provider.businessName && (
          <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider -mt-1">
            {provider.businessName}
          </p>
        )}

        {/* Category & Ratings row */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-y border-amber-50/60 py-2 text-xs">
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-${cat?.color}-50 text-${cat?.color}-700 border border-${cat?.color}-100`}>
            {lang === "fr" ? cat?.nameFR : cat?.nameEN}
          </span>

          <div className="flex items-center gap-1 text-amber-800 font-bold">
            <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
            <span>{provider.rating.toFixed(1)}</span>
            <span className="text-[10px] font-normal text-amber-800/60">({provider.reviewCount})</span>
          </div>
        </div>

        {/* Description text */}
        <p className="text-xs text-amber-900 leading-relaxed font-serif line-clamp-3">"{provider.description}"</p>

        {/* Sensitive Information display masked for guest */}
        <div className="border-t border-amber-50 pt-2.5 space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-amber-800/60 font-medium">Téléphone / Phone:</span>
            <span className={`font-mono font-medium ${isLoggedIn ? "text-amber-950" : "text-amber-500 italic text-[10px]"}`}>
              {isLoggedIn ? provider.phone : "[Se connecter]"}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-amber-800/60 font-medium">WhatsApp:</span>
            <span className={`font-mono font-medium ${isLoggedIn ? "text-amber-950" : "text-amber-500 italic text-[10px]"}`}>
              {isLoggedIn ? (
                <a
                  href={`https://wa.me/${(provider.whatsappNumber || provider.phone).replace(/[\s+]/g, "")}?text=${encodeURIComponent(
                    lang === "fr"
                      ? `Bonjour ${provider.name}, je vous contacte depuis One Village concernant vos services de ${cat?.nameFR || "prestataire"}.`
                      : `Hello ${provider.name}, I am contacting you from One Village regarding your ${cat?.nameEN || "provider"} services.`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#245C46] hover:text-[#3E8467] font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  {provider.whatsappNumber || provider.phone}
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                "[Se connecter]"
              )}
            </span>
          </div>
        </div>

        {/* Languages tags */}
        <div className="flex items-center gap-1.5 text-[10px] text-amber-800/80 font-medium pt-1">
          <Languages className="w-3.5 h-3.5 text-amber-700" />
          <div className="flex gap-1.5">
            {provider.languages.map((l) => (
              <span key={l} className="bg-amber-100/40 border border-amber-200/20 px-1.5 py-0.5 rounded">
                {l}
              </span>
            ))}
          </div>
        </div>

        {/* View Profile Link */}
        {isLoggedIn && (
          <div className="pt-2 border-t border-amber-50 flex justify-end">
            <button
              onClick={onViewProfile}
              className="text-xs font-bold text-amber-800 hover:text-amber-950 flex items-center gap-1 transition-colors cursor-pointer"
            >
              {t.viewProfileLink}
            </button>
          </div>
        )}
      </div>

      {/* Booking and Chat Actions */}
      <div className="mt-5 space-y-2">
        {!isLoggedIn ? (
          <button
            onClick={onGetService}
            className="w-full py-3 bg-[#E3A23D] hover:bg-[#F2B355] text-[#241611] font-black rounded-xl text-xs flex items-center justify-center gap-2 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-sm"
          >
            <Lock className="w-4 h-4 shrink-0" />
            {t.getServiceBtn}
          </button>
        ) : (
          <div className="flex gap-2.5">
            <button
              onClick={onChat}
              className="flex-1 py-2.5 border border-amber-200 text-amber-950 hover:bg-amber-50 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {t.chatBtn}
            </button>
            <button
              onClick={onBook}
              className="flex-1 py-2.5 bg-[#E3A23D] hover:bg-[#F2B355] text-[#241611] font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-sm"
            >
              <Calendar className="w-3.5 h-3.5" />
              {t.bookBtn}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
