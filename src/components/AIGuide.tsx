/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import brandLogo from "../assets/images/one_village_logo_1784027088635.jpg";
import {
  Sparkles,
  MessageSquare,
  Languages,
  FileText,
  Landmark,
  Send,
  Loader2,
  Volume2,
  VolumeX,
  Globe,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Play,
  HelpCircle,
  AlertTriangle,
  Camera,
  Copy,
  User,
  Paperclip,
  Bot,
} from "lucide-react";

interface AIGuideProps {
  onApplyPolishedDescription?: (text: string) => void;
  lang: "fr" | "en";
}

// Curated local dialects phrase dictionary (Phase 8 - Stage C: Offline Phrase-Matching)
const localPhrases = [
  { fr: "Bonjour", en: "Hello", Gbaya: "Sango nɛ ko", Makaa: "O bwa we", Fulfulde: "Jam bandu" },
  { fr: "Comment ça va ?", en: "How are you?", Gbaya: "Moké dukiè ?", Makaa: "Mende de ?", Fulfulde: "No korbuda ?" },
  { fr: "Merci", en: "Thank you", Gbaya: "Gara tènɛ", Makaa: "Mende me baia", Fulfulde: "A balti mbe" },
  { fr: "Combien ça coûte ?", en: "How much is it?", Gbaya: "Bó dòn ?", Makaa: "Nte jil ?", Fulfulde: "Nof foti ?" },
  { fr: "Au revoir", en: "Goodbye", Gbaya: "Kpaa bɛn", Makaa: "Ngwul bo", Fulfulde: "Bo jam" },
];

