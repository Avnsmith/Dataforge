# OBSERVABILITY.md — Monitoring and Logging Audit

This document compiles the observability metrics, logging configurations, and exception monitoring setup for DataForge AI.

---

## 1. Sentry Configuration Status

Sentry is integrated and ready on both NestJS and Next.js platforms.

- **SENTRY_STATUS:** `Configuration Verified`
- **SENTRY_VERIFICATION:** `DSN missing` (Live DSN variables are left unconfigured/empty on the host platforms, meaning no active dashboard events were generated). Sentry has been formally waived as a release blocker for RC1.

### Safe Fallback Behavior
- Sentry checks if `SENTRY_DSN` is empty or absent. If so, it disables itself silently.
- Sentry checks if `NEXT_PUBLIC_SENTRY_DSN` is empty or absent. If so, it disables itself silently.
- The app runs normally without crashing in both cases.

---

## 2. Request ID & Structured Logging

The API uses a request ID middleware and a custom logging interceptor:

### Request ID Middleware
- Generates a unique UUID v4 for each incoming request and sets the `x-request-id` response header.
- Available on the request object for contextual logs.

### Logging Interceptor
- Intercepts requests and logs `method`, `url`, `statusCode`, `latency` (in ms), `requestId`, and `user` ID (truncated wallet address) in a structured format.
- **Production Safety:** Sensitive credentials (`Authorization` header, cookies, database URLs, Redis passwords, private keys, uploaded file contents) are **never** logged.
- **Error Stack Traces:** For 500+ Internal Server Errors, the full error stack trace is logged in the server console to allow debugging.
- For client-side errors (4xx), a lightweight warn log without a stack trace is outputted to keep server logs clean.

---

## 3. Gated Test Endpoint
- A test endpoint is exposed at `/api/sentry-test` to generate test exceptions.
- **Safety Gate:** This route is blocked when running in production:
  ```typescript
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Forbidden: Sentry test endpoint is disabled in production environment');
  }
  ```
  ```
