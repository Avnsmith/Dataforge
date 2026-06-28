# Shelby SDK Technical Audit

- **Date:** 2026-06-28
- **Installed SDK Version:** `@shelby-protocol/sdk` v0.3.1
- **Installed Peer Dependency:** `@aptos-labs/ts-sdk` v5.2.1 / v6.3.1

---

## 1. Exported Classes and Functions

The `@shelby-protocol/sdk` exports environment-specific entrypoints. For server environments, the Node.js subpath `./node` must be imported:

```typescript
import { ShelbyNodeClient } from '@shelby-protocol/sdk/node';
import { generateCommitments, createDefaultErasureCodingProvider } from '@shelby-protocol/sdk/node';
```

Other core helper functions and types:
- `generateMerkleRoot(leafHashes: Hex[]): Promise<Hex>`
- `createBlobKey(params: { account: AccountAddressInput; blobName: BlobName }): string`
- `ShelbyBlob` (interface for downloaded files)
- `BlobMetadata` (interface for blockchain-registered commitments)

---

## 2. Confirmed API Specifications

### Upload API
Blobs are uploaded to the Shelby node through the `upload` method on `ShelbyClient` / `ShelbyNodeClient`:

```typescript
upload(params: {
  blobData: Uint8Array;
  signer: Account; // From @aptos-labs/ts-sdk
  blobName: string; // The file name / destination path on the network
  expirationMicros: number; // Expiration timestamp in microseconds
  options?: UploadOptions;
}): Promise<void>;
```

- **Commitment Generation:** Prior to upload, the file's Merkle root and chunkset commitments must be calculated. The SDK performs this internally during `upload`, but they can be manually computed using:
  ```typescript
  const provider = await createDefaultErasureCodingProvider();
  const commitments = await generateCommitments(provider, buffer);
  const merkleRoot = commitments.blob_merkle_root;
  ```

### Download API
Blobs are downloaded via the `download` method on `ShelbyClient` / `ShelbyNodeClient`:

```typescript
download(params: {
  account: AccountAddressInput; // Uploader account address namespace
  blobName: string;
  range?: {
    start: number;
    end?: number;
  };
}): Promise<ShelbyBlob>;
```

Returns a `ShelbyBlob` structure:
```typescript
interface ShelbyBlob {
  account: AccountAddress;
  name: string;
  readable: ReadableStream; // Web standard ReadableStream
  contentLength: number;
}
```

### Metadata API
Blockchain blob metadata is queried via the `coordination` client:

```typescript
client.coordination.getBlobMetadata(params: {
  account: AccountAddressInput;
  blobName: string;
}): Promise<BlobMetadata | undefined>;
```

Returns a `BlobMetadata` structure:
```typescript
interface BlobMetadata {
  owner: AccountAddress;
  name: string;
  blobMerkleRoot: Uint8Array;
  size: number;
  expirationMicros: number;
  creationMicros: number;
  isWritten: boolean;
}
```

---

## 3. Auth and Cryptographic Key Requirements

- **Signer Account:** All blockchain transactions and uploads require signing by an Aptos Ed25519 account.
- **Initialization:** An account is initialized using the private key (`SHELBY_PRIVATE_KEY` hex format) via the `@aptos-labs/ts-sdk` package:
  ```typescript
  import { Account, Ed25519PrivateKey } from '@aptos-labs/ts-sdk';

  const privateKeyObj = new Ed25519PrivateKey(process.env.SHELBY_PRIVATE_KEY);
  const signerAccount = Account.fromPrivateKey({ privateKey: privateKeyObj });
  ```

---

## 4. Unsupported or Unclear APIs

- **Streaming Uploads:** The `upload` method only accepts a full `Uint8Array` in memory. If streaming files larger than 2 GiB is required in the future, we would need to orchestrate the raw steps manually using `rpc.putBlob` with a `ReadableStream`. This is not required for the current MVP.
- **Direct SHA-256 Retrieval:** The blockchain metadata only tracks the `blobMerkleRoot` (erasure-coded Merkle root) as a `Uint8Array`. It does not store the original file's flat SHA-256 hash. To verify file integrity, we must verify the Merkle root and size, or download the full blob to calculate and match its SHA-256 hash.

---

## 5. Usage Example

```typescript
import { ShelbyNodeClient } from '@shelby-protocol/sdk/node';
import { Account, Ed25519PrivateKey, Network } from '@aptos-labs/ts-sdk';

// Initialize Client
const client = new ShelbyNodeClient({
  network: Network.TESTNET,
  rpc: {
    baseUrl: 'https://rpc.shelby.xyz',
  },
});

// Initialize Signer Account
const privateKey = new Ed25519PrivateKey('0x...');
const signer = Account.fromPrivateKey({ privateKey });

// Upload File
await client.upload({
  blobData: Buffer.from('hello world'),
  signer,
  blobName: 'datasets/my-wallet/my-dataset/v1.0/hello.txt',
  expirationMicros: (Date.now() + 30 * 24 * 60 * 60 * 1000) * 1000,
});
```
