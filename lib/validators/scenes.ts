import type { CreateSceneInput, Scene, SlideElement } from "@/lib/types/scene";
import type { GeneratedQuizContent, GeneratedSlideContent } from "@/lib/types/scene";
import type { SceneOutline, SlideSceneOutline, QuizSceneOutline } from "@/lib/types/outline";
import { actionsSchema, generatedActionsSchema } from "@/lib/validators/actions";
import { z } from "zod";

const nonBlank = z.string().refine((value) => value.trim().length > 0, "不能为空");
const coordinateSchema = z.tuple([z.number(), z.number()]);
const elementBaseSchema = z.object({
  id: nonBlank,
  left: z.number(),
  top: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  rotate: z.number().optional(),
});

export const slideElementSchema = z.discriminatedUnion("type", [
  elementBaseSchema.extend({ type: z.literal("text"), content: nonBlank, defaultFontName: nonBlank, defaultColor: nonBlank }).catchall(z.json()),
  elementBaseSchema.extend({
    type: z.literal("shape"),
    viewBox: z.union([nonBlank, z.tuple([z.number().positive(), z.number().positive()])]),
    path: nonBlank,
    fill: nonBlank,
    fixedRatio: z.boolean(),
  }).catchall(z.json()),
  elementBaseSchema.extend({ type: z.literal("image"), src: nonBlank, fixedRatio: z.boolean() }).catchall(z.json()),
  elementBaseSchema.extend({ type: z.literal("video"), src: nonBlank }).catchall(z.json()),
  elementBaseSchema.extend({
    type: z.literal("chart"),
    chartType: nonBlank,
    data: z.record(z.string(), z.json()).refine((data) => Object.keys(data).length > 0, "图表数据不能为空"),
    themeColors: z.array(nonBlank).min(1),
  }).catchall(z.json()),
  elementBaseSchema.extend({ type: z.literal("latex"), latex: nonBlank, html: nonBlank, color: nonBlank, fixedRatio: z.boolean() }).catchall(z.json()),
  elementBaseSchema.extend({
    type: z.literal("line"),
    start: coordinateSchema,
    end: coordinateSchema,
    style: nonBlank,
    color: nonBlank,
    points: z.tuple([z.string(), z.string()]),
  }).catchall(z.json()),
]).superRefine((element, context) => {
  if (element.type === "line" ? element.width === 0 && element.height === 0 : element.width === 0 || element.height === 0) {
    context.addIssue({ code: "custom", message: "元素尺寸无效" });
  }
}) satisfies z.ZodType<SlideElement>;

const elementsSchema = z.array(slideElementSchema).min(1).refine(
  (elements) => new Set(elements.map((element) => element.id)).size === elements.length,
  "元素 ID 不能重复",
);

export const slideBackgroundSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("solid"), color: nonBlank }).catchall(z.json()),
  z.object({
    type: z.literal("gradient"),
    gradient: z.object({
      type: z.enum(["linear", "radial"]),
      colors: z.array(z.object({ pos: z.number().min(0).max(100), color: nonBlank })).min(2),
      rotate: z.number(),
    }).catchall(z.json()),
  }).catchall(z.json()),
]);

export const generatedSlideContentSchema = z.object({
  elements: elementsSchema,
  background: slideBackgroundSchema.optional(),
  remark: z.string().optional(),
}).catchall(z.json());

export const slideCanvasSchema = z.object({
  id: nonBlank,
  viewportSize: z.number().positive(),
  viewportRatio: z.number().positive(),
  theme: z.object({
    backgroundColor: nonBlank,
    themeColors: z.array(nonBlank).min(1),
    fontColor: nonBlank,
    fontName: nonBlank,
    outline: z.object({ color: nonBlank, width: z.number().nonnegative(), style: nonBlank }).catchall(z.json()).optional(),
    shadow: z.object({ h: z.number(), v: z.number(), blur: z.number().nonnegative(), color: nonBlank }).catchall(z.json()).optional(),
  }).catchall(z.json()),
  elements: elementsSchema,
  background: slideBackgroundSchema.optional(),
}).catchall(z.json());

const questionBaseSchema = z.object({
  id: nonBlank,
  question: nonBlank,
  analysis: nonBlank,
  points: z.number().positive(),
});

const choiceQuestionSchema = questionBaseSchema.extend({
  type: z.enum(["single", "multiple"]),
  options: z.array(z.object({ value: nonBlank, label: nonBlank }).catchall(z.json())).min(2),
  answer: z.array(nonBlank).min(1),
}).catchall(z.json());

