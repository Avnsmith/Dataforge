# DataForge AI — Security & Secret Rotation Policy

This document outlines the security policies, environment variable placement rules, and secret rotation procedures for DataForge AI.

---

## 1. Environment Variable Placement Rules

To prevent accidental credential leaks:
- **Private Env Vars (Backend API / Railway only):** Must *never* be added to Vercel. These variables are handled securely on the server side.
- **Public Env Vars (Vercel only):** Frontend variables must be prefixed with `NEXT_PUBLIC_` to be bundled in the Next.js static build. Do not expose backend credentials here.

| Variable | Target Platform | Scope / Reason |
|---|---|---|
| `DATABASE_URL` | Railway | Private connection URL (Supabase pooled port `6543`) |
| `DIRECT_URL` | Railway | Private connection URL (Supabase direct port `5432` for migrations) |
| `REDIS_URL` | Railway | Private connection string (Upstash TLS `rediss://`) |
| `JWT_SECRET` | Railway | Private token signature key |
| `SHELBY_PRIVATE_KEY` | Railway | Private key for live Shelby uploads |
| `SENTRY_DSN` | Railway | Sentry DSN for backend exception logging |
| `NEXT_PUBLIC_API_URL` | Vercel & Railway | Public API endpoint of the backend |
| `NEXT_PUBLIC_SENTRY_DSN` | Vercel | Public Sentry DSN for client exception logging |

---

## 2. Secret Rotation Policy & Procedures

All production credentials must be rotated immediately if exposed.

### A. JWT_SECRET Rotation (Automated)
`JWT_SECRET` signs user session tokens.
1. Run the silent rotation script:
   ```bash
   node scratch/silent_rotate.js
   ```
2. Railway will automatically redeploy the backend container with the new key.

### B. Supabase Database Password Rotation (Manual Action Required)
Supabase database passwords can only be changed via the Supabase web dashboard.
1. Go to the [Supabase Dashboard](https://supabase.com).
2. Click on your project **DataForge**.
3. In the left navigation bar, go to **Settings** (gear icon) -> **Database**.
4. Scroll down to **Database password** and click **Reset database password**.
5. Copy the newly generated password.
6. derived connections: Update the `DATABASE_URL` (port 6543 pooled connection) and `DIRECT_URL` (port 5432 direct connection) on your Railway variables settings.
7. Run migrations to verify:
   ```bash
   npm run db:migrate:deploy
   ```

### C. Upstash Redis Credentials Rotation (Manual Action Required)
Upstash Redis credentials are changed via the Upstash dashboard.
1. Go to the [Upstash Console](https://console.upstash.com).
2. Click on your Redis database.
3. In the database details screen, scroll to **Credentials** and click **Reset Password**.
4. Copy the new TLS connection string (`rediss://...`).
5. Update `REDIS_URL` in the Railway environment variables.

### D. Railway / Vercel CLI Tokens Rotation (Manual Action Required)
If CLI session tokens are compromised:
- **Railway:** Navigate to **Account Settings** -> **Tokens** on the Railway dashboard, revoke the active CLI token, and run `railway logout` followed by `railway login`.
- **Vercel:** Navigate to Vercel Dashboard -> **Account Settings** -> **Tokens**, revoke the active token, and run `vercel login` to authorize a new session.
