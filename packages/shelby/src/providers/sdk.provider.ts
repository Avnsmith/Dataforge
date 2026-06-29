import * as crypto from 'crypto';
import { ShelbyProvider } from '../provider';
import { ShelbyConfig, ShelbyUploadResult, ShelbyBlobMetadata, ShelbyVerificationResult } from '../types';

export class LiveShelbyProvider implements ShelbyProvider {
  private config: ShelbyConfig;
  private sdkClient: any = null;
  private signer: any;
  
  // Circuit Breaker State
  private failureCount = 0;
  private circuitOpenUntil = 0;
  private readonly failureThreshold = 5;
  private readonly cooldownMs = 60000;

  constructor(config: ShelbyConfig) {
    this.config = config;

    // Throw STUBBED / READY_FOR_CONFIGURATION error if config is missing/incomplete
    if (!config.privateKey || !config.rpcUrl || !config.account) {
      throw new Error('STUBBED / READY_FOR_CONFIGURATION: Shelby configuration error: Live Shelby credentials (SHELBY_PRIVATE_KEY, SHELBY_RPC_URL, SHELBY_ACCOUNT) are not fully configured.');
    }

    try {
      const { Account, Ed25519PrivateKey } = require('@aptos-labs/ts-sdk');
      let rawKey = config.privateKey;
      if (rawKey.startsWith('ed25519-priv-')) {
        rawKey = rawKey.substring('ed25519-priv-'.length);
      }
      const privateKeyObj = new Ed25519PrivateKey(rawKey);
      this.signer = Account.fromPrivateKey({ privateKey: privateKeyObj });
    } catch (e: any) {
      throw new Error(`Shelby configuration error: Invalid SHELBY_PRIVATE_KEY format. Error: ${e.message}`);
    }
  }

  private checkCircuit() {
    if (this.failureCount >= this.failureThreshold) {
      const now = Date.now();
      if (now < this.circuitOpenUntil) {
        throw new Error('Circuit Breaker is OPEN. Live Shelby provider is currently disabled due to excessive failures.');
      } else {
        // Reset to half-open
        this.failureCount = 0;
      }
    }
  }

  private recordSuccess() {
    this.failureCount = 0;
  }

  private recordFailure() {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold) {
      this.circuitOpenUntil = Date.now() + this.cooldownMs;
    }
  }

  private async getSdkClient(): Promise<any> {
    this.checkCircuit();
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
        this.recordFailure();
        throw new Error(`Shelby Client initialization failed: ${e.message}`);
      }
    }
    return this.sdkClient;
  }

  private async callWithTimeoutAndRetry<T>(
    fn: () => Promise<T>,
    timeoutMs = 30000,
    retries = 3,
    delay = 1000
  ): Promise<T> {
    this.checkCircuit();
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const promise = fn();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Shelby SDK operation timed out')), timeoutMs)
        );
        const result = await Promise.race([promise, timeoutPromise]);
        this.recordSuccess();
        return result;
      } catch (err: any) {
        this.recordFailure();
        if (attempt === retries) {
          throw err;
        }
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
    throw new Error('Retry loop failed');
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

    return this.callWithTimeoutAndRetry(async () => {
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

      await sdkClient.upload({
        blobData: input.fileContent,
        signer: this.signer,
        blobName,
        expirationMicros,
      });

      return {
        blobName,
        account: this.signer.accountAddress.toString(),
        merkleRoot,
        size,
        explorerUrl: this.buildExplorerUrl(blobName),
      };
    });
  }

  public async downloadDatasetFile(input: { blobName: string; account?: string }): Promise<Buffer> {
    const accountAddress = input.account || this.config.account;
    return this.callWithTimeoutAndRetry(async () => {
      const sdkClient = await this.getSdkClient();
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
    });
  }

  public async downloadDatasetFileStream(input: { blobName: string; account?: string }): Promise<NodeJS.ReadableStream> {
    const accountAddress = input.account || this.config.account;
    return this.callWithTimeoutAndRetry(async () => {
      const sdkClient = await this.getSdkClient();
      const blob = await sdkClient.download({
        account: accountAddress,
        blobName: input.blobName,
      });
      const { Readable } = await import('stream');
      return Readable.fromWeb(blob.readable as any);
    });
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
    const blobName = this.buildShelbyBlobName({
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
    try {
      const sdkClient = await this.getSdkClient();
      const metadata = await sdkClient.coordination.getBlobMetadata({
        account: accountAddress,
        name: input.blobName,
      });

      if (!metadata) return null;

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
    } catch (e) {
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
        message: valid ? undefined : `Integrity verification mismatch.`,
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
