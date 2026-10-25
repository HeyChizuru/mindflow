import "server-only";
import { z } from "zod";
import { ClassroomError, getClassroom, validateSavedSubmission } from "@/lib/services/classroom";
import type { ClassroomReadResponse, QuizSubmission } from "@/lib/types/classroom";
import type { SlideElement } from "@/lib/types/scene";
import type { TeachingContext, TeachingQuestion, TeachingSlideElement, TeachingSubmission } from "@/lib/types/teaching-context";
import { classroomReadResponseSchema } from "@/lib/validators/classroom";
import { teachingChartDataSchema, teachingContextSchema, teachingContextTargetSchema } from "@/lib/validators/teaching-context";

type ReadyClassroom = Extract<ClassroomReadResponse, { state: "ready" }>["classroom"];
const shapeTextSchema = z.object({ text: z.object({ content: z.string() }) });

function projectElement(element: SlideElement): TeachingSlideElement {
  const { id } = element;
  switch (element.type) {
    case "text": return { id, type: "text", text: element.content };
    case "latex": return { id, type: "latex", latex: element.latex };
    case "chart": {
      const data = teachingChartDataSchema.safeParse(element.data);
      return { id, type: "chart", chartType: element.chartType, data: data.success ? data.data : null };
    }
    case "shape": {
      const text = shapeTextSchema.safeParse(element);
      return { id, type: "shape", ...(text.success ? { text: text.data.text.content } : {}) };
    }
    default: return { id, type: element.type };
  }
}

function projectSubmission(record: QuizSubmission): TeachingSubmission {
  const answer = record.answer.type === "short_answer" ? { type: record.answer.type, text: record.answer.text }
    : record.answer.type === "single" ? { type: record.answer.type, value: record.answer.value }
      : { type: record.answer.type, values: [...record.answer.values] };
  const result = record.status === "completed" ? record.result : null;
  let feedback: TeachingSubmission["result"] = null;
  if (result) {
    const common = { earned: result.earned, points: result.points, analysis: result.analysis };
    feedback = result.type === "short_answer" ? { ...common, type: result.type, comment: result.comment }
      : { ...common, type: result.type, correct: result.correct, correctAnswer: [...result.correctAnswer] };
  }
  return {
    status: record.status, answer, result: feedback,
  };
}

/** Pure, validated projection shared by current-scene and other-scene reads. */
export function projectTeachingContext(input: unknown, classroom: ReadyClassroom): TeachingContext {
  const parsed = teachingContextTargetSchema.safeParse(input);
  if (!parsed.success) throw new ClassroomError("INVALID_REQUEST", "课程上下文读取目标无效");
  const target = parsed.data;
  if (classroom.stage.id !== target.stageId) throw new ClassroomError("NOT_FOUND", "课堂上下文不属于当前课堂");
  try {
    // Reuse the classroom association/completeness checks; never forward its raw response.
    const data = classroomReadResponseSchema.parse({ success: true, state: "ready", classroom });
    if (data.state !== "ready") throw new Error("Invalid classroom state");
    const saved = data.classroom;
    const entry = saved.directory.find((item) => "sceneId" in target
      ? item.sceneId === target.sceneId : item.outlineId === target.outlineId);
    if (!entry) throw new ClassroomError("NOT_FOUND", "目标场景不存在或不属于本课堂");
    if (!entry.ready) throw new ClassroomError("NOT_READY", "目标场景尚未就绪");
    const scene = saved.scenes.find((item) => item.id === entry.sceneId);
    if (!scene) throw new Error("Ready scene is missing");
    const records = saved.answers.filter((record) => record.sceneId === scene.id);
    records.forEach((record) => validateSavedSubmission(record, saved.scenes, target.stageId));
    const base = { id: scene.id, outlineId: scene.outlineId, title: scene.title, order: scene.order };
    const contextScene: TeachingContext["scene"] = scene.content.type === "slide"
      ? { ...base, type: "slide", elements: scene.content.canvas.elements.map(projectElement),
          speech: scene.actions.flatMap((action) => action.type === "speech" ? [action.text] : []) }
      : { ...base, type: "quiz", questions: scene.content.questions.map((question): TeachingQuestion => {
          const record = records.find((item) => item.questionId === question.id);
          const common = { id: question.id, question: question.question, points: question.points,
            submission: record ? projectSubmission(record) : null };
          return question.type === "short_answer" ? { ...common, type: question.type }
            : { ...common, type: question.type, options: question.options.map(({ value, label }) => ({ value, label })) };
        }) };
    const { requirement, userNickname, userBio } = saved.stage.requirements;
    return teachingContextSchema.parse({
      course: {
        id: saved.stage.id, name: saved.stage.name,
        requirements: { requirement, ...(userNickname?.trim() ? { userNickname } : {}), ...(userBio?.trim() ? { userBio } : {}) },
        languageDirective: saved.languageDirective, hasKnowledgeBase: saved.stage.hasKnowledgeBase,
        outlines: saved.outlines.map(({ id, type, title, description, keyPoints, order }, index) => ({
          id, type, title, description, keyPoints: [...keyPoints], order,
          ready: saved.directory[index].ready, sceneId: saved.directory[index].sceneId,
        })),
      },
      scene: contextScene,
    });
  } catch (error) {
    if (error instanceof ClassroomError) throw error;
    throw new ClassroomError("READ_FAILED", "已保存课程上下文无效，请重新读取");
  }
}

/** Internal read only: no route, writes, LLM calls, embedding or chat execution. */
export async function getTeachingContext(input: unknown): Promise<TeachingContext> {
  const target = teachingContextTargetSchema.safeParse(input);
  if (!target.success) throw new ClassroomError("INVALID_REQUEST", "课程上下文读取目标无效");
  const response = await getClassroom(target.data.stageId);
  if (response.state !== "ready") throw new ClassroomError("NOT_READY", "课堂尚未定稿或首场尚未就绪");
  return projectTeachingContext(target.data, response.classroom);
}
