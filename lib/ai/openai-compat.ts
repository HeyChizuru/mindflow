import { createOpenAI } from "@ai-sdk/openai";

import type { ResolvedLlmSettings } from "@/lib/ai/types";

/**
 * 把 OpenAI 兼容根路径规范成带 `/v1`、无末尾斜杠。
 * 避免 `https://api.deepseek.com` 与 `.../v1` 混用导致 404。
 */
export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  const url = new URL(trimmed);
  let path = url.pathname.replace(/\/+$/, "");
  if (!path.endsWith("/v1")) {
    path = `${path}/v1`;
  }
  url.pathname = path;
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

/** 按本次请求的 key/url 创建 OpenAI 兼容 client；无模块单例 */
function createOpenAIClient(resolved: ResolvedLlmSettings) {
  return createOpenAI({
    apiKey: resolved.apiKey,
    baseURL: resolved.baseUrl,
  });
}

/**
 * 取出 chat LanguageModel。每次新建 client，不缓存。
 */
export function getChatModel(settings: ResolvedLlmSettings) {
  return createOpenAIClient(settings).chat(settings.chatModel);
}

/**
 * 取出 embedding 模型，供 ingest / retrieve 使用。每次新建 client，不缓存。
 */
export function getEmbeddingModel(settings: ResolvedLlmSettings) {
  return createOpenAIClient(settings).embeddingModel(settings.embeddingModel);
}
