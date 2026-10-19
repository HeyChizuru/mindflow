import { apiErrorSchema, stageResponseSchema } from "@/lib/validators/stages";
import type { StageResponse } from "@/lib/types/stage";

/** 读取课堂失败（message 已是可读短句） */
export class GetStageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GetStageError";
  }
}

const GET_FAILED = "读取课堂失败，请稍后重试";
const GET_RESPONSE_INVALID = "服务返回异常，请稍后重试";

const GET_ERROR_ZH: Record<string, string> = {
  "stage not found": "找不到这节课",
  "stageId must be a uuid": "课堂地址无效",
  "Failed to get stage": GET_FAILED,
  "Validation failed": "课堂地址无效",
};

/**
 * 把 GET /api/stages/{id} 的 error 收成短句。
 * 含换行或堆栈形态时不原样展示。
 */
function mapGetStageError(error: string): string {
  const trimmed = error.trim();
  if (!trimmed || trimmed.includes("\n") || /\bat\s+\S+\s+\(/.test(trimmed)) {
    return GET_FAILED;
  }
  return GET_ERROR_ZH[trimmed] ?? trimmed;
}

/**
 * 按 id 读取已保存课堂。
 * 用 stageResponseSchema 校验；404 等失败抛出 GetStageError，不写库。
 */
export async function getStage(stageId: string, signal?: AbortSignal): Promise<StageResponse> {
  let response: Response;
  let text: string;
  try {
    response = await fetch(`/api/stages/${encodeURIComponent(stageId)}`, { cache: "no-store", signal });
    text = await response.text();
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new GetStageError(GET_FAILED);
  }
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new GetStageError(GET_FAILED);
  }

  if (!response.ok) {
    const err = apiErrorSchema.safeParse(json);
    const raw = err.success ? err.data.error : "Failed to get stage";
    throw new GetStageError(mapGetStageError(raw));
  }

  const parsed = stageResponseSchema.safeParse(json);
  if (!parsed.success || parsed.data.id.toLowerCase() !== stageId.toLowerCase()) {
    throw new GetStageError(GET_RESPONSE_INVALID);
  }

  return parsed.data;
}
