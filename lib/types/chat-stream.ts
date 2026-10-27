import type { ChatErrorResponse, ChatTeacherId, ChatTurn } from './chat';

export const CHAT_PHASES = ['preparing', 'routing', 'answering', 'reading_scene', 'searching_pdf', 'reviewing', 'validating', 'saving'] as const;
export type ChatPhase = typeof CHAT_PHASES[number];
export type ChatStreamIdentity = Pick<ChatTurn, 'stageId' | 'sessionId' | 'sceneId' | 'requestId' | 'executionId'> & { turnId: string };
export type ChatStreamUpdate =
  | { type: 'record'; record: ChatTurn }
  | { type: 'start'; record: ChatTurn }
  | { type: 'progress'; identity: ChatStreamIdentity; phase: ChatPhase; teacherId: ChatTeacherId | null }
  | { type: 'delta'; identity: ChatStreamIdentity; text: string }
  | { type: 'answer'; identity: ChatStreamIdentity; reply: string; teacherId: ChatTeacherId };
export type ChatStreamPayload = ChatStreamUpdate
  | { type: 'done'; record: ChatTurn }
  | { type: 'error'; error: ChatErrorResponse };
export type ChatStreamEvent = ChatStreamPayload & { sequence: number };
export type ChatObserver = (event: ChatStreamUpdate) => void;

export function chatStreamIdentity(record: ChatTurn): ChatStreamIdentity {
  return { stageId: record.stageId, sessionId: record.sessionId, sceneId: record.sceneId,
    requestId: record.requestId, turnId: record.id, executionId: record.executionId };
}
