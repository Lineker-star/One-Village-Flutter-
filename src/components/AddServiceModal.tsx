/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { ServiceCategory } from "../types.ts";
import { BERTOUA_NEIGHBORHOODS } from "../data/bertouaData.ts";
import { Sparkles, Loader2, X, AlertCircle } from "lucide-react";

interface AddServiceModalProps {
  lang: "fr" | "en";
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddServiceModal({ lang, onClose, onSuccess }: AddServiceModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+237 ");
  const [category, setCategory] = useState<ServiceCategory>(ServiceCategory.AGRICULTURE);
  const [neighborhoodId, setNeighborhoodId] = useState("mokolo");
  const [rateFCFA, setRateFCFA] = useState("");
  const [rateUnit, setRateUnit] = useState("jour");
  const [description, setDescription] = useState("");
  const [languages, setLanguages] = useState<string[]>(["FR"]);

  // AI helper variables
  const [draftNotes, setDraftNotes] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  const t = {
    fr: {
      title: "Devenir Prestataire de services",
      desc: "Rejoignez la communauté One Village à Bertoua et commencez à recevoir des demandes de travail.",
      nameLabel: "Nom complet",
      phoneLabel: "Numéro de téléphone (+237)",
      categoryLabel: "Catégorie d'activité",
      neighborhoodLabel: "Votre quartier à Bertoua",
      rateLabel: "Votre tarif (FCFA)",
      rateUnitLabel: "Par unité",
      descLabel: "Description de vos compétences",
      languagesLabel: "Langues parlées",
      aiHelperTitle: "Besoin d'aide pour rédiger ?",
      aiHelperDesc: "Entrez quelques mots simples ou vos notes brutes, l'IA rédigera votre profil de manière professionnelle.",
      aiHelperBtn: "Améliorer avec l'IA",
      submitBtn: "Créer mon profil prestataire",
      cancel: "Annuler",
    },
    en: {
      title: "Become a Service Provider",
      desc: "Join the One Village community in Bertoua and start receiving service booking requests.",
      nameLabel: "Full Name",
      phoneLabel: "Phone Number (+237)",
      categoryLabel: "Activity Category",
      neighborhoodLabel: "Your neighborhood in Bertoua",
      rateLabel: "Your rate (FCFA)",
      rateUnitLabel: "Per unit",
      descLabel: "Description of your skills",
      languagesLabel: "Languages spoken",
      aiHelperTitle: "Need help writing?",
      aiHelperDesc: "Enter a few simple words or raw notes, the AI will write your professional profile description.",
      aiHelperBtn: "Polish with AI",
      submitBtn: "Create My Provider Profile",
      cancel: "Cancel",
    }
  }[lang];

  const handleLanguageToggle = (langCode: string) => {
    if (languages.includes(langCode)) {
      if (languages.length > 1) {
        setLanguages(languages.filter((l) => l !== langCode));
      }
    } else {
      setLanguages([...languages, langCode]);
    }
  };

  const handlePolishWithAI = async () => {
    if (!draftNotes.trim()) return;
    setAiLoading(true);
    setAiError("");

    try {
      const res = await fetch("/api/ai-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: draftNotes,
          task: "polish",
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setDescription(data.text);
      } else {
        setAiError("Impossible d'optimiser le texte.");
      }
    } catch (err) {
      console.error(err);
      setAiError("Une erreur est survenue.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone || !rateFCFA || !description) return;

    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          category,
          neighborhoodId,
          rateFCFA: Number(rateFCFA),
          rateUnit,
          description,
          languages,
        }),
      });

