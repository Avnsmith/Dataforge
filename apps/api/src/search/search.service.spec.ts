import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SearchService } from './search.service';
import { EmbeddingService } from './embedding.service';

jest.mock('@dataforge/db', () => ({
  prisma: {
    dataset: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'dataset-1',
          name: 'Target Dataset',
          slug: 'target-dataset',
          description: 'A test dataset description',
          tags: ['test'],
          createdAt: new Date(),
          owner: { username: 'testowner' },
        },
      ]),
    },
    searchIndex: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $queryRawUnsafe: jest.fn().mockResolvedValue([
      {
        datasetId: 'dataset-1',
        contentType: 'readme',
        similarity: 0.9,
      },
    ]),
  },
}));

describe('SearchService', () => {
  let service: SearchService;
  let embeddingService: EmbeddingService;

  const createService = (env: Record<string, string>) => {
    return Test.createTestingModule({
      providers: [
        SearchService,
        {
          provide: EmbeddingService,
          useValue: {
            isConfigured: true,
            embed: jest.fn().mockResolvedValue({
              vector: new Array(1536).fill(0.1),
              provider: 'mock',
              dimensions: 1536,
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => env[key] || ''),
          },
        },
      ],
    }).compile();
  };

  it('should fallback to keyword search when ENABLE_SEMANTIC_SEARCH=false', async () => {
    const module = await createService({ ENABLE_SEMANTIC_SEARCH: 'false' });
    service = module.get<SearchService>(SearchService);
    embeddingService = module.get<EmbeddingService>(EmbeddingService);

    const results = await service.search('target');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].dataset.id).toBe('dataset-1');
    expect(embeddingService.embed).not.toHaveBeenCalled();
  });

  it('should call embedding service when ENABLE_SEMANTIC_SEARCH=true', async () => {
    const module = await createService({ ENABLE_SEMANTIC_SEARCH: 'true' });
    service = module.get<SearchService>(SearchService);
    embeddingService = module.get<EmbeddingService>(EmbeddingService);

    const results = await service.search('target');
    expect(results.length).toBeGreaterThan(0);
    expect(embeddingService.embed).toHaveBeenCalledWith('target');
  });
});
