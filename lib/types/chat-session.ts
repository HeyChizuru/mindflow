export type ChatSession = {
  id: string;
  stageId: string;
  stageName: string;
  isHistory: boolean;
  preview: string | null;
  createdAt: string;
  lastUsedAt: string;
};
export const CHAT_SESSION_ERROR_CODES = ["INVALID_REQUEST", "NOT_FOUND", "NOT_READY", "READ_FAILED", "SAVE_UNKNOWN"] as const;
export type ChatSessionErrorCode = typeof CHAT_SESSION_ERROR_CODES[number];
export type ChatSessionErrorResponse = { success: false; code: ChatSessionErrorCode; error: string };
