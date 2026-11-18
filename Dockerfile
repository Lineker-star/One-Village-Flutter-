# syntax=docker/dockerfile:1
# One Village — production container for Render Web Service.
#
# Build:  docker build -t onevillage .
# Run:    docker run -p 3000:3000 -e VITE_SUPABASE_URL=... -e VITE_SUPABASE_ANON_KEY=... onevillage
#
# Notes:
#  * VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are PUBLIC keys — safe to pass as build args so
#    Vite can inline them into the client bundle at build time. They are read by
#    src/lib/supabase.ts via import.meta.env.
#  * SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, ONESIGNAL_* are SERVER-ONLY secrets — they are
#    read by server.ts via process.env at RUNTIME, never baked into the image. Pass them as
#    Render environment variables (Runtime Secrets), NOT as build args.
#  * The app binds to process.env.PORT (Render sets it, default 10000) on 0.0.0.0 — see server.ts.
FROM node:22-slim AS base

WORKDIR /app

# Install deps first for better layer caching.
COPY package*.json ./
RUN npm ci --omit=dev

# Dev deps are needed at BUILD time only (vite, typescript, esbuild, tsx).
COPY package*.json ./
RUN npm ci

# Build the client (vite) + bundle the server (esbuild -> dist/server.cjs).
COPY . .
RUN npm run build

# Trim back to runtime-only deps + the built output.
FROM node:22-slim AS runtime

WORKDIR /app

RUN npm install --omit=dev --no-save express @supabase/supabase-js dotenv @google/genai

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY --from=base /app/server.ts ./
COPY --from=base /app/index.html ./
COPY --from=base /app/public ./public
COPY --from=base /app/tailwind.config.ts ./tailwind.config.ts 2>/dev/null || true
COPY --from=base /app/vite.config.ts ./vite.config.ts
COPY --from=base /app/src ./src
COPY --from=base /app/supabase ./supabase

# Vite needs the client source + config to be present only at build time; the runtime image
# serves the already-built dist/index.html + assets, so we don't need vite here. Keeping the
# source around is harmless and makes the image self-describing.

ENV NODE_ENV=production
ENV PORT=10000

# Bind to 0.0.0.0 so Render's router can reach the service.
EXPOSE 10000

# server.ts reads process.env.PORT and falls back to 3000. Render sets PORT automatically.
CMD ["node", "dist/server.cjs"]