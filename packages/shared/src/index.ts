// Shared types and interfaces for DataForge AI

export interface User {
  id: string;
  walletAddress: string;
  username?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Dataset {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  description?: string | null;
  readme?: string | null;
  visibility: string; // "public" | "private"
  license?: string | null;
  type: string; // "text" | "csv" | "json" | "markdown" | "image" | "audio" | "video" | "multimodal"
  tags: string[];
  createdAt: string;
  updatedAt: string;
  owner?: User;
  versions?: DatasetVersion[];
  forksCount?: number;
  starsCount?: number;
}

export interface DatasetVersion {
  id: string;
  datasetId: string;
  version: string;
  changelog?: string | null;
  status: 'draft' | 'uploading' | 'processing' | 'ready' | 'failed';
  totalSize?: string | null; // BigInt represented as string for JSON serialization
  fileCount?: number | null;
  manifestHash?: string | null;
  manifestShelbyBlobName?: string | null;
  manifestShelbyMerkleRoot?: string | null;
  createdAt: string;
  files?: DatasetFile[];
}

export interface DatasetFile {
  id: string;
  versionId: string;
  path: string;
  mimeType?: string | null;
  size: string; // BigInt represented as string
  sha256: string;
  shelbyBlobName: string;
  shelbyAccount?: string | null;
  shelbyMerkleRoot?: string | null;
  explorerUrl?: string | null;
  createdAt: string;
}

export interface DatasetFork {
  id: string;
  sourceDatasetId: string;
  targetDatasetId: string;
  sourceVersionId: string;
  createdAt: string;
}

export interface DatasetLineage {
  id: string;
  childVersionId: string;
  parentVersionId: string;
  relationType: string; // "derived_from" | "forked_from" | "subset_of" | "merged_from"
  note?: string | null;
  createdAt: string;
}

// Manifest Format for datasets uploaded to Shelby
export interface ManifestFileItem {
  path: string;
  sha256: string;
  size: number;
  mimeType: string;
  shelbyBlobName: string;
  shelbyMerkleRoot: string;
}

export interface ManifestLineageItem {
  relationType: string;
  parentDataset: string; // owner/slug
  parentVersion: string;
}

export interface DatasetManifest {
  schemaVersion: string; // "1.0"
  name: string;
  version: string;
  owner: string; // wallet address or username
  license: string;
  type: string;
  tags: string[];
  createdAt: string;
  files: ManifestFileItem[];
  lineage: ManifestLineageItem[];
}

// API DTOs
export interface WalletAuthDto {
  walletAddress: string;
  signature: string;
  message: string;
}

export interface CreateDatasetDto {
  name: string;
  description?: string;
  visibility?: 'public' | 'private';
  license?: string;
  type: string;
  tags?: string[];
  readme?: string;
}

export interface CreateVersionDto {
  version: string; // e.g. "1.0.0"
  changelog?: string;
}

export interface SearchIndexDto {
  id: string;
  datasetId: string;
  versionId?: string | null;
  contentType: string;
  text: string;
  createdAt: string;
}

export interface SearchResult {
  dataset: Dataset;
  relevanceScore: number;
  highlightText?: string;
}
