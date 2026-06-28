# DataForge AI — Monorepo

DataForge AI is a monorepo for uploading, versioning, verifying, and forking machine learning-ready datasets with cryptographic provenance.

## Project Structure

```
apps/web        → Next.js Frontend (Vercel)
apps/api        → NestJS Backend (Railway)
packages/db     → Prisma Client & Migrations (Supabase Postgres)
packages/shelby → Shelby hot storage provider (Mocked client)
packages/ai     → AI utilities (Mocked embeddings)
packages/shared → Shared types & DTO definitions
```

---

## Deployment Platforms

- **Frontend:** [Vercel](https://vercel.com)
- **Backend API:** [Railway](https://railway.app)
- **Database:** [Supabase](https://supabase.com) (pgvector enabled)
- **Redis:** [Upstash](https://upstash.com) (TLS connection required)
- **Storage:** [Shelby Mock Storage](https://docs.shelby.xyz) (persisted on a Railway persistent volume under `/app/storage`)

---

## Environment Variables Configuration

Make a copy of `.env.example` to create your local `.env`:
```bash
cp .env.example .env
```

### Safety Policy
- **Never add private backend variables to Vercel.** This includes `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`, `JWT_SECRET`, or `SHELBY_PRIVATE_KEY`.
- Frontend environment variables must be prefixed with `NEXT_PUBLIC_` to be bundled in Next.js builds.

---

## Observability & Exception Monitoring (Sentry)

Sentry is integrated on both NestJS (backend) and Next.js (frontend).

### Enable / Disable Behavior
- Sentry monitoring is **automatically disabled** if `SENTRY_DSN` (backend) or `NEXT_PUBLIC_SENTRY_DSN` (frontend) is missing or left empty.
- The application will run normally without crashes.
- To configure, simply set the Sentry DSNs on the corresponding hosting platforms (Railway and Vercel).

---

## Production Verification (Smoke Test)

After deploying any changes or rotating credentials, run the production smoke test suite:

```bash
bash scripts/production-smoke-test.sh \
  https://api-production-e4ad.up.railway.app/api \
  https://web-avins-projects-94a43281.vercel.app
```

Expected: All 14/14 checks pass without errors.
