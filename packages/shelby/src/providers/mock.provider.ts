import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ShelbyProvider } from '../provider';
import { ShelbyConfig, ShelbyUploadResult, ShelbyBlobMetadata, ShelbyVerificationResult } from '../types';

export class MockProvider implements ShelbyProvider {
  private storagePath: string;
  private config: ShelbyConfig;

  constructor(config: ShelbyConfig) {
    this.config = config;
    this.storagePath = config.storageDir || path.resolve(__dirname, '../../storage');

    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  private buildShelbyBlobName(input: { owner: string; slug: string; version: string; path: string }): string {
    const cleanPath = input.path.replace(/^\/+|\/+$/g, '');
    return `datasets/${input.owner}/${input.slug}/${input.version}/${cleanPath}`;
  }

  public buildExplorerUrl(blobName: string): string {
    const base = this.config.explorerBaseUrl.replace(/\/+$/, '');
    return `${base}/blob/${blobName}`;
  }

  public async uploadDatasetFile(input: {
    owner: string;
    slug: string;
    version: string;
    path: string;
    fileContent: Buffer;
  }): Promise<ShelbyUploadResult> {
    const blobName = this.buildShelbyBlobName(input);
    const size = input.fileContent.length;
    const sha256 = crypto.createHash('sha256').update(input.fileContent).digest('hex');
    const merkleRoot = crypto.createHash('sha256').update(`shelby-merkle:${sha256}`).digest('hex');
    const explorerUrl = this.buildExplorerUrl(blobName);

    const filePath = path.join(this.storagePath, blobName);
    const dirPath = path.dirname(filePath);

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    fs.writeFileSync(filePath, input.fileContent);

    return {
      blobName,
      account: this.config.account,
      merkleRoot,
      size,
      explorerUrl,
    };
  }

  public async downloadDatasetFile(input: { blobName: string }): Promise<Buffer> {
    const filePath = path.join(this.storagePath, input.blobName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Shelby file not found (mock storage): ${input.blobName}`);
    }
    return fs.readFileSync(filePath);
  }

  public async downloadDatasetFileStream(input: { blobName: string }): Promise<NodeJS.ReadableStream> {
    const filePath = path.join(this.storagePath, input.blobName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Shelby file not found (mock storage): ${input.blobName}`);
    }
    return fs.createReadStream(filePath);
  }

  public async uploadManifest(input: {
    owner: string;
    slug: string;
    version: string;
    manifestContent: string;
  }): Promise<ShelbyUploadResult> {
    return this.uploadDatasetFile({
      owner: input.owner,
      slug: input.slug,
      version: input.version,
      path: 'manifest.json',
      fileContent: Buffer.from(input.manifestContent, 'utf-8'),
    });
  }

  public async downloadManifest(input: {
    owner: string;
    slug: string;
    version: string;
  }): Promise<string> {
    const blobName = this.buildShelbyBlobName({
      owner: input.owner,
      slug: input.slug,
      version: input.version,
      path: 'manifest.json',
    });
    const buffer = await this.downloadDatasetFile({ blobName });
    return buffer.toString('utf-8');
  }

  public async getBlobMetadata(input: { blobName: string }): Promise<ShelbyBlobMetadata | null> {
    const filePath = path.join(this.storagePath, input.blobName);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const stat = fs.statSync(filePath);
    const content = fs.readFileSync(filePath);
    const sha256 = crypto.createHash('sha256').update(content).digest('hex');
    const merkleRoot = crypto.createHash('sha256').update(`shelby-merkle:${sha256}`).digest('hex');

    const relative = path.relative(this.storagePath, filePath);
    const parts = relative.split(path.sep);
    const owner = parts[1] || 'unknown';

    return {
      blobName: input.blobName,
      size: stat.size,
      sha256,
      merkleRoot,
      uploadedAt: stat.mtime,
      owner,
    };
  }

  public async verifyBlob(input: {
    blobName: string;
    expectedSha256: string;
    expectedMerkleRoot: string;
    expectedSize: number;
  }): Promise<ShelbyVerificationResult> {
    const metadata = await this.getBlobMetadata({ blobName: input.blobName });
    if (!metadata) {
      return {
        valid: false,
        sha256Matched: false,
        merkleRootMatched: false,
        fileSizeMatched: false,
        message: 'File not found in mock Shelby storage',
      };
    }

    const sha256Matched = metadata.sha256 === input.expectedSha256;
    const merkleRootMatched = metadata.merkleRoot === input.expectedMerkleRoot;
    const fileSizeMatched = metadata.size === input.expectedSize;

    const valid = sha256Matched && merkleRootMatched && fileSizeMatched;

    return {
      valid,
      sha256Matched,
      merkleRootMatched,
      fileSizeMatched,
      message: valid ? undefined : 'Metadata mismatch in verification',
    };
  }
}
