/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { isMedianApp } from "./platform.ts";
import { fromNotificationData, navigateToIntent, type DeepLinkIntent } from "./deepLinks.ts";

// Scalable push notification manager.
//
// Two delivery paths, auto-selected by runtime:
//   1. PWA / Web Push (browser, installable PWA): uses the Notifications API +
//      Service Worker PushManager. When a VAPID public key is configured
//      (VITE_VAPID_PUBLIC_KEY, generated server-side from FCM/GCM), the browser returns a
//      PushSubscription that we POST to our backend (/api/push/subscribe) so the server (or FCM)
//      can target this device. When no VAPID key is set we still request permission and can show
//      local notifications, but cannot receive remote pushes — everything degrades gracefully.
//   2. Median-wrapped native app (existing OneSignal bridge): unchanged, delegates to
//      window.median.onesignal.* and the OS permission prompt.
//
// Notification taps are normalized through deepLinks.ts so a push, a universal link, a QR code
// and a shared URL all route identically.

declare global {
  interface Window {
    median_onesignal_push_opened?: (data: Record<string, any>) => void;
    webkit?: any;
  }
  interface Navigator {
    // Safari iOS standalone detection for PWA install hints (not required, informational).
    standalone?: boolean;
  }
}

const VAPID_KEY: string | undefined =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY) || undefined;

/** True when the current runtime can receive push notifications at all. */
export function isPushSupported(): boolean {
  if (isMedianApp()) return true;
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

/** Current permission state (browser only). */
export function getPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

let swRegistration: ServiceWorkerRegistration | null = null;

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  if (swRegistration) return swRegistration;
  try {
    // vite-plugin-pwa registers /sw.js itself; getRegistration returns the active one.
    swRegistration = (await navigator.serviceWorker.getRegistration("/")) || (await navigator.serviceWorker.ready);
    return swRegistration;
  } catch (err) {
    console.warn("[push] service worker not ready:", err);
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Persists a Web Push subscription to our backend so the server / FCM can target this device. */
async function persistSubscription(sub: PushSubscription, userId?: string | null): Promise<void> {
  try {
    const json = sub.toJSON();
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: json.keys,
        userId: userId || null,
        userAgent: navigator.userAgent,
      }),
    });
  } catch (err) {
    console.warn("[push] failed to persist subscription:", err);
  }
}

/**
 * Requests OS-level push permission and, on the PWA path, establishes a Web Push subscription
 * (when a VAPID key is configured) and registers the subscription with the backend. Call once per
 * device — ideally right after a user gesture (sign-in, first booking, etc.).
 */
export async function requestPushPermission(userId?: string | null): Promise<boolean> {
  // Native (Median) path.
  if (isMedianApp()) {
    try {
      window.median?.onesignal?.userPrivacyConsent?.grant();
      window.median?.onesignal?.register();
      return true;
    } catch (err) {
      console.error("[push] Median permission request failed:", err);
      return false;
    }
  }

  // PWA / Web Push path.
  if (!isPushSupported()) return false;
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return false;

    const reg = await ensureServiceWorker();
    if (reg && "pushManager" in reg) {
      // Reuse an existing subscription if present.
      let sub = await reg.pushManager.getSubscription();
      if (!sub && VAPID_KEY) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
        });
      }
      if (sub) {
        await persistSubscription(sub, userId);
        return true;
      }
    }
    // Permission granted but no remote subscription (e.g. no VAPID key) — still a success for
    // local notifications.
    return true;
  } catch (err) {
    console.warn("[push] Web Push setup failed:", err);
    return false;
  }
}

/** Associates the current device with this user id for targeted sends. */
export function loginPushUser(userId: string): void {
  if (isMedianApp()) {
    try { window.median?.onesignal?.login(userId); } catch (err) { console.error("[push] login failed:", err); }
    return;
  }
  // PWA: re-persist the current subscription bound to this user id.
  try {
    const reg = swRegistration;
    if (reg && "pushManager" in reg) {
      reg.pushManager.getSubscription().then((sub) => { if (sub) persistSubscription(sub, userId); });
    }
  } catch { /* ignore */ }
}

/** Disassociates the device from any user id. */
export function logoutPushUser(): void {
  if (isMedianApp()) {
    try { window.median?.onesignal?.logout(); } catch (err) { console.error("[push] logout failed:", err); }
  }
  // PWA: nothing to tear down for privacy beyond the in-memory binding; the subscription is
  // re-bound on next login. (A stricter build could DELETE /api/push/subscribe here.)
}

/**
 * Registers the notification-tap / message handler. `onDeepLink` receives a normalized
 * DeepLinkIntent; this module routes it via deepLinks.navigateToIntent(). For the PWA path we also
 * listen for messages posted by the service worker when a push arrives while the app is open.
 */
export function registerPushTapHandler(onDeepLink?: (intent: DeepLinkIntent, data: Record<string, any>) => void): void {
  // Native (Median): the OS bridge calls this exact global by name when a notification is tapped.
  if (isMedianApp()) {
    window.median_onesignal_push_opened = (data) => {
      try {
        const intent = fromNotificationData(data || {}) || undefined;
        if (onDeepLink && intent) onDeepLink(intent, data || {});
        else if (intent) navigateToIntent(intent);
      } catch (err) {
        console.error("[push] tap handler failed:", err);
      }
    };
    return;
  }

  // PWA: service worker -> client messages (push received while app is foreground/open).
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      const data = event.data || {};
      // Only react to push notifications (the SW can also post other messages, e.g. update prompts).
      if (data.type === "push" || data.notification) {
        const payload = data.data || data.payload || data;
        const intent = fromNotificationData(payload) || undefined;
        if (onDeepLink && intent) onDeepLink(intent, payload);
      }
    });
  }
}

/** Shows a local notification (fallback when remote push isn't wired up). */
export async function showLocalNotification(title: string, options?: NotificationOptions): Promise<void> {
  if (getPermission() !== "granted") return;
  try {
    const reg = await ensureServiceWorker();
    if (reg?.showNotification) await reg.showNotification(title, { icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", ...options });
    else new Notification(title, { icon: "/icons/icon-192.png", ...options });
  } catch (err) {
    console.warn("[push] local notification failed:", err);
  }
}