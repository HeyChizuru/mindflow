import type { SceneOutline } from "@/lib/types/outline";
import type { Scene } from "@/lib/types/scene";
import type { StageResponse } from "@/lib/types/stage";

export const QUIZ_SUBMISSION_STATUSES = ["pending", "processing", "failed", "completed"] as const;
export type QuizSubmissionStatus = typeof QUIZ_SUBMISSION_STATUSES[number];

export const QUIZ_FAILURE_CODES = [
  "MODEL_CONFIG_REQUIRED", "MODEL_CALL_FAILED", "INVALID_MODEL_RESULT", "GRADING_TIMEOUT", "RESULT_SAVE_FAILED",
] as const;
export type QuizFailureCode = typeof QUIZ_FAILURE_CODES[number];

/** Answers carry input only, never the saved question or its grading standard. */
export type QuizAnswer =
  | { type: "single"; value: string }
  | { type: "multiple"; values: string[] }
  | { type: "short_answer"; text: string };

export type QuizGradeResult = {
  earned: number;
  points: number;
  analysis: string;
} & (
  | { type: "single" | "multiple"; correct: boolean; correctAnswer: string[] }
  | { type: "short_answer"; comment: string }
);

export type QuizQuestionKey = { stageId: string; sceneId: string; questionId: string };
export type QuizSubmissionKey = QuizQuestionKey & { submissionId: string };
export type QuizExecutionKey = QuizSubmissionKey & { executionId: string };

/** A single current record per scene/question. Execution metadata survives process restarts. */
export type QuizSubmission = QuizSubmissionKey & {
  version: number;
  answer: QuizAnswer;
  status: QuizSubmissionStatus;
  result: QuizGradeResult | null;
  failureCode: QuizFailureCode | null;
  gradingRequestId: string | null;
  executionId: string | null;
  gradingStartedAt: string | null;
  gradingExpiresAt: string | null;
  gradedAt: string | null;
  /** Computed using database time; reading it does not change the saved state. */
  executionExpired: boolean;
  createdAt: string;
  updatedAt: string;
};

/** A submit requestId also identifies the new submission. Null version means no prior record. */
export type QuizGradeBody = QuizQuestionKey & (
  | { operation: "submit"; requestId: string; expectedVersion: number | null; answer: QuizAnswer }
  | { operation: "retry"; requestId: string; submissionId: string; expectedExecutionId: string | null }
);

export type QuizGradeResponse = { success: true; record: QuizSubmission };

export type ClassroomDirectoryEntry = {
  outlineId: string;
  type: "slide" | "quiz";
  title: string;
  order: number;
  ready: boolean;
  sceneId: string | null;
};

export type ClassroomPlaybackPosition = {
  savedSceneId: string | null;
  sceneId: string;
  fallbackReason: "saved_scene_unavailable" | null;
};

export type ClassroomReadResponse = { success: true } & (
  | { state: "draft"; stage: StageResponse; generationUrl: string }
  | {
      state: "first_scene_pending";
      stage: StageResponse;
      outlines: SceneOutline[];
      directory: ClassroomDirectoryEntry[];
      generationUrl: string;
    }
  | {
      state: "ready";
      classroom: {
        stage: StageResponse;
        outlines: SceneOutline[];
        languageDirective: string | null;
        directory: ClassroomDirectoryEntry[];
        scenes: Scene[];
        playback: ClassroomPlaybackPosition;
        answers: QuizSubmission[];
        allScenesReady: boolean;
      };
    }
);

export type SavePlaybackPositionBody = { sceneId: string };
export type SavePlaybackPositionResponse = { success: true; stageId: string; sceneId: string };

export const CLASSROOM_ERROR_CODES = [
  "INVALID_REQUEST", "MODEL_CONFIG_REQUIRED", "NOT_FOUND", "NOT_READY", "CONFLICT",
  "GRADING_IN_PROGRESS", "GRADING_FAILED", "GRADING_TIMEOUT", "READ_FAILED", "SAVE_FAILED",
] as const;
export type ClassroomErrorCode = typeof CLASSROOM_ERROR_CODES[number];

export type ClassroomErrorResponse = {
  success: false;
  code: ClassroomErrorCode;
  error: string;
  /** Whether this request's submission was saved. Null means the persistence outcome is unknown. */
  answerSaved: boolean | null;
  /** Identifies this request's submission when known. */
  submissionId: string | null;
  /** Latest saved record for recovery; on conflict it may belong to the winning request. */
  record: QuizSubmission | null;
};
