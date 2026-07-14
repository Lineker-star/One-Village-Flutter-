/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
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
  HelpCircle 
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

  // Speech Recognition & Synthesis States (Phase 8 - Stage B)
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const t = {
    fr: {
      title: "Conseiller One Village AI",
      subtitle: "Tonton l'Est — Sagesse, Traduction & Tarifs de l'Est du Cameroun",
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
      thinking: "Sagesse en cours de réflexion...",
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
      title: "One Village AI Guide",
      subtitle: "Tonton l'Est — Wisdom, Translation & Pricing for Eastern Cameroon",
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
      thinking: "Tonton l'Est is reflecting...",
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
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInputText((prev) => prev + (prev ? " " : "") + transcript);
    };

    recognition.onerror = (err: any) => {
      console.error("Speech recognition error:", err);
      setIsListening(false);
    };

    recognition.onend = () => {
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
    <div id="ai-guide-widget" className="bg-amber-50/70 border border-amber-200/60 rounded-2xl p-6 shadow-sm overflow-hidden backdrop-blur-sm">
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
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === tab
                  ? "bg-amber-800 text-white shadow-sm"
                  : "text-amber-800 hover:bg-amber-200/40"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
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
          {activeTab === "translate" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 bg-amber-100/40 p-3 rounded-xl border border-amber-200/30">
                <span className="text-[11px] font-bold text-amber-950 flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-amber-700" />
                  Langue :
                </span>
                <div className="flex gap-1">
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
          <form onSubmit={handleAISubmit} className="space-y-4">
            <div className="relative">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
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
                  disabled={loading || !inputText.trim()}
                  id="btn-ai-submit"
                  className="p-2 bg-amber-800 hover:bg-amber-900 text-white rounded-lg disabled:opacity-45 disabled:hover:bg-amber-800 transition-colors cursor-pointer"
                >
                  {loading ? (
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

      {/* Response Box */}
      {(loading || response) && activeTab !== "video" && (
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
                    className="bg-amber-800 hover:bg-amber-900 text-white flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shadow-sm"
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
