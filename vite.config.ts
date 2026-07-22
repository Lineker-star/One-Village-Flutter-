import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // We hand-write public/manifest.webmanifest and link it ourselves in index.html, so the
        // plugin shouldn't also generate/inject its own — avoids a second, conflicting manifest.
        manifest: false,
        // 'prompt' (not 'autoUpdate'): a brand-new service worker version is detected but NOT
        // activated until the user confirms via the in-app "new version available" banner
        // (usePwaUpdate hook) — auto-swapping the SW mid-session could otherwise interrupt someone
        // partway through a booking/chat/job-posting form.
        registerType: 'prompt',
        // We call registerSW() ourselves from src/hooks/usePwaUpdate.ts (via the
        // virtual:pwa-register/react module) to drive that custom banner, instead of the plugin's
        // own auto-injected <script> — injecting both would register the service worker twice.
        injectRegister: null,
        // Service worker only runs on `vite build` output; local `npm run dev` (server.ts's Vite
        // middleware-mode path) is completely unaffected, so this can't break the existing dev server.
        devOptions: {
          enabled: false,
        },
        workbox: {
          // Precache the built app shell (hashed JS/CSS bundles, index.html, icons, images under
          // dist/assets) so the shell loads instantly and works offline for pages already visited.
          globPatterns: ['**/*.{js,css,html,ico,png,jpg,jpeg,svg,webp,avif,woff,woff2}'],
          // workbox's own default cap is 2 MiB; this app's single main JS bundle (no code-splitting
          // yet — see the "chunks larger than 500 kB" build warning) already exceeds that, which
          // fails the build outright rather than silently skipping it. Raised with headroom above
          // the current ~2.1 MB rather than tuned to the exact byte count, so routine dependency
          // growth doesn't immediately re-trigger this. Splitting the bundle (dynamic imports/
          // manualChunks) would be the real long-term fix, not attempted here since it's unrelated
          // to Google sign-in and touches build config, not this feature.
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          // Enables the offline fallback (item 4): navigation requests that don't match a
          // precached asset are served the cached app shell instead of failing outright, so the
          // SPA still boots offline for any deep-linked path (job/company/professional-profile
          // routes included) — App.tsx's own OfflineBanner then handles the "no connectivity" UI
          // from inside the already-loaded shell. Trade-off: an online hard-refresh/deep-link now
          // gets the cached shell rather than a guaranteed-fresh one from the server; the existing
          // "new version available" update-prompt banner (usePwaUpdate) is what catches this up
          // within its hourly check rather than leaving it silently stale indefinitely.
          navigateFallback: '/index.html',
          // The SPA fallback must never intercept API calls — those should fail as real network
          // errors when offline, not nonsensically resolve to the HTML shell.
          navigateFallbackDenylist: [/^\/api\//],
          // Workbox's generateSW already defaults clientsClaim to true when using the custom
          // register flow this project uses (see usePwaUpdate.ts's updateServiceWorker(true), which
          // posts SKIP_WAITING then reloads once the new worker takes control) — set explicitly
          // here so that behavior is visible in this file rather than relying on a plugin default.
          clientsClaim: true,
          // CRITICAL — read this before changing anything below: dynamic data (bookings, chats,
          // job postings, providers, professional profiles, etc.) must NEVER be served stale to an
          // online user. NetworkFirst (not StaleWhileRevalidate) is what guarantees that: it always
          // attempts the network FIRST and only ever falls back to the cached copy when that
          // request genuinely fails (i.e. actually offline) — an online user never sees a cached
          // response merely because one existed. StaleWhileRevalidate was deliberately NOT used
          // anywhere here even though it's mentioned as an option for "read-heavy, rarely-changing
          // data" elsewhere, because it returns the cached copy immediately (even while online) and
          // only refreshes the cache in the background — that's exactly the kind of staleness this
          // project's earlier PWA work explicitly ruled out. Order matters below: Workbox checks
          // routes in registration order and uses the first match, so the narrowest
          // exclusions (admin, auth, realtime — always NetworkOnly) are registered before the
          // broader GET-caching rules that would otherwise also match those same URLs.
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api/admin/'),
              handler: 'NetworkOnly',
            },
            {
              // Supabase Auth and Realtime share the *.supabase.co host with the REST/Storage API
              // — excluded by path before the broader REST rule below, per the explicit
              // "never cache Auth or Realtime traffic" requirement.
              urlPattern: ({ url }) =>
                url.hostname.endsWith('.supabase.co') &&
                (url.pathname.startsWith('/auth/') || url.pathname.startsWith('/realtime/')),
              handler: 'NetworkOnly',
            },
            {
              // Supabase REST/Storage reads (providers, bookings, chats, jobs, professional
              // profiles, uploaded files, etc.) — NetworkFirst with a short timeout (so a slow
              // connection falls back to cache quickly rather than hanging the UI) and a short
              // cache expiration (so the offline fallback itself can't go stale for long).
              urlPattern: ({ url, request }) => url.hostname.endsWith('.supabase.co') && request.method === 'GET',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'supabase-rest-cache',
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 200, maxAgeSeconds: 5 * 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Mutations (creating a booking, sending a chat message, posting a job, uploading a
              // file, etc.) — explicitly NetworkOnly. Workbox never caches non-GET requests by
              // default even without a matching route, but this makes that guarantee explicit
              // rather than implicit, matching the same reasoning as the /api/ rules below.
              urlPattern: ({ url, request }) => url.hostname.endsWith('.supabase.co') && request.method !== 'GET',
              handler: 'NetworkOnly',
            },
            {
              // This app's own non-admin GET endpoints (providers list, promoted ads) — same
              // NetworkFirst treatment as Supabase reads, for the same reason.
              urlPattern: ({ url, request }) =>
                url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/admin/') && request.method === 'GET',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-get-cache',
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 100, maxAgeSeconds: 5 * 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Non-GET /api/ routes (the AI guide proxy, promoted-ad submission, etc.) — never
              // cached, same reasoning as the Supabase mutation rule above.
              urlPattern: ({ url, request }) =>
                url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/admin/') && request.method !== 'GET',
              handler: 'NetworkOnly',
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
