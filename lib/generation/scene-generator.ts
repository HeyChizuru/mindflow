/**
 * Stage 2: Scene content and action generation.
 * 第二阶段：场景内容和动作生成。
 *
 * Generates full scenes (slide/quiz/interactive/pbl with actions)
 * from scene outlines.
 * 根据场景大纲生成完整场景（带动作的幻灯片/测验/互动/PBL）。
 */

import { nanoid } from 'nanoid';
import katex from 'katex';
import { MAX_VISION_IMAGES } from '@/lib/constants/generation';
import type {
  SceneOutline,
  GeneratedSlideContent,
  GeneratedQuizContent,
  GeneratedInteractiveContent,
  GeneratedPBLContent,
  ScientificModel,
  PdfImage,
  ImageMapping,
  WidgetOutline,
} from '@/lib/types/generation';
import type { WidgetType, WidgetConfig, TeacherAction } from '@/lib/types/widgets';
import type { PromptId } from '@/lib/prompts/types';
import type { LanguageModel } from 'ai';
import type { StageStore } from '@/lib/api/stage-api';
import { createStageAPI } from '@/lib/api/stage-api';
import { generatePBLContent } from '@/lib/pbl/generate-pbl';
import { buildPrompt, PROMPT_IDS } from '@/lib/prompts';
import { DEFAULT_LANGUAGE_DIRECTIVE } from './outline-generator';
import { postProcessInteractiveHtml } from './interactive-post-processor';
import { parseActionsFromStructuredOutput } from './action-parser';
import { parseJsonResponse } from './json-repair';
import {
  buildCourseContext,
  buildLanguageText,
  formatAgentsForPrompt,
  formatTeacherPersonaForPrompt,
  formatImageDescription,
  formatImagePlaceholder,
} from './prompt-formatters';
import type { PPTElement, Slide, SlideBackground, SlideTheme } from '@/lib/types/slides';
import type { QuizQuestion } from '@/lib/types/stage';
import type {
  Action,
  SpeechAction,
  WidgetHighlightAction,
  WidgetSetStateAction,
  WidgetAnnotationAction,
  WidgetRevealAction,
} from '@/lib/types/action';
import type {
  AgentInfo,
  SceneGenerationContext,
  GeneratedSlideData,
  AICallFn,
  GenerationResult,
  GenerationCallbacks,
} from './pipeline-types';
import type { ThinkingConfig } from '@/lib/types/provider';
import { createLogger } from '@/lib/logger';
const log = createLogger('Generation');

// ── Options interfaces for scene generation functions ──
// ── 场景生成函数的选项接口定义 ──

export interface SceneContentOptions {
  assignedImages?: PdfImage[];
  imageMapping?: ImageMapping;
  languageModel?: LanguageModel;
  visionEnabled?: boolean;
  generatedMediaMapping?: ImageMapping;
  agents?: AgentInfo[];
  languageDirective?: string;
  thinkingConfig?: ThinkingConfig;
}

export interface SceneActionsOptions {
  ctx?: SceneGenerationContext;
  agents?: AgentInfo[];
  userProfile?: string;
  languageDirective?: string;
}

// ==================== Stage 2: Full Scenes (Two-Step) ====================
// ==================== 第二阶段：完整场景生成（两步法） ====================

/**
 * Stage 3: Generate full scenes (parallel version)
 * 第三阶段：生成完整场景（并行版本）
 *
 * Two steps:
 * 两步：
 * - Step 3.1: Outline -> Page content (slide/quiz)
 * - 步骤 3.1：大纲 -> 页面内容（幻灯片/测验）
 * - Step 3.2: Content + script -> Action list
 * - 步骤 3.2：内容 + 脚本 -> 动作列表
 *
 * All scenes generated in parallel using Promise.all
 * 使用 Promise.all 并行生成所有场景
 */
export async function generateFullScenes(
  sceneOutlines: SceneOutline[],
  store: StageStore,
  aiCall: AICallFn,
  callbacks?: GenerationCallbacks,
  languageDirective?: string,
): Promise<GenerationResult<string[]>> {
  const api = createStageAPI(store);
  const totalScenes = sceneOutlines.length;
  let completedCount = 0;

  callbacks?.onProgress?.({
    currentStage: 3,
    overallProgress: 66,
    stageProgress: 0,
    statusMessage: `正在并行生成 ${totalScenes} 个场景...`,
    scenesGenerated: 0,
    totalScenes,
  });

  // Generate all scenes in parallel
// 并行生成所有场景
  const results = await Promise.all(
    sceneOutlines.map(async (outline, index) => {
      try {
        const sceneId = await generateSingleScene(outline, api, aiCall, languageDirective);

        // Update progress (not atomic, but sufficient for UI display)
// 更新进度（非原子操作，但对 UI 显示已足够）
        completedCount++;
        callbacks?.onProgress?.({
          currentStage: 3,
          overallProgress: 66 + Math.floor((completedCount / totalScenes) * 34),
          stageProgress: Math.floor((completedCount / totalScenes) * 100),
          statusMessage: `已完成 ${completedCount}/${totalScenes} 个场景`,
          scenesGenerated: completedCount,
          totalScenes,
        });

        return { success: true, sceneId, index };
      } catch (error) {
        completedCount++;
        callbacks?.onError?.(`Failed to generate scene ${outline.title}: ${error}`);
        return { success: false, sceneId: null, index };
      }
    }),
  );

  // Collect successful sceneIds in original order
// 按原始顺序收集成功的 sceneId
  const sceneIds = results
    .filter(
      (r): r is { success: true; sceneId: string; index: number } =>
        r.success && r.sceneId !== null,
    )
    .sort((a, b) => a.index - b.index)
    .map((r) => r.sceneId);

  return { success: true, data: sceneIds };
}

/**
 * Generate a single scene (two-step process)
 * 生成单个场景（两步流程）
 *
 * Step 3.1: Generate content
 * 步骤 3.1：生成内容
 * Step 3.2: Generate Actions
 * 步骤 3.2：生成动作
 */
async function generateSingleScene(
  outline: SceneOutline,
  api: ReturnType<typeof createStageAPI>,
  aiCall: AICallFn,
  languageDirective?: string,
): Promise<string | null> {
  // Step 3.1: Generate content
// 步骤 3.1：生成内容
  log.info(`Step 3.1: Generating content for: ${outline.title}`);
  const content = await generateSceneContent(outline, aiCall, { languageDirective });
  if (!content) {
    log.error(`Failed to generate content for: ${outline.title}`);
    return null;
  }

  // Step 3.2: Generate Actions
// 步骤 3.2：生成动作
  log.info(`Step 3.2: Generating actions for: ${outline.title}`);
  const actions = await generateSceneActions(outline, content, aiCall, { languageDirective });
  log.info(`Generated ${actions.length} actions for: ${outline.title}`);

  // Create complete Scene
// 创建完整场景
  return createSceneWithActions(outline, content, actions, api);
}

// ==================== Backward Compatibility Helpers ====================
// ==================== 向后兼容辅助函数 ====================

/**
 * Convert legacy interactiveConfig to unified widget fields
 * 将旧版 interactiveConfig 转换为统一的组件字段
 * For backward compatibility with old classrooms
 * 用于向后兼容旧版课堂
 */
function convertInteractiveConfigToWidget(outline: SceneOutline): SceneOutline {
  const config = outline.interactiveConfig;
  if (!config) {
    log.warn(
      `Interactive outline missing both widget and interactiveConfig, falling back to simulation`,
    );
    return {
      ...outline,
      widgetType: 'simulation' as WidgetType,
      widgetOutline: { concept: outline.title },
    };
  }

  const widgetType = inferWidgetType(
    config.subject || '',
    config.conceptName,
    config.designIdea || '',
  );

  log.info(`Converting interactiveConfig to widget: ${widgetType} for "${outline.title}"`);

  return {
    ...outline,
    widgetType,
    widgetOutline: buildWidgetOutline(widgetType, config),
  };
}

