// Vercel serverless entry point.
//
// Vercel's Node.js runtime looks for `api/server.js` (or `api/index.js`) and invokes the
// default export as a serverless handler for every request under /api/*. This file re-exports
// the Express `app` built in server.ts, so all 40+ existing routes (/api/health,
// /api/providers, /api/ai-guide, /api/admin/*, etc.) work unchanged on Vercel without a
// separate per-route function.
//
// It is a plain CommonJS module (not ESM) because @vercel/node's runtime requires that form
// for the handler export, and esbuild already bundles server.ts to CJS (dist/server.cjs).
// The `require` below resolves to that bundle, which is also what `npm start` runs.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { vercelHandler } = require("../dist/server.cjs");

module.exports = vercelHandler;