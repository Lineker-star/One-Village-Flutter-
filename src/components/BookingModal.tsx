/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { ServiceProvider, PaymentMethod } from "../types.ts";
import { Calendar, Clock, DollarSign, X, CheckCircle, ShieldAlert, Loader2, ArrowRight } from "lucide-react";

interface BookingModalProps {
  provider: ServiceProvider;
  lang: "fr" | "en";
  onClose: () => void;
  onBookingSuccess: () => void;
}

export default function BookingModal({ provider, lang, onClose, onBookingSuccess }: BookingModalProps) {
  const [step, setStep] = useState<"details" | "pay" | "ussd_prompt" | "success">("details");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("+237 ");
  const [serviceDate, setServiceDate] = useState("");
  const [serviceTime, setServiceTime] = useState("09:00");
  const [description, setDescription] = useState("");
  
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.MTN_MOMO);
  const [paymentPhone, setPaymentPhone] = useState("+237 ");
  const [pinCode, setPinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [bookingId, setBookingId] = useState("");
  const [transactionId, setTransactionId] = useState("");

  const t = {
    fr: {
      title: "Réserver un service",
      subtitle: "Avec",
      nameLabel: "Votre nom complet",
      phoneLabel: "Votre numéro de téléphone",
      dateLabel: "Date d'intervention",
      timeLabel: "Heure souhaitée",
      descLabel: "Expliquez brièvement votre besoin",
      estimatedCost: "Coût estimé",
      momoTitle: "Paiement Mobile Money",
      momoSubtitle: "Sélectionnez votre opérateur et entrez votre numéro de paiement",
      payBtn: "Lancer le paiement",
      confirmBookingBtn: "Confirmer la réservation",
      momoWarning: "Une notification push USSD sera envoyée sur votre téléphone.",
      pinPrompt: "Saisissez votre code secret",
      confirmPinBtn: "Valider le paiement",
      cancel: "Annuler",
      successTitle: "Réservation confirmée !",
      successSubtitle: "Le paiement Mobile Money a été validé avec succès.",
      transId: "ID de transaction",
      receiptInfo: "Un message de confirmation a été envoyé au prestataire. Vous pouvez commencer à discuter avec lui depuis votre tableau de bord."
    },
    en: {
      title: "Book a service",
      subtitle: "With",
      nameLabel: "Your full name",
      phoneLabel: "Your phone number",
      dateLabel: "Service Date",
      timeLabel: "Preferred Time",
      descLabel: "Briefly explain your needs",
      estimatedCost: "Estimated cost",
      momoTitle: "Mobile Money Payment",
      momoSubtitle: "Select your provider and enter your payment number",
      payBtn: "Launch Payment Request",
      confirmBookingBtn: "Confirm Booking",
      momoWarning: "A USSD push notification will be sent to your phone.",
      pinPrompt: "Enter your secret PIN",
      confirmPinBtn: "Validate Payment",
      cancel: "Cancel",
      successTitle: "Booking Confirmed!",
      successSubtitle: "Mobile Money payment has been validated successfully.",
      transId: "Transaction ID",
      receiptInfo: "A confirmation message has been sent to the service provider. You can start chatting with them from your dashboard."
    }
  }[lang];

  const handleBookingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !customerPhone || !serviceDate) return;
    setPaymentPhone(customerPhone);
    setStep("pay");
  };

  const handlePaymentInitiate = async () => {
    setLoading(true);
    try {
      // Create booking on server with final selected payment method
      const isCash = paymentMethod === "CASH" || (paymentMethod as string) === "CASH";
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: provider.id,
          providerName: provider.name,
          customerName,
          customerPhone,
          category: provider.category,
          serviceDate,
          serviceTime,
          description,
          estimatedFCFA: provider.rateFCFA,
          paymentMethod: paymentMethod,
          paymentPhone: isCash ? undefined : paymentPhone,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setBookingId(data.id);
        if (isCash) {
          // If cash, we succeed instantly without any USSD prompt
          setTransactionId(`CASH_${Math.floor(100000 + Math.random() * 900000)}`);
          setStep("success");
        } else {
          setStep("ussd_prompt");
        }
      }
    } catch (err) {
      console.error("Error creating booking:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentConfirm = async () => {
    if (!pinCode) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/bookings/${bookingId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod,
          paymentPhone,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setTransactionId(data.booking.momoTransactionId);
        setStep("success");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="booking-modal-overlay" className="fixed inset-0 bg-amber-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div id="booking-modal-container" className="bg-white rounded-2xl w-full max-w-lg shadow-xl border border-amber-100 overflow-hidden relative">
        <button
          onClick={onClose}
          id="btn-close-modal"
          className="absolute top-4 right-4 p-2 text-amber-900/60 hover:text-amber-950 hover:bg-amber-50 rounded-full transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Step 1: Booking Details */}
        {step === "details" && (
          <form onSubmit={handleBookingSubmit} className="p-6 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-amber-950">{t.title}</h3>
              <p className="text-xs text-amber-800">
                {t.subtitle} <strong className="text-amber-900 font-semibold">{provider.name}</strong> • {provider.rateFCFA} FCFA / {provider.rateUnit}
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-semibold text-amber-900 mb-1">{t.nameLabel}</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="ex: Jean-Luc Atangana"
                  className="w-full bg-amber-50/50 border border-amber-200 rounded-xl p-3 text-sm text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-amber-900 mb-1">{t.phoneLabel}</label>
                <input
                  type="text"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+237 6XX XX XX XX"
                  className="w-full bg-amber-50/50 border border-amber-200 rounded-xl p-3 text-sm text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                disabled={loading}
                id="btn-confirm-details"
                className="flex-1 bg-amber-800 hover:bg-amber-900 text-white font-medium rounded-xl text-sm py-3 transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    {t.confirmBookingBtn}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Step 2: Mobile Money Method selection */}
        {step === "pay" && (
          <div className="p-6 space-y-5">
            <div>
              <h3 className="text-lg font-bold text-amber-950 flex items-center gap-1.5">
                <DollarSign className="w-5 h-5 text-amber-800" />
                {paymentMethod === PaymentMethod.CASH ? (lang === "fr" ? "Paiement en Espèces" : "Cash on Service") : t.momoTitle}
              </h3>
              <p className="text-xs text-amber-800 mt-1">
                {paymentMethod === PaymentMethod.CASH 
                  ? (lang === "fr" ? "Réglez directement le prestataire après la fin du travail" : "Pay the provider directly after completion") 
                  : t.momoSubtitle}
              </p>
            </div>

            <div className="space-y-4">
              {/* Operator Cards */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod(PaymentMethod.MTN_MOMO)}
                  className={`relative p-3 rounded-xl border flex flex-col items-center gap-2 cursor-pointer transition-all ${
                    paymentMethod === PaymentMethod.MTN_MOMO
                      ? "border-amber-500 bg-amber-50 ring-2 ring-amber-500/20"
                      : "border-amber-200 bg-white hover:bg-amber-50/20"
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-[#FFCC00] flex items-center justify-center font-black text-black text-xs shadow-inner">
                    MTN
                  </div>
                  <span className="text-[10px] font-bold text-amber-950">MoMo</span>
                  {paymentMethod === PaymentMethod.MTN_MOMO && (
                    <div className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-amber-600" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod(PaymentMethod.ORANGE_MONEY)}
                  className={`relative p-3 rounded-xl border flex flex-col items-center gap-2 cursor-pointer transition-all ${
                    paymentMethod === PaymentMethod.ORANGE_MONEY
                      ? "border-amber-500 bg-amber-50 ring-2 ring-amber-500/20"
                      : "border-amber-200 bg-white hover:bg-amber-50/20"
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-[#FF6600] flex items-center justify-center font-bold text-white text-[9px] shadow-inner">
                    OM
                  </div>
                  <span className="text-[10px] font-bold text-amber-950">Orange</span>
                  {paymentMethod === PaymentMethod.ORANGE_MONEY && (
                    <div className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-amber-600" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod(PaymentMethod.CASH)}
                  className={`relative p-3 rounded-xl border flex flex-col items-center gap-2 cursor-pointer transition-all ${
                    paymentMethod === PaymentMethod.CASH
                      ? "border-amber-500 bg-amber-50 ring-2 ring-amber-500/20"
                      : "border-amber-200 bg-white hover:bg-amber-50/20"
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-white text-base shadow-inner">
                    💵
                  </div>
                  <span className="text-[10px] font-bold text-amber-950">{lang === "fr" ? "Espèces" : "Cash"}</span>
                  {paymentMethod === PaymentMethod.CASH && (
                    <div className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-amber-600" />
                  )}
                </button>
              </div>

              {paymentMethod !== PaymentMethod.CASH ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-amber-900 mb-1">Numéro Mobile Money (+237)</label>
                    <input
                      type="text"
                      required
                      value={paymentPhone}
                      onChange={(e) => setPaymentPhone(e.target.value)}
                      className="w-full bg-amber-50/50 border border-amber-200 rounded-xl p-3 text-sm text-amber-950 font-mono tracking-wider focus:outline-none"
                    />
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5">
                    <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <span className="text-[11px] text-amber-800 leading-relaxed">{t.momoWarning}</span>
                  </div>
                </>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-2.5">
                  <span className="text-lg shrink-0">🤝</span>
                  <p className="text-[11px] text-emerald-950 leading-relaxed font-sans">
                    {lang === "fr" 
                      ? "Vous payerez directement le prestataire en espèces (FCFA) une fois le travail accompli. L'accord sera enregistré en toute confiance." 
                      : "You will pay the provider directly in cash (FCFA) once the job is completed. The deal will be securely registered."}
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setStep("details")}
                className="flex-1 py-3 border border-amber-200 text-amber-900 hover:bg-amber-50 font-medium rounded-xl text-sm transition-colors cursor-pointer"
              >
                Retour
              </button>
              <button
                onClick={handlePaymentInitiate}
                disabled={loading}
                id="btn-initiate-momo"
                className="flex-1 bg-amber-800 hover:bg-amber-900 disabled:opacity-50 text-white font-medium rounded-xl text-sm py-3 transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : paymentMethod === PaymentMethod.CASH ? (
                  lang === "fr" ? "Confirmer la commande" : "Confirm Booking"
                ) : (
                  `${t.payBtn} (${provider.rateFCFA} FCFA)`
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Simulated USSD Push Notification Overlay popup */}
        {step === "ussd_prompt" && (
          <div className="p-8 bg-neutral-900 text-white flex flex-col items-center justify-center text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-amber-500 flex items-center justify-center animate-pulse shadow-lg text-3xl">
              📲
            </div>

            <div className="space-y-2 max-w-sm">
              <div className="text-xs uppercase tracking-widest text-amber-400 font-bold font-mono">
                {paymentMethod === PaymentMethod.MTN_MOMO ? "MTN MoMo *126#" : "Orange Money #150#"}
              </div>
              <h4 className="text-base font-mono font-medium leading-relaxed">
                Autoriser le paiement de <strong className="text-amber-400">{provider.rateFCFA} FCFA</strong> pour la réservation One Village avec {provider.name} ?
              </h4>
            </div>

            <div className="w-full max-w-xs space-y-3">
              <label className="block text-xs text-neutral-400 font-mono">{t.pinPrompt} (PIN)</label>
              <input
                type="password"
                maxLength={4}
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ""))}
                placeholder="••••"
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl p-3 text-center text-xl font-bold font-mono tracking-[0.5em] text-amber-400 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex gap-2.5 w-full max-w-xs">
              <button
                onClick={() => setStep("pay")}
                className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-mono text-sm rounded-xl transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={handlePaymentConfirm}
                disabled={loading || pinCode.length < 4}
                id="btn-confirm-pin"
                className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-black font-bold font-mono text-sm py-2.5 rounded-xl transition-colors cursor-pointer"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t.confirmPinBtn}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Success receipt */}
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
                <span className="text-amber-800">Montant payé :</span>
                <span className="font-bold text-amber-950">{provider.rateFCFA} FCFA</span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-800">Date prévue :</span>
                <span className="font-bold text-amber-950">{serviceDate} ({serviceTime})</span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-amber-100/50">
                <span className="text-amber-800">{t.transId} :</span>
                <span className="font-mono font-bold text-amber-950">{transactionId}</span>
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
