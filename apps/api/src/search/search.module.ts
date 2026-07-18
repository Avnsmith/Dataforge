import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { EmbeddingService } from './embedding.service';
import { ReindexProcessor } from './reindex.processor';

const providers: any[] = [SearchService, EmbeddingService];
if (process.env.RUN_MODE === 'worker' || !process.env.RUN_MODE) {
  providers.push(ReindexProcessor);
}

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'reindex-queue',
    }),
  ],
  controllers: [SearchController],
  providers,
  exports: [SearchService, EmbeddingService, BullModule],
})
export class SearchModule {}
