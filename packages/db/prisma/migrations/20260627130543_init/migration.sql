-- Enable vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "username" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dataset" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "readme" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "license" TEXT,
    "type" TEXT NOT NULL,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetVersion" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "changelog" TEXT,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "totalSize" BIGINT,
    "fileCount" INTEGER,
    "manifestHash" TEXT,
    "manifestShelbyBlobName" TEXT,
    "manifestShelbyMerkleRoot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatasetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetFile" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "shelbyBlobName" TEXT NOT NULL,
    "shelbyAccount" TEXT,
    "shelbyMerkleRoot" TEXT,
    "explorerUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatasetFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetFork" (
    "id" TEXT NOT NULL,
    "sourceDatasetId" TEXT NOT NULL,
    "targetDatasetId" TEXT NOT NULL,
    "sourceVersionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatasetFork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetLineage" (
    "id" TEXT NOT NULL,
    "childVersionId" TEXT NOT NULL,
    "parentVersionId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatasetLineage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchIndex" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "versionId" TEXT,
    "contentType" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" vector,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchIndex_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Dataset_ownerId_slug_key" ON "Dataset"("ownerId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetVersion_datasetId_version_key" ON "DatasetVersion"("datasetId", "version");

-- AddForeignKey
ALTER TABLE "Dataset" ADD CONSTRAINT "Dataset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetVersion" ADD CONSTRAINT "DatasetVersion_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetFile" ADD CONSTRAINT "DatasetFile_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
