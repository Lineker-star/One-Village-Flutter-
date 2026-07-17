/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { supabaseService } from "../lib/supabase.ts";
import { BERTOUA_NEIGHBORHOODS } from "../data/bertouaData.ts";
import { toTitleCase } from "../lib/textFormat.ts";
import CompanyEditor from "./CompanyEditor.tsx";
import brandLogo from "../assets/images/one_village_logo_1784027088635.jpg";
import {
  Loader2,
  Building2,
  MapPin,
  Globe,
  Link as LinkIcon,
  Briefcase,
  Pencil,
  Trash2,
  ArrowLeft,
  Clock,
} from "lucide-react";

const EMPLOYMENT_TYPE_LABELS: Record<string, { labelFR: string; labelEN: string }> = {
  full_time: { labelFR: "Temps plein", labelEN: "Full-time" },
  part_time: { labelFR: "Temps partiel", labelEN: "Part-time" },
  contract: { labelFR: "Contrat", labelEN: "Contract" },
  gig: { labelFR: "Mission ponctuelle", labelEN: "Gig" },
};

interface PublicCompanyPageProps {
  companyId: string;
  lang: "fr" | "en";
  currentUserId: string | null;
}

export default function PublicCompanyPage({ companyId, lang, currentUserId }: PublicCompanyPageProps) {
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<Awaited<ReturnType<typeof supabaseService.getPublicCompany>>>(null);
  const [openJobs, setOpenJobs] = useState<Awaited<ReturnType<typeof supabaseService.getCompanyOpenJobPostings>>>([]);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchCompany = () => {
    setLoading(true);
    supabaseService.getPublicCompany(companyId).then((data) => {
      setCompany(data);
      setLoading(false);
      if (data) {
        supabaseService.getCompanyOpenJobPostings(data.id).then(setOpenJobs);
      }
    });
  };

  useEffect(() => {
    fetchCompany();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const isOwner = !!company && !!currentUserId && company.ownerId === currentUserId;

  const handleDelete = async () => {
    if (!company) return;
    const confirmMsg =
      lang === "fr"
        ? `Supprimer définitivement la page "${company.name}" ? Cette action est irréversible.`
        : `Permanently delete the "${company.name}" page? This cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;
    setDeleting(true);
    try {
      await supabaseService.deleteCompany(company.id);
      window.location.href = "/";
    } catch (err: any) {
      // Part B bug fix: this previously failed silently — the button just stopped spinning with
      // no indication the delete didn't go through.
      console.error("Company delete error:", err);
      alert(
        lang === "fr"
          ? `Erreur lors de la suppression : ${err?.message || err}`
          : `Error deleting the page: ${err?.message || err}`
      );
      setDeleting(false);
    }
  };

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
          <a href="/" className="flex items-center gap-1.5 text-xs font-bold text-amber-900 hover:text-amber-950 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            {lang === "fr" ? "Retour à l'accueil" : "Back home"}
          </a>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-10">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-amber-800 text-sm gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            {lang === "fr" ? "Chargement de la page..." : "Loading page..."}
          </div>
        ) : !company ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-white border border-dashed border-amber-200 rounded-3xl p-12 text-center space-y-3"
          >
            <div className="w-14 h-14 mx-auto rounded-full bg-amber-50 flex items-center justify-center">
              <Building2 className="w-7 h-7 text-amber-800/50" />
            </div>
            <h2 className="font-black text-amber-950 text-base">
              {lang === "fr" ? "Page entreprise introuvable" : "Company page not found"}
            </h2>
          </motion.div>
        ) : editing ? (
          <div className="bg-white border border-amber-100 rounded-3xl p-6 sm:p-8 shadow-sm">
            <h2 className="font-black text-amber-950 text-sm uppercase mb-5">
              {lang === "fr" ? "Modifier la Page Entreprise" : "Edit Company Page"}
            </h2>
            <CompanyEditor
              lang={lang}
              ownerId={company.ownerId}
              companyId={company.id}
              onSaved={() => {
                setEditing(false);
                fetchCompany();
              }}
              onCancel={() => setEditing(false)}
              onDeleted={() => {
                window.location.href = "/";
              }}
            />
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="bg-white border border-amber-100 rounded-3xl shadow-sm overflow-hidden"
          >
            {/* Cover + logo, lightweight Facebook/LinkedIn-style page header */}
            <div className="relative">
              <div className="h-40 sm:h-56 bg-gradient-to-br from-[#241611] via-[#7A3420] to-[#241611] overflow-hidden">
                {company.coverImageUrl && (
                  <img src={company.coverImageUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                )}
              </div>
              <div className="absolute -bottom-8 left-6 w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white border-4 border-white shadow-md overflow-hidden flex items-center justify-center">
                {company.logoUrl ? (
                  <img src={company.logoUrl} alt={company.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <Building2 className="w-9 h-9 text-amber-800/30" />
                )}
              </div>

              {isOwner && (
                <div className="absolute top-3 right-3 flex gap-2">
                  <button
                    onClick={() => setEditing(true)}
                    className="bg-white/95 hover:bg-white text-amber-950 font-bold text-[11px] px-3 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    {lang === "fr" ? "Modifier" : "Edit"}
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="bg-white/95 hover:bg-red-50 text-red-800 font-bold text-[11px] px-3 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm disabled:opacity-50"
                  >
                    {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    {lang === "fr" ? "Supprimer" : "Delete"}
                  </button>
                </div>
              )}
            </div>

            <div className="pt-11 px-6 sm:px-8 pb-6 sm:pb-8 space-y-6">
              <div>
                <h1 className="font-black text-amber-950 text-lg sm:text-xl">{company.name}</h1>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  {company.industry && (
                    <span className="bg-[#E3A23D]/15 text-[#7A3420] text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full">
                      {company.industry}
                    </span>
                  )}
                  {company.neighborhoodId && (
                    <span className="flex items-center gap-1 text-[11px] text-amber-800 font-medium">
                      <MapPin className="w-3.5 h-3.5" />
                      {BERTOUA_NEIGHBORHOODS.find((n) => n.id === company.neighborhoodId)?.name || toTitleCase(company.neighborhoodId)}
                    </span>
                  )}
                </div>
              </div>

              {company.description && (
                <p className="text-sm text-amber-900 font-serif leading-relaxed whitespace-pre-line break-words">{company.description}</p>
              )}

              {(company.website || company.socialLinks.length > 0) && (
                <div className="flex flex-wrap gap-2">
                  {company.website && (
                    <a
                      href={company.website}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 bg-[#FAF8F5] border border-amber-200 hover:bg-amber-100/50 text-amber-950 text-xs font-bold px-3.5 py-2 rounded-xl transition-colors"
                    >
                      <Globe className="w-3.5 h-3.5 text-amber-700" />
                      {lang === "fr" ? "Site Web" : "Website"}
                    </a>
                  )}
                  {company.socialLinks.map((link, idx) => (
                    <a
                      key={idx}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 bg-[#FAF8F5] border border-amber-200 hover:bg-amber-100/50 text-amber-950 text-xs font-bold px-3.5 py-2 rounded-xl transition-colors"
                    >
                      <LinkIcon className="w-3.5 h-3.5 text-amber-700" />
                      {link.label}
                    </a>
                  ))}
                </div>
              )}

              {/* Item 3: job postings placeholder — already queries real job_postings data, so this
                  becomes live automatically once job-posting creation ships, with no restructuring. */}
              {/* Item 5: real open job postings for this company (queries job_postings live —
                  starts showing real openings the moment 8d's posting flow creates one, no
                  restructuring needed). */}
              <div className="border-t border-amber-50 pt-5">
                <h3 className="text-[10px] font-black text-amber-950 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                  <Briefcase className="w-3.5 h-3.5 text-amber-700" />
                  {lang === "fr" ? `Offres d'emploi (${openJobs.length})` : `Job Openings (${openJobs.length})`}
                </h3>
                {openJobs.length === 0 ? (
                  <div className="text-center py-8 border border-dashed border-amber-200 rounded-2xl bg-[#FAF8F5]">
                    <p className="text-xs text-amber-800/70 font-serif italic">
                      {lang === "fr" ? "Aucune offre pour le moment" : "No openings yet"}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {openJobs.map((job) => {
                      const employmentLabel = EMPLOYMENT_TYPE_LABELS[job.employmentType];
                      const neighborhoodName = job.neighborhoodId
                        ? BERTOUA_NEIGHBORHOODS.find((n) => n.id === job.neighborhoodId)?.name || toTitleCase(job.neighborhoodId)
                        : null;
                      return (
                        <a
                          key={job.id}
                          href={`/job/${job.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between gap-3 bg-[#FAF8F5] border border-amber-100 hover:border-amber-200 hover:shadow-sm rounded-xl px-4 py-3 transition-all"
                        >
                          <div className="min-w-0">
                            <p className="font-bold text-amber-950 text-xs truncate">{job.title}</p>
                            <div className="flex items-center gap-2 text-[10px] text-amber-800/80 mt-0.5">
                              <span>{lang === "fr" ? employmentLabel?.labelFR : employmentLabel?.labelEN}</span>
                              {neighborhoodName && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {neighborhoodName}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(job.createdAt).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}
                              </span>
                            </div>
                          </div>
                          {job.salaryRange && (
                            <span className="text-[10px] font-black text-amber-950 font-mono shrink-0">{job.salaryRange}</span>
                          )}
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
