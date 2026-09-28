/**
 * 场景大纲流式 API（SSE）
 *
 * 通过服务器发送事件（SSE）流式生成大纲。
 * 从 LLM 响应中解析出单个大纲对象时立即推送，
 * 以便前端逐步显示。
 *
 * SSE events / SSE 事件:
 *   { type: 'languageDirective', data: string }
 *   { type: 'outline', data: SceneOutline, index: number }
 *   { type: 'done', outlines: SceneOutline[], languageDirective: string }
 *   { type: 'error', error: string }
 */
import { NextRequest } from 'next/server';
import { streamLLM } from '@/lib/ai/llm';
import { buildPrompt, PROMPT_IDS } from '@/lib/prompts';
import {
  formatImageDescription,
  formatImagePlaceholder,
  buildVisionUserContent,
  uniquifyMediaElementIds,
  formatTeacherPersonaForPrompt,
} from '@/lib/generation/generation-pipeline';
import type { AgentInfo } from '@/lib/generation/generation-pipeline';
import { DEFAULT_LANGUAGE_DIRECTIVE } from '@/lib/generation/outline-generator';
import { MAX_PDF_CONTENT_CHARS, MAX_VISION_IMAGES } from '@/lib/constants/generation';
import { nanoid } from 'nanoid';
import type {
  UserRequirements,
  PdfImage,
  SceneOutline,
  ImageMapping,
} from '@/lib/types/generation';
import { apiError } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { requireChatModel } from '@/lib/ai/openai-compat';
const log = createLogger('Outlines Stream');

export const maxDuration = 300;//给 Next + 部署环境看的声明

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
 * 返回新发现的对象（跳过已解析的 `alreadyParsed` 数量）。
 */
