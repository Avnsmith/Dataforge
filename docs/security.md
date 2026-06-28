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

All production credentials must be rotated immediately if exposed in chat transcripts, logs, or commit histories.

### A. JWT_SECRET Rotation
`JWT_SECRET` signs user session tokens. Rotating it invalidates all current user sessions, forcing users to re-login.

1. Generate a new cryptographically secure 32-byte hex key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Update the `JWT_SECRET` variable on the Railway console for the `api` service.
3. Railway will automatically redeploy the backend container with the new key.

### B. Supabase Database Password Rotation
1. Go to the [Supabase Dashboard](https://supabase.com).
2. Navigate to **Settings** -> **Database**.
3. Under **Database password**, click **Reset database password** and copy the new password.
4. Update `DATABASE_URL` and `DIRECT_URL` on Railway with the new password.
   *Example:*
   - `DATABASE_URL=postgresql://postgres.<project_id>:<new_password>@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true`
   - `DIRECT_URL=postgresql://postgres.<project_id>:<new_password>@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`

### C. Upstash Redis Credentials Rotation
1. Go to the [Upstash Console](https://console.upstash.com).
2. Select your Redis database.
3. In the database details, scroll to **Credentials** and click **Reset Password**.
4. Copy the new TLS URL (`rediss://...`).
5. Update the `REDIS_URL` variable on Railway.

### D. Railway / Vercel CLI Tokens Rotation
If a developer token is compromised:
- **Railway:** Run `railway logout` and regenerate personal access tokens in your Railway account settings.
- **Vercel:** Go to Vercel Dashboard -> **Account Settings** -> **Tokens**, revoke the active token, and run `vercel login` to create a fresh session.
