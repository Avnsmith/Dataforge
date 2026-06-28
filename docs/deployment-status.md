# DataForge AI — Integration & Deployment Status

This document reports the current integration and production readiness status of the DataForge AI stack.

---

## Target Deployment Architecture

| Service / Layer | Provider | Status | Description |
|---|---|---|---|
| **Next.js Frontend** | Vercel | ✅ CONFIGURED | Workspace-based Next.js rollout mapping to `/apps/web` |
| **NestJS Backend API** | Render | ✅ CONFIGURED | Web service running database migrations on boot, binding to `$PORT` |
| **PostgreSQL Database** | Supabase | ✅ CONFIGURED | Relational instance with `pgvector` enabled and connection pooling |
| **Redis Queue Store** | Upstash | ✅ CONFIGURED | Serverless TLS Redis whitelisted for BullMQ task concurrency |
| **Storage Layer** | Shelby Client | ✅ MOCK (DEFAULT) | Mock mode operates on persistent storage volumes. Live mode is stubbed and tested but remains disabled until verified against the live Shelby network |

---

## Security Audit & Secrets Rotation

Following a security audit, all previously exposed credentials have been rotated:

1. **Database Password:** rotated and applied on Supabase Postgres. All schema definitions are deployed cleanly.
2. **JWT Secret:** regenerated to use a strong cryptographically secure key in Render API environments.
3. **Shelby Private Key:** rotated to a secure Aptos account. Local development utilizes `SHELBY_MODE=mock`.
4. **Environment Sanitation:** All private credentials have been removed from frontend Vercel settings and local log dumps to ensure zero key leakage.

---

## Verification Pipelines

Production verification utilizes two core validations:

1. **Table Count Verifications:**
   ```bash
   node packages/db/scripts/verify_tables.mjs
   ```
   Ensures connection integrity and verifies database schemas (User, Dataset, Version, Files, Fork, Lineage, SearchIndex).

2. **Production E2E Smoke Testing:**
   ```bash
   bash scripts/production-smoke-test.sh <API_URL> <FRONTEND_URL>
   ```
   Validates full file uploads, asynchronously executes BullMQ workers, updates manifest hashes, and downloads files.
