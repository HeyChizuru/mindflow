import { readFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/db/client";
import { deleteChunksByStageId, insertChunks } from "@/lib/db/queries/chunks";
import { getDocumentByStageId, updateDocumentParse } from "@/lib/db/queries/documents";
import { getStageById, setStageHasKnowledgeBase } from "@/lib/db/queries/stages";
import type { EmbeddingModel } from "ai";
import { IngestSupersededError, KnowledgeNotFoundError, KnowledgeValidationError } from "@/lib/services/knowledge-errors";
export { KnowledgeNotFoundError, KnowledgeValidationError } from "@/lib/services/knowledge-errors";

import { splitPagesToChunks } from "@/lib/knowledge/chunk";
import { EmbeddingDimensionError, embedTexts } from "@/lib/knowledge/embed";
import { parsePdf } from "@/lib/knowledge/parse";
import type { IngestResponse } from "@/lib/types/knowledge";
import {
  ingestResponseSchema,
  stageIdSchema,
} from "@/lib/validators/knowledge";

/** 解析正文去空白后最少字数，扫描件等低于此值视为无法 ingest */
const MIN_PARSE_CHARS = 200;

/**
 * 读取已保存的 PDF，解析、按页切块并写入向量，然后打开 hasKnowledgeBase。
 * 向量化完成前不写库。页数、全文、切块替换与开关在同一事务提交；失败则整单回滚。
 * embeddingModel 由 Route 注入，本函数不读请求头，不调用对话模型。
 */
export async function ingestStage(
  stageId: string,
  options: { embeddingModel: EmbeddingModel; executionId: string },
): Promise<IngestResponse> {
  const parsedId = stageIdSchema.safeParse(stageId);
  if (!parsedId.success) {
    throw new KnowledgeValidationError("stageId must be a uuid");
  }

  const id = parsedId.data;
  const stage = await getStageById(id);
  if (!stage) {
    throw new KnowledgeNotFoundError("stage not found");
  }

  const document = await getDocumentByStageId(id);
  if (!document) {
    throw new KnowledgeValidationError("no document for this stage");
  }

  const filePath = resolveUploadPath(document.storagePath, id);
  let buffer: Buffer;
  try {
    buffer = await readFile(filePath);
  } catch (error) {
    if (isNodeError(error) && (error.code === "ENOENT" || error.code === "EISDIR")) {
      throw new KnowledgeValidationError("pdf file is missing");
    }
    throw error;
  }

  const pages = await parsePdf(new Uint8Array(buffer));
  const rawText = pages.map((page) => page.text).join("\n\n");
  const charCount = rawText.replace(/\s/g, "").length;

  if (charCount < MIN_PARSE_CHARS) {
    throw new KnowledgeValidationError(
      "parsed text must be at least 200 characters",
    );
  }

  const chunks = splitPagesToChunks(pages);
  if (chunks.length === 0) {
    throw new KnowledgeValidationError("no chunks produced from parsed text");
  }

  const embeddings = await embedVectors(
    chunks.map((chunk) => chunk.content),
    options.embeddingModel,
  );
  if (embeddings.length !== chunks.length) {
    throw new Error("embedding count does not match chunk count");
  }

  await prisma.$transaction(async (tx) => {
    const execution = await tx.$queryRaw<{ executionId: string }[]>`
      SELECT execution_id::text AS "executionId" FROM ingest_execution
      WHERE stage_id = ${id}::uuid AND execution_id = ${options.executionId}::uuid
        AND status = 'processing' AND expires_at > now() FOR UPDATE`;
    if (!execution.length) throw new IngestSupersededError('ingest execution expired or superseded');
    await updateDocumentParse(
      {
        id: document.id,
        pageCount: pages.length,
        rawText,
      },
      tx,
    );
    await deleteChunksByStageId(id, tx);
    await insertChunks(
      chunks.map((chunk, index) => ({
        stageId: id,
        documentId: document.id,
        content: chunk.content,
        page: chunk.page,
        chunkIndex: chunk.chunkIndex,
        embedding: embeddings[index],
      })),
      tx,
    );
    await setStageHasKnowledgeBase(id, true, tx);
    await tx.$executeRaw`UPDATE ingest_execution SET status = 'completed', failure_code = NULL, updated_at = now()
      WHERE stage_id = ${id}::uuid AND execution_id = ${options.executionId}::uuid`;
  });

  return ingestResponseSchema.parse({
    stageId: id,
    documentId: document.id,
    pageCount: pages.length,
    charCount,
    chunkCount: chunks.length,
    hasKnowledgeBase: true,
  });
}

/**
 * 调用向量模型。维度不符或含非有限数字时抛 KnowledgeValidationError，不写库。
 */
async function embedVectors(
  texts: string[],
  model: EmbeddingModel,
): Promise<number[][]> {
  try {
    const embeddings = await embedTexts(texts, model);
    for (const embedding of embeddings) {
      if (embedding.some((value) => !Number.isFinite(value))) {
        throw new KnowledgeValidationError("embedding contains non-finite numbers");
      }
    }
    return embeddings;
  } catch (error) {
    if (error instanceof EmbeddingDimensionError) {
      throw new KnowledgeValidationError(error.message);
    }
    throw error;
  }
}

/** 把 documents.storage_path 解析到 UPLOAD_DIR 内的绝对路径，拒绝逃逸 */
function resolveUploadPath(storagePath: string, stageId: string): string {
  const uploadRoot = path.resolve(process.env.UPLOAD_DIR ?? "./uploads", stageId);
  const resolved = path.resolve(process.env.UPLOAD_DIR ?? "./uploads", storagePath);
  const relative = path.relative(uploadRoot, resolved);

  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new KnowledgeValidationError("invalid storage path");
  }

  return resolved;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
