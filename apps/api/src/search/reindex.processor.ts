import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { prisma } from '@dataforge/db';
import { EmbeddingService } from './embedding.service';
import * as crypto from 'crypto';

@Processor('reindex-queue')
export class ReindexProcessor extends WorkerHost {
  private readonly logger = new Logger('ReindexProcessor');

  constructor(private readonly embeddingService: EmbeddingService) {
    super();
  }

  async process(job: Job<{ datasetId?: string; force?: boolean }>): Promise<any> {
    const { datasetId, force } = job.data;
    
    if (!this.embeddingService.isConfigured) {
      this.logger.warn(`[Reindex Job ${job.id}] Skipped. Embedding provider is not configured: ${this.embeddingService.configErrorMessage}`);
      return { processed: 0, skipped: true };
    }

    this.logger.log(`[Reindex Job ${job.id}] Starting vector re-indexing...`);

    // 1. Fetch search indexes that need embedding
    const whereClause: any = {};
    if (datasetId) {
      whereClause.datasetId = datasetId;
    }
    if (!force) {
      // Only process those missing a SearchEmbedding record
      whereClause.searchEmbedding = null;
    }

    const indexes = await prisma.searchIndex.findMany({
      where: whereClause,
      take: 100, // Batch limit per job run to prevent memory overload
    });

    if (indexes.length === 0) {
      this.logger.log(`[Reindex Job ${job.id}] No search indexes require re-indexing.`);
      return { processed: 0 };
    }

    this.logger.log(`[Reindex Job ${job.id}] Found ${indexes.length} indexes to embed.`);
    let successCount = 0;
    let failCount = 0;

    for (const idx of indexes) {
      try {
        // Generate the embedding vector
        const { vector, provider, dimensions } = await this.embeddingService.embed(idx.text);
        const vectorStr = `[${vector.join(',')}]`;
        const embeddingId = crypto.randomUUID();

        // Direct parameterized raw query to pgvector type table
        await prisma.$executeRawUnsafe(
          `INSERT INTO "SearchEmbedding" ("id", "searchIndexId", "provider", "model", "dimensions", "vector")
           VALUES ($1, $2, $3, $4, $5, $6::vector)
           ON CONFLICT ("searchIndexId") DO UPDATE
           SET "provider" = $3, "model" = $4, "dimensions" = $5, "vector" = $6::vector`,
          embeddingId,
          idx.id,
          provider,
          provider === 'openai' ? 'text-embedding-3-small' : provider === 'gemini' ? 'text-embedding-004' : 'mock-model',
          dimensions,
          vectorStr
        );

        successCount++;
      } catch (err: any) {
        failCount++;
        this.logger.error(`[Reindex Job ${job.id}] Failed to index SearchIndex ${idx.id}: ${err.message}`);
      }
    }

    this.logger.log(`[Reindex Job ${job.id}] Re-indexing complete. Success: ${successCount}, Failed: ${failCount}`);

    if (failCount > 0 && successCount === 0) {
      // Throw to trigger BullMQ retry if entire batch failed
      throw new Error(`All ${failCount} embedding attempts failed.`);
    }

    return { processed: indexes.length, success: successCount, failed: failCount };
  }
}
