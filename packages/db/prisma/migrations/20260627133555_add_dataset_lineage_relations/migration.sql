-- CreateIndex
CREATE INDEX "DatasetLineage_childVersionId_idx" ON "DatasetLineage"("childVersionId");

-- CreateIndex
CREATE INDEX "DatasetLineage_parentVersionId_idx" ON "DatasetLineage"("parentVersionId");

-- AddForeignKey
ALTER TABLE "DatasetLineage" ADD CONSTRAINT "DatasetLineage_childVersionId_fkey" FOREIGN KEY ("childVersionId") REFERENCES "DatasetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetLineage" ADD CONSTRAINT "DatasetLineage_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "DatasetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
