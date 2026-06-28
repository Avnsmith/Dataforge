import { Module } from '@nestjs/common';
import { DatasetsController } from './datasets.controller';
import { AgentController } from './agent.controller';
import { DatasetsService } from './datasets.service';
import { SearchModule } from '../search/search.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [SearchModule, AuthModule],
  controllers: [DatasetsController, AgentController],
  providers: [DatasetsService],
  exports: [DatasetsService],
})
export class DatasetsModule {}
