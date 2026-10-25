import type { ConfirmOutlinesBody, ConfirmOutlinesResponse, GenerationPreviewResponse, SceneContentGenerationBody, SceneActionsGenerationBody } from "@/lib/types/stage-generation";
import { confirmOutlinesBodySchema, confirmOutlinesResponseSchema, generationPreviewResponseSchema, sceneContentGenerationBodySchema, sceneContentGenerationResponseSchema, sceneActionsGenerationBodySchema, sceneActionsGenerationResponseSchema } from "@/lib/validators/stage-generation";
import type { Scene } from "@/lib/types/scene";
import type { SceneOutline } from "@/lib/types/outline";
import { generatedContentForOutlineSchema } from "@/lib/validators/scenes";
import { apiErrorSchema } from "@/lib/validators/stages";

export class StageGenerationRequestError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message);
    this.name = "StageGenerationRequestError";
  }
}

const MODEL_ERRORS: Record<string, string> = {
  "LLM chatModel is not set": "请先配置对话模型",
  "LLM chat apiKey is not set": "请先配置对话模型密钥",
  "LLM chat baseUrl is not set": "请先配置对话模型端点",
  "LLM chat baseUrl is invalid": "对话模型端点无效",
  "LLM chat baseUrl is not allowed": "对话模型端点不可用",
  "LLM embeddingModel is not set": "知识库已就绪，请配置向量模型",
  "LLM embedding apiKey is not set": "请先配置向量模型密钥",
  "LLM embedding baseUrl is not set": "请先配置向量模型端点",
  "LLM embedding baseUrl is invalid": "向量模型端点无效",
  "LLM embedding baseUrl is not allowed": "向量模型端点不可用",
};

async function readResponse(response: Response, fallback: string): Promise<unknown> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new StageGenerationRequestError(fallback, response.status);
  }
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    const raw = parsed.success ? parsed.data.error.trim() : "";
    const message = MODEL_ERRORS[raw] ?? (
      raw && !/[\r\n]|\bat\s+\S+\s+\(|sk-|api[_-]?key|bearer\s+/i.test(raw) ? raw : fallback
    );
    throw new StageGenerationRequestError(message, response.status);
  }
  return body;
}

export async function getGenerationPreview(stageId: string, signal?: AbortSignal): Promise<GenerationPreviewResponse> {
  const fallback = "读取大纲失败，请重试";
  let response: Response;
  try {
    response = await fetch(`/api/stages/${encodeURIComponent(stageId)}/generation-preview`, { cache: "no-store", signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new StageGenerationRequestError(fallback);
  }
  const parsed = generationPreviewResponseSchema.safeParse(await readResponse(response, fallback));
  if (!parsed.success || parsed.data.stageId.toLowerCase() !== stageId.toLowerCase()) {
    throw new StageGenerationRequestError("大纲数据无效，请重试", response.status);
  }
  if (parsed.data.outlinesStatus === "confirmed" && parsed.data.firstScene
    && !isSceneForTarget(parsed.data.firstScene, stageId, parsed.data.outlines[0])) {
    throw new StageGenerationRequestError("已保存首屏与课堂定稿不一致，请重试", response.status);
  }
  return parsed.data;
}

function isSceneForTarget(scene: Scene, stageId: string, outline: SceneOutline): boolean {
  if (scene.stageId.toLowerCase() !== stageId.toLowerCase() || scene.outlineId !== outline.id
    || scene.type !== outline.type || scene.order !== outline.order || scene.title !== outline.title) return false;
  const content = scene.content.type === "slide" ? scene.content.canvas : { questions: scene.content.questions };
  return generatedContentForOutlineSchema(outline).safeParse(content).success;
}

async function postSceneGeneration(path: string, body: unknown, headers: HeadersInit, fallback: string, signal?: AbortSignal) {
  try {
    const requestHeaders = new Headers(headers);
    requestHeaders.set("Content-Type", "application/json");
    const response = await fetch(path, { method: "POST", headers: requestHeaders, body: JSON.stringify(body), signal });
    return await readResponse(response, fallback);
  } catch (error) {
    if (signal?.aborted || error instanceof StageGenerationRequestError) throw error;
    throw new StageGenerationRequestError(fallback);
  }
}

export async function generateSceneContent(input: SceneContentGenerationBody, headers: HeadersInit, signal?: AbortSignal) {
  const body = sceneContentGenerationBodySchema.safeParse(input);
  if (!body.success) throw new StageGenerationRequestError("生成依据无效，请重新读取课堂", 400);
  const parsed = sceneContentGenerationResponseSchema.safeParse(await postSceneGeneration(
    "/api/generate/scene-content", body.data, headers, "场景内容生成失败，请重试", signal,
  ));
  if (!parsed.success || JSON.stringify(parsed.data.effectiveOutline) !== JSON.stringify(body.data.outline)) {
    throw new StageGenerationRequestError("生成内容与目标大纲不一致，请重试");
  }
  return parsed.data;
}

export async function generateSceneActions(input: SceneActionsGenerationBody, headers: HeadersInit, signal?: AbortSignal) {
  const body = sceneActionsGenerationBodySchema.safeParse(input);
  if (!body.success) throw new StageGenerationRequestError("场景内容无效，请重新生成内容", 400);
  const parsed = sceneActionsGenerationResponseSchema.safeParse(await postSceneGeneration(
    "/api/generate/scene-actions", body.data, headers, "讲解动作生成或保存失败，请重试", signal,
  ));
  if (!parsed.success || !isSceneForTarget(parsed.data.scene, body.data.stageId, body.data.outline)) {
    throw new StageGenerationRequestError("保存结果与目标场景不一致，请重新读取课堂");
  }
  return parsed.data;
}

// Preserve the generation-preview call sites while sharing the same target-based contract.
export { generateSceneContent as generateFirstSceneContent, generateSceneActions as generateFirstSceneActions };

export async function confirmOutlines(
  stageId: string,
  input: ConfirmOutlinesBody,
  headers: HeadersInit,
  signal?: AbortSignal,
): Promise<ConfirmOutlinesResponse> {
  const body = confirmOutlinesBodySchema.safeParse(input);
  if (!body.success) throw new StageGenerationRequestError("请补全大纲的标题、描述和要点后再确认", 400);
  const fallback = "确认大纲失败，请重试";
  let response: Response;
  try {
    const requestHeaders = new Headers(headers);
    requestHeaders.set("Content-Type", "application/json");
    response = await fetch(`/api/stages/${encodeURIComponent(stageId)}/confirm-outlines`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(body.data),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new StageGenerationRequestError(fallback);
  }
  const parsed = confirmOutlinesResponseSchema.safeParse(await readResponse(response, fallback));
  if (!parsed.success || parsed.data.stageId.toLowerCase() !== stageId.toLowerCase()) {
    throw new StageGenerationRequestError("确认结果无效，请重新读取大纲", response.status);
  }
  return parsed.data;
}
