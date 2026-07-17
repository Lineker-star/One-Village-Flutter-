/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { supabaseService } from "../lib/supabase.ts";
import { BERTOUA_NEIGHBORHOODS } from "../data/bertouaData.ts";
import {
  Building2,
  Upload,
  Trash2,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Plus,
  Link as LinkIcon,
  X,
} from "lucide-react";

const IMAGE_ACCEPT = "image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

const INDUSTRIES: Array<{ value: string; labelFR: string; labelEN: string }> = [
  { value: "technologie", labelFR: "Technologie", labelEN: "Technology" },
  { value: "agriculture", labelFR: "Agriculture", labelEN: "Agriculture" },
  { value: "commerce", labelFR: "Commerce & Détail", labelEN: "Retail & Commerce" },
  { value: "construction", labelFR: "Construction & BTP", labelEN: "Construction" },
  { value: "sante", labelFR: "Santé", labelEN: "Health" },
  { value: "education", labelFR: "Éducation", labelEN: "Education" },
  { value: "transport", labelFR: "Transport & Logistique", labelEN: "Transport & Logistics" },
  { value: "restauration", labelFR: "Restauration & Hôtellerie", labelEN: "Food & Hospitality" },
  { value: "finance", labelFR: "Finance", labelEN: "Finance" },
  { value: "artisanat", labelFR: "Artisanat", labelEN: "Crafts" },
  { value: "autre", labelFR: "Autre — à préciser", labelEN: "Other — specify" },
];

interface CompanyEditorProps {
  lang: "fr" | "en";
  ownerId: string;
  companyId?: string; // undefined = create mode
  onSaved: (companyId: string) => void;
  onCancel: () => void;
  onDeleted?: () => void;
}

