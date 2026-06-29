# Shelby Live Storage Integration & Abstraction

This document outlines the decentralized storage client architecture and integration status of Shelby Protocol.

---

## 1. Provider Abstraction

To ensure business logic is fully decoupled from the Shelby SDK, all application code interfaces exclusively through the `ShelbyProvider` contract:

```typescript
export interface ShelbyProvider {
  uploadDatasetFile(input: ShelbyUploadInput): Promise<ShelbyUploadResult>;
  downloadDatasetFile(input: ShelbyDownloadInput): Promise<Buffer>;
  downloadDatasetFileStream(input: ShelbyDownloadInput): Promise<NodeJS.ReadableStream>;
  uploadManifest(input: ShelbyManifestInput): Promise<ShelbyUploadResult>;
  downloadManifest(input: ShelbyManifestInput): Promise<string>;
  getBlobMetadata(input: ShelbyBlobMetadataInput): Promise<ShelbyBlobMetadata | null>;
  verifyBlob(input: ShelbyVerifyBlobInput): Promise<ShelbyVerificationResult>;
  buildExplorerUrl(blobName: string): string;
}
```

### Module Layout:
```
packages/shelby/src/
  ├── provider.ts             # Contains the ShelbyProvider interface
  ├── types.ts                # Common configuration and return DTOs
  ├── client.ts               # Factory class mapping config to active provider
  └── providers/
      ├── mock.provider.ts    # Filesystem simulation
      ├── sdk.provider.ts     # Live Shelby SDK provider
      └── future.provider.ts  # Future protocol placeholder (e.g. Arweave)
```

---

## 2. Live SDK Provider Configuration

Dynamic switching is governed by the `SHELBY_MODE` environment variable:
- `SHELBY_MODE=mock` (Default)
- `SHELBY_MODE=live`

If `SHELBY_MODE=live`, the client requires:
- `SHELBY_ACCOUNT`: Deployed Aptos account address.
- `SHELBY_PRIVATE_KEY`: Private key of the Aptos account (to sign upload commitments).
- `SHELBY_RPC_URL`: RPC endpoint of the Shelby storage service.
- `SHELBY_NETWORK`: Target network name (e.g. `testnet`).
- `SHELBY_EXPLORER_BASE_URL`: Explorer base path for URL generation.

> **Status:** The Live SDK provider is currently **STUBBED / READY_FOR_CONFIGURATION**.
> In the absence of real credentials or if the SDK is unavailable, the provider throws a `STUBBED` exception during instantiation rather than faking success.

---

## 3. Circuit Breaker & Resiliency

To prevent cascading failures when the decentralized network is unreachable, `LiveShelbyProvider` implements a circuit breaker:
- **Failure Threshold:** 5 consecutive failed network requests.
- **Cooldown Interval:** 60 seconds.
- **Behavior:** Once the threshold is met, the circuit transitions to the `OPEN` state. All subsequent requests fail immediately with a local error, sparing network/CPU resources and allowing the backend to serve cached or fallback content. After the cooldown, the circuit enters `HALF-OPEN` to attempt a test request.
- **Timeout & Retries:** Individual operations are wrapped with a `30000ms` timeout and retry 3 times with exponential backoff.
