/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from "react";
import { requestBackgroundSync } from "../lib/backgroundSync.ts";

export interface AppLifecycleState {
  /** navigator.onLine — is there network connectivity? */
  isOnline: boolean;
  /** document.visibilityState === "visible" — is the app in the foreground? */
  isVisible: boolean;
  /** True once the app has been hidden at least once this session (BFCache/background resume). */
  wasSuspended: boolean;
}

/**
 * Centralized app lifecycle handling for a mobile-first PWA.
 *
 * Consolidates the four lifecycle signals a mobile framework must track:
 *   - online / offline        (connectivity changes)
 *   - visibilitychange        (foreground / background, tab switching)
 *   - pageshow / pagehide     (BFCache enter/leave — critical on iOS Safari back-navigation)
 *   - freeze / resume         (Page Lifecycle API — Chrome Android app switching)
 *
 * On a transition from offline -> online it best-effort registers a Background Sync tag so queued
 * work can drain. On resume it re-syncs connectivity state (the OS can change it while suspended).
 * All listeners are cleaned up on unmount; safe to call once at the app root.
 */
export function useAppLifecycle(): AppLifecycleState {
  const [isOnline, setIsOnline] = useState<boolean>(() => (typeof navigator !== "undefined" ? navigator.onLine : true));
  const [isVisible, setIsVisible] = useState<boolean>(() => (typeof document !== "undefined" ? document.visibilityState === "visible" : true));
  const [wasSuspended, setWasSuspended] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      setIsOnline(true);
      // Drain any queued offline work via Background Sync (best-effort; no-op if unsupported).
      requestBackgroundSync("ov-sync");
      window.dispatchEvent(new CustomEvent("ov:online"));
    };
    const handleOffline = () => {
      setIsOnline(false);
      window.dispatchEvent(new CustomEvent("ov:offline"));
    };
    const handleVisibility = () => {
      const visible = document.visibilityState === "visible";
      setIsVisible(visible);
      if (!visible) setWasSuspended(true);
      if (visible) {
        // Re-read connectivity (the OS may have changed it while backgrounded).
        setIsOnline(navigator.onLine);
        window.dispatchEvent(new CustomEvent("ov:resumed"));
      }
    };
    const handlePageShow = (e: PageTransitionEvent) => {
      // BFCache restore (iOS back-forward). Treat as a resume.
      if (e.persisted) {
        setIsVisible(true);
        setIsOnline(navigator.onLine);
        setWasSuspended(true);
        window.dispatchEvent(new CustomEvent("ov:resumed"));
      }
    };
    const handlePageHide = () => {
      setWasSuspended(true);
    };
    const handleFreeze = () => setWasSuspended(true);
    const handleResume = () => {
      setIsVisible(true);
      setIsOnline(navigator.onLine);
      window.dispatchEvent(new CustomEvent("ov:resumed"));
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("pagehide", handlePageHide);
    // Page Lifecycle API (not universally supported; guarded by property existence).
    document.addEventListener("freeze" as any, handleFreeze);
    document.addEventListener("resume" as any, handleResume);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("freeze" as any, handleFreeze);
      document.removeEventListener("resume" as any, handleResume);
    };
  }, []);

  return { isOnline, isVisible, wasSuspended };
}