-- CreateExtension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "page_count" INTEGER,
    "raw_text" TEXT,
    "storage_path" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chunks" (
    "id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "page" INTEGER,
    "chunk_index" INTEGER NOT NULL,
    "metadata" JSONB,
    "embedding" vector(1536),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documents_stage_id_idx" ON "documents"("stage_id");

-- CreateIndex
CREATE INDEX "chunks_stage_id_idx" ON "chunks"("stage_id");

-- CreateIndex
CREATE INDEX "chunks_document_id_idx" ON "chunks"("document_id");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
