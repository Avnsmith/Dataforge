# Embedding Framework & Semantic Search Architecture

This document describes the design, configuration, and execution flows of the modular embedding provider system and pgvector search indexing.

---

## 1. Provider Design & Interface

All embedding backends implement the `EmbeddingProvider` interface:
```typescript
interface EmbeddingProvider {
  name: string;
  dimensions: number;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}
```

### Supported Providers:
- **`MockEmbeddingProvider`:** Computes repeatable, L2-normalized pseudo-random vectors based on the SHA-256 hash of the input text. Ideal for offline validation and local tests.
- **`OpenAIEmbeddingProvider`:** Connects to the OpenAI Embeddings API using model `text-embedding-3-small` with `1536` dimensions.
- **`GeminiEmbeddingProvider`:** Connects to the Google Gemini API using model `text-embedding-004` with `768` dimensions.

---

## 2. Configuration & Feature Flags

Dynamic switching is managed via the following environment variables:
- `EMBEDDING_PROVIDER`: `mock` | `openai` | `gemini` (default: `mock`)
- `ENABLE_SEMANTIC_SEARCH`: `true` | `false` (default: `false`)
- `ENABLE_VECTOR_REINDEX`: `true` | `false` (default: `false`)
- `EMBEDDING_TIMEOUT_MS`: Request timeout (default: `10000`)
- `EMBEDDING_MAX_BATCH_SIZE`: Maximum items per batch request (default: `32`)

---

## 3. Database Schema (Option B - Normalized Table)

Vectors are stored in a dedicated `SearchEmbedding` model to future-proof dimensions and multi-model indexing:
```prisma
model SearchEmbedding {
  id            String      @id @default(uuid())
  searchIndexId String      @unique
  provider      String      // e.g., "openai" | "gemini" | "mock"
  model         String      // e.g., "text-embedding-3-small"
  dimensions    Int         // e.g., 1536 or 768
  vector        Unsupported("vector")
  createdAt     DateTime    @default(now())
  searchIndex   SearchIndex @relation(fields: [searchIndexId], references: [id], onDelete: Cascade)
}
```

---

## 4. Reindexing Worker & Background Processing

If `ENABLE_VECTOR_REINDEX=true`, publishing a new dataset version will queue a job on the BullMQ `reindex-queue`.

### Workflow of `EmbeddingReindexJob`:
1. Find up to 100 `SearchIndex` rows missing embeddings (where `SearchEmbedding` is null).
2. Extract text block from index records.
3. Call `EmbeddingService` to generate vector.
4. Execute raw SQL upsert into `SearchEmbedding` table using parameterized parameters:
   ```sql
   INSERT INTO "SearchEmbedding" ("id", "searchIndexId", "provider", "model", "dimensions", "vector")
   VALUES ($1, $2, $3, $4, $5, $6::vector)
   ON CONFLICT ("searchIndexId") DO UPDATE
   SET "provider" = $3, "model" = $4, "dimensions" = $5, "vector" = $6::vector
   ```
5. If the provider throws an error (e.g. rate limit, auth error), it retries individual records or the entire job up to 3 times with exponential backoff.
