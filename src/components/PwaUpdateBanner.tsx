/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { RefreshCw, X } from "lucide-react";
import { usePwaUpdate } from "../hooks/usePwaUpdate.ts";

interface PwaUpdateBannerProps {
  lang: "fr" | "en";
}

// Mounted once near the app root. Renders nothing until a new deployment's service worker has
// actually been detected in the background (needRefresh) — this is what keeps an installed PWA in
// sync with whatever is currently live on Render, since there's no app-store build to update.
export default function PwaUpdateBanner({ lang }: PwaUpdateBannerProps) {
  const { needRefresh, dismiss, applyUpdate } = usePwaUpdate();

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:left-auto z-[100] max-w-sm bg-[#241611] text-white rounded-2xl shadow-2xl p-4 flex items-center gap-3 animate-fade-in">
      <RefreshCw className="w-5 h-5 text-[#F2B355] shrink-0" />
      <p className="text-xs font-bold flex-1">
        {lang === "fr"
          ? "Une nouvelle version de One Village est disponible."
          : "A new version of One Village is available."}
      </p>
      <button
        onClick={applyUpdate}
        className="bg-[#E3A23D] hover:bg-[#F2B355] text-[#241611] font-black text-xs px-3 py-2 rounded-xl transition-colors cursor-pointer shrink-0"
      >
        {lang === "fr" ? "Actualiser" : "Refresh"}
      </button>
      <button
        onClick={dismiss}
        className="p-1 text-white/60 hover:text-white transition-colors cursor-pointer shrink-0"
        aria-label={lang === "fr" ? "Fermer" : "Dismiss"}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
