import { detectSchema, recommendTags, calculateQualityScore, detectDatasetType, generateSummary } from '@dataforge/ai';

describe('Rule-Based AI Metadata Parser', () => {
  it('should detect CSV headers and infer correct data types', () => {
    const csvContent = Buffer.from("id,name,age,active\n1,alice,30,true\n2,bob,25,false");
    const result = detectSchema('users.csv', csvContent);
    expect(result.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'id', type: 'integer' }),
      expect.objectContaining({ name: 'name', type: 'string' }),
      expect.objectContaining({ name: 'age', type: 'integer' }),
      expect.objectContaining({ name: 'active', type: 'boolean' }),
    ]));
  });

  it('should extract top-level keys and types from JSON payloads', () => {
    const jsonContent = Buffer.from(JSON.stringify({ id: 42, label: 'test-item', values: [1, 2, 3] }));
    const result = detectSchema('data.json', jsonContent);
    expect(result.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'id', type: 'number' }),
      expect.objectContaining({ name: 'label', type: 'string' }),
      expect.objectContaining({ name: 'values', type: 'array' }),
    ]));
  });

  it('should recommend relevant tags based on file extensions and naming patterns', () => {
    const tagsNlp = recommendTags([{ path: 'imdb_movie_reviews.csv', size: 1000 }]);
    expect(tagsNlp).toContain('csv');

    const tagsVision = recommendTags([{ path: 'cifar10_train.png', size: 2000 }]);
    expect(tagsVision).toContain('images');
  });

  it('should calculate data quality score with documentation weights', () => {
    const files = [{ path: 'tabular.csv', size: 1024 }];
    const scoreWithDoc = calculateQualityScore(files, true);
    const scoreWithoutDoc = calculateQualityScore(files, false);
    
    expect(scoreWithDoc).toBeGreaterThan(scoreWithoutDoc);
    expect(scoreWithDoc).toBe(80);
  });
});
