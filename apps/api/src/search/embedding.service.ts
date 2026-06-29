import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getProvider, EmbeddingProvider } from '@dataforge/ai';
import Redis from 'ioredis';
import * as crypto from 'crypto';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger('EmbeddingService');
  private readonly redis: Redis | null = null;
  private readonly cacheMap = new Map<string, number[]>(); // Local in-memory cache fallback

  public readonly isConfigured: boolean = true;
  public readonly configErrorMessage: string | null = null;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (redisUrl) {
      try {
        const tls = redisUrl.startsWith('rediss://') ? {} : undefined;
        this.redis = new Redis(redisUrl, {
          maxRetriesPerRequest: 1,
          connectTimeout: 2000,
          tls,
        });
      } catch (e: any) {
        this.logger.warn(`Redis connection failed in EmbeddingService: ${e.message}`);
      }
    }

    // Check for provider key configuration
    const providerName = this.configService.get<string>('EMBEDDING_PROVIDER') || 'mock';
    const requireReal = this.configService.get<string>('REQUIRE_REAL_EMBEDDINGS') === 'true';

    if (providerName === 'openai' && !this.configService.get<string>('OPENAI_API_KEY')) {
      const msg = 'EMBEDDING_PROVIDER=openai requires OPENAI_API_KEY environment variable.';
      if (requireReal) {
        throw new Error(msg);
      } else {
        this.logger.warn(`${msg} Fallback: mock provider will be used. Semantic search is degraded.`);
        this.isConfigured = false;
        this.configErrorMessage = msg;
      }
    } else if (providerName === 'gemini' && !this.configService.get<string>('GEMINI_API_KEY')) {
      const msg = 'EMBEDDING_PROVIDER=gemini requires GEMINI_API_KEY environment variable.';
      if (requireReal) {
        throw new Error(msg);
      } else {
        this.logger.warn(`${msg} Fallback: mock provider will be used. Semantic search is degraded.`);
        this.isConfigured = false;
        this.configErrorMessage = msg;
      }
    }
  }

  /**
   * Resolve the active provider based on configurations.
   */
  private getActiveProvider(): EmbeddingProvider {
    if (!this.isConfigured) {
      // Fallback to mock provider to prevent crashes
      return getProvider('mock');
    }
    const providerName = this.configService.get<string>('EMBEDDING_PROVIDER') || 'mock';
    return getProvider(providerName);
  }

  /**
   * Helper to perform L2 normalization on a vector.
   */
  private normalize(vector: number[]): number[] {
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return vector.map(v => v / (norm || 1));
  }

  /**
   * Retrieve embedding from cache.
   */
  private async getFromCache(text: string): Promise<number[] | null> {
    const hash = crypto.createHash('sha256').update(text).digest('hex');
    const cacheKey = `embedding:cache:${hash}`;

    if (this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
      } catch (e: any) {
        this.logger.warn(`Redis cache get failed: ${e.message}`);
      }
    }
    return this.cacheMap.get(hash) || null;
  }

  /**
   * Save embedding to cache.
   */
  private async saveToCache(text: string, vector: number[]) {
    const hash = crypto.createHash('sha256').update(text).digest('hex');
    const cacheKey = `embedding:cache:${hash}`;

    if (this.redis) {
      try {
        await this.redis.set(cacheKey, JSON.stringify(vector), 'EX', 86400 * 7); // Cache for 7 days
      } catch (e: any) {
        this.logger.warn(`Redis cache set failed: ${e.message}`);
      }
    } else {
      this.cacheMap.set(hash, vector);
    }
  }

  /**
   * Wrapper with timeout and retry logic.
   */
  private async callWithRetry(
    provider: EmbeddingProvider,
    text: string,
    retries = 3,
    delay = 1000
  ): Promise<number[]> {
    const timeoutMs = this.configService.get<number>('EMBEDDING_TIMEOUT_MS') || 10000;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const resultPromise = provider.embed(text);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Embedding request timed out')), timeoutMs)
        );

        return await Promise.race([resultPromise, timeoutPromise]);
      } catch (e: any) {
        if (attempt === retries) {
          throw new Error(`Embedding failed after ${retries} attempts: ${e.message}`);
        }
        this.logger.warn(`Embedding attempt ${attempt} failed: ${e.message}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay * attempt)); // exponential delay
      }
    }
    throw new Error('Unexpected retry loop exit');
  }

  /**
   * Main API for single text embedding generation.
   */
  async embed(text: string): Promise<{ vector: number[]; provider: string; dimensions: number }> {
    if (!text || text.trim() === '') {
      throw new BadRequestException('Text input cannot be empty for embedding');
    }

    const provider = this.getActiveProvider();
    
    // 1. Check Cache
    const cached = await this.getFromCache(text);
    if (cached && cached.length === provider.dimensions) {
      return { vector: cached, provider: provider.name, dimensions: provider.dimensions };
    }

    const start = Date.now();

    // 2. Generate embedding with retry & timeout
    const vector = await this.callWithRetry(provider, text);

    // 3. Dimension Validation
    if (vector.length !== provider.dimensions) {
      throw new Error(`Dimension mismatch: expected ${provider.dimensions}, got ${vector.length}`);
    }

    // 4. L2 Normalization
    const normalized = this.normalize(vector);

    // 5. Caching
    await this.saveToCache(text, normalized);

    if (this.configService.get<string>('ENABLE_PERFORMANCE_METRICS') !== 'false') {
      const latency = Date.now() - start;
      this.logger.log(`Embedding generated | provider=${provider.name} | length=${text.length} | latency=${latency}ms`);
    }

    return {
      vector: normalized,
      provider: provider.name,
      dimensions: provider.dimensions,
    };
  }

  /**
   * Main API for batch embedding generation.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const maxBatchSize = this.configService.get<number>('EMBEDDING_MAX_BATCH_SIZE') || 32;
    if (texts.length > maxBatchSize) {
      throw new BadRequestException(`Batch size exceeds limit of ${maxBatchSize}`);
    }

    const provider = this.getActiveProvider();
    
    // For simplicity under retry/fallback, map individually via the cached wrapper
    return Promise.all(texts.map(t => this.embed(t).then(r => r.vector)));
  }
}
