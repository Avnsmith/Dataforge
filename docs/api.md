# DataForge AI API Reference

All requests must be sent to the API gateway (e.g. `http://localhost:4000/api` or the production endpoint). Authenticated endpoints require a `Authorization: Bearer <JWT_Token>` header.

---

## Authentication Endpoints

### 1. POST `/auth/nonce`
Generate a cryptographic challenge nonce for the specified wallet address.
* **Payload**:
  ```json
  {
    "walletAddress": "0x73b074ca899d91953f5b76eb636ad67bb4507869e5a151c1154ac6bbdd1f17d4"
  }
  ```
* **Response (200 OK)**:
  ```json
  {
    "nonce": "3ef9bfa7-3932-4bf1-bfd0-3b0483edda83"
  }
  ```

### 2. POST `/auth/verify`
Verify signature challenge and issue JWT token.
* **Payload**:
  ```json
  {
    "walletAddress": "0x73b074ca899d91953f5b76eb636ad67bb4507869e5a151c1154ac6bbdd1f17d4",
    "nonce": "3ef9bfa7-3932-4bf1-bfd0-3b0483edda83",
    "publicKey": "0xd7f33218589daa3da44b285bfff7528584d4d9daaf83699ae88db16999d91b45",
    "signature": "0xd4cbaba09638d790bd18bdfaedd7e998d8be662dbf56642a8073283aef2c92481d74928fc1681f524180ff62cc7c34c8ed591d137a3cc1c05a816dd0f0e98902"
  }
  ```
* **Response (200 OK)**:
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```

### 3. GET `/auth/me`
Retrieve user profile details from token. (Requires JWT)
* **Response (200 OK)**:
  ```json
  {
    "id": "user_id",
    "walletAddress": "0x73b074ca899d91953f5b76eb636ad67bb4507869e5a151c1154ac6bbdd1f17d4",
    "username": "bob",
    "avatarUrl": "https://api.dicebear.com/..."
  }
  ```

---

## Dataset Endpoints

### 1. POST `/datasets`
Create a new dataset repository. (Requires JWT)
* **Payload**:
  ```json
  {
    "name": "crypto-tweets",
    "description": "Labeled dataset of web3 tweets.",
    "isPrivate": false,
    "tags": ["social", "nlp"]
  }
  ```
* **Response (210 Created)**:
  ```json
  {
    "id": "f37e6a2b-855b-480c-828a-fc0149b8e2a1",
    "name": "crypto-tweets",
    "slug": "crypto-tweets",
    "ownerId": "user_id",
    "isPrivate": false,
    "createdAt": "2026-07-28T12:00:00.000Z"
  }
  ```

### 2. GET `/datasets/:owner/:slug`
Retrieve detail metadata for a dataset by owner slug path.
* **Response (200 OK)**:
  ```json
  {
    "id": "f37e6a2b-855b-480c-828a-fc0149b8e2a1",
    "name": "crypto-tweets",
    "slug": "crypto-tweets",
    "owner": {
      "walletAddress": "0x73b074ca..."
    },
    "versions": []
  }
  ```

### 3. POST `/datasets/:id/fork`
Fork a dataset to the current user's profile. (Requires JWT)
* **Response (201 Created)**:
  ```json
  {
    "id": "forked_dataset_id",
    "parentDatasetId": "f37e6a2b-855b-480c-828a-fc0149b8e2a1"
  }
  ```

### 4. GET `/datasets/id/:id/lineage`
Retrieve the fork/lineage tree history of a dataset.
* **Response (200 OK)**:
  ```json
  {
    "id": "f37e6a2b-855b-480c-828a-fc0149b8e2a1",
    "parent": null,
    "forks": []
  }
  ```

---

## Dataset Versioning & Upload Endpoints

### 1. POST `/datasets/:datasetId/versions`
Initialize a new semantic version (initially `draft` status). (Requires JWT)
* **Payload**:
  ```json
  {
    "version": "1.0.0",
    "changelog": "Initial release"
  }
  ```
* **Response (201 Created)**:
  ```json
  {
    "id": "cecc85b5-5df7-4776-9548-7454d44d694f",
    "version": "1.0.0",
    "status": "draft"
  }
  ```

### 2. POST `/versions/:id/files/prepare`
Prepare a file metadata registration payload. (Requires JWT)
* **Payload**:
  ```json
  {
    "path": "data.csv",
    "size": 36
  }
  ```
* **Response (201 Created)**:
  ```json
  {
    "blobName": "datasets/0x73b074ca.../test/1.0.0/data.csv",
    "merkleRoot": "0x02c196012f333472f12558d79c9a7e9c320e0a1eef29116342c7fc5c5297f7b6",
    "size": 36,
    "payload": {
      "function": "0x85fdb9a176ab8ef1d9d9c1b60d60b3924f0800ac1de1cc2085fb0b8bb4988e6a::blob_metadata::register_blob",
      "type_arguments": [],
      "arguments": [...]
    }
  }
  ```

### 3. POST `/versions/:id/files/upload`
Upload file bytes and supply the finalized transaction hash. (Requires JWT)
* **Form-Data**:
  * `path`: `data.csv`
  * `transactionHash`: `0xf3bd2f1d09280b15af600b0b9ddf35631673c721f57ed9757a9a884f8681fbd3`
  * `file`: (Raw file bytes)
* **Response (201 Created)**:
  ```json
  {
    "id": "file_uuid",
    "path": "data.csv",
    "size": "36",
    "shelbyBlobName": "datasets/..."
  }
  ```

### 4. POST `/versions/:id/publish/prepare`
Prepare publication for compiling the manifest. (Requires JWT)
* **Response (201 Created)**:
  ```json
  {
    "blobName": "datasets/.../1.0.0/manifest.json",
    "merkleRoot": "0x4f328584c090...",
    "size": 717
  }
  ```

### 5. POST `/versions/:id/publish`
Confirm publication, changing version status to `processing`. (Requires JWT)
* **Payload**:
  ```json
  {
    "transactionHash": "0xc1c357a79159b796e2c51d2e50b0931cc8e5dc22818d32d35d25e002f028af8a"
  }
  ```
* **Response (201 Created)**:
  ```json
  {
    "id": "cecc85b5-5df7-4776-9548-7454d44d694f",
    "status": "processing"
  }
  ```

### 6. GET `/versions/:id/status`
Check processing status of a version (returns `draft`, `processing`, or `ready`).
* **Response (200 OK)**:
  ```json
  {
    "status": "ready",
    "manifestHash": "8aa659a0a5e0eb..."
  }
  ```

### 7. GET `/files/:id/download`
Directly download the file bytes from storage.
* **Response**: Binary file stream.
