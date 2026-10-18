import { callLLM } from "@/lib/ai/llm";
import { APICallError, RetryError } from "ai";
import { requireChatModel } from "@/lib/ai/openai-compat";
import type { AICallFn, SceneGenerationContext } from "@/lib/generation/pipeline-types";
import { SceneGenerationError } from "@/lib/generation/scene-generation-error";
import type { SceneActionsOptions, SceneContentOptions } from "@/lib/generation/scene-generator";
import { requireEmbeddingModel } from "@/lib/knowledge/embedding-config";
import { formatRetrievalExcerpts } from "@/lib/knowledge/format-retrieval-excerpts";
import { retrieve } from "@/lib/knowledge/retrieve";
import type { SceneActionsGenerationBody, SceneContentGenerationBody } from "@/lib/types/stage-generation";

export function buildSceneGenerationContext(
  input: SceneContentGenerationBody,
  previousSpeeches: string[],
): SceneGenerationContext {
  const index = input.allOutlines.findIndex((outline) => outline.id === input.outline.id);
  if (index === -1) throw new SceneGenerationError("目标大纲不在课程大纲中", 400);
  return {
    pageIndex: index + 1,
    totalPages: input.allOutlines.length,
    allTitles: input.allOutlines.map((outline) => outline.title),
    previousSpeeches: [...previousSpeeches],
  };
}

async function createSceneGenerationCall(request: Request, source: string): Promise<AICallFn> {
  const { chat } = await requireChatModel(request);
  return async (system, prompt) => {
    let result;
    try {
      result = await callLLM({ model: chat, system, prompt }, source);
    } catch (error) {
      const failure = RetryError.isInstance(error) ? error.lastError : error;
      const cause = failure instanceof Error ? failure.cause : undefined;
      console.error(`[${source}] Model call failed: ${JSON.stringify({
        name: failure instanceof Error ? failure.name : "unknown",
        statusCode: APICallError.isInstance(failure) ? failure.statusCode : undefined,
        code: typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string"
          ? cause.code : undefined,
      })}`);
      throw new SceneGenerationError("场景模型调用失败，请重试", 502);
    }
    if (result.finishReason !== "stop" || !result.text?.trim()) {
      throw new SceneGenerationError("场景模型输出不完整，请重试", 502);
    }
    return result.text;
  };
}

function generationOptions(input: SceneContentGenerationBody, previousSpeeches: string[]) {
  return {
    requirement: input.requirement,
    ...(input.userProfile !== undefined ? { userProfile: input.userProfile } : {}),
    ...(input.languageDirective != null ? { languageDirective: input.languageDirective } : {}),
    ctx: buildSceneGenerationContext(input, previousSpeeches),
  };
}

export async function prepareSceneContentGeneration(
  request: Request,
  input: SceneContentGenerationBody,
  hasKnowledgeBase: boolean,
): Promise<{ aiCall: AICallFn; options: SceneContentOptions }> {
  const options: SceneContentOptions = generationOptions(input, []);
  const aiCall = await createSceneGenerationCall(request, "scene-content");
  if (hasKnowledgeBase) {
    const { model: embeddingModel } = await requireEmbeddingModel(request);
    const query = [input.requirement, input.outline.title, input.outline.description, ...input.outline.keyPoints].join("\n");
    try {
      const sources = await retrieve(input.stageId, query, { embeddingModel });
      const excerpts = formatRetrievalExcerpts(sources);
      if (excerpts) options.retrievalExcerpts = excerpts;
    } catch {
      throw new SceneGenerationError("检索课堂参考资料失败，请重试", 502);
    }
  }
  return { aiCall, options };
}

export async function prepareSceneActionsGeneration(
  request: Request,
  input: SceneActionsGenerationBody,
): Promise<{ aiCall: AICallFn; options: SceneActionsOptions }> {
  return {
    aiCall: await createSceneGenerationCall(request, "scene-actions"),
    options: generationOptions(input, input.previousSpeeches),
  };
}
