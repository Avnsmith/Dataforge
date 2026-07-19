import { ShelbyConfig, ShelbyUploadResult, ShelbyBlobMetadata, ShelbyVerificationResult } from './types';
import { ShelbyProvider } from './provider';
import { MockProvider } from './providers/mock.provider';
import { ShelbyLiveProvider } from './providers/sdk.provider';

export * from './provider';
export * from './types';
export * from './providers/mock.provider';
export * from './providers/sdk.provider';
export * from './providers/future.provider';

export class ShelbyClient {
  private provider: ShelbyProvider;
  private config: ShelbyConfig;

  constructor(config: ShelbyConfig) {
    this.config = config;

    if (!config.mode || (config.mode !== 'mock' && config.mode !== 'live')) {
      throw new Error(`Invalid ShelbyClient mode: '${config.mode}'. Must be either 'mock' or 'live'.`);
    }

    if (config.mode === 'mock') {
      this.provider = new MockProvider(config);
    } else {
      this.provider = new ShelbyLiveProvider(config);
    }
  }

  public buildShelbyBlobName(input: { owner: string; slug: string; version: string; path: string }): string {
    const cleanPath = input.path.replace(/^\/+|\/+$/g, '');
    return `datasets/${input.owner}/${input.slug}/${input.version}/${cleanPath}`;
  }

  public buildExplorerUrl(blobName: string): string {
    return this.provider.buildExplorerUrl(blobName);
  }

  public async uploadDatasetFile(input: {
    owner: string;
    slug: string;
    version: string;
    path: string;
    fileContent: Buffer;
  }): Promise<ShelbyUploadResult> {
    return this.provider.uploadDatasetFile(input);
  }

  public async uploadManifest(input: {
    owner: string;
    slug: string;
    version: string;
    manifestContent: string;
  }): Promise<ShelbyUploadResult> {
    return this.provider.uploadManifest(input);
  }

  public async downloadDatasetFile(input: { blobName: string; account?: string }): Promise<Buffer> {
    return this.provider.downloadDatasetFile(input);
  }

  public async downloadDatasetFileStream(input: { blobName: string; account?: string }): Promise<NodeJS.ReadableStream> {
    return this.provider.downloadDatasetFileStream(input);
  }

  public async downloadManifest(input: {
    owner: string;
    slug: string;
    version: string;
    account?: string;
  }): Promise<string> {
    return this.provider.downloadManifest(input);
  }

  public async getBlobMetadata(input: { blobName: string; account?: string }): Promise<ShelbyBlobMetadata | null> {
    return this.provider.getBlobMetadata(input);
  }

  public async verifyBlob(input: {
    blobName: string;
    expectedSha256: string;
    expectedMerkleRoot: string;
    expectedSize: number;
    account?: string;
  }): Promise<ShelbyVerificationResult> {
    return this.provider.verifyBlob(input);
  }
}
