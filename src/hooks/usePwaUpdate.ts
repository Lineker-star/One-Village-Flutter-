/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * Registers the service worker and exposes the "a new version is live" state. registerType is
 * 'prompt' (see vite.config.ts) — a newly-deployed version is detected in the background but
 * stays inactive until the user confirms via updateServiceWorker(), so an in-progress
 * booking/chat/job-post form is never yanked out from under someone by a silent reload.
 */
export function usePwaUpdate() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Poll for a new deployment periodically — Render doesn't push anything to the client, so
      // without this an already-open tab would only notice a new version on its next full reload.
      if (!registration) return;
      setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000); // hourly is plenty; this is a slow-moving marketplace app, not a live feed.
    },
  });

  return {
    needRefresh,
    offlineReady,
    dismiss: () => {
      setNeedRefresh(false);
      setOfflineReady(false);
    },
    applyUpdate: () => updateServiceWorker(true),
  };
}
