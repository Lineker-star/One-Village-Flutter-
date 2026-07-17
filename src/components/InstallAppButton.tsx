/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Download, Share, X } from "lucide-react";
import { usePwaInstall } from "../hooks/usePwaInstall.ts";

interface InstallAppButtonProps {
  lang: "fr" | "en";
  // "hero": prominent standalone CTA (landing page, next to "Commencer").
  // "compact": small header/nav-bar button.
  // "banner": dismissible full-width strip (browse/home page).
  variant: "hero" | "compact" | "banner";
}

export default function InstallAppButton({ lang, variant }: InstallAppButtonProps) {
  const { canInstall, isIOS, promptInstall } = usePwaInstall();
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Neither a real install prompt available nor iOS's manual flow applies (e.g. desktop Firefox,
  // or the browser doesn't support installable PWAs at all) — hide gracefully, no broken button.
  if ((!canInstall && !isIOS) || dismissed) return null;

  const handleClick = () => {
    if (canInstall) {
      promptInstall();
    } else if (isIOS) {
      setShowIOSHelp(true);
    }
  };

  const label = lang === "fr" ? "Installer l'application" : "Install App";

  const iosInstructions =
    lang === "fr"
      ? "Appuyez sur l'icône de partage Safari, puis « Sur l'écran d'accueil »."
      : "Tap the Safari share icon, then \"Add to Home Screen\".";

  if (variant === "hero") {
    return (
      <div className="relative">
        <button
          onClick={handleClick}
          className="bg-white/95 hover:bg-white text-[#241611] font-black text-sm px-6 py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg w-full sm:w-auto"
        >
          <Download className="w-4.5 h-4.5" />
          {label}
        </button>
        {showIOSHelp && (
          <div className="absolute top-full left-0 mt-2 w-72 bg-white border border-amber-200 rounded-2xl shadow-xl p-4 z-20 text-left">
            <button
              onClick={() => setShowIOSHelp(false)}
              className="absolute top-2 right-2 p-1 text-amber-800/60 hover:text-amber-950 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <p className="text-xs text-amber-900 font-serif flex items-start gap-2">
              <Share className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              {iosInstructions}
            </p>
          </div>
        )}
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className="relative">
        <button
          onClick={handleClick}
          title={label}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-amber-900 hover:bg-amber-100/60 transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span className="hidden md:inline">{label}</span>
        </button>
        {showIOSHelp && (
          <div className="absolute top-full right-0 mt-2 w-72 bg-white border border-amber-200 rounded-2xl shadow-xl p-4 z-20 text-left">
            <button
              onClick={() => setShowIOSHelp(false)}
              className="absolute top-2 right-2 p-1 text-amber-800/60 hover:text-amber-950 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <p className="text-xs text-amber-900 font-serif flex items-start gap-2">
              <Share className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              {iosInstructions}
            </p>
          </div>
        )}
      </div>
    );
  }

  // "banner"
  return (
    <div className="bg-[#245C46] text-white rounded-2xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold">
        <Download className="w-4 h-4 shrink-0" />
        <span>
          {lang === "fr"
            ? "Installez One Village sur votre appareil pour un accès plus rapide."
            : "Install One Village on your device for faster access."}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleClick}
          className="bg-[#E3A23D] hover:bg-[#F2B355] text-[#241611] font-black text-xs px-4 py-2 rounded-xl transition-colors cursor-pointer"
        >
          {label}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="p-2 text-white/70 hover:text-white transition-colors cursor-pointer"
          aria-label={lang === "fr" ? "Fermer" : "Dismiss"}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {showIOSHelp && (
        <div className="w-full bg-white/10 rounded-xl p-3 flex items-start gap-2 text-xs">
          <Share className="w-4 h-4 shrink-0 mt-0.5" />
          {iosInstructions}
        </div>
      )}
    </div>
  );
}
