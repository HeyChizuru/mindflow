/**
 * 场景大纲流式 API（SSE）
 *
 * SSE events:
 *   { type: 'languageDirective', data: string }
 *   { type: 'outline', data: SceneOutline, index: number }
 *   { type: 'done', outlines: SceneOutline[], languageDirective: string }
 *   { type: 'error', error: string }
 *   { type: 'retry', attempt, maxAttempts }
 */
import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { LlmSettingsError } from "@/lib/ai/llm-connection";
import { requireChatModel } from "@/lib/ai/openai-compat";
import { streamLLM } from "@/lib/ai/llm";
import { formatRetrievalExcerpts } from "@/lib/knowledge/format-retrieval-excerpts";
import { requireEmbeddingModel } from "@/lib/knowledge/embedding-config";
import { retrieve } from "@/lib/knowledge/retrieve";
import { createLogger } from "@/lib/logger";
import { buildOutlineGenerationPrompt } from "@/lib/prompts/build-outline-generation-prompt";
import { StageNotFoundError } from "@/lib/services/stages";
import { getStageForConfirmation, StageGenerationConflictError } from "@/lib/services/stage-generation";
import { DEFAULT_LANGUAGE_DIRECTIVE, type SceneOutline } from "@/lib/types/outline";
import { areSceneOutlinesValid, parseSceneOutline } from "@/lib/validators/outline";
import { stageIdSchema } from "@/lib/validators/stages";

const log = createLogger("Outlines Stream");

export const maxDuration = 300;

const streamBodySchema = z.object({
  stageId: stageIdSchema,
});

/**
 * 从流式包装 JSON 中提取 languageDirective。
 * 匹配部分 JSON 中的 `"languageDirective":"<value>"`，例如：
 *   {"languageDirective":"用中文授课...","outlines":[...
 */
function extractLanguageDirective(buffer: string): string | null {
  const match = buffer.match(/"languageDirective"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!match) return null;
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1];
  }
}

/**
 * 增量 JSON 数组解析器。
 * 从部分流式传输的 JSON 数组中提取完整的顶层对象。
 * 同时支持扁平数组 `[{...},{...}]` 和包装对象
 * `{"languageDirective":"...","outlines":[{...},{...}]}`。
 * 返回新发现的对象（跳过已扫描的 `alreadyScanned` 个顶层对象，含校验失败的）。
 */
