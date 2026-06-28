# Shelby Integration Status

> Last updated: 2026-06-28

## Summary

| Component | Status |
|---|---|
| Mock Shelby Provider | ✅ IMPLEMENTED |
| Live Shelby Provider | 🔶 STUB — not verified |
| Official SDK | 🔍 Not yet confirmed |

---

## Mock Provider — IMPLEMENTED

**Package**: `packages/shelby/src/index.ts`

**Behavior**:
- Stores files under `packages/shelby/storage/{owner}/{slug}/{version}/{path}`
- SHA-256: `SHA256(file bytes)`
- Merkle Root: `SHA256("shelby-merkle:" + sha256)`
- Blob name: `datasets/{owner}/{slug}/{version}/{path}`
- Explorer URL: `{SHELBY_EXPLORER_BASE_URL}/blob/{blobName}`
- All metadata is deterministic and locally generated
- No real Shelby network communication

**Methods implemented (MOCK)**:
- `uploadDatasetFile()` ✅
- `uploadManifest()` ✅
- `buildShelbyBlobName()` ✅
- `downloadDatasetFile()` ✅
- `getBlobMetadata()` ✅
- `verifyBlob()` ✅

---

## Live Provider — STUB

**Status**: The live provider is stubbed. Calling any live method throws:
```
Shelby live mode is not configured. Set SHELBY_MODE=mock or configure official Shelby SDK credentials.
```

**To enable live Shelby**:
1. Confirm official SDK package name from https://docs.shelby.xyz
2. Install: `npm install @shelby/sdk` (or equivalent)
3. Implement `uploadDatasetFile` using SDK
4. Test against Shelby testnet with real credentials
5. Mark this document as `LIVE VERIFIED`

---

## SDK Audit Results

Reviewed: https://docs.shelby.xyz, https://shelby.xyz

| Finding | Status |
|---|---|
| Official npm SDK | Not found in public registry (as of 2026-06-28) |
| REST API documentation | Partial — upload endpoints not fully documented |
| Auth mechanism | Aptos wallet signature required |
| Blob storage format | `datasets/{walletAddress}/{slug}/{version}/{path}` |
| Explorer URL format | `https://explorer.shelby.xyz/shelbynet/blob/{blobName}` |
| Testnet availability | https://rpc.shelby.xyz (unverified) |

---

## Next Steps for Live Integration

1. **Obtain testnet credentials** — Aptos wallet + private key with Shelby testnet access
2. **Confirm SDK availability** — Check `@shelby/client` or `shelby-sdk` on npm
3. **Implement live upload** using HTTP REST or official SDK
4. **Test E2E**: upload a real file → download → verify SHA256 matches
5. **Update this doc** with LIVE VERIFIED status

---

> **Honesty note**: DataForge AI is production-prepared and still running on a mock Shelby provider.
> Do not claim live Shelby works until Step 4 above is completed and verified.
