/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { supabaseService } from "../lib/supabase.ts";
import { BERTOUA_NEIGHBORHOODS } from "../data/bertouaData.ts";
import { toTitleCase } from "../lib/textFormat.ts";
import JobPostingEditor from "./JobPostingEditor.tsx";
import brandLogo from "../assets/images/one_village_logo_1784027088635.jpg";
import {
  Loader2,
  Briefcase,
  Building2,
  User,
  MapPin,
  Clock,
  ArrowLeft,
  Pencil,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";

const EMPLOYMENT_TYPE_LABELS: Record<string, { labelFR: string; labelEN: string }> = {
  full_time: { labelFR: "Temps plein", labelEN: "Full-time" },
  part_time: { labelFR: "Temps partiel", labelEN: "Part-time" },
  contract: { labelFR: "Contrat", labelEN: "Contract" },
  gig: { labelFR: "Mission ponctuelle", labelEN: "Gig" },
};

const APPLICATION_STATUS_META: Record<string, { labelFR: string; labelEN: string; color: string }> = {
  submitted: { labelFR: "Envoyée", labelEN: "Submitted", color: "#E3A23D" },
  reviewed: { labelFR: "En cours d'examen", labelEN: "Reviewed", color: "#5C7C8A" },
  accepted: { labelFR: "Acceptée", labelEN: "Accepted", color: "#245C46" },
  rejected: { labelFR: "Refusée", labelEN: "Rejected", color: "#B8492E" },
};

interface JobDetailPageProps {
  jobId: string;
  lang: "fr" | "en";
  currentUserId: string | null;
}

export default function JobDetailPage({ jobId, lang, currentUserId }: JobDetailPageProps) {
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<Awaited<ReturnType<typeof supabaseService.getJobPostingDetail>>>(null);
  const [editing, setEditing] = useState(false);

  const [myApplication, setMyApplication] = useState<Awaited<ReturnType<typeof supabaseService.getMyApplicationForJob>>>(null);
  const [coverNote, setCoverNote] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [applySuccess, setApplySuccess] = useState(false);

  const [applicants, setApplicants] = useState<Awaited<ReturnType<typeof supabaseService.getJobApplicants>>>([]);
  const [applicantsLoading, setApplicantsLoading] = useState(false);
  const [updatingApplicationId, setUpdatingApplicationId] = useState<string | null>(null);

  const isPoster = !!job && !!currentUserId && job.postedBy === currentUserId;

  const fetchJob = () => {
    setLoading(true);
    supabaseService.getJobPostingDetail(jobId).then((data) => {
      setJob(data);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchJob();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  useEffect(() => {
    if (!job || !currentUserId || isPoster) return;
    supabaseService.getMyApplicationForJob(job.id, currentUserId).then(setMyApplication);
  }, [job, currentUserId, isPoster]);

  useEffect(() => {
    if (!job || !isPoster) return;
    setApplicantsLoading(true);
    supabaseService.getJobApplicants(job.id).then((list) => {
      setApplicants(list);
      setApplicantsLoading(false);
    });
  }, [job, isPoster]);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job || !currentUserId) return;
    setApplying(true);
    setApplyError("");
    try {
      await supabaseService.applyToJob(job.id, currentUserId, coverNote.trim());
      setApplySuccess(true);
      setMyApplication({ status: "submitted", coverNote: coverNote.trim() || null, createdAt: new Date().toISOString() });
    } catch (err: any) {
      if (err.code === "ALREADY_APPLIED") {
        setApplyError(lang === "fr" ? "Vous avez déjà postulé à cette offre." : "You've already applied to this job.");
        supabaseService.getMyApplicationForJob(job.id, currentUserId).then(setMyApplication);
      } else {
        console.error("Job application error:", err);
        setApplyError(err.message || (lang === "fr" ? "Erreur lors de l'envoi de la candidature." : "Error submitting application."));
      }
    } finally {
      setApplying(false);
    }
  };

  const handleApplicationStatusChange = async (applicationId: string, status: "submitted" | "reviewed" | "accepted" | "rejected") => {
    setUpdatingApplicationId(applicationId);
    try {
      await supabaseService.updateJobApplicationStatus(applicationId, status);
      setApplicants((prev) => prev.map((a) => (a.id === applicationId ? { ...a, status } : a)));
    } catch (err: any) {
      // Part B bug fix: this previously failed silently — the status dropdown just reverted to its
      // old value on the next render with no indication anything went wrong.
      console.error("Application status update error:", err);
      alert(
        lang === "fr"
          ? `Erreur lors de la mise à jour du statut : ${err?.message || err}`
          : `Error updating application status: ${err?.message || err}`
      );
    } finally {
      setUpdatingApplicationId(null);
    }
  };

  const employmentLabel = job ? EMPLOYMENT_TYPE_LABELS[job.employmentType] : null;
  const neighborhoodName = job?.neighborhoodId
    ? BERTOUA_NEIGHBORHOODS.find((n) => n.id === job.neighborhoodId)?.name || toTitleCase(job.neighborhoodId)
    : null;

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
            {lang === "fr" ? "Chargement de l'offre..." : "Loading job posting..."}
          </div>
        ) : !job ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-white border border-dashed border-amber-200 rounded-3xl p-12 text-center space-y-3"
          >
            <div className="w-14 h-14 mx-auto rounded-full bg-amber-50 flex items-center justify-center">
              <Briefcase className="w-7 h-7 text-amber-800/50" />
            </div>
            <h2 className="font-black text-amber-950 text-base">
              {lang === "fr" ? "Offre introuvable" : "Job posting not found"}
            </h2>
          </motion.div>
        ) : editing ? (
          <div className="bg-white border border-amber-100 rounded-3xl p-6 sm:p-8 shadow-sm">
            <h2 className="font-black text-amber-950 text-sm uppercase mb-5">
              {lang === "fr" ? "Modifier l'Offre" : "Edit Job Posting"}
            </h2>
            <JobPostingEditor
              lang={lang}
              userId={job.postedBy}
              jobId={job.id}
              onSaved={() => {
                setEditing(false);
                fetchJob();
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
            <div className="bg-gradient-to-br from-[#241611] via-[#7A3420] to-[#241611] p-6 sm:p-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-[#E3A23D]/15 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
              <div className="relative z-10 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[#F2B355] text-[11px] font-bold mb-1.5">
                    {job.companyName ? <Building2 className="w-3.5 h-3.5 shrink-0" /> : <User className="w-3.5 h-3.5 shrink-0" />}
                    <span>{job.companyName || job.posterName || (lang === "fr" ? "Particulier" : "Individual")}</span>
                  </div>
                  <h1 className="text-white font-black text-lg sm:text-xl leading-snug">{job.title}</h1>
                  <span
                    className={`inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      job.status === "open" ? "bg-emerald-600 text-white" : "bg-neutral-600 text-white"
                    }`}
                  >
                    {job.status === "open" ? (lang === "fr" ? "Ouverte" : "Open") : (lang === "fr" ? "Fermée" : "Closed")}
                  </span>
                </div>
                {isPoster && (
                  <button
                    onClick={() => setEditing(true)}
                    className="bg-white/95 hover:bg-white text-amber-950 font-bold text-[11px] px-3 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm shrink-0"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    {lang === "fr" ? "Modifier" : "Edit"}
                  </button>
                )}
              </div>
            </div>

            <div className="p-6 sm:p-8 space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] text-amber-800 font-medium">
                <div className="flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  <span>{lang === "fr" ? employmentLabel?.labelFR : employmentLabel?.labelEN}</span>
                </div>
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
                {(job.categoryNameFr || job.customCategory) && (
                  <div className="flex items-center gap-1.5">
                    <span className="bg-amber-50 border border-amber-200 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {job.categoryNameFr ? (lang === "fr" ? job.categoryNameFr : job.categoryNameEn) : job.customCategory}
                    </span>
                  </div>
                )}
              </div>

              {job.salaryRange && <p className="text-sm font-black text-amber-950 font-mono">{job.salaryRange}</p>}

              <div className="space-y-1.5">
                <h3 className="text-[10px] font-black text-amber-950 uppercase tracking-wider">
                  {lang === "fr" ? "Description" : "Description"}
                </h3>
                <p className="text-sm text-amber-900 font-serif leading-relaxed whitespace-pre-line break-words">{job.description}</p>
              </div>

              {/* Apply flow / application status (non-poster) */}
              {!isPoster && (
                <div className="border-t border-amber-50 pt-5">
                  {!currentUserId ? (
                    <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-4 text-center">
                      <p className="text-xs text-amber-900 font-serif">
                        {lang === "fr" ? (
                          <>
                            <a href="/" className="font-bold underline">Connectez-vous</a> pour postuler à cette offre.
                          </>
                        ) : (
                          <>
                            <a href="/" className="font-bold underline">Sign in</a> to apply to this job.
                          </>
                        )}
                      </p>
                    </div>
                  ) : myApplication || applySuccess ? (
                    <div className="bg-[#FAF8F5] border border-amber-100 rounded-2xl p-4 space-y-2">
                      <h3 className="text-[10px] font-black text-amber-950 uppercase tracking-wider">
                        {lang === "fr" ? "Votre candidature" : "Your Application"}
                      </h3>
                      <span
                        className="inline-block px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider text-white"
                        style={{ backgroundColor: APPLICATION_STATUS_META[myApplication?.status || "submitted"].color }}
                      >
                        {lang === "fr"
                          ? APPLICATION_STATUS_META[myApplication?.status || "submitted"].labelFR
                          : APPLICATION_STATUS_META[myApplication?.status || "submitted"].labelEN}
                      </span>
                    </div>
                  ) : job.status !== "open" ? (
                    <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 text-center">
                      <p className="text-xs text-neutral-700 font-serif">
                        {lang === "fr" ? "Cette offre est fermée aux candidatures." : "This job posting is closed to applications."}
                      </p>
                    </div>
                  ) : (
                    <form onSubmit={handleApply} className="space-y-3">
                      <h3 className="text-[10px] font-black text-amber-950 uppercase tracking-wider">
                        {lang === "fr" ? "Postuler à cette offre" : "Apply to this job"}
                      </h3>
                      {applyError && (
                        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3 text-xs font-bold flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                          <span>{applyError}</span>
                        </div>
                      )}
                      <textarea
                        rows={3}
                        value={coverNote}
                        onChange={(e) => setCoverNote(e.target.value)}
                        placeholder={lang === "fr" ? "Note de motivation (optionnel)..." : "Cover note (optional)..."}
                        className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-[#E3A23D] font-serif"
                      />
                      <button
                        type="submit"
                        disabled={applying}
                        className="bg-[#E3A23D] hover:bg-[#F2B355] text-[#241611] font-black text-xs px-6 py-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                      >
                        {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        {lang === "fr" ? "Envoyer ma candidature" : "Submit Application"}
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* Applicant management (poster only) */}
              {isPoster && (
                <div className="border-t border-amber-50 pt-5 space-y-3">
                  <h3 className="text-[10px] font-black text-amber-950 uppercase tracking-wider">
                    {lang === "fr" ? `Candidatures (${applicants.length})` : `Applications (${applicants.length})`}
                  </h3>
                  {applicantsLoading ? (
                    <div className="flex items-center justify-center py-8 text-amber-800 text-xs gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {lang === "fr" ? "Chargement..." : "Loading..."}
                    </div>
                  ) : applicants.length === 0 ? (
                    <div className="text-center py-8 border border-dashed border-amber-200 rounded-2xl bg-[#FAF8F5]">
                      <p className="text-xs text-amber-800/70 font-serif italic">
                        {lang === "fr" ? "Aucune candidature pour le moment." : "No applications yet."}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {applicants.map((a) => (
                        <div key={a.id} className="border border-amber-100 rounded-2xl p-4 bg-[#FAF8F5]/50 space-y-2.5">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-amber-950 text-xs">{a.applicantName || "—"}</span>
                              {a.hasProfessionalProfile && (
                                <a
                                  href={`/pro/${a.applicantId}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-1 text-[10px] font-bold text-[#245C46] hover:underline"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  {lang === "fr" ? "Profil professionnel" : "Professional profile"}
                                </a>
                              )}
                            </div>
                            <select
                              value={a.status}
                              disabled={updatingApplicationId === a.id}
                              onChange={(e) => handleApplicationStatusChange(a.id, e.target.value as any)}
                              className="bg-white border border-amber-200 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-amber-950 focus:outline-none cursor-pointer disabled:opacity-50"
                            >
                              {Object.entries(APPLICATION_STATUS_META).map(([value, meta]) => (
                                <option key={value} value={value}>
                                  {lang === "fr" ? meta.labelFR : meta.labelEN}
                                </option>
                              ))}
                            </select>
                          </div>
                          {a.coverNote && <p className="text-xs text-amber-900 font-serif italic">"{a.coverNote}"</p>}
                          <p className="text-[9px] text-amber-800/60 font-mono">
                            {new Date(a.createdAt).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US")}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
