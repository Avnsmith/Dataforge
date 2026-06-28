import { prisma } from '../src/client';

async function main() {
  try {
    const users = await prisma.user.count();
    const datasets = await prisma.dataset.count();
    const versions = await prisma.datasetVersion.count();
    const files = await prisma.datasetFile.count();
    const forks = await prisma.datasetFork.count();
    const lineage = await prisma.datasetLineage.count();
    const searchIndex = await prisma.searchIndex.count();

    console.log(JSON.stringify({
      users,
      datasets,
      versions,
      files,
      forks,
      lineage,
      searchIndex,
    }, null, 2));
  } catch (e: any) {
    console.error('Database connection or query failed:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
