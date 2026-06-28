import { Controller, Get, Param, Query, NotFoundException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DatasetsService } from './datasets.service';
import { SearchService } from '../search/search.service';

@Controller('agent')
export class AgentController {
  constructor(
    private readonly datasetsService: DatasetsService,
    private readonly searchService: SearchService
  ) {}

  @Get('search')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async search(@Query('q') q: string) {
    if (!q) {
      return {
        query: '',
        count: 0,
        embeddingMode: process.env.EMBEDDING_MODE || 'mock',
        semanticSearch: false,
        note: 'Empty query',
        results: [],
      };
    }
    const results = await this.searchService.search(q);
    const embeddingMode = process.env.EMBEDDING_MODE || 'mock';

    return {
      query: q,
      count: results.length,
      embeddingMode,
      semanticSearch: embeddingMode !== 'mock',
      note: embeddingMode === 'mock'
        ? 'MOCK embeddings — scoring is keyword-only, not semantic'
        : `Live ${embeddingMode} embeddings active`,
      results: results.map((r) => ({
        id: r.dataset.id,
        name: r.dataset.name,
        slug: r.dataset.slug,
        owner: r.dataset.owner.username || r.dataset.owner.walletAddress,
        description: r.dataset.description,
        type: r.dataset.type,
        tags: r.dataset.tags,
        license: r.dataset.license,
        visibility: r.dataset.visibility,
        createdAt: r.dataset.createdAt,
        relevanceScore: r.relevanceScore,
        shelbyMode: process.env.SHELBY_MODE || 'mock',
      })),
    };
  }


  @Get('dataset/:owner/:slug/manifest')
  async getManifest(@Param('owner') owner: string, @Param('slug') slug: string) {
    const dataset = await this.datasetsService.findByOwnerAndSlug(owner, slug);
    if (!dataset) {
      throw new NotFoundException('Dataset not found');
    }
    const activeVersion = dataset.versions[0];
    if (!activeVersion || activeVersion.status !== 'ready') {
      throw new NotFoundException('No active ready version manifest found for this dataset');
    }

    return {
      name: dataset.name,
      slug: dataset.slug,
      owner: dataset.owner.username || dataset.owner.walletAddress,
      version: activeVersion.version,
      manifestHash: activeVersion.manifestHash,
      explorerUrl: `https://explorer.shelby.xyz/shelbynet/blob/${activeVersion.manifestShelbyBlobName}`,
      merkleRoot: activeVersion.manifestShelbyMerkleRoot,
    };
  }

  @Get('dataset/:owner/:slug/files')
  async getFiles(@Param('owner') owner: string, @Param('slug') slug: string) {
    const dataset = await this.datasetsService.findByOwnerAndSlug(owner, slug);
    if (!dataset) {
      throw new NotFoundException('Dataset not found');
    }
    const activeVersion = dataset.versions[0];
    if (!activeVersion) {
      return { files: [] };
    }

    return {
      version: activeVersion.version,
      files: activeVersion.files.map((file) => ({
        id: file.id,
        path: file.path,
        size: file.size.toString(),
        sha256: file.sha256,
        shelbyBlobName: file.shelbyBlobName,
        explorerUrl: file.explorerUrl,
      })),
    };
  }

  @Get('dataset/:owner/:slug/citation')
  async getCitation(@Param('owner') owner: string, @Param('slug') slug: string) {
    const dataset = await this.datasetsService.findByOwnerAndSlug(owner, slug);
    if (!dataset) {
      throw new NotFoundException('Dataset not found');
    }
    const activeVersion = dataset.versions[0];
    const versionStr = activeVersion ? activeVersion.version : '0.1.0';

    const bibtex = `@misc{dataforge_${dataset.slug}_v${versionStr},
  title = {${dataset.name}},
  year = {${new Date().getFullYear()}},
  version = {${versionStr}},
  publisher = {DataForge AI},
  howpublished = {\\url{http://localhost:3000/${dataset.owner.username || 'user'}/${dataset.slug}}}
}`;

    return {
      dataset: dataset.name,
      version: versionStr,
      bibtex,
    };
  }
}
