import * as path from 'path';

export interface SchemaField {
  name: string;
  type: string;
}

export interface SchemaDetectionResult {
  format: 'csv' | 'json' | 'text' | 'unknown';
  fields: SchemaField[];
  rowCount?: number;
}

/**
 * Detects the schema of a file (CSV or JSON) based on its name and contents
 */
export function detectSchema(fileName: string, content: string | Buffer): SchemaDetectionResult {
  const ext = path.extname(fileName).toLowerCase();
  const textContent = content.toString('utf8').trim();

  if (ext === '.csv') {
    const lines = textContent.split(/\r?\n/).filter(line => line.length > 0);
    if (lines.length === 0) {
      return { format: 'csv', fields: [] };
    }
    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
    const fields: SchemaField[] = [];

    // Guess type from second line if available
    const nextLine = lines[1];
    const sampleValues = nextLine ? nextLine.split(',') : [];

    headers.forEach((header, index) => {
      const val = sampleValues[index]?.trim() || '';
      let guessedType = 'string';

      if (val) {
        if (!isNaN(Number(val))) {
          guessedType = val.includes('.') ? 'float' : 'integer';
        } else if (val.toLowerCase() === 'true' || val.toLowerCase() === 'false') {
          guessedType = 'boolean';
        } else if (!isNaN(Date.parse(val)) && val.length > 6) {
          guessedType = 'datetime';
        }
      }

      fields.push({ name: header, type: guessedType });
    });

    return {
      format: 'csv',
      fields,
      rowCount: lines.length - 1,
    };
  }

  if (ext === '.json') {
    try {
      const parsed = JSON.parse(textContent);
      const fields: SchemaField[] = [];

      let sampleObj = parsed;
      let rowCount = 1;

      if (Array.isArray(parsed)) {
        sampleObj = parsed[0] || {};
        rowCount = parsed.length;
      }

      if (typeof sampleObj === 'object' && sampleObj !== null) {
        Object.entries(sampleObj).forEach(([key, value]) => {
          let guessedType: string = typeof value;
          if (value === null) {
            guessedType = 'nullable';
          } else if (Array.isArray(value)) {
            guessedType = 'array';
          } else if (value instanceof Date) {
            guessedType = 'datetime';
          } else if (typeof value === 'string' && !isNaN(Date.parse(value)) && value.length > 6) {
            guessedType = 'datetime';
          }
          fields.push({ name: key, type: guessedType });
        });
      }

      return {
        format: 'json',
        fields,
        rowCount,
      };
    } catch {
      return { format: 'json', fields: [] };
    }
  }

  if (ext === '.txt' || ext === '.md') {
    return {
      format: 'text',
      fields: [{ name: 'content', type: 'string' }],
    };
  }

  return { format: 'unknown', fields: [] };
}

/**
 * Generates a short summary of a file's content
 */
