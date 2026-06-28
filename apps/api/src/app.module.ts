import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { DatasetsModule } from './datasets/datasets.module';
import { VersionsModule } from './versions/versions.module';
import { SearchModule } from './search/search.module';
import { AppController } from './app.controller';

@Module({
  controllers: [AppController],
  providers: [
    // Apply ThrottlerGuard globally to all routes
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),

    // Global rate limiting: 100 requests per minute
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000, // 1 minute in ms
        limit: 100,
      },
    ]),

    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
        let host = 'localhost';
        let port = 6379;
        let username: string | undefined;
        let password: string | undefined;

        try {
          const parsed = new URL(redisUrl);
          host = parsed.hostname || 'localhost';
          port = parsed.port ? parseInt(parsed.port, 10) : 6379;
          username = parsed.username || undefined;
          password = parsed.password || undefined;
        } catch (e) {
          // Fall back to default
        }

        const tls = redisUrl.startsWith('rediss://') ? {} : undefined;

        return {
          connection: { host, port, username, password, tls },
        };
      },
      inject: [ConfigService],
    }),

    AuthModule,
    DatasetsModule,
    VersionsModule,
    SearchModule,
  ],
})
export class AppModule {}
