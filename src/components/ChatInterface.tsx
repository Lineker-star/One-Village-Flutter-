/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { ServiceProvider, UserProfile, ChatMessage } from "../types.ts";
import { supabaseService } from "../lib/supabase.ts";
import {
  Send,
  ArrowLeft,
  Loader2,
  Image,
  Check,
  X,
  Phone,
  MessageCircle,
  AlertTriangle,
} from "lucide-react";
import { CATEGORY_DETAILS } from "../data/bertouaData.ts";

interface ChatInterfaceProps {
  provider: ServiceProvider;
  currentUser: UserProfile;
  lang: "fr" | "en";
  onBack: () => void;
}

export default function ChatInterface({ provider, currentUser, lang, onBack }: ChatInterfaceProps) {
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showImageComingSoon, setShowImageComingSoon] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const cat = CATEGORY_DETAILS[provider.category];

  const t = {
    fr: {
      placeholder: "Écrivez votre message à...",
      whatsappBanner: "Préférer WhatsApp ? Échangez directement avec le prestataire en un clic.",
      whatsappBtn: "Continuer sur WhatsApp",
      sending: "Envoi...",
      loadingHistory: "Chargement de la discussion...",
      noMessages: "Aucun message pour le moment. Dites bonjour !",
      imageComingSoon: "L'envoi de photos arrive bientôt.",
      openError: "Impossible d'ouvrir la discussion. Réessayez plus tard.",
      sendError: "Échec de l'envoi du message.",
    },
    en: {
      placeholder: "Write your message to...",
      whatsappBanner: "Prefer WhatsApp? Chat directly with the provider in one click.",
      whatsappBtn: "Continue on WhatsApp",
      sending: "Sending...",
      loadingHistory: "Loading the conversation...",
      noMessages: "No messages yet. Say hello!",
      imageComingSoon: "Sending photos is coming soon.",
      openError: "Couldn't open the chat. Please try again later.",
      sendError: "Failed to send the message.",
    }
  }[lang];

  // WhatsApp link preparation
  const prefilledGreeting = {
    fr: `Bonjour ${provider.name}, je vous contacte depuis la plateforme One Village concernant vos services de ${cat?.nameFR || "prestataire"}.`,
    en: `Hello ${provider.name}, I am contacting you from the One Village platform regarding your ${cat?.nameEN || "provider"} services.`
  }[lang];

  const whatsappUrl = `https://wa.me/${(provider.whatsappNumber || provider.phone).replace(/[\s+]/g, "")}?text=${encodeURIComponent(prefilledGreeting)}`;

  // Opens (or creates) the real chat thread, loads history, and subscribes to new messages via
  // Supabase Realtime — no polling.
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;
    setLoadingHistory(true);
    setErrorMsg("");
    setMessages([]);
    setChatId(null);

    (async () => {
      try {
        const id = await supabaseService.getOrCreateChat(currentUser.id, provider.id);
        if (!active) return;
        setChatId(id);

        const history = await supabaseService.getChatMessages(id, currentUser.id);
        if (!active) return;
        setMessages(history);

        unsubscribe = supabaseService.subscribeToChatMessages(id, currentUser.id, (msg) => {
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        });
      } catch (err) {
        console.error("Failed to open chat:", err);
        if (active) setErrorMsg(t.openError);
      } finally {
        if (active) setLoadingHistory(false);
      }
    })();

    return () => {
      active = false;
      unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.id, currentUser.id]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || sending || !chatId) return;

    setInputText("");
    setSending(true);
    setErrorMsg("");
    try {
      await supabaseService.sendChatMessage(chatId, currentUser.id, text);
      // The message itself arrives for both participants via the Realtime subscription above.
    } catch (err) {
      console.error("Failed to send message:", err);
      setErrorMsg(t.sendError);
      setInputText(text);
    } finally {
      setSending(false);
    }
  };

  const handleImageButtonClick = () => {
    setShowImageComingSoon(true);
    setTimeout(() => setShowImageComingSoon(false), 2500);
  };

  return (
    <div id="chat-interface-container" className="bg-white border border-amber-200/60 rounded-3xl shadow-sm flex flex-col h-[70vh] max-h-[580px] min-h-[380px] overflow-hidden">
      {/* Header */}
      <div className="bg-amber-50 p-4 border-b border-amber-200/60 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 hover:bg-amber-100/70 rounded-lg text-amber-950 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h4 className="font-bold text-amber-950 text-sm">{provider.name}</h4>
          </div>
        </div>

        {/* Action Row - Mobile Call button direct link (Phase 5) */}
        <div className="flex items-center gap-2">
          <a
            href={`tel:${provider.phone}`}
            className="p-2.5 bg-amber-100 hover:bg-amber-200 text-amber-950 rounded-xl transition-all shadow-xs border border-amber-200/40"
            title="Appeler"
          >
            <Phone className="w-4 h-4" />
          </a>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="p-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl transition-all shadow-xs border border-emerald-200/40 font-bold text-xs flex items-center gap-1.5"
          >
            <MessageCircle className="w-4 h-4 fill-emerald-700 text-emerald-700" />
            <span className="hidden sm:inline">WhatsApp</span>
          </a>
        </div>
      </div>

      {/* Persistent WhatsApp redirection banner (Phase 6 requirement) */}
      <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-2 flex items-center justify-between text-xs text-emerald-950 shrink-0 select-none animate-fade-in">
        <div className="flex items-center gap-2">
          <span className="text-sm">💬</span>
          <p className="font-medium pr-4 text-[11px] leading-tight text-emerald-900 font-sans">
            {t.whatsappBanner}
          </p>
        </div>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noreferrer"
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-wide px-3 py-1.5 rounded-lg shrink-0 transition-colors shadow-xs"
        >
          {t.whatsappBtn}
        </a>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border-b border-red-100 px-4 py-2 flex items-center gap-2 text-xs text-red-800 shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Message Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#FAF9F6]/30">
        {loadingHistory ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-amber-800 text-xs">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>{t.loadingHistory}</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center text-xs text-amber-800/70 font-serif italic px-6">
            {t.noMessages}
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.sender === "customer";
            return (
              <div
                key={msg.id}
                className={`flex flex-col max-w-[85%] ${isMine ? "ml-auto items-end" : "mr-auto items-start"} animate-fade-in`}
              >
                <div
                  className={`p-3.5 rounded-2xl leading-relaxed text-sm shadow-xs ${
                    isMine
                      ? "bg-amber-900 text-white rounded-tr-none"
                      : "bg-white text-amber-950 rounded-tl-none border border-amber-100"
                  }`}
                >
                  <p className="font-sans whitespace-pre-line text-xs font-medium leading-relaxed">{msg.text}</p>
                </div>

                <div className="flex items-center gap-1.5 mt-1 px-1 text-[9px] text-amber-800/60 font-mono">
                  <span>
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {isMine && (
                    <span className="flex items-center text-amber-800/40">
                      <Check className="w-3.5 h-3.5" title="Envoyé / Sent" />
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Image "coming soon" transient notice */}
      {showImageComingSoon && (
        <div className="px-4 py-2 border-t border-amber-100 bg-amber-50/70 flex items-center gap-2 text-[11px] text-amber-800 shrink-0 animate-fade-in">
          <Image className="w-3.5 h-3.5 shrink-0" />
          <span>{t.imageComingSoon}</span>
        </div>
      )}

      {/* Input bar controls */}
      <form onSubmit={handleSendMessage} className="p-3.5 border-t border-amber-100 flex items-center gap-2.5 bg-white shrink-0">
        {/* Attachment image button — visibly present but disabled ("coming soon"), not wired to a real upload */}
        <button
          type="button"
          onClick={handleImageButtonClick}
          className="p-3 bg-amber-50/60 text-amber-900/40 rounded-xl transition-colors cursor-not-allowed border border-amber-200/30 flex items-center justify-center shadow-xs"
          title={t.imageComingSoon}
        >
          <Image className="w-4.5 h-4.5" />
        </button>

        {/* Text Area Input */}
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={`${t.placeholder} ${provider.name}...`}
          disabled={loadingHistory}
          className="flex-1 bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 placeholder-amber-900/35 focus:outline-none focus:ring-1.5 focus:ring-amber-700 disabled:opacity-50"
        />

        <button
          type="submit"
          disabled={sending || loadingHistory || !inputText.trim()}
          id="btn-send-msg"
          className="p-3 bg-amber-800 hover:bg-amber-900 disabled:opacity-40 text-white rounded-xl transition-all cursor-pointer shadow-sm flex items-center justify-center"
        >
          {sending ? (
            <Loader2 className="w-4.5 h-4.5 animate-spin" />
          ) : (
            <Send className="w-4.5 h-4.5" />
          )}
        </button>
      </form>
    </div>
  );
}
