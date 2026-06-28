# Deploying DataForge Redis to Upstash

Upstash provides a fully managed serverless Redis database with automatic scaling, per-request billing, and built-in TLS encryption.

---

## 1. Upstash Redis Setup

1. Log into the [Upstash Console](https://console.upstash.com/redis).
2. Click **Create Database**.
3. Configure database settings:
   - **Name:** `dataforge-redis`
   - **Type:** `Standard` (suitable for queues and caching)
   - **Region:** Select the same cloud region as your Render backend (e.g. `ap-southeast-1` or `us-east-1` to minimize latency).
   - **TLS (SSL):** Enable (tick the box).
4. Click **Create** and wait for the dashboard to render connection credentials.

---

## 2. Connection URL Format

To connect your Render NestJS backend, retrieve the Redis URL from the database overview page:

1. Locate the **Node.js / Redis Client** code samples, or scroll to the **Configuration** section.
2. Select **Redis URL**.
3. Copy the secure connection string:
   ```ini
   REDIS_URL="rediss://default:[password]@db-[ref].upstash.io:6379"
   ```

> [!IMPORTANT]
> Always verify that the connection string starts with `rediss://` (with a double `s`) to enforce TLS encryption. If the backend fails to initialize the Redis handshake, check that `rediss://` is configured.

---

## 3. BullMQ Queue Compatibility

DataForge uses BullMQ for file processing queues (`upload-queue`). BullMQ communicates with Redis using the `ioredis` driver.

### TLS Handshake Settings
In standard configurations, `ioredis` requires no additional parameters to support Upstash TLS when `rediss://` is supplied. If you encounter certificate authority errors in the backend logs, set the connection configuration to bypass certificate rejection or use a trusted store:

```typescript
// apps/api/src/app.module.ts (or redis module initialization)
BullModule.forRootAsync({
  useFactory: (configService: ConfigService) => ({
    connection: {
      url: configService.get<string>('REDIS_URL'),
      tls: {
        rejectUnauthorized: false // Bypasses self-signed certificate constraints if needed
      }
    }
  })
})
```
*(DataForge's runtime package has built-in connection resilience to handle Upstash TLS configurations automatically).*
