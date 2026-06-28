/**
 * DataForge AI — Embedding Provider
 *
 * Supports two modes:
 *   EMBEDDING_MODE=mock    — deterministic fake vectors (default, no API key needed)
 *   EMBEDDING_MODE=openai  — real OpenAI text-embedding-3-small (requires OPENAI_API_KEY)
 *
 * For local development and tests, mock mode is always sufficient.
 * Never claim semantic search is live unless EMBEDDING_MODE=openai is verified.
 */

import * as crypto from 'crypto';

export type EmbeddingMode = 'mock' | 'openai';

export interface EmbeddingResult {
  vector: number[];
  model: string;
  mode: EmbeddingMode;
}

const VECTOR_DIM = 1536; // Match OpenAI text-embedding-3-small dimensions

/**
 * Generate a deterministic mock embedding vector from text.
 * The vector is seeded by SHA-256(text) so the same text always produces the same vector.
 * This is useful for tests and local dev — it is NOT a semantic embedding.
 */
export function mockEmbedding(text: string): EmbeddingResult {
  const hash = crypto.createHash('sha256').update(text).digest();

  // Use hash bytes to seed a repeatable pseudo-random vector
  const vector: number[] = [];
  for (let i = 0; i < VECTOR_DIM; i++) {
    // Cycle through hash bytes to fill 1536 dimensions
    const byte = hash[i % hash.length];
    // Normalize to [-1, 1]
    vector.push((byte / 127.5) - 1.0);
  }

  // L2-normalize
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  const normalized = vector.map(v => v / (norm || 1));

  return {
    vector: normalized,
    model: 'mock-embedding-v1',
    mode: 'mock',
  };
}

/**
 * Generate an embedding using OpenAI text-embedding-3-small.
 * Requires OPENAI_API_KEY environment variable.
 * Throws if API key is missing or request fails.
 *
 * STATUS: STUB — not tested against real OpenAI API in this build.
 */
async function openaiEmbedding(text: string): Promise<EmbeddingResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'EMBEDDING_MODE=openai requires OPENAI_API_KEY environment variable. ' +
      'Set EMBEDDING_MODE=mock for local development.'
    );
  }

  // Use require() so TypeScript doesn't fail when openai package is not installed
  let OpenAI: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const openaiModule = require('openai');
    OpenAI = openaiModule.default || openaiModule.OpenAI;
  } catch (e) {
    throw new Error(
      'openai package not installed. Run: npm install openai --workspace=packages/ai\n' +
      'Or set EMBEDDING_MODE=mock for local development (no API key required).'
    );
  }

  const client = new OpenAI({ apiKey });
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8191), // Token limit
  });

  return {
    vector: response.data[0].embedding,
    model: 'text-embedding-3-small',
    mode: 'openai',
  };
}

/**
 * Main embedding function — dispatches based on EMBEDDING_MODE env var.
 *
 * Usage:
 *   const result = await embed('dataset description text');
 *   result.vector  // number[1536]
 *   result.mode    // 'mock' | 'openai'
 */
export async function embed(text: string): Promise<EmbeddingResult> {
  const mode = (process.env.EMBEDDING_MODE || 'mock') as EmbeddingMode;

  if (mode === 'openai') {
    return openaiEmbedding(text);
  }

  // Default: mock mode (always safe for local dev and tests)
  return mockEmbedding(text);
}

/**
 * Compute cosine similarity between two vectors.
 * Returns a value in [-1, 1] where 1 = identical direction.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
