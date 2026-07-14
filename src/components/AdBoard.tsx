/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { CommunityAd, ServiceCategory } from "../types.ts";
import { BERTOUA_NEIGHBORHOODS, CATEGORY_DETAILS } from "../data/bertouaData.ts";
import { PlusCircle, Megaphone, MapPin, Tag, Phone, DollarSign, Clock, AlertTriangle, X, Loader2 } from "lucide-react";

interface AdBoardProps {
  lang: "fr" | "en";
}

export default function AdBoard({ lang }: AdBoardProps) {
  const [ads, setAds] = useState<CommunityAd[]>([]);
  const [showPostModal, setShowPostModal] = useState(false);
  
  // Post form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ServiceCategory>(ServiceCategory.AGRICULTURE);
  const [neighborhoodId, setNeighborhoodId] = useState("mokolo");
  const [authorName, setAuthorName] = useState("");
  const [authorPhone, setAuthorPhone] = useState("+237 ");
  const [budgetFCFA, setBudgetFCFA] = useState("");
  const [urgency, setUrgency] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");

  const [loading, setLoading] = useState(false);

  const t = {
    fr: {
      boardTitle: "Annonces d'Entraide Communautaire",
      boardDesc: "Découvrez les besoins urgents des habitants de Bertoua ou postez votre propre demande de coup de main.",
      postBtn: "Poster une annonce d'entraide",
      neighborhood: "Quartier",
      budget: "Budget proposé",
      urgencyLabel: "Urgence",
      phone: "Contact",
      postedBy: "Proposé par",
      modalTitle: "Publier un besoin d'entraide",
      modalDesc: "Décrivez précisément ce dont vous avez besoin pour que la communauté de l'Est puisse vous répondre.",
      titleLabel: "Titre de votre besoin",
      descLabel: "Description détaillée",
      categoryLabel: "Catégorie associée",
      neighborhoodLabel: "Quartier de l'annonce",
      budgetLabel: "Budget disponible (FCFA)",
      urgencySelect: "Niveau d'urgence",
      nameLabel: "Votre nom",
      phoneLabel: "Numéro de contact",
      submitBtn: "Publier sur le tableau",
      cancel: "Annuler",
    },
    en: {
      boardTitle: "Community Help Ads",
      boardDesc: "Discover urgent needs from Bertoua residents or post your own request for assistance.",
      postBtn: "Post a Help Request",
      neighborhood: "Neighborhood",
      budget: "Proposed Budget",
      urgencyLabel: "Urgency",
      phone: "Contact",
      postedBy: "Posted by",
      modalTitle: "Post a Help Request",
      modalDesc: "Describe precisely what you need so the East Region community can respond.",
      titleLabel: "Title of your need",
      descLabel: "Detailed description",
      categoryLabel: "Associated Category",
      neighborhoodLabel: "Neighborhood of the ad",
      budgetLabel: "Available Budget (FCFA)",
      urgencySelect: "Urgency level",
      nameLabel: "Your name",
      phoneLabel: "Contact number",
      submitBtn: "Publish on Board",
      cancel: "Cancel",
    }
  }[lang];

  const fetchAds = async () => {
    try {
      const res = await fetch("/api/ads");
      if (res.ok) {
        const data = await res.json();
        setAds(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchAds();
  }, []);

  const handlePostAdSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description || !authorName || !authorPhone || !budgetFCFA) return;

    setLoading(true);
    try {
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          category,
          neighborhoodId,
          authorName,
          authorPhone,
          budgetFCFA: Number(budgetFCFA),
          urgency,
        }),
      });

      if (res.ok) {
        // Reset form
        setTitle("");
        setDescription("");
        setAuthorName("");
        setAuthorPhone("+237 ");
        setBudgetFCFA("");
        setUrgency("MEDIUM");
        setShowPostModal(false);
        fetchAds();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getUrgencyBadge = (level: string) => {
    const styles = {
      HIGH: "bg-rose-50 text-rose-700 border-rose-200",
      MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
      LOW: "bg-emerald-50 text-emerald-700 border-emerald-200",
    }[level] || "bg-amber-50 text-amber-700 border-amber-200";

    const label = {
      fr: { HIGH: "Urgent", MEDIUM: "Modéré", LOW: "Souple" },
      en: { HIGH: "Urgent", MEDIUM: "Moderate", LOW: "Flexible" },
    }[lang][level] || level;

    return (
      <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border ${styles} flex items-center gap-1 shrink-0`}>
        {level === "HIGH" && <AlertTriangle className="w-3 h-3" />}
        {label}
      </span>
    );
  };

  return (
    <div id="community-ads-section" className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-amber-50/50 p-6 rounded-2xl border border-amber-200/50">
        <div>
          <h3 className="text-lg font-bold text-amber-950 flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-amber-800" />
            {t.boardTitle}
          </h3>
          <p className="text-xs text-amber-800 mt-1 max-w-xl">{t.boardDesc}</p>
        </div>
        <button
          onClick={() => setShowPostModal(true)}
          id="btn-post-ad"
          className="bg-amber-800 hover:bg-amber-900 text-white font-medium text-xs px-4 py-3 rounded-xl flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
        >
          <PlusCircle className="w-4 h-4" />
          {t.postBtn}
        </button>
      </div>

      {/* Ads Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ads.map((ad) => {
          const nh = BERTOUA_NEIGHBORHOODS.find((n) => n.id === ad.neighborhoodId);
          const cat = CATEGORY_DETAILS[ad.category];
          return (
            <div
              key={ad.id}
              className="bg-white border border-amber-100/80 p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden"
            >
              <div className="space-y-3.5">
                <div className="flex justify-between items-start gap-4">
                  <h4 className="font-bold text-amber-950 text-sm leading-snug">{ad.title}</h4>
                  {getUrgencyBadge(ad.urgency)}
                </div>

                <p className="text-xs text-amber-900/80 leading-relaxed font-serif">{ad.description}</p>

                {/* Details list */}
                <div className="grid grid-cols-2 gap-2 text-[10px] text-amber-800 font-medium">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span>{t.neighborhood}: <strong className="text-amber-950 font-semibold">{nh ? nh.name : ad.neighborhoodId}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span>Catégorie: <strong className="text-amber-950 font-semibold">{lang === "fr" ? cat?.nameFR : cat?.nameEN}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span>{t.budget}: <strong className="text-amber-950 font-bold">{ad.budgetFCFA} FCFA</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span>{t.phone}: <strong className="text-amber-950 font-mono">{ad.authorPhone}</strong></span>
                  </div>
                </div>
              </div>

              <div className="border-t border-amber-50 mt-4 pt-3 flex items-center justify-between text-[10px] text-amber-800/70">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(ad.createdAt).toLocaleDateString()}
                </span>
                <span>
                  {t.postedBy}: <strong className="text-amber-900">{ad.authorName}</strong>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Post Modal */}
      {showPostModal && (
        <div className="fixed inset-0 bg-amber-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl border border-amber-100 overflow-hidden relative">
            <button
              onClick={() => setShowPostModal(false)}
              className="absolute top-4 right-4 p-2 text-amber-900/60 hover:text-amber-950 hover:bg-amber-50 rounded-full transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <form onSubmit={handlePostAdSubmit} className="p-6 space-y-4">
              <div>
                <h3 className="text-base font-bold text-amber-950">{t.modalTitle}</h3>
                <p className="text-xs text-amber-800 mt-1">{t.modalDesc}</p>
              </div>

              <div className="space-y-3 pt-2 max-h-[60vh] overflow-y-auto px-1">
                <div>
                  <label className="block text-xs font-semibold text-amber-900 mb-1">{t.titleLabel}</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="ex: Recherche labour à Ndouan"
                    className="w-full bg-amber-50/50 border border-amber-200 rounded-xl p-3 text-sm text-amber-950 focus:outline-none focus:ring-1.5 focus:ring-amber-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-amber-900 mb-1">{t.descLabel}</label>
                  <textarea
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Expliquez ce qu'il y a à faire..."
                    className="w-full min-h-[80px] max-h-[140px] bg-amber-50/50 border border-amber-200 rounded-xl p-3 text-sm text-amber-950 focus:outline-none focus:ring-1.5 focus:ring-amber-700"
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
                    <label className="block text-xs font-semibold text-amber-900 mb-1">{t.budgetLabel}</label>
                    <input
                      type="number"
                      required
                      value={budgetFCFA}
                      onChange={(e) => setBudgetFCFA(e.target.value)}
                      placeholder="ex: 15000"
                      className="w-full bg-amber-50/50 border border-amber-200 rounded-xl p-3 text-sm text-amber-950 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-amber-900 mb-1">{t.urgencySelect}</label>
                    <select
                      value={urgency}
                      onChange={(e) => setUrgency(e.target.value as "LOW" | "MEDIUM" | "HIGH")}
                      className="w-full bg-amber-50/50 border border-amber-200 rounded-xl p-3 text-sm text-amber-950 focus:outline-none"
                    >
                      <option value="LOW">Souple / Flexible</option>
                      <option value="MEDIUM">Modéré / Moderate</option>
                      <option value="HIGH">Urgent</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-amber-900 mb-1">{t.nameLabel}</label>
                    <input
                      type="text"
                      required
                      value={authorName}
                      onChange={(e) => setAuthorName(e.target.value)}
                      placeholder="Votre nom"
                      className="w-full bg-amber-50/50 border border-amber-200 rounded-xl p-3 text-sm text-amber-950 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-amber-900 mb-1">{t.phoneLabel}</label>
                    <input
                      type="text"
                      required
                      value={authorPhone}
                      onChange={(e) => setAuthorPhone(e.target.value)}
                      placeholder="+237 "
                      className="w-full bg-amber-50/50 border border-amber-200 rounded-xl p-3 text-sm text-amber-950 focus:outline-none font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowPostModal(false)}
                  className="flex-1 py-3 border border-amber-200 text-amber-900 hover:bg-amber-50 font-medium rounded-xl text-sm transition-colors cursor-pointer"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  id="btn-submit-ad"
                  className="flex-1 bg-amber-800 hover:bg-amber-900 text-white font-medium rounded-xl text-sm py-3 transition-colors shadow-sm cursor-pointer"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t.submitBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