export default function AIGuide({ onApplyPolishedDescription, lang }: AIGuideProps) {
  const [activeTab, setActiveTab] = useState<"translate" | "polish" | "pricing" | "chat" | "video">("chat");
  const [inputText, setInputText] = useState("");
  const [targetLang, setTargetLang] = useState("Gbaya");
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);

  // --- Stateful conversation (memory + continuity) -------------------------------------
  // The chat tab keeps a real transcript so the assistant remembers prior turns. History is
  // persisted to localStorage (keyed per browser) so continuity survives page reloads, and the
  // full transcript is sent to /api/chat on each turn — the server is stateless per request and
  // uses the client history as the source of truth (works on Vercel serverless cold starts).
  type ChatTurn = { role: "user" | "assistant"; content: string; ts?: number };
  const [chatMessages, setChatMessages] = useState<ChatTurn[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [visionLoading, setVisionLoading] = useState(false);
  const chatSessionIdRef = React.useRef<string>("");
  const chatBottomRef = React.useRef<HTMLDivElement | null>(null);
  const chatFileRef = React.useRef<HTMLInputElement | null>(null);

  // Load any prior transcript + session id once on mount (per browser).
  useEffect(() => {
    try {
      let sid = localStorage.getItem("ov_chat_session");
      if (!sid) {
        sid = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        localStorage.setItem("ov_chat_session", sid);
      }
      chatSessionIdRef.current = sid;
      const saved = localStorage.getItem("ov_chat_history");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setChatMessages(parsed.slice(-30));
      }
    } catch {
      chatSessionIdRef.current = `sess_${Date.now()}`;
    }
  }, []);

  // Persist transcript whenever it changes.
  useEffect(() => {
    try {
      localStorage.setItem("ov_chat_history", JSON.stringify(chatMessages.slice(-30)));
    } catch {
      /* storage full / unavailable — non-fatal */
    }
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Streaming send: appends the user turn, then progressively fills an assistant bubble as
  // tokens arrive over SSE (/api/chat/stream). Falls back to the non-streaming /api/chat if the
  // stream errors before any token, so the UX degrades gracefully on any runtime.
  const streamChat = async (turns: ChatTurn[]) => {
    const assistantIndex = chatMessages.length; // index the assistant bubble will occupy
    setChatMessages((prev) => {
      const withUser = [...prev, { role: "user" as const, content: turns[turns.length - 1].content, ts: Date.now() }];
      return [...withUser, { role: "assistant" as const, content: "", ts: Date.now() }];
    });
    setChatLoading(true);
    setStreaming(true);

    const updateAssistant = (text: string) => {
      setChatMessages((prev) => {
        const copy = [...prev];
        // The assistant bubble is the last element while streaming.
        const lastIdx = copy.length - 1;
        if (lastIdx >= 0 && copy[lastIdx].role === "assistant" && copy[lastIdx].content === "") {
          copy[lastIdx] = { ...copy[lastIdx], content: text };
        }
        return copy;
      });
    };

    let received = false;
    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: chatSessionIdRef.current, lang, messages: turns }),
      });
      if (!res.ok || !res.body) throw new Error("stream unavailable");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          try {
            const evt = JSON.parse(line.slice(5).trim());
            if (evt.delta) { acc += evt.delta; received = true; updateAssistant(acc); }
            else if (evt.error) { if (!received) updateAssistant(evt.error); }
          } catch { /* ignore malformed SSE line */ }
        }
      }
      if (!received) throw new Error("no tokens");
    } catch {
      // Fallback to non-streaming endpoint.
      try {
        const res2 = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: chatSessionIdRef.current, lang, messages: turns }),
        });
        const data = await res2.json();
        const reply = res2.ok && data.reply
          ? data.reply
          : data.error || (lang === "fr" ? "Désolé, je n'ai pas pu répondre." : "Sorry, I couldn't respond.");
        updateAssistant(reply);
        received = true;
      } catch {
        if (!received) {
          updateAssistant(lang === "fr" ? "Impossible de me connecter. Vérifiez votre connexion." : "Couldn't connect. Check your connection.");
        }
      }
    } finally {
      setChatLoading(false);
      setStreaming(false);
    }
  };

  const handleChatSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || chatLoading) return;
    const nextTurns: ChatTurn[] = [...chatMessages, { role: "user", content: text }];
    setInputText("");
    await streamChat(nextTurns);
  };

  // Image attach → Gemini vision. Reads the picked file as base64 and posts it to /api/ai-vision,
  // then shows the analysis as an assistant message.
  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1] || "";
      setVisionLoading(true);
      setChatMessages((prev) => [...prev, { role: "user", content: lang === "fr" ? "📷 [Image jointe]" : "📷 [Image attached]", ts: Date.now() }]);
      try {
        const res = await fetch("/api/ai-vision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, mimeType: file.type, lang, prompt: inputText.trim() || undefined }),
        });
        const data = await res.json();
        setChatMessages((prev) => [...prev, {
          role: "assistant",
          content: res.ok && data.text ? data.text : (data.error || (lang === "fr" ? "Impossible d'analyser l'image." : "Couldn't analyze the image.")),
          ts: Date.now(),
        }]);
      } catch {
        setChatMessages((prev) => [...prev, { role: "assistant", content: lang === "fr" ? "Échec de l'analyse de l'image." : "Image analysis failed.", ts: Date.now() }]);
      } finally {
        setVisionLoading(false);
        setInputText("");
      }
    };
    reader.readAsDataURL(file);
  };

  // Per-message read-aloud (French/English TTS).
  const speakMessage = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/[#*`_]/g, "").trim();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = lang === "fr" ? "fr-FR" : "en-US";
    window.speechSynthesis.speak(u);
  };

  // Lightweight markdown -> safe HTML (bold, italic, code, line breaks). No raw HTML injection.
  const renderRich = (text: string) => {
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const html = escaped
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br/>");
    return { __html: html };
  };

  const quickReplies = lang === "fr"
    ? ["Trouver un plombier", "Prix d'un moto-taxi", "Un bon coiffeur", "Offres d'emploi"]
    : ["Find a plumber", "Moto-taxi price", "A good barber", "Job openings"];

  // Clears the conversation (memory reset) — local transcript + server session.
  const handleChatReset = () => {
    setChatMessages([]);
    try {
      localStorage.removeItem("ov_chat_history");
    } catch {
      /* ignore */
    }
    if (chatSessionIdRef.current) {
      fetch("/api/chat/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: chatSessionIdRef.current }),
      }).catch(() => {});
    }
  };

  // AI availability banner: the server returns a specific 503 body when GEMINI_API_KEY is not set,
  // and the first request of every session used to just silently fall back to the generic error
  // string ("Une erreur est survenue."). We now probe once on mount and keep a stable flag so the
  // UI can show an explicit "AI unavailable — running in offline phrasebook mode" banner instead
  // of letting the user type and wonder why nothing ever comes back.
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai-guide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "ping", task: "chat" }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        // The route returns { error: "..." } with a 503 when the key is missing; any other shape
        // (including a real answer) means the service is live.
        setAiAvailable(!data?.error);
      })
      .catch(() => {
        if (!cancelled) setAiAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Speech Recognition & Synthesis States (Phase 8 - Stage B)
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const t = {
    fr: {
      title: "Assistant One Village",
      subtitle: "Trouvez un service, traduisez une demande ou estimez un tarif à Bertoua",
      chatPlaceholder: "Posez-moi une question sur Bertoua, les langues locales ou One Village...",
      translatePlaceholder: "Entrez votre phrase en français ou anglais...",
      polishPlaceholder: "Décrivez votre service brièvement (ex: je lave le manioc, rapide, Mokolo, 3000f)...",
      pricingPlaceholder: "Quel service souhaitez-vous tarifer ? (ex: Moto-taxi, Maçon, Ménage...)",
      translateBtn: "Traduire en langue locale",
      polishBtn: "Rendre professionnel",
      pricingBtn: "Estimer le prix juste",
      applyBtn: "Appliquer la description",
      tabs: {
        chat: "Discuter",
        translate: "Traducteur",
        polish: "Rédacteur Pro",
        pricing: "Tarifs de l'Est",
        video: "Guide Vidéo"
      },
      thinking: "L'assistant réfléchit...",
      audioPrompt: "Écouter la prononciation locale (Phonétique)",
      unsupportedAudio: "Audio bientôt disponible pour ce dialecte spécifique !",
      offlinePhrasesTitle: "Phrases courantes de Bertoua (Traduction Instantanée)",
      listening: "Écoute en cours... parlez maintenant",
      voiceUnavailable: "La dictée vocale n'est pas activée sur ce navigateur.",
      videoTitle: "Recherche par Guide Vidéo",
      videoSubtitle: "Bientôt disponible (Phase post-lancement)",
      videoDesc: "Enregistrez ou téléchargez une courte vidéo montrant votre panne ou votre besoin. Notre IA l'analysera pour vous proposer les meilleurs prestataires de Bertoua !",
      startVideo: "Activer la caméra",
      speakResponse: "Lire à voix haute",
      stopSpeech: "Arrêter la lecture"
    },
    en: {
      title: "One Village Assistant",
      subtitle: "Find a service, translate a request, or estimate a fair price in Bertoua",
      chatPlaceholder: "Ask me a question about Bertoua, local languages or One Village...",
      translatePlaceholder: "Enter your sentence in English or French...",
      polishPlaceholder: "Describe your service briefly (e.g. I clear fields, fast work, Mokolo, 5000f)...",
      pricingPlaceholder: "What service do you want to price? (e.g. Moto-taxi, Mason, Housework...)",
      translateBtn: "Translate to Local Language",
      polishBtn: "Make Professional",
      pricingBtn: "Estimate Fair Price",
      applyBtn: "Apply Description",
      tabs: {
        chat: "Chat",
        translate: "Translator",
        polish: "Pro Writer",
        pricing: "East Region Prices",
        video: "Video Guide"
      },
      thinking: "The assistant is thinking...",
      audioPrompt: "Listen to local pronunciation (Phonetic)",
      unsupportedAudio: "Audio coming soon for this specific dialect!",
      offlinePhrasesTitle: "Common Bertoua Phrases (Instant Match)",
      listening: "Listening... speak now",
      voiceUnavailable: "Voice recognition is not supported on this browser.",
      videoTitle: "Video Guide Search",
      videoSubtitle: "Coming Soon (Post-launch Phase)",
      videoDesc: "Record or upload a short video showing your technical issue or project. Our AI will analyze it to suggest the best local providers in Bertoua!",
      startVideo: "Activate camera",
      speakResponse: "Read response aloud",
      stopSpeech: "Stop reading"
    }
  }[lang];

  // Stage B: Speech to Text (STT) for French/English using Web Speech API
  const handleStartListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert(t.voiceUnavailable);
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = lang === "fr" ? "fr-FR" : "en-US";
    recognition.interimResults = true; // live partial transcript for a natural, responsive feel
    recognition.maxAlternatives = 3; // request alternatives for better accuracy on accents/dialects

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      // Build final + interim transcript. Finalized segments are appended; the interim segment
      // is shown live so the user sees words appear as they speak.
      let finalText = "";
      let interimText = "";
      for (let i = 0; i < event.results.length; i++) {
        const seg = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += seg + " ";
        else interimText += seg;
      }
      // Preserve any text the user already typed before dictating.
      setInputText((prev) => {
        const base = prev.replace(/\[interim:.*\]$/s, "").trim();
        const composed = (base ? base + " " : "") + finalText.trim() + (interimText ? ` [interim:${interimText.trim()}]` : "");
        return composed;
      });
    };

    recognition.onerror = (err: any) => {
      console.error("Speech recognition error:", err);
      // no-speech / aborted are non-fatal; don't surface an error for them.
      if (err?.error !== "no-speech" && err?.error !== "aborted") {
        // silently reset; the mic button returns to idle
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      // Strip any leftover interim marker so the field is clean after dictation ends.
      setInputText((prev) => prev.replace(/\s*\[interim:.*?\]\s*$/s, "").trim());
      setIsListening(false);
    };

    recognition.start();
  };

  // Stage B: Text to Speech (TTS) using Web Speech Synthesis
  const handleSpeakText = (textToSpeak: string) => {
    if (!window.speechSynthesis) {
      alert("Speech synthesis is not supported on this browser.");
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const cleanText = textToSpeak.replace(/[#*`_]/g, "").trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Choose appropriate locale voice
    utterance.lang = lang === "fr" ? "fr-FR" : "en-US";
    
    utterance.onend = () => {
      setIsSpeaking(false);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
    };

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const handleAISubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    setLoading(true);
    setResponse(null);

    try {
      const res = await fetch("/api/ai-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: inputText,
          task: activeTab,
          targetLang: activeTab === "translate" ? targetLang : undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setResponse(data.text);
      } else {
        setResponse(data.error || "Une erreur est survenue.");
      }
    } catch (err) {
      console.error(err);
      setResponse("Impossible de contacter le guide communautaire. Vérifiez votre connexion.");
    } finally {
      setLoading(false);
    }
  };

  // Simulated phonetic readout for local dialects (Gbaya, Makaa, Fulfulde)
  const playSimulatedAudio = (phraseText: string) => {
    setAudioPlaying(true);
    
    // Let's use synthesized phonetic speaking for the regional translation to give an immersive voice read!
    if (window.speechSynthesis) {
      const speechParts = phraseText.split(":");
      const targetPronunciation = speechParts[speechParts.length - 1].trim();
      const utterance = new SpeechSynthesisUtterance(targetPronunciation);
      utterance.lang = "fr-FR"; // read local dialect with a French-adjacent phonology
      utterance.rate = 0.85; // slower rate for learning
      utterance.onend = () => setAudioPlaying(false);
      utterance.onerror = () => setAudioPlaying(false);
      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(() => {
        setAudioPlaying(false);
      }, 2000);
    }
  };

  // Stage C: Offline Phrase-matching instant clicks
  const handleSelectPhrase = (phrase: typeof localPhrases[0]) => {
    const selectedDialectValue = phrase[targetLang as "Gbaya" | "Makaa" | "Fulfulde" | "fr" | "en"] || phrase.Gbaya;
    const sourceLabel = lang === "fr" ? phrase.fr : phrase.en;
    
    setResponse(`${sourceLabel} ➔ ${targetLang} : ${selectedDialectValue}`);
  };

  return (
    <div id="ai-guide-widget" className="bg-white/55 border border-[#E3A23D]/25 rounded-2xl p-6 shadow-xl overflow-hidden backdrop-blur-md">
      {/* AI availability banner: replaces the old silent failure where users typed, got no
          answer, and were left wondering why. Shown until the probe resolves, then only while
          the service is actually down. The offline phrasebook below still works without it. */}
      {aiAvailable === false && (
        <div className="mb-5 flex items-start gap-3 bg-amber-50 border border-amber-300 text-amber-900 text-sm rounded-xl px-4 py-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="font-bold">
              {lang === "fr" ? "IA temporairement hors ligne" : "AI temporarily offline"}
            </p>
            <p className="text-amber-800/80">
              {lang === "fr"
                ? "Le service de génération IA n'est pas configuré sur ce serveur (GEMINI_API_KEY manquant). Vous pouvez quand même utiliser le traducteur de phrases locales ci-dessous."
                : "The AI generation service is not configured on this server (missing GEMINI_API_KEY). You can still use the local phrase translator below."}
            </p>
          </div>
        </div>
      )}
      {aiAvailable === null && (
        <div className="mb-5 flex items-center gap-2 text-xs text-amber-700/70">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {lang === "fr" ? "Vérification de la disponibilité de l'IA..." : "Checking AI availability..."}
        </div>
      )}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-amber-600 overflow-hidden shrink-0 shadow-sm border border-amber-500">
            <img
              src={brandLogo}
              alt="AI Guide Logo"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <h3 className="font-semibold text-amber-950 flex items-center gap-2">
              {t.title}
              <span className="inline-flex items-center gap-1 text-[10px] bg-amber-200/60 text-amber-900 px-2 py-0.5 rounded-full font-medium">
                <Sparkles className="w-3 h-3 text-amber-700 animate-pulse" />
                AI Guide
              </span>
            </h3>
            <p className="text-xs text-amber-800/80 mt-0.5">{t.subtitle}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap bg-amber-100/50 p-1 rounded-xl gap-1 mb-5">
        {(["chat", "translate", "polish", "pricing", "video"] as const).map((tab) => {
          const icons = {
            chat: MessageSquare,
            translate: Languages,
            polish: FileText,
            pricing: Landmark,
            video: Video,
          };
          const Icon = icons[tab];
          return (
            <button
              key={tab}
              id={`tab-ai-${tab}`}
              onClick={() => {
                setActiveTab(tab);
                setInputText("");
                setResponse(null);
              }}
              className={`flex-initial sm:flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-all duration-150 hover:scale-[1.03] active:scale-[0.97] cursor-pointer ${
                activeTab === tab
                  ? "bg-[#E3A23D] text-[#241611] shadow-sm"
                  : "text-amber-800 hover:bg-amber-200/40"
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{t.tabs[tab]}</span>
            </button>
          );
        })}
      </div>

      {/* Stage D: Post-Launch Video Guide Tab Overlay */}
      {activeTab === "video" ? (
        <div className="bg-amber-100/30 border border-amber-200 rounded-2xl p-6 text-center space-y-4">
          <div className="relative w-24 h-24 mx-auto bg-amber-950/10 rounded-full flex items-center justify-center">
            <VideoOff className="w-10 h-10 text-amber-800" />
            <span className="absolute -top-1 -right-1 bg-amber-600 text-[8px] font-black uppercase text-white px-1.5 py-0.5 rounded-full">
              Soon
            </span>
          </div>
          <div className="space-y-1.5">
            <h4 className="text-sm font-bold text-amber-950">{t.videoTitle}</h4>
            <p className="text-xs text-amber-800 font-medium">{t.videoSubtitle}</p>
            <p className="text-xs text-amber-900/80 leading-relaxed font-serif max-w-sm mx-auto">
              {t.videoDesc}
            </p>
          </div>
          <button
            disabled
            className="px-5 py-2 bg-amber-900/20 text-amber-950/50 rounded-xl text-xs font-bold border border-amber-950/10 cursor-not-allowed"
          >
            {t.startVideo}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Stateful chat thread (memory + continuity) — shown only on the Chat tab */}
          {activeTab === "chat" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-950 flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5 text-amber-700" />
                  {lang === "fr" ? "Conversation" : "Conversation"}
                  {chatMessages.length > 0 && (
                    <span className="ml-1 text-[10px] font-medium text-amber-800/60">
                      ({chatMessages.filter((m) => m.role === "user").length})
                    </span>
                  )}
                </span>
                {chatMessages.length > 0 && (
                  <button
                    type="button"
                    onClick={handleChatReset}
                    disabled={chatLoading}
                    className="text-[10px] font-semibold text-amber-700 hover:text-amber-950 disabled:opacity-40 cursor-pointer px-2 py-1 rounded-md hover:bg-amber-100/60 transition-colors"
                  >
                    {lang === "fr" ? "Nouvelle discussion" : "New chat"}
                  </button>
                )}
              </div>

              <div className="h-[360px] overflow-y-auto space-y-3 pr-1 bg-gradient-to-b from-amber-50/40 to-white border border-amber-100 rounded-2xl p-3.5 scrollbar-thin">
                {chatMessages.length === 0 && (
                  <div className="flex flex-col items-center text-center py-10 px-4 gap-3">
                    <div className="w-14 h-14 rounded-full bg-amber-600 overflow-hidden shadow-md border border-amber-500">
                      <img src={brandLogo} alt="Assistant" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-amber-950">
                        {lang === "fr" ? "Bonjour ! Je suis votre assistant One Village" : "Hi! I'm your One Village assistant"}
                      </p>
                      <p className="text-xs text-amber-800/70 mt-1">
                        {lang === "fr"
                          ? "Posez une question sur les services à Bertoua. Je me souviendrai de notre conversation."
                          : "Ask about services in Bertoua. I'll remember our conversation."}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-1.5 max-w-sm">
                      {quickReplies.map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => { setInputText(q); }}
                          className="text-[11px] font-medium bg-white border border-amber-200 text-amber-900 px-3 py-1.5 rounded-full hover:bg-amber-100/60 transition-colors cursor-pointer"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {chatMessages.map((m, i) => {
                  const isUser = m.role === "user";
                  const isLastAssistant = !isUser && i === chatMessages.length - 1;
                  const showTyping = isLastAssistant && m.content === "" && streaming;
                  return (
                    <div key={i} className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"} animate-fade-in`}>
                      {!isUser && (
                        <div className="w-7 h-7 rounded-full bg-amber-600 overflow-hidden shrink-0 mt-0.5 border border-amber-500">
                          <img src={brandLogo} alt="" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className={`max-w-[78%] ${isUser ? "items-end" : "items-start"} flex flex-col`}>
                        <div
                          className={`px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed shadow-sm ${
                            isUser
                              ? "bg-[#E3A23D] text-[#241611] rounded-tr-sm"
                              : "bg-white text-amber-950 border border-amber-100 rounded-tl-sm"
                          }`}
                        >
                          {showTyping ? (
                            <div className="flex items-center gap-1.5 py-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "120ms" }} />
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "240ms" }} />
                            </div>
                          ) : isUser ? (
                            <span className="whitespace-pre-line">{m.content}</span>
                          ) : (
                            <span className="whitespace-pre-wrap" dangerouslySetInnerHTML={renderRich(m.content)} />
                          )}
                        </div>
                        {!isUser && !showTyping && m.content && (
                          <div className="flex items-center gap-2 mt-1 px-1">
                            <button
                              type="button"
                              onClick={() => speakMessage(m.content)}
                              className="text-amber-600 hover:text-amber-900 transition-colors cursor-pointer"
                              title={lang === "fr" ? "Lire à voix haute" : "Read aloud"}
                            >
                              <Volume2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => navigator.clipboard?.writeText(m.content)}
                              className="text-amber-600 hover:text-amber-900 transition-colors cursor-pointer"
                              title={lang === "fr" ? "Copier" : "Copy"}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            {m.ts && (
                              <span className="text-[9px] text-amber-700/50">
                                {new Date(m.ts).toLocaleTimeString(lang === "fr" ? "fr-FR" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      {isUser && (
                        <div className="w-7 h-7 rounded-full bg-amber-200 flex items-center justify-center shrink-0 mt-0.5">
                          <User className="w-4 h-4 text-amber-800" />
                        </div>
                      )}
                    </div>
                  );
                })}

                {visionLoading && (
                  <div className="flex gap-2 justify-start">
                    <div className="w-7 h-7 rounded-full bg-amber-600 overflow-hidden shrink-0 border border-amber-500">
                      <img src={brandLogo} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="bg-white border border-amber-100 rounded-2xl rounded-tl-sm px-3.5 py-2.5 flex items-center gap-2 text-xs text-amber-700">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {lang === "fr" ? "Analyse de l'image..." : "Analyzing image..."}
                    </div>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>
            </div>
          )}

          {activeTab === "translate" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 bg-amber-100/40 p-3 rounded-xl border border-amber-200/30">
                <span className="text-[11px] font-bold text-amber-950 flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-amber-700" />
                  Langue :
                </span>
                <div className="flex flex-wrap gap-1">
                  {["Gbaya", "Makaa", "Fulfulde", "Français", "English"].map((langName) => (
                    <button
                      type="button"
                      key={langName}
                      onClick={() => setTargetLang(langName)}
                      className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold transition-colors ${
                        targetLang === langName
                          ? "bg-amber-700 text-white"
                          : "bg-white text-amber-900 border border-amber-200/80 hover:bg-amber-50"
                      }`}
                    >
                      {langName}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stage C: Offline matching phrase helper box */}
              {["Gbaya", "Makaa", "Fulfulde"].includes(targetLang) && (
                <div className="bg-amber-50/50 border border-amber-200/30 p-3 rounded-xl space-y-2">
                  <p className="text-[10px] font-bold text-amber-950 flex items-center gap-1">
                    <HelpCircle className="w-3 h-3 text-amber-700" />
                    {t.offlinePhrasesTitle}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {localPhrases.map((phrase, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSelectPhrase(phrase)}
                        className="bg-white border border-amber-200/50 text-[10px] px-2.5 py-1 rounded-lg text-amber-900 hover:bg-amber-100/40 transition-colors font-medium cursor-pointer"
                      >
                        {lang === "fr" ? phrase.fr : phrase.en}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Prompt Entry & STT Micro option */}
          <form
            onSubmit={(e) => {
              if (activeTab === "chat") {
                handleChatSend(e);
              } else {
                handleAISubmit(e);
              }
            }}
            className="space-y-4"
          >
            <div className="relative">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends on the chat tab (Shift+Enter = newline); other tabs keep default.
                  if (activeTab === "chat" && e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleChatSend(e as any);
                  }
                }}
                placeholder={
                  activeTab === "chat"
                    ? t.chatPlaceholder
                    : activeTab === "translate"
                    ? t.translatePlaceholder
                    : activeTab === "polish"
                    ? t.polishPlaceholder
                    : t.pricingPlaceholder
                }
                className="w-full min-h-[90px] max-h-[160px] bg-white border border-amber-200 rounded-xl p-3.5 text-sm text-amber-950 placeholder-amber-900/40 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent transition-all pr-24"
              />

              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                {/* Image attach (chat tab only) → Gemini vision */}
                {activeTab === "chat" && (
                  <>
                    <input
                      ref={chatFileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImagePick}
                    />
                    <button
                      type="button"
                      onClick={() => chatFileRef.current?.click()}
                      disabled={visionLoading || chatLoading}
                      title={lang === "fr" ? "Joindre une image" : "Attach image"}
                      className="p-2 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 disabled:opacity-40 transition-all cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                    </button>
                  </>
                )}
                {/* Stage B Pulse Microphone Button */}
                <button
                  type="button"
                  onClick={handleStartListening}
                  title={t.listening}
                  className={`p-2 rounded-lg transition-all ${
                    isListening
                      ? "bg-rose-600 text-white animate-pulse"
                      : "bg-amber-100 hover:bg-amber-200 text-amber-900"
                  }`}
                >
                  {isListening ? (
                    <MicOff className="w-4 h-4" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </button>

                <button
                  type="submit"
                  disabled={(activeTab === "chat" ? chatLoading : loading) || !inputText.trim()}
                  id="btn-ai-submit"
                  className="p-2 bg-[#E3A23D] hover:bg-[#F2B355] text-[#241611] rounded-lg disabled:opacity-45 transition-all duration-150 hover:scale-105 active:scale-95 cursor-pointer"
                >
                  {(activeTab === "chat" ? chatLoading : loading) ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Response Box (single-shot tools only — the Chat tab renders its own thread) */}
      {(loading || response) && activeTab !== "video" && activeTab !== "chat" && (
        <div className="mt-5 bg-white border border-amber-100 rounded-2xl p-4 shadow-inner space-y-3">
          {loading ? (
            <div className="flex items-center gap-2.5 text-xs text-amber-800 py-4">
              <Loader2 className="w-4 h-4 animate-spin text-amber-700" />
              <span>{t.thinking}</span>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm text-amber-950 leading-relaxed whitespace-pre-line font-serif italic">
                {response}
              </div>

              {/* Action utilities depending on tab */}
              <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-amber-50">
                {/* Dialect Audio phonetic speech */}
                {response && response.includes("➔") && (
                  <button
                    onClick={() => playSimulatedAudio(response)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      audioPlaying
                        ? "bg-emerald-500 text-white"
                        : "bg-amber-100 hover:bg-amber-200/70 text-amber-900"
                    }`}
                  >
                    <Volume2 className={`w-3.5 h-3.5 ${audioPlaying ? "animate-bounce" : ""}`} />
                    {audioPlaying ? "Audio..." : t.audioPrompt}
                  </button>
                )}

                {/* French/English Device Speech Reader (TTS) */}
                {response && !response.includes("➔") && (
                  <button
                    onClick={() => handleSpeakText(response)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isSpeaking
                        ? "bg-rose-600 text-white"
                        : "bg-amber-100 hover:bg-amber-200/70 text-amber-900"
                    }`}
                  >
                    {isSpeaking ? (
                      <>
                        <VolumeX className="w-3.5 h-3.5" />
                        {t.stopSpeech}
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3.5 h-3.5" />
                        {t.speakResponse}
                      </>
                    )}
                  </button>
                )}

                {activeTab === "polish" && onApplyPolishedDescription && (
                  <button
                    onClick={() => {
                      if (response) {
                        const cleanText = response.replace(/Titre:.*?\n/i, "").replace(/Description:.*?\n/i, "").trim();
                        onApplyPolishedDescription(cleanText);
                      }
                    }}
                    className="bg-[#E3A23D] hover:bg-[#F2B355] text-[#241611] flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 hover:scale-105 active:scale-95 shadow-sm"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    {t.applyBtn}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
