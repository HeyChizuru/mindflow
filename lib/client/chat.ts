import type { ChatErrorResponse, ChatRequest, ChatTurn, ReadChat } from '@/lib/types/chat';
import { chatErrorResponseSchema, chatReadResultSchema, chatRequestSchema, chatSaveResultSchema, readChatSchema } from '@/lib/validators/chat';

export class ChatRequestError extends Error {
  constructor(readonly payload: ChatErrorResponse | null = null) {
    super('Chat request could not be confirmed');
    this.name = 'ChatRequestError';
  }
}

function belongs(record: ChatTurn, input: ChatRequest | ReadChat) {
  return record.stageId === input.stageId
    && record.sessionId === input.sessionId
    && (!('sceneId' in input) || record.sceneId === input.sceneId)
    && (!('requestId' in input) || !input.requestId || record.requestId === input.requestId)
    && (!('turnId' in input) || !input.turnId || record.id === input.turnId)
    && (!('question' in input) || record.question === input.question);
}

async function body(response: Response, input: ChatRequest | ReadChat): Promise<unknown> {
  let value: unknown;
  try { value = await response.json(); }
  catch { throw new ChatRequestError(); }
  if (!response.ok) {
    const parsed = chatErrorResponseSchema.safeParse(value);
    if (!parsed.success) throw new ChatRequestError();
    if (parsed.data.record && !belongs(parsed.data.record, input)) {
      throw new ChatRequestError(parsed.data.code === 'IDENTITY_CONFLICT'
        ? { ...parsed.data, record: null, turnId: null, questionSaved: null } : null);
    }
    throw new ChatRequestError(parsed.data);
  }
  return value;
}

export async function readChat(input: ReadChat, signal?: AbortSignal): Promise<ChatTurn[]> {
  const request = readChatSchema.parse(input);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(request)) if (value !== undefined) query.set(key, value);
  const response = await fetch('/api/chat?' + query, { cache: 'no-store', signal });
  const parsed = chatReadResultSchema.safeParse(await body(response, request));
  if (!parsed.success || parsed.data.records.some((record) => !belongs(record, request))
    || new Set(parsed.data.records.map((record) => record.id)).size !== parsed.data.records.length
    || new Set(parsed.data.records.map((record) => record.requestId)).size !== parsed.data.records.length
    || (request.turnId || request.requestId) && parsed.data.records.length > 1) throw new ChatRequestError();
  return parsed.data.records;
}

export async function sendChat(input: ChatRequest, headers: HeadersInit, signal?: AbortSignal): Promise<ChatTurn> {
  const request = chatRequestSchema.parse(input);
  const outgoing = new Headers(headers);
  outgoing.set('Content-Type', 'application/json');
  const response = await fetch('/api/chat', { method: 'POST', headers: outgoing, body: JSON.stringify(request), signal });
  const parsed = chatSaveResultSchema.safeParse(await body(response, request));
  if (!parsed.success || !belongs(parsed.data.record, request)) throw new ChatRequestError();
  return parsed.data.record;
}
