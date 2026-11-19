# One Village — Mobile Framework, Splash & Design System

This document is the technical plan + operator guide for the mobile framework layer of the
One Village PWA. All referenced code is implemented in this repo; this file explains how it fits
together and how to finish the native-app hooks.

---

## 1. Native-quality splash screen & synchronized handoff

**Files:** `src/components/LaunchSplash.tsx`, `src/main.tsx`

The splash is a sibling overlay of `<App/>` at the React root, so App is already mounted and
running underneath when the splash exits — the exit reveals a *live* dashboard, not a blank frame.

Design choices that make it read as native (SwiftUI/UIKit parity):

| Native trait | How it's replicated |
|---|---|
| Single continuous motion | Exit uses one `cubic-bezier(0.22,1,0.36,1)` curve on both splash (scale 1.06 + lift + fade) and app (scale 0.985 → 1 + fade). They are phase-aligned via `requestAnimationFrame`. |
| Logo "hero" moment | Spring entrance (`stiffness 240, damping 18`), breathing loop, radial reveal flare, and a light sweep across the logo. |
| No jank | Splash is pure CSS/transform (GPU composited), honors `prefers-reduced-motion`, and shows once per cold boot (`sessionStorage`). |
| Correct timing | ~1.25s hold + 0.55s exit ≈ 1.7s total, inside the 1.4–2.0s native window. |

**Flow:** cold start → `LaunchSplash` (logo + progress) → `onComplete` → splash exit animation +
app wrapper eases in from `scale(0.985)` → dashboard revealed. Soft reloads within a tab session
skip the splash (sessionStorage guard).

**Customization:** edit the gradient, `BERTOUA · EST · CAMEROUN` footer, tagline (`lang` prop), and
the `setTimeout` hold duration in `LaunchSplash.tsx`.

---

## 2. Push notification system (scalable, FCM-ready)

**Files:** `src/lib/push.ts`, `src/lib/backgroundSync.ts`, `server.ts` (`POST /api/push/subscribe`)

A single `pushManager` auto-selects the runtime:

- **PWA / Web Push** — Notifications API + Service Worker `PushManager`. When `VITE_VAPID_PUBLIC_KEY`
  is set (generated server-side from an FCM/GCM key pair), the browser returns a `PushSubscription`
  that is `POST`ed to `/api/push/subscribe` so the server (or FCM) can target the device.
- **Median native (OneSignal)** — unchanged bridge via `window.median.onesignal.*`.

**API surface**
```ts
requestPushPermission(userId?)   // request permission + establish/persist subscription
loginPushUser(userId)            // bind device to user for targeted sends
logoutPushUser()                 // unbind on sign-out
registerPushTapHandler(cb)       // route notification taps through deepLinks.ts
isPushSupported() / getPermission()
showLocalNotification(title, opts) // local fallback
```

**Server side (to go fully live with FCM):**
1. Generate a VAPID key pair (`npx web-push generate-vapid-keys`), set `VITE_VAPID_PUBLIC_KEY`
   (client) and the private key (server, secret).
2. Persist subscriptions to Supabase (a `push_subscriptions` table) instead of the in-memory store.
3. Send via FCM HTTP v1 or Web Push (`web-push` library) from `server.ts`'s `/api/admin/push/send`.

**Notification payloads** should include a `url` or `{type,id}` so taps route via `deepLinks.ts`.

---

## 3. Deep linking strategy (external URLs + universal links)

**Files:** `src/lib/deepLinks.ts`, `public/.well-known/assetlinks.json`,
`public/.well-known/apple-app-site-association`

One module normalizes **every** entry point — push taps, universal links, QR codes, shared URLs,
in-app navigation — into a `DeepLinkIntent`:

```
/pro/<userId>        → professional profile
/company/<id>        → company page
/job/<id>            → job posting
?providerId=<id>     → provider profile
?chat=<providerId>   → chat (auth-gated)
?view=<tab>          → main tab (home|dashboard|jobs|professionals|ads|admin)
?category=<slug>     → category browse
?ref=<code>          → referral attribution
#/dashboard etc.     → SPA tab
```

`parseDeepLink()` → `navigateToIntent()` handles warm navigation (history + `ov:navigate` event)
and cold navigation (path routes → `location.assign`, read by App on mount).

**Universal / App Links (when a native wrapper exists):**
- **Android** — host `assetlinks.json` at `https://www.onevillage.site/.well-known/assetlinks.json`
  with your app's package name + release SHA-256 fingerprint (template included; replace the
  placeholder).
