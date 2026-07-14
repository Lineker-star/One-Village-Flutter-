/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { ServiceProvider, ChatMessage } from "../types.ts";
import { 
  Send, 
  ArrowLeft, 
  Loader2, 
  Image, 
  Mic, 
  Square, 
  Play, 
  Pause, 
  Check, 
  CheckCheck, 
  X, 
  Phone, 
  MessageCircle,
  Clock,
  Compass
} from "lucide-react";
import { CATEGORY_DETAILS } from "../data/bertouaData.ts";

interface ChatInterfaceProps {
  provider: ServiceProvider;
  lang: "fr" | "en";
  onBack: () => void;
}

export default function ChatInterface({ provider, lang, onBack }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedAudio, setRecordedAudio] = useState<string | null>(null);
  const [activeAudioPlayingId, setActiveAudioPlayingId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);
  const audioPlayersRef = useRef<Record<string, HTMLAudioElement>>({});

  const cat = CATEGORY_DETAILS[provider.category];

  const t = {
    fr: {
      placeholder: "Écrivez votre message à...",
      online: "En ligne",
      typing: "est en train d'écrire...",
      whatsappBanner: "Préférer WhatsApp ? Échangez directement avec le prestataire en un clic.",
      whatsappBtn: "Continuer sur WhatsApp",
      recording: "Enregistrement en cours...",
      cancel: "Annuler",
      imagePreview: "Image sélectionnée",
      sendImage: "Envoyer l'image",
      audioMessage: "Message vocal",
      sending: "Envoi..."
    },
    en: {
      placeholder: "Write your message to...",
      online: "Online",
      typing: "is typing...",
      whatsappBanner: "Prefer WhatsApp? Chat directly with the provider in one click.",
      whatsappBtn: "Continue on WhatsApp",
      recording: "Recording voice...",
      cancel: "Cancel",
      imagePreview: "Selected Image",
      sendImage: "Send Image",
      audioMessage: "Voice message",
      sending: "Sending..."
    }
  }[lang];

  // WhatsApp link preparation
  const prefilledGreeting = {
    fr: `Bonjour ${provider.name}, je vous contacte depuis la plateforme One Village concernant vos services de ${cat?.nameFR || "prestataire"}.`,
    en: `Hello ${provider.name}, I am contacting you from the One Village platform regarding your ${cat?.nameEN || "provider"} services.`
  }[lang];

  const whatsappUrl = `https://wa.me/${(provider.whatsappNumber || provider.phone).replace(/[\s+]/g, "")}?text=${encodeURIComponent(prefilledGreeting)}`;

  // Fetch chat history
  const fetchChats = async () => {
    try {
      const res = await fetch(`/api/chats/${provider.id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchChats();
    const interval = setInterval(fetchChats, 3500); // Poll every 3.5s for real-time Postgres feel
    return () => {
      clearInterval(interval);
      // Clean up audio players
      const players = Object.values(audioPlayersRef.current) as HTMLAudioElement[];
      players.forEach((p) => p.pause());
    };
  }, [provider.id]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing, selectedImage, isRecording]);

  // Audio recording timer helper
  useEffect(() => {
    if (isRecording) {
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      setRecordingSeconds(0);
    }
    return () => clearInterval(recordingTimerRef.current);
  }, [isRecording]);

  // Format seconds to mm:ss
  const formatTime = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Handle Image input selection
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event: any) => {
      setSelectedImage(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  // Start actual Voice recording
  const startRecording = async () => {
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = () => {
          setRecordedAudio(reader.result as string);
        };
        reader.readAsDataURL(audioBlob);

        // Turn off microphone streams
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.warn("MediaRecorder not fully supported, fallback to beautiful simulated voice track:", err);
      // Fallback beautiful simulation if permissions or media recorder fails inside iframe
      setIsRecording(true);
      setTimeout(() => {
        setRecordedAudio("simulated_voice_message_base64_data");
      }, 100);
    }
  };

  // Stop recording and trigger sending
  const stopRecording = (sendDirectly: boolean) => {
    if (!isRecording) return;
    setIsRecording(false);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }

    if (!sendDirectly) {
      setRecordedAudio(null);
    }
  };

  // Send voice message automatically after stop if captured
  useEffect(() => {
    if (recordedAudio) {
      sendVoiceMessage(recordedAudio);
      setRecordedAudio(null);
    }
  }, [recordedAudio]);

  const sendVoiceMessage = async (audioBase64: string) => {
    setLoading(true);
    setTyping(true);

    const tempUserMsg: ChatMessage = {
      id: `temp_audio_${Date.now()}`,
      sender: "customer",
      text: "[Message Vocal / Voice Note]",
      audioUrl: audioBase64,
      status: "sent",
      createdAt: new Date().toISOString()
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch(`/api/chats/${provider.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl: audioBase64 }),
      });

      if (res.ok) {
        setTyping(false);
        fetchChats();
      }
    } catch (err) {
      console.error(err);
      setTyping(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputText.trim() && !selectedImage) || loading) return;

    const textToSend = inputText;
    const imageToSend = selectedImage;

    setInputText("");
    setSelectedImage(null);
    setLoading(true);
    setTyping(true);

    // Optimistically append client message locally with "sent" receipt
    const tempUserMsg: ChatMessage = {
      id: `temp_${Date.now()}`,
      sender: "customer",
      text: textToSend,
      imageUrl: imageToSend || undefined,
      status: "sent",
      createdAt: new Date().toISOString()
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch(`/api/chats/${provider.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          text: textToSend,
          imageUrl: imageToSend || undefined
        }),
      });

      if (res.ok) {
        setTyping(false);
        fetchChats();
      }
    } catch (err) {
      console.error(err);
      setTyping(false);
    } finally {
      setLoading(false);
    }
  };

  // Play/pause voice notes locally
  const togglePlayAudio = (msgId: string, audioUrl?: string) => {
    if (!audioUrl) return;

    // If currently playing different audio, stop it
    if (activeAudioPlayingId && activeAudioPlayingId !== msgId) {
      const current = audioPlayersRef.current[activeAudioPlayingId];
      if (current) {
        current.pause();
        current.currentTime = 0;
      }
    }

    if (activeAudioPlayingId === msgId) {
      const player = audioPlayersRef.current[msgId];
      if (player) {
        player.pause();
        setActiveAudioPlayingId(null);
      }
    } else {
      let player = audioPlayersRef.current[msgId];
      if (!player) {
        // If it's a simulated audio URL, create a mock standard tone player, else play real recording
        const src = audioUrl.startsWith("simulated") 
          ? "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" // valid fallback stream
          : audioUrl;
        player = new Audio(src);
        audioPlayersRef.current[msgId] = player;
        
        player.addEventListener("ended", () => {
          setActiveAudioPlayingId(null);
        });
      }
      
      player.play().catch((err) => console.log("Audio play error:", err));
      setActiveAudioPlayingId(msgId);
    }
  };

  return (
    <div id="chat-interface-container" className="bg-white border border-amber-200/60 rounded-3xl shadow-sm flex flex-col h-[580px] overflow-hidden">
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
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wide">{t.online}</span>
            </div>
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

      {/* Message Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#FAF9F6]/30">
        {messages.map((msg) => {
          const isCustomer = msg.sender === "customer";
          const isAudio = !!msg.audioUrl;
          const isImage = !!msg.imageUrl;

          return (
            <div
              key={msg.id}
              className={`flex flex-col max-w-[85%] ${isCustomer ? "ml-auto items-end" : "mr-auto items-start"} animate-fade-in`}
            >
              <div
                className={`p-3.5 rounded-2xl leading-relaxed text-sm shadow-xs ${
                  isCustomer
                    ? "bg-amber-900 text-white rounded-tr-none"
                    : "bg-white text-amber-950 rounded-tl-none border border-amber-100"
                }`}
              >
                {/* Image message */}
                {isImage && (
                  <div className="mb-2.5 rounded-xl overflow-hidden border border-amber-100/10 max-h-60 max-w-full">
                    <img 
                      src={msg.imageUrl} 
                      alt="Shared attachment" 
                      className="object-cover w-full h-full max-h-56 rounded-lg cursor-zoom-in hover:brightness-95 transition-all"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}

                {/* Voice Message Player */}
                {isAudio ? (
                  <div className="flex items-center gap-3.5 py-1 px-1.5 min-w-[200px]">
                    <button
                      onClick={() => togglePlayAudio(msg.id, msg.audioUrl)}
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                        isCustomer 
                          ? "bg-white text-amber-900 hover:bg-amber-50" 
                          : "bg-amber-800 text-white hover:bg-amber-900"
                      }`}
                    >
                      {activeAudioPlayingId === msg.id ? (
                        <Pause className="w-4 h-4 fill-current" />
                      ) : (
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      )}
                    </button>
                    <div className="flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider opacity-90 block">
                        {t.audioMessage}
                      </p>
                      {/* Interactive Visual Waveform bar representations */}
                      <div className="flex items-end gap-1 h-5 mt-1.5 opacity-90">
                        {[40, 60, 25, 75, 50, 85, 30, 65, 45, 90, 20].map((val, i) => (
                          <span 
                            key={i} 
                            className={`w-1 rounded-full ${isCustomer ? "bg-white" : "bg-amber-800"}`} 
                            style={{ 
                              height: activeAudioPlayingId === msg.id 
                                ? `${Math.sin(Date.now() / 150 + i) * 12 + 13}px` 
                                : `${val * 0.18 + 2}px`,
                              transition: activeAudioPlayingId === msg.id ? "none" : "height 0.3s"
                            }} 
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Standard text display */
                  <p className="font-sans whitespace-pre-line text-xs font-medium leading-relaxed">{msg.text}</p>
                )}
              </div>

              {/* Message metadata details - Timestamp and Read receipt receipts (Phase 6 requirement) */}
              <div className="flex items-center gap-1.5 mt-1 px-1 text-[9px] text-amber-800/60 font-mono">
                <span>
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                
                {/* Read receipts for customer messages */}
                {isCustomer && (
                  <span className="flex items-center text-emerald-600">
                    {msg.status === "read" ? (
                      <CheckCheck className="w-3.5 h-3.5 text-emerald-600" title="Lu / Read" />
                    ) : (
                      <Check className="w-3.5 h-3.5 text-amber-800/40" title="Envoyé / Sent" />
                    )}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {typing && (
          <div className="flex flex-col items-start mr-auto max-w-[85%] animate-fade-in">
            <div className="bg-white text-amber-950 border border-amber-100 p-3.5 rounded-2xl rounded-tl-none shadow-xs flex items-center gap-1.5 text-xs">
              <span className="w-1.5 h-1.5 bg-amber-600 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 bg-amber-600 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 bg-amber-600 rounded-full animate-bounce" />
              <span className="text-amber-800/70 ml-1.5 font-medium">{provider.name} {t.typing}</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Image selector thumbnail preview inside input bar */}
      {selectedImage && (
        <div className="px-4 py-2 border-t border-amber-100 bg-amber-50/50 flex items-center justify-between shrink-0 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl overflow-hidden border border-amber-200">
              <img src={selectedImage} alt="Thumbnail preview" className="object-cover w-full h-full" referrerPolicy="no-referrer" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 block">
                {t.imagePreview}
              </span>
              <span className="text-[11px] text-amber-900/70">ready_to_send.jpg</span>
            </div>
          </div>
          <button
            onClick={() => setSelectedImage(null)}
            className="p-1 hover:bg-amber-100 text-amber-900 rounded-full cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Interactive voice recorder banner status */}
      {isRecording && (
        <div className="px-5 py-3 border-t border-amber-100 bg-red-50 flex items-center justify-between shrink-0 animate-pulse">
          <div className="flex items-center gap-3 text-red-900 font-bold text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
            <span>{t.recording}</span>
            <span className="font-mono bg-red-100 px-2 py-0.5 rounded text-[10px]">{formatTime(recordingSeconds)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => stopRecording(false)}
              className="px-3 py-1.5 bg-white hover:bg-red-100 border border-red-200 text-red-800 font-bold rounded-lg text-[10px] uppercase cursor-pointer"
            >
              {t.cancel}
            </button>
            <button
              onClick={() => stopRecording(true)}
              className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg cursor-pointer flex items-center gap-1"
            >
              <Square className="w-4.5 h-4.5 fill-current" />
            </button>
          </div>
        </div>
      )}

      {/* Input bar controls */}
      <form onSubmit={handleSendMessage} className="p-3.5 border-t border-amber-100 flex items-center gap-2.5 bg-white shrink-0">
        
        {/* Attachment image selection */}
        <div className="relative">
          <input
            type="file"
            accept="image/*"
            id="chat-image-input"
            onChange={handleImageChange}
            className="hidden"
          />
          <label
            htmlFor="chat-image-input"
            className="p-3 bg-amber-50 hover:bg-amber-100 text-amber-950 rounded-xl transition-colors cursor-pointer border border-amber-200/40 flex items-center justify-center shadow-xs"
            title="Envoyer une photo"
          >
            <Image className="w-4.5 h-4.5 text-amber-800" />
          </label>
        </div>

        {/* Text Area Input */}
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          disabled={isRecording}
          placeholder={`${t.placeholder} ${provider.name}...`}
          className="flex-1 bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 placeholder-amber-900/35 focus:outline-none focus:ring-1.5 focus:ring-amber-700 disabled:opacity-50"
        />

        {/* Microphone action button for audio recording (Phase 6 feature) */}
        {!inputText.trim() && !selectedImage ? (
          <button
            type="button"
            onClick={isRecording ? () => stopRecording(true) : startRecording}
            className={`p-3 rounded-xl transition-all shadow-xs border flex items-center justify-center cursor-pointer ${
              isRecording 
                ? "bg-red-600 hover:bg-red-700 text-white border-red-500 animate-pulse" 
                : "bg-amber-50 hover:bg-amber-100 text-amber-950 border-amber-200/40"
            }`}
            title="Enregistrer un message vocal"
          >
            <Mic className="w-4.5 h-4.5" />
          </button>
        ) : (
          /* Send message submit */
          <button
            type="submit"
            disabled={loading}
            id="btn-send-msg"
            className="p-3 bg-amber-800 hover:bg-amber-900 disabled:opacity-40 text-white rounded-xl transition-all cursor-pointer shadow-sm flex items-center justify-center"
          >
            {loading ? (
              <Loader2 className="w-4.5 h-4.5 animate-spin" />
            ) : (
              <Send className="w-4.5 h-4.5" />
            )}
          </button>
        )}
      </form>
    </div>
  );
}
