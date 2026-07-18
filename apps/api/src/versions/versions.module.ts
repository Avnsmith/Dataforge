import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { VersionsController } from './versions.controller';
import { VersionsService } from './versions.service';
import { UploadProcessor } from './upload.processor';
import { AuthModule } from '../auth/auth.module';
import { SearchModule } from '../search/search.module';

const providers: any[] = [VersionsService];
if (process.env.RUN_MODE === 'worker' || !process.env.RUN_MODE) {
  providers.push(UploadProcessor);
}

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'upload-queue',
    }),
    AuthModule,
    SearchModule,
  ],
  controllers: [VersionsController],
  providers,
  exports: [VersionsService, BullModule],
})
export class VersionsModule {}
