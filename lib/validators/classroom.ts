import {
  CLASSROOM_ERROR_CODES, QUIZ_FAILURE_CODES, QUIZ_SUBMISSION_STATUSES,
  type ClassroomDirectoryEntry, type ClassroomErrorResponse, type ClassroomReadResponse,
  type QuizAnswer, type QuizGradeBody, type QuizGradeResponse, type QuizGradeResult,
  type QuizSubmission, type SavePlaybackPositionBody, type SavePlaybackPositionResponse,
} from "@/lib/types/classroom";
import { sceneOutlinesSchema } from "@/lib/validators/outline";
import { sceneSchema } from "@/lib/validators/scenes";
import { stageResponseSchema } from "@/lib/validators/stages";
import { z } from "zod";

const uuid = z.uuid().toLowerCase();
const nonBlank = z.string().refine((value) => !!value.trim(), "不能为空");
const timestamp = z.iso.datetime();
const version = z.number().int().positive().max(2_147_483_647);
const uniqueValues = z.array(nonBlank).min(1).refine(
  (values) => new Set(values).size === values.length, "选项不能重复",
);

export const quizQuestionKeySchema = z.strictObject({ stageId: uuid, sceneId: uuid, questionId: nonBlank });
export const quizSubmissionKeySchema = quizQuestionKeySchema.extend({ submissionId: uuid });
export const quizExecutionKeySchema = quizSubmissionKeySchema.extend({ executionId: uuid });

export const quizAnswerSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("single"), value: nonBlank }),
  z.strictObject({ type: z.literal("multiple"), values: uniqueValues }),
  z.strictObject({ type: z.literal("short_answer"), text: nonBlank }),
]) satisfies z.ZodType<QuizAnswer>;

export const quizGradeBodySchema = z.discriminatedUnion("operation", [
  quizQuestionKeySchema.extend({
    operation: z.literal("submit"), requestId: uuid, expectedVersion: version.nullable(), answer: quizAnswerSchema,
  }),
  quizSubmissionKeySchema.extend({ operation: z.literal("retry"), requestId: uuid, expectedExecutionId: uuid.nullable() }),
]) satisfies z.ZodType<QuizGradeBody>;

const resultBase = { earned: z.number().nonnegative(), points: z.number().positive(), analysis: nonBlank };
export const quizGradeResultSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...resultBase, type: z.enum(["single", "multiple"]), correct: z.boolean(), correctAnswer: uniqueValues }),
  z.strictObject({ ...resultBase, type: z.literal("short_answer"), comment: nonBlank }),
]).superRefine((result, context) => {
  if (result.earned > result.points) context.addIssue({ code: "custom", message: "得分不能超过满分" });
  if (result.type !== "short_answer") {
    if (result.earned !== (result.correct ? result.points : 0)) {
      context.addIssue({ code: "custom", message: "选择题只能完全正确得满分，否则零分" });
    }
    if (result.type === "single" && result.correctAnswer.length !== 1) {
      context.addIssue({ code: "custom", message: "单选题正确答案必须恰好一个" });
    }
  }
}) satisfies z.ZodType<QuizGradeResult>;

export const quizSubmissionSchema = quizSubmissionKeySchema.extend({
  version, answer: quizAnswerSchema, status: z.enum(QUIZ_SUBMISSION_STATUSES),
  result: quizGradeResultSchema.nullable(), failureCode: z.enum(QUIZ_FAILURE_CODES).nullable(),
  gradingRequestId: uuid.nullable(), executionId: uuid.nullable(),
  gradingStartedAt: timestamp.nullable(), gradingExpiresAt: timestamp.nullable(),
  gradedAt: timestamp.nullable(), executionExpired: z.boolean(), createdAt: timestamp, updatedAt: timestamp,
}).superRefine((record, context) => {
  const issue = (message: string) => context.addIssue({ code: "custom", message });
  const execution = [record.gradingRequestId, record.executionId, record.gradingStartedAt, record.gradingExpiresAt];
  const hasExecution = execution.every((value) => value !== null);
  if (!hasExecution && execution.some((value) => value !== null)) issue("批改执行身份和时间必须同时存在或同时为空");
  if (record.gradingStartedAt && record.gradingExpiresAt
    && Date.parse(record.gradingExpiresAt) <= Date.parse(record.gradingStartedAt)) issue("批改到期时间必须晚于开始时间");
  if (record.status === "completed") {
    if (!record.result || !record.gradedAt || record.failureCode !== null) issue("已完成记录必须有结果且没有失败状态");
    if (record.result?.type !== record.answer.type) issue("结果题型必须与本次答案一致");
  } else if (record.result !== null || record.gradedAt !== null) issue("尚未完成的记录不能包含旧结果或完成时间");
  if ((record.status === "failed") !== (record.failureCode !== null)) issue("失败原因仅属于批改失败状态");
  if (record.status === "processing" && !hasExecution) issue("批改中必须有执行身份与期限");
  if (record.status === "pending" && hasExecution) issue("待批改记录不能带有旧执行身份");
  if (record.executionExpired && record.status !== "processing") issue("只有批改中记录可标记执行过期");
  if (record.answer.type !== "short_answer" && (record.status !== "completed" || hasExecution)) {
    issue("选择题保存成功必须有最终结果且不带模型执行状态");
  }
  if (record.answer.type === "short_answer" && record.status === "completed" && !hasExecution) {
    issue("简答结果必须关联实际批改执行");
  }
}) satisfies z.ZodType<QuizSubmission>;

export const quizGradeResponseSchema = z.strictObject({
  success: z.literal(true), record: quizSubmissionSchema,
}) satisfies z.ZodType<QuizGradeResponse>;

