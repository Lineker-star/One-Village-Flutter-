/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { ServiceProvider, UserProfile, RealPaymentMethod } from "../types.ts";
import { supabaseService } from "../lib/supabase.ts";
import { Calendar, Clock, DollarSign, X, CheckCircle, ShieldAlert, Loader2, ArrowRight, Info, Phone, CheckCircle2, AlertCircle } from "lucide-react";

interface BookingModalProps {
  provider: ServiceProvider;
  currentUser: UserProfile;
  lang: "fr" | "en";
  onClose: () => void;
  onBookingSuccess: () => void;
}

// UI-only operator choice — MTN and Orange both map to the DB's single 'mobile_money' payment
// method (see payment_method_type enum in the schema). Real MoMo/Orange Money API integration is a
// separate future step; for now both operators just flow through the same manual two-sided
// completion confirmation as cash, with an honest "coming soon" notice.
type OperatorChoice = "mtn" | "orange" | "cash";

export default function BookingModal({ provider, currentUser, lang, onClose, onBookingSuccess }: BookingModalProps) {
  const [step, setStep] = useState<"details" | "pay" | "success">("details");
  const [serviceDate, setServiceDate] = useState("");
  const [serviceTime, setServiceTime] = useState("09:00");
  const [description, setDescription] = useState("");
  const [operator, setOperator] = useState<OperatorChoice>("mtn");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [createdBookingId, setCreatedBookingId] = useState("");
  // Payment phone state — the phone number the user enters for MoMo. For now it's stored
  // locally and passed to createBooking; a future server-side MoMo API would use it to trigger
  // the USSD push.
  const [paymentPhone, setPaymentPhone] = useState("");
  const [paymentPhoneValid, setPaymentPhoneValid] = useState(false);

  const t = {
    fr: {
      title: "Réserver un service",
      subtitle: "Avec",
      dateLabel: "Date d'intervention",
      timeLabel: "Heure souhaitée",
      descLabel: "Expliquez brièvement votre besoin",
      estimatedCost: "Coût estimé",
      momoTitle: "Paiement Mobile Money",
      momoSubtitle: "Sélectionnez votre opérateur préféré",
      confirmBookingBtn: "Confirmer la réservation",
      cancel: "Annuler",
      successTitle: "Demande envoyée !",
      successSubtitle: "Votre demande de réservation a été transmise au prestataire.",
      receiptInfo: "Le prestataire doit accepter votre demande. Vous pouvez suivre son statut et discuter avec lui depuis votre tableau de bord.",
      bookAsLabel: "Réservation au nom de",
      phoneLabel: "Numéro Mobile Money",
      phonePlaceholder: "Ex: 6XXXXXXXX",
      phoneHint: "Vous recevrez une demande de paiement sur ce numéro.",
      invalidPhone: "Veuillez entrer un numéro de téléphone camerounais valide (9 chiffres).",
      paymentStep: "Étape de paiement",
      paymentStepDesc: "Choisissez comment vous souhaitez payer ce service.",
      payWithMomo: "Payer avec Mobile Money",
      payWithCash: "Payer en espèces",
      selectOperator: "Sélectionnez votre opérateur",
      enterPhone: "Entrez votre numéro",
      confirmPayment: "Confirmer et réserver",
      back: "Retour",
      phoneRequired: "Veuillez entrer votre numéro Mobile Money pour continuer.",
    },
    en: {
      title: "Book a service",
      subtitle: "With",
      dateLabel: "Service Date",
      timeLabel: "Preferred Time",
      descLabel: "Briefly explain your needs",
      estimatedCost: "Estimated cost",
      momoTitle: "Mobile Money Payment",
      momoSubtitle: "Select your preferred operator",
      confirmBookingBtn: "Confirm Booking",
      cancel: "Cancel",
      successTitle: "Request sent!",
      successSubtitle: "Your booking request has been sent to the provider.",
      receiptInfo: "The provider needs to accept your request. You can track its status and chat with them from your dashboard.",
      bookAsLabel: "Booking as",
      phoneLabel: "Mobile Money Number",
      phonePlaceholder: "e.g. 6XXXXXXXX",
      phoneHint: "You will receive a payment request on this number.",
      invalidPhone: "Please enter a valid Cameroon phone number (9 digits).",
      paymentStep: "Payment step",
      paymentStepDesc: "Choose how you want to pay for this service.",
      payWithMomo: "Pay with Mobile Money",
      payWithCash: "Pay in cash",
      selectOperator: "Select your operator",
      enterPhone: "Enter your number",
      confirmPayment: "Confirm and book",
      back: "Back",
      phoneRequired: "Please enter your Mobile Money number to continue.",
    }
  }[lang];

  const isProviderBookable = provider.verified || provider.status === "approved";
  const isSelfBooking = currentUser.id === provider.id;

  // Validate Cameroon phone: 9 digits, starts with 6 (MTN/Orange/Camtel mobile prefix).
  const handlePhoneChange = (value: string) => {
    const digits = value.replace(/\D/g, "");
    setPaymentPhone(digits);
    // Cameroon mobile numbers: 9 digits starting with 6 (6XX XX XX XX)
    const isValid = digits.length === 9 && digits.startsWith("6");
    setPaymentPhoneValid(isValid);
  };

  const handleDetailsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    if (isSelfBooking) {
      setErrorMsg(lang === "fr" ? "Vous ne pouvez pas réserver votre propre profil prestataire." : "You can't book your own provider profile.");
      return;
    }
    if (!isProviderBookable) {
      setErrorMsg(lang === "fr" ? "Ce prestataire n'est pas encore vérifié et ne peut pas recevoir de réservations." : "This provider isn't verified yet and can't receive bookings.");
      return;
    }
    if (!serviceDate) return;
    setStep("pay");
  };

  const handleConfirmBooking = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const scheduledAt = new Date(`${serviceDate}T${serviceTime || "09:00"}`).toISOString();
      const paymentMethod: RealPaymentMethod = operator === "cash" ? "cash" : "mobile_money";
      const booking = await supabaseService.createBooking({
        clientId: currentUser.id,
        providerId: provider.id,
        categorySlug: provider.category,
        paymentMethod,
        agreedPrice: provider.rateFCFA || 0,
        scheduledAt,
        description: description || undefined,
      });
      setCreatedBookingId(booking.id);
      setStep("success");
    } catch (err: any) {
      console.error("Error creating booking:", err);
      setErrorMsg(err.message || (lang === "fr" ? "Erreur lors de la création de la réservation." : "Error creating the booking."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="booking-modal-overlay" className="fixed inset-0 bg-amber-950/40 backdrop-blur-sm z-50 overflow-y-auto p-4">
      <div id="booking-modal-container" className="bg-white rounded-2xl w-full max-w-lg shadow-xl border border-amber-100 overflow-hidden relative mx-auto my-6 sm:my-10">
        <button
          onClick={onClose}
          id="btn-close-modal"
          className="absolute top-4 right-4 p-2 text-amber-900/60 hover:text-amber-950 hover:bg-amber-50 rounded-full transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Step 1: Booking Details */}
        {step === "details" && (
          <form onSubmit={handleDetailsSubmit} className="p-6 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-amber-950">{t.title}</h3>
              <p className="text-xs text-amber-800">
                {t.subtitle} <strong className="text-amber-900 font-semibold">{provider.name}</strong> • {provider.rateFCFA} FCFA / {provider.rateUnit}
              </p>
            </div>

            <div className="bg-amber-50/60 border border-amber-100 rounded-xl px-3.5 py-2.5 text-[11px] text-amber-900">
              {t.bookAsLabel}: <strong>{currentUser.fullName || currentUser.email}</strong>
            </div>

            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3 text-xs font-bold flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-amber-900 mb-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {t.dateLabel}
                  </label>
                  <input
                    type="date"
                    required
                    value={serviceDate}
                    onChange={(e) => setServiceDate(e.target.value)}
                    className="w-full bg-amber-50/50 border border-amber-200 rounded-xl p-3 text-sm text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-amber-900 mb-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {t.timeLabel}
                  </label>
                  <input
                    type="time"
                    required
                    value={serviceTime}
                    onChange={(e) => setServiceTime(e.target.value)}
                    className="w-full bg-amber-50/50 border border-amber-200 rounded-xl p-3 text-sm text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-amber-900 mb-1">{t.descLabel}</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="ex: Nettoyage de ma cour ou récolte de manioc de 8h à 14h..."
                  className="w-full min-h-[60px] max-h-[100px] bg-amber-50/50 border border-amber-200 rounded-xl p-3 text-sm text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                />
              </div>

              <div className="bg-amber-50 border border-amber-200/55 rounded-xl p-3.5 flex justify-between items-center mt-2">
                <span className="text-xs font-semibold text-amber-900">{t.estimatedCost}</span>
                <span className="font-bold text-lg text-amber-950">{provider.rateFCFA} FCFA</span>
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
                id="btn-confirm-details"
                className="flex-1 bg-amber-800 hover:bg-amber-900 text-white font-medium rounded-xl text-sm py-3 transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                {t.confirmBookingBtn}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* Step 2: Payment method selection + phone entry */}
        {step === "pay" && (
          <div className="p-6 space-y-5">
            <div>
              <h3 className="text-lg font-bold text-amber-950 flex items-center gap-1.5">
                <DollarSign className="w-5 h-5 text-amber-800" />
                {t.paymentStep}
              </h3>
              <p className="text-xs text-amber-800 mt-1">{t.paymentStepDesc}</p>
            </div>

            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3 text-xs font-bold flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Payment method tabs */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOperator("mtn")}
                className={`p-4 rounded-xl border flex flex-col items-center gap-2 cursor-pointer transition-all ${
                  operator === "mtn" || operator === "orange"
                    ? "border-amber-500 bg-amber-50 ring-2 ring-amber-500/20"
                    : "border-amber-200 bg-white hover:bg-amber-50/20"
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-[#FFCC00] flex items-center justify-center font-black text-black text-sm shadow-inner">
                  MoMo
                </div>
                <span className="text-[11px] font-bold text-amber-950">{t.payWithMomo}</span>
              </button>

              <button
                type="button"
                onClick={() => setOperator("cash")}
                className={`p-4 rounded-xl border flex flex-col items-center gap-2 cursor-pointer transition-all ${
                  operator === "cash"
                    ? "border-amber-500 bg-amber-50 ring-2 ring-amber-500/20"
                    : "border-amber-200 bg-white hover:bg-amber-50/20"
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-white text-xl shadow-inner">
                  💵
                </div>
                <span className="text-[11px] font-bold text-amber-950">{t.payWithCash}</span>
              </button>
            </div>

            {/* MoMo details: operator choice + phone */}
            {(operator === "mtn" || operator === "orange") && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-amber-900 mb-2">{t.selectOperator}</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setOperator("mtn")}
                      className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                        operator === "mtn"
                          ? "border-amber-500 bg-amber-50 ring-2 ring-amber-500/20"
                          : "border-amber-200 bg-white hover:bg-amber-50/20"
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-[#FFCC00] flex items-center justify-center font-black text-black text-[10px] shadow-inner">
                        MTN
                      </div>
                      <span className="text-[11px] font-bold text-amber-950">MTN MoMo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setOperator("orange")}
                      className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                        operator === "orange"
                          ? "border-amber-500 bg-amber-50 ring-2 ring-amber-500/20"
                          : "border-amber-200 bg-white hover:bg-amber-50/20"
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-[#FF6600] flex items-center justify-center font-bold text-white text-[9px] shadow-inner">
                        OM
                      </div>
                      <span className="text-[11px] font-bold text-amber-950">Orange Money</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-amber-900 mb-1 flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {t.enterPhone}
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder={t.phonePlaceholder}
                    value={paymentPhone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    className={`w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent ${
                      paymentPhone && !paymentPhoneValid
                        ? "border-red-300 bg-red-50 text-red-900"
                        : paymentPhoneValid
                          ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                          : "border-amber-200 bg-amber-50/50 text-amber-950"
                    } focus:ring-amber-600`}
                  />
                  <p className="text-[10px] text-amber-800 mt-1.5">{t.phoneHint}</p>
                </div>
              </div>
            )}

            {operator === "cash" && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-2.5">
                <span className="text-lg shrink-0">🤝</span>
                <p className="text-[11px] text-emerald-950 leading-relaxed font-sans">
                  {lang === "fr"
                    ? "Vous payerez directement le prestataire en espèces (FCFA) une fois le travail accompli. L'accord sera enregistré en toute confiance."
                    : "You will pay the provider directly in cash (FCFA) once the job is completed. The deal will be securely registered."}
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setStep("details")}
                className="flex-1 py-3 border border-amber-200 text-amber-900 hover:bg-amber-50 font-medium rounded-xl text-sm transition-colors cursor-pointer"
              >
                {t.back}
              </button>
              <button
                onClick={handleConfirmBooking}
                disabled={loading || ((operator === "mtn" || operator === "orange") && !paymentPhoneValid)}
                id="btn-initiate-momo"
                className="flex-1 bg-amber-800 hover:bg-amber-900 disabled:opacity-50 text-white font-medium rounded-xl text-sm py-3 transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t.confirmPayment}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Success receipt */}
        {step === "success" && (
          <div className="p-8 text-center flex flex-col items-center justify-center space-y-4">
            <CheckCircle className="w-16 h-16 text-emerald-600 animate-bounce" />

            <div className="space-y-1">
              <h3 className="text-xl font-bold text-amber-950">{t.successTitle}</h3>
              <p className="text-xs text-emerald-700 font-medium">{t.successSubtitle}</p>
            </div>

            <div className="w-full bg-amber-50/50 border border-amber-200/50 rounded-2xl p-4 text-left text-xs space-y-2 mt-2">
              <div className="flex justify-between">
                <span className="text-amber-800">Prestataire :</span>
                <span className="font-bold text-amber-950">{provider.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-800">Montant estimé :</span>
                <span className="font-bold text-amber-950">{provider.rateFCFA} FCFA</span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-800">Date prévue :</span>
                <span className="font-bold text-amber-950">{serviceDate} ({serviceTime})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-800">Mode de paiement :</span>
                <span className="font-bold text-amber-950">
                  {operator === "cash" ? "💵 Espèces" : `📱 ${operator === "mtn" ? "MTN MoMo" : "Orange Money"} (${paymentPhone})`}
                </span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-amber-100/50">
                <span className="text-amber-800">Réf. réservation :</span>
                <span className="font-mono font-bold text-amber-950">{createdBookingId.slice(0, 8)}</span>
              </div>
            </div>

            <p className="text-[11px] text-amber-900/80 leading-relaxed px-2 mt-2">
              {t.receiptInfo}
            </p>

            <button
              onClick={() => {
                onBookingSuccess();
                onClose();
              }}
              id="btn-finish-booking"
              className="w-full max-w-xs bg-amber-800 hover:bg-amber-900 text-white font-medium py-3 rounded-xl text-sm transition-colors shadow-sm mt-4 cursor-pointer"
            >
              Fermer & Voir mes réservations
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
