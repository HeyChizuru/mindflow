import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/db/client";
import { deleteChunksByStageId } from "@/lib/db/queries/chunks";
import { deleteDocumentsByStageId, insertDocument } from "@/lib/db/queries/documents";
import { deleteStage, getStageById, insertStage } from "@/lib/db/queries/stages";
import type { CreateStageResponse, DeleteStageResponse } from "@/lib/types/stage";
import { deriveStageName } from "@/lib/utils/derive-stage-name";
import {
  createStageBodySchema,
  createStageResponseSchema,
  deleteStageResponseSchema,
  stageIdSchema,
} from "@/lib/validators/stages";

/** PDF 体积上限（50MB），对齐 PRD */
const MAX_PDF_BYTES = 50 * 1024 * 1024;

/** 创建课堂参数不合法（缺 requirement/pdf、非 PDF、超 50MB 等） */
export class StageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StageValidationError";
  }
}

/** 课堂不存在 */
export class StageNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StageNotFoundError";
  }
}

/**
 * 创建课堂：提示词与 PDF 至少其一。
 * 有 PDF 时只写入 uploads/ 和 documents 元数据，不解析、不写 chunks。
 */
export async function createStage(
  input: unknown,
  pdf?: File,
): Promise<CreateStageResponse> {
  const { requirement = "" } = createStageBodySchema.parse(input);
  const hasPdf = pdf !== undefined;

  if (!hasPdf) {
    if (requirement.length === 0) {
      throw new StageValidationError("requirement or pdf is required");
    }

    if (requirement.length < 10) {
      throw new StageValidationError(
        "requirement must be at least 10 characters when no pdf is provided",
      );
    }
  }

  if (hasPdf) {
    assertPdf(pdf);
  }

  const name = hasPdf && requirement.length === 0
    ? deriveStageName(filenameStem(pdf.name))
    : deriveStageName(requirement);

  const stage = await insertStage({
    name,
    requirement,
  });

  if (!hasPdf) {
    return toResponse(stage);
  }

  try {
    const filename = sanitizeFilename(pdf.name);
    const storagePath = `${stage.id}/${filename}`;
    const uploadRoot = process.env.UPLOAD_DIR ?? "./uploads";
    const destDir = path.join(uploadRoot, stage.id);
    await mkdir(destDir, { recursive: true });
    await writeFile(path.join(destDir, filename), Buffer.from(await pdf.arrayBuffer()));

    const document = await insertDocument({
      stageId: stage.id,
      filename,
      storagePath,
    });

    return toResponse(stage, {
      id: document.id,
      filename: document.filename,
      storagePath: document.storagePath,
    });
  } catch (error) {
    await deleteStage(stage.id).catch(() => undefined);
    throw error;
  }
}

/**
 * 删除课堂：显式清 chunks、documents、stage，再尽力删除 uploads/{id}。
 */
export async function removeStage(stageId: string): Promise<DeleteStageResponse> {
  const parsedId = stageIdSchema.safeParse(stageId);
  if (!parsedId.success) {
    throw new StageValidationError("stageId must be a uuid");
  }

  const id = parsedId.data;
  const stage = await getStageById(id);
  if (!stage) {
    throw new StageNotFoundError("stage not found");
  }
  // tx 是 Prisma 的事务对象
  // 在事务中执行多个操作，确保原子性
  await prisma.$transaction(async (tx) => {
    await deleteChunksByStageId(id, tx);
    await deleteDocumentsByStageId(id, tx);
    await deleteStage(id, tx);
  });

  await rm(resolveUploadDir(id), { recursive: true, force: true });

  return deleteStageResponseSchema.parse({ id });
}

/** 把 Prisma Stage 行映射为 API DTO（hasKnowledgeBase 固定为 false） */
function toResponse(
  stage: {
    id: string;
    name: string;
    requirement: string;
    status: string;
    previewPhase: string;
    createdAt: Date;
  },
  document?: CreateStageResponse["document"],
): CreateStageResponse {
  return createStageResponseSchema.parse({
    id: stage.id,
    name: stage.name,
    requirement: stage.requirement,
    status: stage.status,
    previewPhase: stage.previewPhase,
    createdAt: stage.createdAt.toISOString(),
    hasKnowledgeBase: false,
    ...(document ? { document } : {}),
  });
}

/** 校验为 PDF 且不超过 50MB */
function assertPdf(file: File) {
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  if (!isPdf) {
    throw new StageValidationError("pdf must be a PDF file");
  }

  if (file.size > MAX_PDF_BYTES) {
    throw new StageValidationError("pdf must not exceed 50MB");
  }

  if (file.size === 0) {
    throw new StageValidationError("pdf must not be empty");
  }
}

/** 去掉路径分隔符，只保留安全文件名 */
function sanitizeFilename(name: string): string {
  const base = path.basename(name).replace(/[/\\]/g, "");
  const safe = base.replace(/[^\w.\u4e00-\u9fff-]+/g, "_") || "upload.pdf";
  return safe.toLowerCase().endsWith(".pdf") ? safe : `${safe}.pdf`;
}

/** 去掉 .pdf 后缀，用作仅 PDF 时的课堂标题 */
function filenameStem(name: string): string {
  const base = path.basename(name);
  return base.replace(/\.pdf$/i, "") || "untitled";
}

/** 解析课堂上传目录；拒绝逃出 UPLOAD_DIR */
function resolveUploadDir(stageId: string): string {
  const uploadRoot = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");
  const resolved = path.resolve(uploadRoot, stageId);
  const relative = path.relative(uploadRoot, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new StageValidationError("invalid storage path");
  }

  return resolved;
}
