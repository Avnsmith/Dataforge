import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Database Verification Script ---');
  console.log('Connecting to database...');

  try {
    const userCount = await prisma.user.count();
    const datasetCount = await prisma.dataset.count();
    const versionCount = await prisma.datasetVersion.count();
    const fileCount = await prisma.datasetFile.count();
    const forkCount = await prisma.datasetFork.count();
    const lineageCount = await prisma.datasetLineage.count();
    const searchIndexCount = await prisma.searchIndex.count();

    console.log('\n✅ Database connection: SUCCESS');
    console.log('-----------------------------------');
    console.log(`User row count:           ${userCount}`);
    console.log(`Dataset row count:        ${datasetCount}`);
    console.log(`DatasetVersion row count: ${versionCount}`);
    console.log(`DatasetFile row count:    ${fileCount}`);
    console.log(`DatasetFork row count:    ${forkCount}`);
    console.log(`DatasetLineage row count: ${lineageCount}`);
    console.log(`SearchIndex row count:    ${searchIndexCount}`);
    console.log('-----------------------------------');
  } catch (error) {
    console.error('\n❌ Database connection/query: FAILED');
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
