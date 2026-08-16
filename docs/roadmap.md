# DataForge AI Roadmap

DataForge AI is developed systematically. Below is the current outline of implemented, in-progress, and future features:

---

## 1. Implemented (Production Ready)

### Registry & Versioning
* **Semantic Dataset Versioning**: Register and snapshot datasets under standard semver tags (e.g. `1.0.0`).
* **Lineage & Forks**: Track derivation paths when users fork public repositories, preserving data history.
* **Manifest Aggregation**: Automated consolidation of metadata, file IDs, chunk sizes, and cryptographic roots into `manifest.json`.

### Cryptographic Provenance & Security
* **Aptos Wallet Handshake**: Nonce-challenge cryptographic login verifying public key signatures.
* **On-Chain Registry**: Verification of transactions calling `register_blob` with Merkle Root commitments on **Shelbynet**.
* **Integrity Proofs**: Verification of sender, file size, and chunk parameters directly via Aptos fullnodes.

### Decentralized Storage
* **Shelby Storage**: Integration of Shelby's chunked file storage system.
* **Dual Client Engine**: Seamless switching between `mock` filesystem volume storage and `live` blockchain gateway nodes.

---

## 2. In Progress

* **Semantic Search**: Integrating pgvector and vector embeddings to search and locate datasets semantically.
* **Wallet Hydration & Persistence**: Restoring connected wallet adapter states seamlessly on browser page reloads.
* **CLI Client (`agy`)**: A command-line tool to pull and push dataset versions directly from local terminal terminals.

---

## 3. Future Roadmap

* **Multi-Chain Registries**: Support for verifying proofs on other L1/L2 chains (Sui, Ethereum, Circle EVM).
* **Direct Jupyter Integration**: A Python SDK to fetch datasets directly inside Google Colab and training loops:
  ```python
  import dataforge as df
  dataset = df.load("0x73b074ca/crypto-tweets:1.0.0")
  ```
* **Multipart Parallel Uploads**: Speeding up ingestion of multi-gigabyte datasets via concurrent gateway chunking.
