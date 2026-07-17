/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { supabaseService } from "../lib/supabase.ts";
import { Users, Search, User, Loader2, UserPlus } from "lucide-react";

const AVAILABILITY_META: Record<string, { labelFR: string; labelEN: string; color: string }> = {
  open_to_work: { labelFR: "Ouvert aux opportunités", labelEN: "Open to work", color: "#3E8467" },
  employed: { labelFR: "En poste", labelEN: "Employed", color: "#E3A23D" },
  not_looking: { labelFR: "Ne cherche pas", labelEN: "Not looking", color: "#8A8478" },
};

interface ProfessionalDirectoryPageProps {
  lang: "fr" | "en";
  currentUserId: string | null;
  onCreateProfile: () => void;
}

export default function ProfessionalDirectoryPage({ lang, currentUserId, onCreateProfile }: ProfessionalDirectoryPageProps) {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Awaited<ReturnType<typeof supabaseService.getAllPublicProfessionalProfiles>>>([]);
  const [skillFilter, setSkillFilter] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("ALL");
  // Item 2: only show the "create your profile" CTA to a logged-in visitor who doesn't already
  // have one — checked via getMyProfessionalProfile (existence, regardless of completeness), not
  // just absence from the public directory list (which would also hide the CTA from someone whose
  // profile exists but isn't complete enough to be publicly listed yet).
  const [hasOwnProfile, setHasOwnProfile] = useState<boolean | null>(null);

  useEffect(() => {
    supabaseService.getAllPublicProfessionalProfiles().then((list) => {
      setProfiles(list);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      setHasOwnProfile(null);
      return;
    }
    let active = true;
    supabaseService.getMyProfessionalProfile(currentUserId).then((profile) => {
      if (active) setHasOwnProfile(!!profile);
    });
    return () => {
      active = false;
    };
  }, [currentUserId]);

  const filteredProfiles = useMemo(() => {
    const skillQuery = skillFilter.trim().toLowerCase();
    return profiles.filter((p) => {
      if (availabilityFilter !== "ALL" && p.availabilityStatus !== availabilityFilter) return false;
      if (skillQuery && !p.skills.some((s) => s.toLowerCase().includes(skillQuery))) return false;
      return true;
    });
  }, [profiles, skillFilter, availabilityFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-amber-50/50 p-6 rounded-2xl border border-amber-200/50">
        <div>
          <h3 className="text-lg font-bold text-amber-950 flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-800" />
            {lang === "fr" ? "Profils Professionnels" : "Professional Profiles"}
          </h3>
          <p className="text-xs text-amber-800 mt-1 max-w-xl">
            {lang === "fr"
              ? "Découvrez les talents et compétences des habitants de Bertoua."
              : "Discover the talents and skills of Bertoua residents."}
          </p>
        </div>
        {currentUserId && hasOwnProfile === false && (
          <button
            onClick={onCreateProfile}
            className="bg-[#E3A23D] hover:bg-[#F2B355] text-[#241611] font-black text-xs px-4 py-3 rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm shrink-0 w-full sm:w-auto"
          >
            <UserPlus className="w-4 h-4" />
            {lang === "fr" ? "Créer mon Profil Professionnel" : "Create my Professional Profile"}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-700/60" />
          <input
            type="text"
            value={skillFilter}
            onChange={(e) => setSkillFilter(e.target.value)}
            placeholder={lang === "fr" ? "Filtrer par compétence..." : "Filter by skill..."}
            className="w-full bg-white border border-amber-200 rounded-xl pl-9 pr-3.5 py-3 text-xs font-semibold text-amber-950 focus:outline-none"
          />
        </div>
        <select
          value={availabilityFilter}
          onChange={(e) => setAvailabilityFilter(e.target.value)}
          className="bg-white border border-amber-200 rounded-xl px-3.5 py-3 text-xs font-semibold text-amber-950 focus:outline-none cursor-pointer"
        >
          <option value="ALL">{lang === "fr" ? "Toutes les disponibilités" : "All availability"}</option>
          {Object.entries(AVAILABILITY_META).map(([value, meta]) => (
            <option key={value} value={value}>
              {lang === "fr" ? meta.labelFR : meta.labelEN}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-amber-800 text-xs gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          {lang === "fr" ? "Chargement des profils..." : "Loading profiles..."}
        </div>
      ) : filteredProfiles.length === 0 ? (
        <div className="text-center py-16 text-xs font-serif text-amber-800 border border-dashed border-amber-200 rounded-2xl bg-amber-50/10">
          {lang === "fr" ? "Aucun profil ne correspond à ces filtres." : "No profile matches these filters."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredProfiles.map((p, idx) => {
            const availability = AVAILABILITY_META[p.availabilityStatus];
            return (
              <motion.a
                key={p.userId}
                href={`/pro/${p.userId}`}
                target="_blank"
                rel="noreferrer"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.3, delay: Math.min(idx, 5) * 0.05 }}
                whileHover={{ y: -3 }}
                className="bg-white border border-amber-100/80 p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex gap-3.5"
              >
                <div className="w-12 h-12 shrink-0 rounded-full bg-amber-50 border border-amber-200 overflow-hidden flex items-center justify-center">
                  {p.avatarUrl ? (
                    <img src={p.avatarUrl} alt={p.fullName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <User className="w-6 h-6 text-amber-800/40" />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-amber-950 text-sm truncate">{p.fullName}</p>
                    <span
                      className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-full text-white shrink-0"
                      style={{ backgroundColor: availability?.color }}
                    >
                      {lang === "fr" ? availability?.labelFR : availability?.labelEN}
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-800 font-semibold">{p.headline}</p>
                  {p.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {p.skills.slice(0, 4).map((skill) => (
                        <span key={skill} className="bg-amber-50 border border-amber-200 text-amber-900 text-[9px] font-bold px-2 py-0.5 rounded-full">
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </motion.a>
            );
          })}
        </div>
      )}
    </div>
  );
}
