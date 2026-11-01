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
import type { SceneOutline, SlideSceneOutline, QuizSceneOutline } from '@/lib/types/outline';
import type {
  GeneratedSlideContent,
  GeneratedQuizContent,
  SlideElement,
} from '@/lib/types/scene';
import { buildPrompt, PROMPT_IDS } from '@/lib/prompts';
import { parseActionsFromStructuredOutput } from './action-parser';
import { parseJsonResponse } from './json-repair';
import {
  buildCourseContext,
  buildGenerationInputContext,
  buildLanguageText,
  formatAgentsForPrompt,
  formatTeacherPersonaForPrompt,
} from './prompt-formatters';
import type { Action } from '@/lib/types/action';
import type {
  AgentInfo,
  SceneGenerationContext,
  GeneratedSlideData,
  AICallFn,
} from './pipeline-types';
import { generatedContentForOutlineSchema } from '@/lib/validators/scenes';
import { createLogger } from '@/lib/logger';
import { SceneGenerationError } from './scene-generation-error';
const log = createLogger('Generation');

// ── Options interfaces for scene generation functions ──
// ── 场景生成函数的选项接口定义 ──

export interface SceneContentOptions {
  agents?: AgentInfo[];
  languageDirective?: string;
  requirement?: string;
  userProfile?: string;
  ctx?: SceneGenerationContext;
  retrievalExcerpts?: string;
}

export interface SceneActionsOptions {
  ctx?: SceneGenerationContext;
  agents?: AgentInfo[];
  userProfile?: string;
  languageDirective?: string;
  requirement?: string;
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
  const { agents } = options;
  const languageDirective = buildLanguageText(options.languageDirective, outline.languageNote);
  const inputContext = buildGenerationInputContext(options);

  switch (outline.type) {
    case 'slide':
      return generateSlideContent(
        outline,
        aiCall,
        agents,
        languageDirective,
        inputContext,
      );
    case 'quiz':
      return generateQuizContent(outline, aiCall, languageDirective, inputContext);
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
          color: typeof el.color === 'string' && el.color.trim() ? el.color : '#333333',
          fixedRatio: true,
        };
      } catch (err) {
        log.warn(`Failed to render latex "${latexStr}":`, err);
        return null;
      }
    })
    .filter((el): el is NonNullable<typeof el> => el !== null);
}

const GEOMETRY_KEYS = ["left", "top", "width", "height", "rotate"] as const;

/** 把模型写成数字字符串的坐标、尺寸和端点转成数字。缺字段不补。 */
function coerceGeometryValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "" || !Number.isFinite(Number(trimmed))) return undefined;
  return Number(trimmed);
}

function coerceGeometryElement(element: Record<string, unknown>): Record<string, unknown> {
  const next = { ...element };
  for (const key of GEOMETRY_KEYS) {
    if (!(key in next)) continue;
    const coerced = coerceGeometryValue(next[key]);
    if (coerced !== undefined) next[key] = coerced;
  }
  for (const key of ["start", "end", "viewBox"] as const) {
    const value = next[key];
    if (!Array.isArray(value) || value.length !== 2) continue;
    const pair = value.map((item) => coerceGeometryValue(item));
    if (pair[0] !== undefined && pair[1] !== undefined) next[key] = pair;
  }
  return next;
}

