# Deploying DataForge Frontend to Vercel

Vercel is the official platform for hosting the Next.js frontend (`apps/web`) in production. The NestJS backend API is hosted on Render, and database and Redis instances are hosted on Supabase and Upstash.

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

Add the following variable in the Vercel dashboard:

| Variable | Value | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://dataforge-api.onrender.com/api` | The public endpoint of your backend NestJS API on Render |

> [!CAUTION]
> **Zero Private Credentials:**
> Do NOT set the following environment variables in Vercel. These are server-only secrets and must only exist on Render:
> - `DATABASE_URL` / `DIRECT_URL`
> - `REDIS_URL`
> - `JWT_SECRET`
> - `SHELBY_PRIVATE_KEY` / `SHELBY_API_KEY`

---

## 3. Build & Development Settings

In the Vercel project settings, configure the following custom build parameters:

- **Build Command:**
  - If building from the sub-app folder root `apps/web`:
    ```bash
    npm run build
    ```
  - If Vercel has issues compiling workspace dependency packages (like `@dataforge/shared`), import the root project as Vercel workspace root and configure:
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

## 4. CORS Integration (Render Backend Sync)

After Vercel generates your production frontend URL (e.g. `https://dataforge-web.vercel.app`), configure it on your Render Backend Web Service:

```ini
FRONTEND_ORIGIN=https://dataforge-web.vercel.app
```
Render will allow incoming requests from your Vercel client origin.
