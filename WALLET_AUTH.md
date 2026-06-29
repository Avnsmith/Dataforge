# Cryptographic Wallet Signature Authentication (Aptos)

This document outlines the cryptographic wallet signature verification architecture and flows implemented in DataForge AI.

---

## 1. Authentication Flow

```
Client (Wallet)                      Backend (API)
      |                                    |
      | 1. Request Nonce (POST /nonce)     |
      |----------------------------------->|
      |                                    | 2. Generate random nonce
      |                                    |    Store in Redis (5 min TTL)
      | 3. Return Nonce ({ nonce })        |
      |<-----------------------------------|
      |                                    |
      | 4. Sign Message                    |
      |    "DataForge Login\nNonce:..."    |
      |                                    |
      | 5. Submit Sig (POST /verify)       |
      |----------------------------------->|
      |                                    | 6. Verify derived wallet address
      |                                    |    Verify signature (Aptos SDK)
      |                                    |    Consume nonce (One-time use)
      |                                    |    Create or Fetch User
      | 7. Return JWT & User               |
      |<-----------------------------------|
```

---

## 2. Nonce Schema & Lifecycles

Nonces are generated securely via `crypto.randomBytes(16).toString('hex')` and stored either in Redis (preferred) or PostgreSQL (fallback if Redis is down).

### Nonce Data Object Format:
```json
{
  "walletAddress": "0x1111111111111111111111111111111111111111111111111111111111111111",
  "nonce": "abcdefabcdefabcdefabcdefabcdefab",
  "createdAt": "2026-06-28T15:47:34.000Z",
  "expiresAt": "2026-06-28T15:52:34.000Z",
  "ip": "127.0.0.1",
  "userAgent": "Mozilla/5.0 ...",
  "used": false
}
```

### Replay & Expiration Protections:
- **One-time consumption:** Nonce is deleted from Redis or marked `used = true` in PostgreSQL immediately upon verification. Re-submitting the same nonce will fail.
- **5-minute expiration:** Nonce validation checks `expiresAt` against the current server time. If expired, validation fails.
- **Wallet binding:** The nonce is uniquely bound to the request's wallet address. Attempting to verify a signature with a mismatched nonce-wallet mapping is rejected.

---

## 3. Cryptographic Verification Methods

Signature verification uses the official `@aptos-labs/ts-sdk` client:
1. **Public Key Derivation:** To prevent address spoofing, the backend derives the Account Address from the submitted `publicKey` using `AuthenticationKey.fromPublicKey({ publicKey }).derivedAddress().toString()`. This must match the `walletAddress`.
2. **Signature Check:** Verify signature using `Ed25519PublicKey.verifySignature({ message, signature })`.

---

## 4. JWT Payload Structure

The JWT is signed using `JWT_SECRET` and contains:
```json
{
  "sub": "mock-user-uuid",
  "walletAddress": "0x11111111111111111111111111111111111111111111111111111111",
  "publicKey": "0x1111111111111111111111111111111111111111111111111111111111111111",
  "jti": "d0f85493-2947-494b-a25e-04f8ea59bbd0",
  "iat": 1782662054,
  "exp": 1783266854
}
```
*Note:* `jti` is a unique cryptographically random UUID v4 generated on each token creation to allow token revoking checks if needed.

---

## 5. Mock Mode vs Wallet Mode

- **`AUTH_MODE=mock` (Default):** The legacy endpoint `POST /auth/wallet` is used. It accepts the wallet address directly and bypasses cryptographic signatures. Ideal for local development, CI/CD testing, and staging fallbacks.
- **`AUTH_MODE=wallet`:** The endpoints `POST /auth/nonce` and `POST /auth/verify` are enforced. Direct address submission will fail with a `BadRequestException`.
