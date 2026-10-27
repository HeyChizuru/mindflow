import type { ChatErrorResponse, ChatRequest, ChatTurn, ReadChat } from '@/lib/types/chat';
import { chatErrorResponseSchema, chatReadResultSchema, chatRequestSchema, chatSaveResultSchema, readChatSchema } from '@/lib/validators/chat';
import { chatStreamEventSchema } from '@/lib/validators/chat-stream';
import { chatStreamIdentity, type ChatObserver, type ChatStreamIdentity } from '@/lib/types/chat-stream';

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

async function readStream(response: Response, input: ChatRequest, observe: ChatObserver): Promise<ChatTurn> {
  const reader = response.body?.getReader();
  if (!reader) throw new ChatRequestError();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '', sequence = 0;
  let identity: ChatStreamIdentity | undefined;
  let answered = false;
  const matches = (candidate: ChatStreamIdentity) => identity && Object.entries(identity).every(([key, value]) =>
    candidate[key as keyof ChatStreamIdentity] === value);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) throw new ChatRequestError(); // EOF is never proof of completion.
      buffer += decoder.decode(value, { stream: true });
      let separator = /\r?\n\r?\n/.exec(buffer);
      while (separator) {
        const frame = buffer.slice(0, separator.index);
        buffer = buffer.slice(separator.index + separator[0].length);
        if (frame.length > 262144) throw new ChatRequestError();
        const lines = frame.split(/\r?\n/).filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart());
        if (lines.length) {
          let raw: unknown;
          try { raw = JSON.parse(lines.join('\n')); } catch { throw new ChatRequestError(); }
          const parsed = chatStreamEventSchema.safeParse(raw);
          if (!parsed.success || parsed.data.sequence !== sequence++) throw new ChatRequestError();
          const event = parsed.data;
          if (event.type === 'error') {
            if (event.error.record && !belongs(event.error.record, input)) throw new ChatRequestError();
            throw new ChatRequestError(event.error);
          }
          if ('record' in event) {
            if (!belongs(event.record, input)) throw new ChatRequestError();
            if (event.type === 'done') {
              if (identity && !matches(chatStreamIdentity(event.record))) throw new ChatRequestError();
              return event.record;
            }
            if (identity) throw new ChatRequestError();
            if (event.type === 'start') identity = chatStreamIdentity(event.record);
          } else {
            if (!matches(event.identity)) throw new ChatRequestError();
            if (event.type === 'delta' && answered) throw new ChatRequestError();
            if (event.type === 'answer') {
              if (answered) throw new ChatRequestError();
              answered = true;
            }
          }
          observe(event);
        }
        separator = /\r?\n\r?\n/.exec(buffer);
      }
      if (buffer.length > 262144) throw new ChatRequestError();
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function sendChat(input: ChatRequest, headers: HeadersInit, signal?: AbortSignal, observe?: ChatObserver): Promise<ChatTurn> {
  const request = chatRequestSchema.parse(input);
  const outgoing = new Headers(headers);
  outgoing.set('Content-Type', 'application/json');
  if (observe) outgoing.set('Accept', 'text/event-stream');
  const response = await fetch('/api/chat', { method: 'POST', headers: outgoing, body: JSON.stringify(request), signal });
  if (response.ok && response.headers.get('content-type')?.split(';')[0] === 'text/event-stream') {
    if (!observe) throw new ChatRequestError();
    return readStream(response, request, observe);
  }
  const parsed = chatSaveResultSchema.safeParse(await body(response, request));
  if (!parsed.success || !belongs(parsed.data.record, request)) throw new ChatRequestError();
  return parsed.data.record;
}