/**
 * Infer widget type from concept characteristics
 * 根据概念特征推断组件类型
 */
function inferWidgetType(subject: string, concept: string, designIdea: string): WidgetType {
  const text = (subject + ' ' + concept + ' ' + designIdea).toLowerCase();

  // Rule-based inference
// 基于规则的推断
  if (
    /physics|chemistry|力学|化学|运动|反应|force|motion|equilibrium|wave|电路|circuit/.test(text)
  ) {
    return 'simulation';
  }
  if (/programming|code|algorithm|编程|算法|python|javascript|function|代码/.test(text)) {
    return 'code';
  }
  if (/process|workflow|步骤|流程|逻辑|step|flow|系统|system/.test(text)) {
    return 'diagram';
  }
  if (
    /biology|anatomy|cell|molecular|生物|细胞|分子|3d|三维|solar|planet|skeleton|organ/.test(text)
  ) {
    return 'visualization3d';
  }
  if (/game|quiz|practice|练习|游戏|puzzle|match|challenge|挑战/.test(text)) {
    return 'game';
  }

  // Default fallback
// 默认回退
  return 'simulation';
}

/**
 * Build widgetOutline from interactiveConfig for backward compatibility
 * 从 interactiveConfig 构建 widgetOutline（向后兼容）
 */
function buildWidgetOutline(
  widgetType: WidgetType,
  config: { conceptName: string; conceptOverview: string; designIdea: string },
): WidgetOutline {
  const base: WidgetOutline = { concept: config.conceptName };

  switch (widgetType) {
    case 'simulation':
      // Try to extract variables from designIdea
// 尝试从设计理念中提取变量
      const varMatch = config.designIdea.match(/variables|参数|调整|adjust|slider/i);
      return { ...base, keyVariables: varMatch ? [] : undefined };
    case 'diagram':
      return { ...base, diagramType: 'flowchart' };
    case 'code':
      return { ...base, language: 'python' };
    case 'game':
      return { ...base, gameType: 'quiz' };
    case 'visualization3d':
      return { ...base, visualizationType: 'custom', objects: [] };
    default:
      return base;
  }
}

/**
 * Step 3.1: Generate content based on outline
 * 步骤 3.1：根据大纲生成内容
 */
export async function generateSceneContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  options: SceneContentOptions = {},
): Promise<
  | GeneratedSlideContent
  | GeneratedQuizContent
  | GeneratedInteractiveContent
  | GeneratedPBLContent
  | null
> {
  const {
    assignedImages,
    imageMapping,
    languageModel,
    visionEnabled,
    generatedMediaMapping,
    agents,
    languageDirective,
    thinkingConfig,
  } = options;

  // Unified path for interactive scenes (both normal and ultra mode)
// 互动场景统一路径（普通模式和极速模式）
  if (outline.type === 'interactive') {
    // Backward compatibility: convert legacy interactiveConfig
// 向后兼容：转换旧版 interactiveConfig
    if (!outline.widgetType && outline.interactiveConfig) {
      log.info(`Converting legacy interactiveConfig for: ${outline.title}`);
      outline = convertInteractiveConfigToWidget(outline);
    }

    // If still no widgetType after conversion, fallback to simulation
// 如果转换后仍无 widgetType，回退为仿真组件
    if (!outline.widgetType) {
      log.warn(
        `Interactive outline "${outline.title}" has no widgetType, falling back to simulation`,
      );
      outline = {
        ...outline,
        widgetType: 'simulation' as WidgetType,
        widgetOutline: { concept: outline.title },
      };
    }

    // Route to widget generation (handles all 5 types)
// 路由到组件生成（处理全部 5 种类型）
    return generateWidgetContent(outline, aiCall, languageDirective);
  }

  switch (outline.type) {
    case 'slide':
      return generateSlideContent(
        outline,
        aiCall,
        assignedImages,
        imageMapping,
        visionEnabled,
        generatedMediaMapping,
        agents,
        languageDirective,
      );
    case 'quiz':
      return generateQuizContent(outline, aiCall, languageDirective);
    case 'pbl':
      return generatePBLSceneContent(outline, languageModel, languageDirective, thinkingConfig);
    default:
      return null;
  }
}

/**
 * Check if a string looks like an image ID (e.g., "img_1", "img_2")
 * rather than a base64 data URL or actual URL
 * 检查字符串是否为图片 ID（如 "img_1"、"img_2"），
 * 而非 base64 data URL 或实际 URL。
 *
 * This function distinguishes between:
 * 本函数区分：
 * - Image IDs: "img_1", "img_2", etc. → returns true
 * - 图片 ID："img_1"、"img_2" 等 → 返回 true
 * - Base64 data URLs: "data:image/..." → returns false
 * - Base64 data URL："data:image/..." → 返回 false
 * - HTTP URLs: "http://...", "https://..." → returns false
 * - HTTP URL："http://..."、"https://..." → 返回 false
 * - Relative paths: "/images/..." → returns false
 * - 相对路径："/images/..." → 返回 false
 */
function isImageIdReference(value: string): boolean {
  if (!value) return false;
  // Exclude real URLs and paths
// 排除真实 URL 和路径
  if (value.startsWith('data:')) return false;
  if (value.startsWith('http://') || value.startsWith('https://')) return false;
  if (value.startsWith('/')) return false; // Relative paths / 相对路径
  // Match image ID format: img_1, img_2, etc.
// 匹配图片 ID 格式：img_1、img_2 等
  return /^img_\d+$/i.test(value);
}

/**
 * Check if a string looks like a generated image/video ID (e.g., "gen_img_1", "gen_img_xK8f2mQ")
 * These are placeholders for AI-generated media, not PDF-extracted images.
 * 检查字符串是否为生成的图片/视频 ID（如 "gen_img_1"、"gen_img_xK8f2mQ"）。
 * 这些是 AI 生成媒体的占位符，而非从 PDF 提取的图片。
 */
function isGeneratedImageId(value: string): boolean {
  if (!value) return false;
  return /^gen_(img|vid)_[\w-]+$/i.test(value);
}

/**
 * Resolve image ID references in src field to actual base64 URLs
 * 将 src 字段中的图片 ID 引用解析为实际的 base64 URL
 *
 * AI generates: { type: "image", src: "img_1", ... }
 * AI 生成：{ type: "image", src: "img_1", ... }
 * This function replaces: { type: "image", src: "data:image/png;base64,...", ... }
 * 本函数替换为：{ type: "image", src: "data:image/png;base64,...", ... }
 *
 * Design rationale (Plan B):
 * 设计理由（方案 B）：
 * - Simpler: AI only needs to know one field (src)
 * - 更简单：AI 只需知道一个字段（src）
 * - Consistent: Generated JSON structure matches final PPTImageElement
 * - 更一致：生成的 JSON 结构与最终 PPTImageElement 匹配
 * - Intuitive: src is the image source, first as ID then as actual URL
 * - 更直观：src 是图片源，先用 ID 后替换为实际 URL
 * - Less prompt complexity: No need to explain imageId vs src distinction
 * - 更少提示词复杂度：无需解释 imageId 和 src 的区别
 */
