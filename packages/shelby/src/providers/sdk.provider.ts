import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import { ShelbyProvider } from '../provider';
import { ShelbyConfig, ShelbyUploadResult, ShelbyBlobMetadata, ShelbyVerificationResult } from '../types';

function getSdkDirPath() {
  let current = __dirname;
  while (true) {
    const target = path.join(current, 'node_modules', '@shelby-protocol', 'sdk');
    if (fs.existsSync(target)) {
      return target;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      // Fallback to absolute workspace location in production
      return '/app/node_modules/@shelby-protocol/sdk';
    }
    current = parent;
  }
}

async function importSdkNode() {
  const sdkDir = getSdkDirPath();
  const nodeIndexMjs = path.join(sdkDir, 'dist', 'node', 'index.mjs');
  const fileUrl = pathToFileURL(nodeIndexMjs).href;
  const importFn = new Function('url', 'return import(url)');
  return importFn(fileUrl);
}

export class ShelbyLiveProvider implements ShelbyProvider {
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
        const { ShelbyNodeClient } = await importSdkNode();
        const storageNodeUrl = this.config.rpcUrl.endsWith('/v1')
          ? this.config.rpcUrl.substring(0, this.config.rpcUrl.length - 3) + '/shelby'
          : this.config.rpcUrl;

        const clientInstance = new ShelbyNodeClient({
          network: this.config.network as any,
          apiKey: this.config.apiKey,
          aptos: {
            fullnode: this.config.rpcUrl,
          },
          rpc: {
            baseUrl: storageNodeUrl,
            apiKey: this.config.apiKey,
          },
        });

        // Intercept/monkey-patch coordination getBlobMetadata call to support Shelbynet v1 metadata structure
        if (clientInstance.coordination && typeof clientInstance.coordination.getBlobMetadata === 'function') {
          const originalGet = clientInstance.coordination.getBlobMetadata.bind(clientInstance.coordination);
          clientInstance.coordination.getBlobMetadata = async (params: any) => {
            if (this.config.network === 'shelbynet') {
              try {
                const { Aptos, AptosConfig, Network } = require('@aptos-labs/ts-sdk');
                const aptosConfig = new AptosConfig({
                  network: Network.CUSTOM,
                  fullnode: 'https://api.shelbynet.shelby.xyz/v1'
                });
                const aptos = new Aptos(aptosConfig);
                
                const accountStr = typeof params.account === 'string' ? params.account : params.account.toString();
                const normalizedOwner = accountStr.startsWith('0x') ? accountStr : `0x${accountStr}`;
                const ownerLongWithoutPrefix = normalizedOwner.toLowerCase().replace(/^0x/i, '').padStart(64, '0');
                const blobKey = `@${ownerLongWithoutPrefix}/${params.name}`;
                
                const rawViewRes = await aptos.view({
                  payload: {
                    function: '0x85fdb9a176ab8ef1d9d9c1b60d60b3924f0800ac1de1cc2085fb0b8bb4988e6a::blob_metadata::get_full_object_metadata',
                    functionArguments: [blobKey]
                  }
                });
                
                if (!rawViewRes?.[0]?.vec?.[0]) {
                  return undefined;
                }
                
                const fullObject = rawViewRes[0].vec[0];
                let blobMetadata = fullObject.blob_metadata?.vec?.[0] || fullObject.blob_metadata;
                if (!blobMetadata) return undefined;
                if (blobMetadata.vec && Array.isArray(blobMetadata.vec)) {
                  blobMetadata = blobMetadata.vec[0];
                }
                if (!blobMetadata) return undefined;

                let content = blobMetadata.content?.vec?.[0] || blobMetadata.content;
                if (content && content.vec && Array.isArray(content.vec)) {
                  content = content.vec[0];
                }
                
                let encoding = content?.encoding?.vec?.[0] || content?.encoding;
                if (encoding && encoding.vec && Array.isArray(encoding.vec)) {
                  encoding = encoding.vec[0];
                }

                const sizeVal = content?.blob_size || 0;
                const rawCommitment = content?.blob_commitment;
                
                let blobMerkleRoot: Uint8Array | undefined;
                if (rawCommitment) {
                  const commitmentHex = typeof rawCommitment === 'string' 
                    ? rawCommitment 
                    : Buffer.from(rawCommitment).toString('hex');
                  const hexParts = commitmentHex.replace(/^0x/i, '').match(/.{1,2}/g) || [];
                  blobMerkleRoot = new Uint8Array(
                    hexParts.map((b: string) => parseInt(b, 16))
                  );
                }

                return {
                  blobMerkleRoot,
                  owner: blobMetadata.owner,
                  creationMicros: Number(blobMetadata.creation_micros || 0),
                  expirationMicros: Number(blobMetadata.expiration_micros || 0),
                  size: Number(sizeVal),
                  encoding
                };
              } catch (err: any) {
                console.error("[MONKEY PATCH ERROR] getBlobMetadata failed:", err.message, err.stack);
                return originalGet(params);
              }
            } else {
              return originalGet(params);
            }
          };
        }

