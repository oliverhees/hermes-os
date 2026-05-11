# syntax=docker/dockerfile:1.6
# Hermes Workspace — production Docker image
# Publishes to ghcr.io/outsourc-e/hermes-workspace
#
# Build locally:
#   docker build -t hermes-workspace .
# Run:
#   docker run -p 3000:3000 -e HERMES_API_URL=http://host.docker.internal:8642 hermes-workspace
# Or pull pre-built:
#   docker pull ghcr.io/outsourc-e/hermes-workspace:latest
#
# ─── build stage ─────────────────────────────────────────────────────────
FROM node:22-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# pnpm 9.x (lockfile v9.0) requires explicit approve-builds for packages with
# build scripts (electron, esbuild). Set via .npmrc so --frozen-lockfile passes.
RUN corepack enable && corepack prepare pnpm@9.8.0 --activate

COPY package.json pnpm-lock.yaml* ./
RUN echo "approve-builds=true" > .npmrc && pnpm install --frozen-lockfile

# Copy sources and build
COPY . .
RUN pnpm build

# Bundle server-entry.js (ESM/TypeScript) to plain CommonJS so Node can run it directly
RUN pnpm exec esbuild server-entry.js --bundle --platform=node --format=cjs --outfile=server-entry.cjs \
    --external:dotenv/config --external:express --external:better-auth/node \
    --banner:js="import { createRequire } from 'module';const require=createRequire(import.meta.url);"

# ─── migrator stage ─────────────────────────────────────────────────────
FROM node:22-slim AS migrator
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.8.0 --activate
COPY package.json pnpm-lock.yaml* ./
RUN echo "approve-builds=true" > .npmrc && pnpm install --frozen-lockfile
COPY drizzle.config.ts ./
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY tsconfig.json ./
COPY src ./src
RUN pnpm add -D tsx

# ─── runtime stage ────────────────────────────────────────────────────────
FROM node:22-slim AS runtime
# python3 is required by scripts/pty-helper.py (terminal feature).
# gosu allows dropping from root to workspace after reading secrets.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl tini python3 gosu \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r workspace && useradd -r -g workspace -u 10010 workspace

WORKDIR /app

# Copy build artefacts + runtime deps.
COPY --from=build --chown=workspace:workspace /app/dist ./dist
COPY --from=build --chown=workspace:workspace /app/node_modules ./node_modules
COPY --from=build --chown=workspace:workspace /app/package.json ./package.json
COPY --from=build --chown=workspace:workspace /app/server-entry.cjs ./server-entry.cjs
COPY --from=build --chown=workspace:workspace /app/skills ./skills
COPY --from=build --chown=workspace:workspace /app/src ./src

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    HERMES_API_URL=http://hermes-agent:8642

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/ >/dev/null || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--max-old-space-size=2048", "server-entry.js"]
