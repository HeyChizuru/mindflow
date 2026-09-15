import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { insertDocument } from "@/lib/db/queries/documents";
import { deleteStage, insertStage } from "@/lib/db/queries/stages";
import type { CreateStageResponse } from "@/lib/types/stage";
import { deriveStageName } from "@/lib/utils/derive-stage-name";
import {
  createStageBodySchema,
  createStageResponseSchema,
} from "@/lib/validators/stages";

const MAX_PDF_BYTES = 50 * 1024 * 1024;

export class StageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StageValidationError";
  }
}

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

function sanitizeFilename(name: string): string {
  const base = path.basename(name).replace(/[/\\]/g, "");
  const safe = base.replace(/[^\w.\u4e00-\u9fff-]+/g, "_") || "upload.pdf";
  return safe.toLowerCase().endsWith(".pdf") ? safe : `${safe}.pdf`;
}

function filenameStem(name: string): string {
  const base = path.basename(name);
  return base.replace(/\.pdf$/i, "") || "untitled";
}
