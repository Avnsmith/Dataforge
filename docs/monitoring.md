# DataForge AI — Monitoring & Sentry Observability

This document details the configuration, initialization, and verification of Sentry monitoring for the backend (NestJS) and frontend (Next.js).

---

## 1. Sentry Backend Integration (NestJS)

The backend utilizes the official `@sentry/nestjs` SDK.

### A. Initialization
Sentry is initialized in `apps/api/src/instrument.ts` and imported at the very top of `apps/api/src/main.ts` before any other module loads:

```typescript
import * as Sentry from '@sentry/nestjs';

const dsn = process.env.SENTRY_DSN;
if (dsn && dsn.trim() !== '') {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || 'production',
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
  });
}
```

### B. Global Exception Filtering
Uncaught controller/HTTP exceptions are automatically reported via `SentryGlobalFilter` registered in `apps/api/src/app.module.ts`:

```typescript
{
  provide: APP_FILTER,
  useClass: SentryGlobalFilter,
}
```

### C. Background Jobs / BullMQ Worker Instrumentation
Background worker exception handling is explicitly instrumented in `apps/api/src/versions/upload.processor.ts` to capture pipeline failures:

```typescript
try {
  // Processor logic...
} catch (error) {
  Sentry.captureException(error);
  throw error;
}
```

### D. Silent/Safe Disable Behavior
- If `SENTRY_DSN` is empty or missing, Sentry is not initialized.
- The global filter and background worker captures will safely no-op without crashing the application.
- Local development defaults to disabled.

---

## 2. Sentry Frontend Integration (Next.js)

The frontend uses the official `@sentry/nextjs` SDK, configured across client, server, and edge environments.

### A. Configuration Files
- `apps/web/sentry.client.config.ts`
- `apps/web/sentry.server.config.ts`
- `apps/web/sentry.edge.config.ts`

These check for the public variable `NEXT_PUBLIC_SENTRY_DSN` and environment `NEXT_PUBLIC_SENTRY_ENVIRONMENT` and initialize Sentry if set.

### B. Next Config wrapper
Sentry webpack compilation is registered in `apps/web/next.config.js`:
```javascript
const { withSentryConfig } = require('@sentry/nextjs');
module.exports = withSentryConfig(nextConfig, { silent: true });
```
Setting `silent: true` prevents source map upload warning logs from failing production builds when Sentry auth tokens are not configured in CI.

---

## 3. Post-Rotation Verification

To verify that the application operates correctly after rotating any environment variables or deploying Sentry:

1. Deploy the backend to Railway.
2. Deploy the frontend to Vercel.
3. Execute the integration smoke test:
   ```bash
   bash scripts/production-smoke-test.sh \
     https://api-production-e4ad.up.railway.app/api \
     https://web-avins-projects-94a43281.vercel.app
   ```
4. Verify that all 14/14 checks pass, database/redis dependencies report `connected`, and the system performs mock Shelby uploads successfully.
