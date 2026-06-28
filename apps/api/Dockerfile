# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy root workspace manifests first for layer caching
COPY package*.json ./
COPY tsconfig.json ./

# Copy all workspace package manifests
COPY apps/api/package.json          ./apps/api/
COPY packages/db/package.json       ./packages/db/
COPY packages/shelby/package.json   ./packages/shelby/
COPY packages/ai/package.json       ./packages/ai/
COPY packages/shared/package.json   ./packages/shared/

# Install all dependencies (workspaces)
RUN npm ci

# Copy source code
COPY apps/api            ./apps/api
COPY packages/db         ./packages/db
COPY packages/shelby     ./packages/shelby
COPY packages/ai         ./packages/ai
COPY packages/shared     ./packages/shared

# Generate Prisma client
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma

# Build packages in dependency order
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/db
RUN npm run build --workspace=packages/ai
RUN npm run build --workspace=packages/shelby
RUN npm run build --workspace=apps/api

# ── Stage 2: Production runner ─────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 dataforge && \
    adduser  --system --uid 1001 --ingroup dataforge dataforge

# Copy workspace manifests and lock file for production install
COPY package*.json ./
COPY tsconfig.json ./
COPY apps/api/package.json          ./apps/api/
COPY packages/db/package.json       ./packages/db/
COPY packages/shelby/package.json   ./packages/shelby/
COPY packages/ai/package.json       ./packages/ai/
COPY packages/shared/package.json   ./packages/shared/

# Production-only install
RUN npm ci --omit=dev

# Copy built artifacts from builder
COPY --from=builder /app/apps/api/dist          ./apps/api/dist
COPY --from=builder /app/packages/shared/dist   ./packages/shared/dist
COPY --from=builder /app/packages/db/dist       ./packages/db/dist
COPY --from=builder /app/packages/ai/dist       ./packages/ai/dist
COPY --from=builder /app/packages/shelby/dist   ./packages/shelby/dist
COPY --from=builder /app/node_modules/.prisma   ./node_modules/.prisma
COPY --from=builder /app/packages/db/prisma     ./packages/db/prisma

# Shelby mock storage directory (writable by app user)
RUN mkdir -p ./packages/shelby/storage && \
    chown -R dataforge:dataforge ./packages/shelby/storage

# Temp uploads directory
RUN mkdir -p ./apps/api/temp-uploads && \
    chown -R dataforge:dataforge ./apps/api/temp-uploads

RUN chown -R dataforge:dataforge /app

USER dataforge

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1

CMD ["node", "apps/api/dist/main"]
