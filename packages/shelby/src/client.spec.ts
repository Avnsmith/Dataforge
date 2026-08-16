jest.mock('@shelby-protocol/sdk/node', () => ({
  ShelbyNodeClient: jest.fn().mockImplementation(() => ({
    upload: jest.fn(),
    download: jest.fn(),
    coordination: {
      getBlobMetadata: jest.fn(),
    },
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
  Ed25519PrivateKey: jest.fn().mockImplementation((key: string) => {
    if (!key || key === 'invalid-hex-key') {
      throw new Error('Invalid private key format');
    }
    return {};
  }),
  Network: {
    TESTNET: 'testnet',
    LOCAL: 'local',
    SHELBYNET: 'shelbynet',
    CUSTOM: 'custom',
  },
}));

import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { ShelbyClient, MockProvider, ShelbyLiveProvider } from './client';
import { ShelbyConfig } from './types';

describe('MockProvider', () => {
  const tempStorageDir = path.resolve(__dirname, '../temp-test-storage');
  const mockConfig: ShelbyConfig = {
    mode: 'mock',
    network: 'local',
    account: '0x123',
    privateKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
    rpcUrl: 'http://localhost:8080',
    explorerBaseUrl: 'https://explorer.shelby.xyz',
    storageDir: tempStorageDir,
  };

  let provider: MockProvider;

  beforeAll(() => {
    provider = new MockProvider(mockConfig);
  });

  afterAll(() => {
    if (fs.existsSync(tempStorageDir)) {
      fs.rmSync(tempStorageDir, { recursive: true, force: true });
    }
  });

  it('should successfully upload a mock file', async () => {
    const fileContent = Buffer.from('mock-dataset-payload-content', 'utf-8');
    const result = await provider.uploadDatasetFile({
      owner: 'testowner',
      slug: 'testslug',
      version: 'v1.0.0',
      path: 'data.csv',
      fileContent,
    });

    expect(result.blobName).toBe('datasets/testowner/testslug/v1.0.0/data.csv');
    expect(result.size).toBe(fileContent.length);
    expect(result.merkleRoot).toBeDefined();
    expect(result.explorerUrl).toContain('datasets/testowner/testslug/v1.0.0/data.csv');
  });

  it('should successfully download an uploaded mock file', async () => {
    const blobName = 'datasets/testowner/testslug/v1.0.0/data.csv';
    const downloaded = await provider.downloadDatasetFile({ blobName });
    expect(downloaded.toString('utf-8')).toBe('mock-dataset-payload-content');
  });

  it('should successfully stream an uploaded mock file', async () => {
    const blobName = 'datasets/testowner/testslug/v1.0.0/data.csv';
    const stream = await provider.downloadDatasetFileStream({ blobName });

    const chunks: Buffer[] = [];
    for await (const chunk of stream as any) {
      chunks.push(Buffer.from(chunk));
    }
    const result = Buffer.concat(chunks);
    expect(result.toString('utf-8')).toBe('mock-dataset-payload-content');
  });

  it('should upload and download a manifest successfully', async () => {
    const manifestContent = JSON.stringify({ version: '1.0', files: [] });
    await provider.uploadManifest({
      owner: 'testowner',
      slug: 'testslug',
      version: 'v1.0.0',
      manifestContent,
    });

    const downloaded = await provider.downloadManifest({
      owner: 'testowner',
      slug: 'testslug',
      version: 'v1.0.0',
    });
    expect(downloaded).toBe(manifestContent);
  });

  it('should retrieve correct metadata for an uploaded blob', async () => {
    const blobName = 'datasets/testowner/testslug/v1.0.0/data.csv';
    const metadata = await provider.getBlobMetadata({ blobName });

    expect(metadata).not.toBeNull();
    expect(metadata!.blobName).toBe(blobName);
    expect(metadata!.size).toBe(28);
    expect(metadata!.owner).toBe('testowner');
    expect(metadata!.merkleRoot).toBeDefined();
  });

  it('should verify the integrity of a mock blob successfully', async () => {
    const blobName = 'datasets/testowner/testslug/v1.0.0/data.csv';
    const fileContent = Buffer.from('mock-dataset-payload-content', 'utf-8');
    const sha256 = crypto.createHash('sha256').update(fileContent).digest('hex');
    const merkleRoot = crypto.createHash('sha256').update(`shelby-merkle:${sha256}`).digest('hex');

    const result = await provider.verifyBlob({
      blobName,
      expectedSha256: sha256,
      expectedMerkleRoot: merkleRoot,
      expectedSize: fileContent.length,
    });

    expect(result.valid).toBe(true);
    expect(result.sha256Matched).toBe(true);
    expect(result.merkleRootMatched).toBe(true);
    expect(result.fileSizeMatched).toBe(true);
  });
});

describe('ShelbyLiveProvider Configuration & Fallback', () => {
  it('should fail loudly when initializing with missing credentials', () => {
    const invalidConfig: ShelbyConfig = {
      mode: 'live',
      network: '',
      account: '',
      privateKey: '',
      rpcUrl: '',
      explorerBaseUrl: '',
    };

    expect(() => {
      new ShelbyLiveProvider(invalidConfig);
    }).toThrow('Shelby configuration error');
  });

  it('should fail loudly when private key is invalid', () => {
    const invalidConfig: ShelbyConfig = {
      mode: 'live',
      network: 'shelbynet',
      account: '0x123',
      privateKey: 'invalid-hex-key',
      rpcUrl: 'http://localhost:8080',
      explorerBaseUrl: 'https://explorer.shelby.xyz',
    };

    expect(() => {
      new ShelbyLiveProvider(invalidConfig);
    }).toThrow('Shelby configuration error: Invalid SHELBY_PRIVATE_KEY format');
  });
});

describe('ShelbyLiveProvider Integration Tests (Credential Checked)', () => {
  const hasLiveCreds =
    process.env.SHELBY_MODE === 'live' &&
    process.env.SHELBY_PRIVATE_KEY &&
    process.env.SHELBY_RPC_URL &&
    process.env.SHELBY_ACCOUNT &&
    process.env.SHELBY_NETWORK;

  if (!hasLiveCreds) {
    it('skipped - Live credentials are not configured in environment', () => {
      console.log('Skipping Live integration tests (no live credentials found in .env)');
    });
  } else {
    let liveProvider: ShelbyLiveProvider;

    beforeAll(() => {
      const liveConfig: ShelbyConfig = {
        mode: 'live',
        network: process.env.SHELBY_NETWORK!,
        account: process.env.SHELBY_ACCOUNT!,
        privateKey: process.env.SHELBY_PRIVATE_KEY!,
        rpcUrl: process.env.SHELBY_RPC_URL!,
        explorerBaseUrl: process.env.SHELBY_EXPLORER_BASE_URL || 'https://explorer.shelby.xyz',
        apiKey: process.env.SHELBY_API_KEY,
      };
      liveProvider = new ShelbyLiveProvider(liveConfig);
    });

    it('should connect to the live network and upload/download a test blob', async () => {
      const randomSuffix = crypto.randomBytes(4).toString('hex');
      const testContent = Buffer.from(`live-network-test-payload-${randomSuffix}`, 'utf-8');
      
      const uploadResult = await liveProvider.uploadDatasetFile({
        owner: process.env.SHELBY_ACCOUNT!,
        slug: 'live-test',
        version: 'v1.0.0',
        path: `test-${randomSuffix}.txt`,
        fileContent: testContent,
      });

      expect(uploadResult.blobName).toBeDefined();
      expect(uploadResult.merkleRoot).toBeDefined();

      // Download back
      const downloaded = await liveProvider.downloadDatasetFile({
        blobName: uploadResult.blobName,
        account: process.env.SHELBY_ACCOUNT!,
      });

      expect(downloaded.toString('utf-8')).toBe(testContent.toString('utf-8'));
    });
  }
});
