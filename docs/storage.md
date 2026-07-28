# DataForge AI Storage System & Provenance

DataForge AI integrates decentralized storage with blockchain-based cryptographic verification to guarantee dataset immutability, data integrity, and clear chain-of-custody.

---

## Shelby Storage Overview

**Shelby Storage** is a decentralized storage solution optimized for storing large datasets. In DataForge, it is integrated via the `@dataforge/shelby` client library.

### Storage Modes
1. **Mock Mode (`SHELBY_MODE=mock`)**: Persists files locally in a persistent volume directory (typically `/opt/dataforge/storage/mock`), simulating network behaviors. Useful for local testing and CI/CD pipelines.
2. **Live Mode (`SHELBY_MODE=live`)**: Interacts directly with the Shelby node gateway at `SHELBY_RPC_URL` using an Aptos private key (`SHELBY_PRIVATE_KEY`) to purchase storage space and commit files.

---

## On-Chain vs. Off-Chain Separation

To keep network costs low and maximize efficiency, DataForge splits data into two distinct layers:

| Layer | Type | Description | Location |
|---|---|---|---|
| **Cryptographic Provenance** | On-Chain | Registration of blob metadata, including paths, sizes, expirations, and Merkle Roots. | Aptos Testnet Ledger |
| **Raw Dataset Storage** | Off-Chain | Actual raw data bytes (CSVs, images, JSONs) and aggregated dataset version manifests. | Shelby Storage Nodes |
| **Dataset Metadata** | Off-Chain | User profiles, dataset repository tags, lineage links, and status logs. | PostgreSQL Database |

---

## Cryptographic Commitments

DataForge utilizes two primary hashing algorithms to guarantee that files cannot be tampered with:

### 1. Merkle Root (On-Chain Validation)
Before a file is uploaded, the frontend or prepare endpoint hashes chunks of the file to construct a Merkle Tree. The resulting **Merkle Root** (a `0x`-prefixed 64-character hex string) represents the unique cryptographic fingerprint of the file contents.
* When calling `register_blob` on the Shelby smart contract, the Merkle Root is stored permanently on-chain.
* Any tampering with the file contents will produce a different Merkle Root, failing the on-chain verification step.

### 2. SHA256 (Off-Chain Verification)
During the file upload process, the backend calculates the SHA256 checksum of the uploaded file stream. This is compared against the prepared hash to ensure transport integrity before the file is committed to Shelby.

---

## On-Chain Registry Contract

All dataset file registrations are recorded on the Aptos Testnet under the official Shelby registry contract module:

* **Registry Module**: `0x85fdb9a176ab8ef1d9d9c1b60d60b3924f0800ac1de1cc2085fb0b8bb4988e6a::blob_metadata`
* **Entry Function**: `register_blob`
* **Parameters**:
  * `blob_name`: The unique path string of the dataset version file (e.g. `datasets/0x73b074ca.../test/1.0.0/data.csv`).
  * `expiration_micros`: Expiration timestamp in microseconds.
  * `blob_commitment`: The computed Merkle Root.
  * `chunkset_count`: Number of chunksets.
  * `blob_size`: Total size in bytes.
  * `payment_tier_id`: Storage payment tier.
  * `slice_address`: Destination slice.
