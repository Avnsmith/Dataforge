import { EmbeddingProvider } from './index';
import * as crypto from 'crypto';

export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'mock';
  readonly dimensions: number;

  constructor(dimensions = 1536) {
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const hash = crypto.createHash('sha256').update(text).digest();
    const vector: number[] = [];
    for (let i = 0; i < this.dimensions; i++) {
      const byte = hash[i % hash.length];
      vector.push((byte / 127.5) - 1.0);
    }
    // L2 normalize
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return vector.map(v => v / (norm || 1));
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }
}
