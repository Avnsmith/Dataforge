# DataForge AI — Release Checklist

Use this checklist before every production release.

## Pre-Deploy

- [ ] All env vars are set in the deployment environment (see `deploy/README.md`)
- [ ] `JWT_SECRET` is a strong random secret (min 32 chars)
- [ ] `FRONTEND_ORIGIN` matches the deployed frontend URL
- [ ] `DATABASE_URL` points to production database
- [ ] `REDIS_URL` points to production Redis
- [ ] `SHELBY_MODE` is set correctly (`mock` or `live`)

## Build

- [ ] `npm ci` completes without errors
- [ ] `npm run build` completes without errors
- [ ] `npm test --workspace=apps/api` — all tests pass

## Database

- [ ] Run migrations: `npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma`
- [ ] Verify row counts match expectations
- [ ] Confirm pgvector extension is enabled in production DB

## Deployment

- [ ] API starts successfully
- [ ] `GET /api/health` returns `status: ok`
- [ ] Frontend loads without JS errors
- [ ] CORS is correctly configured (no cross-origin errors)

## Smoke Tests

```bash
bash scripts/smoke-test.sh http://your-api-domain/api
```

- [ ] Health passes
- [ ] Auth endpoint works
- [ ] Dataset list returns data
- [ ] Search returns results

## Security

- [ ] No secrets in version control
- [ ] Security headers present (`X-Content-Type-Options`, `X-Frame-Options`, etc.)
- [ ] Rate limiting active
- [ ] File upload limit enforced
- [ ] Path traversal returns 400
- [ ] Invalid wallet returns 400

## Rollback Notes

1. To rollback schema: `npx prisma migrate resolve --rolled-back <migration_name>`
2. To rollback deployment: redeploy previous Docker image tag
3. Shelby mock storage files are persistent — no rollback needed
4. Redis queues: drain or flush with `redis-cli FLUSHDB` if needed

## Known Limitations at Release

- Shelby provider: **MOCK** (local storage only)
- Semantic search embeddings: **MOCK** (random vectors)
- No live Shelby upload/download verified
