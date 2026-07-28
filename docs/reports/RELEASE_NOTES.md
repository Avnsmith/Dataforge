# DataForge AI v0.1.0-rc1 — Release Notes

This is the first Release Candidate (RC1) package for DataForge AI.

---

## 1. Overview
DataForge AI v0.1.0-rc1 focuses on production readiness, dependency isolation, security hardening, and performance certification. The backend runs on NestJS (Railway) and the frontend on Next.js (Vercel), using Supabase Postgres and Upstash Redis.

---

## 2. Deployment URLs
- **Frontend App:** [https://web-avins-projects-94a43281.vercel.app](https://web-avins-projects-94a43281.vercel.app)
- **Backend API:** [https://api-production-e4ad.up.railway.app/api](https://api-production-e4ad.up.railway.app/api)

---

## 3. What is Included
- **Prisma Schema & Migrations:** Complete relational database schema matching datasets, versions, lineage, and vector embeddings.
- **Double-Submit Cookie CSRF Middleware:** Protection on all modifying requests (POST, PUT, DELETE, PATCH).
- **Helmet Security Configuration:** Custom Connect Security Policy (CSP), Referrer-Policy, and Permissions-Policy.
- **Wallet Auth Nonce Handshake:** Cryptographic Ed25519 signature checks using Aptos SDK.
- **Sentry Integration:** SDKs configured for silent fallback.
- **Structured Logging:** Contextual logs containing unique UUID request IDs.

---

## 4. Verified Systems
- **Railway & Vercel Containers:** Successfully verified.
- **Supabase Postgres & pgvector:** 100% operational.
- **Upstash Redis & BullMQ:** Active background reindexing queues.
- **Live Gemini Embeddings:** Generated 3072-dimensional vectors using `gemini-embedding-001` and calculated pgvector cosine similarity.

---

## 5. Security Hardening
- Enforced HttpOnly, Secure, and SameSite=Lax session cookies.
- Added strict CORS domain bindings (wildcards are blocked).
- Enforced strict 25 MB payload size limits.
- Audited 52 vulnerabilities (all high severity risks are accepted or dev-only).

---

## 6. Dataset Lifecycle Validation
- E2E dataset creation, file upload, version publishing, manifest generation, and byte integrity download verify completely.

---

## 7. Known Limitations & Deferred Post-RC1 Items
- **Petra Browser E2E:** Requires manual extension popup approval (Formally deferred).
- **Sentry Dashboard Logging:** Requires active DSN keys (Waived for RC1).
- **Shelby Live Storage:** Requires funded Aptos wallets and published packages (Deferred).

---

## 8. Smoke Test Result
- **Result:** **14 / 14 Checks Passed successfully** (All production endpoints verify E2E).
