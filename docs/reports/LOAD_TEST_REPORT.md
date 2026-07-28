# LOAD_TEST_REPORT.md — API Load Test & Benchmarking Report

This document reports the performance characteristics of DataForge AI under concurrent request load.

---

## 1. Benchmarking Scenario

- **Base URL:** `https://api-production-e4ad.up.railway.app/api`
- **Concurrency:** 20 concurrent requests per scenario
- **Test Scenarios:**
  1. `GET /health` (Verifies database query, Redis ping, and Shelby storage file operations)
  2. `POST /auth/wallet` (Verifies cryptographic wallet signing authentication)
  3. `GET /datasets` (Verifies raw select query from database)
  4. `GET /search?q=crypto` (Verifies full-text search indexing query)

---

## 2. Latency Metrics & Percentiles

| Scenario | Success Rate | Average Latency | p50 (Median) | p95 (95th %tile) | p99 (99th %tile) |
|---|---|---|---|---|---|
| `GET /health` | **100%** | 438.0ms | 436ms | 463ms | 463ms |
| `POST /auth/wallet` | **100%** | 83.2ms | 81ms | 99ms | 99ms |
| `GET /datasets` | **100%** | 219.7ms | 213ms | 279ms | 279ms |
| `GET /search` | **100%** | 173.8ms | 176ms | 181ms | 181ms |

---

## 3. Performance Analysis

### Database Connection Usage
- **Observations:** Supabase connection pooling (port `6543`) with `pgbouncer` works efficiently. Even with 20 concurrent queries, connection limit errors did not occur, and database latency remained stable under 220ms.

### Redis Latency
- **Observations:** Upstash TLS (`rediss://`) connection is highly responsive. Token creation and BullMQ metadata writes are processed within ~80ms.

### Healthcheck Complexity
- **Observations:** `GET /health` takes ~430ms because it executes concurrent pings to database, Redis, and filesystem write/delete operations in a single request. This is expected and acceptable for health monitoring.
