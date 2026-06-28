import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SearchService } from './search.service';

@Controller()
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  // 60 requests per minute for general search
  @Get('search')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async search(@Query('q') query: string) {
    const results = await this.searchService.search(query);
    return { results };
  }
}

