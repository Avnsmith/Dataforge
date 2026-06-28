import { PrismaClient } from '@prisma/client';
import { ShelbyClient } from '@dataforge/shelby';
import { detectSchema, generateSummary, recommendTags, detectDatasetType } from '@dataforge/ai';
import { DatasetManifest } from '@dataforge/shared';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// Configuration matching .env defaults
const shelbyClient = new ShelbyClient({
  mode: 'mock',
  network: 'shelbynet',
  account: '0x0000000000000000000000000000000000000000000000000000000000000001',
  privateKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
  rpcUrl: 'https://rpc.shelby.xyz',
  explorerBaseUrl: 'https://explorer.shelby.xyz/shelbynet',
});

async function main() {
  console.log('🌱 Starting DataForge AI database seed...');

  // 1. Clean existing records
  await prisma.searchIndex.deleteMany({});
  await prisma.datasetLineage.deleteMany({});
  await prisma.datasetFork.deleteMany({});
  await prisma.datasetFile.deleteMany({});
  await prisma.datasetVersion.deleteMany({});
  await prisma.dataset.deleteMany({});
  await prisma.user.deleteMany({});

  // 2. Create Users
  const walletAddress1 = '0x89abcdef0123456789abcdef0123456789abcdef0123456789abcdef01234567';
  const walletAddress2 = '0x123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0';

  console.log('Creating demo users...');
  const user1 = await prisma.user.create({
    data: {
      walletAddress: walletAddress1.toLowerCase(),
      username: 'researcher_bob',
      avatarUrl: `https://api.dicebear.com/7.x/identicon/svg?seed=${walletAddress1}`,
    },
  });

  const user2 = await prisma.user.create({
    data: {
      walletAddress: walletAddress2.toLowerCase(),
      username: 'analyst_alice',
      avatarUrl: `https://api.dicebear.com/7.x/identicon/svg?seed=${walletAddress2}`,
    },
  });

  // 3. Create Dataset Repository
  console.log('Creating demo dataset: crypto-x-research-dataset...');
  const readmeContent = `# Crypto X Research Dataset

A cryptographically verifiable research dataset containing sentiment labels, text logs, and key exports regarding crypto/X social media activity.

## Structure
- \`train.csv\`: Labeled tabular exports
- \`metadata.json\`: Schema details
- \`readme.md\`: Documentation

Verified on Shelby decentralized storage nodes.`;

  const dataset1 = await prisma.dataset.create({
    data: {
      ownerId: user1.id,
      name: 'crypto-x-research-dataset',
      slug: 'crypto-x-research-dataset',
      description: 'A verifiable research dataset for crypto/X ecosystem analysis containing labeled tweet exports.',
      readme: readmeContent,
      visibility: 'public',
      license: 'CC-BY-4.0',
      type: 'tabular',
      tags: ['crypto', 'sentiment', 'social-media'],
    },
  });

  // 4. Create version v1.0.0
  const version1 = await prisma.datasetVersion.create({
    data: {
      datasetId: dataset1.id,
      version: '1.0.0',
      changelog: 'Initial dataset release containing train split.',
      status: 'processing',
    },
  });

  // 5. Seed Files and Upload to Shelby Mock
  const filesToSeed = [
    {
      path: 'train.csv',
      content: `tweet_id,author_id,tweet_text,label
18026190823,0x391c,Bitcoin is going to the moon today! #crypto,positive
18026190824,0x8bfa,Avoid trading this token. Massive rugpull risk!,negative
18026190825,0x09a1,Ethereum gas fees are down to historical lows.,neutral`,
    },
    {
      path: 'metadata.json',
      content: JSON.stringify({
        source: 'Twitter API v2',
        period: '2026-Q2',
        annotators: 3,
        format: 'CSV utf-8',
      }, null, 2),
    },
    {
      path: 'readme.md',
      content: readmeContent,
    },
  ];

  let totalSize = BigInt(0);
  const manifestFilesList: any[] = [];

  console.log('Uploading files to Shelby mock storage...');
  for (const f of filesToSeed) {
    const fileBuffer = Buffer.from(f.content, 'utf-8');
    const size = fileBuffer.length;
    const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Call Shelby Client
    const result = await shelbyClient.uploadDatasetFile({
      owner: user1.walletAddress,
      slug: dataset1.slug,
      version: version1.version,
      path: f.path,
      fileContent: fileBuffer,
    });

    // Save File in DB
    const dbFile = await prisma.datasetFile.create({
      data: {
        versionId: version1.id,
        path: f.path,
        mimeType: f.path.endsWith('.csv') ? 'text/csv' : f.path.endsWith('.json') ? 'application/json' : 'text/markdown',
        size: BigInt(size),
        sha256,
        shelbyBlobName: result.blobName,
        shelbyAccount: result.account,
        shelbyMerkleRoot: result.merkleRoot,
        explorerUrl: result.explorerUrl,
      },
    });

    manifestFilesList.push({
      path: f.path,
      sha256,
      size,
      mimeType: dbFile.mimeType || 'application/octet-stream',
      shelbyBlobName: result.blobName,
      shelbyMerkleRoot: result.merkleRoot || '',
    });

    totalSize += BigInt(size);

    // AI summary extraction and search indexing
    const fileSummary = generateSummary(f.path, fileBuffer);
    const fileSchema = detectSchema(f.path, fileBuffer);

    await prisma.searchIndex.create({
      data: {
        datasetId: dataset1.id,
        versionId: version1.id,
        contentType: 'file-metadata',
        text: `file: ${f.path}\nsummary: ${fileSummary}\nschema: ${JSON.stringify(fileSchema.fields)}`,
      },
    });
  }

  // 6. Generate Manifest
  console.log('Compiling manifest.json and uploading to Shelby...');
  const manifest: DatasetManifest = {
    schemaVersion: '1.0',
    name: dataset1.name,
    version: version1.version,
    owner: user1.username!,
    license: dataset1.license!,
    type: 'tabular',
    tags: dataset1.tags,
    createdAt: version1.createdAt.toISOString(),
    files: manifestFilesList,
    lineage: [],
  };

  const manifestStr = JSON.stringify(manifest, null, 2);
  const manifestHash = crypto.createHash('sha256').update(manifestStr).digest('hex');

  const manifestResult = await shelbyClient.uploadManifest({
    owner: user1.walletAddress,
    slug: dataset1.slug,
    version: version1.version,
    manifestContent: manifestStr,
  });

  // Update Version details
  await prisma.datasetVersion.update({
    where: { id: version1.id },
    data: {
      status: 'ready',
      totalSize,
      fileCount: filesToSeed.length,
      manifestHash,
      manifestShelbyBlobName: manifestResult.blobName,
      manifestShelbyMerkleRoot: manifestResult.merkleRoot,
    },
  });

  // Index Manifest
  await prisma.searchIndex.create({
    data: {
      datasetId: dataset1.id,
      versionId: version1.id,
      contentType: 'manifest',
      text: `manifest: ${dataset1.name} v${version1.version}\ndescription: ${dataset1.description}\ntags: ${dataset1.tags.join(', ')}\nfiles: ${filesToSeed.map(f => f.path).join(', ')}`,
    },
  });

  // Index Readme
  await prisma.searchIndex.create({
    data: {
      datasetId: dataset1.id,
      versionId: version1.id,
      contentType: 'readme',
      text: `readme: ${readmeContent}`,
    },
  });

  // 7. Simulate FORK by Analyst Alice
  console.log('Simulating fork action by analyst_alice...');
  const dataset2 = await prisma.dataset.create({
    data: {
      ownerId: user2.id,
      name: 'crypto-sentiment-fork',
      slug: 'crypto-sentiment-fork',
      description: 'Forked crypto research dataset for active model training and preprocessing.',
      readme: `# Forked crypto-x-research-dataset\n\n${readmeContent}`,
      visibility: 'public',
      license: dataset1.license,
      type: dataset1.type,
      tags: [...dataset1.tags, 'forked'],
    },
  });

  const version2 = await prisma.datasetVersion.create({
    data: {
      datasetId: dataset2.id,
      version: '1.0.0',
      changelog: 'Forked release from researcher_bob (v1.0.0)',
      status: 'ready',
      totalSize,
      fileCount: filesToSeed.length,
      manifestHash,
      manifestShelbyBlobName: manifestResult.blobName,
      manifestShelbyMerkleRoot: manifestResult.merkleRoot,
    },
  });

  // Clone files to Alice's version
  for (const manifestFile of manifestFilesList) {
    await prisma.datasetFile.create({
      data: {
        versionId: version2.id,
        path: manifestFile.path,
        mimeType: manifestFile.mimeType,
        size: BigInt(manifestFile.size),
        sha256: manifestFile.sha256,
        shelbyBlobName: manifestFile.shelbyBlobName,
        shelbyMerkleRoot: manifestFile.shelbyMerkleRoot,
        explorerUrl: shelbyClient.buildExplorerUrl(manifestFile.shelbyBlobName),
      },
    });
  }

  // Create Lineage / Fork Links
  await prisma.datasetFork.create({
    data: {
      sourceDatasetId: dataset1.id,
      targetDatasetId: dataset2.id,
      sourceVersionId: version1.id,
    },
  });

  await prisma.datasetLineage.create({
    data: {
      childVersionId: version2.id,
      parentVersionId: version1.id,
      relationType: 'forked_from',
      note: 'Forked by analyst_alice for sentiment classification research.',
    },
  });

  console.log('✅ Seed completed successfully!');
  console.log('Demo addresses:');
  console.log(`Researcher Bob (User 1): ${walletAddress1}`);
  console.log(`Analyst Alice  (User 2): ${walletAddress2}`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
