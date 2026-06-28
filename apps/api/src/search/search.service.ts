import { Injectable } from '@nestjs/common';
import { prisma, Dataset } from '@dataforge/db';
import { embed } from '@dataforge/ai';

@Injectable()
export class SearchService {
  async search(query: string): Promise<any[]> {
    if (!query || query.trim() === '') {
      // Return recent public datasets if query is empty
      const datasets = await prisma.dataset.findMany({
        where: { visibility: 'public' },
        include: { owner: true },
        orderBy: { createdAt: 'desc' },
      });
      return datasets.map(d => ({ dataset: d, relevanceScore: 1 }));
    }

    const cleanQuery = query.trim().toLowerCase();

    // 1. Keyword direct matching (weight = 10 for name, 5 for tags, 3 for description)
    const directDatasets = await prisma.dataset.findMany({
      where: {
        visibility: 'public',
        OR: [
          { name: { contains: cleanQuery, mode: 'insensitive' } },
          { slug: { contains: cleanQuery, mode: 'insensitive' } },
          { description: { contains: cleanQuery, mode: 'insensitive' } },
          { tags: { has: cleanQuery } },
        ],
      },
      include: { owner: true },
    });

    const datasetMap = new Map<string, { dataset: Dataset; keywordScore: number; vectorScore: number; recencyScore: number }>();

    directDatasets.forEach(dataset => {
      let score = 0;
      if (dataset.name.toLowerCase().includes(cleanQuery)) score += 10;
      if (dataset.tags.some(t => t.toLowerCase() === cleanQuery)) score += 5;
      if (dataset.description?.toLowerCase().includes(cleanQuery)) score += 3;
      datasetMap.set(dataset.id, { dataset, keywordScore: score, vectorScore: 0, recencyScore: 0 });
    });

    // 2. Keyword matching on SearchIndex (weight = 5 for manifest, 2 for file-metadata, 1 for readme)
    const indexMatches = await prisma.searchIndex.findMany({
      where: {
        text: { contains: cleanQuery, mode: 'insensitive' },
      },
    });

    if (indexMatches.length > 0) {
      const matchedDatasetIds = indexMatches.map(idx => idx.datasetId);
      const datasetsFromIndex = await prisma.dataset.findMany({
        where: {
          id: { in: matchedDatasetIds },
          visibility: 'public',
        },
        include: { owner: true },
      });

      const datasetsDbMap = new Map(datasetsFromIndex.map(d => [d.id, d]));

      indexMatches.forEach(idx => {
        const dataset = datasetsDbMap.get(idx.datasetId);
        if (!dataset) return;

        let addition = 1;
        if (idx.contentType === 'manifest') addition = 5;
        if (idx.contentType === 'file-metadata') addition = 2;
        if (idx.contentType === 'readme') addition = 1;

        const current = datasetMap.get(idx.datasetId);
        if (current) {
          current.keywordScore += addition;
        } else {
          datasetMap.set(idx.datasetId, { dataset, keywordScore: addition, vectorScore: 0, recencyScore: 0 });
        }
      });
    }

    // 3. Vector Similarity Search via pgvector raw query
    try {
      const queryEmbedding = await embed(cleanQuery);
      const vectorStr = `[${queryEmbedding.vector.join(',')}]`;

      // Use pgvector's <=> cosine distance operator
      const vectorMatches: any[] = await prisma.$queryRawUnsafe(
        `SELECT "datasetId", "contentType", (1 - (embedding <=> $1::vector)) as similarity
         FROM "SearchIndex"
         WHERE embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector ASC
         LIMIT 20`,
        vectorStr
      );

      if (vectorMatches && vectorMatches.length > 0) {
        const matchedDatasetIds = vectorMatches.map(v => v.datasetId);
        const datasetsFromVector = await prisma.dataset.findMany({
          where: {
            id: { in: matchedDatasetIds },
            visibility: 'public',
          },
          include: { owner: true },
        });

        const vectorDatasetMap = new Map(datasetsFromVector.map(d => [d.id, d]));

        vectorMatches.forEach(match => {
          const dataset = vectorDatasetMap.get(match.datasetId);
          if (!dataset) return;

          // Scale similarity score: similarity is typically in [-1, 1], so we map it to positive values
          // If the similarity is high, we add a substantial vector bonus (up to 15 points)
          const similarity = match.similarity || 0;
          let weight = 5; // default base weight
          if (match.contentType === 'manifest') weight = 15;
          if (match.contentType === 'readme') weight = 10;

          const matchScore = Math.max(0, similarity * weight);

          const current = datasetMap.get(match.datasetId);
          if (current) {
            current.vectorScore = Math.max(current.vectorScore, matchScore);
          } else {
            datasetMap.set(match.datasetId, { dataset, keywordScore: 0, vectorScore: matchScore, recencyScore: 0 });
          }
        });
      }
    } catch (e) {
      // Graceful fallback if database does not support pgvector or embedding is null
    }

    // 4. Calculate Recency Score and Combine Total Score
    const results = Array.from(datasetMap.values()).map(({ dataset, keywordScore, vectorScore }) => {
      // Recency bonus: up to 3 points for newly created datasets (within last 30 days)
      const ageInDays = (Date.now() - dataset.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      const recencyScore = Math.max(0, 3 - ageInDays / 10);

      const totalScore = Math.round((keywordScore + vectorScore + recencyScore) * 10) / 10;

      return {
        dataset,
        relevanceScore: totalScore,
      };
    });

    // 5. Sort by relevanceScore descending
    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }
}
