/**
 * Scene Content Generation API
 * 场景内容生成 API
 *
 * Generates scene content (slides/quiz/interactive/pbl) from an outline.
 * 根据场景大纲生成场景内容（幻灯片/测验/互动/PBL）。
 * This is the first half of the two-step scene generation pipeline.
 * 这是两步式场景生成流水线的第一阶段。
 * Does NOT generate actions — use /api/generate/scene-actions for that.
 * 不生成动作（actions）——动作生成请使用 /api/generate/scene-actions。
 */

import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import {
  applyOutlineFallbacks,
  generateSceneContent,
  buildVisionUserContent,
} from '@/lib/generation/generation-pipeline';
import type { AgentInfo } from '@/lib/generation/generation-pipeline';
import type { SceneOutline, PdfImage, ImageMapping } from '@/lib/types/generation';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';

const log = createLogger('Scene Content API');

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  // 1. 解析 body
  // 2. resolveModelFromRequest → 拿到 LLM 实例
  // 3. applyOutlineFallbacks → 无效 interactive/pbl 降级为 slide
  // 4. 按 suggestedImageIds 筛选 assignedImages
  // 5. generateSceneContent(effectiveOutline, aiCall, options)
  // 6. return { content, effectiveOutline }
  let outlineTitle: string | undefined;
  let resolvedModelString: string | undefined;
  try {
    const body = await req.json();
    const {
      outline: rawOutline,
      allOutlines,
      pdfImages,
      imageMapping,
      stageInfo: _stageInfo,
      stageId,
      agents,
      languageDirective,
    } = body as {
      outline: SceneOutline;
      allOutlines: SceneOutline[];
      pdfImages?: PdfImage[];
      imageMapping?: ImageMapping;
      stageInfo: {
        name: string;
        description?: string;
        style?: string;
      };
      stageId: string;
      agents?: AgentInfo[];
      languageDirective?: string;
    };

    // Validate required fields
    // 校验必填字段
    if (!rawOutline) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'outline is required');
    }
    if (!allOutlines || allOutlines.length === 0) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'allOutlines is required and must not be empty',
      );
    }
    if (!stageId) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'stageId is required');
    }

    const outline: SceneOutline = { ...rawOutline };

    // ── Model resolution from request headers/body ──
    // ── 从请求头/请求体解析模型配置 ──
    const {
      model: languageModel,
      modelInfo,
      modelString,
      thinkingConfig,
    } = await resolveModelFromRequest(req, body);
    outlineTitle = rawOutline?.title;
    resolvedModelString = modelString;

    // Detect vision capability
    // 检测模型是否支持视觉能力
    const hasVision = !!modelInfo?.capabilities?.vision;

    // Vision-aware AI call function
    // 支持视觉输入的 AI 调用函数
    const aiCall = async (
      systemPrompt: string,
      userPrompt: string,
      images?: Array<{ id: string; src: string }>,
    ): Promise<string> => {
      if (images?.length && hasVision) {
        const result = await callLLM(
          {
            model: languageModel,
            system: systemPrompt,
            messages: [
              {
                role: 'user' as const,
                content: buildVisionUserContent(userPrompt, images),
              },
            ],
            maxOutputTokens: modelInfo?.outputWindow,
          },
          'scene-content',
          undefined,
          thinkingConfig,
        );
        return result.text;
      }
      const result = await callLLM(
        {
          model: languageModel,
          system: systemPrompt,
          prompt: userPrompt,
          maxOutputTokens: modelInfo?.outputWindow,
        },
        'scene-content',
        undefined,
        thinkingConfig,
      );
      return result.text;
    };

    // ── Apply fallbacks ──
    // ── 应用回退/兜底策略 ──
    const effectiveOutline = applyOutlineFallbacks(outline, !!languageModel);

    // ── Filter images assigned to this outline ──
    // ── 筛选分配给当前大纲的图片 ──
    let assignedImages: PdfImage[] | undefined;
    if (
      pdfImages &&
      pdfImages.length > 0 &&
      effectiveOutline.suggestedImageIds &&
      effectiveOutline.suggestedImageIds.length > 0
    ) {
      const suggestedIds = new Set(effectiveOutline.suggestedImageIds);
      assignedImages = pdfImages.filter((img) => suggestedIds.has(img.id));
    }

    // ── Media generation is handled client-side in parallel (media-orchestrator.ts) ──
    // ── 媒体生成由客户端并行处理（media-orchestrator.ts） ──
    // The content generator receives placeholder IDs (gen_img_1, gen_vid_1) as-is.
    // 内容生成器会原样接收占位符 ID（gen_img_1, gen_vid_1）。
    // resolveImageIds() in generation-pipeline.ts will keep these placeholders in elements.
    // generation-pipeline.ts 中的 resolveImageIds() 会保留元素中的这些占位符。
    const generatedMediaMapping: ImageMapping = {};

    // ── Generate content ──
    // ── 生成内容 ──
    log.info(
      `Generating content: "${effectiveOutline.title}" (${effectiveOutline.type}) [model=${modelString}]`,
    );

    const content = await generateSceneContent(effectiveOutline, aiCall, {
      assignedImages,
      imageMapping,
      languageModel: effectiveOutline.type === 'pbl' ? languageModel : undefined,
      visionEnabled: hasVision,
      generatedMediaMapping,
      agents,
      languageDirective,
      thinkingConfig,
    });

    if (!content) {
      log.error(`Failed to generate content for: "${effectiveOutline.title}"`);

      return apiError(
        'GENERATION_FAILED',
        500,
        `Failed to generate content: ${effectiveOutline.title}`,
      );
    }

    log.info(`Content generated successfully: "${effectiveOutline.title}"`);

    return apiSuccess({ content, effectiveOutline });
  } catch (error) {
    log.error(
      `Scene content generation failed [scene="${outlineTitle ?? 'unknown'}", model=${resolvedModelString ?? 'unknown'}]:`,
      error,
    );
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : String(error));
  }
}
