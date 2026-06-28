# DataForge AI — Production Deployment Guide

DataForge AI is a monorepo containing a NestJS backend (`apps/api`), a Next.js frontend (`apps/web`), and core utility packages. 

In production, the application is deployed as a distributed stack:
- **Next.js Frontend:** [Vercel](vercel.md)
- **NestJS API Backend:** [Render](render.md)
- **PostgreSQL Database:** [Supabase](supabase.md)
- **Redis Queue Store:** [Upstash](upstash.md)

---

## Architecture Flow

```
User (Browser)
    │
    ├──► [Vercel] (Next.js Frontend / apps/web)
    │     │
    │     ▼ (Client-side REST API Queries)
    │
    └──► [Render] (NestJS Backend API / apps/api)
          │
          ├──► [Supabase] (PostgreSQL Database + pgvector)
          │
          ├──► [Upstash] (Serverless Redis / BullMQ)
          │
          └──► [Shelby Network] (Hot Object Storage - Mock/Live)
```

---

## Quick Reference Checklist

Detailed instructions for configuring and provisioning each platform:

1. **Database:** [Supabase Setup Guide](supabase.md)
   - Provision Postgres instance + pgvector extension.
   - Run migrations and seeds against direct connection string (`port 5432`).
2. **Redis:** [Upstash Setup Guide](upstash.md)
   - Provision serverless Redis + TLS.
   - Copy connection string (`rediss://...`).
3. **Backend API:** [Render Setup Guide](render.md)
   - Provision Web Service from monorepo root.
   - Set environment variables (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `FRONTEND_ORIGIN`).
   - Configure build and startup commands.
   - Attach persistent volume at `/app/storage` (if using mock Shelby mode).
4. **Frontend Client:** [Vercel Setup Guide](vercel.md)
   - Link project pointing root to `apps/web`.
   - Set `NEXT_PUBLIC_API_URL` pointing to Render API.

---

## E2E Smoke Testing

To verify the integration of your active platforms, execute the production smoke test script:

```bash
bash scripts/production-smoke-test.sh \
  https://dataforge-api.onrender.com/api \
  https://dataforge-web.vercel.app
```
*(Replaces deprecated `railway-smoke-test.sh`)*
