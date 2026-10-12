import { mapCreateStageApiError } from "@/lib/client/stages/map-api-error";
import type { CreateStageBody, CreateStageResponse } from "@/lib/types/stage";
import { apiErrorSchema, stageResponseSchema } from "@/lib/validators/stages";

/** 建课 API 调用失败（已映射为可读中文 message） */
export class CreateStageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreateStageError";
  }
}

const CREATE_RESPONSE_INVALID = "服务返回异常，请稍后重试";

/**
 * 创建课堂：无 PDF 时 JSON；有 PDF 时 multipart（requirements 为整段 CreateStageBody JSON）。
 * 成功返回 201 DTO；失败抛出 CreateStageError。
 */
export async function createStage(
  body: CreateStageBody,
  pdf?: File,
): Promise<CreateStageResponse> {
  let response: Response;

  if (pdf) {
    const form = new FormData();
    form.append("requirements", JSON.stringify(body));
    form.append("pdf", pdf);
    response = await fetch("/api/stages", { method: "POST", body: form });
  } else {
    response = await fetch("/api/stages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  const text = await response.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new CreateStageError(mapCreateStageApiError("Failed to create stage"));
  }

  if (!response.ok) {
    const err = apiErrorSchema.safeParse(json);
    const raw = err.success ? err.data.error : "Failed to create stage";
    throw new CreateStageError(mapCreateStageApiError(raw));
  }

  const parsed = stageResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new CreateStageError(CREATE_RESPONSE_INVALID);
  }

  return parsed.data;
}
