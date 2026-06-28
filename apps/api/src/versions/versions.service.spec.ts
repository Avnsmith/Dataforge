import { Test, TestingModule } from '@nestjs/testing';
import { VersionsService } from './versions.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';

jest.mock('fs', () => {
  const originalFs = jest.requireActual('fs');
  return {
    ...originalFs,
    existsSync: jest.fn().mockImplementation((path) => {
      if (path.startsWith('/mock/')) return true;
      return originalFs.existsSync(path);
    }),
    mkdirSync: jest.fn().mockImplementation((path, options) => {
      if (path.startsWith('/mock/')) return;
      return originalFs.mkdirSync(path, options);
    }),
  };
});

jest.mock('@shelby-protocol/sdk/node', () => ({
  ShelbyNodeClient: jest.fn().mockImplementation(() => ({
    upload: jest.fn(),
    download: jest.fn(),
  })),
  generateCommitments: jest.fn().mockResolvedValue({ blob_merkle_root: 'mock-merkle-root' }),
  createDefaultErasureCodingProvider: jest.fn().mockResolvedValue({}),
}));

jest.mock('@aptos-labs/ts-sdk', () => ({
  Account: {
    fromPrivateKey: jest.fn().mockImplementation(() => ({
      accountAddress: { toString: () => '0xmockaddress' }
    })),
  },
  Ed25519PrivateKey: jest.fn(),
  Network: {
    TESTNET: 'testnet',
    LOCAL: 'local',
    SHELBYNET: 'shelbynet',
  },
}));

jest.mock('@dataforge/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    datasetVersion: { findUnique: jest.fn() },
    datasetFile: { create: jest.fn() },
  },
}));

describe('VersionsService - safeJoin Path Traversal Rejections', () => {
  let service: VersionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VersionsService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'SHELBY_MODE') return 'mock';
              if (key === 'SHELBY_STORAGE_DIR') return '/mock/base/dir';
              return '';
            }),
          },
        },
        {
          provide: 'BullQueue_upload-queue',
          useValue: { add: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<VersionsService>(VersionsService);
  });

  it('should allow safe and clean relative paths within base directory', () => {
    const baseDir = '/mock/base/dir';
    const safePath = 'data/train.csv';
    const result = (service as any).safeJoin(baseDir, safePath);
    expect(result).toBe('/mock/base/dir/data/train.csv');
  });

  it('should reject absolute paths and throw BadRequestException', () => {
    const baseDir = '/mock/base/dir';
    const absolutePath = '/etc/hosts';
    expect(() => {
      (service as any).safeJoin(baseDir, absolutePath);
    }).toThrow(BadRequestException);
  });

  it('should reject paths containing dot-dot relative escape segments (..)', () => {
    const baseDir = '/mock/base/dir';
    const escapePath = '../../keys/private.key';
    expect(() => {
      (service as any).safeJoin(baseDir, escapePath);
    }).toThrow(BadRequestException);
  });

  it('should reject paths resolving outside base directory limits', () => {
    const baseDir = '/mock/base/dir';
    const outPath = 'sub/../../outside.csv';
    expect(() => {
      (service as any).safeJoin(baseDir, outPath);
    }).toThrow(BadRequestException);
  });
});
