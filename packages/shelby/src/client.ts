import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ShelbyConfig, ShelbyUploadResult, ShelbyBlobMetadata, ShelbyVerificationResult } from './types';
import { Account, Ed25519PrivateKey } from '@aptos-labs/ts-sdk';

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

export class MockShelbyProvider implements ShelbyProvider {
  private storagePath: string;
  private config: ShelbyConfig;

  constructor(config: ShelbyConfig) {
    this.config = config;
    this.storagePath = config.storageDir || path.resolve(__dirname, '../storage');

    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  public buildExplorerUrl(blobName: string): string {
    return buildExplorerUrl(this.config.explorerBaseUrl, blobName);
  }

  public async uploadDatasetFile(input: {
    owner: string;
    slug: string;
    version: string;
    path: string;
    fileContent: Buffer;
  }): Promise<ShelbyUploadResult> {
    const blobName = buildShelbyBlobName(input);
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
    const blobName = buildShelbyBlobName({
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

export class LiveShelbyProvider implements ShelbyProvider {
  private config: ShelbyConfig;
  private sdkClient: any = null;
  private signer: Account;

  constructor(config: ShelbyConfig) {
    this.config = config;

    // Fail loudly if credentials are missing
    if (!config.privateKey) {
      throw new Error('Shelby configuration error: SHELBY_PRIVATE_KEY is missing or empty.');
    }
    if (!config.rpcUrl) {
      throw new Error('Shelby configuration error: SHELBY_RPC_URL is missing or empty.');
    }
    if (!config.account) {
      throw new Error('Shelby configuration error: SHELBY_ACCOUNT is missing or empty.');
    }
    if (!config.network) {
      throw new Error('Shelby configuration error: SHELBY_NETWORK is missing or empty.');
    }

    try {
      let rawKey = config.privateKey;
      if (rawKey.startsWith('ed25519-priv-')) {
        rawKey = rawKey.substring('ed25519-priv-'.length);
      }
      const privateKeyObj = new Ed25519PrivateKey(rawKey);
      this.signer = Account.fromPrivateKey({ privateKey: privateKeyObj });
      
      const derivedAddress = this.signer.accountAddress.toString();
      if (config.account.toLowerCase() !== derivedAddress.toLowerCase()) {
        console.warn(`Shelby Warning: SHELBY_ACCOUNT (${config.account}) does not match derived address (${derivedAddress}). Using derived address.`);
      }
    } catch (e: any) {
      throw new Error(`Shelby configuration error: Invalid SHELBY_PRIVATE_KEY format. Error: ${e.message}`);
    }
  }

  private async getSdkClient(): Promise<any> {
    if (!this.sdkClient) {
      try {
        const { ShelbyNodeClient } = await import('@shelby-protocol/sdk/node');
        this.sdkClient = new ShelbyNodeClient({
          network: this.config.network as any,
          apiKey: this.config.apiKey,
          rpc: {
            baseUrl: this.config.rpcUrl,
            apiKey: this.config.apiKey,
          },
        });
      } catch (e: any) {
        throw new Error(`Shelby Client initialization failed: ${e.message}`);
      }
    }
    return this.sdkClient;
  }

  public buildExplorerUrl(blobName: string): string {
    return buildExplorerUrl(this.config.explorerBaseUrl, blobName);
  }

  public async uploadDatasetFile(input: {
    owner: string;
    slug: string;
    version: string;
    path: string;
    fileContent: Buffer;
  }): Promise<ShelbyUploadResult> {
    const blobName = buildShelbyBlobName(input);
    const size = input.fileContent.length;

    let merkleRoot: string | undefined;
    try {
      const { createDefaultErasureCodingProvider, generateCommitments } = await import('@shelby-protocol/sdk/node');
      const provider = await createDefaultErasureCodingProvider();
      const commitments = await generateCommitments(provider, input.fileContent);
      merkleRoot = commitments.blob_merkle_root;
    } catch (e: any) {
      throw new Error(`Failed to generate blob commitments: ${e.message}`);
    }

    const expirationMicros = (Date.now() + 365 * 24 * 60 * 60 * 1000) * 1000;
    const sdkClient = await this.getSdkClient();

    try {
      await sdkClient.upload({
        blobData: input.fileContent,
        signer: this.signer as any,
        blobName,
        expirationMicros,
      });
    } catch (e: any) {
      throw new Error(`Shelby SDK upload failed for ${blobName}: ${e.message}`);
    }

    return {
      blobName,
      account: this.signer.accountAddress.toString(),
      merkleRoot,
      size,
      explorerUrl: this.buildExplorerUrl(blobName),
    };
  }

  public async downloadDatasetFile(input: { blobName: string; account?: string }): Promise<Buffer> {
    const accountAddress = input.account || this.config.account;
    const sdkClient = await this.getSdkClient();
    try {
      const blob = await sdkClient.download({
        account: accountAddress,
        blobName: input.blobName,
      });

      const chunks: Uint8Array[] = [];
      const reader = blob.readable.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      return Buffer.concat(chunks);
    } catch (e: any) {
      throw new Error(`Shelby SDK download failed for ${input.blobName} under account ${accountAddress}: ${e.message}`);
    }
  }

  public async downloadDatasetFileStream(input: { blobName: string; account?: string }): Promise<NodeJS.ReadableStream> {
    const accountAddress = input.account || this.config.account;
    const sdkClient = await this.getSdkClient();
    try {
      const blob = await sdkClient.download({
        account: accountAddress,
        blobName: input.blobName,
      });

      const { Readable } = await import('stream');
      return Readable.fromWeb(blob.readable as any);
    } catch (e: any) {
      throw new Error(`Shelby SDK download stream failed for ${input.blobName} under account ${accountAddress}: ${e.message}`);
    }
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
    account?: string;
  }): Promise<string> {
    const blobName = buildShelbyBlobName({
      owner: input.owner,
      slug: input.slug,
      version: input.version,
      path: 'manifest.json',
    });
    const buffer = await this.downloadDatasetFile({ blobName, account: input.account });
    return buffer.toString('utf-8');
  }

  public async getBlobMetadata(input: { blobName: string; account?: string }): Promise<ShelbyBlobMetadata | null> {
    const accountAddress = input.account || this.config.account;
    const sdkClient = await this.getSdkClient();
    try {
      const metadata = await sdkClient.coordination.getBlobMetadata({
        account: accountAddress,
        name: input.blobName,
      });

      if (!metadata) {
        return null;
      }

      const merkleRoot = Buffer.from(metadata.blobMerkleRoot).toString('hex');
      const uploadedAt = new Date(metadata.creationMicros / 1000);
      const owner = metadata.owner.toString();

      return {
        blobName: input.blobName,
        size: metadata.size,
        sha256: merkleRoot,
        merkleRoot,
        uploadedAt,
        owner,
      };
    } catch (e: any) {
      return null;
    }
  }

  public async verifyBlob(input: {
    blobName: string;
    expectedSha256: string;
    expectedMerkleRoot: string;
    expectedSize: number;
    account?: string;
  }): Promise<ShelbyVerificationResult> {
    try {
      const metadata = await this.getBlobMetadata({ blobName: input.blobName, account: input.account });
      if (!metadata) {
        return {
          valid: false,
          sha256Matched: false,
          merkleRootMatched: false,
          fileSizeMatched: false,
          message: 'Blob metadata not found on Shelby network',
        };
      }

      const merkleRootMatched = metadata.merkleRoot === input.expectedMerkleRoot;
      const fileSizeMatched = metadata.size === input.expectedSize;

      const buffer = await this.downloadDatasetFile({ blobName: input.blobName, account: input.account });
      const actualSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      const sha256Matched = actualSha256 === input.expectedSha256;

      const valid = merkleRootMatched && fileSizeMatched && sha256Matched;

      return {
        valid,
        sha256Matched,
        merkleRootMatched,
        fileSizeMatched,
        message: valid ? undefined : `Integrity verification mismatch. sha256Matched: ${sha256Matched}, merkleRootMatched: ${merkleRootMatched}, fileSizeMatched: ${fileSizeMatched}`,
      };
    } catch (e: any) {
      return {
        valid: false,
        sha256Matched: false,
        merkleRootMatched: false,
        fileSizeMatched: false,
        message: `Verification failed: ${e.message}`,
      };
    }
  }
}

// Global utility helpers
function buildShelbyBlobName(input: { owner: string; slug: string; version: string; path: string }): string {
  const cleanPath = input.path.replace(/^\/+|\/+$/g, '');
  return `datasets/${input.owner}/${input.slug}/${input.version}/${cleanPath}`;
}

function buildExplorerUrl(explorerBaseUrl: string, blobName: string): string {
  const base = explorerBaseUrl.replace(/\/+$/, '');
  return `${base}/blob/${blobName}`;
}

export class ShelbyClient {
  private provider: ShelbyProvider;
  private config: ShelbyConfig;

  constructor(config: ShelbyConfig) {
    this.config = config;

    if (!config.mode || (config.mode !== 'mock' && config.mode !== 'live')) {
      throw new Error(`Invalid ShelbyClient mode: '${config.mode}'. Must be either 'mock' or 'live'.`);
    }

    if (config.mode === 'mock') {
      this.provider = new MockShelbyProvider(config);
    } else {
      this.provider = new LiveShelbyProvider(config);
    }
  }

  public buildShelbyBlobName(input: { owner: string; slug: string; version: string; path: string }): string {
    return buildShelbyBlobName(input);
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

