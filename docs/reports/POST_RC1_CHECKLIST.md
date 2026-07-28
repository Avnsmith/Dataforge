# Post-RC1 Verification Checklist — DataForge AI

This checklist tracks prioritized deployment verification and operational onboarding tasks for the post-RC1 observation window.

> [!IMPORTANT]
> **Scope Lock Policy:**
> - No new major features are allowed before the RC1 observation window is completed.
> - The focus must remain entirely on credentials, verification, and hardening.

---

## Priority 1 — Critical Live Handshakes

### [ ] Sentry DSN Verification
- [ ] Configure `SENTRY_DSN` in Railway.
- [ ] Configure `NEXT_PUBLIC_SENTRY_DSN` in Vercel.
- [ ] Trigger test exceptions and verify events on Sentry dashboard.

### [ ] Petra Browser E2E Handshake
- [ ] Connect Petra Wallet extension in staging.
- [ ] Verify signed nonce and session cookie emission.

---

## Priority 2 — External Adapters & Upgrades

### [ ] Shelby Live Network Validation
- [ ] Funded Aptos mainnet/testnet wallet credentials.
- [ ] Verify live file blobs and manifests publishing on the blockchain network.

### [ ] Production Semantic Search Rollout
- [ ] Provision `GEMINI_API_KEY` on production backend.
- [ ] Turn `AUTH_MODE=wallet` and `ENABLE_SEMANTIC_SEARCH=true` on production.

### [ ] Dependency Upgrades
- [ ] Upgrade Next.js to v15.x.
- [ ] Upgrade NestJS to v11.x to resolve remaining security warnings.

---

## Priority 3 — Stable Release Preparation

### [ ] v0.1.0 Stable Release Notes
- [ ] Publish documentation.
- [ ] Finalize public launch copies. Onboard initial platform developers.
