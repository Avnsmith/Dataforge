import { Test, TestingModule } from '@nestjs/testing';
import { DatasetsService } from './datasets.service';
import { NotFoundException } from '@nestjs/common';

jest.mock('@dataforge/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    dataset: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    datasetLineage: {
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '@dataforge/db';

describe('DatasetsService - Lineage lookups', () => {
  let service: DatasetsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DatasetsService],
    }).compile();

    service = module.get<DatasetsService>(DatasetsService);
  });

  it('should query and resolve dataset lineage relations into nodes and edges', async () => {
    const mockDatasetId = 'child-dataset-uuid';
    
    (prisma.dataset.findUnique as jest.Mock).mockResolvedValue({
      id: mockDatasetId,
      name: 'Child Dataset',
      slug: 'child-dataset',
      versions: [
        {
          id: 'child-version-uuid',
          version: '1.1.0',
        },
      ],
    });

    (prisma.datasetLineage.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'lineage-relation-1',
        parentVersionId: 'parent-version-uuid',
        parentVersion: {
          id: 'parent-version-uuid',
          version: '1.0.0',
          datasetId: 'parent-dataset-uuid',
          dataset: {
            id: 'parent-dataset-uuid',
            name: 'Parent Dataset',
            slug: 'parent-dataset',
            owner: {
              username: 'bob',
              walletAddress: '0x2222222222222222222222222222222222222222222222222222222222222222',
            },
          },
        },
        childVersionId: 'child-version-uuid',
        childVersion: {
          id: 'child-version-uuid',
          version: '1.1.0',
          datasetId: mockDatasetId,
          dataset: {
            id: mockDatasetId,
            name: 'Child Dataset',
            slug: 'child-dataset',
            owner: {
              username: 'alice',
              walletAddress: '0x1111111111111111111111111111111111111111111111111111111111111111',
            },
          },
        },
      },
    ]);

    const result = await service.getLineage(mockDatasetId);

    expect(prisma.dataset.findUnique).toHaveBeenCalledWith({
      where: { id: mockDatasetId },
      include: { versions: true },
    });
    
    expect(result.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'child-version-uuid', label: 'Child Dataset v1.1.0' }),
      expect.objectContaining({ id: 'parent-version-uuid', label: 'Parent Dataset v1.0.0' }),
    ]));
    
    expect(result.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'parent-version-uuid', target: 'child-version-uuid' }),
    ]));
  });

  it('should throw NotFoundException if resolving lineage for invalid dataset ID', async () => {
    (prisma.dataset.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.getLineage('invalid-uuid')).rejects.toThrow(NotFoundException);
  });
});
