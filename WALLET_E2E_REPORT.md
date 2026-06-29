# Wallet Authentication E2E Validation Report — DataForge AI (RC1)

This report validates the end-to-end cryptographic wallet authentication workflow using real Aptos keypair cryptography and secure session cookie storage.

---

## 1. Handshake Flow Status

| Scenario | Status | Verification Source | Evidence / Details |
|---|---|---|---|
| **Aptos Wallet Connect** | **Pending Live Validation** | Petra adapter integration | Frontend modal and Petra hooks configured; browser test required |
| **Request Nonce** | **Test Verified** | `POST /auth/nonce` | Returns `32-char` random hex token with 5-minute database expiry in E2E tests |
| **Message Signing** | **Test Verified** | Ed25519 signature payload | Cryptographic signature string verified off-chain using testnet keys |
| **Signature Verify** | **Test Verified** | `POST /auth/verify` | `@aptos-labs/ts-sdk` validates derived public key in `auth.e2e.spec.ts` |
| **Cookie Creation** | **Test Verified** | HttpOnly header response | Sets `df_token` cookie as `HttpOnly; Secure; SameSite=Lax` in E2E tests |
| **Replay Protection** | **Test Verified** | Invalidation test | Re-requesting auth with same nonce/signature fails with 403/400 in E2E tests |
| **Expired Nonce Rejection**| **Test Verified** | Expiry time test | Nonces older than 5 minutes fail to verify, raising BadRequestException |

---

## 2. E2E Manual Browser Verification Checklist (Petra Wallet)

When executing verification manually in non-headless browser profiles:
1. Open the Vercel Staging website URL.
2. Click **Connect Wallet** in the top navigation bar.
3. Select **Petra Wallet** from the connect dialog options.
4. Petra Wallet extension popup opens; click **Approve** to authorize connection.
5. Prompted to sign a message containing the random 32-character nonce. Click **Sign**.
6. Verify that navigation actions retrieve and render user profile data.
7. Click **Logout** and check that cookie `df_token` is cleared from browser storage.
8. Re-request signature authorization using the same nonce to verify rejection.
