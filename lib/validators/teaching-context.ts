import { z } from "zod";
import { QUIZ_SUBMISSION_STATUSES } from "@/lib/types/classroom";
import type { TeachingContext, TeachingContextTarget, TeachingSubmission } from "@/lib/types/teaching-context";
import { quizAnswerSchema, quizGradeResultSchema } from "@/lib/validators/classroom";

const uuid = z.uuid().toLowerCase();
const nonBlank = z.string().refine((value) => !!value.trim(), "不能为空");
const order = z.number().int().positive();

export const teachingContextTargetSchema = z.union([
  z.strictObject({ stageId: uuid, sceneId: uuid }),
  z.strictObject({ stageId: uuid, outlineId: nonBlank }),
]) satisfies z.ZodType<TeachingContextTarget>;

export const teachingChartDataSchema = z.object({
  labels: z.array(z.string()), legends: z.array(z.string()), series: z.array(z.array(z.number())),
});

const elementIdentity = { id: nonBlank };
const element = z.discriminatedUnion("type", [
  z.strictObject({ ...elementIdentity, type: z.literal("text"), text: z.string() }),
  z.strictObject({ ...elementIdentity, type: z.literal("latex"), latex: z.string() }),
  z.strictObject({ ...elementIdentity, type: z.literal("shape"), text: z.string().optional() }),
  z.strictObject({ ...elementIdentity, type: z.enum(["image", "video", "line"]) }),
  z.strictObject({ ...elementIdentity, type: z.literal("chart"), chartType: nonBlank, data: teachingChartDataSchema.nullable() }),
]);

const submission = z.strictObject({
  status: z.enum(QUIZ_SUBMISSION_STATUSES), answer: quizAnswerSchema, result: quizGradeResultSchema.nullable(),
}).superRefine((record, context) => {
  if ((record.status === "completed") !== (record.result !== null)) {
    context.addIssue({ code: "custom", message: "仅已完成的提交可以提供正式反馈" });
  }
  if (record.result && record.result.type !== record.answer.type) {
    context.addIssue({ code: "custom", message: "提交与反馈题型不一致" });
  }
}) satisfies z.ZodType<TeachingSubmission>;

const questionBase = { id: nonBlank, question: nonBlank, points: z.number().positive(), submission: submission.nullable() };
const question = z.discriminatedUnion("type", [
  z.strictObject({ ...questionBase, type: z.enum(["single", "multiple"]), options: z.array(z.strictObject({ value: nonBlank, label: nonBlank })).min(2) }),
  z.strictObject({ ...questionBase, type: z.literal("short_answer") }),
]).superRefine((value, context) => {
  if (value.submission && value.submission.answer.type !== value.type) {
    context.addIssue({ code: "custom", message: "提交不属于该题型" });
  }
});

const sceneIdentity = { id: uuid, outlineId: nonBlank, title: nonBlank, order };
export const teachingContextSchema = z.strictObject({
  course: z.strictObject({
    id: uuid, name: z.string(),
    requirements: z.strictObject({ requirement: nonBlank, userNickname: nonBlank.optional(), userBio: nonBlank.optional() }),
    languageDirective: z.string().nullable(), hasKnowledgeBase: z.boolean(),
    outlines: z.array(z.strictObject({
      id: nonBlank, type: z.enum(["slide", "quiz"]), title: nonBlank, description: z.string(),
      keyPoints: z.array(z.string()), order, ready: z.boolean(), sceneId: uuid.nullable(),
    })).min(1),
  }),
  scene: z.discriminatedUnion("type", [
    z.strictObject({ ...sceneIdentity, type: z.literal("slide"), elements: z.array(element), speech: z.array(nonBlank) }),
    z.strictObject({ ...sceneIdentity, type: z.literal("quiz"), questions: z.array(question).min(1) }),
  ]),
}) satisfies z.ZodType<TeachingContext>;
