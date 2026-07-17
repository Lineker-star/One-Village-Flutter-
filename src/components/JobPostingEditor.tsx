/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { supabaseService } from "../lib/supabase.ts";
import { BERTOUA_NEIGHBORHOODS } from "../data/bertouaData.ts";
import {
  Loader2,
  CheckCircle,
  AlertTriangle,
  Trash2,
  Lock,
  Unlock,
} from "lucide-react";

const EMPLOYMENT_TYPES: Array<{ value: "full_time" | "part_time" | "contract" | "gig"; labelFR: string; labelEN: string }> = [
  { value: "full_time", labelFR: "Temps plein", labelEN: "Full-time" },
  { value: "part_time", labelFR: "Temps partiel", labelEN: "Part-time" },
  { value: "contract", labelFR: "Contrat", labelEN: "Contract" },
  { value: "gig", labelFR: "Mission ponctuelle", labelEN: "Gig" },
];

interface JobPostingEditorProps {
  lang: "fr" | "en";
  userId: string;
  jobId?: string; // undefined = create mode
  onSaved: (jobId: string) => void;
  onCancel: () => void;
  onDeleted?: () => void;
}

export default function JobPostingEditor({ lang, userId, jobId, onSaved, onCancel, onDeleted }: JobPostingEditorProps) {
  const isEditing = !!jobId;
  const [loading, setLoading] = useState(true);

  const [myCompanies, setMyCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [companyId, setCompanyId] = useState<string>(""); // "" = individual

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categories, setCategories] = useState<Array<{ id: number; slug: string; nameFr: string; nameEn: string }>>([]);
  const [categoryId, setCategoryId] = useState<string>(""); // "" = none
  const [isOtherCategory, setIsOtherCategory] = useState(false);
  const [customCategory, setCustomCategory] = useState("");
  const [neighborhoodId, setNeighborhoodId] = useState("mokolo");
  const [useFreeTextNeighborhood, setUseFreeTextNeighborhood] = useState(false);
  const [neighborhoodFreeText, setNeighborhoodFreeText] = useState("");
  const [employmentType, setEmploymentType] = useState<"full_time" | "part_time" | "contract" | "gig">("full_time");
  const [salaryRange, setSalaryRange] = useState("");
  const [status, setStatus] = useState<"open" | "closed">("open");

  const [saving, setSaving] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [loadError, setLoadError] = useState(false);

  // Item 1 fix: this form lives inside a scrollable modal (JobsBrowsePage's post modal, or the
  // JobDetailPage inline editor) — native `required` validation tries to scroll the invalid field
  // into view itself, but that doesn't reliably reach across the modal's own scroll container, so
  // the tooltip can appear to point at nothing. Replaced with manual validation + scrollIntoView,
  // which correctly walks every scrollable ancestor regardless of nesting.
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; description?: string }>({});
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const focusInvalidField = (ref: React.RefObject<HTMLElement>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    (ref.current as HTMLInputElement | HTMLTextAreaElement | null)?.focus({ preventScroll: true });
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      supabaseService.getMyCompanies(userId),
      supabaseService.getAllServiceCategories(),
      jobId ? supabaseService.getJobPostingForEditing(jobId) : Promise.resolve(null),
    ]).then(([companies, cats, job]) => {
      if (!active) return;
      // Part B bug fix: if we're editing an existing posting (jobId given) but the fetch came back
      // empty, that's now either a real error (which getJobPostingForEditing throws, caught below)
      // or a genuinely-deleted job — either way, rendering an empty save-ready form here risked
      // silently overwriting a real posting's data. Treat it as a load failure instead.
      if (jobId && !job) {
        setLoadError(true);
        setLoading(false);
        return;
      }
      setMyCompanies(companies);
      setCategories(cats);
      if (job) {
        setTitle(job.title);
        setDescription(job.description);
        setCompanyId(job.companyId || "");
        if (job.categoryId != null) {
          setCategoryId(String(job.categoryId));
          setIsOtherCategory(false);
        } else if (job.customCategory) {
          setIsOtherCategory(true);
          setCustomCategory(job.customCategory);
        } else {
          setCategoryId("");
        }
        const knownNeighborhood = BERTOUA_NEIGHBORHOODS.some((n) => n.id === job.neighborhoodId);
        if (job.neighborhoodId && !knownNeighborhood) {
          setUseFreeTextNeighborhood(true);
          setNeighborhoodFreeText(job.neighborhoodId);
        } else if (job.neighborhoodId) {
          setNeighborhoodId(job.neighborhoodId);
        }
        setEmploymentType(job.employmentType);
        setSalaryRange(job.salaryRange);
        setStatus(job.status);
      }
      setLoading(false);
    }).catch((err) => {
      if (!active) return;
      console.error("Failed to load job posting editor data:", err);
      setLoadError(true);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [userId, jobId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { title?: string; description?: string } = {};
    if (!title.trim()) {
      errors.title = lang === "fr" ? "Le titre du poste est obligatoire." : "Job title is required.";
    }
    if (!description.trim()) {
      errors.description = lang === "fr" ? "La description du poste est obligatoire." : "Job description is required.";
    }
    setFieldErrors(errors);
    if (errors.title) {
      focusInvalidField(titleRef);
      return;
    }
    if (errors.description) {
      focusInvalidField(descriptionRef);
      return;
    }
    setSaving(true);
    setErrorMsg("");
    try {
      const effectiveNeighborhoodId = useFreeTextNeighborhood ? neighborhoodFreeText.trim() : neighborhoodId;
      const input = {
        title: title.trim(),
        description: description.trim(),
        companyId: companyId || null,
        // Item 2: "Autre" is never blocking — an empty custom category still submits fine, matching
        // the provider-registration wizard's same "Autre" pattern (admin can moderate/fill in later).
        categoryId: !isOtherCategory && categoryId ? Number(categoryId) : null,
        customCategory: isOtherCategory ? customCategory.trim() || null : null,
        neighborhoodId: effectiveNeighborhoodId,
        employmentType,
        salaryRange: salaryRange.trim(),
      };

      if (isEditing && jobId) {
        await supabaseService.updateJobPosting(jobId, input);
        onSaved(jobId);
      } else {
        const newId = await supabaseService.createJobPosting(userId, input);
        onSaved(newId);
      }
    } catch (err: any) {
      console.error("Job posting save error:", err);
      setErrorMsg(err.message || (lang === "fr" ? "Erreur lors de l'enregistrement." : "Error saving job posting."));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!jobId) return;
    setTogglingStatus(true);
    setErrorMsg("");
    try {
      const nextStatus = status === "open" ? "closed" : "open";
      await supabaseService.setJobPostingStatus(jobId, nextStatus);
      setStatus(nextStatus);
    } catch (err: any) {
      console.error("Job status toggle error:", err);
      setErrorMsg(err.message || (lang === "fr" ? "Erreur lors du changement de statut." : "Error changing status."));
    } finally {
      setTogglingStatus(false);
    }
  };

  const handleDelete = async () => {
    if (!jobId) return;
    setDeleting(true);
    setErrorMsg("");
    try {
      const applicationCount = await supabaseService.getJobApplicationCount(jobId);
      if (applicationCount > 0) {
        setErrorMsg(
          lang === "fr"
            ? "Impossible de supprimer une offre ayant déjà reçu des candidatures — fermez-la plutôt."
            : "Can't delete a posting that already has applications — close it instead."
        );
        setDeleting(false);
        return;
      }
      const confirmMsg =
        lang === "fr" ? `Supprimer définitivement l'offre "${title}" ?` : `Permanently delete the "${title}" posting?`;
      if (!window.confirm(confirmMsg)) {
        setDeleting(false);
        return;
      }
      await supabaseService.deleteJobPosting(jobId);
      onDeleted?.();
    } catch (err: any) {
      console.error("Job posting delete error:", err);
      setErrorMsg(err.message || (lang === "fr" ? "Erreur lors de la suppression." : "Error deleting job posting."));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-amber-800 text-xs gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        {lang === "fr" ? "Chargement..." : "Loading..."}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="text-center py-10 px-4 space-y-3 border border-red-200 rounded-2xl bg-red-50">
        <AlertTriangle className="w-8 h-8 text-red-600 mx-auto" />
        <p className="text-xs text-red-800 font-bold">
          {lang === "fr" ? "Impossible de charger cette offre. Réessayez avant de continuer." : "Couldn't load this job posting. Please retry before continuing."}
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="bg-white border border-red-200 text-red-800 font-bold text-xs px-4 py-2.5 rounded-xl cursor-pointer transition-colors"
        >
          {lang === "fr" ? "Fermer" : "Close"}
        </button>
      </div>
    );
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      onSubmit={handleSave}
      noValidate
      className="space-y-3.5"
    >
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3 text-xs font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {isEditing && (
        <div className="flex items-center justify-between bg-[#FAF8F5] border border-amber-100 rounded-xl p-3">
          <span
            className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
              status === "open" ? "bg-emerald-100 text-emerald-800 border border-emerald-200" : "bg-neutral-100 text-neutral-700 border border-neutral-200"
            }`}
          >
            {status === "open" ? (lang === "fr" ? "Ouverte" : "Open") : (lang === "fr" ? "Fermée" : "Closed")}
          </span>
          <button
            type="button"
            onClick={handleToggleStatus}
            disabled={togglingStatus}
            className="flex items-center gap-1.5 text-[11px] font-bold text-amber-900 hover:text-amber-950 cursor-pointer disabled:opacity-50"
          >
            {togglingStatus ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : status === "open" ? (
              <Lock className="w-3.5 h-3.5" />
            ) : (
              <Unlock className="w-3.5 h-3.5" />
            )}
            {status === "open" ? (lang === "fr" ? "Fermer l'offre" : "Close posting") : (lang === "fr" ? "Rouvrir l'offre" : "Reopen posting")}
          </button>
        </div>
      )}

      {/* Posting as: individual vs. one of the poster's own company pages */}
      {myCompanies.length > 0 && (
        <div className="space-y-1">
          <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
            {lang === "fr" ? "Publier en tant que" : "Post as"}
          </label>
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-950 focus:outline-none"
          >
            <option value="">{lang === "fr" ? "Particulier (mon propre nom)" : "Individual (my own name)"}</option>
            {myCompanies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
          {lang === "fr" ? "Titre du poste" : "Job Title"}
        </label>
        <input
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => { setTitle(e.target.value); if (fieldErrors.title) setFieldErrors((prev) => ({ ...prev, title: undefined })); }}
          placeholder={lang === "fr" ? "ex: Maçon expérimenté" : "ex: Experienced mason"}
          className={`w-full bg-[#FAF8F5] border rounded-xl px-4 py-2.5 text-xs text-amber-950 focus:outline-none focus:ring-1 ${
            fieldErrors.title ? "border-red-300 focus:ring-red-400" : "border-amber-200 focus:ring-[#E3A23D]"
          }`}
        />
        {fieldErrors.title && <p className="text-[11px] text-red-700 font-bold">{fieldErrors.title}</p>}
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
          {lang === "fr" ? "Description du poste" : "Job Description"}
        </label>
        <textarea
          ref={descriptionRef}
          rows={3}
          value={description}
          onChange={(e) => { setDescription(e.target.value); if (fieldErrors.description) setFieldErrors((prev) => ({ ...prev, description: undefined })); }}
          placeholder={lang === "fr" ? "Décrivez les missions, les compétences requises..." : "Describe responsibilities, required skills..."}
          className={`w-full bg-[#FAF8F5] border rounded-xl px-4 py-2.5 text-xs text-amber-950 focus:outline-none focus:ring-1 font-serif resize-none ${
            fieldErrors.description ? "border-red-300 focus:ring-red-400" : "border-amber-200 focus:ring-[#E3A23D]"
          }`}
        />
        {fieldErrors.description && <p className="text-[11px] text-red-700 font-bold">{fieldErrors.description}</p>}
      </div>

      {/* Item redesign: category/neighborhood in one 2-column grid, employment-type/salary in a
          second — two explicit grids instead of one full-width row each, so both rows sit
          side-by-side on desktop and stack on mobile. Cuts the modal's total height substantially
          without dropping any field. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
            {lang === "fr" ? "Catégorie / Métier associé" : "Related Category"}
          </label>
          <select
            value={isOtherCategory ? "OTHER" : categoryId}
            onChange={(e) => {
              if (e.target.value === "OTHER") {
                setIsOtherCategory(true);
              } else {
                setIsOtherCategory(false);
                setCategoryId(e.target.value);
              }
            }}
            className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-950 focus:outline-none"
          >
            <option value="">{lang === "fr" ? "Aucune / Non applicable" : "None / Not applicable"}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {lang === "fr" ? c.nameFr : c.nameEn}
              </option>
            ))}
            <option value="OTHER">{lang === "fr" ? "Autre — préciser" : "Other — specify"}</option>
          </select>
          {isOtherCategory && (
            <input
              type="text"
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              placeholder={lang === "fr" ? "ex: Community manager" : "ex: Community manager"}
              className="w-full bg-white border border-amber-200 rounded-xl px-4 py-2 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-800 mt-1.5"
            />
          )}
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
            {lang === "fr" ? "Quartier de Bertoua" : "Bertoua Neighborhood"}
          </label>
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
            className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-950 focus:outline-none"
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
              className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-2 text-xs text-amber-950 focus:outline-none mt-1.5"
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Employment type */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
            {lang === "fr" ? "Type de contrat" : "Employment Type"}
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {EMPLOYMENT_TYPES.map((opt) => {
              const isSelected = employmentType === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setEmploymentType(opt.value)}
                  className={`px-2.5 py-2 rounded-xl border text-[11px] font-bold cursor-pointer transition-all text-center ${
                    isSelected ? "bg-[#E3A23D] border-[#E3A23D] text-[#241611]" : "bg-[#FAF8F5] border-amber-200/60 text-amber-950 hover:bg-amber-100/30"
                  }`}
                >
                  {lang === "fr" ? opt.labelFR : opt.labelEN}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
            {lang === "fr" ? "Fourchette de salaire (optionnel)" : "Salary Range (optional)"}
          </label>
          <input
            type="text"
            value={salaryRange}
            onChange={(e) => setSalaryRange(e.target.value)}
            placeholder={lang === "fr" ? "ex: 80 000 - 120 000 FCFA / mois" : "ex: 80,000 - 120,000 FCFA / month"}
            className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-[#E3A23D]"
          />
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-amber-50">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-3 border border-amber-200 text-amber-900 hover:bg-amber-50 font-bold rounded-xl text-xs transition-colors cursor-pointer"
          >
            {lang === "fr" ? "Annuler" : "Cancel"}
          </button>
          {isEditing && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-3 border border-red-200 text-red-800 hover:bg-red-50 font-bold rounded-xl text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              {lang === "fr" ? "Supprimer" : "Delete"}
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={saving}
          className="bg-[#E3A23D] hover:bg-[#F2B355] text-[#241611] font-black text-xs px-6 py-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {lang === "fr" ? "Enregistrement..." : "Saving..."}
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              {lang === "fr" ? "Publier" : "Publish"}
            </>
          )}
        </button>
      </div>
    </motion.form>
  );
}