/** 只保留字段路径和校验说明，避免把整页内容打进日志或无限塞进修正提示。 */
function formatSchemaIssues(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  const shown = error.issues.slice(0, 12);
  const lines = shown.map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`);
  const rest = error.issues.length - shown.length;
  if (rest > 0) lines.push(`另有 ${rest} 个问题`);
  return lines.join("\n");
}

/**
 * 生成一次；结构校验失败时把问题发回模型修正一次。
 * 服务端不补造缺字段。模型调用失败原样抛出；两次都不通过返回 null。
 */
async function callAndRepair<T>(
  aiCall: AICallFn,
  prompts: { system: string; user: string },
  accept: (response: string) => { ok: true; value: T } | { ok: false; issues: string },
  label: string,
): Promise<T | null> {
  const response = await aiCall(prompts.system, prompts.user);
  const first = accept(response);
  if (first.ok) return first.value;

  log.warn(`[${label}] content rejected: ${first.issues}`);
  const repaired = await aiCall(
    prompts.system,
    `${prompts.user}\n\n上一次输出未通过校验。请保持相同的顶层 JSON 结构，只修正下列问题并重新输出完整 JSON。不要解释，不要代码块。缺的必填数字请补成 JSON 数字，不要输出 image 或 video。\n\n校验问题：\n${first.issues}\n\n上次输出：\n${response}`,
  );
  const second = accept(repaired);
  if (second.ok) return second.value;
  log.warn(`[${label}] content still rejected: ${second.issues}`);
  return null;
}

/**
 * Generate slide content
 * 生成幻灯片内容
 */
async function generateSlideContent(
  outline: SlideSceneOutline,
  aiCall: AICallFn,
  agents?: AgentInfo[],
  languageDirective?: string,
  inputContext = '',
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
    inputContext,
  });

  if (!prompts) {
    return null;
  }

  log.info(`Generating slide content for: ${outline.title}`);

  return callAndRepair(aiCall, prompts, (response) => acceptSlideContent(outline, response), outline.title);
}

/** 解析并校验一页幻灯片。数字字符串会转成数字；缺字段不补，交给修正轮或拒绝。 */
function acceptSlideContent(
  outline: SlideSceneOutline,
  response: string,
): { ok: true; value: GeneratedSlideContent } | { ok: false; issues: string } {
  const generatedData = parseJsonResponse<GeneratedSlideData>(response);

  if (!generatedData || !Array.isArray(generatedData.elements)
    || generatedData.elements.some((element) => !element || typeof element !== 'object' || Array.isArray(element))) {
    return { ok: false, issues: "响应不是包含 elements 数组的 JSON" };
  }

  const elements = generatedData.elements.map((element) =>
    coerceGeometryElement(element as Record<string, unknown>),
  ) as GeneratedSlideData["elements"];
  log.info(`Got ${elements.length} elements for: ${outline.title}`);

  const fixedElements = fixElementDefaults(elements);
  log.info(`After element fixing: ${fixedElements.length} elements`);

  const latexProcessedElements = processLatexElements(fixedElements);
  log.info(`After LaTeX processing: ${latexProcessedElements.length} elements`);
  if (latexProcessedElements.length !== fixedElements.length) {
    return { ok: false, issues: "公式元素无法渲染" };
  }

  const processedElements = latexProcessedElements.map((el) => ({
    ...el,
    id: el.id == null || (typeof el.id === "string" && !el.id.trim()) ? `${el.type}_${nanoid(8)}` : el.id,
    rotate: el.rotate ?? 0,
  }));

  const result = generatedContentForOutlineSchema(outline).safeParse({
    elements: processedElements,
    background: generatedData.background,
    remark: generatedData.remark || outline.description,
  });
  return result.success ? { ok: true, value: result.data } : { ok: false, issues: formatSchemaIssues(result.error) };
}

/**
 * Generate quiz content
 * 生成测验内容
 */
async function generateQuizContent(
  outline: QuizSceneOutline,
  aiCall: AICallFn,
  languageDirective?: string,
  inputContext = '',
): Promise<GeneratedQuizContent | null> {
  const quizConfig = outline.quizConfig;

  const prompts = buildPrompt(PROMPT_IDS.QUIZ_CONTENT, {
    title: outline.title,
    description: outline.description,
    keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
    questionCount: quizConfig.questionCount,
    difficulty: quizConfig.difficulty,
    questionTypes: quizConfig.questionTypes.join(', '),
    languageDirective: languageDirective || '',
    inputContext,
  });

  if (!prompts) {
    return null;
  }

  log.info(`Generating quiz content for: ${outline.title}`);
  return callAndRepair(aiCall, prompts, (response) => acceptQuizContent(outline, response), outline.title);
}

/** 解析并校验测验题目。分值的数字字符串会转成数字；缺字段不补。 */
function acceptQuizContent(
  outline: QuizSceneOutline,
  response: string,
): { ok: true; value: GeneratedQuizContent } | { ok: false; issues: string } {
  const generatedQuestions = parseJsonResponse<unknown[]>(response);

  if (!generatedQuestions || !Array.isArray(generatedQuestions)) {
    return { ok: false, issues: "响应不是题目数组 JSON" };
  }

  log.info(`Got ${generatedQuestions.length} questions for: ${outline.title}`);

  const questions = generatedQuestions.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
    const q = raw as Record<string, unknown>;
    const isText = q.type === "short_answer";
    const question: Record<string, unknown> = {
      ...q,
      id: q.id == null || (typeof q.id === "string" && !q.id.trim()) ? `q_${nanoid(8)}` : q.id,
    };
    const points = coerceGeometryValue(q.points);
    if (points !== undefined) question.points = points;
    for (const key of ["correctAnswer", "correct_answer", "hasAnswer"]) delete question[key];
    if (isText) {
      for (const key of ["options", "answer"]) delete question[key];
      return question;
    }
    const options = normalizeQuizOptions(q.options);
    return {
      ...question,
      options,
      answer: normalizeQuizAnswer(q, options),
    };
  });

  const result = generatedContentForOutlineSchema(outline).safeParse({ questions });
  return result.success ? { ok: true, value: result.data } : { ok: false, issues: formatSchemaIssues(result.error) };
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
  options: unknown,
): { value: string; label: string }[] | undefined {
  if (!Array.isArray(options)) return undefined;

  const result: { value: string; label: string }[] = [];
  for (const [index, opt] of options.entries()) {
    const letter = String.fromCharCode(65 + index); // A, B, C, D... / A、B、C、D...

    if (typeof opt === 'string') {
      result.push({ value: letter, label: opt });
      continue;
    }

    if (typeof opt === 'object' && opt !== null && !Array.isArray(opt)) {
      const obj = opt as Record<string, unknown>;
      const value = obj.value === undefined ? letter : obj.value;
      const label = obj.label ?? obj.text;
      if (typeof value !== 'string' || typeof label !== 'string') return undefined;
      result.push({ value, label });
      continue;
    }

    return undefined;
  }
  return result;
}

/**
 * Normalize quiz answer from AI response.
 * 规范化 AI 响应中的测验答案。
 * AI may generate correctAnswer as string or string[], under various field names.
 * AI 可能在不同字段名下以字符串或字符串数组形式生成正确答案。
 * This normalizes to string[] format matching option values.
 * 本函数规范化为匹配选项值的 string[] 格式。
 */
function normalizeQuizAnswer(
  question: Record<string, unknown>,
  options: { value: string; label: string }[] | undefined,
): string[] | undefined {
  // AI might use "correctAnswer", "answer", or "correct_answer"
// AI 可能使用 "correctAnswer"、"answer" 或 "correct_answer" 字段
  const raw =
    question.answer ??
    question.correctAnswer ??
    (question as Record<string, unknown>).correct_answer;
  if (!options) return undefined;
  const answers = Array.isArray(raw) ? raw : [raw];
  const values: string[] = [];
  for (const answer of answers) {
    if (typeof answer !== 'string' || !answer.trim()) return undefined;
    if (options.some((option) => option.value === answer)) {
      values.push(answer);
      continue;
    }
    const matches = options.filter((option) => option.label === answer);
    if (matches.length !== 1) return undefined;
    values.push(matches[0].value);
  }
  return values;
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
  const { ctx, agents, userProfile } = options;
  const languageDirective = buildLanguageText(options.languageDirective, outline.languageNote);
  const inputContext = buildGenerationInputContext({ requirement: options.requirement, userProfile });
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
      throw new SceneGenerationError('加载幻灯片动作提示词失败，请重试', 502);
    }

    const response = await aiCall(prompts.system, [inputContext, prompts.user].filter(Boolean).join('\n\n'));
    const actions = parseActionsFromStructuredOutput(response, outline.type);

    return processActions(actions, content.elements);
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
      throw new SceneGenerationError('加载测验动作提示词失败，请重试', 502);
    }

    const response = await aiCall(prompts.system, [inputContext, prompts.user].filter(Boolean).join('\n\n'));
    const actions = parseActionsFromStructuredOutput(response, outline.type);

    return processActions(actions, content.questions);
  }

  throw new SceneGenerationError('动作生成内容与场景类型不一致，请重试', 502);
}

/**
 * Format element list for AI to select elementId
 * 格式化元素列表供 AI 选择 elementId
 */
function formatElementsForPrompt(elements: SlideElement[]): string {
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
function formatQuestionsForPrompt(questions: GeneratedQuizContent['questions']): string {
  return questions
    .map((q, i) => {
      const optionsText = 'options' in q
        ? `Options: ${q.options.map((o) => `${o.value}. ${o.label}`).join(', ')}`
        : '';
      return `Q${i + 1} id: "${q.id}" (${q.type}): ${q.question}\n${optionsText}\nAnalysis: ${q.analysis}\nPoints: ${q.points}`;
    })
    .join('\n\n');
}

/**
 * Process and validate Actions
 * 处理和校验动作
 */
function processActions(actions: Action[], elements: { id: string }[]): Action[] {
  const elementIds = new Set(elements.map((el) => el.id));

  return actions.map((action) => {
    // Ensure each action has an ID
// 确保每个动作有 ID
    const processedAction: Action = {
      ...action,
      id: action.id || `action_${nanoid(8)}`,
    };

    // Validate spotlight elementId
// 校验聚焦元素的 elementId
    if ((processedAction.type === 'spotlight' || processedAction.type === 'laser')
      && !elementIds.has(processedAction.elementId)) {
      throw new SceneGenerationError('动作指向不存在的本页元素，请重试', 502);
    }
    if ((processedAction.type === 'widget_highlight' || processedAction.type === 'widget_annotation')
      && !elementIds.has(processedAction.target)) {
      throw new SceneGenerationError('组件动作指向不存在的本页目标，请重试', 502);
    }

    return processedAction;
  });
}
