import { createOpenAI } from "@ai-sdk/openai";

import {
  LlmSettingsError,
  headerValue,
  resolveEmbeddingConnection,
} from "@/lib/ai/llm-connection";

const HEADER_EMBEDDING_MODEL = "x-mindflow-llm-embedding-model";

/**
 * 从请求头解析向量模型：embedding Key + embedding Base-Url + Embedding-Model。
 * 不读 chat 头、不读 env；缺头 401，非法 Url / 生产 SSRF 400。
 */
export async function requireEmbeddingModel(request: Request) {
  const embeddingModel = headerValue(request, HEADER_EMBEDDING_MODEL);
  if (!embeddingModel) {
    throw new LlmSettingsError("LLM embeddingModel is not set", 401);
  }

  const { apiKey, baseUrl } = await resolveEmbeddingConnection(request);
  const client = createOpenAI({
    apiKey,
    baseURL: baseUrl,
  });

  return {
    model: client.embeddingModel(embeddingModel),
    meta: { embeddingModel },
  };
}