function resolveImageIds(
  elements: GeneratedSlideData['elements'],
  imageMapping?: ImageMapping,
  generatedMediaMapping?: ImageMapping,
): GeneratedSlideData['elements'] {
  return elements
    .map((el) => {
      if (el.type === 'image') {
        if (!('src' in el)) {
          log.warn(`Image element missing src, removing element`);
          return null; // Remove invalid image elements / 移除无效图片元素
        }
        const src = el.src as string;

        // If src is an image ID reference, replace with actual URL
// 如果 src 是图片 ID 引用，替换为实际 URL
        if (isImageIdReference(src)) {
          if (!imageMapping || !imageMapping[src]) {
            log.warn(`No mapping for image ID: ${src}, removing element`);
            return null; // Remove invalid image elements / 移除无效图片元素
          }
          log.debug(`Resolved image ID "${src}" to base64 URL`);
          return { ...el, src: imageMapping[src] };
        }

        // Generated image reference — keep as placeholder for async backfill
// 生成图片引用 — 保留占位符供异步回填
        if (isGeneratedImageId(src)) {
          if (generatedMediaMapping && generatedMediaMapping[src]) {
            log.debug(`Resolved generated image ID "${src}" to URL`);
            return { ...el, src: generatedMediaMapping[src] };
          }
          // Keep element with placeholder ID — frontend renders skeleton
// 保留带占位符 ID 的元素 — 前端渲染骨架屏
          log.debug(`Keeping generated image placeholder: ${src}`);
          return el;
        }
      }

      if (el.type === 'video') {
        const mediaRef = (el as Record<string, unknown>).mediaRef;
        if (!('src' in el) && typeof mediaRef !== 'string') {
          log.warn(`Video element missing src, removing element`);
          return null;
        }
        const src = el.src as string;
        if (isGeneratedImageId(src)) {
          if (generatedMediaMapping && generatedMediaMapping[src]) {
            log.debug(`Resolved generated video ID "${src}" to URL`);
            return { ...el, src: generatedMediaMapping[src] };
          }
          // Keep element with placeholder ID — frontend renders skeleton
// 保留带占位符 ID 的元素 — 前端渲染骨架屏
          log.debug(`Keeping generated video placeholder: ${src}`);
          return el;
        }
      }

      return el;
    })
    .filter((el): el is NonNullable<typeof el> => el !== null);
}

function normalizeGeneratedVideoRefs(
  elements: GeneratedSlideData['elements'],
  generatedVideoEntries: SceneOutline['mediaGenerations'] = [],
): GeneratedSlideData['elements'] {
  const validRefs = generatedVideoEntries
    .filter((mg) => mg.type === 'video')
    .map((mg) => mg.elementId);

  const validRefSet = new Set(validRefs);
  const onlyRef = validRefs.length === 1 ? validRefs[0] : undefined;

  return elements
    .map((el) => {
      if (el.type !== 'video') return el;

      const videoEl = { ...el } as Record<string, unknown>;
      const mediaRef = typeof videoEl.mediaRef === 'string' ? videoEl.mediaRef : undefined;
      const src = typeof videoEl.src === 'string' ? videoEl.src : undefined;
      const hasGeneratedSrc = !!src && isGeneratedImageId(src);
      const hasDirectSrc = !!src && !hasGeneratedSrc;

      if (hasDirectSrc) {
        if (mediaRef) delete videoEl.mediaRef;
        return videoEl as typeof el;
      }

      if (mediaRef && validRefSet.has(mediaRef)) {
        if (hasGeneratedSrc) delete videoEl.src;
        return videoEl as typeof el;
      }

      if (src && validRefSet.has(src)) {
        videoEl.mediaRef = src;
        delete videoEl.src;
        return videoEl as typeof el;
      }

      if ((mediaRef || hasGeneratedSrc) && onlyRef) {
        log.warn(`Correcting generated video reference "${mediaRef || src}" to "${onlyRef}"`);
        videoEl.mediaRef = onlyRef;
        if (hasGeneratedSrc) delete videoEl.src;
        return videoEl as typeof el;
      }

      if (mediaRef || hasGeneratedSrc) {
        log.warn(`Invalid generated video reference "${mediaRef || src}", removing element`);
        return null;
      }

      return el;
    })
    .filter((el): el is NonNullable<typeof el> => el !== null);
}

/**
 * Fix elements with missing required fields
 * 修复缺少必填字段的元素
 * Adds default values for fields that AI might not have generated correctly
 * 为 AI 可能未正确生成的字段添加默认值
 */
function fixElementDefaults(
  elements: GeneratedSlideData['elements'],
  assignedImages?: PdfImage[],
): GeneratedSlideData['elements'] {
  return elements.map((el) => {
    // Fix line elements
// 修复线条元素
    if (el.type === 'line') {
      const lineEl = el as Record<string, unknown>;

      // Ensure points field exists with default values
// 确保 points 字段存在并具有默认值
      if (!lineEl.points || !Array.isArray(lineEl.points) || lineEl.points.length !== 2) {
        log.warn(`Line element missing points, adding defaults`);
        lineEl.points = ['', ''] as [string, string]; // Default: no markers on either end / 默认：两端无标记
      }

      // Ensure start/end exist
// 确保起点/终点存在
      if (!lineEl.start || !Array.isArray(lineEl.start)) {
        lineEl.start = [el.left ?? 0, el.top ?? 0];
      }
      if (!lineEl.end || !Array.isArray(lineEl.end)) {
        lineEl.end = [(el.left ?? 0) + (el.width ?? 100), (el.top ?? 0) + (el.height ?? 0)];
      }

      // Ensure style exists
// 确保样式存在
      if (!lineEl.style) {
        lineEl.style = 'solid';
      }

      // Ensure color exists
// 确保颜色存在
      if (!lineEl.color) {
        lineEl.color = '#333333';
      }

      return lineEl as typeof el;
    }

    // Fix text elements
// 修复文本元素
    if (el.type === 'text') {
      const textEl = el as Record<string, unknown>;

      if (!textEl.defaultFontName) {
        textEl.defaultFontName = 'Microsoft YaHei';
      }
      if (!textEl.defaultColor) {
        textEl.defaultColor = '#333333';
      }
      if (!textEl.content) {
        textEl.content = '';
      }

      return textEl as typeof el;
    }

    // Fix image elements
// 修复图片元素
    if (el.type === 'image') {
      const imageEl = el as Record<string, unknown>;

      if (imageEl.fixedRatio === undefined) {
        imageEl.fixedRatio = true;
      }

      // Correct dimensions using known aspect ratio (src is still img_id at this point)
// 使用已知宽高比校正尺寸（此时 src 仍为 img_id）
      if (assignedImages && typeof imageEl.src === 'string') {
        const imgMeta = assignedImages.find((img) => img.id === imageEl.src);
        if (imgMeta?.width && imgMeta?.height) {
          const knownRatio = imgMeta.width / imgMeta.height;
          const curW = (el.width || 400) as number;
          const curH = (el.height || 300) as number;
          if (Math.abs(curW / curH - knownRatio) / knownRatio > 0.1) {
            // Keep width, correct height
// 保持宽度，校正高度
            const newH = Math.round(curW / knownRatio);
            if (newH > 462) {
              // canvas 562.5 - margins 50×2
// 画布 562.5 - 上下边距 50×2
              const newW = Math.round(462 * knownRatio);
              imageEl.width = newW;
              imageEl.height = 462;
            } else {
              imageEl.height = newH;
            }
          }
        }
      }

      return imageEl as typeof el;
    }

    // Fix shape elements
// 修复形状元素
    if (el.type === 'shape') {
      const shapeEl = el as Record<string, unknown>;

      if (!shapeEl.viewBox) {
        shapeEl.viewBox = `0 0 ${el.width ?? 100} ${el.height ?? 100}`;
      }
      if (!shapeEl.path) {
        // Default to rectangle
// 默认回退为矩形
        const w = el.width ?? 100;
        const h = el.height ?? 100;
        shapeEl.path = `M0 0 L${w} 0 L${w} ${h} L0 ${h} Z`;
      }
      if (!shapeEl.fill) {
        shapeEl.fill = '#5b9bd5';
      }
      if (shapeEl.fixedRatio === undefined) {
        shapeEl.fixedRatio = false;
      }

      return shapeEl as typeof el;
    }

    return el;
  });
}

