# DataForge AI Publishing & Ingestion Flow

This document details the step-by-step lifecycle of creating, uploading, verifying, and publishing a dataset version on DataForge AI.

---

## Complete Lifecycle Workflow

The sequence below traces the interaction between the Client (Browser & Petra Wallet), the NestJS API backend, the PostgreSQL DB, the background BullMQ Worker, the Shelby Storage node, and the Aptos Testnet blockchain.

```mermaid
sequenceDiagram
    autonumber
    actor User as Client / Wallet
    participant API as NestJS API
    participant DB as PostgreSQL
    participant Redis as Redis Queue
    participant Worker as BullMQ Worker
    participant Aptos as Aptos Testnet
    participant Shelby as Shelby Storage

    %% Authentication
    Note over User, API: 1. Cryptographic Authentication Handshake
    User->>API: POST /auth/nonce (walletAddress)
    API->>DB: Save nonce challenge
    API-->>User: Return nonce
    User->>User: Sign nonce using private key
    User->>API: POST /auth/verify (signature, publicKey)
    API->>API: Verify signature
    API-->>User: Issue JWT Access Token

    %% Dataset and Version Creation
    Note over User, API: 2. Repository Initialization
    User->>API: POST /datasets (name, tags)
    API->>DB: Save dataset repository
    API-->>User: Return dataset ID
    User->>API: POST /datasets/:id/versions (version tag)
    API->>DB: Create DatasetVersion (status: draft)
    API-->>User: Return version ID

    %% File Ingestion
    Note over User, API: 3. Cryptographic File Registration
    User->>API: POST /versions/:id/files/prepare (file path, size)
    API-->>User: Return blobName, Merkle Root & Aptos tx payload
    User->>Aptos: Sign & Submit transaction (register_blob)
    Aptos-->>User: Return transactionHash
    User->>API: POST /versions/:id/files/upload (file path, transactionHash, file stream)
    API->>Aptos: Query transaction by hash (poll success, sender, Merkle Root, size)
    Aptos-->>API: Transaction finalized & matches metadata
    API->>Shelby: Save file stream to Shelby Node
    API->>DB: Create DatasetFile record
    API-->>User: File upload confirmed (HTTP 201)

    %% Manifest and Version Publication
    Note over User, API: 4. Version Publication & Ingestion
    User->>API: POST /versions/:id/publish/prepare
    API-->>User: Return manifest.json blobName, Merkle Root & Aptos tx payload
    User->>Aptos: Sign & Submit transaction (register_blob for manifest)
    Aptos-->>User: Return manifest transactionHash
    User->>API: POST /versions/:id/publish (transactionHash)
    API->>Aptos: Query transaction by hash (verify manifest registration)
    Aptos-->>API: Transaction finalized
    API->>DB: Update DatasetVersion (status: processing)
    API->>Redis: Enqueue process-version job
    API-->>User: Version publication started (HTTP 201)
    
    %% Background Ingestion Worker
    Note over Redis, Shelby: 5. Background Processing & Readying
    Worker->>Redis: Pull process-version job
    Worker->>Shelby: Upload aggregated manifest.json
    Worker->>API: Execute AI metadata extraction / tags indexing
    Worker->>DB: Update DatasetVersion (status: ready)
    Note over User: User polls status /api/versions/:id/status -> ready
```

---

## Detailed Step Description

### 1. Cryptographic Authentication Handshake
* Rather than traditional passwords, users log in using their wallet address.
* The backend generates a secure challenge UUID (nonce) saved to Redis/DB with an expiration.
* The browser prompts the wallet extension (e.g. Petra) to sign the nonce.
* The signature is posted back and verified cryptographically using the derived public key. If valid, a standard JWT token is returned to the client to authorize subsequent requests.

### 2. Repository & Version Setup
* The user registers a dataset metadata container (a Repository). This can be public or private.
* A version record is created using semver notation (e.g. `1.0.0`) in a `draft` state. A version represents a frozen snapshot of the dataset files.

### 3. Cryptographic File Upload & Verification
* For each file to be uploaded, the client calls `/files/prepare`. The backend returns the expected storage path, the calculated Merkle Root, and a pre-formulated payload for the Aptos transaction.
* The client submits this transaction calling the `register_blob` function on the Aptos Testnet.
* The client passes the resulting transaction hash along with the file stream to `/files/upload`.
* **Important**: The backend queries the Aptos Testnet nodes to confirm that the transaction was successfully finalized, the sender matches the dataset owner, and the Merkle Root/file size parameters match what was prepared. If validated, the file bytes are written to Shelby Storage.

### 4. Manifest Compilation & Version Publication
* When the user clicks "Publish Version", the backend prepares a `manifest.json` file aggregating all files, hashes, sizes, and lineage metadata.
* Just like regular files, the `manifest.json` must be registered on-chain by the user.
* Once the manifest transaction is validated by the backend, the version status changes to `processing`, and a background job is enqueued in BullMQ.

### 5. Background Worker Processing
* The BullMQ worker builds the version manifest, uploads it to Shelby, extracts metadata, indexes searchable keywords, and updates the version status to `ready`.
* The frontend receives the state change, making the version available for lineage tracking, search queries, and downloads.
