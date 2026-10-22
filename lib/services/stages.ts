import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/db/client";
import { deleteChunksByStageId } from "@/lib/db/queries/chunks";
import {
  deleteDocumentsByStageId,
  getDocumentByStageId,
  insertDocument,
} from "@/lib/db/queries/documents";
import { deleteStage, getStageById, insertStage } from "@/lib/db/queries/stages";
import type { CreateStageDocument, CreateStageResponse, DeleteStageResponse } from "@/lib/types/stage";
import { deriveStageName } from "@/lib/utils/derive-stage-name";
import {
  createStageBodySchema,
  deleteStageResponseSchema,
  stageIdSchema,
  stageResponseSchema,
} from "@/lib/validators/stages";

/** PDF 体积上限（50MB），对齐 PRD */
const MAX_PDF_BYTES = 50 * 1024 * 1024;

/** 创建或读取课堂的参数不合法（提示词不合格、非 PDF、超 50MB、id 不是 uuid） */
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
 * 创建课堂：requirements.requirement 必填（至少 10 字），昵称与背景可选，PDF 可选。
 * 有 PDF 时只写入 uploads/ 和 documents 元数据，不解析、不写 chunks、不调用模型。
 * 校验通过后才插入课堂；写盘失败时删除刚插入的行。
 */
export async function createStage(
  input: unknown,
  pdf?: File,
): Promise<CreateStageResponse> {
  const { requirements } = createStageBodySchema.parse(input);
  const hasPdf = pdf !== undefined;

  if (hasPdf) {
    assertPdf(pdf);
  }

  const name = deriveStageName(requirements.requirement);

  const stage = await insertStage({
    name,
    requirement: requirements.requirement,
    userNickname: requirements.userNickname ?? null,
    userBio: requirements.userBio ?? null,
  });

  if (!hasPdf) {
    return toStageResponse(stage);
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

    return toStageResponse(stage, {
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
 * 按课堂 id 读回规范化 requirements 与文档摘要。
 * 不读 PDF、不返回全文。不存在时抛 StageNotFoundError。
 */
export async function getStage(stageId: string): Promise<CreateStageResponse> {
  const id = parseStageId(stageId);
  const stage = await getStageById(id);
  if (!stage) {
    throw new StageNotFoundError("stage not found");
  }

  const document = await getDocumentByStageId(id);
  return toStageResponse(
    stage,
    document
      ? {
          id: document.id,
          filename: document.filename,
          storagePath: document.storagePath,
        }
      : undefined,
  );
}

/**
 * 删除课堂：显式清 chunks、documents、stage，再尽力删除 uploads/{id}。
 */
export async function removeStage(stageId: string): Promise<DeleteStageResponse> {
  const id = parseStageId(stageId);
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

/** 把课堂行映射为 DTO。昵称、背景为空则不出现在 requirements 里 */
export function toStageResponse(
  stage: {
    id: string;
    name: string;
    requirement: string;
    userNickname: string | null;
    userBio: string | null;
    status: string;
    previewPhase: string;
    hasKnowledgeBase: boolean;
    createdAt: Date;
  },
  document?: CreateStageDocument,
): CreateStageResponse {
  return stageResponseSchema.parse({
    id: stage.id,
    name: stage.name,
    requirements: {
      requirement: stage.requirement,
      ...(stage.userNickname ? { userNickname: stage.userNickname } : {}),
      ...(stage.userBio ? { userBio: stage.userBio } : {}),
    },
    status: stage.status,
    previewPhase: stage.previewPhase,
    createdAt: stage.createdAt.toISOString(),
    hasKnowledgeBase: stage.hasKnowledgeBase,
    ...(document ? { document } : {}),
  });
}

/** 校验课堂 id 为 uuid，否则抛 StageValidationError */
function parseStageId(stageId: string): string {
  const parsedId = stageIdSchema.safeParse(stageId);
  if (!parsedId.success) {
    throw new StageValidationError("stageId must be a uuid");
  }

  return parsedId.data;
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
