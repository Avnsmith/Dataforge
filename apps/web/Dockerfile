# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy root workspace manifests
COPY package*.json ./
COPY tsconfig.json ./
COPY apps/web/package.json     ./apps/web/
COPY packages/shared/package.json ./packages/shared/

# Install dependencies
RUN npm ci

# Copy source
COPY apps/web         ./apps/web
COPY packages/shared  ./packages/shared

# Build shared package first
RUN npm run build --workspace=packages/shared

# Enable Next.js standalone output at build time
ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js app
RUN npm run build --workspace=apps/web

# ── Stage 2: Production runner ─────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 dataforge && \
    adduser  --system --uid 1001 --ingroup dataforge dataforge

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

# Copy standalone build (works with or without standalone mode)
COPY --from=builder /app/apps/web/.next         ./apps/web/.next
COPY --from=builder /app/apps/web/public        ./apps/web/public
COPY --from=builder /app/apps/web/package.json  ./apps/web/package.json
COPY --from=builder /app/packages/shared/dist   ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/node_modules           ./node_modules
COPY --from=builder /app/package.json           ./package.json

RUN chown -R dataforge:dataforge /app

USER dataforge

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["npm", "run", "start", "--workspace=apps/web"]
