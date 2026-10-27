import type { ChatSession } from '@/lib/types/chat-session';
import { chatSessionErrorSchema, chatSessionIdSchema, chatSessionListResultSchema,
  chatSessionResultSchema, deleteChatSessionResultSchema } from '@/lib/validators/chat-session';

export class ChatSessionRequestError extends Error {
  constructor(readonly code: string = 'READ_FAILED') { super('Session request could not be confirmed'); }
}
export function parseChatSelection(values: string[]): string | undefined {
  if (!values.length) return undefined;
  if (values.length !== 1) return 'invalid';
  if (values[0] === 'none') return 'none';
  const parsed = chatSessionIdSchema.safeParse(values[0]);
  return parsed.success ? parsed.data : 'invalid';
}
async function request(url: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { ...init, cache: 'no-store', signal });
  let body: unknown;
  try { body = await response.json(); } catch { throw new ChatSessionRequestError(); }
  if (!response.ok) {
    const safe = chatSessionErrorSchema.safeParse(body);
    throw new ChatSessionRequestError(safe.success ? safe.data.code : undefined);
  }
  return body;
}
function sessionResult(body: unknown, key?: { sessionId?: string; stageId?: string }): ChatSession {
  const parsed = chatSessionResultSchema.safeParse(body);
  if (!parsed.success || key?.sessionId && parsed.data.session.id !== key.sessionId
    || key?.stageId && parsed.data.session.stageId !== key.stageId) throw new ChatSessionRequestError();
  return parsed.data.session;
}
export async function readChatSessions(signal?: AbortSignal) {
  const parsed = chatSessionListResultSchema.safeParse(await request('/api/chat-sessions', {}, signal));
  if (!parsed.success || new Set(parsed.data.sessions.map((session) => session.id)).size !== parsed.data.sessions.length) {
    throw new ChatSessionRequestError();
  }
  return parsed.data.sessions;
}
export async function readChatSession(sessionId: string, signal?: AbortSignal) {
  const id = chatSessionIdSchema.parse(sessionId);
  return sessionResult(await request('/api/chat-sessions/' + id, {}, signal), { sessionId: id });
}
export async function createChatSession(stageId: string, signal?: AbortSignal) {
  const id = chatSessionIdSchema.parse(stageId);
  return sessionResult(await request('/api/chat-sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stageId: id }) }, signal), { stageId: id });
}
export async function openChatSession(session: ChatSession, signal?: AbortSignal) {
  return sessionResult(await request('/api/chat-sessions/' + session.id + '/open', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stageId: session.stageId }),
  }, signal), { sessionId: session.id, stageId: session.stageId });
}
export async function deleteChatSession(session: ChatSession, signal?: AbortSignal) {
  const body = await request('/api/chat-sessions/' + session.id + '?' + new URLSearchParams({ stageId: session.stageId }), { method: 'DELETE' }, signal);
  const parsed = deleteChatSessionResultSchema.safeParse(body);
  if (!parsed.success || parsed.data.sessionId !== session.id || parsed.data.stageId !== session.stageId) throw new ChatSessionRequestError();
}
