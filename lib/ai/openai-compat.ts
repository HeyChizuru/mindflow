import { createOpenAI } from "@ai-sdk/openai";

import {
  LlmSettingsError,
  headerValue,
  resolveChatConnection,
} from "@/lib/ai/llm-connection";

export { LlmSettingsError };

const HEADER_CHAT_MODEL = "x-mindflow-llm-chat-model";

/**
 * 从请求头解析语言模型：chat Key + chat Base-Url + Chat-Model。
 * 不读 embedding 头、不读 env；缺头 401，非法 Url / 生产 SSRF 400。
 */
export async function requireChatModel(request: Request) {
  const chatModel = headerValue(request, HEADER_CHAT_MODEL);
  if (!chatModel) {
    throw new LlmSettingsError("LLM chatModel is not set", 401);
  }

  const { apiKey, baseUrl } = await resolveChatConnection(request);
  const client = createOpenAI({
    apiKey,
    baseURL: baseUrl,
  });

  return {
    chat: client.chat(chatModel),
    meta: { chatModel },
  };
}
