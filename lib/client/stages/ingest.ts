import { connectionTestHeaders, modelSettingsSnapshot } from '@/lib/client/llm/settings';
import { MODEL_ERRORS } from '@/lib/client/llm/errors';
import { ingestResponseSchema } from '@/lib/validators/knowledge';
import { z } from 'zod';

const stateSchema = z.object({ status: z.enum(['idle', 'processing', 'unknown', 'failed', 'ready']) });
const errors: Record<string, string> = {
  ...MODEL_ERRORS,
  'no document for this stage': '找不到这节课的 PDF 资料',
  'pdf file is missing': 'PDF 原件不存在，请返回首页重新创建课堂',
  'parsed text must be at least 200 characters': 'PDF 可提取的文本不足 200 字，无法入库',
};
const fallback = '资料处理失败，请检查 PDF 和向量模型设置后重试';

export async function readIngestState(stageId: string, signal: AbortSignal) {
  const response = await fetch(`/api/stages/${encodeURIComponent(stageId)}/ingest`, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('无法确认资料处理状态，请稍后重试');
  const parsed = stateSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('无法确认资料处理状态，请稍后重试');
  return parsed.data.status;
}

export async function startIngest(stageId: string, signal: AbortSignal) {
  const settings = modelSettingsSnapshot();
  let response: Response;
  try {
    response = await fetch(`/api/stages/${encodeURIComponent(stageId)}/ingest`, {
      method: 'POST', headers: { ...connectionTestHeaders('embedding', settings.embedding), 'x-mindflow-ingest-mode': 'if-unready' }, signal,
    });
  } catch {
    throw new Error('资料处理请求中断，请核对状态后重试');
  }
  const body: unknown = await response.json();
  if (response.status === 409) return;
  if (!response.ok) {
    const parsed = z.object({ error: z.string() }).safeParse(body);
    const raw = parsed.success ? parsed.data.error : '';
    const message = errors[raw] ?? (raw.startsWith('embedding must have 1024 dimensions')
      ? '向量模型返回的维度不是 1024，请检查设置' : fallback);
    throw new Error(message);
  }
  if (!ingestResponseSchema.safeParse(body).success) throw new Error('无法确认资料处理结果，请重新核对');
}
