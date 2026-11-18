/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useCallback } from "react";

// Not yet part of TypeScript's standard DOM lib — Chrome/Edge/Samsung Internet-specific.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isStandaloneDisplayMode(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's own (non-standard) flag for "launched from home screen".
    (window.navigator as any).standalone === true
  );
}

function detectIOS(): boolean {
  const ua = window.navigator.userAgent;
  const isIOSDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as "MacIntel" but still has touch support, unlike a real Mac.
  const isIPadOS = ua.includes("Macintosh") && navigator.maxTouchPoints > 1;
  return isIOSDevice || isIPadOS;
}

/**
 * Wraps the beforeinstallprompt flow (Chrome/Edge/Android) plus iOS Safari's manual
 * "Add to Home Screen" case, which never fires that event at all.
 */
export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(() => isStandaloneDisplayMode());
  const [isIOS] = useState(() => detectIOS());

  useEffect(() => {
    if (isInstalled) return;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [isInstalled]);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return outcome === "accepted";
  }, [deferredPrompt]);

  return {
    // True only on browsers that actually fired beforeinstallprompt (Chrome/Edge/Android/desktop) —
    // false on iOS Safari, which needs the manual instructions surfaced via `isIOS` instead.
    canInstall: !!deferredPrompt && !isInstalled,
    isInstalled,
    isIOS: isIOS && !isInstalled,
    promptInstall,
  };
}