      if (res.ok) {
        onSuccess();
        onClose();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div id="add-service-overlay" className="fixed inset-0 bg-amber-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div id="add-service-container" className="bg-white rounded-2xl w-full max-w-2xl shadow-xl border border-amber-100 overflow-hidden relative my-8">
        <button
          onClick={onClose}
          id="btn-close-service"
          className="absolute top-4 right-4 p-2 text-amber-900/60 hover:text-amber-950 hover:bg-amber-50 rounded-full transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="grid grid-cols-1 md:grid-cols-12">
          {/* Left Side: Form */}
          <form onSubmit={handleSubmit} className="p-6 md:col-span-7 space-y-4 border-b md:border-b-0 md:border-r border-amber-100 max-h-[85vh] overflow-y-auto">
            <div>
              <h3 className="text-lg font-bold text-amber-950">{t.title}</h3>
              <p className="text-xs text-amber-800 mt-1">{t.desc}</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-amber-900 mb-1">{t.nameLabel}</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ex: Mamma Thérèse"
                  className="w-full bg-amber-50/50 border border-amber-200 rounded-xl p-3 text-sm text-amber-950 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-amber-900 mb-1">{t.phoneLabel}</label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+237 6XX XX XX XX"
                  className="w-full bg-amber-50/50 border border-amber-200 rounded-xl p-3 text-sm text-amber-950 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-amber-900 mb-1">{t.categoryLabel}</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ServiceCategory)}
                    className="w-full bg-amber-50/50 border border-amber-200 rounded-xl p-3 text-sm text-amber-950 focus:outline-none"
                  >
                    {Object.keys(ServiceCategory).map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-amber-900 mb-1">{t.neighborhoodLabel}</label>
                  <select
                    value={neighborhoodId}
                    onChange={(e) => setNeighborhoodId(e.target.value)}
                    className="w-full bg-amber-50/50 border border-amber-200 rounded-xl p-3 text-sm text-amber-950 focus:outline-none"
                  >
                    {BERTOUA_NEIGHBORHOODS.map((nh) => (
                      <option key={nh.id} value={nh.id}>
                        {nh.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-amber-900 mb-1">{t.rateLabel}</label>
                  <input
                    type="number"
                    required
                    value={rateFCFA}
                    onChange={(e) => setRateFCFA(e.target.value)}
                    placeholder="ex: 5000"
                    className="w-full bg-amber-50/50 border border-amber-200 rounded-xl p-3 text-sm text-amber-950 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-amber-900 mb-1">{t.rateUnitLabel}</label>
                  <select
                    value={rateUnit}
                    onChange={(e) => setRateUnit(e.target.value)}
                    className="w-full bg-amber-50/50 border border-amber-200 rounded-xl p-3 text-sm text-amber-950 focus:outline-none"
                  >
                    <option value="jour">Jour / Day</option>
                    <option value="heure">Heure / Hour</option>
                    <option value="course">Course / Ride</option>
                    <option value="tâche">Tâche / Task</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-amber-900 mb-1">{t.descLabel}</label>
                <textarea
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Décrivez votre expérience..."
                  className="w-full min-h-[100px] max-h-[150px] bg-amber-50/50 border border-amber-200 rounded-xl p-3 text-sm text-amber-950 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-amber-900 mb-1">{t.languagesLabel}</label>
                <div className="flex flex-wrap gap-2">
                  {["FR", "EN", "Gbaya", "Makaa", "Fulfulde"].map((lg) => (
                    <button
                      type="button"
                      key={lg}
                      onClick={() => handleLanguageToggle(lg)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                        languages.includes(lg)
                          ? "bg-amber-800 text-white border-amber-800"
                          : "bg-white text-amber-900 border-amber-200 hover:bg-amber-50"
                      }`}
                    >
                      {lg}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 border border-amber-200 text-amber-900 hover:bg-amber-50 font-medium rounded-xl text-sm transition-colors cursor-pointer"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                id="btn-submit-provider"
                className="flex-1 bg-amber-800 hover:bg-amber-900 text-white font-medium rounded-xl text-sm py-3 transition-colors shadow-sm cursor-pointer"
              >
                {t.submitBtn}
              </button>
            </div>
          </form>

          {/* Right Side: AI Helper */}
          <div className="p-6 md:col-span-5 bg-amber-50/40 flex flex-col justify-between max-h-[85vh] overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-700" />
                <h4 className="font-bold text-amber-950 text-sm">{t.aiHelperTitle}</h4>
              </div>
              <p className="text-xs text-amber-900 leading-relaxed">{t.aiHelperDesc}</p>

              <textarea
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value)}
                placeholder="ex: Je suis Solange à Mokolo, je couds les pagnes très bien depuis 10 ans. Je fais les habits pour les fêtes. Mon prix c'est 8000 FCFA par robe."
                className="w-full min-h-[140px] max-h-[220px] bg-white border border-amber-200 rounded-xl p-3 text-sm text-amber-950 focus:outline-none"
              />

              {aiError && (
                <div className="flex items-center gap-1.5 text-xs text-rose-600 bg-rose-50 border border-rose-100 p-2.5 rounded-lg">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{aiError}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handlePolishWithAI}
              disabled={aiLoading || !draftNotes.trim()}
              id="btn-ai-polish"
              className="w-full bg-amber-100 hover:bg-amber-200/80 text-amber-950 font-semibold text-xs py-3 rounded-xl transition-all flex items-center justify-center gap-2 border border-amber-200/50 cursor-pointer shadow-sm mt-6"
            >
              {aiLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Génération...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                  {t.aiHelperBtn}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
