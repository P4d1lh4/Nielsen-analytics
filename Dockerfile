# syntax=docker/dockerfile:1

# Base image pinned to the project's EXACT Playwright version, so the Chromium
# build + all system graphics libraries already baked into the image match the
# `playwright` npm package. (jammy = Ubuntu 22.04, bundles Node 20 -> >=18 OK.)
ARG PLAYWRIGHT_VERSION=v1.60.0

# ---------- Stage 1: builder ----------
FROM mcr.microsoft.com/playwright:${PLAYWRIGHT_VERSION}-jammy AS builder
WORKDIR /app

# Install deps reproducibly. --ignore-scripts so the postinstall (which would run
# `playwright install` + `prisma generate`) does not fire prematurely; we drive
# generation explicitly below.
# .npmrc carries `legacy-peer-deps=true` (claude-agent-sdk wants zod@4, we pin zod@3).
COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma
RUN npm ci --ignore-scripts

# Generate the Prisma Client + native Linux query engine INSIDE the container.
RUN npx prisma generate

# Compile TypeScript -> dist/
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Drop devDependencies. Keeps @prisma/client (and its generated engine under
# node_modules/.prisma) plus every runtime dependency.
RUN npm prune --omit=dev

# ---------- Stage 2: production runtime ----------
FROM mcr.microsoft.com/playwright:${PLAYWRIGHT_VERSION}-jammy AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy ONLY production artifacts — no TypeScript source, no devDependencies.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

# Drop root: run as the image's built-in non-root user. Pre-create the writable
# workspace the worker uses (/app itself stays root-owned).
RUN mkdir -p /app/.ux-audit-reports && chown -R pwuser:pwuser /app/.ux-audit-reports
USER pwuser

EXPOSE 3000

# Default process = API. The worker overrides this via docker-compose `command`.
CMD ["node", "dist/service/server.js"]
