import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

import { getStageById } from "@/lib/db/queries/stages";
import { retrieve } from "@/lib/knowledge/retrieve";
import type { ChatResponse } from "@/lib/types/chat";
import type { SourceRef } from "@/lib/types/knowledge";
import {
  chatRequestSchema,
  chatResponseSchema,
} from "@/lib/validators/chat";

/** 课堂不存在 */
export class ChatNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatNotFoundError";
  }
}

/** 请求不合法（缺 user 消息等） */
export class ChatValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatValidationError";
  }
}

/**
 * 最小课堂问答：retrieve 相关切块后一次 generateText。
 * 不写 chat 表；无知识库时 sources 为空仍可回答。
 */
export async function chat(input: unknown): Promise<ChatResponse> {
  const { stageId, messages } = chatRequestSchema.parse(input);

  const stage = await getStageById(stageId);
  if (!stage) {
    throw new ChatNotFoundError("stage not found");
  }

  const lastUser = messages[messages.length - 1];
  if (!lastUser || lastUser.role !== "user" || lastUser.content.trim().length === 0) {
    throw new ChatValidationError("last message must be a non-empty user message");
  }

  const sources = await retrieve(stageId, lastUser.content);
  const { text } = await generateText({
    model: getChatModel(),
    system: buildSystemPrompt(sources),
    messages: messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  });

  return chatResponseSchema.parse({
    text,
    sources,
  });
}

function getChatModel() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not set");
  }

  const deepseek = createOpenAI({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL,
  });

  return deepseek.chat(process.env.DEEPSEEK_MODEL ?? "deepseek-chat");
}

function buildSystemPrompt(sources: SourceRef[]): string {
  if (sources.length === 0) {
    return "You are a course assistant. Answer based on the conversation.";
  }

  const lines = sources.map((source, index) => {
    const page = source.page != null ? `(p.${source.page}) ` : "";
    return `[${index + 1}] ${page}${source.excerpt}`;
  });

  return [
    "You are a course assistant.",
    "",
    "## Reference Material",
    ...lines,
    "",
    "Prefer references when answering factual questions. Cite [n].",
    "If the answer is not in references, say so and use course content.",
  ].join("\n");
}
