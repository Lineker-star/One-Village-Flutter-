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
          // CRITICAL: no runtimeCaching entries exist for this app's own /api/* routes or for the
          // Supabase REST/Realtime domain — meaning the service worker NEVER intercepts or caches
          // them; every request for providers, bookings, chats, job postings, etc. always goes
          // straight to the network, exactly like it would with no service worker installed at all.
          // The explicit NetworkOnly rules below are redundant with that default but make the
          // guarantee self-documenting and audit-proof rather than relying on "we just didn't add a
          // rule for it".
          runtimeCaching: [
            {
              // Matched against the request's full URL by workbox, so this checks the pathname
              // specifically rather than a string-prefix regex (which would never match an
              // absolute "https://<host>/api/..." URL).
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkOnly',
            },
            {
              urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'),
              handler: 'NetworkOnly',
            },
          ],
          // The SPA fallback (for client-side routing) must never intercept API calls either.
          navigateFallbackDenylist: [/^\/api\//],
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
