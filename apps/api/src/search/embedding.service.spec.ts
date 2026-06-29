import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmbeddingService } from './embedding.service';
import { getProvider } from '@dataforge/ai';

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => {
    return {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      on: jest.fn(),
    };
  });
});

jest.mock('@dataforge/ai', () => {
  const original = jest.requireActual('@dataforge/ai');
  return {
    ...original,
    getProvider: jest.fn().mockImplementation((name) => {
      if (name === 'openai') {
        return {
          name: 'openai',
          dimensions: 1536,
          embed: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
        };
      }
      if (name === 'gemini') {
        return {
          name: 'gemini',
          dimensions: 768,
          embed: jest.fn().mockResolvedValue(new Array(768).fill(0.2)),
        };
      }
      return {
        name: 'mock',
        dimensions: 1536,
        embed: jest.fn().mockImplementation(async (text) => {
          if (text === 'timeout-text') {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          if (text === 'fail-text') {
            throw new Error('API Error');
          }
          return new Array(1536).fill(0.5);
        }),
      };
    }),
  };
});

describe('EmbeddingService', () => {
  let service: EmbeddingService;
  let configService: ConfigService;

  const createService = async (env: Record<string, string>) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => env[key] || ''),
          },
        },
      ],
    }).compile();

    service = module.get<EmbeddingService>(EmbeddingService);
    configService = module.get<ConfigService>(ConfigService);
  };

  it('should select mock provider by default', async () => {
    await createService({ EMBEDDING_PROVIDER: 'mock' });
    const result = await service.embed('hello');
    expect(result.provider).toBe('mock');
    expect(result.dimensions).toBe(1536);
  });

  it('should fail if openai provider key is missing', async () => {
    await expect(
      createService({ EMBEDDING_PROVIDER: 'openai', REQUIRE_REAL_EMBEDDINGS: 'true' })
    ).rejects.toThrow(
      'EMBEDDING_PROVIDER=openai requires OPENAI_API_KEY environment variable.'
    );
  });

  it('should fail if gemini provider key is missing', async () => {
    await expect(
      createService({ EMBEDDING_PROVIDER: 'gemini', REQUIRE_REAL_EMBEDDINGS: 'true' })
    ).rejects.toThrow(
      'EMBEDDING_PROVIDER=gemini requires GEMINI_API_KEY environment variable.'
    );
  });

  it('should return correct dimensions and normalized vector', async () => {
    await createService({ EMBEDDING_PROVIDER: 'openai', OPENAI_API_KEY: 'test-key' });
    const result = await service.embed('hello');
    expect(result.provider).toBe('openai');
    expect(result.dimensions).toBe(1536);
    expect(result.vector.length).toBe(1536);
  });

  it('should retry on failure and throw after max retries', async () => {
    await createService({ EMBEDDING_PROVIDER: 'mock' });
    await expect(service.embed('fail-text')).rejects.toThrow('Embedding failed after 3 attempts');
  });

  it('should time out if request exceeds timeout threshold', async () => {
    await createService({ EMBEDDING_PROVIDER: 'mock', EMBEDDING_TIMEOUT_MS: '10' });
    await expect(service.embed('timeout-text')).rejects.toThrow('Embedding request timed out');
  });
});
