# Cloud API image for a container host (Render, Railway, Fly.io, any VPS).
# Build from the repository root: docker build -f apps/cloud-api/Dockerfile .

FROM node:20-bookworm-slim

# better-sqlite3 arrives transitively through @analytiq/licensing and compiles
# from source when prebuilds are unavailable, so keep a toolchain in the image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable
WORKDIR /app

# Manifests first so dependency layers cache between source changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/validation/package.json packages/validation/
COPY packages/database/package.json packages/database/
COPY packages/licensing/package.json packages/licensing/
COPY apps/cloud-api/package.json apps/cloud-api/
RUN pnpm install --frozen-lockfile --filter @analytiq/cloud-api...

COPY tsconfig.base.json ./
COPY packages/validation packages/validation
COPY packages/database packages/database
COPY packages/licensing packages/licensing
COPY apps/cloud-api apps/cloud-api

RUN pnpm --filter @analytiq/validation build \
 && pnpm --filter @analytiq/database build \
 && pnpm --filter @analytiq/licensing build \
 && pnpm --filter @analytiq/cloud-api build

ENV NODE_ENV=production
WORKDIR /app/apps/cloud-api
EXPOSE 3002
CMD ["node", "dist/main.js"]
