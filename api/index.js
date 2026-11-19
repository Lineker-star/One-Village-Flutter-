// Vercel serverless entry point for the One Village API.
//
// Vercel routes /api/* requests here (see vercel.json rewrites: /api/(.*) -> /api). It
// invokes this function with the ORIGINAL request URL preserved (e.g. /api/health), so the
// Express app's routes (app.get("/api/health", ...), etc.) match correctly. Vercel serves the
// SPA + static assets from dist/ via its CDN; this function only handles API traffic.
//
// The Express app itself lives in server.ts, bundled to dist/server.cjs by esbuild (npm run
// build). startServer() is guarded so it does NOT run inside the function (no port binding /
// Vite boot serverless) — see server.ts's `if (!process.env.VERCEL)` check.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { vercelHandler } = require("../dist/server.cjs");

module.exports = vercelHandler;