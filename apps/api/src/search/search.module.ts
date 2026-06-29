import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { EmbeddingService } from './embedding.service';
import { ReindexProcessor } from './reindex.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'reindex-queue',
    }),
  ],
  controllers: [SearchController],
  providers: [SearchService, EmbeddingService, ReindexProcessor],
  exports: [SearchService, EmbeddingService, BullModule],
})
export class SearchModule {}