/**
 * Process LaTeX elements: render latex string to HTML using KaTeX.
 * 处理 LaTeX 元素：使用 KaTeX 将 LaTeX 字符串渲染为 HTML。
 * Fills in html and fixedRatio fields.
 * 填充 html 和 fixedRatio 字段。
 * Elements that fail conversion are removed.
 * 转换失败的元素将被移除。
 */
function processLatexElements(
  elements: GeneratedSlideData['elements'],
): GeneratedSlideData['elements'] {
  return elements
    .map((el) => {
      if (el.type !== 'latex') return el;

      const latexStr = el.latex as string | undefined;
      if (!latexStr) {
        log.warn('Latex element missing latex string, removing');
        return null;
      }

      try {
        const html = katex.renderToString(latexStr, {
          throwOnError: false,
          displayMode: true,
          output: 'html',
        });

        return {
          ...el,
          html,
          fixedRatio: true,
        };
      } catch (err) {
        log.warn(`Failed to render latex "${latexStr}":`, err);
        return null;
      }
    })
    .filter((el): el is NonNullable<typeof el> => el !== null);
}

/**
 * Generate slide content
 * 生成幻灯片内容
 */
async function generateSlideContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  assignedImages?: PdfImage[],
  imageMapping?: ImageMapping,
  visionEnabled?: boolean,
  generatedMediaMapping?: ImageMapping,
  agents?: AgentInfo[],
  languageDirective?: string,
): Promise<GeneratedSlideContent | null> {
  // Build assigned images description for the prompt
// 构建提示词用的已分配图片描述
  let assignedImagesText = '无可用图片，禁止插入任何 image 元素';
  let visionImages: Array<{ id: string; src: string }> | undefined;

  if (assignedImages && assignedImages.length > 0) {
    if (visionEnabled && imageMapping) {
      // Vision mode: split into vision images and text-only
// 视觉模式：分割为视觉图片和纯文本描述
      const withSrc = assignedImages.filter((img) => imageMapping[img.id]);
      const visionSlice = withSrc.slice(0, MAX_VISION_IMAGES);
      const textOnlySlice = withSrc.slice(MAX_VISION_IMAGES);
      const noSrcImages = assignedImages.filter((img) => !imageMapping[img.id]);

      const visionDescriptions = visionSlice.map((img) => formatImagePlaceholder(img));
      const textDescriptions = [...textOnlySlice, ...noSrcImages].map((img) =>
        formatImageDescription(img),
      );
      assignedImagesText = [...visionDescriptions, ...textDescriptions].join('\n');

      visionImages = visionSlice.map((img) => ({
        id: img.id,
        src: imageMapping[img.id],
        width: img.width,
        height: img.height,
      }));
    } else {
      assignedImagesText = assignedImages.map((img) => formatImageDescription(img)).join('\n');
    }
  }

  const generatedImageEntries = outline.mediaGenerations?.filter((mg) => mg.type === 'image') ?? [];
  const generatedVideoEntries = outline.mediaGenerations?.filter((mg) => mg.type === 'video') ?? [];
  const hasAssignedImages = (assignedImages?.length ?? 0) > 0;
  const generatedImageEnabled = generatedImageEntries.length > 0;
  const generatedVideoEnabled = generatedVideoEntries.length > 0;
  const imageElementEnabled = hasAssignedImages || generatedImageEnabled;
  const mediaElementEnabled = imageElementEnabled || generatedVideoEnabled;

  // Add generated media placeholders info (images + videos)
// 添加生成媒体占位符信息（图片 + 视频）
  if (outline.mediaGenerations && outline.mediaGenerations.length > 0) {
    const genImgDescs = generatedImageEntries
      .map((mg) => `- ${mg.elementId}: "${mg.prompt}" (aspect ratio: ${mg.aspectRatio || '16:9'})`)
      .join('\n');
    const genVidDescs = generatedVideoEntries
      .map((mg) => `- ${mg.elementId}: "${mg.prompt}" (aspect ratio: ${mg.aspectRatio || '16:9'})`)
      .join('\n');

    const mediaParts: string[] = [];
    if (genImgDescs) {
      mediaParts.push(`AI-Generated Images (use these IDs as image element src):\n${genImgDescs}`);
    }
    if (genVidDescs) {
      mediaParts.push(
        `AI-Generated Videos (use these IDs as video element mediaRef):\n${genVidDescs}`,
      );
    }

    if (mediaParts.length > 0) {
      const mediaText = mediaParts.join('\n\n');
      if (assignedImagesText.includes('禁止插入') || assignedImagesText.includes('No images')) {
        assignedImagesText = mediaText;
      } else {
        assignedImagesText += `\n\n${mediaText}`;
      }
    }
  }

  // Canvas dimensions (matching viewportSize and viewportRatio)
// 画布尺寸（匹配 viewportSize 和 viewportRatio）
  const canvasWidth = 1000;
  const canvasHeight = 562.5;

  const teacherContext = formatTeacherPersonaForPrompt(agents);

  const prompts = buildPrompt(PROMPT_IDS.SLIDE_CONTENT, {
    title: outline.title,
    description: outline.description,
    keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
    elements: '（根据要点自动生成）',
    assignedImages: assignedImagesText,
    canvas_width: canvasWidth,
    canvas_height: canvasHeight,
    teacherContext,
    languageDirective: languageDirective || '',
    imageElementEnabled,
    generatedImageEnabled,
    generatedVideoEnabled,
    mediaElementEnabled,
  });

  if (!prompts) {
    return null;
  }

  log.debug(`Generating slide content for: ${outline.title}`);
  if (assignedImages && assignedImages.length > 0) {
    log.debug(`Assigned images: ${assignedImages.map((img) => img.id).join(', ')}`);
  }
  if (visionImages && visionImages.length > 0) {
    log.debug(`Vision images: ${visionImages.map((img) => img.id).join(', ')}`);
  }

  const response = await aiCall(prompts.system, prompts.user, visionImages);
  const generatedData = parseJsonResponse<GeneratedSlideData>(response);

  if (!generatedData || !generatedData.elements || !Array.isArray(generatedData.elements)) {
    log.error(`Failed to parse AI response for: ${outline.title}`);
    return null;
  }

  log.debug(`Got ${generatedData.elements.length} elements for: ${outline.title}`);

  // Debug: Log image elements before resolution
// 调试：解析前记录图片元素
  const imageElements = generatedData.elements.filter((el) => el.type === 'image');
  if (imageElements.length > 0) {
    log.debug(
      `Image elements before resolution:`,
      imageElements.map((el) => ({
        type: el.type,
        src:
          (el as Record<string, unknown>).src &&
          String((el as Record<string, unknown>).src).substring(0, 50),
      })),
    );
    log.debug(`imageMapping keys:`, imageMapping ? Object.keys(imageMapping).length : '0 keys');
  }

  // Fix elements with missing required fields + aspect ratio correction (while src is still img_id)
// 修复缺少必填字段的元素 + 宽高比校正（此时 src 仍为 img_id）
  const fixedElements = fixElementDefaults(generatedData.elements, assignedImages);
  log.debug(`After element fixing: ${fixedElements.length} elements`);

  // Process LaTeX elements: render latex string → HTML via KaTeX
// 处理 LaTeX 元素：通过 KaTeX 将 LaTeX 字符串渲染为 HTML
  const latexProcessedElements = processLatexElements(fixedElements);
  log.debug(`After LaTeX processing: ${latexProcessedElements.length} elements`);

  // Resolve image_id references to actual URLs
// 将 image_id 引用解析为实际 URL
  const resolvedElements = resolveImageIds(
    latexProcessedElements,
    imageMapping,
    generatedMediaMapping,
  );
  log.debug(`After image resolution: ${resolvedElements.length} elements`);

  const videoNormalizedElements = normalizeGeneratedVideoRefs(
    resolvedElements,
    outline.mediaGenerations,
  );
  log.debug(`After video reference normalization: ${videoNormalizedElements.length} elements`);

  // Process elements, assign unique IDs
// 处理元素，分配唯一 ID
  const processedElements: PPTElement[] = videoNormalizedElements.map((el) => ({
    ...el,
    id: `${el.type}_${nanoid(8)}`,
    rotate: 0,
  })) as PPTElement[];

  // Process background
// 处理背景
  let background: SlideBackground | undefined;
  if (generatedData.background) {
    if (generatedData.background.type === 'solid' && generatedData.background.color) {
      background = { type: 'solid', color: generatedData.background.color };
    } else if (generatedData.background.type === 'gradient' && generatedData.background.gradient) {
      background = {
        type: 'gradient',
        gradient: generatedData.background.gradient,
      };
    }
  }

  return {
    elements: processedElements,
    background,
    remark: generatedData.remark || outline.description,
  };
}

