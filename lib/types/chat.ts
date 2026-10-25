import type { z } from "zod";
import type {
  chatTurnSchema, chatSourceSchema, submitChatSchema, readChatSchema,
  chatTurnKeySchema, chatExecutionKeySchema, retryChatSchema, completeChatSchema, failChatSchema,
} from "@/lib/validators/chat";

export const CHAT_TEACHERS = {
  explainer: "讲解老师",
  reasoning_coach: "思考教练",
  application_coach: "应用教练",
} as const;
export const CHAT_TEACHER_IDS = ["explainer", "reasoning_coach", "application_coach"] as const;
export const CHAT_FAILURE_CODES = ["EXECUTION_FAILED", "MODEL_FAILED", "TOOL_FAILED", "REPLY_INVALID"] as const;
/** Independent of quiz execution and any HTTP runtime limit. */
export const CHAT_EXECUTION_TTL_MS = 180_000;

export type ChatTurn = z.infer<typeof chatTurnSchema>;
export type ChatSource = z.infer<typeof chatSourceSchema>;
export type SubmitChat = z.infer<typeof submitChatSchema>;
export type ReadChat = z.infer<typeof readChatSchema>;
export type ChatTurnKey = z.infer<typeof chatTurnKeySchema>;
export type ChatExecutionKey = z.infer<typeof chatExecutionKeySchema>;
export type RetryChat = z.infer<typeof retryChatSchema>;
export type CompleteChat = z.infer<typeof completeChatSchema>;
export type FailChat = z.infer<typeof failChatSchema>;
export type ChatClaimResult = { record: ChatTurn; ownsExecution: boolean };
export type ChatSaveResult = { success: true; questionSaved: true; record: ChatTurn };
export type ChatReadResult = { success: true; records: ChatTurn[] };
export type ChatErrorCode = "INVALID_REQUEST" | "NOT_FOUND" | "NOT_READY" | "IDENTITY_CONFLICT"
  | "EXECUTION_ACTIVE" | "EXECUTION_CONFLICT" | "INVALID_SOURCE" | "READ_FAILED" | "NOT_SAVED" | "SAVE_UNKNOWN";
export type ChatErrorDetails = {
  questionSaved: boolean | null;
  turnId: string | null;
  record: ChatTurn | null;
};
export type ChatErrorResponse = ChatErrorDetails & { success: false; code: ChatErrorCode; error: string };