        // Intercept/monkey-patch coordination registerBlob call to support Shelbynet v1 10-argument function signature
        if (clientInstance.coordination && typeof clientInstance.coordination.registerBlob === 'function') {
          const originalRegister = clientInstance.coordination.registerBlob.bind(clientInstance.coordination);
          clientInstance.coordination.registerBlob = async (params: any) => {
            if (this.config.network === 'shelbynet') {
              try {
                const options = clientInstance.coordination.mergeOptions(params.options);
                const { defaultErasureCodingConfig, expectedTotalChunksets } = await importSdkNode();
                const config = params.config ?? defaultErasureCodingConfig();
                const chunksetSize = config.chunkSizeBytes * config.erasure_k;
                const numChunksets = expectedTotalChunksets(params.size || params.blobSize, chunksetSize);
                
                const functionName = options.usdSponsor !== undefined ? "register_blob_with_sponsor" : "register_blob";
                const functionPath = `${clientInstance.coordination.deployer.toString()}::blob_metadata::${functionName}`;
                
                let fileMerkleBytes: Uint8Array;
                if (params.blobMerkleRoot instanceof Uint8Array) {
                  fileMerkleBytes = params.blobMerkleRoot;
                } else {
                  const merkleHex = params.blobMerkleRoot.startsWith('0x') ? params.blobMerkleRoot : `0x${params.blobMerkleRoot}`;
                  const hexParts = merkleHex.replace(/^0x/i, '').match(/.{1,2}/g) || [];
                  fileMerkleBytes = new Uint8Array(
                    hexParts.map((b: string) => parseInt(b, 16))
                  );
                }

                const functionArguments = [
                  params.blobName,
                  null, // description
                  null, // content-type
                  params.expirationMicros.toString(),
                  fileMerkleBytes, // merkleRoot
                  numChunksets,
                  (params.size || params.blobSize).toString(),
                  0,
                  0,
                  0
                ];

                const buildArgs = {
                  ...options.build,
                  options: clientInstance.coordination.orderlessTxOptions(options.build?.options),
                  data: {
                    function: functionPath,
                    typeArguments: [],
                    functionArguments
                  },
                  sender: params.account.accountAddress
                };

                const transaction = options.usdSponsor ? await clientInstance.coordination.aptos.transaction.build.multiAgent({
                  ...buildArgs,
                  secondarySignerAddresses: [options.usdSponsor.feePayerAddress]
                }) : await clientInstance.coordination.aptos.transaction.build.simple(buildArgs);

                return {
                  transaction: await clientInstance.coordination.aptos.signAndSubmitTransaction({
                    signer: params.account,
                    transaction,
                    ...options.submit
                  })
                };
              } catch (err: any) {
                console.error("[MONKEY PATCH ERROR] registerBlob failed:", err.message, err.stack);
                return originalRegister(params);
              }
            } else {
              return originalRegister(params);
            }
          };
        }

        this.sdkClient = clientInstance;
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
        const { createDefaultErasureCodingProvider, generateCommitments } = await importSdkNode();
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