/**
 * Generate quiz content
 * 生成测验内容
 */
async function generateQuizContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  languageDirective?: string,
): Promise<GeneratedQuizContent | null> {
  const quizConfig = outline.quizConfig || {
    questionCount: 3,
    difficulty: 'medium',
    questionTypes: ['single'],
  };

  const prompts = buildPrompt(PROMPT_IDS.QUIZ_CONTENT, {
    title: outline.title,
    description: outline.description,
    keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
    questionCount: quizConfig.questionCount,
    difficulty: quizConfig.difficulty,
    questionTypes: quizConfig.questionTypes.join(', '),
    languageDirective: languageDirective || '',
  });

  if (!prompts) {
    return null;
  }

  log.debug(`Generating quiz content for: ${outline.title}`);
  const response = await aiCall(prompts.system, prompts.user);
  const generatedQuestions = parseJsonResponse<QuizQuestion[]>(response);

  if (!generatedQuestions || !Array.isArray(generatedQuestions)) {
    log.error(`Failed to parse AI response for: ${outline.title}`);
    return null;
  }

  log.debug(`Got ${generatedQuestions.length} questions for: ${outline.title}`);

  // Ensure each question has an ID and normalize options format
// 确保每个问题有 ID 并规范化选项格式
  const questions: QuizQuestion[] = generatedQuestions.map((q) => {
    const isText = q.type === 'short_answer';
    return {
      ...q,
      id: q.id || `q_${nanoid(8)}`,
      options: isText ? undefined : normalizeQuizOptions(q.options),
      answer: isText ? undefined : normalizeQuizAnswer(q as unknown as Record<string, unknown>),
      hasAnswer: isText ? false : true,
    };
  });

  return { questions };
}

/**
 * Normalize quiz options from AI response.
 * 规范化 AI 响应中的测验选项。
 * AI may generate plain strings ["OptionA", "OptionB"] or QuizOption objects.
 * AI 可能生成纯字符串 ["选项A", "选项B"] 或 QuizOption 对象。
 * This normalizes to QuizOption[] format: { value: "A", label: "OptionA" }
 * 本函数规范化为 QuizOption[] 格式：{ value: "A", label: "选项A" }
 */
function normalizeQuizOptions(
  options: unknown[] | undefined,
): { value: string; label: string }[] | undefined {
  if (!options || !Array.isArray(options)) return undefined;

  return options.map((opt, index) => {
    const letter = String.fromCharCode(65 + index); // A, B, C, D... / A、B、C、D...

    if (typeof opt === 'string') {
      return { value: letter, label: opt };
    }

    if (typeof opt === 'object' && opt !== null) {
      const obj = opt as Record<string, unknown>;
      return {
        value: typeof obj.value === 'string' ? obj.value : letter,
        label: typeof obj.label === 'string' ? obj.label : String(obj.value || obj.text || letter),
      };
    }

    return { value: letter, label: String(opt) };
  });
}

/**
 * Normalize quiz answer from AI response.
 * 规范化 AI 响应中的测验答案。
 * AI may generate correctAnswer as string or string[], under various field names.
 * AI 可能在不同字段名下以字符串或字符串数组形式生成正确答案。
 * This normalizes to string[] format matching option values.
 * 本函数规范化为匹配选项值的 string[] 格式。
 */
function normalizeQuizAnswer(question: Record<string, unknown>): string[] | undefined {
  // AI might use "correctAnswer", "answer", or "correct_answer"
// AI 可能使用 "correctAnswer"、"answer" 或 "correct_answer" 字段
  const raw =
    question.answer ??
    question.correctAnswer ??
    (question as Record<string, unknown>).correct_answer;
  if (!raw) return undefined;

  if (Array.isArray(raw)) {
    return raw.map(String);
  }
  return [String(raw)];
}

/**
 * Generate PBL project content
 * 生成 PBL 项目内容
 * Uses the agentic loop from lib/pbl/generate-pbl.ts
 * 使用 lib/pbl/generate-pbl.ts 中的智能体循环
 */
async function generatePBLSceneContent(
  outline: SceneOutline,
  languageModel?: LanguageModel,
  languageDirective?: string,
  thinkingConfig?: ThinkingConfig,
): Promise<GeneratedPBLContent | null> {
  if (!languageModel) {
    log.error('LanguageModel required for PBL generation');
    return null;
  }

  const pblConfig = outline.pblConfig;
  if (!pblConfig) {
    log.error(`PBL outline "${outline.title}" missing pblConfig`);
    return null;
  }

  log.info(`Generating PBL content for: ${outline.title}`);

  try {
    const projectConfig = await generatePBLContent(
      {
        projectTopic: pblConfig.projectTopic,
        projectDescription: pblConfig.projectDescription,
        targetSkills: pblConfig.targetSkills,
        issueCount: pblConfig.issueCount,
        languageDirective: languageDirective || DEFAULT_LANGUAGE_DIRECTIVE,
      },
      languageModel,
      {
        onProgress: (msg) => log.info(`${msg}`),
      },
      thinkingConfig,
    );
    log.info(
      `PBL generated: ${projectConfig.agents.length} agents, ${projectConfig.issueboard.issues.length} issues`,
    );

    return { projectConfig };
  } catch (error) {
    log.error(`Failed:`, error);
    return null;
  }
}

/**
 * Extract HTML document from AI response.
 * 从 AI 响应中提取 HTML 文档。
 * Tries to find <!DOCTYPE html>...</html> first, then falls back to code block extraction.
 * 首先尝试查找 <!DOCTYPE html>...</html>，失败则回退到代码块提取。
 */
