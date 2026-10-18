/**
 * Stage 2: Scene content and action generation.
 * 第二阶段：场景内容和动作生成。
 *
 * Generates full scenes (slide/quiz with actions)
 * from scene outlines.
 * 根据场景大纲生成完整场景（带动作的幻灯片/测验）。
 */

import { nanoid } from 'nanoid';
import katex from 'katex';
import type {
  SceneOutline,
  GeneratedSlideContent,
  GeneratedQuizContent,
} from '@/lib/types/generation';
import type { TeacherAction } from '@/lib/types/widgets';
import type { StageStore } from '@/lib/api/stage-api';
import { createStageAPI } from '@/lib/api/stage-api';
import { buildPrompt, PROMPT_IDS } from '@/lib/prompts';
import { parseActionsFromStructuredOutput } from './action-parser';
import { parseJsonResponse } from './json-repair';
import {
  buildCourseContext,
  buildLanguageText,
  formatAgentsForPrompt,
  formatTeacherPersonaForPrompt,
} from './prompt-formatters';
import type { PPTElement, Slide, SlideBackground, SlideTheme } from '@/lib/types/slides';
import type { QuizQuestion } from '@/lib/types/stage';
import type {
  Action,
  SpeechAction,
  WidgetHighlightAction,
  WidgetSetStateAction,
  WidgetAnnotationAction,
} from '@/lib/types/action';
import type {
  AgentInfo,
  SceneGenerationContext,
  GeneratedSlideData,
  AICallFn,
  GenerationResult,
  GenerationCallbacks,
} from './pipeline-types';
import { createLogger } from '@/lib/logger';
const log = createLogger('Generation');

// ── Options interfaces for scene generation functions ──
// ── 场景生成函数的选项接口定义 ──

export interface SceneContentOptions {
  agents?: AgentInfo[];
  languageDirective?: string;
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
  | null
> {
  const {
    agents,
    languageDirective,
  } = options;

  switch (outline.type) {
    case 'slide':
      return generateSlideContent(
        outline,
        aiCall,
        agents,
        languageDirective,
      );
    case 'quiz':
      return generateQuizContent(outline, aiCall, languageDirective);
    default:
      return null;
  }
}

/**
 * Fix elements with missing required fields
 * 修复缺少必填字段的元素
 * Adds default values for fields that AI might not have generated correctly
 * 为 AI 可能未正确生成的字段添加默认值
 */
function fixElementDefaults(
  elements: GeneratedSlideData['elements'],
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
  agents?: AgentInfo[],
  languageDirective?: string,
): Promise<GeneratedSlideContent | null> {


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
    canvas_width: canvasWidth,
    canvas_height: canvasHeight,
    teacherContext,
    languageDirective: languageDirective || '',
  });

  if (!prompts) {
    return null;
  }

  log.debug(`Generating slide content for: ${outline.title}`);

  const response = await aiCall(prompts.system, prompts.user);
  const generatedData = parseJsonResponse<GeneratedSlideData>(response);

  if (!generatedData || !generatedData.elements || !Array.isArray(generatedData.elements)) {
    log.error(`Failed to parse AI response for: ${outline.title}`);
    return null;
  }

  log.debug(`Got ${generatedData.elements.length} elements for: ${outline.title}`);

  const fixedElements = fixElementDefaults(generatedData.elements);
  log.debug(`After element fixing: ${fixedElements.length} elements`);

  // Process LaTeX elements: render latex string → HTML via KaTeX
// 处理 LaTeX 元素：通过 KaTeX 将 LaTeX 字符串渲染为 HTML
  const latexProcessedElements = processLatexElements(fixedElements);
  log.debug(`After LaTeX processing: ${latexProcessedElements.length} elements`);


  // Process elements, assign unique IDs
// 处理元素，分配唯一 ID
  const processedElements: PPTElement[] = latexProcessedElements.map((el) => ({
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
 * Step 3.2: Generate Actions based on content and script
 * 步骤 3.2：根据内容和脚本生成动作
 */
export async function generateSceneActions(
  outline: SceneOutline,
  content:
    | GeneratedSlideContent
    | GeneratedQuizContent,
  aiCall: AICallFn,
  options: SceneActionsOptions = {},
): Promise<Action[]> {
  const { ctx, agents, userProfile, languageDirective } = options;
  const agentsText = formatAgentsForPrompt(agents);

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

  return [];
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
 * TeacherAction types: speech, highlight, annotation, setState
 * TeacherAction 类型：speech、highlight、annotation、setState
 * Action types: speech, widget_highlight, widget_setState, widget_annotation
 * Action 类型：speech、widget_highlight、widget_setState、widget_annotation
 *
 * Conversion strategy:
 * 转换策略：
 * - speech → single speech Action
 * - speech → 单个语音 Action
 * - highlight/setState/annotation with content → TWO Actions:
 * - 带内容的 highlight/setState/annotation → 两个 Actions：
 *   1. widget action (visual/state change) - quick, non-blocking
 *   1. 组件动作（视觉/状态变化）— 快速、非阻塞
 *   2. speech action (narration)
 *   2. 语音动作（旁白）— PlaybackEngine 处理 TTS
 * - highlight/setState/annotation without content → single widget action
 * - 不带内容的 highlight/setState/annotation → 单个组件动作
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
 * Create a complete scene with Actions
 * 创建带动作的完整场景
 */
export function createSceneWithActions(
  outline: SceneOutline,
  content:
    | GeneratedSlideContent
    | GeneratedQuizContent,
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

  return null;
}
