import { EmbeddingProvider } from './providers';
import { MockEmbeddingProvider } from './providers/mock';
import { OpenAIEmbeddingProvider } from './providers/openai';
import { GeminiEmbeddingProvider } from './providers/gemini';

export * from './providers';
export * from './providers/mock';
export * from './providers/openai';
export * from './providers/gemini';

export function getProvider(name = 'mock', dimensions?: number): EmbeddingProvider {
  const cleanName = name.trim().toLowerCase();
  
  if (cleanName === 'openai') {
    return new OpenAIEmbeddingProvider();
  }
  
  if (cleanName === 'gemini') {
    return new GeminiEmbeddingProvider();
  }

  // Default fallback: mock provider
  return new MockEmbeddingProvider(dimensions);
}

/**
 * Main dispatcher function for generating embeddings.
 */
export async function embed(text: string): Promise<{ vector: number[]; provider: string; dimensions: number }> {
  const providerName = process.env.EMBEDDING_PROVIDER || 'mock';
  const provider = getProvider(providerName);
  const vector = await provider.embed(text);
  
  return {
    vector,
    provider: provider.name,
    dimensions: provider.dimensions,
  };
}

/**
 * Compute cosine similarity between two vectors.
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