function extractNewOutlines(buffer: string, alreadyParsed: number): SceneOutline[] {
  const results: SceneOutline[] = [];

  // Strip markdown fencing if present / 如果存在则去除 markdown 围栏
  const stripped = buffer.replace(/^[\s\S]*?(?=[\[{])/, '');

  // Find the outlines array — either nested in {"outlines": [...]} or a flat array
  // 查找 outlines 数组 —— 嵌套在 {"outlines": [...]} 中，或为扁平数组
  let arrayStart = -1;
  const outlinesKeyIdx = stripped.indexOf('"outlines"');
  if (outlinesKeyIdx >= 0) {
    // Wrapper format: find [ after "outlines": / 包装格式：在 "outlines": 之后查找 [
    arrayStart = stripped.indexOf('[', outlinesKeyIdx);
  } else {
    // Flat array fallback / 扁平数组回退
    arrayStart = stripped.indexOf('[');
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
    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') {
      if (depth === 0) objectStart = i;
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0 && objectStart >= 0) {
        objectCount++;
        if (objectCount > alreadyParsed) {
          try {
            const obj = JSON.parse(stripped.substring(objectStart, i + 1));
            results.push(obj);
          } catch {
            // Incomplete or invalid JSON — skip / 不完整或无效的 JSON — 跳过
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
  let resolvedModelString: string | undefined;
  try {
    const body = await req.json();

    // Get API configuration from request headers/body / 从请求头/body 获取 API 配置
    const { chat: languageModel } = await requireChatModel(req);

    if (!body.requirements) {
      // TODO: 返回错误

    }

    const requirements = body.requirements;
    requirementSnippet = requirements?.requirement?.substring(0, 60);

    // Build user profile string for language inference context / 构建用户画像字符串，用于语言推断上下文
    const userProfileText =
      requirements.userNickname || requirements.userBio
        ? `## Student Profile\n\nStudent: ${requirements.userNickname || 'Unknown'}${requirements.userBio ? ` — ${requirements.userBio}` : ''}\n\nConsider this student's background when designing the course. Adapt difficulty, examples, and teaching approach accordingly.\n\n---`
        : '';


    // Build prompt (same logic as generateSceneOutlinesFromRequirements)
    // 构建 prompt（与 generateSceneOutlinesFromRequirements 逻辑相同）
    let availableImagesText = 'No images available';
    let visionImages: Array<{ id: string; src: string }> | undefined;

    if (pdfImages && pdfImages.length > 0) {
      if (hasVision && imageMapping) {
        // Vision mode: split into vision images (first N) and text-only (rest)
        // 视觉模式：分为视觉图片（前 N 张）和纯文本描述（其余）
        const allWithSrc = pdfImages.filter((img) => imageMapping[img.id]);
        const visionSlice = allWithSrc.slice(0, MAX_VISION_IMAGES);
        const textOnlySlice = allWithSrc.slice(MAX_VISION_IMAGES);
        const noSrcImages = pdfImages.filter((img) => !imageMapping[img.id]);

        const visionDescriptions = visionSlice.map((img) => formatImagePlaceholder(img));
        const textDescriptions = [...textOnlySlice, ...noSrcImages].map((img) =>
          formatImageDescription(img),
        );
        availableImagesText = [...visionDescriptions, ...textDescriptions].join('\n');

        visionImages = visionSlice.map((img) => ({
          id: img.id,
          src: imageMapping[img.id],
          width: img.width,
          height: img.height,
        }));
      } else {
        // Text-only mode: full descriptions / 纯文本模式：完整描述
        availableImagesText = pdfImages.map((img) => formatImageDescription(img)).join('\n');
      }
    }

    // Build media snippet conditions based on enabled flags.
    // 根据启用标志构建媒体片段条件。
    const imageGenerationEnabled = req.headers.get('x-image-generation-enabled') === 'true';
    const videoGenerationEnabled = req.headers.get('x-video-generation-enabled') === 'true';
    const mediaGenerationEnabled = imageGenerationEnabled || videoGenerationEnabled;
    const hasSourceImages = (pdfImages?.length ?? 0) > 0;

    // Build teacher context from agents (if available) / 从智能体构建教师上下文（如有）
    const teacherContext = formatTeacherPersonaForPrompt(agents);

    // Check if Interactive Mode is enabled / 检查是否启用互动模式
    const interactiveMode = requirements.interactiveMode ?? false;
    const promptId = interactiveMode
      ? PROMPT_IDS.INTERACTIVE_OUTLINES
      : PROMPT_IDS.REQUIREMENTS_TO_OUTLINES;

    const prompts = buildPrompt(promptId, {
      requirement: requirements.requirement,
      pdfContent: pdfText ? pdfText.substring(0, MAX_PDF_CONTENT_CHARS) : 'None',
      userProfile: userProfileText,
    });

    if (!prompts) {
      return apiError('INTERNAL_ERROR', 500, 'Prompt template not found');
    }

    log.info(
      `Generating outlines: "${requirements.requirement.substring(0, 50)}" [model=${modelString}]`,
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
        const stopHeartbeat = () => {
          if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
          }
        };

        const MAX_STREAM_RETRIES = 2;

        try {
          startHeartbeat();

          const streamParams = visionImages?.length
            ? {
              model: languageModel,
              system: prompts.system,
              messages: [
                {
                  role: 'user' as const,
                  content: buildVisionUserContent(prompts.user, visionImages),
                },
              ],
              maxOutputTokens: modelInfo?.outputWindow,
            }
            : {
              model: languageModel,
              system: prompts.system,
              prompt: prompts.user,
              maxOutputTokens: modelInfo?.outputWindow,
            };

          let parsedOutlines: SceneOutline[] = [];
          let languageDirective: string | null = null;
          let lastError: string | undefined;

          for (let attempt = 1; attempt <= MAX_STREAM_RETRIES + 1; attempt++) {
            try {
              let fullText = '';
              parsedOutlines = [];
              languageDirective = null;
              const textStream = streamLLM(
                streamParams,
                'scene-outlines-stream',
                thinkingConfig,
              ).textStream;

              for await (const chunk of textStream) {
                fullText += chunk;

                // Try to extract language directive early / 尝试提前提取语言指令
                if (!languageDirective) {
                  languageDirective = extractLanguageDirective(fullText);
                  if (languageDirective) {
                    const ldEvent = JSON.stringify({
                      type: 'languageDirective',
                      data: languageDirective,
                    });
                    controller.enqueue(encoder.encode(`data: ${ldEvent}\n\n`));
                  }
                }

                // Try to extract new outlines from the accumulated text
                // 尝试从累积文本中提取新大纲
                const newOutlines = extractNewOutlines(fullText, parsedOutlines.length);
                for (const outline of newOutlines) {
                  // Ensure ID and order / 确保 ID 和 order
                  const enriched = {
                    ...outline,
                    id: outline.id || nanoid(),
                    order: parsedOutlines.length + 1,
                  };
                  parsedOutlines.push(enriched);

                  const event = JSON.stringify({
                    type: 'outline',
                    data: enriched,
                    index: parsedOutlines.length - 1,
                  });
                  controller.enqueue(encoder.encode(`data: ${event}\n\n`));
                }
              }

              // Validate: got outlines? / 校验：是否获得大纲？
              if (parsedOutlines.length > 0) break;

              // Empty result — retry if we have attempts left
              // 空结果 — 如果还有重试次数则重试
              lastError = fullText.trim()
                ? 'LLM response could not be parsed into outlines'
                : 'LLM returned empty response';
              log.warn(
                `Outlines attempt ${attempt} diagnostics: textLen=${fullText.length}, outlines=${parsedOutlines.length}, languageDirective=${languageDirective ? 'yes' : 'no'}, preview=${JSON.stringify(fullText.slice(0, 240))}`,
              );

              if (attempt <= MAX_STREAM_RETRIES) {
                log.warn(
                  `Empty outlines (attempt ${attempt}/${MAX_STREAM_RETRIES + 1}), retrying...`,
                );
                // Notify client a retry is happening / 通知客户端正在重试
                const retryEvent = JSON.stringify({
                  type: 'retry',
                  attempt,
                  maxAttempts: MAX_STREAM_RETRIES + 1,
                });
                controller.enqueue(encoder.encode(`data: ${retryEvent}\n\n`));
              }
            } catch (error) {
              lastError = error instanceof Error ? error.message : String(error);
              log.warn(
                `Outlines stream error detail (attempt ${attempt}/${MAX_STREAM_RETRIES + 1}): ${lastError}`,
              );

              if (attempt <= MAX_STREAM_RETRIES) {
                log.warn(
                  `Stream error (attempt ${attempt}/${MAX_STREAM_RETRIES + 1}), retrying...`,
                  error,
                );
                const retryEvent = JSON.stringify({
                  type: 'retry',
                  attempt,
                  maxAttempts: MAX_STREAM_RETRIES + 1,
                });
                controller.enqueue(encoder.encode(`data: ${retryEvent}\n\n`));
                continue;
              }
            }
          }

          if (parsedOutlines.length > 0) {
            // Replace sequential gen_img_N/gen_vid_N with globally unique IDs (nanoid).
            // LLM placeholders are only unique per course; media store keys by elementId
            // without stageId, so reuse causes homepage thumbnail contamination.
            // 将顺序 gen_img_N/gen_vid_N 替换为全局唯一 ID（nanoid）。
            // LLM 占位 ID 仅在单课内唯一；媒体 store 按 elementId 建键且无 stageId 隔离，
            // 跨课复用会导致首页缩略图污染。
            const uniquifiedOutlines = uniquifyMediaElementIds(parsedOutlines);
            // Send done event with all outlines / 发送包含所有大纲的 done 事件
            const doneEvent = JSON.stringify({
              type: 'done',
              outlines: uniquifiedOutlines,
              languageDirective: languageDirective || DEFAULT_LANGUAGE_DIRECTIVE,
            });
            controller.enqueue(encoder.encode(`data: ${doneEvent}\n\n`));
          } else {
            // All retries exhausted, no outlines produced
            // 所有重试已用尽，未生成任何大纲
            log.error(
              `Outline generation failed after ${MAX_STREAM_RETRIES + 1} attempts: ${lastError}`,
            );
            const errorEvent = JSON.stringify({
              type: 'error',
              error: lastError || 'Failed to generate outlines',
            });
            controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
          }
        } catch (error) {
          const errorEvent = JSON.stringify({
            type: 'error',
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
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    log.error(
      `Outline streaming failed [requirement="${requirementSnippet ?? 'unknown'}...", model=${resolvedModelString ?? 'unknown'}]:`,
      error,
    );
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : String(error));
  }
}
