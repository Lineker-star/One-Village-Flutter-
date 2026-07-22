/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Median.co injects a `window.median` object (and a UA string containing "median"/"gonative")
// into the webview at runtime, on top of whatever real browser engine is rendering the page.
// Nothing here runs at build/SSR time — this is a plain Vite SPA, but `typeof window` guards are
// kept anyway since these functions are imported from modules that could in principle be evaluated
// outside a browser context (tests, etc.).

declare global {
  interface Window {
    median?: {
      onesignal?: {
        register: () => void;
        login: (externalId: string) => void;
        logout: () => void;
        userPrivacyConsent?: {
          grant: () => void;
          revoke: () => void;
        };
      };
      [key: string]: any;
    };
  }
}

/** True only inside the Median.co-wrapped Android build — never true for the regular web/PWA. */
export function isMedianApp(): boolean {
  if (typeof window === "undefined") return false;
  if (window.median) return true;
  const ua = window.navigator?.userAgent?.toLowerCase() || "";
  return ua.includes("median") || ua.includes("gonative");
}