export function generateSummary(fileName: string, content: string | Buffer): string {
  const ext = path.extname(fileName).toLowerCase();
  const textContent = content.toString('utf8').trim();

  if (ext === '.md' || ext === '.txt') {
    // Return first 150 characters
    const cleanText = textContent.replace(/[#*`_-]/g, ' ').replace(/\s+/g, ' ');
    if (cleanText.length <= 150) return cleanText;
    return cleanText.substring(0, 150) + '...';
  }

  const schema = detectSchema(fileName, content);
  if (schema.format === 'csv') {
    const fieldsList = schema.fields.map(f => f.name).slice(0, 5).join(', ');
    const more = schema.fields.length > 5 ? ` and ${schema.fields.length - 5} more` : '';
    return `Tabular CSV file containing ${schema.rowCount} rows with columns: ${fieldsList}${more}.`;
  }

  if (schema.format === 'json') {
    const keysList = schema.fields.map(f => f.name).slice(0, 5).join(', ');
    const more = schema.fields.length > 5 ? ` and ${schema.fields.length - 5} more` : '';
    return `JSON data file structuring keys: ${keysList}${more}.`;
  }

  const sizeKb = (content.length / 1024).toFixed(1);
  return `Binary asset file (${sizeKb} KB) with extension ${ext}.`;
}

/**
 * Recommends dataset tags based on the list of file paths in the dataset
 */
export function recommendTags(files: Array<{ path: string; size: number }>): string[] {
  const tagsSet = new Set<string>(['ai-ready', 'verifiable']);

  files.forEach(f => {
    const ext = path.extname(f.path).toLowerCase();
    if (ext === '.csv') {
      tagsSet.add('tabular');
      tagsSet.add('csv');
      tagsSet.add('structured');
    } else if (ext === '.json') {
      tagsSet.add('json');
      tagsSet.add('metadata');
    } else if (ext === '.md') {
      tagsSet.add('documentation');
    } else if (ext === '.txt') {
      tagsSet.add('text-corpus');
    } else if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      tagsSet.add('images');
      tagsSet.add('computer-vision');
    } else if (['.mp4', '.avi', '.mov'].includes(ext)) {
      tagsSet.add('video');
      tagsSet.add('multimedia');
    } else if (['.mp3', '.wav', '.flac'].includes(ext)) {
      tagsSet.add('audio');
      tagsSet.add('speech');
    }
  });

  return Array.from(tagsSet);
}

/**
 * Detects the overall dataset category type
 */
export function detectDatasetType(files: Array<{ path: string }>): string {
  if (files.length === 0) return 'text';

  const extensionCounts: { [key: string]: number } = {};
  files.forEach(f => {
    const ext = path.extname(f.path).toLowerCase();
    extensionCounts[ext] = (extensionCounts[ext] || 0) + 1;
  });

  const hasTabular = (extensionCounts['.csv'] || 0) > 0;
  const hasJson = (extensionCounts['.json'] || 0) > 0;
  const imageCount = (extensionCounts['.png'] || 0) + (extensionCounts['.jpg'] || 0) + (extensionCounts['.jpeg'] || 0);
  const audioCount = (extensionCounts['.mp3'] || 0) + (extensionCounts['.wav'] || 0);
  const textCount = (extensionCounts['.txt'] || 0) + (extensionCounts['.md'] || 0);

  if (imageCount > 0 && hasTabular) return 'multimodal';
  if (imageCount > 0) return 'image';
  if (audioCount > 0) return 'audio';
  if (hasTabular) return 'tabular';
  if (hasJson) return 'json';
  if (textCount > 0) return 'text';

  return 'other';
}

/**
 * Calculates a basic data quality score (0 - 100)
 */
export function calculateQualityScore(
  files: Array<{ path: string; size: number }>,
  readmeExists: boolean
): number {
  let score = 0;

  // 1. README documentation (30 points)
  if (readmeExists) {
    score += 30;
  }

  // 2. Contains files (20 points)
  if (files.length > 0) {
    score += 20;
  }

  // 3. File variety & structured format (20 points)
  const hasTabularOrJson = files.some(f => {
    const ext = path.extname(f.path).toLowerCase();
    return ext === '.csv' || ext === '.json';
  });
  if (hasTabularOrJson) {
    score += 20;
  } else if (files.length > 0) {
    score += 10; // has other files
  }

  // 4. File sizing check (15 points)
  const totalSize = files.reduce((acc, f) => acc + f.size, 0);
  if (totalSize > 1024 * 1024) {
    score += 15; // > 1MB
  } else if (totalSize > 1024 * 10) {
    score += 10; // > 10KB
  } else if (totalSize > 0) {
    score += 5;
  }

  // 5. Structure organization (15 points)
  const hasDirectories = files.some(f => f.path.includes('/'));
  if (hasDirectories) {
    score += 15;
  } else if (files.length > 1) {
    score += 10;
  } else if (files.length === 1) {
    score += 5;
  }

  return Math.min(100, score);
}
export * from './embeddings';
