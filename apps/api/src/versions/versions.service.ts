import { Injectable, NotFoundException, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { prisma, DatasetVersion, DatasetFile } from '@dataforge/db';
import { ShelbyClient } from '@dataforge/shelby';
import { calculateQualityScore } from '@dataforge/ai';
import { CreateVersionDto } from '@dataforge/shared';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class VersionsService {
  private readonly logger = new Logger(VersionsService.name);
  private shelbyClient: ShelbyClient;
  private tempUploadPath: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectQueue('upload-queue') private readonly uploadQueue: Queue
  ) {
    this.shelbyClient = new ShelbyClient({
      mode: this.configService.get<any>('SHELBY_MODE') || 'mock',
      network: this.configService.get<string>('SHELBY_NETWORK') || 'shelbynet',
      account: this.configService.get<string>('SHELBY_ACCOUNT') || '',
      privateKey: this.configService.get<string>('SHELBY_PRIVATE_KEY') || '',
      rpcUrl: this.configService.get<string>('SHELBY_RPC_URL') || '',
      explorerBaseUrl: this.configService.get<string>('SHELBY_EXPLORER_BASE_URL') || 'https://explorer.shelby.xyz/shelbynet',
      apiKey: this.configService.get<string>('SHELBY_API_KEY') || undefined,
      storageDir: this.configService.get<string>('SHELBY_STORAGE_DIR') || undefined,
    });

    this.tempUploadPath = path.resolve(__dirname, '../../temp-uploads');
    if (!fs.existsSync(this.tempUploadPath)) {
      fs.mkdirSync(this.tempUploadPath, { recursive: true });
    }
  }

  async getRequiredUser(walletAddress?: string) {
    if (!walletAddress) {
      throw new UnauthorizedException('Authentication wallet address is required');
    }
    const user = await prisma.user.findUnique({
      where: { walletAddress: walletAddress.toLowerCase() },
    });
    if (!user) {
      throw new UnauthorizedException('User not registered');
    }
    return user;
  }

  async createVersion(
    datasetId: string,
    createDto: CreateVersionDto,
    walletAddress?: string
  ): Promise<DatasetVersion> {
    const user = await this.getRequiredUser(walletAddress);
    const dataset = await prisma.dataset.findUnique({
      where: { id: datasetId },
    });

    if (!dataset) {
      throw new NotFoundException('Dataset not found');
    }

    if (dataset.ownerId !== user.id) {
      throw new UnauthorizedException('You do not own this dataset');
    }

    // Check if version string is unique for this dataset
    const existing = await prisma.datasetVersion.findUnique({
      where: {
        datasetId_version: {
          datasetId,
          version: createDto.version,
        },
      },
    });

    if (existing) {
      throw new BadRequestException(`Version ${createDto.version} already exists for this dataset.`);
    }

    return prisma.datasetVersion.create({
      data: {
        datasetId,
        version: createDto.version,
        changelog: createDto.changelog,
        status: 'draft',
      },
    });
  }

  async uploadFile(
    versionId: string,
    filePath: string,
    fileBuffer: Buffer,
    walletAddress?: string
  ): Promise<DatasetFile> {
    const user = await this.getRequiredUser(walletAddress);
    
    // Validate file path — must be checked BEFORE any sanitization
    if (!filePath || filePath.trim() === '') {
      throw new BadRequestException('File path cannot be empty');
    }
    if (filePath.includes('\0')) {
      throw new BadRequestException('File path cannot contain null bytes');
    }
    if (filePath.includes('\\')) {
      throw new BadRequestException('Backslash is not allowed in file paths');
    }
    // Reject absolute paths BEFORE stripping slashes
    if (path.isAbsolute(filePath)) {
      throw new BadRequestException('Absolute paths are not allowed');
    }
    // Reject path traversal sequences
    if (filePath.includes('..')) {
      throw new BadRequestException('Path traversal sequences (..) are not allowed');
    }
    // Reject Windows-style absolute paths (C:\, D:\, etc.)
    if (/^[a-zA-Z]:[/\\]/.test(filePath)) {
      throw new BadRequestException('Windows absolute paths are not allowed');
    }

    // Validate file extension/type whitelist
    const allowedExtensions = ['.csv', '.json', '.md', '.txt', '.png', '.jpg', '.jpeg', '.webp', '.pdf', '.zip', '.parquet', '.h5', '.bin'];
    const fileExt = path.extname(filePath).toLowerCase();
    if (!allowedExtensions.includes(fileExt)) {
      throw new BadRequestException(`File extension '${fileExt}' is not allowed for upload. Supported formats: ${allowedExtensions.join(', ')}`);
    }

    const version = await prisma.datasetVersion.findUnique({
      where: { id: versionId },
      include: { dataset: { include: { owner: true } } },
    });

    if (!version) {
      throw new NotFoundException('Version not found');
    }

    if (version.dataset.ownerId !== user.id) {
      throw new UnauthorizedException('You do not own this dataset');
    }

    if (version.status !== 'draft' && version.status !== 'uploading') {
      throw new BadRequestException('Files can only be uploaded to draft or uploading versions');
    }

    // Set status to uploading
    if (version.status === 'draft') {
      await prisma.datasetVersion.update({
        where: { id: versionId },
        data: { status: 'uploading' },
      });
    }

    // Create temp storage directory
    const versionTempDir = path.join(this.tempUploadPath, versionId);
    if (!fs.existsSync(versionTempDir)) {
      fs.mkdirSync(versionTempDir, { recursive: true });
    }

    // Save file locally in temp path
    const cleanPath = filePath.replace(/^\/+|\/+$/g, '');
    const tempFileFullPath = this.safeJoin(versionTempDir, cleanPath);
    const dirOfTempFile = path.dirname(tempFileFullPath);
    if (!fs.existsSync(dirOfTempFile)) {
      fs.mkdirSync(dirOfTempFile, { recursive: true });
    }
    fs.writeFileSync(tempFileFullPath, fileBuffer);

    // Calculate details
    const size = fileBuffer.length;
    const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const shelbyBlobName = this.shelbyClient.buildShelbyBlobName({
      owner: version.dataset.owner.walletAddress,
      slug: version.dataset.slug,
      version: version.version,
      path: cleanPath,
    });

    // Check if file already exists in this version
    const existingFile = await prisma.datasetFile.findFirst({
      where: { versionId, path: cleanPath },
    });

    if (existingFile) {
      // Update existing file
      return prisma.datasetFile.update({
        where: { id: existingFile.id },
        data: {
          size: BigInt(size),
          sha256,
          shelbyBlobName,
        },
      });
    }

    // Create new DatasetFile entry (explorerUrl and merkleRoot populated by worker)
    return prisma.datasetFile.create({
      data: {
        versionId,
        path: cleanPath,
        size: BigInt(size),
        sha256,
        shelbyBlobName,
      },
    });
  }

  async publishVersion(versionId: string, transactionHash?: string, walletAddress?: string): Promise<DatasetVersion> {
    const user = await this.getRequiredUser(walletAddress);
    const version = await prisma.datasetVersion.findUnique({
      where: { id: versionId },
      include: { dataset: true, files: true },
    });

    if (!version) {
      throw new NotFoundException('Version not found');
    }

    if (version.dataset.ownerId !== user.id) {
      throw new UnauthorizedException('You do not own this dataset');
    }

    if (version.files.length === 0) {
      throw new BadRequestException('Cannot publish a version with no files. Please upload files first.');
    }

    const mode = this.configService.get<string>('SHELBY_MODE') || 'mock';
    if (mode === 'live' && !transactionHash) {
      throw new BadRequestException('transactionHash is required in live mode');
    }

    if (mode === 'live' && transactionHash) {
      const isTxValid = await this.verifyAptosTransaction(
        transactionHash,
        user.walletAddress,
        '',
        0n
      );
      if (!isTxValid) {
        throw new BadRequestException('On-chain transaction verification failed for manifest publish.');
      }
    }

    // Update status to processing and save transaction metadata
    const updated = await prisma.datasetVersion.update({
      where: { id: versionId },
      data: {
        status: 'processing',
        provider: mode,
        providerTxHash: transactionHash || null,
        providerStatus: 'processing',
        providerTimestamp: new Date(),
      },
    });

    // Add processing job to BullMQ with retries & backoff configuration
    await this.uploadQueue.add(
      'process-version',
      {
        versionId,
        datasetId: version.datasetId,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      }
    );

    return updated;
  }

  async getVersions(datasetId: string): Promise<DatasetVersion[]> {
    return prisma.datasetVersion.findMany({
      where: { datasetId },
      orderBy: { createdAt: 'desc' },
      include: { files: true },
    });
  }

  async getVersionDetails(id: string): Promise<DatasetVersion> {
    const version = await prisma.datasetVersion.findUnique({
      where: { id },
      include: {
        dataset: {
          include: { owner: true }
        },
        files: true,
      },
    });

    if (!version) {
      throw new NotFoundException('Version not found');
    }

    return version;
  }

  async getFiles(versionId: string): Promise<DatasetFile[]> {
    return prisma.datasetFile.findMany({
      where: { versionId },
      orderBy: { path: 'asc' },
    });
  }

  async downloadFile(fileId: string): Promise<{ buffer: Buffer; file: DatasetFile }> {
    const file = await prisma.datasetFile.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    const buffer = await this.shelbyClient.downloadDatasetFile({
      blobName: file.shelbyBlobName,
      account: file.shelbyAccount || undefined,
    });

    return { buffer, file };
  }

  async downloadFileStream(fileId: string): Promise<{ stream: NodeJS.ReadableStream; file: DatasetFile }> {
    const file = await prisma.datasetFile.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    const mode = this.configService.get<string>('SHELBY_MODE');
    if (mode === 'live') {
      const stream = await this.shelbyClient.downloadDatasetFileStream({
        blobName: file.shelbyBlobName,
        account: file.shelbyAccount || undefined,
      });
      return { stream, file };
    }

    // Resolve file path dynamically from packages/shelby storage
    const storagePath = this.configService.get<string>('SHELBY_STORAGE_DIR') || path.resolve(__dirname, '../../../../packages/shelby/storage');
    const filePath = path.join(storagePath, file.shelbyBlobName);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`File not found in storage: ${file.shelbyBlobName}`);
    }

    const stream = fs.createReadStream(filePath);
    return { stream, file };
  }

  async getVersionStatus(id: string): Promise<{ id: string; status: string; totalSize: string | null; fileCount: number | null }> {
    const version = await prisma.datasetVersion.findUnique({
      where: { id },
      select: { id: true, status: true, totalSize: true, fileCount: true },
    });
    if (!version) {
      throw new NotFoundException('Version not found');
    }
    return {
      id: version.id,
      status: version.status,
      totalSize: version.totalSize ? version.totalSize.toString() : null,
      fileCount: version.fileCount,
    };
  }

  async getFilePreview(fileId: string): Promise<any> {
    const file = await prisma.datasetFile.findUnique({
      where: { id: fileId },
      include: { version: { include: { dataset: true } } },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Load file buffer
    const buffer = await this.shelbyClient.downloadDatasetFile({
      blobName: file.shelbyBlobName,
      account: file.shelbyAccount || undefined,
    });

    const fileContent = buffer.toString('utf-8');
    const ext = path.extname(file.path).toLowerCase();

    const readmeExists = !!file.version.dataset.readme;
    const qualityScore = calculateQualityScore(
      [{ path: file.path, size: Number(file.size) }],
      readmeExists
    );

    const previewData: any = {
      type: 'raw',
      fileName: path.basename(file.path),
      size: file.size.toString(),
      mimeType: file.mimeType,
      sha256: file.sha256,
      qualityScore,
      stats: {
        rows: 0,
        columns: 0,
        fileCount: 1,
        totalSize: file.size.toString(),
        schema: {},
        missingValues: 0,
      }
    };

    if (ext === '.csv') {
      try {
        const rows = fileContent.split('\n').map(r => r.split(','));
        const headers = rows[0] || [];
        const dataRows = rows.slice(1).filter(r => r.length > 0 && r.some(cell => cell.trim() !== ''));
        const first50 = dataRows.slice(0, 50);

        // Infer schema types
        const schema: any = {};
        headers.forEach((h, i) => {
          const sample = first50[0]?.[i]?.trim() || '';
          let type = 'string';
          if (sample && !isNaN(Number(sample))) {
            type = 'number';
          } else if (sample.toLowerCase() === 'true' || sample.toLowerCase() === 'false') {
            type = 'boolean';
          }
          schema[h.trim()] = type;
        });

        // Count missing/empty cells
        let missingValues = 0;
        dataRows.forEach(r => {
          r.forEach(cell => {
            if (!cell || cell.trim() === '') {
              missingValues++;
            }
          });
        });

        previewData.type = 'csv';
        previewData.preview = first50;
        previewData.headers = headers.map(h => h.trim());
        previewData.stats = {
          rows: dataRows.length,
          columns: headers.length,
          schema,
          missingValues,
        };
      } catch (e) {
        previewData.preview = fileContent.substring(0, 2000);
      }
    } else if (ext === '.json') {
      try {
        const parsed = JSON.parse(fileContent);
        previewData.type = 'json';
        previewData.preview = parsed;

        if (Array.isArray(parsed)) {
          const firstRow = parsed[0] || {};
          const schema: any = {};
          Object.keys(firstRow).forEach(k => {
            schema[k] = typeof firstRow[k];
          });

          previewData.stats = {
            rows: parsed.length,
            columns: Object.keys(firstRow).length,
            schema,
            missingValues: 0,
          };
        } else {
          const schema: any = {};
          Object.keys(parsed).forEach(k => {
            schema[k] = typeof parsed[k];
          });

          previewData.stats = {
            rows: 1,
            columns: Object.keys(parsed).length,
            schema,
            missingValues: 0,
          };
        }
      } catch (e) {
        previewData.preview = fileContent.substring(0, 2000);
      }
    } else if (ext === '.md') {
      previewData.type = 'markdown';
      previewData.preview = fileContent;
    } else if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp') {
      previewData.type = 'image';
      previewData.preview = `data:${file.mimeType || 'image/png'};base64,${buffer.toString('base64')}`;
    } else {
      previewData.preview = fileContent.substring(0, 2000);
    }

    return previewData;
  }

  private safeJoin(baseDir: string, userPath: string): string {
    // 1. Reject absolute paths
    if (path.isAbsolute(userPath)) {
      throw new BadRequestException('Absolute paths are not allowed');
    }

    // 2. Reject paths containing '..'
    if (userPath.split(path.sep).includes('..') || userPath.includes('..')) {
      throw new BadRequestException('Path traversal sequences (..) are not allowed');
    }

    // 3. Resolve path and ensure it is under baseDir
    const resolvedPath = path.resolve(baseDir, userPath);
    const resolvedBase = path.resolve(baseDir);

    if (!resolvedPath.startsWith(resolvedBase)) {
      throw new BadRequestException('Path escapes target directory boundaries');
    }

    return resolvedPath;
  }

  async verifyAptosTransaction(
    txHash: string,
    expectedSender: string,
    expectedMerkleRoot: string,
    expectedSize: bigint
  ): Promise<boolean> {
    const mode = this.configService.get<string>('SHELBY_MODE') || 'mock';
    if (mode === 'mock') {
      return true;
    }

    this.logger.log(`Aptos transaction verification started for txHash=${txHash}...`);

    try {
      const { Aptos, AptosConfig } = require('@aptos-labs/ts-sdk');
      const network = this.configService.get<string>('SHELBY_NETWORK') || 'shelbynet';
      
      const aptosConfig = new AptosConfig({
        network: network as any,
        clientConfig: {
          API_KEY: this.configService.get<string>('SHELBY_API_KEY')
        }
      });
      const aptos = new Aptos(aptosConfig);

      const timeoutMs = 30000;
      const startTime = Date.now();
      let tx = null;

      while (Date.now() - startTime < timeoutMs) {
        try {
          this.logger.log(`Waiting for transaction ${txHash} to be indexed/finalized on-chain...`);
          tx = await aptos.getTransactionByHash({ transactionHash: txHash });
          if (tx) {
            this.logger.log(`Transaction ${txHash} found on-chain.`);
            break;
          }
        } catch (e) {
          const errMsg = e.message || '';
          if (errMsg.includes('transaction_not_found') || errMsg.includes('404')) {
            this.logger.log(`Transaction ${txHash} not indexed yet. Retrying in 1s...`);
          } else {
            this.logger.warn(`Unexpected error while checking transaction ${txHash}: ${e.message}`);
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (!tx) {
        this.logger.error(`Aptos transaction confirmation timed out for txHash=${txHash}`);
        return false;
      }

      if (!tx.success) {
        this.logger.error(`Aptos transaction ${txHash} failed on-chain.`);
        return false;
      }

      // Verify sender
      const cleanSender = tx.sender.toLowerCase();
      const cleanExpectedSender = expectedSender.toLowerCase();
      if (cleanSender !== cleanExpectedSender) {
        this.logger.warn(`Sender mismatch for txHash=${txHash}: expected=${cleanExpectedSender}, actual=${cleanSender}`);
        return false;
      }

      // Verify function payload
      const payload = tx.payload;
      if (!payload || payload.type !== 'entry_function_payload') {
        this.logger.warn(`Invalid transaction payload type for txHash=${txHash}: ${payload?.type}`);
        return false;
      }

      const funcName = payload.function;
      const expectedFuncPrefix = '::blob_metadata::register_blob';
      if (!funcName.includes(expectedFuncPrefix)) {
        this.logger.warn(`Invalid transaction function for txHash=${txHash}: ${funcName}`);
        return false;
      }

      // Verify arguments
      const args = payload.arguments;
      if (!args || args.length < 5) {
        this.logger.warn(`Invalid transaction arguments length for txHash=${txHash}: ${args?.length}`);
        return false;
      }

      // Normalize Merkle Root comparison if expected is not empty
      if (expectedMerkleRoot) {
        const onChainMerkle = args[2].replace(/^0x/i, '').toLowerCase();
        const cleanExpectedMerkle = expectedMerkleRoot.replace(/^0x/i, '').toLowerCase();
        if (onChainMerkle !== cleanExpectedMerkle) {
          this.logger.warn(`Merkle root mismatch for txHash=${txHash}: expected=${cleanExpectedMerkle}, actual=${onChainMerkle}`);
          return false;
        }
      }

      // Compare size if expected is not 0
      if (expectedSize > 0n) {
        const onChainSize = BigInt(args[4]);
        if (onChainSize !== expectedSize) {
          this.logger.warn(`Size mismatch for txHash=${txHash}: expected=${expectedSize}, actual=${onChainSize}`);
          return false;
        }
      }

      this.logger.log(`Transaction ${txHash} verification passed.`);
      return true;
    } catch (e) {
      this.logger.error(`Aptos transaction verification failed for txHash=${txHash}: ${e.message}`, e.stack);
      return false;
    }
  }

  async prepareFile(
    versionId: string,
    filePath: string,
    fileBuffer: Buffer,
    walletAddress?: string
  ): Promise<any> {
    const user = await this.getRequiredUser(walletAddress);
    
    // Path and traversal validations
    if (!filePath || filePath.trim() === '') {
      throw new BadRequestException('File path cannot be empty');
    }
    if (filePath.includes('\0')) {
      throw new BadRequestException('File path cannot contain null bytes');
    }
    if (filePath.includes('\\')) {
      throw new BadRequestException('Backslash is not allowed in file paths');
    }
    if (path.isAbsolute(filePath)) {
      throw new BadRequestException('Absolute paths are not allowed');
    }
    if (filePath.includes('..')) {
      throw new BadRequestException('Path traversal sequences (..) are not allowed');
    }
    if (/^[a-zA-Z]:[/\\]/.test(filePath)) {
      throw new BadRequestException('Windows absolute paths are not allowed');
    }

    // Whitelist check
    const allowedExtensions = ['.csv', '.json', '.md', '.txt', '.png', '.jpg', '.jpeg', '.webp', '.pdf', '.zip', '.parquet', '.h5', '.bin'];
    const fileExt = path.extname(filePath).toLowerCase();
    if (!allowedExtensions.includes(fileExt)) {
      throw new BadRequestException(`File extension '${fileExt}' is not allowed.`);
    }

    const version = await prisma.datasetVersion.findUnique({
      where: { id: versionId },
      include: { dataset: { include: { owner: true } } },
    });

    if (!version) {
      throw new NotFoundException('Version not found');
    }

    if (version.dataset.ownerId !== user.id) {
      throw new UnauthorizedException('You do not own this dataset');
    }

    if (version.status !== 'draft' && version.status !== 'uploading') {
      throw new BadRequestException('Files can only be prepared for draft or uploading versions');
    }

    // 1. Calculate commitments
    const size = fileBuffer.length;
    const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    
    let merkleRoot = sha256;
    let numChunksets = 1;
    let expirationMicros = (Date.now() + 365 * 24 * 60 * 60 * 1000) * 1000;
    let encodingIndex = 0;
    
    const mode = this.configService.get<string>('SHELBY_MODE') || 'mock';
    if (mode === 'live') {
      try {
        const { createDefaultErasureCodingProvider, generateCommitments, defaultErasureCodingConfig, expectedTotalChunksets } = await this.importSdkNode();
        const provider = await createDefaultErasureCodingProvider();
        const commitments = await generateCommitments(provider, fileBuffer);
        merkleRoot = commitments.blob_merkle_root;
        
        const config = defaultErasureCodingConfig();
        const chunksetSize = config.chunkSizeBytes * config.erasure_k;
        numChunksets = expectedTotalChunksets(size, chunksetSize);
        encodingIndex = config.enumIndex;
      } catch (err: any) {
        throw new BadRequestException(`Failed to generate commitments: ${err.message}`);
      }
    } else {
      // Mock mode
      merkleRoot = crypto.createHash('sha256').update(`shelby-merkle:${sha256}`).digest('hex');
    }

    const cleanPath = filePath.replace(/^\/+|\/+$/g, '');
    const blobName = this.shelbyClient.buildShelbyBlobName({
      owner: version.dataset.owner.walletAddress,
      slug: version.dataset.slug,
      version: version.version,
      path: cleanPath,
    });

    // 2. Save file temporarily in a .tmp path
    const versionTempDir = path.join(this.tempUploadPath, versionId);
    if (!fs.existsSync(versionTempDir)) {
      fs.mkdirSync(versionTempDir, { recursive: true });
    }
    const tempFileFullPath = this.safeJoin(versionTempDir, `${cleanPath}.tmp`);
    const dirOfTempFile = path.dirname(tempFileFullPath);
    if (!fs.existsSync(dirOfTempFile)) {
      fs.mkdirSync(dirOfTempFile, { recursive: true });
    }
    fs.writeFileSync(tempFileFullPath, fileBuffer);

    // 3. Construct Move transaction payload
    const payload = {
      function: '0x85fdb9a176ab8ef1d9d9c1b60d60b3924f0800ac1de1cc2085fb0b8bb4988e6a::blob_metadata::register_blob',
      type_arguments: [],
      arguments: [
        blobName,
        expirationMicros.toString(),
        merkleRoot.startsWith('0x') ? merkleRoot : `0x${merkleRoot}`,
        numChunksets,
        size.toString(),
        0,
        encodingIndex
      ]
    };

    return {
      blobName,
      merkleRoot,
      size,
      numChunksets,
      expirationMicros,
      payload
    };
  }

  async confirmUploadFile(
    versionId: string,
    filePath: string,
    transactionHash: string,
    walletAddress?: string
  ): Promise<DatasetFile> {
    const user = await this.getRequiredUser(walletAddress);
    
    const version = await prisma.datasetVersion.findUnique({
      where: { id: versionId },
      include: { dataset: { include: { owner: true } } },
    });

    if (!version) {
      throw new NotFoundException('Version not found');
    }

    if (version.dataset.ownerId !== user.id) {
      throw new UnauthorizedException('You do not own this dataset');
    }

    const cleanPath = filePath.replace(/^\/+|\/+$/g, '');
    const versionTempDir = path.join(this.tempUploadPath, versionId);
    const tempFileFullPath = this.safeJoin(versionTempDir, `${cleanPath}.tmp`);

    if (!fs.existsSync(tempFileFullPath)) {
      throw new BadRequestException('Staged file not found. Please call prepare first.');
    }

    const fileBuffer = fs.readFileSync(tempFileFullPath);
    const size = fileBuffer.length;
    const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Calculate expected Merkle Root
    let merkleRoot = sha256;
    const mode = this.configService.get<string>('SHELBY_MODE') || 'mock';
    if (mode === 'live') {
      try {
        const { createDefaultErasureCodingProvider, generateCommitments } = await this.importSdkNode();
        const provider = await createDefaultErasureCodingProvider();
        const commitments = await generateCommitments(provider, fileBuffer);
        merkleRoot = commitments.blob_merkle_root;
      } catch (err: any) {
        throw new BadRequestException(`Failed to generate commitments: ${err.message}`);
      }
    } else {
      merkleRoot = crypto.createHash('sha256').update(`shelby-merkle:${sha256}`).digest('hex');
    }

    // 1. Verify transaction on-chain
    const isTxValid = await this.verifyAptosTransaction(
      transactionHash,
      user.walletAddress,
      merkleRoot,
      BigInt(size)
    );

    if (!isTxValid) {
      throw new BadRequestException('On-chain transaction verification failed or is not confirmed yet.');
    }

    // Rename file from .tmp to proper name
    const finalFileFullPath = this.safeJoin(versionTempDir, cleanPath);
    const dirOfFinalFile = path.dirname(finalFileFullPath);
    if (!fs.existsSync(dirOfFinalFile)) {
      fs.mkdirSync(dirOfFinalFile, { recursive: true });
    }
    fs.renameSync(tempFileFullPath, finalFileFullPath);

    const shelbyBlobName = this.shelbyClient.buildShelbyBlobName({
      owner: version.dataset.owner.walletAddress,
      slug: version.dataset.slug,
      version: version.version,
      path: cleanPath,
    });

    // Check if file already exists in this version
    const existingFile = await prisma.datasetFile.findFirst({
      where: { versionId, path: cleanPath },
    });

    const fileData = {
      size: BigInt(size),
      sha256,
      shelbyBlobName,
      shelbyAccount: user.walletAddress,
      shelbyMerkleRoot: merkleRoot,
      explorerUrl: this.shelbyClient.buildExplorerUrl(shelbyBlobName)
    };

    if (existingFile) {
      return prisma.datasetFile.update({
        where: { id: existingFile.id },
        data: fileData,
      });
    }

    return prisma.datasetFile.create({
      data: {
        versionId,
        path: cleanPath,
        ...fileData,
      },
    });
  }

  async preparePublish(versionId: string, walletAddress?: string): Promise<any> {
    const user = await this.getRequiredUser(walletAddress);
    const version = await prisma.datasetVersion.findUnique({
      where: { id: versionId },
      include: {
        dataset: {
          include: { owner: true }
        },
        files: true,
      },
    });

    if (!version) {
      throw new NotFoundException('Version not found');
    }

    if (version.dataset.ownerId !== user.id) {
      throw new UnauthorizedException('You do not own this dataset');
    }

    if (version.files.length === 0) {
      throw new BadRequestException('Cannot publish a version with no files. Please upload files first.');
    }

    // Build manifest exactly as the worker does
    const manifestFiles = version.files.map(f => ({
      path: f.path,
      sha256: f.sha256,
      size: Number(f.size),
      mimeType: f.mimeType || this.detectMimeType(f.path),
      shelbyBlobName: f.shelbyBlobName,
      shelbyMerkleRoot: f.shelbyMerkleRoot || '',
    }));

    // Resolve Lineage metadata
    const lineageRecords = await prisma.datasetLineage.findMany({
      where: { childVersionId: version.id },
      include: {
        parentVersion: {
          include: {
            dataset: {
              include: { owner: true }
            }
          }
        }
      }
    });

    const manifestLineage = lineageRecords.map((lin: any) => ({
      relationType: lin.relationType,
      parentDataset: `${lin.parentVersion.dataset.owner.username || lin.parentVersion.dataset.owner.walletAddress}/${lin.parentVersion.dataset.slug}`,
      parentVersion: lin.parentVersion.version,
    }));

    const { recommendTags, detectDatasetType } = require('@dataforge/ai');
    const manifest = {
      schemaVersion: '1.0',
      name: version.dataset.name,
      version: version.version,
      owner: version.dataset.owner.username || version.dataset.owner.walletAddress,
      license: version.dataset.license || 'MIT',
      type: detectDatasetType(version.files),
      tags: recommendTags(version.files.map(f => ({ path: f.path, size: Number(f.size) }))),
      createdAt: version.createdAt.toISOString(),
      files: manifestFiles,
      lineage: manifestLineage,
    };

    const manifestString = JSON.stringify(manifest, null, 2);
    const size = Buffer.from(manifestString, 'utf-8').length;
    const sha256 = crypto.createHash('sha256').update(manifestString).digest('hex');

    let merkleRoot = sha256;
    let numChunksets = 1;
    let expirationMicros = (Date.now() + 365 * 24 * 60 * 60 * 1000) * 1000;
    let encodingIndex = 0;

    const mode = this.configService.get<string>('SHELBY_MODE') || 'mock';
    if (mode === 'live') {
      try {
        const { createDefaultErasureCodingProvider, generateCommitments, defaultErasureCodingConfig, expectedTotalChunksets } = await this.importSdkNode();
        const provider = await createDefaultErasureCodingProvider();
        const commitments = await generateCommitments(provider, Buffer.from(manifestString, 'utf-8'));
        merkleRoot = commitments.blob_merkle_root;

        const config = defaultErasureCodingConfig();
        const chunksetSize = config.chunkSizeBytes * config.erasure_k;
        numChunksets = expectedTotalChunksets(size, chunksetSize);
        encodingIndex = config.enumIndex;
      } catch (err: any) {
        throw new BadRequestException(`Failed to generate commitments: ${err.message}`);
      }
    } else {
      merkleRoot = crypto.createHash('sha256').update(`shelby-merkle:${sha256}`).digest('hex');
    }

    const blobName = this.shelbyClient.buildShelbyBlobName({
      owner: version.dataset.owner.walletAddress,
      slug: version.dataset.slug,
      version: version.version,
      path: 'manifest.json',
    });

    const payload = {
      function: '0x85fdb9a176ab8ef1d9d9c1b60d60b3924f0800ac1de1cc2085fb0b8bb4988e6a::blob_metadata::register_blob',
      type_arguments: [],
      arguments: [
        blobName,
        expirationMicros.toString(),
        merkleRoot.startsWith('0x') ? merkleRoot : `0x${merkleRoot}`,
        numChunksets,
        size.toString(),
        0,
        encodingIndex
      ]
    };

    return {
      blobName,
      merkleRoot,
      size,
      numChunksets,
      expirationMicros,
      payload
    };
  }

  // Helper function to import SDK
  private async importSdkNode() {
    const path = require('path');
    const fs = require('fs');
    const { pathToFileURL } = require('url');
    let current = __dirname;
    let sdkDir = '';
    while (true) {
      const target = path.join(current, 'node_modules', '@shelby-protocol', 'sdk');
      if (fs.existsSync(target)) {
        sdkDir = target;
        break;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        sdkDir = '/app/node_modules/@shelby-protocol/sdk';
        break;
      }
      current = parent;
    }
    const nodeIndexMjs = path.join(sdkDir, 'dist', 'node', 'index.mjs');
    const fileUrl = pathToFileURL(nodeIndexMjs).href;
    const importFn = new Function('url', 'return import(url)');
    return importFn(fileUrl);
  }

  private detectMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.csv': 'text/csv',
      '.json': 'application/json',
      '.txt': 'text/plain',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.parquet': 'application/octet-stream',
      '.zip': 'application/zip',
    };
    return mimeMap[ext] || 'application/octet-stream';
  }
}
