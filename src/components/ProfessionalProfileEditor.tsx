/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { supabaseService } from "../lib/supabase.ts";
import {
  Briefcase,
  Plus,
  X,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Upload,
  FileText,
  Trash2,
  Link as LinkIcon,
  Sparkles,
} from "lucide-react";

const CV_ACCEPT = "application/pdf";

const AVAILABILITY_OPTIONS: Array<{ value: "open_to_work" | "employed" | "not_looking"; labelFR: string; labelEN: string; color: string }> = [
  { value: "open_to_work", labelFR: "Ouvert aux opportunités", labelEN: "Open to work", color: "#3E8467" },
  { value: "employed", labelFR: "En poste", labelEN: "Employed", color: "#E3A23D" },
  { value: "not_looking", labelFR: "Ne cherche pas", labelEN: "Not looking", color: "#8A8478" },
];

interface ProfessionalProfileEditorProps {
  lang: "fr" | "en";
  userId: string;
}

export default function ProfessionalProfileEditor({ lang, userId }: ProfessionalProfileEditorProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [exists, setExists] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [availabilityStatus, setAvailabilityStatus] = useState<"open_to_work" | "employed" | "not_looking">("open_to_work");
  const [portfolioLinks, setPortfolioLinks] = useState<Array<{ label: string; url: string }>>([]);
  const [portfolioLabelInput, setPortfolioLabelInput] = useState("");
  const [portfolioUrlInput, setPortfolioUrlInput] = useState("");

  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvPath, setCvPath] = useState<string | null>(null);
  const [cvSignedUrl, setCvSignedUrl] = useState<string | null>(null);
  const [removeCv, setRemoveCv] = useState(false);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Item 1 fix: this editor renders inside ProfileSettings.tsx's `fixed inset-0 overflow-y-auto`
  // modal — native `required` validation's own scroll-into-view is unreliable for a field that's
  // scrolled out of view within that container. Manual validation + scrollIntoView replaces it, and
  // (unlike before) actually blocks a whitespace-only headline/bio from ever reaching handleSave,
  // since this form previously relied ENTIRELY on the native `required` attribute for that check.
  const [fieldErrors, setFieldErrors] = useState<{ headline?: string; bio?: string }>({});
  const headlineRef = useRef<HTMLInputElement>(null);
  const bioRef = useRef<HTMLTextAreaElement>(null);

  const focusInvalidField = (ref: React.RefObject<HTMLElement>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    (ref.current as HTMLInputElement | HTMLTextAreaElement | null)?.focus({ preventScroll: true });
  };

  const loadProfile = () => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    supabaseService
      .getMyProfessionalProfile(userId)
      .then((record) => {
        if (!active) return;
        if (record) {
          setExists(true);
          setShowForm(true);
          setHeadline(record.headline);
          setBio(record.bio);
          setSkills(record.skills);
          setYearsExperience(record.yearsExperience != null ? String(record.yearsExperience) : "");
          setAvailabilityStatus(record.availabilityStatus);
          setPortfolioLinks(record.portfolioLinks);
          setCvPath(record.cvPath);
          setCvSignedUrl(record.cvSignedUrl);
        }
        setLoading(false);
      })
      .catch((err) => {
        // Part B bug fix: a failed fetch must not be treated the same as "no profile yet" — that
        // previously showed the "create your profile" prompt even when the user already has one,
        // risking an accidental overwrite with blank data on save.
        if (!active) return;
        console.error("Failed to load professional profile:", err);
        setLoadError(true);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  };

  useEffect(() => {
    return loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const addSkill = () => {
    const trimmed = skillInput.trim();
    if (trimmed && !skills.includes(trimmed)) {
      setSkills((prev) => [...prev, trimmed]);
    }
    setSkillInput("");
  };

  const removeSkill = (skill: string) => {
    setSkills((prev) => prev.filter((s) => s !== skill));
  };

  const addPortfolioLink = () => {
    const label = portfolioLabelInput.trim();
    const url = portfolioUrlInput.trim();
    if (!label || !url) return;
    setPortfolioLinks((prev) => [...prev, { label, url }]);
    setPortfolioLabelInput("");
    setPortfolioUrlInput("");
  };

  const removePortfolioLink = (index: number) => {
    setPortfolioLinks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { headline?: string; bio?: string } = {};
    if (!headline.trim()) {
      errors.headline = lang === "fr" ? "Le titre professionnel est obligatoire." : "The headline is required.";
    }
    if (!bio.trim()) {
      errors.bio = lang === "fr" ? "La bio professionnelle est obligatoire." : "The professional bio is required.";
    }
    setFieldErrors(errors);
    if (errors.headline) {
      focusInvalidField(headlineRef);
      return;
    }
    if (errors.bio) {
      focusInvalidField(bioRef);
      return;
    }
    setSaving(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      let cvPathToSave: string | null | undefined;
      if (removeCv && !cvFile) {
        if (cvPath) await supabaseService.removeStorageFile("provider-documents", cvPath);
        cvPathToSave = null;
      } else if (cvFile) {
        const ext = cvFile.name.split(".").pop() || "pdf";
        cvPathToSave = await supabaseService.uploadProviderMedia("provider-documents", userId, cvFile, `cv-professional.${ext}`);
      }

      await supabaseService.upsertProfessionalProfile(userId, {
        headline: headline.trim(),
        bio: bio.trim(),
        skills,
        yearsExperience: yearsExperience.trim() ? Number(yearsExperience) : null,
        availabilityStatus,
        cvPath: cvPathToSave,
        portfolioLinks,
      });

      if (cvPathToSave !== undefined) {
        setCvPath(cvPathToSave);
        setCvSignedUrl(cvFile ? URL.createObjectURL(cvFile) : null);
      }
      setCvFile(null);
      setRemoveCv(false);
      setExists(true);
      setSuccessMsg(lang === "fr" ? "Profil professionnel enregistré avec succès !" : "Professional profile saved successfully!");
    } catch (err: any) {
      console.error("Professional profile save error:", err);
      setErrorMsg(err.message || (lang === "fr" ? "Erreur lors de l'enregistrement." : "Error saving profile."));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const confirmMsg =
      lang === "fr"
        ? "Supprimer définitivement votre profil professionnel ? Il ne sera plus visible publiquement."
        : "Permanently delete your professional profile? It will no longer be publicly visible.";
    if (!window.confirm(confirmMsg)) return;

    setDeleting(true);
    setErrorMsg("");
    try {
      await supabaseService.deleteProfessionalProfile(userId);
      if (cvPath) await supabaseService.removeStorageFile("provider-documents", cvPath).catch(() => {});
      setExists(false);
      setShowForm(false);
      setHeadline("");
      setBio("");
      setSkills([]);
      setYearsExperience("");
      setAvailabilityStatus("open_to_work");
      setPortfolioLinks([]);
      setCvFile(null);
      setCvPath(null);
      setCvSignedUrl(null);
      setSuccessMsg(lang === "fr" ? "Profil professionnel supprimé." : "Professional profile deleted.");
    } catch (err: any) {
      console.error("Professional profile delete error:", err);
      setErrorMsg(err.message || (lang === "fr" ? "Erreur lors de la suppression." : "Error deleting profile."));
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
          {lang === "fr"
            ? "Impossible de charger votre profil professionnel. Réessayez avant de continuer."
            : "Couldn't load your professional profile. Please retry before continuing."}
        </p>
        <button
          type="button"
          onClick={loadProfile}
          className="bg-red-100 hover:bg-red-200 text-red-900 font-bold text-xs px-4 py-2.5 rounded-xl cursor-pointer transition-colors"
        >
          {lang === "fr" ? "Réessayer" : "Retry"}
        </button>
      </div>
    );
  }

  if (!showForm) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="text-center py-10 px-4 space-y-4 border border-dashed border-amber-200 rounded-2xl bg-[#FAF8F5]"
      >
        <div className="w-12 h-12 mx-auto rounded-full bg-[#E3A23D]/15 flex items-center justify-center">
          <Briefcase className="w-6 h-6 text-[#7A3420]" />
        </div>
        <div>
          <h4 className="font-black text-amber-950 text-sm">
            {lang === "fr" ? "Vous n'avez pas encore de profil professionnel" : "You don't have a professional profile yet"}
          </h4>
          <p className="text-xs text-amber-800/80 font-serif mt-1 max-w-sm mx-auto">
            {lang === "fr"
              ? "Créez-en un pour mettre en avant vos compétences, votre expérience et votre disponibilité auprès de la communauté."
              : "Create one to showcase your skills, experience, and availability to the community."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="bg-[#E3A23D] hover:bg-[#F2B355] text-[#241611] font-black text-xs px-5 py-3 rounded-xl inline-flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          {lang === "fr" ? "Créer mon profil professionnel" : "Create your professional profile"}
        </button>
      </motion.div>
    );
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      onSubmit={handleSave}
      noValidate
      className="space-y-5"
    >
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3 text-xs font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3 text-xs font-bold flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
          {lang === "fr" ? "Titre professionnel" : "Headline"}
        </label>
        <input
          ref={headlineRef}
          type="text"
          value={headline}
          onChange={(e) => { setHeadline(e.target.value); if (fieldErrors.headline) setFieldErrors((prev) => ({ ...prev, headline: undefined })); }}
          placeholder={lang === "fr" ? "ex: Développeur web & mobile à Bertoua" : "ex: Web & mobile developer in Bertoua"}
          className={`w-full bg-[#FAF8F5] border rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 ${
            fieldErrors.headline ? "border-red-300 focus:ring-red-400" : "border-amber-200 focus:ring-[#E3A23D]"
          }`}
        />
        {fieldErrors.headline && <p className="text-[11px] text-red-700 font-bold">{fieldErrors.headline}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
          {lang === "fr" ? "Bio professionnelle" : "Professional Bio"}
        </label>
        <textarea
          ref={bioRef}
          rows={3}
          value={bio}
          onChange={(e) => { setBio(e.target.value); if (fieldErrors.bio) setFieldErrors((prev) => ({ ...prev, bio: undefined })); }}
          placeholder={lang === "fr" ? "Décrivez votre parcours et vos compétences..." : "Describe your background and skills..."}
          className={`w-full bg-[#FAF8F5] border rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 font-serif ${
            fieldErrors.bio ? "border-red-300 focus:ring-red-400" : "border-amber-200 focus:ring-[#E3A23D]"
          }`}
        />
        {fieldErrors.bio && <p className="text-[11px] text-red-700 font-bold">{fieldErrors.bio}</p>}
        <p className="text-[9px] text-amber-800/60 italic">
          {lang === "fr"
            ? "Un titre et une bio sont requis pour que votre profil soit visible publiquement."
            : "A headline and bio are both required for your profile to be publicly visible."}
        </p>
      </div>

      {/* Availability status */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
          {lang === "fr" ? "Disponibilité" : "Availability"}
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {AVAILABILITY_OPTIONS.map((opt) => {
            const isSelected = availabilityStatus === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAvailabilityStatus(opt.value)}
                className={`px-3 py-2.5 rounded-xl border text-[11px] font-bold cursor-pointer transition-all text-center ${
                  isSelected ? "text-white shadow-sm" : "bg-[#FAF8F5] border-amber-200/60 text-amber-950 hover:bg-amber-100/30"
                }`}
                style={isSelected ? { backgroundColor: opt.color, borderColor: opt.color } : undefined}
              >
                {lang === "fr" ? opt.labelFR : opt.labelEN}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
            {lang === "fr" ? "Années d'expérience" : "Years of Experience"}
          </label>
          <input
            type="number"
            min={0}
            value={yearsExperience}
            onChange={(e) => setYearsExperience(e.target.value)}
            placeholder="ex: 3"
            className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs font-mono text-amber-950 focus:outline-none focus:ring-1 focus:ring-[#E3A23D]"
          />
        </div>
      </div>

      {/* Skills chips */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-700" />
          {lang === "fr" ? "Compétences" : "Skills"}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSkill();
              }
            }}
            placeholder={lang === "fr" ? "ex: Plomberie, Excel, Menuiserie..." : "ex: Plumbing, Excel, Carpentry..."}
            className="flex-1 bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-[#E3A23D]"
          />
          <button
            type="button"
            onClick={addSkill}
            className="px-4 py-2.5 bg-[#245C46] hover:bg-[#3E8467] text-white font-bold text-xs rounded-xl cursor-pointer transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        {skills.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {skills.map((skill) => (
              <span
                key={skill}
                className="bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-bold pl-3 pr-1.5 py-1.5 rounded-full flex items-center gap-1.5"
              >
                {skill}
                <button
                  type="button"
                  onClick={() => removeSkill(skill)}
                  className="hover:bg-amber-200/60 rounded-full p-0.5 cursor-pointer transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Portfolio links */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block flex items-center gap-1.5">
          <LinkIcon className="w-3.5 h-3.5 text-amber-700" />
          {lang === "fr" ? "Liens de portfolio" : "Portfolio Links"}
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2">
          <input
            type="text"
            value={portfolioLabelInput}
            onChange={(e) => setPortfolioLabelInput(e.target.value)}
            placeholder={lang === "fr" ? "ex: Portfolio, GitHub..." : "ex: Portfolio, GitHub..."}
            className="bg-[#FAF8F5] border border-amber-200 rounded-xl px-3.5 py-2.5 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-[#E3A23D]"
          />
          <input
            type="url"
            value={portfolioUrlInput}
            onChange={(e) => setPortfolioUrlInput(e.target.value)}
            placeholder="https://..."
            className="bg-[#FAF8F5] border border-amber-200 rounded-xl px-3.5 py-2.5 text-xs font-mono text-amber-950 focus:outline-none focus:ring-1 focus:ring-[#E3A23D]"
          />
          <button
            type="button"
            onClick={addPortfolioLink}
            className="px-4 py-2.5 bg-[#245C46] hover:bg-[#3E8467] text-white font-bold text-xs rounded-xl cursor-pointer transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        {portfolioLinks.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {portfolioLinks.map((link, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2 bg-[#FAF8F5] border border-amber-100 rounded-xl px-3.5 py-2 text-xs">
                {/* Part C fix: a long unbroken URL has no spaces to wrap on — without min-w-0 +
                    break-all, it forced this flex row past the screen width on narrow viewports. */}
                <span className="font-bold text-amber-950 min-w-0 break-words">
                  {link.label}: <span className="font-mono text-amber-800/80 font-normal break-all">{link.url}</span>
                </span>
                <button
                  type="button"
                  onClick={() => removePortfolioLink(idx)}
                  className="text-red-700 hover:bg-red-50 rounded-lg p-1 cursor-pointer transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CV upload */}
      <div className="border border-amber-100 p-4 rounded-xl bg-[#FAF8F5] space-y-2.5">
        <span className="text-[10px] font-black text-amber-900 uppercase tracking-wider block">
          {lang === "fr" ? "CV (PDF, optionnel)" : "CV (PDF, optional)"}
        </span>
        {(cvSignedUrl && !removeCv) || cvFile ? (
          <a
            href={cvFile ? URL.createObjectURL(cvFile) : cvSignedUrl || undefined}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-amber-800 underline flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" />
            {cvFile ? cvFile.name : (lang === "fr" ? "Voir le fichier actuel" : "View current file")}
          </a>
        ) : (
          <p className="text-[11px] text-amber-800/60 italic">
            {lang === "fr" ? "Aucun fichier téléchargé." : "No file uploaded yet."}
          </p>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <label className="px-3 py-2 border border-amber-300 hover:bg-amber-100 text-[10px] font-bold rounded-lg cursor-pointer transition-all inline-block">
            <Upload className="w-3.5 h-3.5 inline mr-1 text-amber-800" />
            {lang === "fr" ? "Choisir un fichier" : "Choose file"}
            <input
              type="file"
              accept={CV_ACCEPT}
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  setCvFile(e.target.files[0]);
                  setRemoveCv(false);
                }
              }}
            />
          </label>
          {(cvSignedUrl || cvFile) && !removeCv && (
            <button
              type="button"
              onClick={() => {
                setRemoveCv(true);
                setCvFile(null);
              }}
              className="px-3 py-2 border border-red-200 text-red-800 hover:bg-red-50 text-[10px] font-bold rounded-lg cursor-pointer transition-all"
            >
              {lang === "fr" ? "Retirer" : "Remove"}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-amber-50">
        {exists ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-3 border border-red-200 text-red-800 hover:bg-red-50 font-bold rounded-xl text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            {lang === "fr" ? "Supprimer mon profil" : "Delete my profile"}
          </button>
        ) : (
          <span />
        )}
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
              {lang === "fr" ? "Enregistrer" : "Save Changes"}
            </>
          )}
        </button>
      </div>
    </motion.form>
  );
}
