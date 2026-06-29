import { ShelbyUploadResult, ShelbyBlobMetadata, ShelbyVerificationResult } from './types';

export interface ShelbyProvider {
  uploadDatasetFile(input: {
    owner: string;
    slug: string;
    version: string;
    path: string;
    fileContent: Buffer;
  }): Promise<ShelbyUploadResult>;

  downloadDatasetFile(input: { blobName: string; account?: string }): Promise<Buffer>;

  downloadDatasetFileStream(input: { blobName: string; account?: string }): Promise<NodeJS.ReadableStream>;

  uploadManifest(input: {
    owner: string;
    slug: string;
    version: string;
    manifestContent: string;
  }): Promise<ShelbyUploadResult>;

  downloadManifest(input: {
    owner: string;
    slug: string;
    version: string;
    account?: string;
  }): Promise<string>;

  getBlobMetadata(input: { blobName: string; account?: string }): Promise<ShelbyBlobMetadata | null>;

  verifyBlob(input: {
    blobName: string;
    expectedSha256: string;
    expectedMerkleRoot: string;
    expectedSize: number;
    account?: string;
  }): Promise<ShelbyVerificationResult>;

  buildExplorerUrl(blobName: string): string;
}
