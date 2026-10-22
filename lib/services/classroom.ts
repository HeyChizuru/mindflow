import { prisma } from "@/lib/db/client";
import { getDocumentByStageId } from "@/lib/db/queries/documents";
import { getQuizSubmissionsByStageId } from "@/lib/db/queries/quiz";
import { getScenesByStageId } from "@/lib/db/queries/scenes";
import { getStageById } from "@/lib/db/queries/stages";
import { arraysEqual } from "@/lib/quiz/grading";
import { validateSavedScene } from "@/lib/services/scene-generation";
import { toStageResponse } from "@/lib/services/stages";
import type { ClassroomDirectoryEntry, ClassroomReadResponse, QuizSubmission } from "@/lib/types/classroom";
import type { Scene } from "@/lib/types/scene";
import { OUTLINES_STATUSES } from "@/lib/types/stage";
import { classroomIdSchema, classroomReadResponseSchema } from "@/lib/validators/classroom";
import { sceneOutlinesSchema } from "@/lib/validators/outline";
import { z } from "zod";

type ReadErrorCode = "INVALID_REQUEST" | "NOT_FOUND" | "READ_FAILED";

export class ClassroomReadError extends Error {
  readonly statusCode: 400 | 404 | 500;

  constructor(readonly code: ReadErrorCode, message: string) {
    super(message);
    this.name = "ClassroomReadError";
    this.statusCode = code === "INVALID_REQUEST" ? 400 : code === "NOT_FOUND" ? 404 : 500;
  }
}

const savedClassroomSchema = z.object({
  id: classroomIdSchema,
  outlinesStatus: z.enum(OUTLINES_STATUSES),
  outlines: z.unknown(),
  languageDirective: z.string().nullable(),
  currentSceneId: classroomIdSchema.nullable(),
  requirement: z.string().refine((value) => !!value.trim()),
});

/** Validate an existing result against the immutable saved question; never grade or save during a read. */
function validateSavedSubmission(record: QuizSubmission, scenes: Scene[], stageId: string) {
  const scene = scenes.find((candidate) => candidate.id === record.sceneId);
  if (record.stageId !== stageId || scene?.content.type !== "quiz") throw new Error("Invalid submission scene");
  const question = scene.content.questions.find((candidate) => candidate.id === record.questionId);
  if (!question || question.type !== record.answer.type) throw new Error("Invalid submission question");
  if (record.answer.type !== "short_answer") {
    if (question.type === "short_answer") throw new Error("Invalid answer type");
    const values = record.answer.type === "single" ? [record.answer.value] : record.answer.values;
    if (values.some((value) => !question.options.some((option) => option.value === value))) {
      throw new Error("Invalid submitted options");
    }
  }
  const result = record.result;
  if (result === null) return;
  if (result.type !== question.type || result.points !== question.points || result.analysis !== question.analysis) {
    throw new Error("Saved result does not match its question");
  }
  if (result.type !== "short_answer") {
    if (question.type === "short_answer" || record.answer.type === "short_answer") throw new Error("Invalid choice result");
    const values = record.answer.type === "single" ? [record.answer.value] : record.answer.values;
    if (!arraysEqual(result.correctAnswer, question.answer) || result.correct !== arraysEqual(values, question.answer)) {
      throw new Error("Invalid saved choice result");
    }
  }
}

/** One read-only snapshot, with no model configuration, generation, grading, or position writes. */
export async function getClassroom(stageId: unknown): Promise<ClassroomReadResponse> {
  const parsedId = classroomIdSchema.safeParse(stageId);
  if (!parsedId.success) throw new ClassroomReadError("INVALID_REQUEST", "课堂地址无效");
  const id = parsedId.data;
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const row = await getStageById(id, tx);
      if (!row) throw new ClassroomReadError("NOT_FOUND", "课堂不存在");
      const saved = savedClassroomSchema.parse(row);
      if (saved.id !== id) throw new Error("Invalid classroom association");
      const document = await getDocumentByStageId(id, tx);
      const stage = toStageResponse(row, document ? {
        id: document.id, filename: document.filename, storagePath: document.storagePath,
      } : undefined);
      const generationUrl = `/generation-preview/${id}`;
      if (saved.outlinesStatus === "draft") {
        if (!Array.isArray(saved.outlines) || saved.outlines.length !== 0 || saved.languageDirective !== null) {
          throw new Error("Invalid saved draft state");
        }
        return classroomReadResponseSchema.parse({ success: true, state: "draft", stage, generationUrl });
      }

      const outlines = sceneOutlinesSchema.parse(saved.outlines);
      const storedScenes = await getScenesByStageId(id, tx);
      const scenes = storedScenes.map((scene) => {
        const outline = outlines.find((candidate) => candidate.id === scene.outlineId);
        if (!outline) throw new Error("Scene is not in the confirmed outline");
        return validateSavedScene(scene, id, outline);
      });
      const directory: ClassroomDirectoryEntry[] = outlines.map((outline) => {
        const scene = scenes.find((candidate) => candidate.outlineId === outline.id);
        return { outlineId: outline.id, type: outline.type, title: outline.title,
          order: outline.order, ready: scene !== undefined, sceneId: scene?.id ?? null };
      });
      const firstScene = scenes.find((scene) => scene.outlineId === outlines[0].id);
      if (!firstScene) {
        return classroomReadResponseSchema.parse({ success: true, state: "first_scene_pending", stage, outlines, directory, generationUrl });
      }

      const answers = await getQuizSubmissionsByStageId(id, tx);
      answers.forEach((record) => validateSavedSubmission(record, scenes, id));
      const restoredScene = scenes.find((scene) => scene.id === saved.currentSceneId);
      return classroomReadResponseSchema.parse({
        success: true, state: "ready",
        classroom: {
          stage, outlines, directory, scenes, answers,
          allScenesReady: directory.every((entry) => entry.ready),
          playback: {
            savedSceneId: saved.currentSceneId, sceneId: restoredScene?.id ?? firstScene.id,
            fallbackReason: saved.currentSceneId && !restoredScene ? "saved_scene_unavailable" : null,
          },
        },
      });
    }, { isolationLevel: "RepeatableRead" });
  } catch (error) {
    if (error instanceof ClassroomReadError) throw error;
    throw new ClassroomReadError("READ_FAILED", "读取课堂内容与答题记录失败，请重试");
  }
}
