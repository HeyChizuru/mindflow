import type { SourceRef } from "@/lib/types/knowledge";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/** POST /api/chat 请求体 */
export type ChatRequest = {
  stageId: string;
  messages: ChatMessage[];
};

/** POST /api/chat 成功响应（M1 JSON，不落库） */
export type ChatResponse = {
  text: string;
  sources: SourceRef[];
};
