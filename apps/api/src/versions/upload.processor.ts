import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { prisma } from '@dataforge/db';
import { ShelbyClient } from '@dataforge/shelby';
import { detectSchema, generateSummary, recommendTags, detectDatasetType, calculateQualityScore, embed } from '@dataforge/ai';
import { DatasetManifest, ManifestFileItem, ManifestLineageItem } from '@dataforge/shared';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

@Processor('upload-queue')
export class UploadProcessor extends WorkerHost {
  private readonly logger = new Logger(UploadProcessor.name);
  private shelbyClient: ShelbyClient;
  private tempUploadPath: string;

  constructor(private readonly configService: ConfigService) {
    super();
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
  }

  async process(job: Job<{ versionId: string; datasetId: string }>): Promise<any> {
    const { versionId } = job.data;
    const jobId = job.id;
    const attempt = job.attemptsMade + 1;
    this.logger.log(`[JOB ${jobId}] START publish | versionId=${versionId} | attempt=${attempt}`);

    try {
      // 1. Fetch version and files details
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
        throw new Error(`Version not found: ${versionId}`);
      }

      const versionTempDir = path.join(this.tempUploadPath, versionId);
      if (!fs.existsSync(versionTempDir)) {
        throw new Error(`Temporary upload folder not found for version: ${versionId}`);
      }

      const manifestFiles: ManifestFileItem[] = [];
      let totalSize = BigInt(0);

      // 2. Upload files to Shelby with strict presence and hash integrity checks
      for (const file of version.files) {
        const fileFullPath = path.join(versionTempDir, file.path);
        if (!fs.existsSync(fileFullPath)) {
          throw new Error(`Integrity check failed: File '${file.path}' is missing on disk.`);
        }

        const fileContent = fs.readFileSync(fileFullPath);
        
        // Verify SHA-256 hash integrity
        const actualHash = crypto.createHash('sha256').update(fileContent).digest('hex');
        if (actualHash !== file.sha256) {
          throw new Error(`Integrity check failed: SHA-256 hash mismatch for '${file.path}'. Expected ${file.sha256}, got ${actualHash}`);
        }

        const mimeType = this.detectMimeType(file.path);

        this.logger.log(`Uploading ${file.path} to Shelby...`);
        // Upload to Shelby client
        const result = await this.shelbyClient.uploadDatasetFile({
          owner: version.dataset.owner.walletAddress,
          slug: version.dataset.slug,
          version: version.version,
          path: file.path,
          fileContent,
        });

        // Update file record in DB
        await prisma.datasetFile.update({
          where: { id: file.id },
          data: {
            mimeType,
            shelbyMerkleRoot: result.merkleRoot,
            shelbyAccount: result.account,
            explorerUrl: result.explorerUrl,
          },
        });

        manifestFiles.push({
          path: file.path,
          sha256: file.sha256,
          size: fileContent.length,
          mimeType: mimeType || 'application/octet-stream',
          shelbyBlobName: result.blobName,
          shelbyMerkleRoot: result.merkleRoot || '',
        });

        totalSize += BigInt(fileContent.length);

        // --- AI Metadata Processing & Search Indexing ---
        this.logger.log(`Running AI metadata extraction on ${file.path}...`);
        const summary = generateSummary(file.path, fileContent);
        const schemaResult = detectSchema(file.path, fileContent);

        // Index file contents/metadata for search
        await this.createSearchIndex(
          prisma,
          version.datasetId,
          version.id,
          'file-metadata',
          `file: ${file.path}\nsummary: ${summary}\nschema: ${JSON.stringify(schemaResult.fields)}`
        );
      }

      // 3. Resolve Lineage metadata
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

      const manifestLineage: ManifestLineageItem[] = lineageRecords.map((lin: any) => ({
        relationType: lin.relationType,
        parentDataset: `${lin.parentVersion.dataset.owner.username || lin.parentVersion.dataset.owner.walletAddress}/${lin.parentVersion.dataset.slug}`,
        parentVersion: lin.parentVersion.version,
      }));

      // 4. Generate manifest.json
      const manifest: DatasetManifest = {
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

      // Calculate manifest hash
      const manifestHash = crypto.createHash('sha256').update(manifestString).digest('hex');

      // Upload manifest to Shelby
      this.logger.log(`Uploading manifest.json to Shelby...`);
      const manifestResult = await this.shelbyClient.uploadManifest({
        owner: version.dataset.owner.walletAddress,
        slug: version.dataset.slug,
        version: version.version,
        manifestContent: manifestString,
      });

      // Index manifest, readme, and update version/dataset status atomically in a transaction
      await prisma.$transaction(async (tx) => {
        // Index manifest for search
        await this.createSearchIndex(
          tx,
          version.datasetId,
          version.id,
          'manifest',
          `manifest: ${version.dataset.name} v${version.version}\ndescription: ${version.dataset.description}\ntags: ${manifest.tags.join(', ')}\ntype: ${manifest.type}\nfiles: ${version.files.map(f => f.path).join(', ')}`
        );

        // 5. Generate README.md if missing, and index dataset readme for search
        let readme = version.dataset.readme;
        if (!readme || readme.trim() === '') {
          this.logger.log(`Readme is missing, generating automated README.md...`);
          let schemaString = '';
          version.files.forEach(f => {
            schemaString += `- **${f.path}** (${Number(f.size)} bytes)\n  SHA-256: \`${f.sha256}\`\n  Merkle Root: \`${f.shelbyMerkleRoot || ''}\`\n`;
          });

          readme = `# ${version.dataset.name}

## About
This dataset was uploaded and versioned using DataForge AI. It is stored on Shelby decentralized hot object storage.

## Files & Struct
${schemaString}

## Usage & API Integration
To download files programmatically from the Shelby storage layer, execute:
\`\`\`bash
curl -H "Authorization: Bearer <your_jwt_token>" \\
     "http://localhost:4000/api/files/<file_id>/download"
\`\`\`

## License
Licensed under ${version.dataset.license || 'proprietary'} rules.

## Citation
\`\`\`bibtex
@misc{dataforge_${version.dataset.slug}_v${version.version},
  title = {${version.dataset.name}},
  year = {${new Date().getFullYear()}},
  version = {${version.version}},
  publisher = {DataForge AI},
  howpublished = {\\url{http://localhost:3000/${version.dataset.owner.username || 'user'}/${version.dataset.slug}}}
}
\`\`\`
`;
          // Save generated readme to the dataset
          await tx.dataset.update({
            where: { id: version.datasetId },
            data: { readme },
          });
        }

        await this.createSearchIndex(
          tx,
          version.datasetId,
          version.id,
          'readme',
          `readme: ${readme}`
        );

        // 6. Update DatasetVersion status to ready
        await tx.datasetVersion.update({
          where: { id: versionId },
          data: {
            status: 'ready',
            totalSize,
            fileCount: version.files.length,
            manifestHash,
            manifestShelbyBlobName: manifestResult.blobName,
            manifestShelbyMerkleRoot: manifestResult.merkleRoot,
          },
        });

        // 7. Update Dataset category/tags and readme if they are empty
        const detectedTags = recommendTags(version.files.map(f => ({ path: f.path, size: Number(f.size) })));
        const combinedTags = Array.from(new Set([...version.dataset.tags, ...detectedTags]));
        const detectedType = detectDatasetType(version.files);

        await tx.dataset.update({
          where: { id: version.datasetId },
          data: {
            tags: combinedTags,
            type: detectedType,
          },
        });
      });

      // 8. Delete local temp folder
      this.logger.log(`Cleaning up local temp folder: ${versionTempDir}`);
      this.deleteFolderRecursive(versionTempDir);

      this.logger.log(`[JOB ${jobId}] COMPLETE publish | versionId=${versionId} | attempt=${attempt}`);
    } catch (error: any) {
      const attemptsMade = job.attemptsMade;
      const maxAttempts = job.opts.attempts || 1;
      const isFinalAttempt = attemptsMade + 1 >= maxAttempts;
      Sentry.captureException(error);
      this.logger.error(
        `[JOB ${jobId}] FAILED publish | versionId=${versionId} | attempt=${attempt}/${maxAttempts} | final=${isFinalAttempt} | reason=${error.message}`,
        error.stack
      );

      if (isFinalAttempt) {
        // Update status to failed on final attempt exhaustion
        await prisma.datasetVersion.update({
          where: { id: versionId },
          data: { status: 'failed' },
        }).catch(err => this.logger.error(`Could not set status to failed: ${err.message}`));
      }

      throw error;
    }
  }

