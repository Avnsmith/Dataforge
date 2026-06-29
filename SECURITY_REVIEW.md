# Production Security Hardening & Dependency Audit Report — DataForge AI (RC1)

This report reviews the security policies, headers, cookie configs, and dependency audits executed for the RC1 release.

---

## 1. Security Enhancements Implemented

### CSRF Protection (Double Submit Cookie) — **TEST VERIFIED**
- Enabled `CsrfMiddleware` to inspect all modifying HTTP requests (POST, PUT, DELETE, PATCH).
- Exempts safe requests (GET, HEAD, OPTIONS) and login routes (`/auth/nonce`, `/auth/verify`, `/auth/wallet`).
- Verifies that `XSRF-TOKEN` cookie matches `x-xsrf-token` (or `x-csrf-token`) header.
- Verified by automated E2E test suite in [`csrf.e2e.spec.ts`](file:///Users/vinh/Documents/Shelby/apps/api/src/auth/csrf.e2e.spec.ts).

### Helmet & Security Headers — **PRODUCTION VERIFIED**
- **Content Security Policy (CSP):** Restricts script, font, and style injection sources. Configured to allow self-hosted endpoints, fonts, and avatar providers.
- **Permissions Policy:** Blocked unrequired API capabilities: `camera=(), microphone=(), geolocation=()`.
- **Referrer Policy:** Enforced `strict-origin-when-cross-origin`.

---

## 2. Authentication & Authorization Review

- **JWT Session Configuration:** Expiration set to 7 days (`7d`). JWT secret loaded securely from environment variable (`JWT_SECRET`).
- **Cookie Attributes:** Issued `df_token` cookie configured as `HttpOnly; Secure; SameSite=Lax` in staging and production.
- **CORS Configuration:** Allowed origins are loaded dynamically from environment configurations (`FRONTEND_ORIGIN`, `ADDITIONAL_FRONTEND_ORIGINS`), preventing wildcards (`*`) in staging/production.

---

## 3. Dependency Vulnerability Audit

The `npm audit` run reported **52 vulnerabilities** (8 high, 41 moderate, 3 low). Below is the classification of each vulnerability:

### Next.js (`next`) — **ACCEPTED RISK**
- **Reason:** Upgrading Next.js to v15.x is a major breaking change requiring extensive App Router refactoring.
- **Exploitability:** Low. The Next.js image optimization is restricted to local self-hosted assets, and Server Components are isolated behind secure auth hooks.
- **Monitoring Plan:** Monitor server container CPU and memory metrics on Vercel.
- **Future Fix Path:** Schedule a complete framework upgrade to Next.js 15 in the next sprint.

### Lodash (`lodash`) — **ACCEPTED RISK**
- **Reason:** Transitive dependency imported by `@nestjs/config`.
- **Exploitability:** Non-exploitable. The application does not pass user-controlled input to lodash functions.
- **Monitoring Plan:** Monitor NestJS container crash events.
- **Future Fix Path:** Add dependency overrides in `package.json` on the next NestJS framework upgrade.

### Multer (`multer`) — **ACCEPTED RISK**
- **Reason:** Multer is used only for uploading dataset files.
- **Exploitability:** Low. Gated strictly by `AuthGuard` (authenticated wallets only) and constrained by a `25 MB` upload size limit.
- **Monitoring Plan:** Trace disk write speeds and file size logs.
- **Future Fix Path:** Migrate to specialized streaming packages like Busboy.

### Picomatch (`picomatch`) / Tmp (`tmp`) / Webpack (`webpack`) — **DEV-ONLY**
- **Reason:** Only active during local compilation and build steps.
- **Exploitability:** Non-exploitable in production runtime.
- **Monitoring Plan:** None required.
- **Future Fix Path:** Upgraded automatically during devDependencies updates.
