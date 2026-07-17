/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { supabaseService } from "../lib/supabase.ts";
import { BERTOUA_NEIGHBORHOODS } from "../data/bertouaData.ts";
import { toTitleCase } from "../lib/textFormat.ts";
import JobPostingEditor from "./JobPostingEditor.tsx";
import {
  Briefcase,
  PlusCircle,
  MapPin,
  Clock,
  Building2,
  User,
  X,
  Loader2,
} from "lucide-react";

const EMPLOYMENT_TYPE_LABELS: Record<string, { labelFR: string; labelEN: string }> = {
  full_time: { labelFR: "Temps plein", labelEN: "Full-time" },
  part_time: { labelFR: "Temps partiel", labelEN: "Part-time" },
  contract: { labelFR: "Contrat", labelEN: "Contract" },
  gig: { labelFR: "Mission ponctuelle", labelEN: "Gig" },
};

interface JobsBrowsePageProps {
  lang: "fr" | "en";
  currentUserId: string | null;
}

export default function JobsBrowsePage({ lang, currentUserId }: JobsBrowsePageProps) {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Awaited<ReturnType<typeof supabaseService.getOpenJobPostings>>>([]);
  const [categories, setCategories] = useState<Array<{ id: number; slug: string; nameFr: string; nameEn: string }>>([]);
  const [filterCategory, setFilterCategory] = useState("ALL");
  const [filterNeighborhood, setFilterNeighborhood] = useState("ALL");
  const [filterEmploymentType, setFilterEmploymentType] = useState("ALL");
  const [showPostModal, setShowPostModal] = useState(false);

  const fetchJobs = () => {
    setLoading(true);
    Promise.all([supabaseService.getOpenJobPostings(), supabaseService.getAllServiceCategories()]).then(([jobList, cats]) => {
      setJobs(jobList);
      setCategories(cats);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      if (filterCategory !== "ALL" && j.categorySlug !== filterCategory) return false;
      if (filterNeighborhood !== "ALL" && j.neighborhoodId !== filterNeighborhood) return false;
      if (filterEmploymentType !== "ALL" && j.employmentType !== filterEmploymentType) return false;
      return true;
    });
  }, [jobs, filterCategory, filterNeighborhood, filterEmploymentType]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-amber-50/50 p-6 rounded-2xl border border-amber-200/50">
        <div>
          <h3 className="text-lg font-bold text-amber-950 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-amber-800" />
            {lang === "fr" ? "Offres d'Emploi" : "Job Opportunities"}
          </h3>
          <p className="text-xs text-amber-800 mt-1 max-w-xl">
            {lang === "fr"
              ? "Parcourez les offres d'emploi publiées par les habitants et entreprises de Bertoua."
              : "Browse job openings posted by Bertoua residents and businesses."}
          </p>
        </div>
        {currentUserId && (
          <button
            onClick={() => setShowPostModal(true)}
            className="bg-[#E3A23D] hover:bg-[#F2B355] text-[#241611] font-black text-xs px-4 py-3 rounded-xl flex items-center gap-2 transition-colors cursor-pointer shadow-sm shrink-0"
          >
            <PlusCircle className="w-4 h-4" />
            {lang === "fr" ? "Publier une Offre d'Emploi" : "Post a Job"}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="bg-white border border-amber-200 rounded-xl px-3.5 py-3 text-xs font-semibold text-amber-950 focus:outline-none cursor-pointer"
        >
          <option value="ALL">{lang === "fr" ? "Toutes les catégories" : "All categories"}</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {lang === "fr" ? c.nameFr : c.nameEn}
            </option>
          ))}
        </select>
        <select
          value={filterNeighborhood}
          onChange={(e) => setFilterNeighborhood(e.target.value)}
          className="bg-white border border-amber-200 rounded-xl px-3.5 py-3 text-xs font-semibold text-amber-950 focus:outline-none cursor-pointer"
        >
          <option value="ALL">{lang === "fr" ? "Tous les quartiers" : "All neighborhoods"}</option>
          {BERTOUA_NEIGHBORHOODS.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
        <select
          value={filterEmploymentType}
          onChange={(e) => setFilterEmploymentType(e.target.value)}
          className="bg-white border border-amber-200 rounded-xl px-3.5 py-3 text-xs font-semibold text-amber-950 focus:outline-none cursor-pointer"
        >
          <option value="ALL">{lang === "fr" ? "Tous les types de contrat" : "All employment types"}</option>
          {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([value, l]) => (
            <option key={value} value={value}>
              {lang === "fr" ? l.labelFR : l.labelEN}
            </option>
          ))}
        </select>
      </div>

      {/* Listings */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-amber-800 text-xs gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          {lang === "fr" ? "Chargement des offres..." : "Loading job postings..."}
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="text-center py-16 text-xs font-serif text-amber-800 border border-dashed border-amber-200 rounded-2xl bg-amber-50/10">
          {lang === "fr" ? "Aucune offre ne correspond à ces filtres." : "No job postings match these filters."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredJobs.map((job, idx) => {
            const employmentLabel = EMPLOYMENT_TYPE_LABELS[job.employmentType];
            const neighborhoodName = job.neighborhoodId
              ? BERTOUA_NEIGHBORHOODS.find((n) => n.id === job.neighborhoodId)?.name || toTitleCase(job.neighborhoodId)
              : null;
            return (
              <motion.a
                key={job.id}
                href={`/job/${job.id}`}
                target="_blank"
                rel="noreferrer"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.3, delay: Math.min(idx, 5) * 0.05 }}
                whileHover={{ y: -3 }}
                className="bg-white border border-amber-100/80 p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <h4 className="font-bold text-amber-950 text-sm leading-snug">{job.title}</h4>
                  <span className="bg-[#E3A23D]/15 text-[#7A3420] text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-full shrink-0">
                    {lang === "fr" ? employmentLabel?.labelFR : employmentLabel?.labelEN}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-amber-800 font-medium">
                  {job.companyName ? <Building2 className="w-3.5 h-3.5 shrink-0" /> : <User className="w-3.5 h-3.5 shrink-0" />}
                  <span>{job.companyName || (lang === "fr" ? "Particulier" : "Individual")}</span>
                </div>

                {(job.categoryNameFr || job.customCategory) && (
                  <span className="inline-flex self-start bg-amber-50 border border-amber-200 text-amber-900 text-[9px] font-bold px-2 py-0.5 rounded-full">
                    {job.categoryNameFr ? (lang === "fr" ? job.categoryNameFr : job.categoryNameEn) : job.customCategory}
                  </span>
                )}

                {/* Part C fix: was an unconditional 2-column grid — a long neighborhood name got
                    squeezed into half the card's width on a 375px screen. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] text-amber-800 font-medium">
                  {neighborhoodName && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      <span>{neighborhoodName}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span>{new Date(job.createdAt).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}</span>
                  </div>
                </div>

                {job.salaryRange && (
                  <p className="text-[11px] font-bold text-amber-950 font-mono">{job.salaryRange}</p>
                )}
              </motion.a>
            );
          })}
        </div>
      )}

      {/* Post Modal — widened again (max-w-3xl -> max-w-4xl) with a slightly shorter max-height
          (85vh, was 90vh) so on a realistic ~900px-tall desktop viewport the whole form fits with
          little to no internal scroll; the card still scrolls internally as a fallback on shorter
          screens rather than relying on the page behind it. */}
      {showPostModal && (
        <div className="fixed inset-0 bg-amber-950/40 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-y-auto shadow-xl border border-amber-100 relative my-6">
            <button
              onClick={() => setShowPostModal(false)}
              className="absolute top-4 right-4 p-2 text-amber-900/60 hover:text-amber-950 hover:bg-amber-50 rounded-full transition-colors cursor-pointer z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="p-6 sm:p-7">
              <h3 className="text-base font-bold text-amber-950 mb-1">
                {lang === "fr" ? "Publier une Offre d'Emploi" : "Post a Job"}
              </h3>
              <p className="text-xs text-amber-800 mb-3">
                {lang === "fr"
                  ? "Décrivez le poste à pourvoir pour la communauté de Bertoua."
                  : "Describe the open position for the Bertoua community."}
              </p>
              {currentUserId && (
                <JobPostingEditor
                  lang={lang}
                  userId={currentUserId}
                  onSaved={() => {
                    setShowPostModal(false);
                    fetchJobs();
                  }}
                  onCancel={() => setShowPostModal(false)}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
