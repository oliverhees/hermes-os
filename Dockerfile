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
RUN pnpm add -D tsx

# ─── runtime stage ────────────────────────────────────────────────────────
FROM node:22-slim AS runtime
# python3 is required by scripts/pty-helper.py (terminal feature). Originally
# added in PR #185 for issue #161; regressed by the 2026-05-01 rename commit
# efcb7d14 and re-added here per issue #259.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl tini python3 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r workspace && useradd -r -g workspace -u 10010 workspace

WORKDIR /app

# Copy build artefacts + runtime deps.
# server-entry.js is the Node HTTP server that wraps the TanStack Start fetch
# handler exported by dist/server/server.js. Without it, `node dist/server/server.js`
# imports the handler module, runs top-level code, and exits (code 0) because
# nothing keeps the event loop alive — see issue #129.
COPY --from=build --chown=workspace:workspace /app/dist ./dist
COPY --from=build --chown=workspace:workspace /app/node_modules ./node_modules
COPY --from=build --chown=workspace:workspace /app/package.json ./package.json
COPY --from=build --chown=workspace:workspace /app/server-entry.js ./server-entry.js
COPY --from=build --chown=workspace:workspace /app/skills ./skills

USER workspace
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    HERMES_API_URL=http://hermes-agent:8642

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/ >/dev/null || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--max-old-space-size=2048", "server-entry.js"]
