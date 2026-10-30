import { z } from 'zod';
import { historyItemSchema, historyPageSchema, renameStageSchema, stageDeletionSchema } from '@/lib/validators/stage-history';

export class HistoryRequestError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = 'HistoryRequestError'; }
}

async function request<T>(url: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  let response: Response;
  let body: unknown;
  try {
    response = await fetch(url, { ...init, cache: 'no-store' });
    body = await response.json();
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new HistoryRequestError('连接中断或响应无效，请重新核对结果');
  }
  if (!response.ok) {
    const error = z.object({ error: z.string().max(200) }).safeParse(body);
    throw new HistoryRequestError(error.success && !/[\r\n]/.test(error.data.error) ? error.data.error : '操作失败，请重试', response.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new HistoryRequestError('服务返回异常，请重新核对结果');
  return parsed.data;
}

export function listStageHistory(query: string, cursor?: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ query });
  if (cursor) params.set('cursor', cursor);
  return request(`/api/stages?${params}`, historyPageSchema, { signal });
}

export async function readHistoryItem(id: string, signal?: AbortSignal) {
  const item = await request(`/api/stages/${encodeURIComponent(id)}/history`, historyItemSchema, { signal });
  if (item.id !== id) throw new HistoryRequestError('课堂身份不一致，请重新读取');
  return item;
}

export async function renameHistoryItem(id: string, name: string) {
  const body = renameStageSchema.parse({ name });
  const result = await request(`/api/stages/${encodeURIComponent(id)}`, z.object({ id: z.uuid(), name: z.string() }), {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (result.id !== id || result.name !== body.name) throw new HistoryRequestError('保存结果不一致，请重新核对');
  return result;
}

export async function deleteHistoryItem(id: string) {
  const result = await request(`/api/stages/${encodeURIComponent(id)}`, stageDeletionSchema, { method: 'DELETE' });
  if (result.id !== id) throw new HistoryRequestError('删除结果不一致，请重新核对');
  return result;
}
