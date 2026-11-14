import "server-only";
import { APICallError, tool, type LanguageModel, type ModelMessage, type TextStreamPart, type ToolSet } from "ai";
import { z } from "zod";
import { callLLM, streamLLM } from "@/lib/ai/llm";
import { CHAT_EXECUTION_TTL_MS, type ChatErrorCode, type ChatFailureCode } from "@/lib/types/chat";

// 一轮问答共享预算，防止模型和工具循环占用无限时间或上下文。
export const CHAT_LIMITS = {
  modelCalls: 12,
  tools: 4,
  searches: 2,
  callMs: 45000,
  saveMs: 15000,
  inputChars: 64000,
  outputTokens: 6000,
  historyChars: 16000,
  candidateChars: 24000,
  toolChars: 16000,
  recursion: 24,
} as const;

export class ChatAgentError extends Error {
  constructor(
    readonly code: ChatErrorCode,
    message: string,
    readonly failureCode: ChatFailureCode = "EXECUTION_FAILED",
  ) {
    super(message);
    this.name = "ChatAgentError";
  }
}

export class ChatBudget {
  private modelCalls = 0;
  private toolCalls = 0;
  private searches = 0;
  private readonly deadline: number;

  constructor(expiresAt: string, readonly signal: AbortSignal, startedBeforeClaim = Date.now()) {
    // 本地执行时间不超过一次租期，并为最终结果保存预留时间。
    this.deadline = Math.min(Date.parse(expiresAt), startedBeforeClaim + CHAT_EXECUTION_TTL_MS) - CHAT_LIMITS.saveMs;
  }
  check() {
    if (this.signal.aborted) throw new ChatAgentError("CANCELLED", "本轮已取消，可读取记录后显式重试");
    if (Date.now() >= this.deadline) throw new ChatAgentError("LIMIT_EXCEEDED", "本轮执行时间已达上限，请重试");
  }
  takeTool(search: boolean) {
    this.check();
    if (++this.toolCalls > CHAT_LIMITS.tools || (search && ++this.searches > CHAT_LIMITS.searches)) {
      throw new ChatAgentError("LIMIT_EXCEEDED", "本轮资料查询次数已达上限，请重试");
    }
  }
  callSignal(): AbortSignal {
    this.check();
    return AbortSignal.any([this.signal, AbortSignal.timeout(Math.max(1, Math.min(CHAT_LIMITS.callMs, this.deadline - Date.now())))]);
  }
  async model(
    model: LanguageModel,
    system: string,
    messages: ModelMessage[],
    tools?: Parameters<typeof callLLM>[0]["tools"],
    toolChoice?: Parameters<typeof callLLM>[0]["toolChoice"],
    onChunk?: (chunk: TextStreamPart<ToolSet>) => void,
  ) {
    this.check();
    if (++this.modelCalls > CHAT_LIMITS.modelCalls || system.length + JSON.stringify(messages).length > CHAT_LIMITS.inputChars) {
      throw new ChatAgentError("LIMIT_EXCEEDED", "本轮模型调用次数或上下文长度已达上限");
    }
    const abortSignal = this.callSignal();
    try {
      const params = {
        model,
        system,
        messages,
        tools,
        toolChoice,
        maxRetries: 0,
        maxOutputTokens: CHAT_LIMITS.outputTokens,
        abortSignal,
        // 不在 SDK 内自动执行工具，由图节点负责调用工具和继续执行。
        stopWhen: () => true,
      };
      const result = onChunk ? await (async () => {
        const stream = streamLLM({ ...params, onError: () => {} }, "classroom-chat");
        for await (const chunk of stream.fullStream) {
          this.check();
          if (chunk.type === 'error') throw chunk.error;
          onChunk(chunk);
        }
        return {
          text: await stream.text,
          toolCalls: await stream.toolCalls,
          response: await stream.response,
          finishReason: await stream.finishReason,
        };
      })() : await callLLM(params, "classroom-chat");
      this.check();
      if (abortSignal.aborted) throw new ChatAgentError("LIMIT_EXCEEDED", "模型调用超时，本轮未完成");
      if (result.finishReason === "length") throw new ChatAgentError("REPLY_INVALID", "模型输出被截断，本轮未完成", "REPLY_INVALID");
      if (result.finishReason !== "stop" && result.finishReason !== "tool-calls") {
        throw new ChatAgentError("REPLY_INVALID", "模型未正常完成回复，本轮未保存结果", "REPLY_INVALID");
      }
      return result;
    } catch (error) {
      if (error instanceof ChatAgentError) throw error;
      this.check();
      if (abortSignal.aborted) throw new ChatAgentError("LIMIT_EXCEEDED", "模型调用超时，本轮未完成");
      if (APICallError.isInstance(error) && [400, 422].includes(error.statusCode ?? 0)
        && /not support|unsupported|not available/i.test(error.message)) {
        throw new ChatAgentError("MODEL_UNSUPPORTED", "模型不支持本轮所需的调用能力", "MODEL_FAILED");
      }
      throw new ChatAgentError("MODEL_FAILED", "对话模型调用失败，请核对模型能力或服务后重试", "MODEL_FAILED");
    }
  }
  // 路由和筛选等决策通过工具返回结构化结果，再使用 schema 校验。
  async structured<T extends z.ZodType>(
    model: LanguageModel,
    system: string,
    input: unknown,
    schema: T,
  ): Promise<z.output<T>> {
    const result = await this.model(
      model,
      system + "\nYou must call structured_result once to return your decision. Do not answer with plain text.",
      [{ role: "user", content: JSON.stringify(input) }],
      {
        structured_result: tool({
          description: "Return the requested validated structured decision.",
          inputSchema: schema,
        }),
      },
      "auto",
    );
    const calls = result.toolCalls;
    if (calls.length !== 1 || calls[0].toolName !== "structured_result" || calls[0].invalid) {
      throw new ChatAgentError("MODEL_UNSUPPORTED", "模型未返回所需的结构化决策", "MODEL_FAILED");
    }
    const parsed = schema.safeParse(calls[0].input);
    if (!parsed.success) throw new ChatAgentError("REPLY_INVALID", "模型决策字段无效，本轮未完成", "REPLY_INVALID");
    return parsed.data;
  }
}
