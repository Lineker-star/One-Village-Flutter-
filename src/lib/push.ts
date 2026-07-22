/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { isMedianApp } from "./platform.ts";

// Median's OneSignal bridge (verified against Median's current docs — docs.median.co/docs/
// push-registration-and-privacy-consent and .../programmatic-notifications):
//   - median.onesignal.userPrivacyConsent.grant()  — initializes OneSignal for this device.
//   - median.onesignal.register()                 — triggers the native OS permission prompt.
//   - median.onesignal.login(externalId)           — associates this device with OUR OWN user id
//     as OneSignal's "external_id", which is what server.ts's send route targets later via
//     `include_aliases.external_id` on OneSignal's REST API. There is no documented method to read
//     back a device/player token client-side, and none is needed with this targeting approach.
//   - median.onesignal.logout()                    — disassociates the device on sign-out, so a
//     shared/reused device doesn't keep receiving a previous user's targeted notifications.
// All four are no-ops (guarded by isMedianApp()) outside the Median-wrapped build.

/** Grants OneSignal consent and prompts for OS-level push permission. Call once per device. */
export function requestPushPermission(): void {
  if (!isMedianApp() || !window.median?.onesignal) return;
  try {
    window.median.onesignal.userPrivacyConsent?.grant();
    window.median.onesignal.register();
  } catch (err) {
    console.error("Median push permission request failed:", err);
  }
}

/** Associates the current device with this user id for targeted sends. Call after sign-in. */
export function loginPushUser(userId: string): void {
  if (!isMedianApp() || !window.median?.onesignal) return;
  try {
    window.median.onesignal.login(userId);
  } catch (err) {
    console.error("Median push login failed:", err);
  }
}

/** Disassociates the device from any user id. Call on sign-out. */
export function logoutPushUser(): void {
  if (!isMedianApp() || !window.median?.onesignal) return;
  try {
    window.median.onesignal.logout();
  } catch (err) {
    console.error("Median push logout failed:", err);
  }
}

// Median invokes this exact global function by name when a user taps a push notification (see
// docs.median.co/docs/send-data-to-app-via-push-notification) — it is NOT an import anywhere, it
// must exist on window under this literal name for Median's native layer to find it.
declare global {
  interface Window {
    median_onesignal_push_opened?: (data: Record<string, any>) => void;
  }
}

/**
 * Registers the notification-tap handler. `onDeepLink` receives whatever `data` payload the
 * server-side send route attached (see server.ts's /api/admin/push/send) and is responsible for
 * actually routing the app there — this module has no opinion on the app's navigation model.
 */
export function registerPushTapHandler(onDeepLink: (data: Record<string, any>) => void): void {
  if (!isMedianApp()) return;
  window.median_onesignal_push_opened = (data) => {
    try {
      onDeepLink(data || {});
    } catch (err) {
      console.error("Push tap deep-link handler failed:", err);
    }
  };
}