export default function CompanyEditor({ lang, ownerId, companyId, onSaved, onCancel, onDeleted }: CompanyEditorProps) {
  const isEditing = !!companyId;
  const [loading, setLoading] = useState(isEditing);
  const [loadError, setLoadError] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [industry, setIndustry] = useState("");
  const [isOtherIndustry, setIsOtherIndustry] = useState(false);
  const [neighborhoodId, setNeighborhoodId] = useState("mokolo");
  const [useFreeTextNeighborhood, setUseFreeTextNeighborhood] = useState(false);
  const [neighborhoodFreeText, setNeighborhoodFreeText] = useState("");
  const [website, setWebsite] = useState("");
  const [socialLinks, setSocialLinks] = useState<Array<{ label: string; url: string }>>([]);
  const [socialLabelInput, setSocialLabelInput] = useState("");
  const [socialUrlInput, setSocialUrlInput] = useState("");

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [removeCover, setRemoveCover] = useState(false);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Item 1 fix: same scrollable-modal pattern as the other editors (rendered inside
  // ProfileSettings.tsx's `fixed inset-0 overflow-y-auto` modal) — manual validation +
  // scrollIntoView replaces the previous silent `if (!name.trim()) return;` no-op, which gave the
  // user zero feedback either way.
  const [fieldErrors, setFieldErrors] = useState<{ name?: string }>({});
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!companyId) return;
    let active = true;
    supabaseService
      .getCompanyForEditing(companyId)
      .then((record) => {
        if (!active) return;
        // Part B bug fix: a missing record here (whether from a genuinely-deleted company or —
        // before this fix — a swallowed fetch error) used to fall through and render an empty,
        // save-ready form in edit mode, risking a blank overwrite of the real company's data. Now
        // treated as a load failure rather than silently proceeding.
        if (!record) {
          setLoadError(true);
          setLoading(false);
          return;
        }
        setName(record.name);
        setDescription(record.description);
        const known = INDUSTRIES.some((i) => i.value === record.industry);
        if (record.industry && !known) {
          setIsOtherIndustry(true);
          setIndustry(record.industry);
        } else {
          setIndustry(record.industry);
        }
        const knownNeighborhood = BERTOUA_NEIGHBORHOODS.some((n) => n.id === record.neighborhoodId);
        if (record.neighborhoodId && !knownNeighborhood) {
          setUseFreeTextNeighborhood(true);
          setNeighborhoodFreeText(record.neighborhoodId);
        } else if (record.neighborhoodId) {
          setNeighborhoodId(record.neighborhoodId);
        }
        setWebsite(record.website);
        setSocialLinks(record.socialLinks);
        setLogoUrl(record.logoUrl);
        setCoverUrl(record.coverImageUrl);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        console.error("Failed to load company for editing:", err);
        setLoadError(true);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [companyId]);

  const addSocialLink = () => {
    const label = socialLabelInput.trim();
    const url = socialUrlInput.trim();
    if (!label || !url) return;
    setSocialLinks((prev) => [...prev, { label, url }]);
    setSocialLabelInput("");
    setSocialUrlInput("");
  };

  const removeSocialLink = (index: number) => {
    setSocialLinks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFieldErrors({ name: lang === "fr" ? "Le nom de l'entreprise est obligatoire." : "The company name is required." });
      nameRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      nameRef.current?.focus({ preventScroll: true });
      return;
    }
    setFieldErrors({});
    setSaving(true);
    setErrorMsg("");
    try {
      let logoUrlToSave: string | null | undefined;
      if (removeLogo && !logoFile) {
        logoUrlToSave = null;
      } else if (logoFile) {
        const ext = logoFile.name.split(".").pop() || "jpg";
        logoUrlToSave = await supabaseService.uploadProviderMedia("provider-media", ownerId, logoFile, `company-logo-${Date.now()}.${ext}`);
      }

      let coverUrlToSave: string | null | undefined;
      if (removeCover && !coverFile) {
        coverUrlToSave = null;
      } else if (coverFile) {
        const ext = coverFile.name.split(".").pop() || "jpg";
        coverUrlToSave = await supabaseService.uploadProviderMedia("provider-media", ownerId, coverFile, `company-cover-${Date.now()}.${ext}`);
      }

      const effectiveNeighborhoodId = useFreeTextNeighborhood ? neighborhoodFreeText.trim() : neighborhoodId;
      const effectiveIndustry = isOtherIndustry ? industry.trim() : industry;

      if (isEditing && companyId) {
        await supabaseService.updateCompany(companyId, {
          name: name.trim(),
          description: description.trim(),
          industry: effectiveIndustry,
          neighborhoodId: effectiveNeighborhoodId,
          website: website.trim(),
          logoUrl: logoUrlToSave,
          coverImageUrl: coverUrlToSave,
          socialLinks,
        });
        onSaved(companyId);
      } else {
        const newId = await supabaseService.createCompany(ownerId, {
          name: name.trim(),
          description: description.trim(),
          industry: effectiveIndustry,
          neighborhoodId: effectiveNeighborhoodId,
          website: website.trim(),
          logoUrl: logoUrlToSave,
          coverImageUrl: coverUrlToSave,
          socialLinks,
        });
        onSaved(newId);
      }
    } catch (err: any) {
      console.error("Company save error:", err);
      setErrorMsg(err.message || (lang === "fr" ? "Erreur lors de l'enregistrement." : "Error saving company."));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!companyId) return;
    const confirmMsg =
      lang === "fr"
        ? `Supprimer définitivement la page "${name}" ? Cette action est irréversible.`
        : `Permanently delete the "${name}" page? This cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;

    setDeleting(true);
    setErrorMsg("");
    try {
      await supabaseService.deleteCompany(companyId);
      onDeleted?.();
    } catch (err: any) {
      console.error("Company delete error:", err);
      setErrorMsg(err.message || (lang === "fr" ? "Erreur lors de la suppression." : "Error deleting company."));
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
          {lang === "fr" ? "Impossible de charger cette page entreprise. Réessayez avant de continuer." : "Couldn't load this company page. Please retry before continuing."}
        </p>
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="bg-white border border-red-200 text-red-800 font-bold text-xs px-4 py-2.5 rounded-xl cursor-pointer transition-colors"
          >
            {lang === "fr" ? "Fermer" : "Close"}
          </button>
        </div>
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
      className="space-y-5"
    >
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3 text-xs font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Cover image */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
          {lang === "fr" ? "Image de couverture" : "Cover Image"}
        </label>
        <div className="h-28 sm:h-36 bg-[#FAF8F5] border border-amber-200 rounded-xl overflow-hidden flex items-center justify-center relative">
          {coverFile ? (
            <img src={URL.createObjectURL(coverFile)} alt="cover" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : coverUrl && !removeCover ? (
            <img src={coverUrl} alt="cover" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <Building2 className="w-8 h-8 text-amber-800/30" />
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="px-3 py-2 border border-amber-300 hover:bg-amber-100 text-[10px] font-bold rounded-lg cursor-pointer transition-all inline-block">
            <Upload className="w-3.5 h-3.5 inline mr-1 text-amber-800" />
            {lang === "fr" ? "Choisir une image" : "Choose image"}
            <input
              type="file"
              accept={IMAGE_ACCEPT}
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  setCoverFile(e.target.files[0]);
                  setRemoveCover(false);
                }
              }}
            />
          </label>
          {(coverUrl || coverFile) && !removeCover && (
            <button
              type="button"
              onClick={() => {
                setRemoveCover(true);
                setCoverFile(null);
              }}
              className="px-3 py-2 border border-red-200 text-red-800 hover:bg-red-50 text-[10px] font-bold rounded-lg cursor-pointer transition-all"
            >
              {lang === "fr" ? "Retirer" : "Remove"}
            </button>
          )}
        </div>
      </div>

      {/* Logo + Name */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="w-20 h-20 shrink-0 bg-[#FAF8F5] border border-amber-200 rounded-2xl flex items-center justify-center overflow-hidden">
          {logoFile ? (
            <img src={URL.createObjectURL(logoFile)} alt="logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : logoUrl && !removeLogo ? (
            <img src={logoUrl} alt="logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <Building2 className="w-7 h-7 text-amber-800/40" />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="px-3 py-2 border border-amber-300 hover:bg-amber-100 text-[10px] font-bold rounded-lg cursor-pointer transition-all inline-block">
            {lang === "fr" ? "Changer le logo" : "Change logo"}
            <input
              type="file"
              accept={IMAGE_ACCEPT}
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  setLogoFile(e.target.files[0]);
                  setRemoveLogo(false);
                }
              }}
            />
          </label>
          {(logoUrl || logoFile) && !removeLogo && (
            <button
              type="button"
              onClick={() => {
                setRemoveLogo(true);
                setLogoFile(null);
              }}
              className="px-3 py-2 border border-red-200 text-red-800 hover:bg-red-50 text-[10px] font-bold rounded-lg cursor-pointer transition-all"
            >
              {lang === "fr" ? "Retirer" : "Remove"}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
          {lang === "fr" ? "Nom de l'entreprise" : "Company Name"}
        </label>
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); if (fieldErrors.name) setFieldErrors({}); }}
          placeholder={lang === "fr" ? "ex: Menuiserie de l'Est" : "ex: East Region Carpentry"}
          className={`w-full bg-[#FAF8F5] border rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 ${
            fieldErrors.name ? "border-red-300 focus:ring-red-400" : "border-amber-200 focus:ring-[#E3A23D]"
          }`}
        />
        {fieldErrors.name && <p className="text-[11px] text-red-700 font-bold mt-1">{fieldErrors.name}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
          {lang === "fr" ? "Description" : "Description"}
        </label>
        <textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={lang === "fr" ? "Décrivez votre entreprise..." : "Describe your company..."}
          className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-[#E3A23D] font-serif"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
            {lang === "fr" ? "Secteur d'activité" : "Industry"}
          </label>
          <select
            value={isOtherIndustry ? "autre" : industry}
            onChange={(e) => {
              if (e.target.value === "autre") {
                setIsOtherIndustry(true);
                setIndustry("");
              } else {
                setIsOtherIndustry(false);
                setIndustry(e.target.value);
              }
            }}
            className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-3 py-3 text-xs text-amber-950 focus:outline-none"
          >
            <option value="">{lang === "fr" ? "-- Choisir --" : "-- Select --"}</option>
            {INDUSTRIES.map((ind) => (
              <option key={ind.value} value={ind.value}>
                {lang === "fr" ? ind.labelFR : ind.labelEN}
              </option>
            ))}
          </select>
          {isOtherIndustry && (
            <input
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder={lang === "fr" ? "Précisez le secteur" : "Specify industry"}
              className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-950 focus:outline-none mt-2"
            />
          )}
        </div>

        <div className="space-y-1.5">
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
            className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-3 py-3 text-xs text-amber-950 focus:outline-none"
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
              className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-950 focus:outline-none mt-2"
            />
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
          {lang === "fr" ? "Site Web" : "Website"}
        </label>
        <input
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://..."
          className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs font-mono text-amber-950 focus:outline-none focus:ring-1 focus:ring-[#E3A23D]"
        />
      </div>

      {/* Social links */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block flex items-center gap-1.5">
          <LinkIcon className="w-3.5 h-3.5 text-amber-700" />
          {lang === "fr" ? "Réseaux sociaux" : "Social Links"}
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2">
          <input
            type="text"
            value={socialLabelInput}
            onChange={(e) => setSocialLabelInput(e.target.value)}
            placeholder={lang === "fr" ? "ex: Facebook, Instagram..." : "ex: Facebook, Instagram..."}
            className="bg-[#FAF8F5] border border-amber-200 rounded-xl px-3.5 py-2.5 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-[#E3A23D]"
          />
          <input
            type="url"
            value={socialUrlInput}
            onChange={(e) => setSocialUrlInput(e.target.value)}
            placeholder="https://..."
            className="bg-[#FAF8F5] border border-amber-200 rounded-xl px-3.5 py-2.5 text-xs font-mono text-amber-950 focus:outline-none focus:ring-1 focus:ring-[#E3A23D]"
          />
          <button
            type="button"
            onClick={addSocialLink}
            className="px-4 py-2.5 bg-[#245C46] hover:bg-[#3E8467] text-white font-bold text-xs rounded-xl cursor-pointer transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        {socialLinks.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {socialLinks.map((link, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2 bg-[#FAF8F5] border border-amber-100 rounded-xl px-3.5 py-2 text-xs">
                {/* Part C fix: a long unbroken URL has no spaces to wrap on — without min-w-0 +
                    break-all, it forced this flex row past the screen width on narrow viewports. */}
                <span className="font-bold text-amber-950 min-w-0 break-words">
                  {link.label}: <span className="font-mono text-amber-800/80 font-normal break-all">{link.url}</span>
                </span>
                <button
                  type="button"
                  onClick={() => removeSocialLink(idx)}
                  className="text-red-700 hover:bg-red-50 rounded-lg p-1 cursor-pointer transition-colors shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-amber-50">
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
              {lang === "fr" ? "Enregistrer" : "Save"}
            </>
          )}
        </button>
      </div>
    </motion.form>
  );
}
