# Vercel deployment notes
#   * vercel.json: framework=custom, outputDirectory=dist, rewrites -> index.html
#   * api/server.js: @vercel/node serverless entry that re-exports the Express app
#   * Build: npm run build (vite + esbuild) -> dist/index.html + dist/server.cjs
#   * Runtime: Vercel Node 22.x, auto-deploys on every push to main
#
# Render is no longer used — stop the Render web service from the Render Dashboard and
# delete the render.yaml Blueprint so no deploys target it.

## How the Vercel deployment works

| Layer | File | Purpose |
|-------|------|---------|
| Build | `npm run build` | Vite compiles the SPA into `dist/`; esbuild bundles `server.ts` → `dist/server.cjs` |
| Static | `vercel.json` | `framework: custom`, `outputDirectory: dist`, SPA rewrite to `index.html` |
| API | `api/server.js` | @vercel/node entry — re-exports `vercelHandler` from `dist/server.cjs` |
| CI gate | `.github/workflows/main.yml` | tsc --noEmit + build + smoke-test before the deploy lands |

Every push to `main` triggers both the CI gate and Vercel's auto-deploy (configured on the
project's Settings > Git page). To disable auto-deploy, flip it off there.

## Environment variables (already set on the Vercel project)

The following are configured as **Encrypted** env vars on the `one-village-flutter` project:

| Key | Purpose | Scope |
|-----|---------|-------|
| `VITE_SUPABASE_URL` | Public Supabase URL | Client + Server |
| `VITE_SUPABASE_ANON_KEY` | Public anon key | Client + Server |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin JWT verification | Server only |
| `GEMINI_API_KEY` | AI Guide / ai-search | Server only |
| `ONESIGNAL_APP_ID` | Push notifications | Server only |
| `ONESIGNAL_REST_API_KEY` | Push notifications | Server only |

If any are missing, add them under Settings > Environment Variables with the correct
`Environment` scope (Client, Server, or both).