function extractNewOutlines(buffer: string, alreadyScanned: number): unknown[] {
  const results: unknown[] = [];
  const stripped = buffer.replace(/^[\s\S]*?(?=[\[{])/, "");

  let arrayStart = -1;
  const outlinesKeyIdx = stripped.indexOf('"outlines"');
  if (outlinesKeyIdx >= 0) {
    arrayStart = stripped.indexOf("[", outlinesKeyIdx);
  } else {
    arrayStart = stripped.indexOf("[");
  }

  if (arrayStart === -1) return results;

  let depth = 0;
  let objectStart = -1;
  let inString = false;
  let escaped = false;
  let objectCount = 0;

  for (let i = arrayStart + 1; i < stripped.length; i++) {
    const char = stripped[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{") {
      if (depth === 0) objectStart = i;
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0 && objectStart >= 0) {
        objectCount++;
        if (objectCount > alreadyScanned) {
          try {
            const obj = JSON.parse(stripped.substring(objectStart, i + 1));
            results.push(obj);
          } catch {
            // incomplete JSON
          }
        }
        objectStart = -1;
      }
    }
  }

  return results;
}

export async function POST(req: NextRequest) {
  let requirementSnippet: string | undefined;

  try {
    const body = await req.json();
    const parsedBody = streamBodySchema.safeParse(body);
    if (!parsedBody.success) {
      const message = parsedBody.error.issues[0]?.message ?? "Invalid request body";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { stageId } = parsedBody.data;

    const stage = await getStageForConfirmation(stageId);
    const { chat: languageModel, meta } = await requireChatModel(req);
    const requirements = {
      requirement: stage.requirement,
      userNickname: stage.userNickname ?? undefined,
      userBio: stage.userBio ?? undefined,
    };
    requirementSnippet = requirements.requirement.substring(0, 60);

    let retrievalExcerpts: string | undefined;
    if (stage.hasKnowledgeBase) {
      const { model: embeddingModel } = await requireEmbeddingModel(req);
      const sources = await retrieve(stageId, requirements.requirement, {
        embeddingModel,
      });
      const formatted = formatRetrievalExcerpts(sources).trim();
      if (formatted) {
        retrievalExcerpts = formatted;
      }
    }

    const prompts = buildOutlineGenerationPrompt({
      requirement: requirements.requirement,
      userNickname: requirements.userNickname,
      userBio: requirements.userBio,
      retrievalExcerpts,
    });

    log.info(
      `Generating outlines: stage=${stageId} "${requirements.requirement.substring(0, 50)}" [model=${meta.chatModel}]`,
    );

    // Create SSE stream with heartbeat to prevent connection timeout
    // 创建带心跳的 SSE 流，防止连接超时
    const encoder = new TextEncoder();
    const HEARTBEAT_INTERVAL_MS = 15_000;
    const stream = new ReadableStream({
      async start(controller) {
        // Heartbeat: periodically send SSE comments to keep the connection alive.
        // 心跳：定期发送 SSE 注释以保持连接活跃。
        let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
        const stopHeartbeat = () => {
          if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
          }
        };
        const startHeartbeat = () => {
          stopHeartbeat();
          heartbeatTimer = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(`:heartbeat\n\n`));
            } catch {
              stopHeartbeat();
            }
          }, HEARTBEAT_INTERVAL_MS);
        };

        const MAX_STREAM_RETRIES = 2;

        try {
          startHeartbeat();

          const streamParams = {
            model: languageModel,
            system: prompts.system,
            prompt: prompts.user,
          };

          let parsedOutlines: SceneOutline[] = [];
          let languageDirective: string | null = null;
          let lastError: string | undefined;

          for (let attempt = 1; attempt <= MAX_STREAM_RETRIES + 1; attempt++) {
            try {
              let fullText = "";
              parsedOutlines = [];
              let outlineObjectsScanned = 0;
              languageDirective = null;
              const textStream = streamLLM(streamParams, "scene-outlines-stream").textStream;

              for await (const chunk of textStream) {
                fullText += chunk;

                // Try to extract language directive early / 尝试提前提取语言指令
                if (!languageDirective) {
                  languageDirective = extractLanguageDirective(fullText);
                  if (languageDirective) {
                    const ldEvent = JSON.stringify({
                      type: "languageDirective",
                      data: languageDirective,
                    });
                    controller.enqueue(encoder.encode(`data: ${ldEvent}\n\n`));
                  }
                }

                const newRaw = extractNewOutlines(fullText, outlineObjectsScanned);
                for (const raw of newRaw) {
                  outlineObjectsScanned++;
                  const validated = parseSceneOutline(raw);
                  if (!validated) {
                    continue;
                  }
                  const enriched: SceneOutline = {
                    ...validated,
                    id: validated.id || randomUUID(),
                    order: parsedOutlines.length + 1,
                  };
                  parsedOutlines.push(enriched);

                  const event = JSON.stringify({
                    type: "outline",
                    data: enriched,
                    index: parsedOutlines.length - 1,
                  });
                  controller.enqueue(encoder.encode(`data: ${event}\n\n`));
                }
              }

              if (parsedOutlines.length > 0 && areSceneOutlinesValid(parsedOutlines)) {
                break;
              }

              if (parsedOutlines.length > 0 && !areSceneOutlinesValid(parsedOutlines)) {
                lastError = "Generated outlines failed validation";
              } else {
                lastError = fullText.trim()
                  ? "LLM response could not be parsed into outlines"
                  : "LLM returned empty response";
              }

              parsedOutlines = [];

              log.warn(
                `Outlines attempt ${attempt} diagnostics: textLen=${fullText.length}, preview=${JSON.stringify(fullText.slice(0, 240))}`,
              );

              if (attempt <= MAX_STREAM_RETRIES) {
                const retryEvent = JSON.stringify({
                  type: "retry",
                  attempt,
                  maxAttempts: MAX_STREAM_RETRIES + 1,
                });
                controller.enqueue(encoder.encode(`data: ${retryEvent}\n\n`));
              }
            } catch (error) {
              lastError = error instanceof Error ? error.message : String(error);
              log.warn(`Outlines stream error (attempt ${attempt}): ${lastError}`);

              if (attempt <= MAX_STREAM_RETRIES) {
                const retryEvent = JSON.stringify({
                  type: "retry",
                  attempt,
                  maxAttempts: MAX_STREAM_RETRIES + 1,
                });
                controller.enqueue(encoder.encode(`data: ${retryEvent}\n\n`));
                continue;
              }
            }
          }

          if (parsedOutlines.length > 0 && areSceneOutlinesValid(parsedOutlines)) {
            const doneEvent = JSON.stringify({
              type: "done",
              outlines: parsedOutlines,
              languageDirective: languageDirective || DEFAULT_LANGUAGE_DIRECTIVE,
            });
            controller.enqueue(encoder.encode(`data: ${doneEvent}\n\n`));
          } else {
            log.error(
              `Outline generation failed after ${MAX_STREAM_RETRIES + 1} attempts: ${lastError}`,
            );
            const errorEvent = JSON.stringify({
              type: "error",
              error: lastError || "Failed to generate outlines",
            });
            controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
          }
        } catch (error) {
          const errorEvent = JSON.stringify({
            type: "error",
            error: error instanceof Error ? error.message : String(error),
          });
          controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
        } finally {
          stopHeartbeat();
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    if (error instanceof StageNotFoundError) {
      return NextResponse.json({ error: "课堂不存在" }, { status: 404 });
    }
    if (error instanceof StageGenerationConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof LlmSettingsError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    log.error(
      `Outline streaming failed [requirement="${requirementSnippet ?? "unknown"}..."]:`,
      error,
    );
    return NextResponse.json({ error: "Failed to start outline stream" }, { status: 500 });
  }
}
