// Vercel serverless entry point for the One Village API.
//
// Vercel routes /api/* requests here (vercel.json rewrites /api/(.*) -> /api). It invokes this
// function with the ORIGINAL URL preserved (e.g. /api/health) so the Express routes match.
// Vercel serves the SPA + static assets from dist/ via its CDN; this function only handles API.
//
// The Express app lives in server.ts, bundled by esbuild (npm run build) to server.bundle.cjs
// at the PROJECT ROOT (CommonJS) — NOT inside dist/, because dist/ is the static
// outputDirectory uploaded to the CDN and isn't on the function's runtime filesystem.
// startServer() is guarded by !process.env.VERCEL in server.ts, so no port/Vite boot happens.
//
// This file is ESM (package.json has "type":"module"), so we bridge to the CommonJS bundle via
// createRequire rather than using require() directly.

import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { vercelHandler } = require("../server.bundle.cjs");

export default vercelHandler;