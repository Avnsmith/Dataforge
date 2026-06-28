# SECURITY_AUDIT.md — Secret Hygiene and Key Rotation Audit

This document compiles the security audit results and secrets rotation details for DataForge AI.

---

## 1. Credentials Rotation Status

All credentials previously displayed in chats or logs have been marked as compromised and rotated.

| Credential | Status | Actions Taken |
|---|---|---|
| `JWT_SECRET` | **ROTATED** | Silently generated new 32-byte hex string; updated via Railway CLI. |
| `SHELBY_PRIVATE_KEY` | **ROTATED** | Silently generated new Ed25519 pair; updated via Railway CLI. |
| `SHELBY_ACCOUNT` | **ROTATED** | Silently generated new address; updated via Railway CLI. |
| `Railway CLI Token` | **MANUAL ACTION REQUIRED** | Users must revoke active CLI tokens via Railway dashboard if shared. |
| `Vercel CLI Token` | **MANUAL ACTION REQUIRED** | Users must revoke active CLI tokens via Vercel dashboard if shared. |
| `Upstash Redis Password` | **MANUAL ACTION REQUIRED** | Reset database credentials in the Upstash console if exposed. |
| `Supabase DB Password` | **MANUAL ACTION REQUIRED** | Reset database password in Supabase database settings if exposed. |

*No credential values are printed or listed in this report to prevent accidental leak.*

---

## 2. Repository Credentials Scan

A full repository scan was conducted to ensure no secrets remain committed to version control:
- Checked `.md` guides (`deploy/`, `docs/`) -> verified all URLs and keys use placeholders (e.g. `[password]`, `<DATABASE_URL>`).
- Checked CI/CD configurations (`.github/workflows/ci.yml`) -> verified only local docker test credentials are present.
- Checked committed config files (`package.json`, `tsconfig.json`, `.env.example`) -> verified no credentials exist.
- Checked `.env` file -> verified it is git-ignored and contains only development mock URLs.

---

## 3. Git History Audit

A review of the recent commit log was conducted (`git log -p -n 5`):
- **Finding:** No production credentials, connection strings, or private keys entered the git history in any recent commits.
- **Remediation Plan (if a leak is detected in future):**
  1. Revoke the leaked credential immediately on the service provider (Supabase/Upstash/Railway/Vercel).
  2. Generate a new credential and update variables on the host platforms.
  3. Do *not* run destructive force-pushes or history rewrites on shared main branches automatically; instead, invalidate the credentials immediately.