- **iOS** — host `apple-app-site-association` at `/.well-known/` with your Team ID + bundle ID
  (template included). Must be served as `application/json` over HTTPS with no redirects.

For the **PWA alone**, native association isn't required — any `https://www.onevillage.site/...`
URL opens the app at that route via the service worker's SPA fallback.

---

## 4. Background tasks & lifecycle handling

**Files:** `src/hooks/useAppLifecycle.ts`, `src/lib/backgroundSync.ts`

`useAppLifecycle()` consolidates the four mobile lifecycle signals:
`online/offline`, `visibilitychange`, `pageshow/pagehide` (BFCache), and `freeze/resume`
(Page Lifecycle API). On reconnect it fires `ov:online` and best-effort registers a Background
Sync tag so queued work drains.

`backgroundSync.ts` provides an offline **outbox**:
```ts
enqueue({ url, method, body })  // queue a failed write (offline)
flushOutbox()                   // drain on 'online' / resume
requestBackgroundSync(tag)      // ask the SW to retry later (even if tab closed)
```

> To drain while the tab is closed, switch the PWA to `injectManifest` with a custom `sw.ts` that
> handles `self.addEventListener('sync', …)` and calls `flushOutbox()`. Until then the in-app
> outbox still retries on the next `online` event.

---

## 5. UI/UX design recommendations

The brand tokens already map Tailwind `amber` → deep navy (`#081026…#F4F7FC`) and `orange` →
red. Build on these:

### Typography
- **Scale (mobile-first, `rem`):** Display 1.875/2.25 · H1 1.5 · H2 1.25 · H3 1.125 · Body 1.0 ·
  Small 0.875 · Caption 0.75.
- **Weights:** 400 body, 500 UI labels, 600 subheads, 800–900 display (already used).
- **Line length:** 45–75 chars for paragraphs; `leading-relaxed` for body.
- **Line height:** 1.2 display, 1.5 body.
- Use `font-variant-numeric: tabular-nums` for prices/phone numbers.

### Spacing
- Adopt a **4px base** scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64. Use `p-4`/`p-6` for cards,
  `gap-3` for related items, `space-y-8` between sections.
- **Touch targets ≥ 44×44px** (Apple HIG / WCAG). Icon-only buttons need padding to reach 44px.
- Consistent radii: `rounded-xl` (12px) controls, `rounded-2xl` (16px) cards, `rounded-3xl` sheets.

### Color theory
- **Primary:** navy `#081026` (text/headers). **Accent:** red `#DC2626` used sparingly for primary
  CTAs/destructive. **Surface:** warm off-white `#FBF7F0`.
- Maintain **≥ 4.5:1** contrast for body text (navy on cream passes comfortably).
- **Semantic:** success `#059669`, warning `#D97706`, danger `#DC2626`, info `#2563EB` — used only
  for status, never decoration.
- Limit to **one accent per screen** to keep a calm, premium feel.

### Motion design
- **Durations:** micro 120–180ms (press/hover), transitions 240–360ms, sheets 320–420ms.
- **Easing:** standard `cubic-bezier(0.22,1,0.36,1)` (ease-out-expo-ish) for entrances;
  `ease-in-out` for reversible moves.
- **Meaningful motion only:** state changes (add/remove), spatial continuity (shared element),
  and attention (subtle pulse on new content). Avoid animating layout properties — prefer
  `transform`/`opacity` for 60fps.
- Always honor `prefers-reduced-motion` (globally handled in `index.css`).

### Component polish already applied
- Global `antialiased`, `overscroll-behavior`, `:focus-visible` ring, slim scrollbars, reduced-motion
  guard, tap-highlight removal (see `src/index.css`).

---

## 6. Commit, push & CI/CD

**One-time / per-change Git flow:**
```bash
git add -A
git commit -m "feat: native-quality splash, deep links, push manager, lifecycle, design polish"
git push origin main
```

**Automated pipeline (already wired):**
- **CI gate** — `.github/workflows/main.yml` runs on every push/PR to `main`:
  `npm ci` → `tsc --noEmit` → `npm run build` → smoke-test `GET /api/health`.
- **CD** — Vercel auto-deploys on every push to `main` (project `one-village-flutter`, Docker/
  Node runtime). A green CI + Vercel build lands the change at `https://www.onevillage.site/`.

**Verify a deploy:**
```bash
curl -s https://www.onevillage.site/api/health   # {"status":"ok","ai":true,"supabase":true}
```

**Required Vercel env vars (server-side):** `GEMINI_API_KEY`, `COARENA_API_KEY`, `COARENA_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, and (for real Web Push) `VITE_VAPID_PUBLIC_KEY` + a server-side VAPID
private key.