export const quizQuestionSchema = z.discriminatedUnion("type", [
  choiceQuestionSchema,
  questionBaseSchema.extend({ type: z.literal("short_answer"), commentPrompt: nonBlank }).catchall(z.json()),
]).superRefine((question, context) => {
  if (question.type === "short_answer") return;
  const optionValues = new Set(question.options.map((option) => option.value));
  if (optionValues.size !== question.options.length || new Set(question.answer).size !== question.answer.length) {
    context.addIssue({ code: "custom", message: "测验选项或答案不能重复" });
  }
  if (question.answer.some((answer) => !optionValues.has(answer))) {
    context.addIssue({ code: "custom", message: "测验答案必须引用有效选项" });
  }
  if (question.type === "single" ? question.answer.length !== 1 : question.answer.length < 2) {
    context.addIssue({ code: "custom", message: "正确答案数量不符合题型" });
  }
});

export const generatedQuizContentSchema = z.object({
  questions: z.array(quizQuestionSchema).min(1).refine(
    (questions) => new Set(questions.map((question) => question.id)).size === questions.length,
    "题目 ID 不能重复",
  ),
}).catchall(z.json());

/** Validate generation output against the caller's confirmed target. No media sources are supplied by these requests. */
export function generatedContentForOutlineSchema(outline: SlideSceneOutline): z.ZodType<GeneratedSlideContent>;
export function generatedContentForOutlineSchema(outline: QuizSceneOutline): z.ZodType<GeneratedQuizContent>;
export function generatedContentForOutlineSchema(outline: SceneOutline): z.ZodType<GeneratedSlideContent | GeneratedQuizContent>;
export function generatedContentForOutlineSchema(outline: SceneOutline): z.ZodType<GeneratedSlideContent | GeneratedQuizContent> {
  if (outline.type === "slide") {
    return generatedSlideContentSchema.superRefine((content, context) => {
      content.elements.forEach((element, index) => {
        if (element.type === "image" || element.type === "video") {
          context.addIssue({ code: "custom", path: ["elements", index], message: "生成请求未提供可用媒体来源" });
        }
      });
    });
  }
  return generatedQuizContentSchema.superRefine((content, context) => {
    if (content.questions.length !== outline.quizConfig.questionCount) {
      context.addIssue({ code: "custom", path: ["questions"], message: "题目数量与定稿配置不一致" });
    }
    content.questions.forEach((question, index) => {
      if (!outline.quizConfig.questionTypes.includes(question.type)) {
        context.addIssue({ code: "custom", path: ["questions", index, "type"], message: "题型不在定稿允许范围内" });
      }
    });
  });
}

export const sceneContentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("slide"), canvas: slideCanvasSchema }).catchall(z.json()),
  generatedQuizContentSchema.extend({ type: z.literal("quiz") }),
]);

const sceneBaseSchema = z.object({
  stageId: z.uuid(),
  outlineId: nonBlank,
  type: z.enum(["slide", "quiz"]),
  title: nonBlank,
  order: z.number().int().positive(),
  content: sceneContentSchema,
  actions: actionsSchema,
});

// 结构字段之外，还要检查动作引用的目标属于当前场景。
function validateScene(scene: z.infer<typeof sceneBaseSchema>, context: z.RefinementCtx) {
  if (scene.type !== scene.content.type) {
    context.addIssue({ code: "custom", path: ["content"], message: "场景与内容类型不一致" });
  }
  const targetIds = new Set(scene.content.type === "slide"
    ? scene.content.canvas.elements.map((element) => element.id)
    : scene.content.questions.map((question) => question.id));
  scene.actions.forEach((action, index) => {
    if (action.type === "spotlight" || action.type === "laser") {
      if (scene.content.type !== "slide" || !targetIds.has(action.elementId)) {
        context.addIssue({ code: "custom", path: ["actions", index, "elementId"], message: "动作必须指向本页元素" });
      }
    }
    if ((action.type === "widget_highlight" || action.type === "widget_annotation") && !targetIds.has(action.target)) {
      context.addIssue({ code: "custom", path: ["actions", index, "target"], message: "组件动作目标不存在" });
    }
  });
}

export const createSceneSchema = sceneBaseSchema.extend({ actions: generatedActionsSchema })
  .superRefine(validateScene) satisfies z.ZodType<CreateSceneInput>;

export const sceneSchema = sceneBaseSchema.extend({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).superRefine(validateScene) satisfies z.ZodType<Scene>;
