-- CreateIndex
CREATE INDEX "Dataset_ownerId_idx" ON "Dataset"("ownerId");

-- CreateIndex
CREATE INDEX "Dataset_slug_idx" ON "Dataset"("slug");

-- CreateIndex
CREATE INDEX "Dataset_visibility_idx" ON "Dataset"("visibility");

-- CreateIndex
CREATE INDEX "DatasetFile_versionId_idx" ON "DatasetFile"("versionId");

-- CreateIndex
CREATE INDEX "DatasetVersion_datasetId_idx" ON "DatasetVersion"("datasetId");

-- CreateIndex
CREATE INDEX "SearchIndex_datasetId_idx" ON "SearchIndex"("datasetId");

-- CreateIndex
CREATE INDEX "SearchIndex_contentType_idx" ON "SearchIndex"("contentType");
