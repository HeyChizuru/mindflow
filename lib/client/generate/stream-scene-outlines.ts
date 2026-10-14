import type { SceneOutline } from "@/lib/types/outline";
import { DEFAULT_LANGUAGE_DIRECTIVE } from "@/lib/types/outline";
import { apiErrorSchema } from "@/lib/validators/stages";
import { sceneOutlineSchema } from "@/lib/validators/outline";

/** 大纲流失败（message 为可读短句，不含堆栈或密钥） */
export class OutlineStreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutlineStreamError";
  }
}

const STREAM_FAILED = "大纲生成失败，请重试";
const STREAM_UNPARSEABLE = "模型没有给出可用的大纲";

const STREAM_ERROR_ZH: Record<string, string> = {
  "LLM response could not be parsed into outlines": STREAM_UNPARSEABLE,
  "LLM returned empty response": STREAM_UNPARSEABLE,
  "Generated outlines failed validation": STREAM_UNPARSEABLE,
  "Failed to generate outlines": STREAM_FAILED,
  "Failed to start outline stream": STREAM_FAILED,
};

export type OutlineStreamHandlers = {
  onLanguageDirective: (directive: string) => void;
  onOutline: (outline: SceneOutline) => void;
  /** 服务端重试时清空已收集的大纲与授课语言指令 */
  onRetry: () => void;
  onDone: (result: { outlines: SceneOutline[]; languageDirective: string }) => void;
};

/**
 * 把接口 error 收成短句。含换行、堆栈或密钥形态时不原样展示。
 */
function readableStreamError(raw: string): string {
  const trimmed = raw.trim();
  if (
    !trimmed ||
    trimmed.includes("\n") ||
    /\bat\s+\S+\s+\(/.test(trimmed) ||
    /sk-|api[_-]?key|bearer\s+/i.test(trimmed)
  ) {
    return STREAM_FAILED;
  }
  return STREAM_ERROR_ZH[trimmed] ?? trimmed;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * 请求大纲 SSE。body 仅 `{ stageId }`。
 * `retry` 时调用 onRetry；HTTP 或 SSE `error` 抛出 OutlineStreamError。
 * signal 中止时静默返回。
 */
export async function streamSceneOutlines(
  stageId: string,
  headers: HeadersInit,
  handlers: OutlineStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch("/api/generate/scene-outlines-stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({ stageId }),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) return;
    throw new OutlineStreamError(STREAM_FAILED);
  }

  if (!response.ok) {
    throw new OutlineStreamError(await readHttpError(response));
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new OutlineStreamError(STREAM_FAILED);
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;

  try {
    while (!finished) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let splitAt = buffer.indexOf("\n\n");
      while (splitAt >= 0) {
        const rawEvent = buffer.slice(0, splitAt);
        buffer = buffer.slice(splitAt + 2);
        finished = handleSseEvent(rawEvent, handlers);
        if (finished) break;
        splitAt = buffer.indexOf("\n\n");
      }
    }
  } catch (error) {
    if (isAbortError(error)) return;
    if (error instanceof OutlineStreamError) throw error;
    throw new OutlineStreamError(STREAM_FAILED);
  } finally {
    reader.releaseLock();
  }

  if (signal?.aborted) return;
  if (!finished) {
    throw new OutlineStreamError(STREAM_FAILED);
  }
}

/** 处理一条 SSE。遇到 error 或 done 时返回 true，表示流可以结束 */
function handleSseEvent(rawEvent: string, handlers: OutlineStreamHandlers): boolean {
  const dataLines = rawEvent
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());
  if (dataLines.length === 0) return false;

  let payload: unknown;
  try {
    payload = JSON.parse(dataLines.join("\n"));
  } catch {
    return false;
  }
  if (!payload || typeof payload !== "object") return false;

  const event = payload as {
    type?: string;
    data?: unknown;
    error?: unknown;
    outlines?: unknown;
    languageDirective?: unknown;
  };

  switch (event.type) {
    case "languageDirective":
      if (typeof event.data === "string" && event.data.trim()) {
        handlers.onLanguageDirective(event.data);
      }
      return false;
    case "outline": {
      const parsed = sceneOutlineSchema.safeParse(event.data);
      if (parsed.success) handlers.onOutline(parsed.data);
      return false;
    }
    case "retry":
      handlers.onRetry();
      return false;
    case "done": {
      const outlines = Array.isArray(event.outlines)
        ? event.outlines.flatMap((item) => {
            const parsed = sceneOutlineSchema.safeParse(item);
            return parsed.success ? [parsed.data] : [];
          })
        : [];
      const languageDirective =
        typeof event.languageDirective === "string" && event.languageDirective.trim()
          ? event.languageDirective
          : DEFAULT_LANGUAGE_DIRECTIVE;
      handlers.onDone({ outlines, languageDirective });
      return true;
    }
    case "error":
      throw new OutlineStreamError(
        readableStreamError(typeof event.error === "string" ? event.error : STREAM_FAILED),
      );
    default:
      return false;
  }
}

async function readHttpError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const json: unknown = text ? JSON.parse(text) : {};
    const err = apiErrorSchema.safeParse(json);
    if (err.success) return readableStreamError(err.data.error);
  } catch {
    // 非 JSON 时走通用文案
  }
  return STREAM_FAILED;
}