export const classroomDirectoryEntrySchema = z.strictObject({
  outlineId: nonBlank, type: z.enum(["slide", "quiz"]), title: nonBlank,
  order: z.number().int().positive(), ready: z.boolean(), sceneId: uuid.nullable(),
}).refine((entry) => !entry.ready || entry.sceneId !== null, "就绪目录必须指向实际场景") satisfies z.ZodType<ClassroomDirectoryEntry>;

const generationUrl = z.string().regex(/^\/generation-preview\/[0-9a-f-]+$/);
export const classroomReadResponseSchema = z.discriminatedUnion("state", [
  z.strictObject({ success: z.literal(true), state: z.literal("draft"), stage: stageResponseSchema, generationUrl }),
  z.strictObject({
    success: z.literal(true), state: z.literal("first_scene_pending"), stage: stageResponseSchema,
    outlines: sceneOutlinesSchema, directory: z.array(classroomDirectoryEntrySchema).min(1), generationUrl,
  }),
  z.strictObject({
    success: z.literal(true), state: z.literal("ready"),
    classroom: z.strictObject({
      stage: stageResponseSchema, outlines: sceneOutlinesSchema,
      languageDirective: z.string().nullable(),
      directory: z.array(classroomDirectoryEntrySchema).min(1), scenes: z.array(sceneSchema).min(1),
      playback: z.strictObject({ savedSceneId: uuid.nullable(), sceneId: uuid, fallbackReason: z.literal("saved_scene_unavailable").nullable() }),
      answers: z.array(quizSubmissionSchema), allScenesReady: z.boolean(),
    }),
  }),
]).superRefine((response, context) => {
  const issue = (message: string) => context.addIssue({ code: "custom", message });
  if (response.state !== "ready" && response.generationUrl !== `/generation-preview/${response.stage.id}`) {
    issue("生成页入口必须属于当前课堂");
  }
  if (response.state === "draft") return;
  const data = response.state === "ready" ? response.classroom : response;
  if (data.directory.length !== data.outlines.length || data.directory.some((entry, index) => {
    const outline = data.outlines[index];
    return !outline || entry.outlineId !== outline.id || entry.type !== outline.type
      || entry.order !== outline.order || entry.title !== outline.title;
  })) issue("目录必须匹配完整定稿及其顺序");
  if (response.state === "first_scene_pending") {
    if (response.directory[0]?.ready) issue("首场已就绪不能返回首场未就绪");
    return;
  }
  const { stage, outlines, directory, scenes, answers, playback, allScenesReady } = response.classroom;
  const sceneIds = new Set(scenes.map((scene) => scene.id));
  if (sceneIds.size !== scenes.length || new Set(scenes.map((scene) => scene.outlineId)).size !== scenes.length) {
    issue("场景或对应大纲不能重复");
  }
  if (!directory[0]?.ready || allScenesReady !== directory.every((entry) => entry.ready)) issue("场景就绪汇总不一致");
  if (scenes.some((scene) => {
    const outline = outlines.find((item) => item.id === scene.outlineId);
    return scene.stageId !== stage.id || !outline || scene.type !== outline.type
      || scene.order !== outline.order || scene.title !== outline.title
      || !directory.some((entry) => entry.ready && entry.sceneId === scene.id && entry.outlineId === scene.outlineId);
  }) || directory.some((entry) => entry.ready && (entry.sceneId === null || !sceneIds.has(entry.sceneId)))) issue("完整场景必须与本课堂就绪目录对应");
  if (!sceneIds.has(playback.sceneId)) issue("恢复位置必须指向可播放场景");
  const savedAvailable = playback.savedSceneId !== null && sceneIds.has(playback.savedSceneId);
  if (savedAvailable ? playback.sceneId !== playback.savedSceneId || playback.fallbackReason !== null
    : playback.sceneId !== directory[0]?.sceneId
      || playback.fallbackReason !== (playback.savedSceneId ? "saved_scene_unavailable" : null)) issue("播放恢复与回退信息不一致");
  const answerKeys = answers.map((record) => `${record.sceneId}:${record.questionId}`);
  if (new Set(answerKeys).size !== answers.length || answers.some((record) => {
    const scene = scenes.find((item) => item.id === record.sceneId);
    return record.stageId !== stage.id || scene?.content.type !== "quiz"
      || !scene.content.questions.some((question) => question.id === record.questionId && question.type === record.answer.type);
  })) issue("答题记录必须属于本课堂对应测验题且不能重复");
}) satisfies z.ZodType<ClassroomReadResponse>;

export const classroomIdSchema = uuid;
export const savePlaybackPositionBodySchema = z.strictObject({ sceneId: uuid }) satisfies z.ZodType<SavePlaybackPositionBody>;
export const savePlaybackPositionResponseSchema = z.strictObject({
  success: z.literal(true), stageId: uuid, sceneId: uuid,
}) satisfies z.ZodType<SavePlaybackPositionResponse>;

export const classroomErrorResponseSchema = z.strictObject({
  success: z.literal(false), code: z.enum(CLASSROOM_ERROR_CODES), error: nonBlank,
  answerSaved: z.boolean().nullable(), submissionId: uuid.nullable(), record: quizSubmissionSchema.nullable(),
}).superRefine((response, context) => {
  if ((response.answerSaved === true && response.submissionId === null)
    || (response.record !== null && response.answerSaved === true && response.submissionId !== response.record.submissionId)
    || (response.record !== null && response.answerSaved !== true && response.submissionId === response.record.submissionId)) {
    context.addIssue({ code: "custom", message: "错误响应中的答案保存状态与恢复身份不一致" });
  }
}) satisfies z.ZodType<ClassroomErrorResponse>;
