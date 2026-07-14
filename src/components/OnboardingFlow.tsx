import React, { useState } from "react";
import { UserProfile } from "../types.ts";
import { supabaseService } from "../lib/supabase.ts";
import ProviderWizard from "./ProviderWizard.tsx";
import {
  User,
  Briefcase,
  Languages,
  CheckCircle,
  HelpCircle,
  ArrowRight,
  Info,
  Gift,
} from "lucide-react";

interface OnboardingFlowProps {
  lang: "fr" | "en";
  setLang: (lang: "fr" | "en") => void;
  userId: string;
  userPhone?: string;
  userEmail?: string;
  onComplete: (updatedProfile: UserProfile) => void;
}

export default function OnboardingFlow({
  lang,
  setLang,
  userId,
  userPhone = "",
  userEmail = "",
  onComplete,
}: OnboardingFlowProps) {
  const [step, setStep] = useState<"role_select" | "client_form" | "provider_wizard">("role_select");

  // Client path fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState(userPhone || "");
  const [preferredLang, setPreferredLang] = useState<"fr" | "en">(lang);
  const [referralCode, setReferralCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleRoleSelection = (role: "client" | "provider") => {
    setErrorMsg("");
    if (role === "client") {
      setStep("client_form");
    } else {
      setStep("provider_wizard");
    }
  };

  const handleClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setErrorMsg(lang === "fr" ? "Veuillez entrer votre nom." : "Please enter your name.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");

    try {
      // Complete client onboarding
      const updated = await supabaseService.updateUserProfile({
        fullName: fullName.trim(),
        phone: phone.trim() || userPhone,
        preferredLanguage: preferredLang,
        role: "client",
        onboarding_completed: true,
        referredBy: referralCode.trim() || undefined,
      });

      // Post referral to backend
      if (referralCode.trim()) {
        try {
          await fetch("/api/referrals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code: referralCode.trim(),
              referredId: updated.id,
              referredName: updated.fullName,
            }),
          });
        } catch (apiErr) {
          console.error("Failed to register referral on backend:", apiErr);
        }
      }

      onComplete(updated);
    } catch (err: any) {
      console.error("Client onboarding error:", err);
      setErrorMsg(err.message || "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleProviderWizardSuccess = (providerData: any) => {
    // Reload user profile to trigger updated state in parent
    const mockUser = supabaseService.updateUserProfile({
      fullName: fullName || providerData.name,
      phone: phone || providerData.phone,
      role: "provider",
      onboarding_completed: true,
    });
    
    mockUser.then((profile) => {
      onComplete(profile);
    });
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white border border-amber-100 rounded-3xl shadow-sm p-6 sm:p-8 space-y-6 relative">
        
        {/* Language selector in corner */}
        <div className="absolute top-6 right-6 flex items-center gap-1.5 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-xl">
          <Languages className="w-4 h-4 text-amber-800" />
          <button
            onClick={() => {
              setLang("fr");
              setPreferredLang("fr");
            }}
            className={`text-xs font-black cursor-pointer ${preferredLang === "fr" ? "text-amber-950 underline" : "text-amber-800/60"}`}
          >
            FR
          </button>
          <span className="text-amber-300">|</span>
          <button
            onClick={() => {
              setLang("en");
              setPreferredLang("en");
            }}
            className={`text-xs font-black cursor-pointer ${preferredLang === "en" ? "text-amber-950 underline" : "text-amber-800/60"}`}
          >
            EN
          </button>
        </div>

        {/* STEP 1: Role Selection */}
        {step === "role_select" && (
          <div className="space-y-6 text-center animate-fade-in pt-4">
            <div className="space-y-2">
              <span className="text-[10px] font-black text-amber-800 uppercase tracking-widest block">
                {lang === "fr" ? "Bienvenue chez One Village" : "Welcome to One Village"}
              </span>
              <h2 className="text-xl font-black text-amber-950 uppercase tracking-tight">
                {lang === "fr" ? "Quel est votre besoin aujourd'hui ?" : "What brings you to the village today?"}
              </h2>
              <p className="text-xs text-amber-800 font-serif max-w-md mx-auto">
                {lang === "fr"
                  ? "Choisissez votre voie pour continuer vers la communauté locale de Bertoua."
                  : "Choose your path to connect with the local community in Bertoua."}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
              {/* Looking for services (Client) */}
              <button
                onClick={() => handleRoleSelection("client")}
                id="select-role-client"
                className="group border border-amber-200 hover:border-amber-800 rounded-2xl p-6 bg-[#FAF8F5] text-center hover:bg-amber-50/20 transition-all cursor-pointer flex flex-col items-center space-y-4"
              >
                <div className="w-14 h-14 bg-amber-100/60 rounded-2xl flex items-center justify-center group-hover:scale-105 transition-transform">
                  <User className="w-7 h-7 text-amber-800" />
                </div>
                <div className="space-y-1">
                  <span className="font-bold text-xs text-amber-950 block">
                    {lang === "fr" ? "Je cherche des services" : "I'm looking for services"}
                  </span>
                  <span className="text-[10px] text-amber-800/70 font-serif leading-relaxed block">
                    {lang === "fr"
                      ? "Trouver des réparateurs, aides ménagères, moto-taxis, enseignants d'ici à Bertoua."
                      : "Find local repair, transport, childcare, masonry and farm labor services."}
                  </span>
                </div>
              </button>

              {/* Offer services (Provider) */}
              <button
                onClick={() => handleRoleSelection("provider")}
                id="select-role-provider"
                className="group border border-amber-200 hover:border-amber-800 rounded-2xl p-6 bg-[#FAF8F5] text-center hover:bg-amber-50/20 transition-all cursor-pointer flex flex-col items-center space-y-4"
              >
                <div className="w-14 h-14 bg-amber-100/60 rounded-2xl flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Briefcase className="w-7 h-7 text-amber-800" />
                </div>
                <div className="space-y-1">
                  <span className="font-bold text-xs text-amber-950 block">
                    {lang === "fr" ? "Je propose mes services" : "I offer services"}
                  </span>
                  <span className="text-[10px] text-amber-800/70 font-serif leading-relaxed block">
                    {lang === "fr"
                      ? "Créer votre profil, lister vos tarifs locaux, être contacté et recevoir des réservations."
                      : "List your skills, get calls, manage requests and build your local brand."}
                  </span>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* STEP 2A: Client Form */}
        {step === "client_form" && (
          <form onSubmit={handleClientSubmit} className="space-y-5 animate-fade-in pt-4">
            <div className="space-y-1">
              <span className="text-[10px] font-black text-amber-800 uppercase tracking-widest block">
                {lang === "fr" ? "Profil Client" : "Client Profile Setup"}
              </span>
              <h2 className="text-lg font-black text-amber-950 uppercase tracking-tight">
                {lang === "fr" ? "Dites-nous en plus sur vous" : "Tell us more about yourself"}
              </h2>
            </div>

            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-4 text-xs font-bold flex items-center gap-2">
                <Info className="w-4 h-4 text-red-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
                  {lang === "fr" ? "Nom Complet" : "Full Name"}
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Marie Ndembou"
                  className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
                  {lang === "fr" ? "Numéro de téléphone (+237)" : "Phone Number (+237)"}
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+237 6xx xx xx xx"
                  className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none font-mono focus:ring-1 focus:ring-amber-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
                  {lang === "fr" ? "Code de Parrainage (Optionnel)" : "Referral Code (Optional)"}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value)}
                    placeholder="e.g. VILLAGE100"
                    className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl pl-10 pr-4 py-3 text-xs text-amber-950 focus:outline-none font-mono"
                  />
                  <Gift className="w-4 h-4 text-amber-700 absolute left-3.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-4">
              <button
                type="button"
                onClick={() => setStep("role_select")}
                className="px-4 py-3 border border-amber-200 text-amber-900 hover:bg-amber-50 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                {lang === "fr" ? "Retour" : "Back"}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-amber-800 hover:bg-amber-900 text-white font-black text-xs py-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-50"
              >
                {lang === "fr" ? "Terminer et voir le fil d'actualités" : "Complete and View Feed"}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        )}

        {/* STEP 2B: Provider Registration Wizard */}
        {step === "provider_wizard" && (
          <ProviderWizard
            lang={lang}
            userId={userId}
            userPhone={userPhone}
            fullName={fullName}
            onSuccess={handleProviderWizardSuccess}
            onCancel={() => setStep("role_select")}
          />
        )}
      </div>
    </div>
  );
}
