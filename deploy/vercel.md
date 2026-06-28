# Deploying DataForge Frontend to Vercel

Vercel is the official platform for hosting the Next.js frontend (`apps/web`) in production. The NestJS backend API is hosted on Railway, and database and Redis instances are hosted on Supabase and Upstash.

---

## 1. Vercel Project Configuration

To import the project into Vercel, follow these settings:

1. **Import Repository:**
   - Link your GitHub repository in the Vercel Dashboard.
2. **Root Directory Configuration:**
   - In the import screen, set **Root Directory** to `apps/web`.
   - Keep the framework preset as **Next.js**.
3. **Monorepo Settings:**
   - Vercel automatically detects the root `package.json` workspace structure and uses it for compilation.

---

## 2. Environment Variables

Add the following variables in the Vercel dashboard:

| Variable | Value | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api-production-e4ad.up.railway.app/api` | The public endpoint of your backend NestJS API on Railway |
| `NEXT_PUBLIC_SENTRY_DSN` | *(Optional)* `https://...` | Public Sentry DSN for frontend client-side tracking |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | `production` | Sentry environment name |

> [!CAUTION]
> **Zero Private Credentials:**
> Do NOT set the following environment variables in Vercel. These are server-only secrets and must only exist on Railway:
> - `DATABASE_URL` / `DIRECT_URL`
> - `REDIS_URL`
> - `JWT_SECRET`
> - `SHELBY_PRIVATE_KEY` / `SHELBY_API_KEY`

---

## 3. Build & Development Settings

In the Vercel project settings, configure the following custom build parameters:

- **Build Command:**
  - If building from the root of the workspace:
    ```bash
    npm run build --workspace=apps/web
    ```
- **Output Directory:**
  ```
  .next
  ```
- **Install Command:**
  ```bash
  npm ci
  ```

---

## 4. CORS Integration (Railway Backend Sync)

After Vercel generates your production frontend URL (e.g. `https://web-avins-projects-94a43281.vercel.app`), configure it on your Railway Backend API service:

```ini
FRONTEND_ORIGIN=https://web-avins-projects-94a43281.vercel.app
ADDITIONAL_FRONTEND_ORIGINS=https://web-hnxtj388m-avins-projects-94a43281.vercel.app,https://web-6qh7huke6-avins-projects-94a43281.vercel.app
```
Railway will allow incoming CORS requests from your Vercel client origin.
