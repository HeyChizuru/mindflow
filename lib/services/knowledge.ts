import { readFile } from "node:fs/promises";
import path from "node:path";

import { deleteChunksByStageId, insertChunks } from "@/lib/db/queries/chunks";
import { getDocumentByStageId, updateDocumentParse } from "@/lib/db/queries/documents";
import { getStageById, setStageHasKnowledgeBase } from "@/lib/db/queries/stages";
import { splitPagesToChunks } from "@/lib/knowledge/chunk";
import { embedTexts } from "@/lib/knowledge/embed";
import { parsePdf } from "@/lib/knowledge/parse";
import type { IngestResponse } from "@/lib/types/knowledge";
import {
  ingestResponseSchema,
  stageIdSchema,
} from "@/lib/validators/knowledge";

/** 解析正文去空白后最少字数，扫描件等低于此值视为无法 ingest */
const MIN_PARSE_CHARS = 200;

/** ingest 参数或文件不合法（无文档、文件丢失、文本过短等） */
export class KnowledgeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnowledgeValidationError";
  }
}

/** 课堂不存在 */
export class KnowledgeNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnowledgeNotFoundError";
  }
}

/**
 * 确认生成：读 PDF → 抽文本 → 切分 → 向量化写入 chunks，并打开 hasKnowledgeBase。
 * 已 ingest 过则覆盖切块与向量。
 */
export async function ingestStage(stageId: string): Promise<IngestResponse> {
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

  const filePath = resolveUploadPath(document.storagePath);
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

  const embeddings = await embedTexts(chunks.map((chunk) => chunk.content));
  if (embeddings.length !== chunks.length) {
    throw new Error("embedding count does not match chunk count");
  }

  await updateDocumentParse({
    id: document.id,
    pageCount: pages.length,
    rawText,
  });

  await deleteChunksByStageId(id);
  await insertChunks(
    chunks.map((chunk, index) => ({
      stageId: id,
      documentId: document.id,
      content: chunk.content,
      page: chunk.page,
      chunkIndex: chunk.chunkIndex,
      embedding: embeddings[index],
    })),
  );
  await setStageHasKnowledgeBase(id, true);

  return ingestResponseSchema.parse({
    stageId: id,
    documentId: document.id,
    pageCount: pages.length,
    charCount,
    chunkCount: chunks.length,
    hasKnowledgeBase: true,
  });
}

/** 把 documents.storage_path 解析到 UPLOAD_DIR 内的绝对路径，拒绝逃逸 */
function resolveUploadPath(storagePath: string): string {
  const uploadRoot = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");
  const resolved = path.resolve(uploadRoot, storagePath);
  const relative = path.relative(uploadRoot, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new KnowledgeValidationError("invalid storage path");
  }

  return resolved;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
