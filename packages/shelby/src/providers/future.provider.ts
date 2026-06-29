import { ShelbyProvider } from '../provider';
import { ShelbyUploadResult, ShelbyBlobMetadata, ShelbyVerificationResult } from '../types';

/**
 * Placeholder for future storage providers (e.g. Arweave, Filecoin).
 */
export class FutureShelbyProvider implements ShelbyProvider {
  buildExplorerUrl(blobName: string): string {
    throw new Error('Future provider not implemented.');
  }

  async uploadDatasetFile(): Promise<ShelbyUploadResult> {
    throw new Error('Future provider not implemented.');
  }

  async downloadDatasetFile(): Promise<Buffer> {
    throw new Error('Future provider not implemented.');
  }

  async downloadDatasetFileStream(): Promise<NodeJS.ReadableStream> {
    throw new Error('Future provider not implemented.');
  }

  async uploadManifest(): Promise<ShelbyUploadResult> {
    throw new Error('Future provider not implemented.');
  }

  async downloadManifest(): Promise<string> {
    throw new Error('Future provider not implemented.');
  }

  async getBlobMetadata(): Promise<ShelbyBlobMetadata | null> {
    throw new Error('Future provider not implemented.');
  }

  async verifyBlob(): Promise<ShelbyVerificationResult> {
    throw new Error('Future provider not implemented.');
  }
}
