export const CHAT_TEACHERS = {
  explainer: "讲解老师",
  reasoning_coach: "思考教练",
  application_coach: "应用教练",
} as const;
export const CHAT_TEACHER_IDS = ["explainer", "reasoning_coach", "application_coach"] as const;
export const CHAT_FAILURE_CODES = ["EXECUTION_FAILED", "MODEL_FAILED", "TOOL_FAILED", "REPLY_INVALID"] as const;
/** Independent of quiz execution and any HTTP runtime limit. */
export const CHAT_EXECUTION_TTL_MS = 180_000;

export type ChatTeacherId = typeof CHAT_TEACHER_IDS[number];
export type ChatFailureCode = typeof CHAT_FAILURE_CODES[number];
export type ChatSource = { chunkId: string; documentId: string; filename: string; page: number | null; excerpt: string };
export type SubmitChat = { stageId: string; sessionId: string; sceneId: string; requestId: string; question: string };
export type ReadChat = { stageId: string; sessionId: string; turnId?: string; requestId?: string };
export type ChatTurnKey = { stageId: string; sessionId: string; turnId: string; sceneId: string };
export type ChatExecutionKey = ChatTurnKey & { executionId: string };
export type RetryChat = ChatTurnKey & { expectedExecutionId: string };
export type CompleteChat = ChatExecutionKey & { reply: string; teacherId: ChatTeacherId; chunkIds: string[] };
export type FailChat = ChatExecutionKey & { failureCode: ChatFailureCode };
export type ChatRequest = SubmitChat | (RetryChat & { action: "retry" });
export type ChatTurn = SubmitChat & {
  id: string; status: "pending" | "processing" | "failed" | "completed";
  reply: string | null; teacherId: ChatTeacherId | null; sources: ChatSource[] | null;
  failureCode: ChatFailureCode | null; executionId: string | null;
  executionStartedAt: string | null; executionExpiresAt: string | null; executionExpired: boolean;
  completedAt: string | null; createdAt: string; updatedAt: string;
};
export type ChatClaimResult = { record: ChatTurn; ownsExecution: boolean };
export type ChatSaveResult = { success: true; questionSaved: true; record: ChatTurn };
export type ChatReadResult = { success: true; records: ChatTurn[] };
export const CHAT_ERROR_CODES = ["INVALID_REQUEST", "NOT_FOUND", "SESSION_UNAVAILABLE", "NOT_READY", "IDENTITY_CONFLICT",
  "EXECUTION_ACTIVE", "EXECUTION_CONFLICT", "INVALID_SOURCE", "READ_FAILED", "NOT_SAVED", "SAVE_UNKNOWN",
  "MODEL_CONFIG_MISSING", "MODEL_FAILED", "MODEL_UNSUPPORTED", "TOOL_CONFIG_MISSING", "TOOL_FAILED",
  "LIMIT_EXCEEDED", "REPLY_INVALID", "CANCELLED", "CONTEXT_FAILED"] as const;
export type ChatErrorCode = typeof CHAT_ERROR_CODES[number];
export type ChatErrorDetails = {
  questionSaved: boolean | null;
  turnId: string | null;
  record: ChatTurn | null;
};
export type ChatErrorResponse = ChatErrorDetails & { success: false; code: ChatErrorCode; error: string };
