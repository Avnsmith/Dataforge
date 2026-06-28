# Deploying DataForge Backend to Render

Render is a unified platform for hosting backend APIs, background workers, and static sites. We deploy the NestJS API application (`apps/api`) as a Render Web Service.

---

## 1. Render Service Configuration

1. Log into your [Render Dashboard](https://dashboard.render.com/).
2. Click **New** -> **Web Service**.
3. Link your GitHub repository.
4. Set the following base configuration properties:
   - **Name:** `dataforge-api`
   - **Language:** `Node`
   - **Region:** Choose a region matching your Supabase/Upstash setups (e.g. `Singapore` or `Oregon`).
   - **Branch:** `main` (or active development branch)
   - **Root Directory:** `/` (leave empty / default monorepo root)

---

## 2. Build & Start Commands

Configure these parameters under the service settings:

- **Build Command:**
  ```bash
  npm install && npm run build --workspace=apps/api
  ```
  *(If the build fails due to monorepo package compilation ordering, use: `npm install && npm run build`)*

- **Start Command:**
  To run database migrations automatically on startup before binding to the port:
  ```bash
  npm run db:migrate:deploy && npm run start --workspace=apps/api
  ```

- **Port Mapping:**
  Render automatically sets the `PORT` environment variable. The NestJS API binds to `process.env.PORT || 4000` automatically. Do NOT hardcode the port.

---

## 3. Required Environment Variables

Set the following variables on the Render web service:

| Variable | Value | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:[password]@db.[ref].supabase.co:6543/postgres?pgbouncer=true` | Supabase connection pooling string |
| `REDIS_URL` | `rediss://default:[password]@db-[ref].upstash.io:6379` | Upstash Redis connection string (TLS enabled) |
| `JWT_SECRET` | `your-secure-rotated-jwt-secret-string` | Rotated strong signing secret |
| `FRONTEND_ORIGIN` | `https://dataforge-web.vercel.app` | Rotated Vercel frontend URL |
| `SHELBY_MODE` | `mock` or `live` | Storage mode |
| `SHELBY_NETWORK` | `shelbynet` | On-chain registry network name |
| `SHELBY_EXPLORER_BASE_URL` | `https://explorer.shelby.xyz/shelbynet` | Explorer base URL |
| `SHELBY_STORAGE_DIR` | `/app/storage` | Path for mock file writes |
| `MAX_UPLOAD_FILE_SIZE_MB` | `25` | Max upload size limit |
| `NODE_ENV` | `production` | Production environment flag |
| `EMBEDDING_MODE` | `mock` | Embeddings mode |

#### Optional Live Shelby Credentials:
If `SHELBY_MODE=live`, these are also required:
- `SHELBY_PRIVATE_KEY` (e.g. `0x...` or `ed25519-priv-0x...` format)
- `SHELBY_ACCOUNT` (derived wallet address)
- `SHELBY_RPC_URL` (e.g. `https://rpc.shelby.xyz`)
- `SHELBY_API_KEY` (optional)

---

## 4. Ephemeral Filesystem Warning & Persistent Disk

> [!WARNING]
> By default, Render containers have **ephemeral filesystems**. In `SHELBY_MODE=mock`, uploaded dataset files are stored locally in the container. These files will be **lost** on every redeployment, server restart, or system configuration change.

### How to Attach a Persistent Disk:
1. Go to the **Disks** tab in the settings of your Render Web Service.
2. Click **Add Disk**.
3. Configure the disk settings:
   - **Name:** `dataforge-storage`
   - **Mount Path:** `/app/storage`
   - **Size:** `1 GB` (or larger depending on your needs)
4. Ensure the environment variable is set to:
   ```ini
   SHELBY_STORAGE_DIR=/app/storage
   ```
Render will mount the persistent block storage volume to the specified mount path. File writes will survive backend server restarts and new build rollouts.
