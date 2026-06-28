export type ShelbyUploadResult = {
  blobName: string;
  account?: string;
  merkleRoot?: string;
  size: number;
  explorerUrl?: string;
};

export interface ShelbyConfig {
  mode: 'mock' | 'live';
  network: string;
  account: string;
  privateKey: string;
  rpcUrl: string;
  explorerBaseUrl: string;
  storageDir?: string; // used in mock mode
  apiKey?: string;     // optional API key
}

export interface ShelbyBlobMetadata {
  blobName: string;
  size: number;
  sha256: string;
  merkleRoot: string;
  uploadedAt: Date;
  owner: string;
}

export interface ShelbyVerificationResult {
  valid: boolean;
  sha256Matched: boolean;
  merkleRootMatched: boolean;
  fileSizeMatched: boolean;
  message?: string;
}

