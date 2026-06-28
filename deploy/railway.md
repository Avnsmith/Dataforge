# Deploying DataForge Backend to Railway

Railway is the canonical backend hosting platform for DataForge AI.

> **Architecture:**
> - Backend API → Railway
> - Database → Supabase (external, not Railway Postgres)
> - Redis → Upstash (external, not Railway Redis)
> - Frontend → Vercel

---

## Service Details

| Property | Value |
|---|---|
| Railway Project | `dataforge-ai` |
| Service Name | `api` |
| Service URL | `https://api-production-e4ad.up.railway.app` |
| Health Check | `https://api-production-e4ad.up.railway.app/api/health` |
| Region | Singapore (ap-southeast-1) |
| Builder | Nixpacks (Node.js) |

---

## Build Command

```bash
npm install --include=dev && \
npx prisma generate --schema=packages/db/prisma/schema.prisma && \
npm run build \
  --workspace=packages/shared \
  --workspace=packages/db \
  --workspace=packages/ai \
  --workspace=packages/shelby \
  --workspace=apps/api
```

## Start Command

```bash
npm run db:migrate:deploy && npm run start --workspace=apps/api
```

This runs `npx prisma migrate deploy` against `DIRECT_URL` (Supabase direct connection),
then starts the compiled API: `node dist/main.js`

---

## Required Environment Variables

Set these in the Railway dashboard under **api → Variables → production**.

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase pooled connection (`port 6543?pgbouncer=true`) |
| `DIRECT_URL` | Supabase direct connection (`port 5432`) |
| `REDIS_URL` | Upstash `rediss://...` TLS connection string |
| `JWT_SECRET` | Strong random secret (min 32 chars) |
| `NODE_ENV` | `production` |
| `FRONTEND_ORIGIN` | Vercel frontend URL (for CORS) |
| `SHELBY_MODE` | `mock` (or `live` when real credentials available) |
| `SHELBY_NETWORK` | `testnet` |
| `SHELBY_EXPLORER_BASE_URL` | `https://explorer.shelby.xyz/testnet` |
| `SHELBY_STORAGE_DIR` | `/app/storage` |
| `MAX_UPLOAD_FILE_SIZE_MB` | `25` |
| `EMBEDDING_MODE` | `mock` |

Optional (live Shelby mode only):

| Variable | Value |
|---|---|
| `SHELBY_ACCOUNT` | Aptos wallet address |
| `SHELBY_PRIVATE_KEY` | Aptos private key |
| `SHELBY_RPC_URL` | Shelby RPC endpoint |
| `SHELBY_API_KEY` | Shelby API key |

> ⚠️ Never add `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, or `SHELBY_PRIVATE_KEY` to Vercel.

---

## Prisma Migration

Migrations use `DIRECT_URL` (Supabase port 5432 direct connection).
Prisma schema is configured with:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   # pooled (port 6543)
  directUrl = env("DIRECT_URL")     # direct (port 5432) — used for migrations
}
```

---

## Redis TLS

Upstash Redis uses `rediss://` (TLS). The BullMQ connection factory in
`apps/api/src/app.module.ts` detects `rediss://` and passes `tls: {}` to ioredis:

```typescript
const tls = redisUrl.startsWith('rediss://') ? {} : undefined;
return { connection: { host, port, username, password, tls } };
```

Do not remove this fix.

---

## Port Binding

The API binds to Railway's dynamically assigned `PORT`:

```typescript
const port = process.env.PORT || 4000;
await app.listen(port, '0.0.0.0');
```

Never hardcode a port. Never bind to `localhost`.

---

## Deploying

### Auto-deploy (recommended)
Push to `main` branch — Railway auto-deploys on commit.

### Manual deploy via CLI
```bash
railway up --service api
```

### Manual deploy via dashboard
Railway Dashboard → dataforge-ai → api → Deploy

---

## Vercel Frontend

After Railway API is live, update the Vercel frontend environment variable:

```
NEXT_PUBLIC_API_URL=https://api-production-e4ad.up.railway.app/api
```

Then redeploy the Vercel frontend.

---

## Health Check

```bash
curl https://api-production-e4ad.up.railway.app/api/health
```

Expected:
```json
{
  "status": "ok",
  "service": "dataforge-api",
  "dependencies": {
    "database": "connected",
    "redis": "connected",
    "shelby": "connected (mock)"
  }
}
```