function extractHtml(response: string): string | null {
  // Strategy 1: Find complete HTML document
// 策略 1：查找完整 HTML 文档
  const doctypeStart = response.indexOf('<!DOCTYPE html>');
  const htmlTagStart = response.indexOf('<html');
  const start = doctypeStart !== -1 ? doctypeStart : htmlTagStart;

  if (start !== -1) {
    const htmlEnd = response.lastIndexOf('</html>');
    if (htmlEnd !== -1) {
      return response.substring(start, htmlEnd + 7);
    }
  }

  // Strategy 2: Extract from code block
// 策略 2：从代码块提取
  const codeBlockMatch = response.match(/```(?:html)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    const content = codeBlockMatch[1].trim();
    if (content.includes('<html') || content.includes('<!DOCTYPE')) {
      return content;
    }
  }

  // Strategy 3: If response itself looks like HTML
// 策略 3：如果响应本身看起来像 HTML
  const trimmed = response.trim();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    return trimmed;
  }

  log.error('Could not extract HTML from response');
  log.error('Response preview:', response.substring(0, 200));
  return null;
}

// ==================== Ultra Mode Widget Generation ====================
// ==================== 极速模式（Ultra Mode）组件生成 ====================

/**
 * Generate widget content based on widget type (Ultra Mode)
 * 根据组件类型生成组件内容（极速模式）
 */
async function generateWidgetContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  languageDirective?: string,
): Promise<GeneratedInteractiveContent | null> {
  const widgetType = outline.widgetType;
  const widgetOutline = outline.widgetOutline;

  if (!widgetType || !widgetOutline) {
    log.warn(`Interactive outline missing widget config, falling back to standard interactive`);
    return null;
  }

  // Select appropriate prompt based on widget type
// 根据组件类型选择合适的提示词
  let promptId: PromptId;
  let variables: Record<string, unknown>;

  switch (widgetType) {
    case 'simulation':
      promptId = PROMPT_IDS.SIMULATION_CONTENT;
      variables = {
        conceptName: widgetOutline.concept || outline.title,
        conceptOverview: outline.description,
        keyPoints: (outline.keyPoints || []).join('\n'),
        variables: widgetOutline.keyVariables?.join(', ') || '',
        designIdea: '',
        languageDirective: languageDirective || '',
      };
      break;

    case 'diagram':
      promptId = PROMPT_IDS.DIAGRAM_CONTENT;
      variables = {
        title: outline.title,
        diagramType: widgetOutline.diagramType || 'flowchart',
        description: outline.description,
        keyPoints: (outline.keyPoints || []).join('\n'),
        languageDirective: languageDirective || '',
      };
      break;

    case 'code':
      promptId = PROMPT_IDS.CODE_CONTENT;
      variables = {
        title: outline.title,
        programmingLanguage: widgetOutline.language || 'python',
        description: outline.description,
        keyPoints: (outline.keyPoints || []).join('\n'),
        starterCode: '',
        testCases: '', // AI generates appropriate test cases based on challenge / AI 根据挑战生成合适的测试用例
        hints: '', // AI generates progressive hints based on challenge / AI 根据挑战生成渐进式提示
        languageDirective: languageDirective || '',
      };
      break;

    case 'game':
      promptId = PROMPT_IDS.GAME_CONTENT;
      variables = {
        title: outline.title,
        gameType: widgetOutline.gameType || 'quiz',
        description: outline.description,
        keyPoints: (outline.keyPoints || []).join('\n'),
        scoring: { correctPoints: 10, speedBonus: 5 },
        languageDirective: languageDirective || '',
      };
      break;

    case 'visualization3d':
      promptId = PROMPT_IDS.VISUALIZATION3D_CONTENT;
      variables = {
        title: outline.title,
        visualizationType: widgetOutline.visualizationType || 'custom',
        description: outline.description,
        keyPoints: (outline.keyPoints || []).join('\n'),
        objects: widgetOutline.objects || [],
        interactions: widgetOutline.interactions || [],
        languageDirective: languageDirective || '',
      };
      break;

    default:
      log.warn(`Unknown widget type: ${widgetType}`);
      return null;
  }

  const prompts = buildPrompt(promptId, variables);
  if (!prompts) {
    log.error(`Failed to build ${widgetType} prompt for: ${outline.title}`);
    return null;
  }

  log.info(`Generating ${widgetType} widget for: ${outline.title}`);
  const response = await aiCall(prompts.system, prompts.user);
  const html = extractHtml(response);

  if (!html) {
    log.error(`Failed to extract HTML from ${widgetType} response for: ${outline.title}`);
    return null;
  }

  // Extract widget config from HTML if present
// 如果存在，从 HTML 中提取组件配置
  const widgetConfig = extractWidgetConfig(html);

  // Generate teacher actions
// 生成教师动作
  const teacherActions = await generateWidgetTeacherActions(
    widgetType,
    outline,
    widgetConfig,
    aiCall,
    languageDirective,
  );
  log.info(
    `[Ultra Mode] Generated ${teacherActions?.length || 0} teacher actions for "${outline.title}" (${widgetType})`,
  );
  if (teacherActions && teacherActions.length > 0) {
    log.info(
      `[Ultra Mode] Teacher actions for "${outline.title}": ${JSON.stringify(teacherActions, null, 2)}`,
    );
  }

  return {
    html: postProcessInteractiveHtml(html),
    widgetType,
    widgetConfig,
    teacherActions,
  };
}

/**
 * Extract widget config from embedded JSON in HTML
 * 从 HTML 中嵌入的 JSON 提取组件配置
 */
function extractWidgetConfig(html: string): WidgetConfig | undefined {
  const match = html.match(
    /<script type="application\/json" id="widget-config">([\s\S]*?)<\/script>/,
  );
  if (!match) return undefined;

  try {
    return JSON.parse(match[1]);
  } catch {
    return undefined;
  }
}

/**
 * Generate teacher actions for a widget
 * 为组件生成教师动作
 */
async function generateWidgetTeacherActions(
  widgetType: WidgetType,
  outline: SceneOutline,
  widgetConfig: WidgetConfig | undefined,
  aiCall: AICallFn,
  languageDirective?: string,
): Promise<TeacherAction[] | undefined> {
  const prompts = buildPrompt(PROMPT_IDS.WIDGET_TEACHER_ACTIONS, {
    widgetType,
    description: outline.description,
    keyPoints: (outline.keyPoints || []).join('\n'),
    widgetConfig: JSON.stringify(widgetConfig || {}),
    languageDirective: languageDirective || '',
  });

  if (!prompts) return undefined;

  try {
    const response = await aiCall(prompts.system, prompts.user);
    const parsed = parseJsonResponse<{ actions: TeacherAction[] }>(response);
    return parsed?.actions;
  } catch {
    return undefined;
  }
}

/**
 * Step 3.2: Generate Actions based on content and script
 * 步骤 3.2：根据内容和脚本生成动作
 */
export async function generateSceneActions(
  outline: SceneOutline,
  content:
    | GeneratedSlideContent
    | GeneratedQuizContent
    | GeneratedInteractiveContent
    | GeneratedPBLContent,
  aiCall: AICallFn,
  options: SceneActionsOptions = {},
): Promise<Action[]> {
  const { ctx, agents, userProfile, languageDirective } = options;
  const agentsText = formatAgentsForPrompt(agents);

  // Debug: Log content type and teacherActions presence for interactive scenes
// 调试：记录互动场景的内容类型和教师动作存在情况
  if (outline.type === 'interactive') {
    const hasHtml = 'html' in content;
    const teacherActionsCount = hasHtml ? content.teacherActions?.length || 0 : 0;
    log.info(
      `[Actions Gen] Interactive "${outline.title}": hasHtml=${hasHtml}, teacherActions=${teacherActionsCount}, widgetType=${hasHtml ? content.widgetType : 'N/A'}`,
    );
  }

  // Ultra Mode: If interactive content has teacherActions, convert and use them
// 极速模式：如果互动内容有 teacherActions，转换并使用它们
  // Skip normal action generation for widget-based interactive scenes
// 对基于组件的互动场景跳过常规动作生成
  if (outline.type === 'interactive' && 'html' in content && content.teacherActions?.length) {
    log.info(
      `[Ultra Mode] Converting ${content.teacherActions.length} teacherActions to Actions for: ${outline.title}`,
    );
    return convertTeacherActionsToActions(content.teacherActions);
  }

  if (outline.type === 'slide' && 'elements' in content) {
    // Format element list for AI to select from
// 格式化元素列表供 AI 选择引用
    const elementsText = formatElementsForPrompt(content.elements);

    const prompts = buildPrompt(PROMPT_IDS.SLIDE_ACTIONS, {
      title: outline.title,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      description: outline.description,
      elements: elementsText,
      courseContext: buildCourseContext(ctx),
      agents: agentsText,
      userProfile: userProfile || '',
      languageDirective: languageDirective || '',
    });

    if (!prompts) {
      return generateDefaultSlideActions(outline, content.elements);
    }

    const response = await aiCall(prompts.system, prompts.user);
    const actions = parseActionsFromStructuredOutput(response, outline.type);

    if (actions.length > 0) {
      // Validate and fill in Action IDs
// 校验并填充动作 ID
      return processActions(actions, content.elements, agents);
    }

    return generateDefaultSlideActions(outline, content.elements);
  }

  if (outline.type === 'quiz' && 'questions' in content) {
    // Format question list for AI reference
// 格式化问题列表供 AI 参考
    const questionsText = formatQuestionsForPrompt(content.questions);

    const prompts = buildPrompt(PROMPT_IDS.QUIZ_ACTIONS, {
      title: outline.title,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      description: outline.description,
      questions: questionsText,
      courseContext: buildCourseContext(ctx),
      agents: agentsText,
      languageDirective: languageDirective || '',
    });

    if (!prompts) {
      return generateDefaultQuizActions(outline);
    }

    const response = await aiCall(prompts.system, prompts.user);
    const actions = parseActionsFromStructuredOutput(response, outline.type);

    if (actions.length > 0) {
      return processActions(actions, [], agents);
    }

    return generateDefaultQuizActions(outline);
  }

  if (outline.type === 'interactive' && 'html' in content) {
    const config = outline.interactiveConfig;
    const agentsText = formatAgentsForPrompt(agents);
    const prompts = buildPrompt(PROMPT_IDS.INTERACTIVE_ACTIONS, {
      title: outline.title,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      description: outline.description,
      conceptName: config?.conceptName || outline.title,
      designIdea: config?.designIdea || '',
      courseContext: buildCourseContext(ctx),
      agents: agentsText,
      languageDirective: languageDirective || '',
    });

    if (!prompts) {
      return generateDefaultInteractiveActions(outline);
    }

    const response = await aiCall(prompts.system, prompts.user);
    const actions = parseActionsFromStructuredOutput(response, outline.type);

    if (actions.length > 0) {
      return processActions(actions, [], agents);
    }

    return generateDefaultInteractiveActions(outline);
  }

  if (outline.type === 'pbl' && 'projectConfig' in content) {
    const pblConfig = outline.pblConfig;
    const agentsText = formatAgentsForPrompt(agents);
    const prompts = buildPrompt(PROMPT_IDS.PBL_ACTIONS, {
      title: outline.title,
      keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
      description: outline.description,
      projectTopic: pblConfig?.projectTopic || outline.title,
      projectDescription: pblConfig?.projectDescription || outline.description,
      courseContext: buildCourseContext(ctx),
      agents: agentsText,
      languageDirective: languageDirective || '',
    });

    if (!prompts) {
      return generateDefaultPBLActions(outline);
    }

    const response = await aiCall(prompts.system, prompts.user);
    const actions = parseActionsFromStructuredOutput(response, outline.type);

    if (actions.length > 0) {
      return processActions(actions, [], agents);
    }

    return generateDefaultPBLActions(outline);
  }

  return [];
}

/**
 * Generate default PBL Actions (fallback)
 * 生成默认 PBL 动作（回退）
 */
function generateDefaultPBLActions(_outline: SceneOutline): Action[] {
  return [
    {
      id: `action_${nanoid(8)}`,
      type: 'speech',
      title: 'PBL 项目介绍',
      text: '现在让我们开始一个项目式学习活动。请选择你的角色，查看任务看板，开始协作完成项目。',
    },
  ];
}

/**
 * Format element list for AI to select elementId
 * 格式化元素列表供 AI 选择 elementId
 */
function formatElementsForPrompt(elements: PPTElement[]): string {
  return elements
    .map((el) => {
      let summary = '';
      if (el.type === 'text' && 'content' in el) {
        // Extract text content summary (strip HTML tags)
// 提取文本内容摘要（去除 HTML 标签）
        const textContent = ((el.content as string) || '').replace(/<[^>]*>/g, '').substring(0, 50);
        summary = `Content summary: "${textContent}${textContent.length >= 50 ? '...' : ''}"`;
      } else if (el.type === 'chart' && 'chartType' in el) {
        summary = `Chart type: ${el.chartType}`;
      } else if (el.type === 'image') {
        summary = 'Image element';
      } else if (el.type === 'shape' && 'shapeName' in el) {
        summary = `Shape: ${el.shapeName || 'unknown'}`;
      } else if (el.type === 'latex' && 'latex' in el) {
        summary = `Formula: ${((el.latex as string) || '').substring(0, 30)}`;
      } else {
        summary = `${el.type} element`;
      }
      return `- id: "${el.id}", type: "${el.type}", ${summary}`;
    })
    .join('\n');
}

/**
 * Format question list for AI reference
 * 格式化问题列表供 AI 参考
 */
function formatQuestionsForPrompt(questions: QuizQuestion[]): string {
  return questions
    .map((q, i) => {
      const optionsText = q.options
        ? `Options: ${q.options.map((o) => `${o.value}. ${o.label}`).join(', ')}`
        : '';
      return `Q${i + 1} (${q.type}): ${q.question}\n${optionsText}`;
    })
    .join('\n\n');
}

/**
 * Convert Ultra Mode teacherActions to standard Actions for playback.
 * 将极速模式的 teacherActions 转换为标准 Actions 用于播放。
 *
 * TeacherAction types: speech, highlight, annotation, reveal, setState
 * TeacherAction 类型：speech、highlight、annotation、reveal、setState
 * Action types: speech, widget_highlight, widget_setState, widget_annotation, widget_reveal
 * Action 类型：speech、widget_highlight、widget_setState、widget_annotation、widget_reveal
 *
 * Conversion strategy:
 * 转换策略：
 * - speech → single speech Action
 * - speech → 单个语音 Action
 * - highlight/setState/annotation/reveal with content → TWO Actions:
 * - 带内容的 highlight/setState/annotation/reveal → 两个 Actions：
 *   1. widget action (visual/state change) - quick, non-blocking
 *   1. 组件动作（视觉/状态变化）— 快速、非阻塞
 *   2. speech action (narration) - PlaybackEngine handles TTS
 *   2. 语音动作（旁白）— PlaybackEngine 处理 TTS
 * - highlight/setState/annotation/reveal without content → single widget action
 * - 不带内容的 highlight/setState/annotation/reveal → 单个组件动作
 */
function convertTeacherActionsToActions(teacherActions: TeacherAction[]): Action[] {
  const actions: Action[] = [];

  for (const ta of teacherActions) {
    // Always use nanoid for unique action IDs to prevent audio ID collisions
// 始终使用 nanoid 生成唯一动作 ID 以防止音频 ID 冲突
    // Ultra Mode generates sequential IDs like "action_1" which are NOT unique across scenes
// 极速模式生成顺序 ID 如 "action_1"，在跨场景时不唯一
    const actionId = `action_${nanoid(8)}`;
    const base = {
      id: actionId,
      title: ta.label || '',
    };

    switch (ta.type) {
      case 'speech':
        actions.push({
          ...base,
          type: 'speech',
          text: ta.content || '',
        } as SpeechAction);
        break;

      case 'highlight':
        // Add widget highlight action (visual, quick)
// 添加组件高亮动作（视觉、快速）
        actions.push({
          ...base,
          type: 'widget_highlight',
          target: ta.target || '',
          content: undefined, // No speech in widget action / 组件动作不包含语音
        } as WidgetHighlightAction);
        // Add speech action for narration (if content exists)
        // 添加旁白语音动作（如果有内容）
        if (ta.content) {
          actions.push({
            id: `${base.id}_speech`,
            type: 'speech',
            text: ta.content,
            title: base.title,
          } as SpeechAction);
        }
        break;

      case 'setState':
        // Add widget setState action
        // 添加组件状态设置动作
        actions.push({
          ...base,
          type: 'widget_setState',
          state: ta.state || {},
          content: undefined,
        } as WidgetSetStateAction);
        // Add speech action for narration
        // 添加旁白语音动作
        if (ta.content) {
          actions.push({
            id: `${base.id}_speech`,
            type: 'speech',
            text: ta.content,
            title: base.title,
          } as SpeechAction);
        }
        break;

      case 'annotation':
        actions.push({
          ...base,
          type: 'widget_annotation',
          target: ta.target || '',
          content: undefined,
        } as WidgetAnnotationAction);
        if (ta.content) {
          actions.push({
            id: `${base.id}_speech`,
            type: 'speech',
            text: ta.content,
            title: base.title,
          } as SpeechAction);
        }
        break;

      case 'reveal':
        actions.push({
          ...base,
          type: 'widget_reveal',
          target: ta.target || '',
          content: undefined,
        } as WidgetRevealAction);
        if (ta.content) {
          actions.push({
            id: `${base.id}_speech`,
            type: 'speech',
            text: ta.content,
            title: base.title,
          } as SpeechAction);
        }
        break;

      default:
        // Fallback to speech for unknown types
// 未知类型回退为语音动作
        actions.push({
          ...base,
          type: 'speech',
          text: ta.content || '',
        } as SpeechAction);
    }
  }

  return actions;
}

/**
 * Process and validate Actions
 * 处理和校验动作
 */
function processActions(actions: Action[], elements: PPTElement[], agents?: AgentInfo[]): Action[] {
  const elementIds = new Set(elements.map((el) => el.id));
  const agentIds = new Set(agents?.map((a) => a.id) || []);
  const studentAgents = agents?.filter((a) => a.role === 'student') || [];
  const nonTeacherAgents = agents?.filter((a) => a.role !== 'teacher') || [];

  return actions.map((action) => {
    // Ensure each action has an ID
// 确保每个动作有 ID
    const processedAction: Action = {
      ...action,
      id: action.id || `action_${nanoid(8)}`,
    };

    // Validate spotlight elementId
// 校验聚焦元素的 elementId
    if (processedAction.type === 'spotlight') {
      const spotlightAction = processedAction;
      if (!spotlightAction.elementId || !elementIds.has(spotlightAction.elementId)) {
        // If elementId is invalid, try selecting the first element
// 如果 elementId 无效，尝试选择第一个元素
        if (elements.length > 0) {
          spotlightAction.elementId = elements[0].id;
          log.warn(
            `Invalid elementId, falling back to first element: ${spotlightAction.elementId}`,
          );
        }
      }
    }

    // Validate/fill discussion agentId
// 校验/填充讨论的 agentId
    if (processedAction.type === 'discussion' && agents && agents.length > 0) {
      if (processedAction.agentId && agentIds.has(processedAction.agentId)) {
        // agentId valid — keep it
// agentId 有效 — 保留
      } else {
        // agentId missing or invalid — pick a random student, or non-teacher, or skip
// agentId 缺失或无效 — 随机选择一个学生或非教师角色，或跳过
        const pool = studentAgents.length > 0 ? studentAgents : nonTeacherAgents;
        if (pool.length > 0) {
          const picked = pool[Math.floor(Math.random() * pool.length)];
          log.warn(
            `Discussion agentId "${processedAction.agentId || '(none)'}" invalid, assigned: ${picked.id} (${picked.name})`,
          );
          processedAction.agentId = picked.id;
        }
      }
    }

    return processedAction;
  });
}

/**
 * Generate default slide Actions (fallback)
 * 生成默认幻灯片动作（回退）
 */
function generateDefaultSlideActions(outline: SceneOutline, elements: PPTElement[]): Action[] {
  const actions: Action[] = [];

  // Add spotlight for text elements
// 为文本元素添加聚焦动作
  const textElements = elements.filter((el) => el.type === 'text');
  if (textElements.length > 0) {
    actions.push({
      id: `action_${nanoid(8)}`,
      type: 'spotlight',
      title: '聚焦重点',
      elementId: textElements[0].id,
    });
  }

  // Add opening speech based on key points
// 根据要点添加开场讲解语音
  const speechText = outline.keyPoints?.length
    ? outline.keyPoints.join('。') + '。'
    : outline.description || outline.title;
  actions.push({
    id: `action_${nanoid(8)}`,
    type: 'speech',
    title: '场景讲解',
    text: speechText,
  });

  return actions;
}

/**
 * Generate default quiz Actions (fallback)
 * 生成默认测验动作（回退）
 */
function generateDefaultQuizActions(_outline: SceneOutline): Action[] {
  return [
    {
      id: `action_${nanoid(8)}`,
      type: 'speech',
      title: '测验引导',
      text: '现在让我们来做一个小测验，检验一下学习成果。',
    },
  ];
}

/**
 * Generate default interactive Actions (fallback)
 * 生成默认互动动作（回退）
 */
function generateDefaultInteractiveActions(_outline: SceneOutline): Action[] {
  return [
    {
      id: `action_${nanoid(8)}`,
      type: 'speech',
      title: '交互引导',
      text: '现在让我们通过交互式可视化来探索这个概念。请尝试操作页面中的元素，观察变化。',
    },
  ];
}

/**
 * Create a complete scene with Actions
 * 创建带动作的完整场景
 */
export function createSceneWithActions(
  outline: SceneOutline,
  content:
    | GeneratedSlideContent
    | GeneratedQuizContent
    | GeneratedInteractiveContent
    | GeneratedPBLContent,
  actions: Action[],
  api: ReturnType<typeof createStageAPI>,
): string | null {
  if (outline.type === 'slide' && 'elements' in content) {
    // Build complete Slide object
// 构建完整的 Slide 对象
    const defaultTheme: SlideTheme = {
      backgroundColor: '#ffffff',
      themeColors: ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4'],
      fontColor: '#333333',
      fontName: 'Microsoft YaHei',
      outline: { color: '#d14424', width: 2, style: 'solid' },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    };

    const slide: Slide = {
      id: nanoid(),
      viewportSize: 1000,
      viewportRatio: 0.5625,
      theme: defaultTheme,
      elements: content.elements,
      background: content.background,
    };

    const sceneResult = api.scene.create({
      type: 'slide',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'slide',
        canvas: slide,
      },
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  if (outline.type === 'quiz' && 'questions' in content) {
    const sceneResult = api.scene.create({
      type: 'quiz',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'quiz',
        questions: content.questions,
      },
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  if (outline.type === 'interactive' && 'html' in content) {
    const sceneResult = api.scene.create({
      type: 'interactive',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'interactive',
        url: '',
        html: content.html,
        // Ultra Mode widget fields
// 极速模式组件字段
        widgetType: content.widgetType,
        widgetConfig: content.widgetConfig,
        teacherActions: content.teacherActions,
      },
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  if (outline.type === 'pbl' && 'projectConfig' in content) {
    const sceneResult = api.scene.create({
      type: 'pbl',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'pbl',
        projectConfig: content.projectConfig,
      },
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  return null;
}
