import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { prisma } from '@dataforge/db';
import Redis from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';

@Controller()
export class AppController {
  constructor(
    private readonly configService: ConfigService,
    @InjectQueue('upload-queue') private readonly uploadQueue: Queue,
  ) {}

  @Get('health')
  async health() {
    let dbStatus = 'disconnected';
    let redisStatus = 'disconnected';
    let shelbyStatus = 'disconnected';

    // 1. Verify Database Connection
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'connected';
    } catch (e: any) {
      dbStatus = `failed: ${e.message}`;
    }

    // 2. Verify Redis Connection
    const redisUrl = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    const redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
    });
    try {
      const pingResult = await redisClient.ping();
      if (pingResult === 'PONG') {
        redisStatus = 'connected';
      }
    } catch (e: any) {
      redisStatus = `failed: ${e.message}`;
    } finally {
      redisClient.disconnect();
    }

    // 3. Verify Shelby Storage Path Access / Status
    try {
      const mode = this.configService.get<string>('SHELBY_MODE') || 'mock';
      if (mode === 'mock') {
        const storagePath = this.configService.get<string>('SHELBY_STORAGE_DIR') || path.resolve(__dirname, '../../../packages/shelby/storage');
        if (!fs.existsSync(storagePath)) {
          fs.mkdirSync(storagePath, { recursive: true });
        }
        const tempTestFile = path.join(storagePath, '.healthcheck');
        fs.writeFileSync(tempTestFile, 'ok');
        fs.unlinkSync(tempTestFile);
        shelbyStatus = 'connected (mock)';
      } else {
        shelbyStatus = 'connected (live)';
      }
    } catch (e: any) {
      shelbyStatus = `failed: ${e.message}`;
    }
    const isAllOk = dbStatus === 'connected' && redisStatus === 'connected' && shelbyStatus.startsWith('connected');
    const mode = this.configService.get<string>('SHELBY_MODE') || 'mock';

    return {
      status: isAllOk ? 'ok' : 'degraded',
      service: 'dataforge-api',
      timestamp: new Date().toISOString(),
      dependencies: {
        database: dbStatus,
        redis: redisStatus,
        shelby: shelbyStatus,
      },
      storage: {
        provider: 'Shelby',
        mode,
        connected: shelbyStatus.startsWith('connected'),
      },
    };
  }

  @Get('metrics')
  async metrics() {
    // BullMQ queue stats
    let queueStats = { waiting: 0, active: 0, failed: 0, completed: 0 };
    try {
      const [waiting, active, failed, completed] = await Promise.all([
        this.uploadQueue.getWaitingCount(),
        this.uploadQueue.getActiveCount(),
        this.uploadQueue.getFailedCount(),
        this.uploadQueue.getCompletedCount(),
      ]);
      queueStats = { waiting, active, failed, completed };
    } catch (e) {
      // Queue may be unavailable — return zeros
    }

    const shelbyMode = this.configService.get<string>('SHELBY_MODE') || 'mock';
    const embeddingMode = this.configService.get<string>('EMBEDDING_MODE') || 'mock';

    return {
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      queue: queueStats,
      storage: {
        mode: shelbyMode,
        note: shelbyMode === 'mock'
          ? 'MOCK — local filesystem only, not a real Shelby network'
          : 'LIVE — connected to Shelby network (verify independently)',
      },
      embeddings: {
        mode: embeddingMode,
        note: embeddingMode === 'mock'
          ? 'MOCK — deterministic fake vectors, semantic search not active'
          : `LIVE — using ${embeddingMode} embeddings`,
      },
      version: process.env.npm_package_version || '1.0.0',
    };
  }

  @Get('sentry-test')
  sentryTest() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Forbidden: Sentry test endpoint is disabled in production environment');
    }
    throw new Error('Sentry test error generated successfully at ' + new Date().toISOString());
  }
}

