/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { supabaseService } from "../lib/supabase.ts";
import brandLogo from "../assets/images/one_village_logo_1784027088635.jpg";
import {
  Loader2,
  User,
  Briefcase,
  Star,
  Download,
  ExternalLink,
  ArrowLeft,
  Sparkles,
} from "lucide-react";

const AVAILABILITY_META: Record<string, { labelFR: string; labelEN: string; color: string }> = {
  open_to_work: { labelFR: "Ouvert aux opportunités", labelEN: "Open to work", color: "#3E8467" },
  employed: { labelFR: "En poste", labelEN: "Employed", color: "#E3A23D" },
  not_looking: { labelFR: "Ne cherche pas", labelEN: "Not looking", color: "#8A8478" },
};

interface PublicProfessionalProfileProps {
  userId: string;
  lang: "fr" | "en";
}

export default function PublicProfessionalProfile({ userId, lang }: PublicProfessionalProfileProps) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof supabaseService.getPublicProfessionalProfile>>>(null);

  useEffect(() => {
    let active = true;
    supabaseService.getPublicProfessionalProfile(userId).then((data) => {
      if (!active) return;
      setProfile(data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const availability = profile ? AVAILABILITY_META[profile.availabilityStatus] : null;

  return (
    <div className="min-h-screen bg-[#FBF7F0] flex flex-col">
      <header className="bg-white border-b border-amber-100/80 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center overflow-hidden shadow-sm border border-amber-200">
              <img src={brandLogo} alt="One Village" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </span>
            <span className="font-black text-amber-950 text-sm uppercase tracking-wide">One Village</span>
          </a>
          <a
            href="/"
            className="flex items-center gap-1.5 text-xs font-bold text-amber-900 hover:text-amber-950 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {lang === "fr" ? "Retour à l'accueil" : "Back home"}
          </a>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-10">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-amber-800 text-sm gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            {lang === "fr" ? "Chargement du profil..." : "Loading profile..."}
          </div>
        ) : !profile ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-white border border-dashed border-amber-200 rounded-3xl p-12 text-center space-y-3"
          >
            <div className="w-14 h-14 mx-auto rounded-full bg-amber-50 flex items-center justify-center">
              <User className="w-7 h-7 text-amber-800/50" />
            </div>
            <h2 className="font-black text-amber-950 text-base">
              {lang === "fr" ? "Profil introuvable" : "Profile not found"}
            </h2>
            <p className="text-xs text-amber-800/80 font-serif max-w-sm mx-auto">
              {lang === "fr"
                ? "Ce profil professionnel n'existe pas ou n'a pas encore été complété par son propriétaire."
                : "This professional profile doesn't exist yet, or its owner hasn't completed it."}
            </p>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="bg-white border border-amber-100 rounded-3xl shadow-sm overflow-hidden"
          >
            {/* Hero band */}
            <div className="bg-gradient-to-br from-[#241611] via-[#7A3420] to-[#241611] p-6 sm:p-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-[#E3A23D]/15 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
              <div className="relative z-10 flex items-center gap-4">
                <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-full bg-amber-50 border-2 border-[#E3A23D]/60 overflow-hidden flex items-center justify-center shadow-md">
                  {profile.avatarUrl ? (
                    <img src={profile.avatarUrl} alt={profile.fullName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <User className="w-8 h-8 text-amber-800/60" />
                  )}
                </div>
                <div className="min-w-0">
                  <h1 className="text-white font-black text-lg sm:text-xl truncate">{profile.fullName}</h1>
                  <p className="text-[#F2B355] font-bold text-sm mt-0.5 leading-snug break-words">{profile.headline}</p>
                  {availability && (
                    <span
                      className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider text-white"
                      style={{ backgroundColor: availability.color }}
                    >
                      {lang === "fr" ? availability.labelFR : availability.labelEN}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-8 space-y-6">
              {/* Bio */}
              <div className="space-y-1.5">
                <h3 className="text-[10px] font-black text-amber-950 uppercase tracking-wider">
                  {lang === "fr" ? "À propos" : "About"}
                </h3>
                <p className="text-sm text-amber-900 font-serif leading-relaxed whitespace-pre-line break-words">{profile.bio}</p>
              </div>

              {/* Years of experience */}
              {profile.yearsExperience != null && (
                <div className="flex items-center gap-2 text-xs">
                  <Briefcase className="w-4 h-4 text-amber-700" />
                  <span className="font-bold text-amber-950">
                    {profile.yearsExperience} {lang === "fr" ? "an(s) d'expérience" : "year(s) of experience"}
                  </span>
                </div>
              )}

              {/* Skills */}
              {profile.skills.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-[10px] font-black text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                    {lang === "fr" ? "Compétences" : "Skills"}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {profile.skills.map((skill) => (
                      <span
                        key={skill}
                        className="bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-bold px-3 py-1.5 rounded-full"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Portfolio links */}
              {profile.portfolioLinks.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-[10px] font-black text-amber-950 uppercase tracking-wider">
                    {lang === "fr" ? "Portfolio" : "Portfolio"}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {profile.portfolioLinks.map((link, idx) => (
                      <a
                        key={idx}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 bg-[#FAF8F5] border border-amber-200 hover:bg-amber-100/50 text-amber-950 text-xs font-bold px-3.5 py-2 rounded-xl transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-amber-700" />
                        {link.label}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* CV download */}
              {profile.cvSignedUrl && (
                <a
                  href={profile.cvSignedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 bg-[#245C46] hover:bg-[#3E8467] text-white font-bold text-xs px-4 py-3 rounded-xl transition-colors shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  {lang === "fr" ? "Télécharger le CV" : "Download CV"}
                </a>
              )}

              {/* Connect to service provider identity */}
              {profile.isServiceProvider && (
                <div className="border-t border-amber-50 pt-5">
                  <a
                    href={`/?providerId=${userId}`}
                    className="flex items-center justify-center gap-2 bg-[#E3A23D] hover:bg-[#F2B355] text-[#241611] font-black text-xs px-4 py-3 rounded-xl transition-colors shadow-sm w-full sm:w-auto"
                  >
                    <Star className="w-4 h-4" />
                    {lang === "fr" ? "Voir son profil de prestataire de services" : "View their service provider profile"}
                  </a>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
