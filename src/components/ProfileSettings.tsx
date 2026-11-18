import React, { useState, useEffect } from "react";
import { UserProfile } from "../types.ts";
import { supabaseService } from "../lib/supabase.ts";
import ProfessionalProfileEditor from "./ProfessionalProfileEditor.tsx";
import CompanyPagesManager from "./CompanyPagesManager.tsx";
import JobPostingsManager from "./JobPostingsManager.tsx";
import {
  X,
  User,
  Upload,
  Trash2,
  Loader2,
  CheckCircle,
  AlertTriangle,
  FileText,
  Briefcase,
  Building2,
  ClipboardList,
} from "lucide-react";

const IMAGE_ACCEPT = "image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
const CV_ACCEPT = "application/pdf," + IMAGE_ACCEPT;
const AVAILABLE_LANGUAGES = ["FR", "EN", "Gbaya", "Makaa", "Fulfulde"];

interface ProfileSettingsProps {
  lang: "fr" | "en";
  currentUser: UserProfile;
  onClose: () => void;
  onUpdated: (updated: UserProfile) => void;
  initialTab?: "personal" | "professional" | "companies" | "jobs";
}

export default function ProfileSettings({ lang, currentUser, onClose, onUpdated, initialTab = "personal" }: ProfileSettingsProps) {
  const isProvider = currentUser.role === "provider";

  // Independent sections sharing this modal: the existing personal/provider profile form (its own
  // save action), the professional-network profile, company pages, and now job postings — each its
  // own separate create/update/delete lifecycle against a different table — kept as tabs rather
  // than merged into one giant form. initialTab (Item 2) lets callers like the "Créer un Profil
  // Professionnel" CTAs deep-link straight to the professional tab instead of always landing here.
  const [activeSettingsTab, setActiveSettingsTab] = useState<"personal" | "professional" | "companies" | "jobs">(initialTab);

  // Common fields
  const [fullName, setFullName] = useState(currentUser.fullName || "");
  const [bio, setBio] = useState(currentUser.bio || "");
  const [preferredLanguage, setPreferredLanguage] = useState<"fr" | "en">(currentUser.preferredLanguage || "fr");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatarUrl || "");
  const [removeAvatar, setRemoveAvatar] = useState(false);

  // Provider-only fields
  const [loadingProvider, setLoadingProvider] = useState(isProvider);
  const [businessName, setBusinessName] = useState("");
  const [descriptionFR, setDescriptionFR] = useState("");
  const [descriptionEN, setDescriptionEN] = useState("");
  const [rateFCFA, setRateFCFA] = useState("0");
  const [rateUnit, setRateUnit] = useState("jour");
  const [providerLanguages, setProviderLanguages] = useState<string[]>(["FR"]);

  const [idFrontFile, setIdFrontFile] = useState<File | null>(null);
  const [idFrontPath, setIdFrontPath] = useState<string | null>(null);
  const [idFrontSignedUrl, setIdFrontSignedUrl] = useState<string | null>(null);
  const [removeIdFront, setRemoveIdFront] = useState(false);

  const [idBackFile, setIdBackFile] = useState<File | null>(null);
  const [idBackPath, setIdBackPath] = useState<string | null>(null);
  const [idBackSignedUrl, setIdBackSignedUrl] = useState<string | null>(null);
  const [removeIdBack, setRemoveIdBack] = useState(false);

  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvPath, setCvPath] = useState<string | null>(null);
  const [cvSignedUrl, setCvSignedUrl] = useState<string | null>(null);
  const [removeCv, setRemoveCv] = useState(false);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    if (!isProvider) return;
    let active = true;
    supabaseService.getMyServiceProviderForEditing(currentUser.id).then((record) => {
      if (!active || !record) {
        setLoadingProvider(false);
        return;
      }
      setBusinessName(record.businessName);
      setDescriptionFR(record.descriptionFR);
      setDescriptionEN(record.descriptionEN);
      setRateUnit(record.rateUnit);
      setRateFCFA(String(record.basePrice));
      setProviderLanguages(record.languages.length ? record.languages : ["FR"]);
      setIdFrontPath(record.idCardFrontPath);
      setIdFrontSignedUrl(record.idCardFrontSignedUrl);
      setIdBackPath(record.idCardBackPath);
      setIdBackSignedUrl(record.idCardBackSignedUrl);
      setCvPath(record.cvPath);
      setCvSignedUrl(record.cvSignedUrl);
      setLoadingProvider(false);
    });
    return () => {
      active = false;
    };
  }, [isProvider, currentUser.id]);

  const toggleLanguage = (l: string) => {
    setProviderLanguages((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      let newAvatarUrl: string | undefined;
      if (removeAvatar && !avatarFile) {
        await supabaseService.removeStorageFile("provider-media", `${currentUser.id}/avatar.jpg`);
        newAvatarUrl = "";
      } else if (avatarFile) {
        newAvatarUrl = await supabaseService.uploadProviderMedia("provider-media", currentUser.id, avatarFile, "avatar.jpg");
      }

      const updated = await supabaseService.updateUserProfile({
        fullName: fullName.trim(),
        bio: bio.trim(),
        preferredLanguage,
        avatarUrl: newAvatarUrl,
      });

      if (isProvider) {
        let newIdFrontPath: string | null | undefined;
        if (removeIdFront && !idFrontFile) {
          if (idFrontPath) await supabaseService.removeStorageFile("id-verification", idFrontPath);
          newIdFrontPath = null;
        } else if (idFrontFile) {
          newIdFrontPath = await supabaseService.uploadProviderMedia("id-verification", currentUser.id, idFrontFile, "id-front.jpg");
        }

        let newIdBackPath: string | null | undefined;
        if (removeIdBack && !idBackFile) {
          if (idBackPath) await supabaseService.removeStorageFile("id-verification", idBackPath);
          newIdBackPath = null;
        } else if (idBackFile) {
          newIdBackPath = await supabaseService.uploadProviderMedia("id-verification", currentUser.id, idBackFile, "id-back.jpg");
        }

        let newCvPath: string | null | undefined;
        if (removeCv && !cvFile) {
          if (cvPath) await supabaseService.removeStorageFile("provider-documents", cvPath);
          newCvPath = null;
        } else if (cvFile) {
          const ext = cvFile.name.split(".").pop() || (cvFile.type === "application/pdf" ? "pdf" : "jpg");
          newCvPath = await supabaseService.uploadProviderMedia("provider-documents", currentUser.id, cvFile, `cv.${ext}`);
        }

        await supabaseService.updateServiceProviderProfile(currentUser.id, {
          businessName: businessName.trim(),
          descriptionFR: descriptionFR.trim(),
          descriptionEN: descriptionEN.trim(),
          rateUnit,
          basePrice: Number(rateFCFA) || 0,
          languages: providerLanguages,
          idCardFrontPath: newIdFrontPath,
          idCardBackPath: newIdBackPath,
          cvUrl: newCvPath,
        });
      }

      setSuccessMsg(lang === "fr" ? "Profil mis à jour avec succès !" : "Profile updated successfully!");
      setAvatarFile(null);
      setRemoveAvatar(false);
      setIdFrontFile(null);
      setRemoveIdFront(false);
      setIdBackFile(null);
      setRemoveIdBack(false);
      setCvFile(null);
      setRemoveCv(false);
      onUpdated(updated);
    } catch (err: any) {
      console.error("Profile update error:", err);
      setErrorMsg(err.message || (lang === "fr" ? "Erreur lors de la mise à jour." : "Error updating profile."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-fade-in overflow-y-auto p-3 sm:p-4">
      {/* Centered via mx-auto on a block container, not flex items-center, so tall content on a
          short viewport stays fully scrollable instead of being clipped above the fold (a flexbox
          quirk where align-items: center silently cuts off overflow that doesn't opt into "safe"
          centering). */}
      <div className="bg-white rounded-3xl w-full max-w-2xl p-5 sm:p-8 border border-amber-100 shadow-xl space-y-5 relative mx-auto my-6 sm:my-10">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-amber-800/80 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 p-2 rounded-xl transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <h2 className="text-lg font-black text-amber-950 uppercase tracking-tight">
            {lang === "fr" ? "Mon Profil" : "My Profile"}
          </h2>
          <p className="text-xs text-amber-800/80 font-serif mt-1">
            {lang === "fr" ? "Gérez vos informations personnelles et votre visibilité." : "Manage your personal information and visibility."}
          </p>
        </div>

        {/* Tabs: personal/provider profile (existing), professional-network profile, company
            pages, and job postings (all new) */}
        <div className="flex gap-1 bg-amber-50/50 p-1 border border-amber-100 rounded-2xl overflow-x-auto">
          {[
            { id: "personal" as const, labelFR: "Profil Personnel", labelEN: "Personal Profile", icon: User },
            { id: "professional" as const, labelFR: "Profil Professionnel", labelEN: "Professional Profile", icon: Briefcase },
            { id: "companies" as const, labelFR: "Pages Entreprise", labelEN: "Company Pages", icon: Building2 },
            { id: "jobs" as const, labelFR: "Offres d'Emploi", labelEN: "Job Postings", icon: ClipboardList },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSettingsTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSettingsTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-wide cursor-pointer transition-colors whitespace-nowrap ${
                  isActive ? "bg-[#E3A23D] text-[#241611] shadow-sm" : "text-amber-900 hover:bg-amber-100/60"
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{lang === "fr" ? tab.labelFR : tab.labelEN}</span>
              </button>
            );
          })}
        </div>

        {activeSettingsTab === "professional" ? (
          <ProfessionalProfileEditor lang={lang} userId={currentUser.id} />
        ) : activeSettingsTab === "companies" ? (
          <CompanyPagesManager lang={lang} userId={currentUser.id} />
        ) : activeSettingsTab === "jobs" ? (
          <JobPostingsManager lang={lang} userId={currentUser.id} />
        ) : (
          <>
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

        <form onSubmit={handleSave} className="space-y-6">
          {/* Avatar */}
          <div className="flex flex-col sm:flex-row items-center gap-4 border-b border-amber-50 pb-5">
            <div className="w-20 h-20 shrink-0 bg-amber-50 border border-amber-200/60 rounded-full flex items-center justify-center overflow-hidden shadow-inner">
              {avatarFile ? (
                <img src={URL.createObjectURL(avatarFile)} alt="avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : avatarUrl && !removeAvatar ? (
                <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <User className="w-8 h-8 text-amber-800/60" />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
              <label className="px-3.5 py-2 border border-amber-300 hover:bg-amber-100/40 text-amber-950 font-bold text-[11px] rounded-xl cursor-pointer transition-colors">
                <Upload className="w-3.5 h-3.5 inline mr-1 text-amber-800" />
                {lang === "fr" ? "Changer la photo" : "Change photo"}
                <input
                  type="file"
                  accept={IMAGE_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      setAvatarFile(e.target.files[0]);
                      setRemoveAvatar(false);
                    }
                  }}
                />
              </label>
              {(avatarUrl || avatarFile) && !removeAvatar && (
                <button
                  type="button"
                  onClick={() => {
                    setRemoveAvatar(true);
                    setAvatarFile(null);
                  }}
                  className="px-3.5 py-2 border border-red-200 text-red-800 hover:bg-red-50 font-bold text-[11px] rounded-xl cursor-pointer transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {lang === "fr" ? "Retirer" : "Remove"}
                </button>
              )}
            </div>
          </div>

          {/* Common fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
                {lang === "fr" ? "Nom Complet" : "Full Name"}
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-800"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
                {lang === "fr" ? "Langue préférée" : "Preferred Language"}
              </label>
              <select
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value as "fr" | "en")}
                className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none"
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
              {lang === "fr" ? "Bio / Description" : "Bio / Description"}
            </label>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder={lang === "fr" ? "Parlez un peu de vous..." : "Tell us a bit about yourself..."}
              className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-800 font-serif"
            />
          </div>

          {/* Provider-only section */}
          {isProvider && (
            <div className="space-y-5 pt-5 border-t border-amber-50">
              <h3 className="font-black text-amber-950 text-xs uppercase tracking-wider flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-amber-700" />
                {lang === "fr" ? "Informations Professionnelles" : "Business Information"}
              </h3>

              {loadingProvider ? (
                <div className="flex items-center justify-center py-6 text-amber-800 text-xs gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {lang === "fr" ? "Chargement..." : "Loading..."}
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
                      {lang === "fr" ? "Nom de l'Activité" : "Business Name"}
                    </label>
                    <input
                      type="text"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-800"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
                      {lang === "fr" ? "Description (Français)" : "Description (French)"}
                    </label>
                    <textarea
                      rows={3}
                      value={descriptionFR}
                      onChange={(e) => setDescriptionFR(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-800 font-serif"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
                      {lang === "fr" ? "Description (Anglais)" : "Description (English)"}
                    </label>
                    <textarea
                      rows={3}
                      value={descriptionEN}
                      onChange={(e) => setDescriptionEN(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-800 font-serif"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
                        {lang === "fr" ? "Tarif (FCFA)" : "Rate (FCFA)"}
                      </label>
                      <input
                        type="number"
                        value={rateFCFA}
                        onChange={(e) => setRateFCFA(e.target.value)}
                        className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
                        {lang === "fr" ? "Unité de facturation" : "Rate Unit"}
                      </label>
                      <select
                        value={rateUnit}
                        onChange={(e) => setRateUnit(e.target.value)}
                        className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none"
                      >
                        <option value="jour">Jour / Day</option>
                        <option value="heure">Heure / Hour</option>
                        <option value="course">Course / Ride</option>
                        <option value="tâche">Tâche / Task</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
                      {lang === "fr" ? "Langues parlées" : "Languages Spoken"}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {AVAILABLE_LANGUAGES.map((l) => {
                        const isSelected = providerLanguages.includes(l);
                        return (
                          <button
                            key={l}
                            type="button"
                            onClick={() => toggleLanguage(l)}
                            className={`px-3 py-2 rounded-lg border text-[11px] font-bold cursor-pointer transition-all ${
                              isSelected
                                ? "bg-amber-800 border-amber-800 text-white shadow-sm"
                                : "bg-[#FAF8F5] border-amber-200/60 text-amber-950 hover:bg-amber-100/30"
                            }`}
                          >
                            {l}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ID Card management */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-amber-50">
                    <div className="border border-amber-100 p-4 rounded-xl bg-[#FAF8F5] text-center space-y-2.5">
                      <span className="text-[10px] font-black text-amber-900 uppercase tracking-wider block">
                        {lang === "fr" ? "CNI Recto" : "ID Card (Front)"}
                      </span>
                      <div className="h-24 bg-white border border-amber-200/50 rounded-xl flex items-center justify-center overflow-hidden">
                        {idFrontFile ? (
                          <img src={URL.createObjectURL(idFrontFile)} alt="id-front" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                        ) : idFrontSignedUrl && !removeIdFront ? (
                          <img src={idFrontSignedUrl} alt="id-front" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                        ) : (
                          <FileText className="w-7 h-7 text-amber-800/40" />
                        )}
                      </div>
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <label className="px-3 py-2 border border-amber-300 hover:bg-amber-100 text-[10px] font-bold rounded-lg cursor-pointer transition-all inline-block">
                          {lang === "fr" ? "Changer" : "Change"}
                          <input
                            type="file"
                            accept={IMAGE_ACCEPT}
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files?.[0]) {
                                setIdFrontFile(e.target.files[0]);
                                setRemoveIdFront(false);
                              }
                            }}
                          />
                        </label>
                        {(idFrontSignedUrl || idFrontFile) && !removeIdFront && (
                          <button
                            type="button"
                            onClick={() => {
                              setRemoveIdFront(true);
                              setIdFrontFile(null);
                            }}
                            className="px-3 py-2 border border-red-200 text-red-800 hover:bg-red-50 text-[10px] font-bold rounded-lg cursor-pointer transition-all"
                          >
                            {lang === "fr" ? "Retirer" : "Remove"}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="border border-amber-100 p-4 rounded-xl bg-[#FAF8F5] text-center space-y-2.5">
                      <span className="text-[10px] font-black text-amber-900 uppercase tracking-wider block">
                        {lang === "fr" ? "CNI Verso" : "ID Card (Back)"}
                      </span>
                      <div className="h-24 bg-white border border-amber-200/50 rounded-xl flex items-center justify-center overflow-hidden">
                        {idBackFile ? (
                          <img src={URL.createObjectURL(idBackFile)} alt="id-back" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                        ) : idBackSignedUrl && !removeIdBack ? (
                          <img src={idBackSignedUrl} alt="id-back" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                        ) : (
                          <FileText className="w-7 h-7 text-amber-800/40" />
                        )}
                      </div>
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <label className="px-3 py-2 border border-amber-300 hover:bg-amber-100 text-[10px] font-bold rounded-lg cursor-pointer transition-all inline-block">
                          {lang === "fr" ? "Changer" : "Change"}
                          <input
                            type="file"
                            accept={IMAGE_ACCEPT}
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files?.[0]) {
                                setIdBackFile(e.target.files[0]);
                                setRemoveIdBack(false);
                              }
                            }}
                          />
                        </label>
                        {(idBackSignedUrl || idBackFile) && !removeIdBack && (
                          <button
                            type="button"
                            onClick={() => {
                              setRemoveIdBack(true);
                              setIdBackFile(null);
                            }}
                            className="px-3 py-2 border border-red-200 text-red-800 hover:bg-red-50 text-[10px] font-bold rounded-lg cursor-pointer transition-all"
                          >
                            {lang === "fr" ? "Retirer" : "Remove"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* CV / Resume */}
                  <div className="border border-amber-100 p-4 rounded-xl bg-[#FAF8F5] space-y-2.5">
                    <span className="text-[10px] font-black text-amber-900 uppercase tracking-wider block">
                      {lang === "fr" ? "CV / Résumé (Optionnel)" : "CV / Resume (Optional)"}
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
                </>
              )}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-4 border-t border-amber-50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-3 border border-amber-200 text-amber-900 hover:bg-amber-50 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              {lang === "fr" ? "Fermer" : "Close"}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-amber-800 hover:bg-amber-900 text-white font-black text-xs px-6 py-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-50"
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
        </form>
          </>
        )}
      </div>
    </div>
  );
}
