# Deploying DataForge Database to Supabase

Supabase is the recommended hosting platform for the PostgreSQL database in production. It provides built-in pgvector support, auto-scaling connection pooling, and standard SSL enforcement.

---

## 1. Supabase Project Setup

1. Log into your [Supabase Dashboard](https://supabase.com/dashboard/).
2. Click **New Project** and select your Organization.
3. Configure your project details:
   - **Name:** `dataforge-db`
   - **Database Password:** (Generate a strong random password and save it securely)
   - **Region:** Select the closest region to your Render backend API service (e.g., `Singapore` or `US East`).
4. Wait 2–3 minutes for the project database to be fully provisioned.

---

## 2. Enabling pgvector Extension

DataForge uses vector similarity search for dataset discoverability. Whitelist the extension in the Supabase Database dashboard:

1. Navigate to **Database** -> **Extensions** in the left sidebar.
2. Search for `vector` (`pgvector`).
3. Click the toggle to enable the extension in the `public` schema.

---

## 3. Database Connection URLs

Prisma requires two separate connection modes depending on the environment:

### A. Connection Pooling (Render API Backend runtime)
To handle serverless scalability, use the **Transaction Mode** pooled URL (usually port `6543` with `?pgbouncer=true` query parameter):
```ini
DATABASE_URL="postgresql://postgres:[password]@db.[project-ref].supabase.co:6543/postgres?pgbouncer=true&connection_limit=1"
```

### B. Direct Connection (Running Migrations & Seeds)
When running migrations (`prisma migrate deploy`) or seeding the database from your local machine, use the **Direct Connection URL** (port `5432` pointing directly to the Postgres instance without PgBouncer):
```ini
DIRECT_URL="postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres"
```

*Note: In `packages/db/prisma/schema.prisma`, ensure that the datasource has both `url` and `directUrl` properties configured if connection pooling is active.*

---

## 4. Run Migrations & Seeds

From the root directory of the monorepo, deploy the database schema and insert seed records:

### Apply Database Migrations:
```bash
DATABASE_URL="postgresql://postgres:[password]@db.[project-ref].supabase.co:6543/postgres?pgbouncer=true" \
DIRECT_URL="postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres" \
npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma
```

### Seed initial Bob and Alice users:
```bash
DATABASE_URL="postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres" \
npm run seed --workspace=packages/db
```

---

## 5. Troubleshooting & Best Practices

### Problem: Migration hangs or fails with P1001 / P2026 SSL Error
- **Cause:** Supabase enforces SSL by default, but local Node.js environments may require explicit trust root parameters.
- **Fix:** Append `&sslmode=require` to your connection URLs.
  ```ini
  DATABASE_URL="postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres?sslmode=require"
  ```

### Problem: Prisma throws "Transaction query timeout" under PgBouncer
- **Cause:** PgBouncer is in Transaction mode, which does not support prepared statements.
- **Fix:** Append `&pgbouncer=true` to the Transaction connection string. This tells Prisma to bypass prepared statements.
