-- CreateTable
CREATE TABLE "SearchEmbedding" (
    "id" TEXT NOT NULL,
    "searchIndexId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "vector" vector NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthNonce" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AuthNonce_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SearchEmbedding_searchIndexId_key" ON "SearchEmbedding"("searchIndexId");

-- CreateIndex
CREATE INDEX "SearchEmbedding_searchIndexId_idx" ON "SearchEmbedding"("searchIndexId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthNonce_nonce_key" ON "AuthNonce"("nonce");

-- CreateIndex
CREATE INDEX "AuthNonce_walletAddress_idx" ON "AuthNonce"("walletAddress");

-- CreateIndex
CREATE INDEX "AuthNonce_nonce_idx" ON "AuthNonce"("nonce");

-- AddForeignKey
ALTER TABLE "SearchEmbedding" ADD CONSTRAINT "SearchEmbedding_searchIndexId_fkey" FOREIGN KEY ("searchIndexId") REFERENCES "SearchIndex"("id") ON DELETE CASCADE ON UPDATE CASCADE;