  private detectMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      '.csv': 'text/csv',
      '.json': 'application/json',
      '.md': 'text/markdown',
      '.txt': 'text/plain',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  private async createSearchIndex(
    tx: any,
    datasetId: string,
    versionId: string,
    contentType: string,
    text: string
  ) {
    const record = await tx.searchIndex.create({
      data: {
        datasetId,
        versionId,
        contentType,
        text,
      },
    });

    try {
      const embeddingResult = await embed(text);
      const vectorStr = `[${embeddingResult.vector.join(',')}]`;
      // Use executeRawUnsafe since $executeRaw parameter binding doesn't always cast arrays directly to vector types in pgvector.
      await tx.$executeRawUnsafe(
        `UPDATE "SearchIndex" SET embedding = $1::vector WHERE id = $2`,
        vectorStr,
        record.id
      );
    } catch (e: any) {
      this.logger.warn(`Failed to generate or store embedding for searchIndex ${record.id}: ${e.message}`);
    }

    return record;
  }

  private deleteFolderRecursive(directoryPath: string) {
    if (fs.existsSync(directoryPath)) {
      fs.readdirSync(directoryPath).forEach((file) => {
        const curPath = path.join(directoryPath, file);
        if (fs.lstatSync(curPath).isDirectory()) {
          this.deleteFolderRecursive(curPath);
        } else {
          fs.unlinkSync(curPath);
        }
      });
      fs.rmdirSync(directoryPath);
    }
  }
}

